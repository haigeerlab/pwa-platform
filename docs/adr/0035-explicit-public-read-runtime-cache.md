# ADR-0035：显式开启的公共读取运行时缓存

## 状态

已接受（2026-09-24，项目所有者）。服务 [public-read-cache](../../spec/public-read-cache.md)，交付路线图 v1.1 cache。修订 [ADR-0008](0008-cache-namespace-and-identity-baseline.md)（缓存 kind）、[ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md)（请求判断表中"平台没有运行时缓存"的结论）、[ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md)（页面事件集合）三处结论，见"对既有 ADR 的修订"。

## 背景

平台 worker 目前只写预缓存。策略里其实已经能声明运行时策略：`PwaResourceRule.cache` 接受 `network-first` 与 `stale-while-revalidate`，编译器对非拒绝类原样保留，但 worker 对未预缓存的允许请求一律透传。现有应用确实声明过这些策略，示例应用的根路径就是 `navigation-public-static` + `network-first`（`packages/examples-browser-e2e/apps/shared/identity.ts:61`）。

因此，只要 worker 开始执行已有字段，所有已上线应用在升级平台后就会静默开始运行时缓存。公共读取缓存必须是显式开启、单独评审的能力。

安全模型原先要求运行时缓存从显式 allowlist 开始，只准入同源 `GET`，准入前评估 `Vary`、凭据模式、响应头与配额（[安全模型](../architecture/security-model.md)）。其中"凭据模式"一项的处理见下文"不按请求凭据模式判断"。

## 决策

### 显式开启：`PwaPolicy v3`

- 新增 `schemaVersion: 3`。它在 v2 字段之外加必填的 `runtimeCache`：`enabled`，以及三项上限 `maxEntries`（1–200）、`maxEntryBytes`（1–1 048 576）、`maxAgeSeconds`（60–604 800）。`enabled=false` 时三项上限都为 0。
- v1、v2 策略继续被接受，**请求判断不变**：其中声明的运行时策略照旧透传。v3 且 `enabled=false` 时同样透传。
- **对 v1/v2 应用的非请求判断影响**（2026-09-24 T13 评审后修订，项目所有者决定；原稿写的是"逐字节不变"，不成立）：平台 worker 静态引入了运行时缓存引擎，所有应用的 worker 产物多出 `workbox-strategies`、`workbox-expiration` 两个模块（约 50 KB，未压缩）；worker 配置多出 `runtimeCache` 字段（未启用时只带两个缓存名）；新 worker 激活与登出时，会删除本应用的运行时缓存与 `workbox-expiration` 记录（通常都不存在）。为了不给 v1/v2 与未启用的应用带来新的登出失败方式，**未启用运行时缓存时，登出中的运行时清理是尽力而为**，失败不阻止登出；启用时仍然阻断。
- 只有两类资源可以执行运行时策略：`public-data` 可以用 `network-first` 或 `stale-while-revalidate`；`navigation-public-dynamic` 只能用 `network-first`。其余组合在 `enabled=true` 时报 `compile.runtime-strategy-unsupported`。`asset`、`navigation-public-static` 维持现状，四类拒绝分类仍编译为 `deny`。
- `PwaPlan v3` 增加闭合字段 `runtimeCache`，包括上限和 `configDigest`。`configDigest` 是对规范化后的上限与可执行规则计算的 FNV-1a 64 位摘要，输出 16 位十六进制。它**不是密码学摘要**，只用来判断缓存是否作废；碰撞的后果是旧数据留到过期，而且读取总要先经过当前规则的判断。

### 请求判断与响应准入

