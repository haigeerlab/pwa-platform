# 同一份产物部署到多个域名

此模式适用于构建时还不知道最终 HTTPS 域名，但希望把**同一份字节**部署到多个域名的 Vite + Vue／React 宿主。已有固定域名项目继续使用[固定身份配置](/guide/configuration)，不会因漏填 `origin` 自动切换。

::: tip 版本状态
npm `0.3.0` **已支持** `deployment: { kind: "portable" }`、`PwaPortableIdentity` 和 v4 构建计划。使用旧版 `0.2.5` 时请按[固定身份配置](/guide/configuration)接入。
:::

## 配置

~~~ts
import type { PwaPortableIdentity, PwaPolicyV3 } from "@pwa-platform/contracts";
import { pwa } from "@pwa-platform/vite";

const identity: PwaPortableIdentity = {
  appId: "businessapp", manifestId: "/", scope: "/",
  serviceWorkerUrl: "/sw.js", manifestUrl: "/manifest.webmanifest",
  mountPath: "/", environment: "production", cacheNamespaceSeed: "r1",
};

const policy: PwaPolicyV3 = {
  schemaVersion: 3, install: { enabled: false }, updateMode: "prompt",
  offlineFallback: { enabled: true, path: "/offline.html" },
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
};

export default {
  base: "/",
  plugins: [pwa({ deployment: { kind: "portable" }, identity, policy,
    install: null,
    topology: { kind: "standalone-origin" }, offlinePage: {} })],
};
~~~

示例关闭安装，只展示模式和路径；宿主还须在 `public/manifest.webmanifest` 提供身份所指的清单，否则构建会因文件缺失而失败。要让平台生成安装清单，须填入[安装元数据](/guide/configuration)中的真实名称与四种图标，同时将 `policy.install.enabled` 设为 `true`。使用 `offlinePage: {}` 时，平台在 `/offline.html` 生成离线页；启用回退且文件存在、未被拒绝时，编译器会自动预缓存它，无需额外的离线页 `asset` 规则。公共导航规则使未缓存的导航在网络失败时能够回退到该页。若删掉导航规则，未分类导航会直接透传，断网时即使离线页已经生成也不会显示；已缓存的 `/index.html` 可作为应用壳打开，但这不表示所有动态内容或 SPA 深链都可离线访问。服务端返回 HTTP 错误响应也不等同于网络失败。可移植模式目前要求 v3 策略；固定模式继续接受 v1–v3。

`PwaPortableIdentity` 没有 `origin`，`manifestId` 必须是根绝对路径。构建计划为 v4，保留 `policyVersion: 3`；v1–v3 计划仍按固定域名解释。平台生成的 manifest、worker、恢复 worker、离线页、虚拟模块和链接都使用同源根绝对路径。完整 URL 的 Vite `base`、manifest 链接或平台路径配置会使构建失败。宿主业务代码、第三方插件自行写入的完整 URL 属于宿主审查范围：检查构建产物、请求和浏览器记录，不能把平台校验说成对任意业务 URL 的保证。

同一源有 PC `/` 与 H5 `/m/` 时，两应用都使用可移植配置，并共享 `PwaPortableOriginRegistry` v2（无 origin）；根应用先发布，且根 worker 排除 `/m/`，再发布子应用。两个域名必须各自完成这个顺序，A 的线上根计划不能证明 B 已准备好。

## 每个域名的发布验收

外部发布编排器在每个实际目标 HTTPS origin 上分别采集 manifest、worker、恢复 worker、离线页、HTML、预缓存和保留资源的最终响应 URL、HTTP 状态码与响应头，跟随重定向后记录最终结果。调用 `verifyRelease` 时带本次 `deployment: { targetOrigin, responses }`，其中每条响应包含 `{ finalUrl, status, headers }` 且状态码须为 200；`requiredReleaseChecks(plan)` 会把 `deployment-origin` 列为必需检查，随后用 `verifyReleaseGateCoverage(report, requiredReleaseChecks(plan))` 核对覆盖，并单独检查 `report.ok`。只传域名字符串、漏掉响应、返回 204/404 或把 A 的响应当 B 的证据都不能通过。证据的真实采集与完整发布历史由外部编排器负责。

以 `appId + 实际 origin + environment + slot` 独立保存身份基线、完整历史、旧资源保留清单和首次发布批准。每个域名分别用真实浏览器核对注册、受控、安装、离线、更新和恢复；浏览器本身按同源隔离 Service Worker 与存储。固定域名迁入可移植模式是身份迁移，须按[发布流程](/operations/release)审批，不能把旧安装状态自动当作新模式验收结果。
