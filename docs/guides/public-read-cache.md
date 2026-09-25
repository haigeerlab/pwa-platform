# 公共读取缓存接入说明（v2 → v3）

`PwaPolicy v3` 新增 `runtimeCache`，让平台 worker 在断网或网络失败时，用最近一次成功的响应回答同源 `GET` 请求。它只覆盖**已评审为公共内容**的读取；决定见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)，契约细节见[规格](../../spec/public-read-cache.md)。

## 什么时候用，什么时候不用

只用于：

- `public-data`：你确认过是公共只读数据的 JSON 接口，例如商品目录、公开配置。
- `navigation-public-dynamic`：请求时渲染、但内容公开、不因登录状态变化的 HTML 页面。

**永远不要**用它缓存会话数据、个性化内容或鉴权后的数据。运行时缓存不做身份判断：它只检查响应的形状（状态码、`Content-Type`、`Cache-Control`、`Vary`），不知道也不检查这次请求背后是谁。分类是否正确，责任在业务，不在平台。

**平台不按请求的凭据模式判断（2026-09-24 T13 评审后补记）。** 同源请求默认携带 Cookie，如果平台按 `request.credentials` 判断，运行时缓存会对几乎所有请求失效，因此平台不做这项判断，见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)。这意味着：如果一个响应靠 Cookie 做个性化，却没有带 `Cache-Control: private`，它会被当成公共响应写入缓存——分类是否正确、要不要发 `private`，是业务的责任。

## 如何开启

策略升到 `schemaVersion: 3`，在 v2 字段之外新增必填的 `runtimeCache`：

```ts
import type { PwaPolicy } from "@pwa-platform/contracts";

export const POLICY: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  // v2 引入的字段，v3 下仍是必填；未启用时三项上限与 targets 都为空
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  resources: [
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
    { pathPrefix: "/pricing", resourceClass: "navigation-public-dynamic", cache: "network-first" },
  ],
  runtimeCache: {
    enabled: true,
    maxEntries: 100, // 1–200，每个运行时缓存（pages / data）各自计数
    maxEntryBytes: 262_144, // 1–1_048_576，单条响应正文字节上限
    maxAgeSeconds: 86_400, // 60–604_800，写入后可被读取的最长时间
  },
};
```

三项上限没有默认值，也没有"不限制"的写法；关闭时把 `enabled` 设为 `false`，三项上限必须都为 `0`。

### 资源分类 × 策略

`runtimeCache.enabled: true` 时，编译器按下表处理路径规则里的 `cache` 字段：

| 资源分类 | `none` | `network-first` | `stale-while-revalidate` | `cache-first` |
|---|---|---|---|---|
| `public-data` | 透传 | 执行 | 执行 | 报错 `compile.runtime-strategy-unsupported` |
| `navigation-public-dynamic` | 透传 | 执行 | 报错 `compile.runtime-strategy-unsupported` | 报错 `compile.runtime-strategy-unsupported` |
| `asset`、`navigation-public-static` | 维持现状（预缓存或透传） | 维持现状 | 维持现状 | 维持现状 |
| 四类拒绝分类（`session-data`、`mutation`、`stream`、`unclassified`） | `deny` | `deny` | `deny` | `deny` |

- **`compile.runtime-strategy-unsupported`**：某条规则声明的分类与策略组合不在可执行范围内（例如给 `navigation-public-dynamic` 配 SWR）。这是编译错误，构建失败。动态 HTML 不支持 SWR 是有意的：SWR 会在线时直接交出旧 HTML，而它引用的带哈希资源可能已随新版本从预缓存和宿主移除，页面会损坏。
- **`compile.runtime-cache-unused`**：`enabled: true` 但没有任何规则落在可执行的格子里。这是警告，不阻塞构建——多半是开了开关却忘了把某条规则的策略改成 `network-first` 或 `stale-while-revalidate`。

其余组合的运行时策略（`asset`、`navigation-public-static`，以及 `enabled: false` 时的一切）按今天的语义透传，不写入运行时缓存。

## v1/v2 不受影响，如何从 v2 迁移

**已上线的 v1/v2 应用不需要任何改动，请求判断不变**：即使它们的 `resources` 里已经写了 `network-first` 或 `stale-while-revalidate`（这类字段一直被接受，只是编译器原样保留、worker 从不执行），升级平台包版本也不会让它们开始运行时缓存——只有显式声明 `schemaVersion: 3` 且 `runtimeCache.enabled: true` 才会。

但**不是逐字节不变**（2026-09-24 T13 评审后修订，原文写的是"逐字节不变"，不成立）：平台 worker 静态引入了运行时缓存引擎，所有应用的 worker 产物都会多出 `workbox-strategies`、`workbox-expiration` 两个模块（约 50 KB，未压缩）；worker 配置多出 `runtimeCache` 字段（未启用时只带两个缓存名）；新 worker 激活与登出时，会（尽力而为地）删除本应用的运行时缓存与 `workbox-expiration` 记录，通常两者都不存在。详见 [ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)。

