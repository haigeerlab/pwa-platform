# ADR-0024：发布保留窗口由 build-verifier 校验

## 状态

已接受（2026-09-19）。本决定在不改变[缓存保留](../operations/release-and-incident-runbook.md#缓存保留)规则的前提下，扩展 [ADR-0014](0014-build-verification-boundary-and-report.md) 的验证范围；项目所有者已明确接受。

## 背景

缓存保留规则要求：当前发布为 R 时，R、R-1、R-2 的带指纹资源必须可用；更早资源只能在其下一次发布满七天后删除。这个规则保护已安装的旧 worker、回滚恢复 worker 和尚未更新的 HTML 对旧指纹文件的请求。

`@pwa-platform/vite` 的单次构建只看得到当前 `PwaPlan` 和本次输出，既没有已部署资产清单，也没有历史发布的时间与计划。因此在 Vite 构建中把这项检查做成自动通过，不能证明生产环境仍保留历史资源。反过来，让 build-verifier 自己请求 CDN 又会违反 ADR-0014 的零网络边界，并使离线 CI 不可重复。

## 决策

- **新增可选的 `release-retention` 检查。** `verifyRelease` 仅在调用方显式提供 `retention` 属性时运行；属性省略表示没有执行此检查，报告不得把它误称为已验证。检查追加在既有 `artifacts`、`response-headers`、`identity-baseline` 与 `release-order` 之后，报告顺序保持固定。
- **调用方提供事实，验证器保持纯函数。** 输入包含评估时刻 `asOfMs`、按新到旧排列的上一版发布快照，以及当前部署可提供的绝对资源路径。快照记录 `releasedAtMs` 与尚未信任的历史计划。函数不请求网络、不读盘、不删除资源，也不在包内维护发布历史。
- **历史必须来自发布系统的完整单一发布线。** 每个历史计划都先经 `validatePlan` 验证；`appId`、`origin`、`environment` 必须与候选计划一致；时间戳必须是有限、非负的整数，且严格按新到旧递减、不晚于 `asOfMs`。不符合这些前提时报告 `verify.retention-history-invalid`，而非静默跳过某条记录。发布系统负责提供完整记录；验证器无法从一个被截断的数组推断较早发布是否存在。
- **只核对带指纹预缓存条目。** 带指纹的判据沿用现有发布基线：`precache[].revision === null`。worker、manifest、HTML 与未带指纹的条目不属于本检查，仍由现有产物、响应头和人工门禁覆盖。
- **按运行手册的两个窗口取并集。** 候选计划、最近两份历史计划中的带指纹条目无条件要求存在；其余历史计划中的条目，若其直接后继发布的 `releasedAtMs + 7 * 24 * 60 * 60 * 1000` 尚未到达 `asOfMs`，也要求存在。重复路径只报告一次缺失。缺失报告 `verify.retention-missing`，诊断路径只指向候选或历史计划中的预缓存数组位置，消息不得回显路径或历史值。
- **调用方输入形态错误仍是调用错误。** 当前可用路径不是绝对路径时抛出 `TypeError`，与 `verifyArtifacts` 对 `published` 的处理一致；不能把宿主输入错误伪装成“所有历史资源都丢失”。

建议的公开形态如下：

```ts
type PwaReleaseRetentionSnapshot = {
  readonly releasedAtMs: number;
  readonly plan: unknown;
};

type PwaReleaseRetentionInput = {
  readonly asOfMs: number;
  /** 新到旧；记录候选计划之前的全部发布。 */
  readonly previous: readonly PwaReleaseRetentionSnapshot[];
  /** 当前部署在评估时刻可提供的绝对资源路径。 */
  readonly available: readonly string[];
};

function verifyReleaseRetention(
  plan: PwaPlan,
  input: PwaReleaseRetentionInput,
): PwaVerificationCheck;
```

## 备选方案

- **在 Vite 产物断言中自动检查。** 不采用。单次构建没有上一版计划、发布时间和线上可用资源；它只能验证本次输出，不能证明保留窗口。
- **build-verifier 直接请求 CDN 或对象存储。** 不采用。会引入凭据、网络不确定性和非确定性，违反 ADR-0014 的边界。部署编排器可以采集清单后传入纯函数。
- **只保留最近三次发布。** 不采用。它漏掉旧版本被下一次替代后尚未满七天的窗口。
- **只保留七天。** 不采用。高频发布以外的旧客户端可能仍请求 R-2 的资源，违反运行手册明确的前两次发布兼容窗口。

## 影响

- 发布系统或部署编排器必须保存每个应用、环境、origin 的完整计划与发布时间，并在门禁中采集当前可提供的资源路径；这是运行手册既有规则的可验证事实来源，不是 build-verifier 新建的状态。
- `@pwa-platform/vite` 不在生产构建路径自动调用本检查；实现阶段会用真实 Vite 生成的 `PwaPlan` 做跨包集成测试，证明计划形态可被消费。
- contracts 追加两个 `verify.*` 诊断码，是公开契约变更；声明快照与既有诊断码完整性测试必须同步更新。
- 该检查只给出当前发布记录和可用路径所能证明的结论；它不能替代发布流程保存历史记录，也不能自行清理过期资产。
