# 身份、安装信息与策略

本页是字段参考；如果还没有决定要不要缓存、离线页或恢复能力，先读[按功能接入 PWA](/guide/integration-by-capability)，不要默认复制全功能策略。

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

把四个图标文件放在 Vite 的 <code>public/icons/</code>。文件不能只是改了名称的占位图：生产构建会检查主图标是否存在，并读取 PNG／JPEG／WebP 文件头核对声明 MIME 与实际尺寸；失败时按 <code>vite.manifest-icon-*</code> 提示中的配置索引、URL、声明值和实测值修正。其他图片格式会给出未验证警告，maskable 安全区仍需视觉检查。安装元数据也支持描述、截图和快捷方式；截图与快捷方式图标必须真实存在于发布产物中。

插件会在构建时为每个 HTML 入口注入 manifest 链接，应用无需再写 <code>&lt;link rel="manifest"&gt;</code>。已有链接时，只保留一个，并将其 <code>href</code> 写为与 <code>IDENTITY.manifestUrl</code> 完全相同的根路径，或同一 <code>IDENTITY.origin</code> 下该路径的完整 URL；相对路径、不同地址和重复链接都会让构建失败。页面含 <code>&lt;base&gt;</code> 也会被拒绝，接入现有项目时先检查 <code>index.html</code> 及其他 HTML 入口。

## 可选的截图与快捷方式

若希望支持的浏览器显示截图或图标菜单中的快捷入口，可在同一份 <code>pwa.config.ts</code> 中基于上面的 <code>INSTALL</code> 新增完整配置，再把 Vite 插件的 <code>install: INSTALL</code> 改为 <code>install: INSTALL_WITH_EXTRAS</code>。浏览器决定是否展示这些字段；它们不会让应用自动拥有分享目标或文件关联能力。