从 v2 迁移到 v3：

1. 把 `schemaVersion` 改成 `3`，新增必填的 `runtimeCache` 字段（`offlineWrites` 等 v2 字段保持不变）。
2. 给需要断网可用的公共读取规则，把 `cache` 改成 `network-first`（数据与动态页）或 `stale-while-revalidate`（仅数据）。
3. 如果你的代码里对 client-runtime 的事件类型做了穷举 `switch`（见下文"破坏性变更"），补上 `served-from-cache` 分支。
4. 重新构建；`compile.runtime-strategy-unsupported` 会指出哪些规则的组合不受支持。

## 响应准入与三个坑

只有同时满足以下条件的网络响应才会被写入缓存；不满足时响应照常返回给页面，只是不写入：

- `response.type === "basic"`、状态 `200`、**没有发生重定向**。
- `Content-Type` 对得上分类：`public-data` 要求 `application/json` 或 `application/<subtype>+json`；`navigation-public-dynamic` 要求 `text/html`。
- `Cache-Control` 不含 `no-store`、`private`；SWR 规则下还不得含 `no-cache`、`must-revalidate`，也不得是 `max-age=0` 或 `s-maxage=0`（2026-09-24 T13 评审后收紧：SWR 会不经重新验证直接交出缓存，理由与拒绝 `no-cache` 相同）。
- `Vary` 为空，或只含 `Accept`、`Accept-Encoding`。
- 正文不超过 `maxEntryBytes`。

几个容易踩的坑：

1. **`Set-Cookie` 平台看不到，业务必须自己兜底。** Fetch 规范把 `Set-Cookie` 列为 forbidden response-header name，`basic` 类型的响应连 worker 自己都读不到这个头（<https://fetch.spec.whatwg.org/#forbidden-response-header-name>）。平台**不承诺**能拦截带 `Set-Cookie` 的响应。规则覆盖的路径**不应该**设置 Cookie；如果确实会设置（例如复用了同一个中间件），响应必须**同时**带上 `Cache-Control: private`，由上一条规则拦下——否则这个响应会被当成公共数据缓存在这台浏览器里：同一浏览器之后的读取（断网时，或 SWR 规则下在线时）都会拿到它，直到登出、过期或被淘汰。运行时缓存不会跨浏览器共享，风险在同一设备上。
2. **重定向的响应不会被缓存。** 常见情况是链接指向 `/dashboard`，服务器 301/302 到 `/dashboard/`。`response.redirected` 为真的响应永远不写入；请把规则和链接都指向最终 URL，不要指向会跳转的地址。
3. **`no-cache`、`must-revalidate`、`max-age=0`、`s-maxage=0` 只挡 SWR，不挡 network-first。** SWR 会不经重新验证直接把缓存条目交给页面，因此这四种"要求重新验证"或"到达即过期"的信号在 SWR 规则下都会被拒绝写入；`network-first` 在线时总会先请求网络，它们对它没有影响，允许写入。
4. **一次性凭据不要放进可执行规则覆盖的 URL 查询串。** 运行时缓存的缓存键包含查询串。如果一个 `navigation-public-dynamic` 页面通过 `?token=`、`?code=` 这类一次性凭据访问，这个 URL 会连同页面一起被缓存，直到登出、过期或被淘汰——这类页面不应该配成可执行规则。

## `served-from-cache` 事件

只有响应**确实由运行时缓存提供**时才会发出，网络响应、预缓存命中和离线降级页都不会触发它。沿用现有的生命周期事件信封：

```ts
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
```

订阅方式与其他生命周期事件相同：

```ts
const unsubscribe = pwa.subscribe((event) => {
  if (event.type === "served-from-cache") {
    console.log(event.metadata.url, event.metadata.reason);
  }
});
```

Vue、React 绑定本期不新增公开状态或方法，一律通过 client-runtime 的 `subscribe` 接口订阅。

**导航场景下的送达时机，以及它不是无条件的。** 如果一次页面导航是由运行时缓存回答的，新页面在收到这条消息时可能还没来得及注册监听器。worker 因此把这次导航的信号暂存起来，client-runtime 在 `register()` 成功后会向 worker 查询一次"是否有为本次导航暂存的记录"，即使监听器建立得晚，也不会错过这个事件；不需要业务自己做任何补偿。

但这份暂存**不是永久的**：worker 最多保留 16 条待取记录（超出按最久未存入淘汰），每条 30 秒后过期，worker 重启（例如恰好在此时被回收）也会丢失它。如果页面在这次导航之后超过 30 秒、或经过了 16 次其他导航才调用 `register()`，这次 `served-from-cache` 事件就不会送达——业务不应该假设这个事件一定能等到。

