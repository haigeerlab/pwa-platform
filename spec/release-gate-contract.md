# 规格：release-gate-contract

## 目标

让发布方能够机械地证明 `verifyRelease` 实际执行了本次所需的检查，杜绝把部分检查或空报告的 `ok: true` 当作可发布结论。它只处理报告完整性；每项事实的校验仍由现有 build-verifier 函数完成。

## 范围

本模块在 `packages/build-verifier` 中新增一个零依赖、纯函数的公开入口。公开契约为：

```ts
type PwaReleaseGateCoverage = {
  readonly ok: boolean;
  readonly missing: readonly PwaVerificationCheckName[];
};

function verifyReleaseGateCoverage(
  report: PwaVerificationReport,
  required: readonly PwaVerificationCheckName[],
): PwaReleaseGateCoverage;
```

- `required` 使用既有检查名，重复或未知名称是调用错误，抛出不回显宿主数据的 `TypeError`。
- 输出只回答每个必需检查是否在 `report.checks` 中出现；`ok` 不替代 `report.ok`，也不判断手工证据。
- 独立源应用的通常机器必需集为 `artifacts`、`response-headers`、`identity-baseline`、`release-retention`、`html-headers`（[ADR-0032](../docs/adr/0032-html-response-header-check.md)）；共享源子应用额外包含 `release-order`。选择集合属于外部发布协议，而非包内环境推断。

**不做：** 网络采集、文件写入、部署、基线更新、首次发布判断、CI 或浏览器证据判定，以及改变 `verifyRelease` 现有的可选输入语义。

## 命令

```text
pnpm --filter @pwa-platform/build-verifier test
pnpm --filter @pwa-platform/build-verifier typecheck
pnpm lint
```

## 测试策略

- 全覆盖、遗漏一个、遗漏多个、报告有额外检查、空报告与空必需集。
- 同一必需检查重复、未知检查名和伪造报告条目均为失败或调用错误，语义在测试中钉住。
- 与真实 `verifyRelease` 报告组合，证明覆盖通过但检查失败时，调用方仍必须同时判断 `report.ok`。
- 公开导出、声明快照、导入边界及全工作区门禁保持通过。

## 边界

- **始终**：保持纯函数、固定输出顺序、只复用既有检查名；把外部数据验证留在发布编排边界。
- **先询问**：新增诊断码、改变 `verifyRelease` 输入形态、加入依赖或将检查要求推断为环境默认。
- **禁止**：访问网络、读取或写入发布记录、把覆盖完整等同于发布通过。

## 验收标准

1. 调用方可区分“已执行且失败”和“根本没有执行”的必需检查。
2. 空报告无法满足非空必需集；报告额外检查不影响已声明的必需集。
3. 现有 build-verifier 的公开语义、零网络和零写入边界不变。

## 已决定事项（项目所有者，2026-09-19）

- 覆盖缺失保持为独立、类型化的纯函数结果，不追加 contracts 的 `verify.*` 诊断码。这样宿主调用错误与部署事实诊断保持分离，决定见 [ADR-0025](../docs/adr/0025-release-gate-completeness-and-external-orchestration.md)。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。
