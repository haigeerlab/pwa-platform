# 公共读取缓存

`PwaPolicy v3` 允许业务把**经过评审的公共读取**交给平台做运行时缓存。它只处理明确匹配的同源 `GET` 请求；第一次成功取得网络响应之前，离线时仍没有数据可返回。私有接口、个性化 HTML、写请求和未分类请求不能因此改成公共类别。

## 开启与配置

在[基础身份配置](/guide/configuration)不变的前提下，将策略升为 v3。下面保留了应用壳与离线页的规则，并只给公共目录接口增加运行时缓存：

~~~ts
import type { PwaPolicy } from "@pwa-platform/contracts";

export const POLICY: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
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

仍需在 Vite 插件中启用 `offlinePage: {}`，并保证业务接口路径与实际部署的 `mountPath` 一致。策略的 `pathPrefix` 是相对 `mountPath` 的路径，不要重复写挂载前缀。

`maxEntries` 可设为 1–200，按动态页面与公共数据两个缓存分别计数；`maxEntryBytes` 为 1–1,048,576 字节；`maxAgeSeconds` 为 60–604,800 秒。三项都没有默认值。若要关闭 v3 运行时缓存，设置 `enabled: false`，同时将三项上限全部设为 `0`。

::: warning 已上线的 v1／v2 应用不需要任何改动，但 worker 产物不是逐字节不变
请求判断不会因为升级平台包而改变——只有显式声明 <code>schemaVersion: 3</code> 且 <code>runtimeCache.enabled: true</code> 才会开始运行时缓存。但**从这一版本起，平台 worker 静态引入了运行时缓存引擎，所有应用（包括 v1、v2 和未开启的 v3）的 worker 产物都会多出 <code>workbox-strategies</code>、<code>workbox-expiration</code> 两个模块（约 50 KB，未压缩）**，worker 配置也多出一个 <code>runtimeCache</code> 字段（未启用时只带两个缓存名）。新 worker 激活与登出时会尽力删除本应用的运行时缓存与过期记录，通常两者都不存在。
:::

## 可用的规则

| 资源类别 | 可执行策略 | 用途 |
| --- | --- | --- |
| `public-data` | `network-first`、`stale-while-revalidate` | 公共 JSON 读取 |
| `navigation-public-dynamic` | 仅 `network-first` | 不因用户身份变化的公共动态 HTML |

`cache: "none"` 仍透传。给上述类别配置 `cache-first`，或给公共动态 HTML 配置 `stale-while-revalidate`，会以 `compile.runtime-strategy-unsupported` 阻止构建。动态 HTML 不提供 SWR，因为旧 HTML 可能引用已被移除的指纹资源。

| 诊断码 | 严重度 | 含义与修复 |
| --- | --- | --- |
| `compile.runtime-strategy-unsupported` | 构建失败 | 某条规则声明的资源类别与 `cache` 组合不在可执行范围内（例如给 `navigation-public-dynamic` 配 `cache-first` 或 SWR）；把 `cache` 改成上表允许的策略 |
| `compile.runtime-cache-unused` | 警告，不阻塞构建 | `runtimeCache.enabled: true`，但没有任何规则落在可执行的组合里；多半是开了开关却忘了把某条规则的 `cache` 改成 `network-first` 或 `stale-while-revalidate` |

## 响应必须满足的条件

平台只会把同时满足以下条件的网络响应写入运行时缓存：

- 同源 `GET`；公共数据请求不能带 `Authorization` 请求头。
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

订阅方式与其他生命周期事件相同：`pwa.subscribe((event) => { if (event.type === "served-from-cache") { ... } })`。Vue、React 绑定本身不新增公开状态或方法，一律通过 client-runtime 的 `subscribe` 接口订阅。

若某次页面导航是由运行时缓存回答的，新页面收到这条消息时可能还没来得及注册监听器；worker 会暂存该次导航的信号，`register()` 成功后 client-runtime 会主动查询一次，因此监听器建立得晚也不会错过。但暂存不是永久的：最多保留 16 条待取记录，每条 30 秒后过期，worker 重启也会丢失，业务不应假设这个事件一定能等到。`metadata.url` 可能带用户输入的查询串，转发到遥测系统前应去掉或做脱敏处理。

::: warning 破坏性变更：穷举 `reason`／事件类型的代码需要改
`served-from-cache` 同时加入了 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`。如果业务代码对事件类型或 `reason` 做了穷举 `switch`（例如末尾用 `default` 断言 `never`），升级后会因为少处理这个新分支而编译失败，需要自己补上对应分支。
:::

## 离线与更新行为

`network-first` 在线时先取网络，网络失败时才尝试尚未过期的缓存；弱网请求一直挂起时，默认不会自动回退。需要限时回退可另设 `networkTimeoutSeconds: 5`，范围为 1–30 秒。SWR 只用于公共数据，可能先返回旧值并在后台更新，业务界面应容忍短暂旧数据。

用户登出、worker 激活和异常恢复各有平台缓存清理流程，但不能把它们当作内容分类错误的补救措施。`logout()` 在 `runtimeCache.enabled: true` 时，任一项清理失败都会让它解析为 `false` 并保留 registration，业务照旧检查返回值即可，不需要额外包 `try/catch`。上线时至少验证：在线访问公共接口、断网重试命中缓存、私有响应不入缓存，以及重新部署后的数据更新。

## 已知限制

- **回滚残留**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会删除这些缓存；它们不会被读取，但会一直占用空间，直到恢复 worker 或下一次 v3 激活清理它们。
- **配额错误时清空全部运行时缓存**：写入触发 `QuotaExceededError` 时，两个运行时缓存都会被清空以回收空间，不只是出错的那一个；预缓存不受影响，页面收到的响应不受影响。但只有本次 worker 启动以来被读写过的运行时缓存会被清——worker 重启后还没被访问过的那个，这次不会被清，腾出的空间可能少于预期。
- **清理与进行中的写入存在竞态**：登出或新 worker 激活清理时，如果某个读取的写入（例如 SWR 的后台更新、旧 worker 仍在处理的导航）恰好在清理之后才落盘，Workbox 会把刚删掉的缓存重新建出来；激活时这可能写回旧版本的 HTML。残留会在下一次激活、登出或条目过期时清掉，业务不需要额外处理，但不应假设清理是瞬时、绝对干净的。

::: warning Nuxt 暂不支持
`@pwa-platform/nuxt` 收到 <code>runtimeCache.enabled: true</code> 的 v3 策略时，会在构建期以诊断码 <code>nuxt.runtime-cache-unsupported</code> 明确失败，而不是静默忽略；`enabled: false` 的 v3 策略可以正常构建。
:::