**遥测转发提醒**：`metadata.url` 带查询串，查询串里可能含用户输入（例如搜索词）。平台自己不记录、不上报这个值。如果你把生命周期事件整体转发到遥测系统，转发前必须去掉 `served-from-cache` 的 `metadata.url`，或者只转发其中不含查询串的部分。

## 破坏性变更：穷举事件类型的代码需要改

`served-from-cache` 同时加入了 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`。如果你的代码对 `PwaClientEvent["type"]` 做了穷举 `switch`（例如末尾有一条 `default` 分支断言 `never`），升级后会因为少处理这个新类型而编译失败。Vue、React 绑定自己的 `reduce` 已经各补了一个不改变状态的分支；业务代码需要自己补上对应分支，哪怕只是忽略它。

## 缓存清理与已知限制

- **新 worker 激活**：`runtime-pages`（动态 HTML）整体删除；`runtime-data`（公共数据）只删除 `configDigest` 与当前规则不同的旧缓存——规则或上限一变，旧数据就作废，不需要手动处理。`runtimeCache.enabled: false` 时激活会删除当前应用前缀下的全部运行时缓存。
- **登出**：`logout()` 沿用离线写的清理握手，worker 在确认清理完成前删除全部运行时缓存。`runtimeCache.enabled: true` 时，任何一项删除失败都会让 `logout()` 解析为 `false`（不是抛出异常或拒绝的 Promise）并保留 registration——业务照旧检查返回值，而不是包一层 `try/catch`。`runtimeCache.enabled: false` 时，这项清理是尽力而为：失败不影响 `logout()` 成功，因为这类应用正常情况下本就没有运行时缓存需要删除（见下文"v1/v2 不受影响"），不应该因为这次新增的清理步骤多出一种登出失败的方式。
- **恢复 worker**：按 `appCachePrefix` 删除全部平台缓存时已经覆盖两个运行时 kind，不需要额外处理。
- **过期记录一并清理**：`workbox-expiration` 会把每个条目的写入时间记在浏览器一个全源共享的 IndexedDB 库里，单纯 `caches.delete` 不会清掉这些记录。上述三条清理路径（激活、登出、恢复）都会同时删除对应缓存名的过期记录，业务不需要关心这一层实现细节。

以下是本期已知且接受的限制（详见 ADR-0035"已知限制"）：

- **回滚残留**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会删除这些缓存。它们不会被读取，但会一直占用空间，直到恢复 worker 或下一次 v3 激活清理它们。
- **网络超时需要单独开启**：默认情况下弱网请求挂起时 `network-first` 会一直等待。在策略中写 `networkTimeoutSeconds` 后，超时即用缓存，`reason` 为 `network-timeout`，见[网络超时接入说明](network-timeout.md)。
- **动态 HTML 不支持 SWR**：见上文编译规则表。
- **配额错误时清空全部运行时缓存**：写入触发 `QuotaExceededError` 时，两个运行时缓存都会被清空以回收空间，不只是出错的那一个；预缓存不受影响，页面收到的响应不受影响。但只有本次 worker 启动以来被读写过的运行时缓存会被清：worker 重启后还没被访问过的那个，这次不会被清，腾出的空间可能少于预期。
- **清理与进行中的写入存在竞态**（2026-09-24 T13 评审后记为已知限制）：登出或新 worker 激活清理时，如果某个读取的写入（例如 SWR 的后台更新、旧 worker 仍在处理的导航）恰好在清理之后才落盘，Workbox 会把刚删掉的缓存重新建出来。激活时这可能写回旧版本的 HTML。残留会在下一次激活、登出或条目过期时清掉——业务不需要额外处理，但不应假设清理是瞬时、绝对干净的。
- **查询串里的一次性凭据**：见上文"几个容易踩的坑"第 4 条。
- **Workbox 升级需要复核**：清理过期记录的代码按 `workbox-expiration@7.4.1` 的库名、版本和字段写成，升级 Workbox 时可能需要跟着改。真正会在升级破坏该结构时失败的，是断言"清理前后真实存在的 Workbox 写入记录"的两个真实浏览器测试——`packages/sw-runtime/browser-tests/runtime-cache.spec.ts`（恢复 worker）与 `packages/client-runtime/browser-tests/served-from-cache.spec.ts`（登出）；它们失败说明记录结构变了，清理代码要随之修改，否则登出与恢复会一直失败。

## Nuxt：暂不支持

`@pwa-platform/nuxt` 收到 `runtimeCache.enabled: true` 的 v3 策略时，会在构建期以诊断码 `nuxt.runtime-cache-unsupported` 明确失败，而不是静默忽略。`runtimeCache.enabled: false` 的 v3 策略与未启用离线写的 v2 策略一样正常构建。
