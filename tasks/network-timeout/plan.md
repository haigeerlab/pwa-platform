# 实现计划：network-timeout

## 概览

按 [spec/network-timeout.md](../../spec/network-timeout.md) 交付可选的网络超时：`PwaPolicy` 的 `networkTimeoutSeconds` 写了时，导航超时后使用既有离线回退，network-first 运行时缓存超时后使用缓存并以 `network-timeout` 通知页面；未写时策略、计划、worker 配置与产物逐字节不变。

分支 `claude/pwa-platform-review-cba86f`，基于 `main` 的 `b414fa4`；规格与能力图提交 `2f61c61`。每个任务一个提交，提交信息带 `Task: NT<n>`。

> Tasks tracked in this plan using local ids (NT1–NT8). GitHub 不可用，没有 sub-issue；commit 用 `Task: NT<n>` 标注。

## 架构决定

- **一个字段，只在写了时出现。** 策略、计划与 worker 配置都只在业务写了 `networkTimeoutSeconds` 时带这个键；未写时不产生 `null` 或默认值，保证逐字节不变。
- **导航超时在 sw-runtime 的 `navigate()` 里实现**，不经过 Workbox：`navigate()` 本来就是平台自己的代码，用 `Promise.race` 加计时器即可；超时后晚到的 `fetch` 结果用 `.catch` 接住并丢弃。
- **运行时缓存的超时交给 Workbox 的 `networkTimeoutSeconds`**（2026-09-24 已核对 7.4.1 源码：超时时缓存命中则用缓存，未命中则继续等网络，晚到的响应仍写入缓存）。引擎自己记录"计时器是否已到"，据此把命中原因记为 `network-timeout` 或 `network-failed`。
- **"挂起"夹具用 Playwright 的 `context.route` 拦住请求不放行。** 2026-09-24 实测（Chrome 153、Playwright 1.63）：`context.route` 能拦截 worker 发出的 `fetch`，不调用 `fulfill` 即保持挂起，worker 的超时逻辑按时触发。无需修改 browser-test-harness。
- **逐字节对照**：`2f61c61` 已在干净 worktree 中构建 vite 浏览器夹具并记录 154 个产物文件的 SHA-256（构建确定性已确认）；NT4 之后同法构建比对，结果写入验证记录。
- **执行分工。** NT2–NT5 派给 `executor` 子代理（sonnet）；NT6 浏览器测试与变异、NT7 文档、NT8 门禁留在主会话；ADR-0038 由主会话写。

## 任务定义

### NT1：规格、ADR-0038 与本计划

**验收：** 规格与能力图已提交（`2f61c61`）；ADR-0038 状态"已接受"，并以增补修订 ADR-0012（导航判断增加超时分支）、ADR-0013（`served-from-cache` 的 `reason` 新增取值）、ADR-0035（解除"不做网络超时"的已知限制）；本计划与 Documentation delivery 表提交；项目所有者确认后开始 NT2。

### NT2：契约与编译（TDD，完成：`4696534`）

**范围：** `packages/contracts`（`PwaPolicyV1/V2/V3` 与 `PwaPlan` 的可选字段、schema、测试）；`packages/core`（编译时原样带入计划）。

**验收：**
- 合法 1 与 30；非法 0、31、1.5、`"5"`，报 `schema.invalid-value` 于 `/networkTimeoutSeconds`，不回显值；v1、v2、v3 各一例。
- 未写时：策略解析结果与计划与修订前深比较相同，计划不含该键。
- 写了时：计划带同值。
- 固定的公开 API 快照与清单只新增。
- 变异：上限改为 31。

**范围估计：** 中，4–6 个文件。依赖：NT1。

### NT3：引擎的超时与命中原因（TDD，完成：`04a512c`）

**范围：** `packages/engine-workbox/src/worker/runtime.ts` 与测试。

**验收：** 引擎工厂接受可选 `networkTimeoutSeconds`，只对 network-first 传给 `NetworkFirst`；命中原因在超时后命中时为 `network-timeout`、网络失败后命中时为 `network-failed`、SWR 为 `stale-while-revalidate`；未传时构造出的策略与现在相同。变异：超时命中仍记为 `network-failed`。

**范围估计：** 小到中。依赖：NT1；与 NT2 并行。

### NT4：worker 配置与导航超时（TDD，完成：`6b2c0f1`）

**范围：** `packages/sw-runtime`：worker 配置的可选字段与校验（`shared/config.ts`、`build/config.ts`）、`navigate()` 的超时分支、运行时引擎的构造传参、`PwaRuntimeCacheReason` 与消息校验新增 `network-timeout`、测试。

**验收：**
- 导航四个分支（按时响应、按时失败、超时有回退、超时无回退继续等网络）用假计时器测试；超时后晚到的网络结果被接住，不产生未处理拒绝；未设置时 `navigate()` 行为与测试结果不变。
- 运行时缓存：超时命中时信号 `reason` 为 `network-timeout`（page 与 data 两条路径）。
- worker 配置未写时字段集合与序列化不变；消息校验接受新值、拒绝未知值。
- 未写时 vite 夹具 154 个产物与 `2f61c61` 逐字节相同（对照写入验证记录）。
- 变异：超时后不查回退直接等网络；超时后返回错误而非继续等网络。

