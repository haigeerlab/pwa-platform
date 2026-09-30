# 公共读取缓存

`PwaPolicy v3` 允许业务把**经过评审的公共读取**交给平台做运行时缓存。它只处理明确匹配的同源 `GET` 请求；第一次成功取得网络响应之前，离线时仍没有数据可返回。私有接口、个性化 HTML、写请求和未分类请求不能因此改成公共类别。

## 开启与配置

基于[配置指南](/guide/configuration)中的完整配置（`IDENTITY`、`INSTALL` 与 `vite.config.ts`），将策略升为 v3。下面保留了应用壳与离线页的规则，并只给公共目录接口增加运行时缓存：

~~~ts
import type { PwaPolicy } from "@pwa-platform/contracts";

export const POLICY: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  // v2／v3 必填；离线写入能力尚未发布，保持全零的禁用形式
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
  ],
  runtimeCache: {
    enabled: true,
    maxEntries: 100,
    maxEntryBytes: 262_144,
    maxAgeSeconds: 86_400,
  },
};
~~~

仍需保证离线页文件存在：在 Vite 插件中启用 `offlinePage: {}`，或自备 `public/offline.html`（缺失时构建以 `compile.offline-fallback-not-built` 失败，详见配置指南），并保证业务接口路径与实际部署的 `mountPath` 一致。策略的 `pathPrefix` 是相对 `mountPath` 的路径，不要重复写挂载前缀。

`maxEntries` 可设为 1–200，按动态页面与公共数据两个缓存分别计数；`maxEntryBytes` 为 1–1,048,576 字节；`maxAgeSeconds` 为 60–604,800 秒。三项都没有默认值。若要关闭 v3 运行时缓存，设置 `enabled: false`，同时将三项上限全部设为 `0`。

时效与容量的计算方式：

- `maxAgeSeconds` 从**平台写入缓存的时刻**起算，与响应自身的 `max-age`、`Date` 无关；读取时发现已过期的条目会被删除并当作未命中。
- `maxEntries` 是每个缓存各自的上限（动态页面、公共数据分别计），超出时按最近最少使用淘汰。
- 任何一条可执行规则或三项上限改变，都会改变缓存配置摘要（`configDigest`），公共数据缓存的名字随之变为新的 `pwa:<appId>:<environment>:<seed>:runtime-data-<digest>`。新 worker 激活时会删除旧摘要的数据缓存，其中的数据不会迁移，用户在断网前需要重新在线取得一次。动态页面缓存（`…:runtime-pages`）每次新 worker 激活都会整体删除。

::: warning 已上线的 v1／v2 应用不需要任何改动，但 worker 产物不是逐字节不变
请求判断不会因为升级平台包而改变——只有显式声明 <code>schemaVersion: 3</code> 且 <code>runtimeCache.enabled: true</code> 才会开始运行时缓存。但**自平台加入运行时缓存引擎起，平台 worker 静态引入了该引擎，所有应用（包括 v1、v2 和未开启的 v3）的 worker 产物都会多出 <code>workbox-strategies</code>、<code>workbox-expiration</code> 两个模块（约 50 KB，未压缩）**，worker 配置也多出一个 <code>runtimeCache</code> 字段（未启用时只带两个缓存名）。新 worker 激活与登出时会尽力删除本应用的运行时缓存与过期记录，通常两者都不存在。
:::

## 可用的规则

| 资源类别 | 可执行策略 | 用途 |
| --- | --- | --- |
| `public-data` | `network-first`、`stale-while-revalidate` | 公共 JSON 读取 |
| `navigation-public-dynamic` | 仅 `network-first` | 不因用户身份变化的公共动态 HTML |