- 运行时缓存排在现有判断之后：拒绝基线 → `exclude` / `deny` → 预缓存 → `Range` 透传，之后才是运行时缓存。带 `Authorization` 请求头的请求透传。缓存键是包含查询串的完整 URL。
- 只有同时满足以下条件的响应才写入：`type` 为 `basic`、状态 200、没有重定向；MIME 为 JSON（`public-data`）或 `text/html`（`navigation-public-dynamic`）；`Cache-Control` 不含 `no-store`、`private`（SWR 下还不得含 `no-cache`）；`Vary` 为空或只含 `Accept`、`Accept-Encoding`；正文不超过 `maxEntryBytes`。不满足时响应照常交给页面，只是不写入。
- 准入是 sw-runtime 里的零依赖纯函数。引擎只接受平台定义的 `admit` 回调，不暴露 Workbox 插件、策略类或选项。
- **SWR 下还拒绝要求重新验证的响应**（2026-09-24 T13 评审后收紧，项目所有者决定）：`Cache-Control` 含 `must-revalidate`，或 `max-age=0`、`s-maxage=0` 时，SWR 规则不写入。理由与拒绝 `no-cache` 相同：SWR 会不经验证直接交出缓存。network-first 不受影响。
- **不按请求凭据模式判断**（2026-09-24 T13 评审后补记）：同源请求默认携带 Cookie，按 `request.credentials` 判断会让运行时缓存对几乎所有请求失效，因此平台不做这项判断。依靠 Cookie 做个性化、却没带 `private` 的响应会被写入，这是业务分类的责任，由接入指南明确要求。
- **`Set-Cookie` 由业务负责，平台不检查。** Fetch 规范把 `Set-Cookie` 列为 forbidden response-header name，worker 读不到它（探路 1）。规则覆盖的路径不得设置 Cookie；如果确实会设置，响应必须同时带 `Cache-Control: private`，由准入条件拦下。

### 执行、时效与配额

- 用 `workbox-strategies@7.4.1` 的 `NetworkFirst`、`StaleWhileRevalidate`，以及 `workbox-expiration@7.4.1` 的 `ExpirationPlugin`，封装在引擎端口之后。`workbox-expiration` 带进传递依赖 `idb@7.1.1`。
- **存活时间以平台自己记录的写入时间为准。** 写入缓存副本时附加内部头 `x-pwa-platform-cached-at`；读取时先校验存活时间，过期视为不存在并删除，未过期则**剥离该头**后交给页面。`ExpirationPlugin` **不配置** `maxAgeSeconds`：配置后它会在读取时按服务端 `Date` 头一票否决，CDN 缓存过的响应（`Date` 早已过去）即使刚写入也会被拒绝。过期条目在读取时由平台删除，从未再读取的条目由 `maxEntries` 淘汰。（2026-09-24 实施修订，原稿写的是"同时开启 `maxAgeSeconds`"；T6 浏览器测试"Date 头不参与判断"钉住此行为。）
- 条目数超过 `maxEntries` 时，由 `ExpirationPlugin` 淘汰最久未使用的条目：读取会刷新时间戳（探路 2）。
- **配额错误时清空全部运行时缓存。** `purgeOnQuotaError` 的回调是全局注册的：任何一次缓存写入遇到 `QuotaExceededError`，所有启用该选项的缓存都会被删除，而不只是出错的那一个（探路 2）。平台接受这个行为，并据此把规格里"清空该运行时缓存"修正为"清空全部运行时缓存"。预缓存不使用该插件，不受影响。写入失败从不影响交给页面的响应。

### 缓存命名与清理

- 新增两个缓存 kind，都在 `cacheNamespacePrefix` 之下，因此仍在 `appCachePrefix` 之下：
  - `runtime-pages`：动态 HTML。每次新 worker 激活都整体删除，避免旧版本 HTML 引用已被移除的带哈希资源。
  - `runtime-data`：公共数据。缓存名为 `<cacheNamespacePrefix>runtime-data-<configDigest>`。激活时删除当前前缀下 digest 不同的 `runtime-data` 缓存。
- 新 worker 激活时，如果 `runtimeCache.enabled=false`，删除当前前缀下全部运行时缓存。
- 恢复 worker 删除 `appCachePrefix` 下的全部缓存，已经覆盖两个运行时 kind。
- **过期记录与缓存一起清理**（2026-09-24 检查点 C 修订，项目所有者决定）：`workbox-expiration` 把每个条目的"缓存名|URL"与时间戳记在全源共享的 IndexedDB 库 `workbox-expiration`（对象仓库 `cache-entries`，字段 `cacheName`）中，`caches.delete` 不会清掉它们。因此激活、登出、恢复 worker 三条清理路径在删除缓存之后，都要删除对应缓存名的记录：激活与登出删除与被删缓存同名的记录；恢复 worker 删除 `cacheName` 以 `appCachePrefix` 开头的记录，不碰其他应用或非平台的记录。库不存在时不创建它。
  - 实现放在 sw-runtime，用原生 IndexedDB，由平台 worker 与恢复 worker 共用。恢复 worker 保持"不导入任何包"。
  - 这让 sw-runtime 依赖 `workbox-expiration@7.4.1` 的内部库结构。一个真实浏览器测试先让 Workbox 写入记录，再验证按前缀删除；Workbox 升级改变结构时它会失败。
  - 登出时删除记录失败与删除缓存失败同样处理：不回 `cleared`，保留 registration。恢复 worker 中删除记录是尽力而为：失败不阻止接管，因为记录不含响应内容，而恢复的首要目标是让坏 worker 停止控制页面。
