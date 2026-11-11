# 功能 × 浏览器 API 盘点（BC0）

> 2026-11-11，基于 origin/main `3f927d0`（0.4.0 源码）只读梳理，行号指当时的源码。功能行取自 [2026-10-01 功能支持表](../../docs/review/2026-10-01/02-feature-support.md)。版本号来自经验，标“待核实”的未与兼容数据表核对；最低版本请以 MDN browser-compat-data 为准。超出最低版本 Safari 13.1 / iOS 13.4 / Chrome 80 / Edge 80 / Firefox 74 的用法汇总在[规格](../../spec/browser-compat-baseline.md)“现状”一节。

## 先看这三条

1. **代码在哪里运行，决定了宿主能不能补救。**
   - 包都按 ES2022 用 `tsc` 构建，不降级，也不带 polyfill。
   - 页面代码：会进宿主的打包流程，宿主可以用 plugin-legacy 降级语法、补齐 API。
   - worker（`sw.js` 与恢复 worker）：由 `packages/vite/src/workers.ts` 单独打包，没有设构建目标，只受宿主所装 Vite 版本的默认值影响；宿主无法补 polyfill。
   - 离线页内联脚本：完全不经转换。
2. **`URL.canParse`（Chrome 120 / Firefox 115 / Safari 17）在页面初始化和 worker 启动时都会执行，且没有任何检测。**
   - 页面初始化：`createPwaClient` → `client-runtime/src/shared/config.ts:78`。
   - worker 启动：`sw-runtime/src/shared/config.ts:403`、`engine-workbox/src/worker/options.ts:70`。
   - 所以 0.4.0 能注册 worker 的实际下限约是 Chrome 120 / Safari 17，`Object.hasOwn` 并不是唯一的问题。
3. **`contracts` 的运行时代码不进浏览器。** 浏览器端只引用它的类型，引用它的 `build/` 目录只在构建期运行。

## 逐项清单

“检测”一列说明使用前有没有做特性检测：缺少该 API 时，是降级还是抛异常。