`cache: "none"` 仍透传。同一个前缀不能重复声明，也不能把可缓存规则放在拒绝类（`session-data`、`mutation`、`stream`、`unclassified`）前缀之下：例如 `/api` 是 `session-data` 时，`/api/catalog` 的 `public-data` 规则会以 `compile.allow-under-deny` 失败，公开接口需要放在不与私有前缀嵌套的路径（写法约束见[配置指南](/guide/configuration#资源规则的写法约束)）。给上述类别配置 `cache-first`，或给公共动态 HTML 配置 `stale-while-revalidate`，会以 `compile.runtime-strategy-unsupported` 阻止构建。动态 HTML 不提供 SWR，因为旧 HTML 可能引用已被移除的指纹资源。

| 诊断码 | 严重度 | 含义与修复 |
| --- | --- | --- |
| `compile.runtime-strategy-unsupported` | 构建失败 | 仅在 `schemaVersion: 3` 且 `runtimeCache.enabled: true` 时检查：某条规则声明的资源类别与 `cache` 组合不在可执行范围内（例如给 `navigation-public-dynamic` 配 `cache-first` 或 SWR）；把 `cache` 改成上表允许的策略 |
| `compile.runtime-cache-unused` | 警告，不阻塞构建 | `runtimeCache.enabled: true`，但没有任何规则落在可执行的组合里；多半是开了开关却忘了把某条规则的 `cache` 改成 `network-first` 或 `stale-while-revalidate` |

## 响应必须满足的条件

平台只会把同时满足以下条件的网络响应写入运行时缓存：

- 同源 `GET`，且不带 `Authorization` 请求头：带该头的公共数据请求直接透传到网络；带该头的动态页面导航按未开启运行时缓存时处理（走网络，失败时用离线回退），都不会读写运行时缓存。
- 未重定向的 `200`、`basic` 响应；JSON 接口使用 `application/json` 或 `application/*+json`，动态页面使用 `text/html`。
- `Cache-Control` 不含 `private` 或 `no-store`；`Vary` 为空，或只含 `Accept`、`Accept-Encoding`。
- 响应正文不超过 `maxEntryBytes`。使用 SWR 时，还不能带 `no-cache`、`must-revalidate`、`max-age=0` 或 `s-maxage=0`。

不符合条件的响应仍会正常交给页面，但不会进入平台缓存。建议公共接口明确返回适当的公共缓存头，并在上线前用真实响应核对，而不是只检查前端策略。

没有进入缓存时，到浏览器开发者工具中打开 Service Worker 的控制台，查找以 `[pwa-platform] runtime cache did not store` 开头的警告：它写明被拒绝的路径（不含查询串）和原因（`response-type`、`status`、`redirected`、`content-type`、`cache-control`、`vary`、`size`）。同一个缓存、同一种原因，在 worker 的一次生命周期内只提示一次。

::: warning 本地用 `vite preview` 验收时
`vite preview` 和 `vite dev` 默认给每个响应加上 `Vary: Origin`，它不在允许的 `Vary` 字段内，因此本地预览时公共读取缓存不会写入，控制台会出现 `vary (Vary: Origin)` 警告。这是本地服务器的行为，不代表生产环境有问题：可以在本地的接口中间件里移除 `Vary` 头后再验证，并以最终部署地址的真实响应头为准。
:::

::: danger 业务必须证明内容确实公开
同源请求通常会携带 Cookie，而平台不据此判断内容是否公开。Service Worker 也读不到响应中的 `Set-Cookie`。被规则覆盖的接口不能按用户、会话或权限返回不同内容，也不应设置 Cookie；若可能产生私有响应，服务端必须返回 `Cache-Control: private`，并从公共规则中移除该路径。不要让含一次性 `token`、`code` 等查询参数的 URL 落入可执行规则，缓存键会包含查询串。
:::

## `served-from-cache` 事件

只有响应确实由运行时缓存提供时才会发出；网络响应、预缓存命中和离线降级页都不会触发它。事件沿用生命周期事件信封：

~~~ts
{
  version: 1,
  type: "served-from-cache",
  timestamp: string,          // ISO 8601
  appId: string,
  metadata: {
    url: string,               // 同源路径 + 查询串，不含 origin 与片段
    cachedAt: number,           // 写入时间，epoch 毫秒
    reason: "network-failed" | "network-timeout" | "stale-while-revalidate",
  },
}
~~~

Vue、React 绑定不暴露 `subscribe`（`usePwa()` 的返回值里没有它），要监听该事件，需要自己用 `@pwa-platform/client-runtime` 创建 client，再把它交给绑定，绑定会接管这个 client 并在卸载时释放。Vue 示例：

~~~ts
// src/main.ts
import config from "virtual:pwa-config";
import { createPwaClient } from "@pwa-platform/client-runtime";
import { createPwa } from "@pwa-platform/vue";
import { createApp } from "vue";
import App from "./App.vue";

const client = createPwaClient({ config });

client.subscribe((event) => {
  if (event.type === "served-from-cache") {
    // event.metadata.url、cachedAt、reason；上报前先去掉查询串
  }
});

createApp(App).use(createPwa({ config, client })).mount("#app");
~~~

React 同理：`<PwaProvider config={config} client={client}>`。`createPwaClient` 只能在浏览器环境调用；`subscribe` 返回取消订阅函数。传入 `client` 时**不能**再同时传 `updateCheck`，否则创建绑定时抛错；需要定时检查更新时，在 `createPwaClient({ config, updateCheck: { intervalMs: 1_800_000 } })` 上设置。

若某次页面导航是由运行时缓存回答的，新页面收到这条消息时可能还没来得及注册监听器；worker 会暂存该次导航的信号，`register()` 成功后 client-runtime 会主动查询一次，因此监听器建立得晚也不会错过。但暂存不是永久的：最多保留 16 条待取记录，每条 30 秒后过期，worker 重启也会丢失，业务不应假设这个事件一定能等到。`metadata.url` 可能带用户输入的查询串，转发到遥测系统前应去掉或做脱敏处理。

::: warning 破坏性变更：穷举 `reason`／事件类型的代码需要改
`served-from-cache` 同时加入了 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`。如果业务代码对事件类型或 `reason` 做了穷举 `switch`（例如末尾用 `default` 断言 `never`），升级后会因为少处理这个新分支而编译失败，需要自己补上对应分支。
:::

## 离线与更新行为

`network-first` 在线时先取网络，网络失败时才尝试尚未过期的缓存；弱网请求一直挂起时，默认不会自动回退。需要限时回退可另设 `networkTimeoutSeconds: 5`，范围为 1–30 秒。SWR 只用于公共数据，可能先返回旧值并在后台更新，业务界面应容忍短暂旧数据。

- 网络返回 4xx／5xx 时，响应原样交给页面，不会因此改用缓存中的旧值。
- 公共数据请求断网且缓存未命中时，页面得到的是网络错误，不会显示离线页（离线页只用于导航）。
- 带 `Range` 头的请求直接透传网络，不读写运行时缓存。

用户登出、worker 激活和异常恢复各有平台缓存清理流程，但不能把它们当作内容分类错误的补救措施。登出的具体范围与限制见下一节。`logout()` 在 `runtimeCache.enabled: true` 时，任一项清理失败都会让它解析为 `false` 并保留 registration，业务照旧检查返回值即可，不需要额外包 `try/catch`。上线时至少验证：在线访问公共接口、断网重试命中缓存、私有响应不入缓存，以及重新部署后的数据更新。

## 登出与共享设备

平台**不会**检测用户是否登出。应用在自己的登出流程里调用 `usePwa()` 返回的 `logout()`：它先清空离线写入队列和全部运行时缓存（当前摘要的数据缓存也不保留），再注销 Service Worker registration。它**不会**清除预缓存、浏览器 HTTP 缓存、Cookie 或应用自己的存储，这些仍要业务自行处理。

`logout()` 在以下情况返回 `false`，表示没有完成清理：

- 页面没有被该 worker 控制（`navigator.serviceWorker.controller` 为空，例如首次访问或强制刷新后）；
- worker 在 10 秒内没有确认清理完成，或清理失败；
- 该 scope 下没有 registration（此时 facade 也会丢弃自己持有的旧状态）。

成功注销后，绑定里的 `registered`、`updateWaiting` 等状态不会被重置。同一页面下次登录后需要重新调用 `register()`。共享设备上，登出流程应检查返回值，返回 `false` 时提示用户或采取业务侧的补救措施，因为公共读取缓存里的数据仍可能留在设备上。

## 已知限制

- **回滚残留**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会删除这些缓存；它们不会被读取，但会一直占用空间，直到恢复 worker 或下一次 v3 激活清理它们。
- **配额错误时清空全部运行时缓存**：写入触发 `QuotaExceededError` 时，两个运行时缓存都会被清空以回收空间，不只是出错的那一个；预缓存不受影响，页面收到的响应不受影响。无论本次 worker 启动以来是否访问过某个运行时缓存，它都会被清空（平台在 worker 启动时统一注册配额清理，不依赖运行时引擎是否已经创建）。如果此刻有新 worker 正在安装（registration 存在 installing worker），配额清理会被跳过，避免新版本自己预缓存写入超额时误删仍在服务旧版本的运行时缓存（0.2.3 起）。
- **清理与进行中的写入存在竞态**：登出或新 worker 激活清理时，如果某个读取的写入（例如 SWR 的后台更新、旧 worker 仍在处理的导航）恰好在清理之后才落盘，Workbox 会把刚删掉的缓存重新建出来；激活时这可能写回旧版本的 HTML。残留会在下一次激活、登出或条目过期时清掉，业务不需要额外处理，但不应假设清理是瞬时、绝对干净的。

::: warning Nuxt 暂不支持
`@pwa-platform/nuxt` 目前是工作区私有包，尚未发布到 npm。它在构建期收到 `runtimeCache.enabled: true` 的 v3 策略时，会以诊断码 `nuxt.runtime-cache-unsupported` 明确失败，而不是静默忽略；`enabled: false` 的 v3 策略可以正常构建。
:::