~~~ts
// pwa.config.ts；接在上面的 INSTALL 声明之后
export const INSTALL_WITH_EXTRAS: PwaInstallMetadata = {
  ...INSTALL,
  screenshots: [
    { src: "/screenshots/desktop.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
  ],
  shortcuts: [
    {
      name: "打开工作台",
      url: "/dashboard",
      icons: [
        { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      ],
    },
  ],
};
~~~

截图和快捷方式图标也要放在 <code>public/</code> 对应路径，快捷方式目标须处于应用 scope 内。子路径部署时，将上例的浏览器 URL 分别改为 <code>/app/screenshots/desktop.png</code>、<code>/app/dashboard</code> 和 <code>/app/icons/192.png</code>。构建校验会检查截图和快捷方式图标是否存在；业务仍需验证目标页面可打开。

## 其他可选安装字段

除了截图和快捷方式，<code>PwaInstallMetadata</code> 还接受以下可选字段，全部不写时 manifest 与以前完全相同：

| 字段 | 取值 | 用途 |
| --- | --- | --- |
| <code>description</code> | 非空文本 | Android 安装提示中展示 |
| <code>categories</code> | 小写、非空、不重复的字符串 | 浏览器不使用，供分发平台分类 |
| <code>orientation</code> | <code>any</code>／<code>natural</code>／<code>portrait</code>／<code>portrait-primary</code>／<code>portrait-secondary</code>／<code>landscape</code>／<code>landscape-primary</code>／<code>landscape-secondary</code> | 主要在 Android 与独立窗口中锁定方向 |
| <code>displayOverride</code> | <code>window-controls-overlay</code>／<code>fullscreen</code>／<code>standalone</code>／<code>minimal-ui</code>／<code>browser</code> 的有序列表 | 按顺序取第一个受支持的值，例如桌面端窗口控件覆盖；都不支持时回退到 <code>display</code> |

新增的数组字段（<code>categories</code>、<code>displayOverride</code>、<code>screenshots</code>、<code>shortcuts</code>）至少要有一项，写空数组会被拒绝。以下 manifest 成员平台不接受：<code>lang</code>、<code>dir</code>（浏览器未实现）、<code>launch_handler</code>、<code>share_target</code>、<code>file_handlers</code>、<code>protocol_handlers</code>、<code>related_applications</code>，以及 <code>displayOverride</code> 中仍在孵化的 <code>tabbed</code>、<code>borderless</code>。

构建会拒绝以下情况，诊断码只给字段路径，不回显配置值（主图标错误例外，见下表说明）：

| 诊断码 | 原因 |
| --- | --- |
| <code>install.shortcut-url-outside-scope</code> | 快捷方式的 <code>url</code> 不在应用 scope 内 |
| <code>compile.shortcut-url-in-child-scope</code> | 共享 origin 拓扑下，根应用的快捷方式落进了子应用的 scope |
| <code>vite.manifest-icon-missing</code> | manifest 主 <code>icons</code> 引用的文件不在本次 Vite 构建产物或 <code>base</code> 下 |
| <code>vite.manifest-icon-invalid</code> | 主图标 PNG／JPEG／WebP 的文件头损坏，或无法按声明的 <code>type</code> 解析 |
| <code>vite.manifest-icon-type-mismatch</code> | 声明的 <code>type</code> 与文件签名不一致 |
| <code>vite.manifest-icon-size-mismatch</code> | 文件固有尺寸与声明的 <code>sizes</code> 不一致 |
| <code>verify.manifest-asset-missing</code> | 截图或快捷方式图标引用的文件不在构建产物中 |

主图标相关的四个 <code>vite.manifest-icon-*</code> 错误是通用规则的例外：为了方便定位 Android 安装资格问题，它们会显示公开的图标 URL、声明的 MIME／尺寸与文件实测值（但不输出图片字节）。

以下是来自 Chrome 产品行为、只提示不阻断构建的警告，数值可能随 Chrome 版本调整：截图宽高不在 320–3840 像素之间、长边超过短边 2.3 倍、同一 <code>formFactor</code> 截图宽高比不一致、<code>wide</code> 超过 8 张或 <code>narrow</code> 超过 5 张、没有 <code>wide</code> 截图（桌面端不显示）、<code>description</code> 超过 324 个 UTF-16 码元。Android 从 Chrome 109 起忽略 <code>wide</code> 截图，因此建议桌面用 <code>wide</code>、手机用 <code>narrow</code> 各准备一套。字段取舍的完整原因见 [ADR-0037](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0037-install-metadata-manifest-members.md)。

## 只使用离线与更新，不启用平台安装提示

若业务不使用平台的安装元数据和 <code>promptInstall()</code>，将上例 <code>POLICY.install</code> 改为 <code>{ enabled: false }</code>，并将 Vite 插件的 <code>install: INSTALL</code> 改为 <code>install: null</code>。这样平台仍生成 worker 并支持离线与更新，但不生成 manifest，也不接管浏览器的安装提示事件；页面侧 <code>promptInstall()</code> 会返回 <code>unavailable</code>。

<code>IDENTITY.manifestUrl</code> 此时仍是必需的身份字段。应用须自行把 manifest 文件放在对应构建产物路径：根路径示例为 <code>public/manifest.webmanifest</code>，浏览器地址为 <code>/manifest.webmanifest</code>；部署在 <code>/app/</code> 时，仍放在 Vite 的 <code>public/</code>，浏览器地址改为 <code>/app/manifest.webmanifest</code>。缺少文件会使构建失败。插件仍会在 HTML 中注入该 manifest 的链接；浏览器是否提供安装入口取决于自备 manifest 和浏览器行为，关闭平台安装提示并不保证浏览器禁止安装。

## `cacheNamespaceSeed` 是什么

<code>cacheNamespaceSeed</code> 是缓存命名空间前缀里的身份修订段，与 <code>appId</code>、<code>environment</code> 共同决定 Cache Storage 里所有缓存名称的前缀。正常发版不需要改它。只有当 <code>scope</code>、worker URL、manifest ID 或其他生产不可变字段发生了身份迁移（需要专门的架构决策和迁移计划）时，才把它改成这个应用在该环境下**从未用过**的新值（ADR-0009）。改动后旧缓存不会被自动删除，而是仍留在旧前缀下，需要按迁移计划显式清理；复用旧种子会让新身份读到旧 revision 遗留的缓存。

## 本地验收用什么 <code>environment</code>

<code>PwaIdentity.environment</code> 的约定是“每个环境都是独立身份”：不同 <code>environment</code> 的应用各自拥有互不影响的缓存命名空间。用 <code>vite preview</code> 在本地做验收时，建议给本地验收单独声明一个 <code>environment</code>（例如 <code>"preview"</code>），而不是直接复用生产身份；这样本地验收产生的缓存不会与生产环境的缓存共用前缀，清理或反复重跑也不会影响线上数据。

## 生产身份要保持稳定

<code>scope</code>、worker URL、manifest ID、挂载路径与缓存命名空间共同决定浏览器如何识别这个应用。生产注册后变更它们属于迁移，需要专门的架构决策和迁移计划。不要把一次普通发版当作修改身份的机会。

如果应用部署在 <code>/app/</code>，必须把**浏览器看到的 URL** 改为带前缀的路径，同时保持策略路径相对挂载点。以同一个配置示例为基础，逐项替换：

| 配置位置 | 根路径示例 | <code>/app/</code> 部署时 |
| --- | --- | --- |
| Vite <code>base</code> | <code>"/"</code> | <code>"/app/"</code> |
| <code>IDENTITY.manifestId</code>、<code>scope</code>、<code>mountPath</code> | <code>"/"</code> | <code>"/app/"</code> |
| <code>IDENTITY.serviceWorkerUrl</code> | <code>"/sw.js"</code> | <code>"/app/sw.js"</code> |
| <code>IDENTITY.manifestUrl</code> | <code>"/manifest.webmanifest"</code> | <code>"/app/manifest.webmanifest"</code> |
| <code>INSTALL.startUrl</code> | <code>"/"</code> | <code>"/app/"</code> |
| <code>INSTALL.icons[].src</code> | <code>"/icons/192.png"</code> 等 | <code>"/app/icons/192.png"</code> 等 |

<code>serviceWorkerUrl</code> 必须直接位于 <code>scope</code> 目录下：<code>scope: "/app/"</code> 搭配 <code>/app/assets/sw.js</code> 会以 <code>identity.scope-outside-worker-directory</code> 构建失败，因为浏览器默认只允许 worker 控制它所在目录及以下的路径，平台也不支持用 <code>Service-Worker-Allowed</code> 响应头放宽。
| <code>POLICY.offlineFallback.path</code> | <code>"/offline.html"</code> | 仍为 <code>"/offline.html"</code> |
| <code>POLICY.resources[].pathPrefix</code> | <code>"/assets"</code> 等 | 仍为 <code>"/assets"</code> 等 |

例如策略中的 <code>/offline.html</code> 会解析为 <code>/app/offline.html</code>。不要在策略路径前重复写 <code>/app</code>，否则会变成 <code>/app/app/offline.html</code>。把图标放在项目的 <code>public/icons/</code>，构建后确认站点确实能从 <code>/app/icons/</code> 返回这些文件。若增加截图或快捷方式，也要将它们的 URL 改为部署路径内的真实文件或页面。

若同一域名下同时部署根应用与 `/m/` 子应用，还需要共享登记表和根 worker 排除规则，按[同源多应用部署示例](/operations/release#root-mobile-paths)配置并发布。

## 策略只声明意图

应用不能向平台注入任意 Service Worker 代码、Workbox 路由或 callback。平台会把策略编译为 <code>PwaPlan</code>，自动合并不可覆盖的安全拒绝规则。完整资源分类与准入条件见[缓存安全模型](/architecture/security)。

下一步：选择[离线体验](/guide/offline)和[安装与更新](/guide/updates)的交互，再按[上线前检查](/start/checklist)验证。