| # | 功能 | 运行位置 | 依赖的浏览器 API | 包／源码 | 检测 |
| --- | --- | --- | --- | --- | --- |
| 1 | manifest、安装元数据、图标验证 | 构建期（manifest、图标）；页面（安装提示） | 页面：`beforeinstallprompt`（`preventDefault`，保存事件）、`appinstalled`、`event.prompt()`、`event.userChoice` | 构建：`vite/src/manifest.ts:76,131`、`vite/src/manifest-icons.ts:20`。页面：`client-runtime/src/client/facade.ts:391-412,449-459` | 降级：浏览器不派发事件，`promptInstall()` 就返回 `"unavailable"`。没有用 `matchMedia`／display-mode |
| 2 | Vite manifest 链接注入 | 只在构建期 | 无（输出普通 `<link rel="manifest">`） | `vite/src/index.ts:128-137`、`vite/src/manifest-link.ts` | 不适用 |
| 3 | Service Worker 注册 | 页面 | `navigator.serviceWorker`、`register(url,{scope})`、`getRegistration(scope)`、`registration.active.scriptURL`、`registration.scope`、`controller`、`URL`、**`URL.canParse`**、**`Object.hasOwn`**、`Reflect.ownKeys` | `client-runtime/src/client/facade.ts:88-97,353-363,415-447,528-535`；`client-runtime/src/shared/config.ts:27-82` | 部分：没有 `navigator.serviceWorker` 时明确抛错（`facade.ts:531`），不是静默跳过，而且发生在配置校验之后；配置校验里的 `Object.hasOwn`／`URL.canParse` 没有检测，会抛 `TypeError` |
| 4 | 应用壳预缓存 | 构建期（计划、清单注入）＋worker | `install`／`activate`、`event.waitUntil`、Workbox `PrecacheController`（内部用 fetch＋Cache API）、`caches.match(key,{cacheName})`、`URL`、**`URL.canParse`** | 构建：`core/src/precache.ts:27`、`engine-workbox/src/build/inject.ts:15`。worker：`engine-workbox/src/worker/engine.ts:35-68`（`:57`）、`options.ts:66-72`；`sw-runtime/src/worker/handlers.ts:105-135,378-385`；`sw-runtime/src/worker/index.ts:20-24` | 无。Workbox 7.4.1 自身依赖的 API 待核实 |
| 5 | 业务资源默认不缓存 | worker | `fetch` 事件（放行时不调用 `respondWith`）、`request.method`／`mode`／`headers.has`、`URL`、**`URL.canParse`**、`TextEncoder`／`TextDecoder` | `sw-runtime/src/worker/decide.ts:91-154`（`:104`）；`sw-runtime/src/shared/path-match.ts`；`handlers.ts:122-131` | 无（基础路径） |
| 6 | 静态公共导航 | worker | `fetch` 事件、`respondWith`、`fetch`、`response.type`、`Response.error()`、预缓存匹配 | `decide.ts:124-133,171-183`；`handlers.ts:140,395-411,477-484` | 无（基础路径） |
| 7 | 离线页 | 构建期生成 HTML；worker 回退；页面内联脚本 | 构建期在 Node 中用 `crypto.subtle.digest`、`TextEncoder` 计算 CSP 哈希；worker 匹配预缓存；页面见第 16 行 | `vite/src/offline-page.ts:20-33,141-146,171-219`；`vite/src/index.ts:166-190`；`decide.ts:113-120,180-183`；`handlers.ts:478-484` | 回退不需要检测 |
| 8 | 导航网络超时 | worker | `setTimeout`／`clearTimeout`、`Date.now`、`Promise`、`fetch`、`Response.error()`、`request.signal?.aborted`；运行时缓存读取用 Workbox `NetworkFirst({networkTimeoutSeconds})` | `handlers.ts:395-475`；`sw-runtime/src/shared/config.ts:146-147,195-207`（**`Object.hasOwn`**）；`engine-workbox/src/worker/runtime.ts:152-155` | `request.signal` 用 `?.` 访问，可降级；配置校验里的 `Object.hasOwn` 无检测 |
| 9 | 公共读取运行时缓存 | worker | Workbox `NetworkFirst`／`StaleWhileRevalidate`、`ExpirationPlugin`（IndexedDB）、`registerQuotaErrorCallback`；`Headers`、`new Response`、`body.getReader()`、`caches.open/delete/keys`、`WeakMap`、`FetchEvent`、`indexedDB.open`、`indexedDB.databases`、游标 | `decide.ts:97-146`；`handlers.ts:78-101,518-629`；`sw-runtime/src/worker/admit.ts`；`engine-workbox/src/worker/runtime.ts:52-171`；`sw-runtime/src/worker/runtime-cleanup.ts`；`sw-runtime/src/shared/expiration-records.ts:21-81` | 只检测了 `indexedDB.databases`（`expiration-records.ts:35`） |
| 10 | 缓存来源事件 | worker＋页面 | worker：`event.resultingClientId`、`event.clientId`、`clients.get`、`client.postMessage`、`MessagePort.postMessage`。页面：`message` 事件、`event.source`、`MessageChannel`、`port.onmessage`／`onmessageerror`／`start`／`close`、带转移的 `postMessage` | worker：`handlers.ts:160-167,498-504,619-671`。页面：`facade.ts:302-346,442-443`；`sw-runtime/src/messages/index.ts:107-183` | 无显式检测；页面端发送失败和超时都被吞掉，可降级。`resultingClientId` 在基线浏览器上的支持待核实 |
| 11 | Range／Authorization 防护 | worker | `request.headers.has("range")`、`has("authorization")` | `handlers.ts:128-129`；`decide.ts:129,143-151` | 不适用 |
| 12 | 更新检测 | 页面 | `getRegistration`、`registration.update()`、`installing`／`waiting`、`updatefound`、`statechange`、`controller`、`setTimeout`、`document.visibilityState`、`visibilitychange`、`Date.now`、`Number.isInteger` | `facade.ts:149-197,237-259,499-502`；`client-runtime/src/client/update-check.ts` | 只在开启 `updateCheck` 时检查 `typeof document`；其余默认可用 |
| 13 | 更新接管 | 页面＋worker | 页面：`waiting.postMessage({type:"pwa:skip-waiting"})`、`controllerchange`、`setTimeout`。worker：`message` 事件、`event.source.type/url`、`skipWaiting()`、`event.waitUntil`；平台 worker 不调用 `clients.claim` | 页面：`facade.ts:208-230,461-478`。worker：`handlers.ts:143-159,486-489`（**`URL.canParse`** 在 `:488`）；`messages/index.ts` | 无 |
| 14 | Vue／React 默认提示 UI | 页面 | `document.querySelector`、`HTMLScriptElement`、`AbortController`、`signal` 的 `abort` 事件（`{once:true}`）、`fetch(...,{cache:"no-store",signal})`、`DOMParser`、`URL`／`searchParams`、`setTimeout`、`location.reload`；CSS 自定义属性、flex `gap`、`prefers-color-scheme`、`color-scheme` | `vue/src/ui.ts:102-296`；`react/src/ui.ts:111-301`；两包的 `update-notice.css`；`vue/src/index.ts:44-103`；`react/src/index.ts:52-79`；`react/src/store.ts:221-237` | `detectPageCurrency` 捕获所有失败并退回 `"stale"`；但绑定层无条件调用 `createPwaClient`，会继承第 3 行的抛错 |
| 15 | 多标签页协调 | 页面 | 只用各标签页的 `controllerchange`；没有用 `BroadcastChannel`、`navigator.locks` 或 storage 事件 | `facade.ts:163-173` | 不适用 |
| 16 | 离线页联网恢复 | 内联脚本＋worker | 内联脚本：`navigator.serviceWorker?.controller`、`controller.scriptURL`、`URL`、`sessionStorage`、`MessageChannel`、带端口的 `postMessage`、`online` 事件、`visibilitychange`、`setTimeout`、`location.reload`。worker 探测：`clients.matchAll({type:"window"})`、**`URL.canParse`**、`performance.now`、`AbortController`、`fetch(...,{mode:"same-origin",redirect:"error",cache:"no-store",signal})`、`body.getReader()`、`reader.cancel`、`Promise.race` | `vite/src/offline-page.ts:36-122`；`sw-runtime/src/worker/offline-document-probe.ts:5-62`；`handlers.ts:145-154` | 对 controller 有检测（`?.`）；`sessionStorage` 有 try/catch；探测超时或回复异常就停止恢复；worker 探测捕获所有异常并返回 false；`MessageChannel` 无检测 |
| 17 | 恢复 worker | worker（独立脚本） | `install` → `skipWaiting()`、`activate` → `caches.keys/delete`、`indexedDB.databases`（有检测）、`indexedDB.open`／`deleteDatabase`、游标删除、`pushManager.getSubscription/unsubscribe`、`clients.claim()`、配置校验中的 **`Object.hasOwn`** | `sw-runtime/src/recovery-worker/index.ts:32-116`；`sw-runtime/src/entries/recovery-worker-entry.ts`；`sw-runtime/src/shared/config.ts:226-265` | 部分：`pushManager` 与 `indexedDB.databases` 有检测；`Object.hasOwn` 无 |
| 18 | 入口恢复页 | 页面（`pwa-entry.html`＋模块脚本）及页面端 API | `indexedDB.open/transaction/get/put`、`fetch(...,{cache:"no-store",credentials:"omit",mode:"no-cors",signal:`**`AbortSignal.timeout`**`(5000)})`、`URLSearchParams`、`location`、`localStorage`、DOM 创建、`WeakMap`、`URL`、**`URL.canParse`**、**`Object.hasOwn`**、**`??=`** | `entry-resilience/src/page/`（`main.ts`、`render.ts`、`model.ts`）、`browser/index.ts`、`browser/probes.ts:18-43`、`browser/indexeddb.ts`、`client/index.ts:25-59`、`resolve.ts`、`decide.ts`、`update.ts`、`manifest.ts`、`internal/origin.ts`、`internal/plain-object.ts`；构建：`entry-resilience/src/vite/index.ts:100-219` | 无。`AbortSignal.timeout` 在 try 内，缺失时所有探测都静默判为不可达；`parseEntryManifest` 未包裹，`updateEntryManifest` 会以 `TypeError` 拒绝；`localStorage` 有 try |
| 19 | 离线／恢复／提示 UI 的语言与主题 | 构建期＋页面 | 离线页只用 CSS（`prefers-color-scheme`、`[data-theme]`、`color-scheme`、**`inset`**、`max()`）；恢复页从 `localStorage` 读主题后 `setAttribute("data-theme")`；提示 UI 的 `locale` 属性和 CSS 变量 | `vite/src/offline-page.ts`、`vite/src/offline-page-style.ts:9-69`；`entry-resilience/src/page/messages.ts`、`vite/default-style.ts:9-56`、`page/main.ts:63-78`；`vue/src/ui.ts`、`react/src/ui.ts` | `localStorage` 有 try；CSS 不支持时降级 |
| 20 | 登出清理 | 页面＋worker | 页面：`getRegistration`、`controller`、`MessageChannel`＋带转移的 `postMessage`、`setTimeout`、`registration.unregister()`。worker：带端口的 `message`、`indexedDB.deleteDatabase`、`caches.delete/keys`、过期记录 IndexedDB 删除 | 页面：`facade.ts:261-287,365-376,480-497`。worker：`handlers.ts:168-225,343-349`；`offline-write-store.ts`；`runtime-cleanup.ts` | 部分：没有注册或 controller、握手失败或超时都返回 `false` |
| 21 | 同源多 PWA | 构建期＋worker＋页面 | worker：路径匹配（`TextEncoder`／`TextDecoder`）、`exclude` 放行。页面：按 scope 精确匹配 `getRegistration`（`URL`） | `core/src/topology.ts`；`decide.ts:112`；`path-match.ts:36-45`；`facade.ts:353-363` | 不适用 |
| 22 | 构建／发布验证 | 只在构建期 | 无 | `build-verifier/src/`、`release-tools/src/` | 不适用 |
| 23 | 可移植多 Origin 构建 | 只在构建期；运行时 worker 从 `location.href` 取源 | 无 | `core/src/compile.ts`、`vite/src/index.ts:115-117`、`build-verifier/src/deployment.ts` | 不适用 |
| 24 | worker 主脚本 MIME 门禁 | 只在构建期 | 无 | `build-verifier/src/worker-mime.ts` | 不适用 |
| 25 | Nuxt 适配（私有） | 构建期模块＋页面插件 | 同第 3、12、13 行（经 `createPwaClient` 与 Vue 绑定），另有 `console.warn` | `nuxt/src/runtime/plugin.ts:28-51`、`runtime/binding.ts` | 无；只在编译期判断 `import.meta.server` |
| 26 | Push（私有） | 页面＋worker（服务端在 Node） | 页面：`PushManager`、`Notification.permission`／`requestPermission()`、`pushManager.getSubscription/subscribe`、`subscription.options`、`toJSON`、`unsubscribe`、`Uint8Array`、`URL`。worker：`push` 事件、`event.data.text()`、`TextEncoder`、`showNotification`、`notificationclick`、`notification.close`、`clients.matchAll({includeUncontrolled:true})`、`client.focus`、`clients.openWindow` | 页面：`push/src/client/index.ts:34-209`（**类字段**在 `:35`）。worker：`handlers.ts:180-194,352-375`；`sw-runtime/src/worker/notification-target.ts`；`sw-runtime/src/push-payload/index.ts:137-156` | 页面：`isSupported()` 检查了 Service Worker、`PushManager`、`Notification`；但类字段会让整个模块在 Safari 13.1 上解析失败。worker：`openWindow`／`focus` 失败被吞掉 |
| 27 | 离线写队列（私有） | 页面＋worker | 页面：`getRegistration`、带端口的 `postMessage`、`MessageChannel`、`setTimeout`、`URL`、**`URL.canParse`**、**`Object.hasOwn`**、`Reflect.ownKeys`。worker：`indexedDB` 增删查、`TextEncoder`、`WeakSet`、`fetch(...,{method:"POST",credentials:"same-origin"})` | 页面：`offline-write/src/index.ts:26-109`。worker：`handlers.ts:168-325`；`offline-write-intent.ts`；`offline-write-store.ts`；`offline-write-flush.ts` | 页面：检查了 `navigator.serviceWorker`，但 `URL.canParse` 在检查之前执行（`:27`→`:103`） |

浏览器端代码里**完全没有用到**（全文搜索确认）：`BroadcastChannel`、`navigator.onLine`、`navigationPreload`、`matchMedia`／display-mode、`structuredClone`、`crypto.randomUUID`／`getRandomValues`、`navigator.locks`、`requestIdleCallback`、`startMessages`。

## 待核实

- Workbox 7.4.1 被打进 worker 部分的语法与 API 下限（由 BC4 的产物检查覆盖：语法与 JS 内置 API 由 es-check，名单内网页 API 由网页 API 规则）。
- `FetchEvent.resultingClientId` 在基线浏览器上是否可用。
- 表中版本号未逐一对照兼容数据表。
