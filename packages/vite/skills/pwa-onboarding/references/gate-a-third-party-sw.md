# 第三方 Service Worker 的判定

关卡 A 的"需要评估"项读取本文件。调研日期 2026-09-29。**只读文件，不运行项目。**

## 浏览器规则

一个页面由**最具体（最长前缀）的匹配 scope** 的注册控制。`register()` 不传 `scope` 时默认是脚本所在目录，且默认不能比脚本路径更宽，`Service-Worker-Allowed` 响应头可放宽这个上限。同一 scope 再次注册会更新或替换已有注册。所以要按 scope **是否重叠**判定，而不是是否相同。

| scope 关系（平台为 P，第三方为 S） | 判定 | 处理 |
| --- | --- | --- |
| S 与 P 相等 | 冲突（后注册的替换先注册的） | 交给人 |
| S 是 P 的子路径 | 部分冲突：S 下的页面归第三方，平台的缓存、离线、更新在该子树静默失效 | 报告被覆盖的子树，交给人 |
| P 是 S 的子路径 | 部分冲突：平台接管第三方 worker 的子树 | 报告，交给人 |
| 互不为前缀 | 不重叠 | 只报告存在 |
| 无法静态确定 | — | 无法判定，交给人 |

## 静态判定步骤

1. **找注册点**：`serviceWorker.register(` 的脚本 URL 与第二参数的 `scope`；`package.json` 与锁文件里的 SDK 依赖；SDK 初始化调用；`public/`、`static/`、产物根目录里的 worker 文件（含业务自有的 `sw.js`）。每条命中记录文件与行号。
2. **确定 S**：显式给出 `scope`（或 SDK 对应选项）取该值，否则取脚本所在目录。相对路径、`base`、`basePath`、`publicPath` 先换算成站点绝对路径。
3. **比较**：P 与 S 都规范成以 `/` 结尾，按上表判定。
4. **输出**：每条记录写 SDK、证据文件与行号、S、结论、依据（"显式配置"或"默认推断"）。

## 只能标"无法判定，交给人"

scope 或脚本 URL 来自变量、环境变量或运行时拼接；站点有 `basePath`、部署在子路径或经反向代理改写；worker 由构建工具生成且路径在构建配置里；只依赖了 SDK，worker 文件在 SDK 后台、CDN 或部署侧；需要看 `Service-Worker-Allowed` 响应头（仓库里看不到）；通过标签管理器注入；无末尾斜杠的 scope（按字符串前缀还是路径段匹配**未核实**，保守处理）；下表默认 scope 为"未核实"的 SDK。

## 常见推送 SDK

| SDK | 默认 worker 文件 | 默认 scope | 可配置项 | 静态证据 |
| --- | --- | --- | --- | --- |
| Firebase Cloud Messaging | `firebase-messaging-sw.js`（根目录） | 未核实（只见于次级出处） | `getToken` 的 `serviceWorkerRegistration`（未核实） | 依赖 `firebase`；`getMessaging`、`getToken`、`onBackgroundMessage` |
| OneSignal | `OneSignalSDKWorker.js`（根目录） | `/` | `serviceWorkerPath`、`serviceWorkerParam.scope` | `OneSignalSDK.page.js`；`OneSignal.init(` |
| Braze | `service-worker.js`（根目录） | 脚本所在目录（未核实） | `serviceWorkerLocation`、`manageServiceWorkerExternally` | 包 `@braze/web-sdk`；`braze.initialize(` |
| Pusher Beams | `service-worker.js`（根目录） | 未核实 | 传入 `serviceWorkerRegistration` 则 SDK 不再自行注册 | 包 `@pusher/push-notifications-web`；`PusherPushNotifications.Client` |
| CleverTap | `clevertap_sw.js`（必须在根目录） | 未核实 | `serviceWorkerPath` | `clevertap.notifications.push(`；`clevertap_sw.js` |
| MoEngage | `serviceworker.js`（根目录） | 脚本所在位置及其下目录 | `swPath`、`swScope` | `swPath`、`swScope`；`serviceworker.js` |
| Airship | `push-worker.js`（根目录） | 未核实 | `workerUrl` | 全局 `UA`；`sdk.register()`；`push-worker.js` |

推送订阅归属于注册而不是页面路由，scope 不重叠也不保证两个 SDK 的推送互不影响（推断，未核实）。表里的默认值可能已变化：以项目里实际装的版本和读到的证据为准，读不到就标未核实。