**范围估计：** 中，4–6 个文件。依赖：NT2、NT3。

### NT5：页面事件的 `reason` 新值（TDD，完成：`52820a2`）

**范围：** `packages/client-runtime` 中 `served-from-cache` 的类型与测试（若 client-runtime 只引用 sw-runtime 的类型，则只加测试证明新值原样到达页面）。

**验收：** 页面收到 `reason: "network-timeout"` 的事件；未知值仍被拒绝；vue/react 绑定不改。

**范围估计：** 小。依赖：NT4。

### 检查点 A（NT2–NT5 之后）

- 各包单元与构建测试通过；全仓 `pnpm test` 通过；逐字节对照为空。

### NT6：真实浏览器场景（完成：`ce3d0d2`）

**范围：** sw-runtime 浏览器测试新增夹具构建（开启超时，含离线页与 v3 运行时缓存规则）与场景；挂起用 `context.route`。

**验收：**
- 导航：挂起的导航在约 N 秒后显示离线页；未设置超时的同一路径在测试给定的时长内仍挂起、不显示回退。
- 运行时缓存（page 与 data 各一）：先正常访问写入缓存，再挂起网络，约 N 秒后得到缓存内容，页面收到 `served-from-cache` 且 `reason` 为 `network-timeout`。
- 挂起期间未写入任何新缓存条目。
- `--repeat-each 5` 无失败；既有 sw-runtime 浏览器场景无回归。
- 变异：导航超时分支去掉（挂起场景转红）；`reason` 固定为 `network-failed`（信号场景转红）。

**范围估计：** 中。依赖：检查点 A。

### NT7：文档同步（完成：见本任务的提交）

**范围：** ADR-0038 定稿；新增 `docs/guides/network-timeout.md`（写法、建议值、与离线页和运行时缓存的配合、`reason` 新值、未取得的证据）；[public-read-cache 接入说明](../../docs/guides/public-read-cache.md)的已知限制；[sw-runtime 规格](../../spec/sw-runtime.md)与 [client-runtime 规格](../../spec/client-runtime.md)各加一节增补；本模块验证记录；文档基线相关行；Documentation outcome。

**验收：** 相对链接检查通过；Spec Guard 文档核验为 `ready`。

### NT8：门禁与独立评审（完成：门禁全绿；评审阻断 0、应修 2，已在 `6608912` 修复；见验证记录）

干净 worktree 中全仓 `install --frozen-lockfile --offline`、`lint`、`build`、`test`、`typecheck`、`test:browser`；新上下文评审，重点：未写时逐字节不变、超时后晚到结果的处理、无回退时不提前报错、`reason` 的区分、测试是否依赖真实时间而不稳定。

## Task List

- NT1 规格、ADR-0038 与本计划
- NT2 契约与编译（blocked by NT1）
- NT3 引擎的超时与命中原因（blocked by NT1；与 NT2 并行）
- NT4 worker 配置与导航超时（blocked by NT2、NT3）
- NT5 页面事件的 `reason` 新值（blocked by NT4）
- 检查点 A
- NT6 真实浏览器场景（blocked by 检查点 A）
- NT7 文档同步（blocked by NT6）
- NT8 门禁与独立评审（blocked by NT7）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 未写超时的应用行为或产物变化 | 高：所有已上线应用 | 字段只在写了时出现；逐字节对照；`navigate()` 未设置分支的既有测试不改 |
| 超时把本来会成功的请求变成错误 | 高 | 无回退或缓存时继续等网络；专门的单元与变异 |
| 晚到的 `fetch` 结果产生未处理拒绝或写入缓存 | 中 | `.catch` 接住；导航路径不写缓存；测试断言 |
| 浏览器测试依赖真实时间而不稳定 | 中 | 超时取 1 秒，断言留足余量；`--repeat-each 5` |
| 业务按 `reason` 分支时漏处理新值 | 低 | 接入说明写明；类型为联合类型，TypeScript 会提示 |

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| decisions | `docs/adr/0038-network-timeout.md` | 网络超时的语义，及对 ADR-0012、ADR-0013、ADR-0035 的增补。 |
| sw-runtime | `spec/sw-runtime.md`、`docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md` | 平台 worker 的导航与运行时缓存超时；ADR-0012 增补。 |
| client-runtime | `spec/client-runtime.md`、`docs/adr/0013-client-facade-and-page-side-lifecycle-events.md` | `served-from-cache` 的 `reason` 新值；ADR-0013 增补。 |
| public-read-cache | `spec/public-read-cache.md`、`docs/adr/0035-explicit-public-read-runtime-cache.md`、`docs/guides/public-read-cache.md`、`tasks/public-read-cache/plan.md` | 解除"不做网络超时"的已知限制。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| decisions | delivered | `docs/adr/0038-network-timeout.md` | ADR-0038 已接受，并在 ADR-0012、ADR-0013、ADR-0035 中追加增补。 |
| sw-runtime | delivered | `spec/sw-runtime.md` | 规格追加 network-timeout 增补；ADR-0012 增补。 |
| client-runtime | delivered | `spec/client-runtime.md` | 规格追加 network-timeout 增补；ADR-0013 增补。 |
| public-read-cache | delivered | `docs/guides/public-read-cache.md` | 已知限制更新为"需要单独开启"，`reason` 类型同步。 |
