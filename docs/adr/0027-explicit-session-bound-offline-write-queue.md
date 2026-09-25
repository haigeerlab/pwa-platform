# ADR-0027：显式、会话绑定的离线写入队列

## 状态

已接受（2026-09-20）。项目所有者授权以本文边界交付 `offline-write-extension`；它是路线图 v3 的可选能力，不改变 v1 的默认拒绝模型。

## 背景

平台目前把所有非 `GET` 请求透传，`mutation` 资源类别编译为 `deny`；`PwaPlan v1` 和 worker 配置都是闭合契约。`logout()` 只注销 registration，恢复 worker 只清理 Cache Storage。这些选择适用于没有用户敏感持久化数据的 v1，但不能安全地承载离线写入。

把任意 `fetch` 失败自动重放会绕开请求分类、把凭据及私有载荷写入浏览器存储，并在账户切换后以新会话执行旧用户的意图。Background Sync 也不能在没有页面参与时证明当前认证主体仍与入队时相同。网络超时的效果未知，因此队列无法承诺 exactly-once；幂等与冲突必须由业务服务端承担。

## 决策

- **采用显式队列 API，不拦截 fetch。** 新包 `@pwa-platform/offline-write` 的页面 API 只把严格校验的入队消息发送给当前受控的平台 worker；worker 只响应该协议，不在 `fetch` 监听中接手任何写请求。
- **首版只允许策略声明的非敏感 JSON `POST`。** `PwaPolicy v2` 新增封闭的 `offlineWrites` 声明，按 target id 列出同源、scope 内的路径前缀、单条正文上限和队列配额；`PwaPlan v2` 编译该声明，worker 配置只注入其运行时所需字段。请求不允许自定义头；worker 只写入 `content-type: application/json` 与业务提供的 `idempotency-key`。令牌、`Authorization`、Cookie 值和任意二进制/表单正文都不进入队列。
- **会话绑定是重放前置条件。** 业务在每条意图中提供不含个人信息的 opaque `sessionBinding`，并在 `flush()` 时再次提供当前绑定。worker 只重放完全相同绑定的记录；看到不同绑定时先删除旧绑定记录，绝不以新账户的 Cookie 执行旧账户意图。应用仍须在登出路径调用 `logout()`。
- **不在首版使用 Background Sync 或自动重放。** 应用在联网恢复、用户主动重试或受控页面启动后显式调用 `flush()`；没有页面提供当前会话绑定时，worker 不发送请求。
- **至少一次交付，业务服务端负责幂等。** 每条入队意图必须带稳定的幂等键，且同一键配不同 target/body/session binding 一律拒绝。只有 2xx 才删除记录；网络失败与 5xx 保留为可重试，401/403 与其他 4xx 标为失败且不自动重试。响应正文从不保留或回传。服务端必须原子地按幂等键及请求摘要处理重复与未知结果。
- **登出与恢复必须清理队列。** `logout()` 先向当前 worker 发送敏感状态清理请求并等待确认，确认失败则拒绝注销；恢复 worker 在清 Cache Storage 后删除本应用的离线写 IndexedDB 数据库，再取消 Push 订阅、接管客户端。入队要求存在当前受控 worker，因此没有 registration 时不存在平台管理的离线写记录。
- **以协调的 v2 契约发布，不让 v1/v2 并存。** contracts、core、sw-runtime、client-runtime、Vite/Nuxt 接入及框架绑定一起升级。旧 v1 policy/plan 会在构建或 worker 启动时明确拒绝，避免用宽松兼容猜测离线写安全策略。

## 影响

- 新增 `@pwa-platform/offline-write`，但它不直接访问 IndexedDB、网络或 Service Worker 注册；浏览器存储、入队、flush 与清理全部由平台 worker 执行。
- 修改 contracts、core、sw-runtime 和 client-runtime 的公开契约，并同步 Vite、Nuxt 与 Vue/React 的配置/类型路径；这是一次受控的 major 兼容性变更。
- 恢复 worker 不再只触碰 Cache Storage；它只删除由 identity 确定的本应用离线写数据库，不扫描或删除任意 IndexedDB 数据库。
- 安全模型、生命周期、包边界、迁移指南和浏览器验收需要同步。文档不得把业务的“非敏感”声明误写成平台能自动判定的事实。

## 更正：v1/v2 策略与计划实际上都被接受（2026-09-24）

"决定"一节最后一条写着"旧 v1 policy/plan 会在构建或 worker 启动时明确拒绝，避免用宽松兼容猜测离线写安全策略"。这与当前实现不符：`packages/contracts/src/validate.ts` 的策略 union（第 191 行附近）与 `packages/core/src/compile.ts` 的编译分支（第 163 行附近）都同时接受 v1、v2（以及后续新增的 v3）策略与计划，并未拒绝 v1。原文照原样保留，仅在此记录更正；决策本身（协调 v2 契约、显式队列 API、会话绑定重放）不受影响，因为实际接受 v1/v2 并不会让离线写在 v1 计划上生效——v1 计划没有 `offlineWrites` 字段，worker 配置对应位置取默认的关闭值。此更正由 [ADR-0035](0035-explicit-public-read-runtime-cache.md) 在核实 public-read-cache 的现状时发现。

## 拒绝的方案

- **任意非 GET fetch 自动重放：拒绝。** 它把分类、授权和重试语义从业务端点夺走，并会把私有/支付写入带进持久化层。
- **只靠 `Idempotency-Key` 自动 Background Sync：拒绝。** 键可抑制重复效果，却不能证明此时 Cookie 所属账户仍是原会话。
- **队列 API 自己在 logout 前清理：拒绝。** 应用容易遗漏调用；安全清理必须是平台 `logout()` 与恢复路径的原子前置条件。
- **保留 PwaPlan v1 并把配置塞进不透明 extensions：拒绝。** worker 安全边界不能依赖未经 contracts/core 解析的任意 JSON；同时维护两个运行时版本会产生不确定的降级行为。
