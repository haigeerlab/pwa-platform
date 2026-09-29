# 缓存安全模型

缓存准入从拒绝开始。平台只预缓存由构建产出的、且被策略明确列出的静态资源。以下请求在任何策略下都不进入缓存，这是编译进计划的**基线拒绝**（<code>PwaPlan</code> 按固定顺序全部列出）：

- <code>non-get</code>：非 GET 请求；
- <code>cross-origin</code>：跨域请求；
- <code>no-store</code>：响应带 <code>no-store</code>；
- <code>opaque-response</code>：跨域不透明响应；
- <code>redirect</code>：重定向响应；
- <code>websocket</code>：WebSocket；
- <code>unclassified</code>：未分类请求。

此外，策略里声明为 <code>session-data</code>、<code>mutation</code>（写操作）、<code>stream</code>（流媒体）或 <code>unclassified</code> 的路径，一律编译为拒绝规则并排在所有允许规则之前。业务应把会话、鉴权后、个性化、支付、令牌等私有数据的路径声明为 <code>session-data</code>。

## 业务规则不能覆盖安全基线

<code>PwaPolicy</code> 用资源类别和路径表达意图；编译器将它与平台拒绝规则合并。业务不能注入原始 Workbox callback 或任意 worker handler，也不能用允许规则绕过平台拒绝类别：把允许规则写在某条拒绝规则的路径之内，构建会以 <code>compile.allow-under-deny</code> 失败。

| 资源 | 默认行为 |
| --- | --- |
| 构建产出的应用壳资产 | 显式匹配后预缓存 |
| 公共导航 | 按策略回退或网络优先 |
| 公共动态读取 | v3 显式开启后可按限制运行时缓存 |
| <code>session-data</code> 等拒绝类路径的导航 | 不写入平台缓存；网络失败时若有离线页，仍显示通用离线页 |
| 非 GET 请求、<code>mutation</code>、<code>stream</code> | 仅走网络，worker 不介入 |
| 未分类请求（未匹配任何规则） | 仅走网络 |
| 共享 origin 上被根应用排除的子应用路径 | worker 不回答任何请求，连离线页也不返回；该路径完全属于子应用 |
| 带 <code>Range</code> 头的预缓存资源请求 | 直接走网络，由服务器返回 206（预缓存只存完整响应） |
| 公共读取规则下带 <code>Authorization</code> 头的请求 | 直接走网络，不读也不写运行时缓存 |

## 公共读取仍需业务证明

v3 运行时缓存只接受同源 GET，且响应必须同时满足：

- 响应类型为 <code>basic</code>，状态码为 200，且不是重定向的结果；
- <code>Content-Type</code>：导航类规则（<code>navigation-public-dynamic</code>）要求 <code>text/html</code>，数据类规则（<code>public-data</code>）要求 <code>application/json</code> 或 <code>application/*+json</code>；
- <code>Cache-Control</code> 不含 <code>no-store</code> 或 <code>private</code>；使用 <code>stale-while-revalidate</code> 时，还不能含 <code>no-cache</code>、<code>must-revalidate</code>，也不能是 <code>max-age=0</code> 或 <code>s-maxage=0</code>；
- <code>Vary</code> 只能出现 <code>Accept</code> 与 <code>Accept-Encoding</code>；
- 体积不超过配置的 <code>maxEntryBytes</code>。

它不能读取 <code>Set-Cookie</code>，也不会把请求携带 Cookie 直接视为私有。因此路径是否完全公开、是否按用户变化、是否会设置 Cookie，必须由业务团队审查；私有响应应带 <code>Cache-Control: private</code> 或 <code>no-store</code>，它们会被上述准入规则拒绝。接入步骤见[公共读取缓存](/guide/public-read-cache)。

## Service Worker 所有权

worker 需经 HTTPS 在同源注册（本机回环地址可用 HTTP），且 <code>scope</code> 必须**等于** worker 脚本所在的目录：<code>serviceWorkerUrl</code> 是 <code>/app/sw.js</code> 时 <code>scope</code> 只能是 <code>/app/</code>。不一致会以 <code>identity.scope-outside-worker-directory</code> 构建失败，平台也不支持用 <code>Service-Worker-Allowed</code> 响应头放宽。平台只清理本应用命名空间内的缓存；生产身份与缓存命名空间变更需要迁移计划。若同一个 origin 有根应用与子路径应用，根应用必须显式排除子 scope，并按[部署顺序](/operations/release#同源多应用)发布。

## 登出与激活清理什么

- **登出**：<code>logout()</code> 要求 worker 清空离线写队列，并删除全部运行时缓存（页面缓存与所有数据缓存，包括当前配置的那一份）及其过期记录，然后注销 registration。**预缓存的应用壳不会被删除**。启用运行时缓存时，任一删除失败都会使 <code>logout()</code> 返回 <code>false</code> 且保留注册；未启用时运行时缓存这一步只是尽力而为。
- **新版本激活**：删除本配置已不需要的运行时缓存（页面缓存，以及配置摘要不同的数据缓存）；预缓存里不再列在新清单中的条目也会被移除。
- 这些清理都只触及本应用命名空间内的缓存，命名见[默认值与时间约定](/reference/conventions#命名)。