- **登出复用离线写清理握手。** 消息名 `pwa:offline-write:clear` 不变，worker 在回 `cleared` 之前同时删除全部运行时缓存；任何一项删除失败都不回 `cleared`，client-runtime 因此拒绝登出并保留 registration。client-runtime 的登出逻辑不改。

### 页面信号：`served-from-cache`

- client-runtime 新增页面事件 `served-from-cache`，只在响应确实由运行时缓存提供时发出。**沿用现有的生命周期事件信封**（2026-09-24 检查点 C 后，项目所有者确认）：`{ version: 1, type: "served-from-cache", timestamp, appId, metadata: { url, cachedAt, reason } }`。`url` 是同源路径加查询串，`cachedAt` 是写入时间（epoch 毫秒），`reason` 是 `network-failed` 或 `stale-while-revalidate`。`served-from-cache` 同时加入 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`，业务与 Vue/React 只需订阅同一个事件接口。
  - **转发提醒**：信封的约定是"不含敏感数据"，业务可能把生命周期事件整体转发到遥测。`metadata.url` 含查询串，查询串可能带有用户输入（例如搜索词）。平台自己不记录、不上报它；接入文档必须提醒业务在转发前去掉 `metadata.url`。
- **子资源**：worker 直接向 `event.clientId` 发消息（探路 5 确认送达）。
- **导航**：worker 以 `resultingClientId` 暂存一条待取记录（上限 16 条、30 秒过期），client-runtime 初始化时发一次查询取走。worker 用查询消息的 `source.id` 匹配，实测与 `resultingClientId` 一致（探路 4）。**不向导航页面直接发消息**：新页面在消息之后才开始监听时，直接发送的消息会丢失，即使之后调用 `startMessages()` 也收不到（探路 4）。只用查询一种方式，页面也就不用去重。
- Vue/React 的 `reduce` 对事件类型做了穷举检查，两个包各补一个不改变状态的分支。业务代码如果也这样穷举，升级后会编译失败，迁移指南要写明。

## 已知限制

- **回滚残留**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会删除运行时缓存。这些缓存不会被读取，但会占用空间，直到恢复 worker 或下一次 v3 激活。发布与事故手册要写明处置办法。
- ~~**不做网络超时**~~：2026-09-24 由 [ADR-0038](0038-network-timeout.md) 解除。策略写了 `networkTimeoutSeconds` 时，network-first 在超时后使用缓存；未写时仍一直等待。
- **动态 HTML 不用 SWR**：SWR 在线时会直接交出旧 HTML，而它引用的带哈希资源可能已随新版本移除。
- **`Set-Cookie` 无法检查**：只能依靠业务约定和 `Cache-Control: private` 兜底。
- **清理与进行中的写入竞态**（2026-09-24 T13 评审后补记，项目所有者决定记为已知限制）：登出或新 worker 激活清理时，如果某个读取的写入（例如 SWR 的后台更新、旧 worker 仍在处理的导航）恰好在清理之后才落盘，Workbox 会把刚删掉的缓存重新建出来。激活时这可能写回旧版本的 HTML。残留会在下一次激活、登出或过期时清掉。
- **查询串里的一次性凭据**：缓存键包含查询串。`navigation-public-dynamic` 规则覆盖的页面如果通过 `?token=`、`?code=` 这类 URL 访问，这个 URL 会连同页面一起存入缓存，直到登出、过期或被淘汰。这类页面不应配成可执行规则。
- **配额错误会一并清空两个运行时缓存**，见上文。但 `ExpirationPlugin` 只清理本次 worker 启动以来它读写过的缓存：worker 重启后尚未被访问的运行时缓存，在配额错误时不会被清。结果只是腾出的空间可能少于预期，不会返回错误内容。（2026-09-24 T6 实施时发现。）

## 对既有 ADR 的修订

- **ADR-0008**：缓存 kind 从只有 `precache` 扩展为 `precache`、`runtime-pages`、`runtime-data`；命名空间前缀和恢复 worker 的删除范围不变。
- **ADR-0012**：恢复 worker 的删除范围在"本应用的全部缓存与离线写数据库"之外，增加 `workbox-expiration` 库中本应用前缀的记录（尽力而为）。请求判断表中"平台 v1 没有运行时缓存，未预缓存的允许请求透传"只对 v1、v2 以及 v3 且 `enabled=false` 成立；v3 且 `enabled=true` 时按本 ADR 的顺序进入运行时缓存。平台 worker 的监听集合不变。
- **ADR-0013**：页面事件增加 `served-from-cache`。
- **ADR-0027 的一处过时表述**：它写着"旧 v1 policy/plan 会在构建或 worker 启动时明确拒绝"，但当前实现同时接受 v1 与 v2（`packages/contracts/src/validate.ts:191`、`packages/core/src/compile.ts:163`）。本 ADR 以实际实现为准，v3 同样不拒绝 v1/v2；ADR-0027 的文字另行更正。

## 影响

- 修改 contracts、core、engine-workbox、sw-runtime、client-runtime 的公开契约，以及 Vue/React 的内部 `reduce`。包仍是 beta，版本号按 [ADR-0028](0028-npm-prerelease-distribution.md) 的预发布规则处理。
- Vite 接受 v3；Nuxt 收到 `runtimeCache.enabled=true` 时以明确诊断失败。
- 新增两个运行时依赖，按 `docs/operations/dependency-changes.md` 登记。
- 安全模型、生命周期、契约文档、发布与事故手册、恢复演练、README 和迁移指南需要同步。

## 拒绝的方案

- **直接执行 v1/v2 中已声明的运行时策略：拒绝。** 已上线应用会在升级平台后静默开始缓存，示例应用的根路径就是这种情况。
- **给交给页面的响应加标记头：拒绝。** 它会改动业务看到的响应，页面信号改用事件。
- **只依赖 `ExpirationPlugin` 判断存活时间：拒绝。** 它的读取期判断依赖服务端 `Date` 头；探路中没有 `Date` 头的条目行为无法单独确定。
- **自己实现按缓存的配额清理，不用 `purgeOnQuotaError`：拒绝。** 只清一个缓存释放的空间更少，还要多维护一套配额逻辑。
- **导航事件用"直接发送 + 查询"双通道：拒绝。** 直接发送在页面晚于消息初始化时会丢失，而且会产生重复事件。

## 探路记录

2026-09-24，Chrome 153.0.8010.53 桌面端，Playwright 1.63.0，`workbox-strategies` / `workbox-expiration` 7.4.1，会话临时目录中的最小 worker 与本机服务器，代码不入库。

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | worker 能否读到同源响应的 `Set-Cookie` | **不能** | `headers.get("set-cookie")` 为 `null`，头名列表中也没有；同一响应的自定义头 `x-probe` 可见，`type` 为 `basic` |
| 2 | `maxEntries` 按什么淘汰；配额错误时的行为 | **最久未使用；全局清空** | 写入 a、b、c，读取 a 后写入 d，剩下 a、c、d（淘汰的是 b）。配额压到 300 000 字节后写入 900 KB 响应：页面照常拿到响应；两个启用 `purgeOnQuotaError` 的缓存都被删除 |
| 3 | 内部时间头能否只留在缓存副本里 | **可行** | 缓存副本带 `x-pwa-platform-cached-at`；页面拿到的响应没有该头；超过存活时间后自有校验拒绝返回 |
| 4 | 导航由缓存提供时如何把事件交给新页面 | **只有"暂存 + 查询"可靠** | 页面晚于消息开始监听时，直接发送的消息丢失（`startMessages()` 后仍为空）；页面查询时，worker 按 `source.id` 取到暂存记录，与 `resultingClientId` 一致 |
| 5 | 断网回退与 SWR 后台更新 | **可行** | `context.setOffline(true)` 对 worker 发出的请求同样生效，network-first 返回缓存并送达事件；SWR 连续三次读取依次得到 10、10、11，第二次由缓存提供并送达事件 |
