# 实现计划：offline-write-extension

## 概览

按 [spec/offline-write-extension.md](../../spec/offline-write-extension.md) 与 [ADR-0027](../../docs/adr/0027-explicit-session-bound-offline-write-queue.md)，交付显式、会话绑定的离线写队列。实施按安全依赖从契约到浏览器证据推进；每一步保持既有非 `GET` 透传语义。

## 架构决定

- 这是一次协调的 v2 契约迁移，而不是在 v1 `extensions` 中塞入未验证配置。
- 只有 worker 持有 IndexedDB；页面包只发受限消息，不访问网络或存储。
- 首版没有 Background Sync、自动重放或泛化写方法。会话 binding 必须由可见页面提供。
- 任何清理失败都 fail-closed：logout 不注销、恢复 worker 不 claim。

## 任务列表

> 状态（2026-09-23 回填）：任务 1–6 与检查点 A–C 均已完成，2026-09-20 合入本地 `main`（见 [todo.md](todo.md)），未推送远端。下列验收复选框当时未逐项勾选，本次也不补勾：逐项证据以 [verification.md](verification.md) 为准。其中"每项关键判断／安全分支的变异证明"（任务 3、任务 6）只记录了一项（平台 worker 的同源来源校验），不宣称其余各项已有变异证明。

### 任务 1：v2 contracts 与确定性编译

**说明：** 定义 `offlineWrites` 的 policy/plan 闭合形状、诊断与 v1 拒绝；core 编译绝对目标、identity 派生数据库名和配额。

**验收标准：**
- [ ] target、上限、重复、scope、deny/exclude 冲突与 v1 输入都有稳定诊断。
- [ ] 合法 policy 的 plan 通过 `validatePlan`，输入乱序不改变结果。
- [ ] public export、类型快照和 plan golden 证明 v2 形状。

**验证：** contracts/core test、typecheck、lint。

**依赖：** 无。

**预计范围：** M。

### 任务 2：worker 配置与受限消息协议

**说明：** 将最小队列配置注入平台/恢复 worker；定义关联 id、入队、flush、clear 与确认消息，并对来源、形状和版本 fail-closed。

**验收标准：**
- [ ] worker 不接受未声明目标、非窗口同源来源、未知字段或 v1 配置。
- [ ] 现有 fetch 决策表字节语义不变，非 GET 仍不接手。
- [ ] 清理消息有不可混淆的关联确认且不回显载荷。

**验证：** sw-runtime focused test 与既有 request-decision 回归。

**依赖：** 任务 1。

**预计范围：** M。

### 检查点 A：契约与 worker 边界

- [ ] contracts/core/sw-runtime 单元测试、typecheck 与 lint 全绿。
- [ ] 对 v1、未知字段和非 GET 透传做负向检查。

### 任务 3：worker 队列存储、配额与重放状态机

**说明：** 在 worker 实现身份派生 IndexedDB、原子入队、同键摘要比对、FIFO flush、binding purge 与响应分类。

**验收标准：**
- [ ] 只有匹配 binding 的记录发送；不同 binding 在发送前被删除。
- [ ] 配额溢出、同键不同正文、JSON/路径/头非法全部不写入。
- [ ] 2xx、网络/5xx、401/403、其他 4xx 状态分别符合规格，且无响应正文留存。

**验证：** worker unit tests 与每项关键判断的 mutation test。

**依赖：** 检查点 A。

**预计范围：** L，拆分提交为存储、入队、flush 三个可回归切片。

### 任务 4：logout 与恢复 worker 的敏感状态清理

**说明：** 让 client-runtime 在注销前请求并确认清理；恢复 worker 精确删除队列数据库，删除失败不 claim。

**验收标准：**
- [ ] 无队列、成功清理、ack 超时和删除失败各有明确行为；失败保持 registration。
- [ ] 恢复只影响当前 identity 数据库，不影响 entry-resilience 或其他应用数据库。
- [ ] Push 取消及既有缓存清理顺序保持可验证。

**验证：** client-runtime/sw-runtime tests、恢复演练单元覆盖。

**依赖：** 任务 3。

**预计范围：** M。

### 检查点 B：敏感数据生命周期

- [ ] 全仓 build、test、typecheck、lint 通过。
- [ ] 独立评审：检查 binding、数据库名、logout/recovery 的 fail-closed 路径。

### 任务 5：`@pwa-platform/offline-write` 页面 facade 与适配器迁移

**说明：** 新建可选页面包；Vite/Nuxt 交付 v2 配置，Vue/React 仅同步类型与既有 logout 方法语义，不暴露存储实现。

**验收标准：**
- [ ] facade 只有 enqueue、flush、clear；未控制页面或不支持消息端口时明确拒绝。
- [ ] 页面包源码不含 fetch、IndexedDB、worker register、Background Sync 或日志。
- [ ] Vite/Nuxt/Vue/React 的 v2 配置与既有非队列应用回归通过。

**验证：** 新包及适配器 focused tests、public export/import-boundary tests。

**依赖：** 检查点 B。

**预计范围：** L，按页面包、Vite/Nuxt、框架类型拆成独立提交。

### 任务 6：真实浏览器证据、文档和交付核验

**说明：** 用 browser-test-harness 在 Chrome 桌面端验证队列全生命周期，并同步运行时文档与验证记录。

**验收标准：**
- [ ] 离线入队、匹配 binding flush、变 binding purge、logout 清理、恢复清理和非 GET 透传均有真实浏览器断言。
- [ ] 每项安全分支有 mutation 证明；不能取得的 Android/N-1/Background Sync 证据明确写为未取得。
- [ ] README、安全模型、生命周期、包边界、迁移指南、文档基线和 verification 记录同步。

**验证：** `pnpm test:browser`、全仓质量门禁、干净 worktree 复跑。

**依赖：** 任务 5。

**预计范围：** M。

### 检查点 C：交付准备

- [ ] 所有验收标准、质量门禁、独立评审和变异记录已写入验证记录。
- [ ] 用户明确授权后才提交或合并；不推送远端。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 账户切换后重放旧意图 | 高 | binding 必须在 flush 匹配；不匹配先 purge；不做无页面自动重放。 |
| logout/recovery 删除失败 | 高 | fail-closed，分别不注销/不 claim。 |
| 业务误标敏感正文 | 高 | 首版严格范围、接入文档与审查清单；平台不声称能识别内容。 |
| v2 破坏现有消费者 | 高 | 协调 major、v1 明确拒绝、升级指南和各适配器回归。 |
| IndexedDB blocked | 中 | 明确错误和浏览器测试；不得以删库失败后继续接管来掩盖。 |

## 开放问题

无。Background Sync、加密正文、多方法和跨设备冲突处理均明确留待后续 ADR。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| developer-entry | README.md | 交付 v2 范围说明。 |
| lifecycle-and-recovery | docs/architecture/lifecycle.md | 交付 recovery 清理顺序。 |
| offline-write-extension | spec/offline-write-extension.md`、`docs/adr/0027-explicit-session-bound-offline-write-queue.md`、`tasks/offline-write-extension/verification.md | 交付模块边界与证据。 |
| client-runtime | spec/client-runtime.md`、`docs/adr/0013-client-facade-and-page-side-lifecycle-events.md | 交付 logout 的兼容语义。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| developer-entry | delivered | README.md | 已更新入口说明。 |
| lifecycle-and-recovery | delivered | docs/architecture/lifecycle.md | 已更新 recovery 顺序。 |
| offline-write-extension | delivered | tasks/offline-write-extension/verification.md | 已记录模块验证。 |
| client-runtime | delivered | spec/client-runtime.md | 已更新 logout 语义。 |
