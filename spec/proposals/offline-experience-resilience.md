# Proposal: 弱网下的导航兜底与离线恢复体验
<!-- spec-guard-proposal:v2 id=offline-experience-resilience revision=sha256:0000000000000000000000000000000000000000000000000000000000000000 -->

## Summary

将弱网导航与离线恢复体验作为独立优化迭代。现有 `network-timeout` 解决了导航长时间等待，但没有解决短暂失败立即兜底、慢响应被描述为断网，以及恢复探测成功后反复重载的问题。2026-10-05 使用 PC 宿主当前部署的原样 worker 和离线页，在真实 Chrome 的本地受控服务中复现了这些边界，见 [实测记录](../../docs/review/2026-10-05/offline-experience-boundaries.md)。

项目所有者于 2026-10-05 确认下述三项产品目标，并要求继续形成规格与计划；见 [模块规格](../offline-experience-resilience.md) 和 [实施计划](../../tasks/offline-experience-resilience/plan.md)。推荐技术方案已记录在 [ADR-0052](../../docs/adr/0052-offline-experience-resilience.md)，技术契约已由 ADR-0052 冻结。本文件仍是本地 Proposal 草案：revision 的全零值为模板占位，未绑定远端默认分支基线，未发布 Proposal，远端 Proposal 流程未执行。项目所有者另行确认了本地 module-insert 预览，已将模块追加能力图末尾并激活；这不构成远端 Proposal 发布或晋级证明。

### 产品目标

1. 短暂连接失败不立即用整页离线提示打断导航：对适用的文档读取提供有界重试或宽限。
2. 文档响应慢时提供准确的“暂时无法连接／响应较慢”反馈和可操作出口，不把超时直接断言为设备离线。
3. 自动恢复应接近原业务入口的可用性；持续失败时不循环重载，手动重试始终可用。

“有网络时永不进入兜底”不能作为技术承诺：设备连接状态不等于源站或文档可达。验收应以明确的故障窗口、响应时延、等待上限和重载次数证明体验。

### 设计方向（产品目标已确认，技术契约在 OE1 冻结）

- 导航重试只针对适用的同源文档 GET，不扩展到业务 API、写请求、媒体或未分类请求。重试次数和总时间必须有上限，并避免并发重复请求；具体取值由正式 Spec 的故障窗口与等待预算决定。
- 区分请求失败、等待超时与确认可达的网络响应。返回 4xx/5xx 不应被自动归类为设备断网；已打开的业务页不因单个 API 或图片失败被整页替换。
- 保留长等待出口和无可用兜底时不制造新错误的原则；仅提高阈值不能消除恢复循环，不能作为完整修复。
- 默认提示应适用于“暂时无法连接”，保持无脚本时可读及手动重试入口；如提供不同失败原因的提示，原因传播必须明确设计，不暗中改变缓存内容或请求地址。
- 自动恢复不再以 worker 文件一次 HEAD 成功作为业务可用的充分条件。评估验证原导航入口或宿主显式指定的同源可用性入口；不可把通用健康检查成功当成所有业务都恢复。
- 控制探测并发、成功判定、冷却、退避和自动重载预算。预算必须能覆盖页面重载后的生命周期，不能每次进入离线页就无条件归零。达到失败预算后停下自动重载，保留手动恢复。
- 隐藏页面、online 事件、多次点击重试、连续恢复失败及恢复后再次断连均纳入验收。`navigator.onLine` 仅作辅助信号。
- 明确与旧 `networkTimeoutSeconds` 语义的兼容方式。导航语义变更须记录 ADR，并增补 ADR-0038；默认离线页行为变更须增补 ADR-0036。正式 Spec 再决定哪些属于安全默认修正、哪些需要显式选项，不直接静默扩大公开契约。

### 包与接入交付

| 位置 | 预期职责 |
| --- | --- |
| `packages/sw-runtime/src/worker/handlers.ts` / `@pwa-platform/sw-runtime` | 导航失败、超时、有限重试与兜底原因的处理。 |
| `packages/vite/src/offline-page.ts` / `@pwa-platform/vite` | 默认离线页提示、业务可用性探测、自动恢复预算及生成脚本的 CSP 信息。 |
| contracts / core / client-runtime | 仅在评审确认需要新增公开策略、计划字段或页面协议时调整，并补齐契约验证。 |
| 浏览器 harness 与现有包测试 | 形成可重复的延迟、连接失败和重载计数夹具，验证新行为及旧行为兼容性。 |
| NPM 分发与宿主接入说明 | 按受影响依赖闭包形成候选版本，验证安装后的产物。业务项目升级、重新构建、部署，并验证既有 worker 更新后行为。 |

