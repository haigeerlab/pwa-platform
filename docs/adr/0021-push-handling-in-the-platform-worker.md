# ADR-0021：平台 worker 内置推送处理

## 状态

已接受（2026-09-18，项目所有者）。服务 [push-module](../../spec/push-module.md)；落实 [ADR-0006](0006-optional-shared-origin-and-push-modules.md) "Push 作为可选模块"的决定，不取代它。修订 [ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 的两处结论（见"对 ADR-0012 的修订"）。

## 背景

Web Push 的通知只能由接收推送的那个 worker 展示，点击通知的事件也只派发给它。一个应用在一个 scope 上只有一个 worker，就是平台 worker。

而平台 worker 目前是封闭的：
- 只注册 `install`、`activate`、`fetch`、`message` 四个监听，单元测试断言恰好这四个（ADR-0012）；
- worker 配置是封闭的 8 个字段，未知字段令 worker 启动失败；`PwaPlan` 是封闭的 15 个字段；
- 业务应用不得注入任意 worker 代码或 `importScripts`（`CLAUDE.md`、[安全模型](../architecture/security-model.md)）；
- 另起一个 worker 会改变 `serviceWorkerUrl` 与 scope，而这两者在生产注册后不可变更。

所以推送处理不可能做成完全不碰已交付包的独立模块。[ADR-0018](0018-entry-resilience-delivery-boundary.md) 确立的"可选模块不改已交付包的公开契约"在这里只能部分成立：页面与后端部分放进新包，worker 部分必须进入 sw-runtime。

## 决策

- **平台 worker 固定注册 `push` 与 `notificationclick`**，不设配置开关，不改 worker 配置与 `PwaPlan`。
  - 理由：没有推送订阅的注册永远收不到推送事件，也就永远不会出现平台通知，所以固定注册对不使用推送的应用没有可观察的行为变化。权限请求与订阅只发生在新包 `@pwa-platform/push` 的页面入口中，由应用显式调用。
  - 不采用配置开关：开关需要进入 worker 配置，进而进入 `PwaPlan`，改动 contracts、core、vite、nuxt 四个包，而换来的只是省下数百字节。

- **推送格式由平台规定**：一段 UTF-8 JSON，字段封闭为 `v`（固定为 1）、`title`、`body`、`tag`、`url`、`data`，UTF-8 编码后不超过 3072 字节。各字段上限见规格第 1 节。
  - 格式与校验放在 sw-runtime 的新零依赖入口 `./push-payload`，worker 与后端入口共用这一份实现，后端通过 `@pwa-platform/push/server` 的再导出使用。
  - 推送内容不得包含令牌、凭据、订阅地址或授权信息；业务数据只放不透明标识，应用打开后重新向后端取数（落实安全模型"Push 隐私"）。平台不检查显示文本。

- **`push` 监听**：推送合格时展示一条通知，不设图标（worker 配置中没有 manifest 图标信息，不为此扩展配置）。不合格、为空或解析失败时不展示，也不记录内容。

- **`notificationclick` 监听**：
  - 关闭通知，把 `url` 按 scope 解析；不在本应用的源与 scope 内、或解析失败时，改用 scope 根地址；
  - 已有同源、同 scope 且地址完全相同的窗口时聚焦它，否则 `clients.openWindow`；
  - 不导航已有窗口，不向页面发消息。推送相关的页面侧事件不在本次范围内，改变事件集仍需按 [ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 另立 ADR。

- **两个新监听都不读写缓存，不影响 `fetch` 的判定。**

- **恢复 worker 在激活时取消推送订阅**：先删除本应用的缓存，再取消本注册上的推送订阅；取消失败不影响缓存删除与接管。恢复 worker 仍不注册 `push` 与 `notificationclick`。业务后端此后发送会收到订阅失效的响应，据此清理。

- **页面入口与后端入口放在新包 `@pwa-platform/push`**，不改 client-runtime 的门面与 vue/react 绑定，不引入第三方依赖。发送、加密、VAPID 签名与订阅存储归业务后端。

## 对 ADR-0012 的修订

- "平台 worker 只注册 `install`、`activate`、`fetch`、`message`"改为：还注册 `push` 与 `notificationclick`，行为按本 ADR。
- 恢复 worker 的激活步骤由"删除本应用缓存，再接管客户端"改为：删除本应用缓存、取消本注册的推送订阅（失败不阻断）、再接管客户端。
- ADR-0012 的其余结论不变：配置格式、注入点、跳过等待消息、离线导航回退、`deny` 与未分类请求的处理。

## 浏览器实测（2026-09-18，Chrome 153 桌面端，Playwright 1.63.0）

在会话临时目录中用一个最小 worker 实测，代码不入库：
- **经 CDP `ServiceWorker.deliverPushMessage` 投递推送：可行。** worker 收到推送并展示通知，页面上 `registration.getNotifications()` 读到标题、正文与 tag。
- **`pushManager.subscribe`：不可行。** 无头与有界面模式都以 `AbortError: Registration failed - permission denied` 失败，而通知权限已授予、`permissionState` 为 `granted`。原因很可能是 Playwright 启动的 Chrome 关闭了后台网络、连不上推送服务，但没有查证；按计划不为此放开网络。
- **通知点击：部分可行。** 在真实 worker 内派发合成的 `notificationclick` 能执行处理函数，但 `clients.openWindow` 以 `InvalidAccessError: Not allowed to open a window.` 拒绝，因为合成事件没有用户激活。真实点击无法在自动化中触发。

因此真实浏览器能证明"推送到达后如何展示"，不能证明"订阅成功"与"点击后打开或聚焦"；后两者以单元测试为准，并在验证记录中登记为未取得的证据。

## 影响

- 所有应用的平台 worker 都多出两个监听与格式校验，体积增加数百字节，包括不使用推送的应用。vite 与 nuxt 构建出的 worker 自动带上新监听，靠它们既有的浏览器测试兜住回归。
- 格式不合格的推送在 Chrome 上会显示浏览器的通用提示（`userVisibleOnly` 的结果），平台无法避免；接入文档写明。
- 平台不知道后端是否还持有已失效的订阅；登出（`logout()` 注销 worker 会让订阅失效）与恢复之后的清理依赖业务后端处理发送失败。接入文档要求应用在登出前先取消订阅并通知后端。
- 推送格式增加字段、点击时导航已有窗口、推送相关的页面侧事件，都需要新的 ADR。

## 补充（2026-09-24）：订阅失败的归因更正与真实送达

本节不改变本 ADR 的任何决定，只更正"浏览器实测"一节中的一处归因，并登记后续取得的证据。依据见 [push-module 规格修订](../../spec/push-module.md)"修订：真实订阅与真实送达的证据收尾"与[验证记录](../../tasks/push-module/verification.md)。

- **订阅失败的原因不是后台网络。** 上文写"很可能是 Playwright 启动的 Chrome 关闭了后台网络"，实测不成立（Chrome 153.0.8010.50 stable、Playwright 1.63.0，无头与有界面结果相同）：`browser.newContext()` 创建的非持久化 context 等同无痕 profile，Chrome 在其中拒绝推送订阅；改用 `launchPersistentContext` 即可取得真实的 FCM endpoint。是否去掉 `--disable-background-networking` 对结果没有影响。
- **真实订阅与经推送服务的送达已取得证据。** React 示例的联网套件（`packages/examples-browser-e2e/browser-tests-network/`）以持久化 context 经演示页订阅，用只依赖 `node:crypto` 的测试发送器（VAPID 与 aes128gcm）把 `createPushPayload` 构造的推送发到 FCM，平台 worker 展示的通知与构造值一致；被 FCM 接受的不合格推送不展示平台通知（到达 worker 是推断，FCM 不保证顺序）；取消订阅后旧 endpoint 返回 404 或 410。发送器只是测试工具，后端发送仍归业务，本 ADR 的边界不变。
- **真实点击仍无法自动化**，上文结论不变：点击后的打开或聚焦只能人工验证。
- **`getNotifications()` 查不到通知的触发条件已定位**：通知创建后立即以约 100 ms 的间隔紧密轮询 `getNotifications()`，会使通知永久丢失；与投递方式（CDP、真实推送服务、页面直接调用 `showNotification()`）和 context 是否持久化都无关。批量或稀疏地查询时几乎不丢。Chromium 内部的具体机制未查明。
