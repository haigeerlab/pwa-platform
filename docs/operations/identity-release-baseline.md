# 身份发布基线规则

PWA 身份在生产注册后不可变更。本文规定如何保存、比较和迁移身份，依据为 [ADR-0004](../adr/0004-identity-is-immutable-after-production-registration.md)、[ADR-0008](../adr/0008-cache-namespace-and-identity-baseline.md) 和 [ADR-0009](../adr/0009-identity-migration-bumps-cache-namespace-seed.md)。

## 基线是什么

- **每个部署槽位一份发布基线。** 部署槽位是在应用配置中登记的稳定名称，代表"某个环境中的某个已安装应用"。它不是 `PwaIdentity` 的字段，身份迁移时保持不变，因此无论哪个身份字段发生变化，都能找到原来的基线。
- **基线内容。** 基线是该槽位上一次生产发布实际使用的 `PwaIdentity`，保存为 JSON，并且能通过 contracts 的 `validateIdentity`。
- **存放位置。** 基线按槽位名存放，与应用的身份配置放在同一个仓库中受版本控制（ADR-0008）。具体路径为 `<基线目录>/<槽位名>.json`：目录由宿主适配器配置，槽位名为 kebab-case（`^[a-z0-9]+(-[a-z0-9]+)*$`），与 module id 同一形态。`@pwa-platform/build-verifier` 的 `readIdentityBaseline` 按此约定读取（[ADR-0014](../adr/0014-build-verification-boundary-and-report.md)）。
- **更新时机。** 只有生产发布成功后才更新基线，尚未发布的变更不得写入。
- **环境相互独立。** 一个槽位只对应一个环境。不同环境使用不同的槽位，各自有独立的基线，彼此不做比较，也不共用缓存命名空间。
- **槽位不改名、不复用。** 槽位名登记后不再修改；应用下线后，它的槽位名也不再分配给其他应用。

## 首次生产发布

某个槽位还没有基线时，发布前必须先完成身份评审（ADR-0004），逐项确认：

- 这是新登记的槽位，而不是已有槽位改了名；
- 候选身份的 `origin` 与 `scope` 组合，以及 `serviceWorkerUrl`，都没有出现在任何已有基线中。出现重叠说明这是对已安装应用的变更，必须回到原槽位，按身份迁移处理；
- `scope` 已取最小可用路径；
- `serviceWorkerUrl` 和 `manifestUrl` 位于 scope 内；
- `mountPath` 与应用路由一致；
- `origin` 是正式的生产 origin；
- `cacheNamespaceSeed` 已设定初始值并登记。

评审由平台负责人批准。外部发布系统必须显式传入基线查找结果，使 `verifyRelease` 产生
`verify.baseline-missing`，并把该报告、覆盖结果与批准引用写入发布记录；不得通过省略
`baseline` 属性把首次发布伪装成“未做比较”。首次生产发布成功后，才把该身份写为该槽位的
基线，顺序见[发布编排协议](release-orchestration-protocol.md#首次发布与身份迁移)。

## 比较规则

候选身份是本次发布将要使用的身份。它必须先通过 `validateIdentity`，然后与同一槽位的基线逐字段比较：

| 字段 | 规则 |
|---|---|
| `appId`、`origin`、`scope`、`serviceWorkerUrl`、`manifestId`、`manifestUrl`、`mountPath`、`cacheNamespaceSeed` | 必须逐字相等。这 8 个字段是 ADR-0008 规定的生产不可变字段 |
| `environment` | 必须逐字相等。在同一槽位内修改环境名（例如从 `prod` 改为 `production`），同样是身份迁移 |

- **不做任何归一化。** 比较按字符串逐字进行，大小写、结尾的 `/`、百分号编码的写法差异，都视为变更。
- **门禁失败条件。** 任一字段与基线不同，而本次发布又没有对应的已批准迁移记录时，发布门禁失败。
- **找不到基线时。** 只有完成了上一节的首次生产发布评审，才能按首次发布处理；否则发布门禁失败。

## 身份迁移

变更任一不可变字段，或在同一槽位内变更 `environment`，都属于身份迁移（ADR-0004、ADR-0009），必须满足以下四点：

1. 以有名称的迁移提出，并在发布前获得批准；
2. 把 `cacheNamespaceSeed` 提升为该应用在该环境中从未使用过的新值，不得复用旧值；
3. 附带下表规定的迁移记录；
4. 迁移发布成功后，把新身份写为该槽位的基线。

迁移记录必须包含：

| 字段 | 内容 |
|---|---|
| 名称 | 唯一、可引用的迁移名称 |
| 槽位与环境 | 受影响的槽位，以及迁移前后的环境 |
| 原因 | 为什么必须变更身份，以及为什么不能通过普通策略修改达成 |
| 旧身份 / 新身份 | 两份完整的 `PwaIdentity`，并列出发生变化的字段 |
| 种子提升 | 旧的 `cacheNamespaceSeed` 与新值 |
| 影响 | 已安装用户会受到什么影响：旧 worker 注册、旧 scope、旧缓存命名空间 |
| 清理步骤 | 如何注销旧 worker、清理旧 revision 的缓存。旧缓存位于旧的应用前缀 `pwa:<旧 appId>:<旧 environment>:` 之下；若 `appId` 和环境都没变，就是当前的 `appCachePrefix` |
| 回滚步骤 | 迁移失败时如何恢复到旧身份，以及已清理的数据会受到什么影响 |
| 发布顺序 | 迁移与恢复 worker、响应头、CDN 变更之间的先后顺序 |
| 审批人 | 由平台负责人批准。涉及产品体验、响应头或部署的部分，按 [职责与 RACI](../product/ownership-and-raci.md) 由产品团队或基础设施团队会签 |

## 工具执行

自 `@pwa-platform/build-verifier` 交付起，本节的比较由工具执行（[ADR-0014](../adr/0014-build-verification-boundary-and-report.md)）：

- `readIdentityBaseline({ directory, slot })` 按上文的路径约定读取基线；
- `compareIdentityBaseline(candidate, baseline)` 逐字比较上表的九个字段，不做任何归一化，每处差异产出一条 `verify.baseline-mismatch` 诊断，`path` 指向该字段；
- 基线不是合法身份时产出 `verify.baseline-invalid`；查不到基线时产出 `verify.baseline-missing`。

**工具不判断"是否首次发布"。** 查不到基线只是一个事实：它究竟意味着该槽位的首次生产发布，还是门禁失败，仍按上文"首次生产发布"一节由平台负责人评审决定，并把结论、原始报告、覆盖结果与批准引用一并写入本次发布记录；如有差异，附上已批准的迁移记录链接。报告的事实不因批准而被改写，且只有生产成功后才能更新基线。

## 相关文档

- [发布与事故处置手册](release-and-incident-runbook.md)
- [contracts 规格：缓存命名空间](../../spec/contracts-foundation.md)
