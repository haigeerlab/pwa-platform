# 安全与隐私模型

## 默认拒绝的缓存模型

V1 只允许构建产出的静态资源进入预缓存。v1.1 起，`PwaPolicy v3` 可以显式开启公共读取运行时缓存（[public-read-cache](../../spec/public-read-cache.md)、[ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）：从显式 allowlist 开始，只准入同源 `GET` 响应，且状态码和内容类型允许、没有 `Cache-Control: no-store`、不含私有语义、响应体和条目数量均受限。v1/v2 策略、以及 v3 且 `runtimeCache.enabled: false` 时，**请求判断不变**：这些应用的运行时缓存请求判断结果与之前相同，不写入任何运行时缓存。但不是逐字节不变（2026-09-24 T13 评审后修订）——所有应用的 worker 产物都会多出运行时缓存引擎的体积，worker 配置多出 `runtimeCache` 字段，新 worker 激活与登出时会（尽力而为地）尝试删除本应用的运行时缓存，详见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md) 与[接入指南](../guides/public-read-cache.md)。

写操作、鉴权/会话 endpoint、个性化数据、支付数据、播放令牌、直播 URL、WebSocket、跨域/CDN 响应、不透明响应、重定向及其他未分类请求均被拒绝。

**`Set-Cookie` 是业务责任，不是平台能检查的准入条件。** Fetch 规范把 `Set-Cookie` 列为 forbidden response-header name，`type: "basic"` 的响应上 worker 读不到这个头，因此平台不承诺能拦截带 `Set-Cookie` 的响应。运行时缓存规则覆盖的路径不得设置 Cookie；如果确实会设置，响应必须同时带 `Cache-Control: private`，由准入规则中的私有语义检查拦下。

**平台不按请求的凭据模式（`request.credentials`）判断是否准入（2026-09-24 T13 评审后补记）。** 同源请求默认携带 Cookie，按凭据模式判断会让运行时缓存对几乎所有请求失效，因此平台不做这项判断，理由见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)。依靠 Cookie 做个性化、却没有带 `Cache-Control: private` 的响应会被当作公共响应写入，这是业务分类的责任，由接入指南明确要求。

缓存携带 cookie 的请求并非天然不安全，但必须明确证明其为公共内容：不得写入用户状态、暴露个人数据、依赖权限或携带私有缓存语义。

## Service Worker 控制项

- HTTPS 和同源 worker URL 是强制要求。
- Scope 必须取可用的最小路径。
- worker 不得执行任意脚本 URL 或未经评审的 `importScripts` 输入。
- CSP 只能允许预期的 worker 来源。
- 登出必须清除平台管理的用户敏感缓存分类。v1 把 `session-data`、`mutation`、`stream` 与 `unclassified` 一律编译为 `deny`，平台不缓存任何私有数据，因此该分类在 v1 为空集，登出只注销注册、不删除任何缓存（[ADR-0013](../adr/0013-client-facade-and-page-side-lifecycle-events.md)）。本条要求本身不随之放宽：v1.1 准入公共读取缓存后，任何被标记为用户敏感的分类仍必须在登出时清除；`logout()` 在注销前**总会**要求 worker 尝试删除全部运行时缓存及其 `workbox-expiration` 记录（未启用运行时缓存时也尝试，以清掉早先启用时留下的缓存）——但只有 `runtimeCache.enabled: true` 时，删除失败才阻断登出（`logout()` 解析为 `false` 并保留 registration）；`enabled: false` 时这一步是尽力而为，失败不阻断登出，不给未启用运行时缓存的应用新增一种登出失败方式（2026-09-24 T13 评审后修订，见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）。

## 显式离线写队列（协调 v2）

离线写是默认关闭的、单独许可的能力，不改变任何 `fetch` 监听或非 `GET` 透传语义。页面只能通过 `@pwa-platform/offline-write` 向当前同 scope、已控制页面的 worker 发送已声明 target 的 JSON `POST` 意图；页面包不访问网络、IndexedDB 或 worker 注册。

- 每条意图必须带业务生成且跨重试稳定的幂等键，以及不含 token、用户标识或 PII 的 opaque session binding。worker 只会重放完全相同 binding 的记录；看到不同 binding 时先永久删除旧记录。
- worker 只保存最小 JSON 意图与 identity 派生的专属数据库名；不会保存 Cookie、Authorization、响应正文或业务 header。2xx 才删除；网络/5xx 留待应用显式重试；401/403 与其他 4xx 不自动重试。
- `logout()` 在注销前要求 worker 清空该数据库并确认。确认超时、协议不匹配或删除失败都保留 registration；恢复 worker 在清缓存后删除同一数据库，删除被阻塞或失败时不得 claim 客户端。服务端仍须以原子幂等约束处理至少一次投递。

完整契约与服务端责任见 [ADR-0027](../adr/0027-explicit-session-bound-offline-write-queue.md)。

## Push 隐私

Push payload 只能包含不透明事件数据和由同一应用控制的导航目标；不得包含令牌、凭据、订阅地址或授权信息。打开应用后始终重新校验鉴权和实时授权，并向后端重新取得业务数据。

应用登出前必须先取消 Push 订阅并通知后端删除该订阅；随后调用 `logout()` 注销 worker。注销 worker 会使该注册的订阅失效，但不能替代前述后端清理。