不新建运行时 NPM 包，不先假定版本号。发布受影响的现有包；具体依赖闭包和发布版本在实现与候选分发验收后确定。

### 验收意图

| 场景 | 新迭代必须证明的结果 |
| --- | --- |
| 文档在正常等待预算内返回 | 正常显示网络文档，不使用离线页。 |
| 连接失败窗口小于经评审的宽限，随后恢复 | 在预算内重试成功，不立即展示整页离线提示。 |
| 慢文档、设备仍连通 | 在约定等待预算内获得文档；超过预算时提供准确提示，不宣称设备必然离线。 |
| 真正断网且已有兜底 | 在约定上限内展示完整提示与手动重试，不无限等待。 |
| worker 可访问，原业务文档持续不可用 | 自动重载次数受限，不出现约每 10 秒循环重载。 |
| 探测慢、超时、HTTP 错误或不合要求的响应 | 不触发虚假的成功恢复；无重叠探测。 |
| 业务文档恢复后再次失败 | 冷却和预算跨重载有效，持续失败最终停止自动重载。 |
| 后台页面、online 事件及快速多次手动重试 | 行为符合已评审规则，不形成重载风暴，不抢占用户操作。 |
| 文档 4xx/5xx、API/图片失败 | 分别保留服务器与业务错误语义，不把所有错误都改成整页离线。 |
| 缺少兜底、未受 worker 控制或首次冷启动 | 不声称有不存在的保障，不把原本可能成功的文档变成错误。 |
| 旧配置、公开缓存准入、更新流程与严格 CSP | 兼容方式明确，安全拒绝规则不放宽，提示和恢复脚本在生成的 CSP 下可运行。 |
| 已发布包接入、旧 worker 升级与浏览器矩阵 | 自动化与真实浏览器证据可追溯，不能仅凭源代码或本地模拟宣称生产验收通过。 |

## Integration intent

| Field | Value |
| --- | --- |
| Problem | 弱网或短暂连接失败会立即或在 5 秒后展示离线页；worker 可探测而业务文档失败时自动恢复反复重载。 |
| In scope | 导航兜底的有界重试与提示语义、默认离线页自动恢复稳定性、边界自动化及真实浏览器验证、受影响包和升级接入说明。 |
| Out of scope | 新增业务离线缓存、离线业务可用承诺、API/媒体全局重试、推送、跨 Origin 恢复、业务重构、自动部署与本草案阶段的 NPM 发布。 |
| Safety boundaries | 不改变 PwaIdentity、SW URL/scope、manifest ID、缓存命名空间；不放宽私有/会话/写入/流式/未分类请求缓存准入；重试、探测及重载均有界；公开语义变更必须先有 ADR 与兼容方案。 |
| Initial dependency assumptions | 基于 contracts-foundation、policy-compiler、network-timeout、sw-runtime、vite-adapter、browser-test-harness、package-distribution；新增可选策略须经 contracts/core 校验与编译。 |
| Acceptance intent | 短暂失败在预算内恢复时不立即整页兜底；慢响应不等于断网；文档不可用时恢复不循环；真断网、手动重试、旧配置、CSP 与包升级回归通过。 |

## Change

| Field | Value |
| --- | --- |
| Type | new-module |
| Module id | offline-experience-resilience |
| Responsibility | 改进页面导航失败与慢响应的提示、有限重试和恢复防抖，避免短暂故障立即兜底及离线页反复重载，并交付可复现的边界验收与包升级说明。 |
| Depends on | contracts-foundation, policy-compiler, network-timeout, sw-runtime, vite-adapter, browser-test-harness, package-distribution |
| Build-order anchor | end |

## Tracker contract

| Field | Value |
| --- | --- |
| Proposal id | offline-experience-resilience |
| Identity label | proposal |
| Stage label namespace | proposal-stage: |
