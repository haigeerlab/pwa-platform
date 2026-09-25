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

`maxEntries` 可设为 1–200，按动态页面与公共数据两个缓存分别计数；`maxEntryBytes` 为 1–1,048,576 字节；`maxAgeSeconds` 为 60–604,800 秒。三项都没有默认值。若要关闭 v3 运行时缓存，设置 `enabled: false`，同时将三项上限全部设为 `0`。v1、v2 策略不会因升级平台包而自动开启此能力。

## 可用的规则

| 资源类别 | 可执行策略 | 用途 |
| --- | --- | --- |
| `public-data` | `network-first`、`stale-while-revalidate` | 公共 JSON 读取 |
| `navigation-public-dynamic` | 仅 `network-first` | 不因用户身份变化的公共动态 HTML |

`cache: "none"` 仍透传。给上述类别配置 `cache-first`，或给公共动态 HTML 配置 `stale-while-revalidate`，会以 `compile.runtime-strategy-unsupported` 阻止构建。动态 HTML 不提供 SWR，因为旧 HTML 可能引用已被移除的指纹资源。

## 响应必须满足的条件

平台只会把同时满足以下条件的网络响应写入运行时缓存：

- 同源 `GET`；公共数据请求不能带 `Authorization` 请求头。
- 未重定向的 `200`、`basic` 响应；JSON 接口使用 `application/json` 或 `application/*+json`，动态页面使用 `text/html`。
- `Cache-Control` 不含 `private` 或 `no-store`；`Vary` 为空，或只含 `Accept`、`Accept-Encoding`。
- 响应正文不超过 `maxEntryBytes`。使用 SWR 时，还不能带 `no-cache`、`must-revalidate`、`max-age=0` 或 `s-maxage=0`。

不符合条件的响应仍会正常交给页面，但不会进入平台缓存。建议公共接口明确返回适当的公共缓存头，并在上线前用真实响应核对，而不是只检查前端策略。

::: danger 业务必须证明内容确实公开
同源请求通常会携带 Cookie，而平台不据此判断内容是否公开。Service Worker 也读不到响应中的 `Set-Cookie`。被规则覆盖的接口不能按用户、会话或权限返回不同内容，也不应设置 Cookie；若可能产生私有响应，服务端必须返回 `Cache-Control: private`，并从公共规则中移除该路径。不要让含一次性 `token`、`code` 等查询参数的 URL 落入可执行规则，缓存键会包含查询串。
:::

## 离线与更新行为

`network-first` 在线时先取网络，网络失败时才尝试尚未过期的缓存；弱网请求一直挂起时，默认不会自动回退。需要限时回退可另设 `networkTimeoutSeconds: 5`，范围为 1–30 秒。SWR 只用于公共数据，可能先返回旧值并在后台更新，业务界面应容忍短暂旧数据。

用户登出、worker 激活和异常恢复各有平台缓存清理流程，但不能把它们当作内容分类错误的补救措施。上线时至少验证：在线访问公共接口、断网重试命中缓存、私有响应不入缓存，以及重新部署后的数据更新。

拥有源仓库访问权限的平台维护者可查看[实现边界与已知限制](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/public-read-cache.md)；业务接入所需的配置、准入与验收条件以上述内容为准。
