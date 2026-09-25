# 身份、安装信息与策略

接入时需要提交三组信息：<code>PwaIdentity</code> 确定应用及 URL 所有权，<code>PwaInstallMetadata</code> 确定安装展示，<code>PwaPolicy</code> 声明缓存与更新意图。下面是部署在域名根路径的起点，需替换域名、名称与图标文件。

~~~ts
// pwa.config.ts
import type {
  PwaIdentity,
  PwaInstallMetadata,
  PwaPolicy,
} from "@pwa-platform/contracts";

export const IDENTITY: PwaIdentity = {
  appId: "businessapp",
  manifestId: "/",
  origin: "https://app.example.com",
  scope: "/",
  serviceWorkerUrl: "/sw.js",
  manifestUrl: "/manifest.webmanifest",
  mountPath: "/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: "/",
  display: "standalone",
  name: "业务应用",
  shortName: "业务",
  themeColor: "#087b8b",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};
~~~

把四个图标文件放在 Vite 的 <code>public/icons/</code>。安装元数据也支持描述、截图和快捷方式；截图与快捷方式图标必须真实存在于发布产物中。

## 生产身份要保持稳定

<code>scope</code>、worker URL、manifest ID、挂载路径与缓存命名空间共同决定浏览器如何识别这个应用。生产注册后变更它们属于迁移，需要专门的架构决策和迁移计划。不要把一次普通发版当作修改身份的机会。

如果应用部署在 <code>/app/</code>，Vite <code>base</code>、<code>scope</code>、<code>mountPath</code>、<code>startUrl</code> 和资源 URL 都要指向该路径。策略中的 <code>resources[].pathPrefix</code> 与 <code>offlineFallback.path</code> 则是**相对挂载路径**的路径：示例中的 <code>/offline.html</code> 会解析为 <code>/app/offline.html</code>，不要再写一遍 <code>/app</code>。

## 策略只声明意图

应用不能向平台注入任意 Service Worker 代码、Workbox 路由或 callback。平台会把策略编译为 <code>PwaPlan</code>，自动合并不可覆盖的安全拒绝规则。完整资源分类与准入条件见[缓存安全模型](/architecture/security)。

下一步：选择[离线体验](/guide/offline)和[安装与更新](/guide/updates)的交互，再按[上线前检查](/start/checklist)验证。
