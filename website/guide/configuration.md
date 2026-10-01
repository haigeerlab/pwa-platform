# 身份、安装信息与策略

本页是字段参考；如果还没有决定要不要缓存、离线页或恢复能力，先读[按功能接入 PWA](/guide/integration-by-capability)，不要默认复制全功能策略。

查某个字段的取值规则、默认值、出错时的诊断码，以及上线后能否修改，直接看[字段参考](#field-reference)；构建日志里的诊断码见[诊断码索引](/reference/diagnostics)。

接入时需要提交三组信息：<code>PwaIdentity</code> 确定应用及 URL 所有权，<code>PwaInstallMetadata</code> 确定安装展示，<code>PwaPolicy</code> 声明缓存与更新意图。下面是部署在域名根路径的起点，需替换域名、名称与图标文件。

同一份构建产物需要部署到构建时未知的多个 HTTPS 域名时，改用[显式可移植部署](/guide/portable-deployment)：`deployment: { kind: "portable" }`、不含 origin 的 `PwaPortableIdentity` 和 v3 策略。未写 `deployment` 仍是本页的固定域名模式，必须填写并校验 `origin`。

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

上例的 <code>schemaVersion: 1</code> 不含 <code>offlineWrites</code>。升到 <code>schemaVersion: 2</code> 或 <code>3</code>（例如启用[公共读取缓存](/guide/public-read-cache)）后，策略必须带上 <code>offlineWrites</code> 字段。它对应的离线写入能力尚未发布，请原样保留下面这种全零的禁用形式：

~~~ts
offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
~~~

<code>enabled: false</code> 时只要有任何一项非零或 <code>targets</code> 非空，就会以 <code>offline-write.disabled-configuration</code> 失败；不要自行填入目标路径。

## 在 vite.config.ts 中接入

下面是配合上面 <code>pwa.config.ts</code> 的最小完整 <code>vite.config.ts</code>（部署在域名根路径）。其他页面里的 <code>pwa({ ... })</code> 片段都基于这份配置，不再重复声明 <code>IDENTITY</code>、<code>INSTALL</code>、<code>POLICY</code>：

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config.ts";

export default defineConfig({
  base: "/", // 必须位于 IDENTITY.scope 内；/app/ 部署时改为 "/app/"
  plugins: [
    // 已有的框架插件（如 @vitejs/plugin-vue）继续保留
    pwa({
      identity: IDENTITY,
      policy: POLICY,
      install: INSTALL, // 不启用平台安装元数据时写 null
      topology: { kind: "standalone-origin" },
    }),
  ],
});
~~~

<code>offlinePage</code> 是可选项，见[离线体验](/guide/offline#默认离线页)。

::: warning 开启 <code>offlineFallback</code> 就必须真有这个文件
<code>POLICY.offlineFallback</code> 写成 <code>{ enabled: true, path: "/offline.html" }</code> 时，构建产物里必须存在该路径的文件：要么在插件上写 <code>offlinePage: {}</code> 让平台生成，要么自己提供 <code>public/offline.html</code>（两者不能同时占用同一路径）。都没有会以 <code>compile.offline-fallback-not-built</code> 失败；该路径被拒绝规则覆盖则以 <code>compile.offline-fallback-denied</code> 失败。示例里给 <code>/offline.html</code> 写 <code>asset</code> 规则是可选的，编译器会自动预缓存离线页。
:::

把四个图标文件放在 Vite 的 <code>public/icons/</code>。文件不能只是改了名称的占位图：生产构建会检查主图标是否存在，并读取 PNG／JPEG／WebP 文件头核对声明 MIME 与实际尺寸；失败时按 <code>vite.manifest-icon-*</code> 提示中的配置索引、URL、声明值和实测值修正。<code>icons</code> 必须包含 192x192 与 512x512 两种尺寸，且每种尺寸都要同时有 <code>purpose: "any"</code> 与 <code>"maskable"</code> 的条目，缺任何一个都以 <code>install.missing-icon-variant</code> 失败。其他图片格式（<code>vite.manifest-icon-unverified</code>）会给出未验证警告，maskable 安全区仍需视觉检查。安装元数据也支持描述、截图和快捷方式；截图与快捷方式图标必须真实存在于发布产物中。

插件会在构建时为每个 HTML 入口注入 manifest 链接，应用无需再写 <code>&lt;link rel="manifest"&gt;</code>。已有链接时，只保留一个，并将其 <code>href</code> 写为与 <code>IDENTITY.manifestUrl</code> 完全相同的根路径，或同一 <code>IDENTITY.origin</code> 下该路径的完整 URL；相对路径、不同地址和重复链接都会让构建失败。页面含 <code>&lt;base&gt;</code> 也会被拒绝，接入现有项目时先检查 <code>index.html</code> 及其他 HTML 入口。

可移植模式只接受与 `manifestUrl` 完全相同的根绝对路径链接；完整 URL 即使指向本次测试域名也会被拒绝。

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
| <code>vite.manifest-icon-size-invalid</code> | 声明的 <code>sizes</code> 不是以空格分隔的 <code>宽x高</code> 像素值（如 <code>192x192</code>），例如写成 <code>any</code> 或留空 |
| <code>vite.manifest-icon-size-mismatch</code> | 文件固有尺寸与声明的 <code>sizes</code> 不一致 |
| <code>install.missing-icon-variant</code> | <code>icons</code> 缺少 192x192 或 512x512 的 <code>any</code> 或 <code>maskable</code> 变体 |
| <code>install.start-url-outside-scope</code> | <code>startUrl</code> 不在 <code>IDENTITY.scope</code> 内 |
| <code>compile.install-metadata-missing</code> | <code>POLICY.install.enabled</code> 为真，但插件的 <code>install</code> 是 <code>null</code> |
| <code>verify.manifest-asset-missing</code> | 截图或快捷方式图标引用的文件不在构建产物中 |

主图标相关的五个 <code>vite.manifest-icon-*</code> 错误（<code>missing</code>、<code>invalid</code>、<code>type-mismatch</code>、<code>size-invalid</code>、<code>size-mismatch</code>）是通用规则的例外：为了方便定位 Android 安装资格问题，它们会显示公开的图标 URL、声明的 MIME／尺寸与文件实测值（但不输出图片字节）。

另有两类只提示的警告：主图标使用了构建检查不解析的图片格式时的 <code>vite.manifest-icon-unverified</code>，以及 <code>themeColor</code>、<code>backgroundColor</code> 不是十六进制颜色时的 <code>install.invalid-color</code>。以下是来自 Chrome 产品行为、同样不阻断构建的警告，数值可能随 Chrome 版本调整：截图宽高不在 320–3840 像素之间、长边超过短边 2.3 倍、同一 <code>formFactor</code> 截图宽高比不一致、<code>wide</code> 超过 8 张或 <code>narrow</code> 超过 5 张、没有 <code>wide</code> 截图（桌面端不显示）、<code>description</code> 超过 324 个 UTF-16 码元。Android 从 Chrome 109 起忽略 <code>wide</code> 截图，因此建议桌面用 <code>wide</code>、手机用 <code>narrow</code> 各准备一套。字段取舍的完整原因见 [ADR-0037](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0037-install-metadata-manifest-members.md)。

## 只使用离线与更新，不启用平台安装提示

若业务不使用平台的安装元数据和 <code>promptInstall()</code>，将上例 <code>POLICY.install</code> 改为 <code>{ enabled: false }</code>，并将 Vite 插件的 <code>install: INSTALL</code> 改为 <code>install: null</code>。这样平台仍生成 worker 并支持离线与更新，但不生成 manifest，也不接管浏览器的安装提示事件；页面侧 <code>promptInstall()</code> 会返回 <code>unavailable</code>。

<code>IDENTITY.manifestUrl</code> 此时仍是必需的身份字段。应用须自行把 manifest 文件放在对应构建产物路径：根路径示例为 <code>public/manifest.webmanifest</code>，浏览器地址为 <code>/manifest.webmanifest</code>；部署在 <code>/app/</code> 时，仍放在 Vite 的 <code>public/</code>，浏览器地址改为 <code>/app/manifest.webmanifest</code>。缺少文件会使构建失败。插件仍会在 HTML 中注入该 manifest 的链接；浏览器是否提供安装入口取决于自备 manifest 和浏览器行为，关闭平台安装提示并不保证浏览器禁止安装。

## 字段参考 {#field-reference}

下面按“作用｜取值规则｜默认｜取错时的诊断码或后果｜首次生产注册后能否修改”逐项列出，是全站关于“哪些字段上线后不可变”的唯一依据。三个配置对象都是严格对象：多写未知字段报 <code>schema.unknown-field</code>，漏写必填字段报 <code>schema.missing-field</code>，类型不对报 <code>schema.invalid-type</code>；下表“默认”写“无”表示必填。路径类字段均要求规范路径：以 <code>/</code> 开头，不含 <code>//</code>、反斜杠、查询串或 <code>.</code>／<code>..</code> 段，否则 <code>path.invalid</code>。全部诊断码另见[诊断码索引](/reference/diagnostics)。

### PwaIdentity：九个字段全部不可变

首次生产发布后，这九个字段就被记入发布基线，发布门禁逐项比对，任何一项不同都以 <code>verify.baseline-mismatch</code>（路径为 <code>/identity/&lt;字段名&gt;</code>）失败。变更属于身份迁移，需要 ADR 与迁移计划，不是普通发版。

| 字段 | 作用 | 取值规则 | 默认 | 取错时的诊断码或后果 | 上线后能否修改 |
| --- | --- | --- | --- | --- | --- |
| <code>appId</code> | 应用名，是缓存与数据库命名空间的一段（见下） | 非空字符串 | 无 | <code>schema.invalid-value</code>；共享 origin 的登记表内必须互不相同（<code>registry.duplicate-identity-field</code>） | 否 |
| <code>manifestId</code> | manifest 的 <code>id</code>，浏览器判断“是不是同一个已安装应用”的依据（见下） | 非空字符串；平台不校验形态，惯例与 <code>scope</code> 相同（<code>/</code>、<code>/app/</code>） | 无 | <code>schema.invalid-value</code>；改值后浏览器视为另一个应用 | 否 |
| <code>origin</code> | 部署站点，仅用于构建与发布期一致性校验，浏览器里的 worker 不读它 | 协议＋主机＋端口，不带路径和结尾斜杠；<code>https:</code>，仅 <code>localhost</code>／<code>127.0.0.1</code>／<code>[::1]</code> 允许 <code>http:</code> | 无 | <code>identity.invalid-origin</code>；完整 URL 形式的 manifest 链接与它不同则构建失败 | 否 |
| <code>scope</code> | worker 控制的范围 | 规范路径，必须以 <code>/</code> 结尾；必须等于 <code>serviceWorkerUrl</code> 所在目录 | 无 | <code>path.invalid</code>；<code>identity.scope-outside-worker-directory</code> | 否 |
| <code>serviceWorkerUrl</code> | worker 脚本的浏览器 URL | 规范路径，直接位于 <code>scope</code> 目录下 | 无 | <code>identity.service-worker-outside-scope</code>；<code>identity.scope-outside-worker-directory</code> | 否 |
| <code>manifestUrl</code> | manifest 文件的浏览器 URL | 规范路径，位于 <code>scope</code> 下 | 无 | <code>identity.manifest-outside-scope</code>；HTML 里已有的 manifest 链接须与它一致 | 否 |
| <code>mountPath</code> | 策略路径（<code>pathPrefix</code>、<code>offlineFallback.path</code>）的相对基点 | 规范路径，位于 <code>scope</code> 内；不要求以 <code>/</code> 结尾（如 <code>/m</code>） | 无 | <code>identity.scope-excludes-mount-path</code>；Vite <code>base</code> 与它对不上时，离线页等文件找不到（<code>compile.offline-fallback-not-built</code>） | 否 |
| <code>environment</code> | 环境名；不同环境是互相独立的身份，缓存名不同 | 匹配 <code>[a-z][a-z0-9-]*</code> | 无 | <code>identity.invalid-environment</code> | 否（同一发布槽内改名等同迁移） |
| <code>cacheNamespaceSeed</code> | 缓存命名空间的身份修订段 | 非空字符串 | 无 | <code>schema.invalid-value</code>；复用旧值会读到旧修订遗留的缓存 | 否，仅迁移时换成从未用过的新值 |

另有两条跨字段规则：Vite <code>base</code> 必须位于 <code>scope</code> 内（<code>compile.public-path-outside-scope</code>）；<code>base</code> 只能是同源、首尾都是 <code>/</code> 的路径，写成完整 URL 会让构建失败（见[诊断码索引](/reference/diagnostics#无诊断码的构建失败)）。

**<code>appId</code> 是什么。** 它是所有本应用持久化名称里的一段：缓存名是 <code>pwa:&lt;appId&gt;:&lt;environment&gt;:&lt;seed&gt;:precache</code> 等（见下文 [<code>cacheNamespaceSeed</code>](#cachenamespaceseed-是什么)），恢复 worker 用前缀 <code>pwa:&lt;appId&gt;:&lt;environment&gt;:</code> 找出并清理本应用的全部缓存；离线写库名、入口恢复的 IndexedDB 库名（<code>pwa-entry:&lt;appId&gt;:&lt;environment&gt;</code>）同样带它。因此改 <code>appId</code> 等于换掉所有缓存与库名，旧数据成为孤儿；同一 origin 上的两个应用必须用不同的 <code>appId</code>。它不是显示名称，显示名称写在 <code>INSTALL.name</code>。

**<code>manifestId</code> 是什么。** 构建生成的 manifest 里，<code>id</code> 和 <code>scope</code> 取自身份而不是安装元数据：<code>id</code> 就是 <code>IDENTITY.manifestId</code>。浏览器用 manifest 的 <code>id</code> 判断这是不是用户已安装的同一个应用，所以它和 <code>scope</code> 一样属于身份，改了就是另一个应用。安装元数据里的 <code>name</code>、图标、颜色等展示字段则可以随发版修改。<code>install: null</code> 时平台不生成 manifest，应用自备的 manifest 需自己保证 <code>id</code> 与它一致。

### PwaInstallMetadata：展示信息，可随发版修改

这一组不进入发布基线，可以在后续版本里改；唯一约束是 <code>startUrl</code> 和快捷方式必须始终在 <code>scope</code> 内。除 <code>startUrl</code>、<code>display</code> 等必填项外，可选字段全部不写时，manifest 中不出现对应成员。

| 字段 | 作用 | 取值规则 | 默认 | 取错时的诊断码或后果 | 上线后能否修改 |
| --- | --- | --- | --- | --- | --- |
| <code>startUrl</code> | 从主屏幕或桌面启动时打开的地址 | 规范路径，位于 <code>IDENTITY.scope</code> 内 | 无 | <code>install.start-url-outside-scope</code> | 能 |
| <code>display</code> | 显示模式 | <code>standalone</code>、<code>minimal-ui</code>、<code>fullscreen</code>、<code>browser</code> 之一（不接受 <code>window-controls-overlay</code>，那属于 <code>displayOverride</code>） | 无 | <code>schema.invalid-value</code> | 能 |
| <code>name</code>、<code>shortName</code> | 完整名称与短名称 | 非空字符串 | 无 | <code>schema.invalid-value</code> | 能 |
| <code>themeColor</code>、<code>backgroundColor</code> | 主题色与启动背景色 | 非空字符串；应为十六进制色（<code>#rgb</code>、<code>#rgba</code>、<code>#rrggbb</code>、<code>#rrggbbaa</code>） | 无 | 非十六进制只警告 <code>install.invalid-color</code>，不阻断构建 | 能 |
| <code>icons</code> | 应用图标 | 每项 <code>src</code>（规范路径）、<code>sizes</code>、<code>type</code>、<code>purpose</code>（<code>any</code> 或 <code>maskable</code>）；必须含 192x192 与 512x512，且每种尺寸都有 <code>any</code> 和 <code>maskable</code> | 无 | <code>install.missing-icon-variant</code>；文件缺失或头部与声明不符为 <code>vite.manifest-icon-*</code> | 能 |
| <code>description</code> | 安装提示中的描述 | 非空字符串 | 不写 | 超过 324 个 UTF-16 码元警告 <code>install.description-too-long</code> | 能 |
| <code>categories</code> | 分发平台分类 | 小写、非空、不重复的字符串数组，至少一项 | 不写 | <code>schema.invalid-value</code> | 能 |
| <code>orientation</code> | 锁定方向 | <code>any</code>、<code>natural</code>、<code>portrait[-primary／-secondary]</code>、<code>landscape[-primary／-secondary]</code> | 不写 | <code>schema.invalid-value</code> | 能 |
| <code>displayOverride</code> | 按顺序尝试的显示模式 | <code>window-controls-overlay</code>、<code>fullscreen</code>、<code>standalone</code>、<code>minimal-ui</code>、<code>browser</code> 的不重复数组，至少一项 | 不写 | <code>schema.invalid-value</code> | 能 |
| <code>screenshots</code> | 安装界面的截图 | 每项 <code>src</code>、<code>sizes</code>（单个 <code>宽x高</code>，小写 <code>x</code>、无前导零）、<code>type</code>（<code>image/png</code>、<code>image/jpeg</code>、<code>image/webp</code>）、可选 <code>formFactor</code>（<code>wide</code>／<code>narrow</code>）与 <code>label</code>；至少一项 | 不写（未写 <code>formFactor</code> 时按 <code>narrow</code> 计） | 格式错误 <code>schema.invalid-value</code>；尺寸超出 320–3840、长边超过短边 2.3 倍、同类宽高比不一致、数量超限、无 <code>wide</code> 仅警告；文件缺失 <code>verify.manifest-asset-missing</code> | 能 |
| <code>shortcuts</code> | 图标菜单快捷入口 | 每项 <code>name</code>、<code>url</code>（规范路径，须在 scope 内），可选 <code>shortName</code>、<code>description</code>、<code>icons</code>；至少一项 | 不写 | <code>install.shortcut-url-outside-scope</code>；共享 origin 下落进子应用 scope 为 <code>compile.shortcut-url-in-child-scope</code> | 能 |

截图与快捷方式的用法、Chrome 相关的警告阈值与不接受的 manifest 成员见前文[可选的截图与快捷方式](#可选的截图与快捷方式)和[其他可选安装字段](#其他可选安装字段)。

### PwaPolicy：缓存与更新意图，可随发版修改

| 字段 | 作用 | 取值规则 | 默认 | 取错时的诊断码或后果 | 上线后能否修改 |
| --- | --- | --- | --- | --- | --- |
| <code>schemaVersion</code> | 策略版本，决定还需要哪些字段 | <code>1</code>、<code>2</code> 或 <code>3</code>（见下） | 无 | <code>schema.invalid-value</code>；各版本独有字段多写或漏写按未知字段／缺字段报错 | 能，升级时同版本升级平台包 |
| <code>install</code> | 是否启用平台安装元数据与 <code>promptInstall()</code> | <code>{ enabled: boolean }</code> | 无 | 为真而插件 <code>install</code> 是 <code>null</code>：<code>compile.install-metadata-missing</code> | 能 |
| <code>offlineFallback</code> | 离线回退页 | <code>{ enabled: false }</code> 或 <code>{ enabled: true, path }</code>，<code>path</code> 相对 <code>mountPath</code> | 无 | 文件不在产物中 <code>compile.offline-fallback-not-built</code>；被拒绝规则覆盖 <code>compile.offline-fallback-denied</code> | 能 |
| <code>updateMode</code> | 更新交互模式 | 目前只接受 <code>"prompt"</code>（见下） | 无 | 其他值 <code>schema.invalid-value</code> | 能（但目前只有一个合法值） |
| <code>resources</code> | 资源分类与缓存规则 | 规则数组，写法见[资源规则的写法约束](#资源规则的写法约束) | 无（可为空数组） | <code>policy.unsafe-cache-strategy</code>、<code>compile.duplicate-path-prefix</code>、<code>compile.allow-under-deny</code>、<code>path.invalid</code> | 能 |
| <code>networkTimeoutSeconds</code> | 导航与 network-first 运行时缓存等待网络的秒数 | 1 到 30 的整数 | 不写＝不设超时 | 范围外或非整数 <code>schema.invalid-value</code> | 能 |
| <code>offlineWrites</code> | 离线写入（尚未发布） | 仅 <code>schemaVersion</code> 2、3 使用；公开使用必须写全零禁用形式 | v2／v3 必填 | 禁用形式带任何非零值或非空 <code>targets</code>：<code>offline-write.disabled-configuration</code> | 保持禁用形式 |
| <code>runtimeCache</code> | 公共读取的运行时缓存上限 | 仅 <code>schemaVersion: 3</code>；<code>{ enabled, maxEntries, maxEntryBytes, maxAgeSeconds }</code>，开启时分别为 1–200、1–1,048,576、60–604,800，关闭时 <code>enabled: false</code> 且三项上限都为 0 | v3 必填，三项上限无默认值 | 关闭却带非零上限 <code>runtime-cache.disabled-configuration</code>；开启却为 0 <code>runtime-cache.enabled-configuration</code>；没有任何可执行规则时警告 <code>compile.runtime-cache-unused</code> | 能；上限或可执行规则一变，数据缓存换新名，旧数据不迁移，见[公共读取缓存](/guide/public-read-cache) |

**<code>updateMode</code> 目前只能写 <code>"prompt"</code>。** 契约里的合法值集合（<code>UPDATE_MODES</code>）只有这一项。含义是：新版本 worker 装好后进入等待，页面得到 <code>updateWaiting</code> 状态，由业务界面决定何时调用 <code>applyUpdate()</code> 接管，平台不会自动接管也不会自动刷新页面；流程见[安装与更新](/guide/updates)。所以这个字段今天不提供选择，只是把“更新由你来确认”写进策略。

**<code>schemaVersion</code> 的三个版本。** 策略自身在三个版本间只差两个字段：

- **1**：基础形态，没有 <code>offlineWrites</code> 和 <code>runtimeCache</code>。
- **2**：增加必填的 <code>offlineWrites</code>。对应的离线写入能力尚未发布，公开使用者必须原样写成 <code>{ enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] }</code>。
- **3**：在 2 的基础上增加必填的 <code>runtimeCache</code>，用于[公共读取缓存](/guide/public-read-cache)；不用它时写 <code>{ enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 }</code>。

不需要新字段就停在 1。

### Vite 插件选项：<code>pwa({ ... })</code>

选项在创建插件时（读 <code>vite.config.ts</code> 的那一刻）就校验，失败信息只含诊断码和路径，如 <code>The pwa plugin's identity is not valid: identity.invalid-origin at /identity/origin</code>，不回显你的值。

| 选项 | 作用 | 取值规则 | 默认 | 取错时的诊断码或后果 | 上线后能否修改 |
| --- | --- | --- | --- | --- | --- |
| <code>identity</code> | 身份 | 上文 <code>PwaIdentity</code> | 无 | 上文各码，路径前缀 <code>/identity</code> | 否 |
| <code>policy</code> | 策略 | 上文 <code>PwaPolicy</code> | 无 | 路径前缀 <code>/policy</code> | 能 |
| <code>install</code> | 安装元数据 | <code>PwaInstallMetadata</code>，或不生成 manifest 时写 <code>null</code> | 无 | 路径前缀 <code>/install</code>；<code>null</code> 而 <code>policy.install.enabled</code> 为真：<code>compile.install-metadata-missing</code> | 能 |
| <code>topology</code> | 部署拓扑 | <code>{ kind: "standalone-origin" }</code>，或 <code>{ kind: "shared-origin", registry }</code> | 无 | <code>kind</code> 不合法时抛出 <code>topology.kind must be one of: …</code>（无诊断码）；登记表错误为 <code>registry.*</code> | 登记表变更按[同源多应用](/operations/release#同源多应用)先根后子发布 |
| <code>offlinePage</code> | 启用平台默认离线页 | 对象，可含 <code>locale</code>（<code>zh-CN</code>／<code>en</code>）、<code>messages</code>、<code>css</code>；要求 <code>policy.offlineFallback.enabled</code> 为真 | 不写＝不生成离线页；<code>locale</code> 默认 <code>zh-CN</code> | <code>vite.offline-page-*</code>，见[离线体验](/guide/offline#默认离线页) | 能 |

## `origin` 填什么

<code>IDENTITY.origin</code> 是这个身份部署到的站点，只写协议、主机和端口，例如 <code>https://app.example.com</code>，不带路径和结尾斜杠。必须是 <code>https:</code>；只有 <code>localhost</code> 这类本机回环地址允许 <code>http:</code>，否则构建以 <code>identity.invalid-origin</code> 失败。

它不影响浏览器里的行为：worker 只按自己实际所在的地址判断同源请求，不读取这个字段。它用于构建和发布时的一致性校验：已有的 manifest 链接写成完整 URL 时，必须位于这个 origin 下；共享 origin 拓扑的注册表必须与它相同；它还属于生产身份基线，换域名等同于换身份。

因此生产身份填正式域名；本地用 <code>vite preview</code> 验收时，另写一份填本地地址（如 `http://localhost:4173`）的预览身份，并配合下一节的独立 <code>environment</code>，完整写法见[两份身份](#两份身份生产与本地验收)。

## `cacheNamespaceSeed` 是什么

<code>cacheNamespaceSeed</code> 是缓存命名空间前缀里的身份修订段，与 <code>appId</code>、<code>environment</code> 共同决定 Cache Storage 里所有缓存名称的前缀。正常发版不需要改它。实际的缓存名是 <code>pwa:&lt;appId&gt;:&lt;environment&gt;:&lt;seed&gt;:precache</code>、<code>pwa:&lt;appId&gt;:&lt;environment&gt;:&lt;seed&gt;:runtime-pages</code> 和 <code>pwa:&lt;appId&gt;:&lt;environment&gt;:&lt;seed&gt;:runtime-data-&lt;digest&gt;</code>（各段经 URL 编码；后两个仅在 v3 运行时缓存中使用，<code>digest</code> 由缓存上限与可执行规则算出，见[公共读取缓存](/guide/public-read-cache)）。只有当 <code>scope</code>、worker URL、manifest ID 或其他生产不可变字段发生了身份迁移（需要专门的架构决策和迁移计划）时，才把它改成这个应用在该环境下**从未用过**的新值（ADR-0009）。改动后旧缓存不会被自动删除，而是仍留在旧前缀下，需要按迁移计划显式清理；复用旧种子会让新身份读到旧 revision 遗留的缓存。

## 本地验收用什么 <code>environment</code>

<code>PwaIdentity.environment</code> 的约定是“每个环境都是独立身份”：不同 <code>environment</code> 的应用各自拥有互不影响的缓存命名空间。用 <code>vite preview</code> 在本地做验收时，建议给本地验收单独声明一个 <code>environment</code>（例如 <code>"preview"</code>），而不是直接复用生产身份；这样本地验收产生的缓存不会与生产环境的缓存共用前缀，清理或反复重跑也不会影响线上数据。

### 两份身份：生产与本地验收 {#两份身份生产与本地验收}

做法是在 <code>pwa.config.ts</code> 里再导出一份预览身份，与生产身份只差 <code>origin</code> 和 <code>environment</code>，其余（<code>appId</code>、<code>scope</code>、各路径、<code>cacheNamespaceSeed</code>）完全相同，这样本地验到的就是同一套产物布局：

~~~ts
// pwa.config.ts；紧接在 IDENTITY 之后
export const PREVIEW_IDENTITY: PwaIdentity = {
  ...IDENTITY,
  origin: "http://localhost:4173", // 端口必须与下面的 vite preview 一致
  environment: "preview",
};

// 只有 --mode preview 才用预览身份；其他任何模式（含默认的 production）都是生产身份
export function identityFor(mode: string): PwaIdentity {
  return mode === "preview" ? PREVIEW_IDENTITY : IDENTITY;
}
~~~

<code>vite.config.ts</code> 改成函数形式，按 Vite 的 <code>mode</code> 选身份：

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { identityFor, INSTALL, POLICY } from "./pwa.config.ts";

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [
    // 已有的框架插件继续保留
    pwa({
      identity: identityFor(mode),
      policy: POLICY,
      install: INSTALL,
      topology: { kind: "standalone-origin" },
    }),
  ],
}));
~~~

生产构建照旧：<code>pnpm exec vite build</code>。本地验收先用预览身份构建到单独的目录，再预览该目录：

~~~bash
pnpm exec vite build --mode preview --outDir dist-preview
pnpm exec vite preview --outDir dist-preview --port 4173 --strictPort
~~~

两条命令的作用：

- <code>--mode preview</code> 只切换身份，构建仍是生产构建（同样生成 worker、manifest 和离线页）。两次构建的 manifest 完全相同，差别只在 <code>sw.js</code> 与 <code>pwa-recovery-worker.js</code> 内的缓存名：生产是 <code>pwa:businessapp:production:r1:…</code>，预览是 <code>pwa:businessapp:preview:r1:…</code>。<code>origin</code> 不进入产物，只在构建时参与校验。
- 为什么是两份身份：<code>environment</code> 不同，缓存名前缀就不同，发布基线比对时也能认出它不是生产身份；<code>origin</code> 则在构建时校验——例如 <code>index.html</code> 里手写了完整 URL 的 manifest 链接（<code>https://app.example.com/manifest.webmanifest</code>），生产构建通过，预览构建会因为它不在 `http://localhost:4173` 下而失败。所以预览构建里最好不写显式链接，由平台注入。
- 端口：<code>vite preview</code> 的 <code>--port</code> 必须等于预览身份 <code>origin</code> 里的端口，否则身份声明的不是你实际访问的地址。<code>--strictPort</code> 让端口被占用时直接报错，而不是悄悄换到下一个端口。
- 单独的 <code>--outDir</code> 是为了避免预览产物覆盖 <code>dist</code>。

::: danger 预览身份的产物绝不能部署到生产
<code>dist-preview</code>（以及任何带 <code>--mode preview</code> 构建的产物）只用于本机。它的 <code>environment</code> 与生产不同，并带 <code>http://localhost</code> 的 <code>origin</code>；发布门禁把它与生产基线比对时，会以 <code>verify.baseline-mismatch</code> 报 <code>/identity/origin</code> 与 <code>/identity/environment</code>。CI 与发布脚本只运行不带 <code>--mode</code> 的 <code>vite build</code>，并把预览目录加入 <code>.gitignore</code>。
:::

本地验收的具体步骤与通过标准见[Vue 接入](/start/vue#_5-构建并验收)和[React 接入](/start/react#_4-构建并验收)。

## 构建期身份校验

以下字段间的约束在构建（或创建插件）时检查，违反即失败：

| 约束 | 诊断码 |
| --- | --- |
| <code>scope</code> 必须是规范路径且以 <code>/</code> 结尾（浏览器按字符串前缀匹配 scope，<code>/app</code> 会连带控制 <code>/apple</code>） | <code>path.invalid</code> |
| <code>mountPath</code> 必须位于 <code>scope</code> 内 | <code>identity.scope-excludes-mount-path</code> |
| <code>serviceWorkerUrl</code> 必须位于 <code>scope</code> 下 | <code>identity.service-worker-outside-scope</code> |
| <code>manifestUrl</code> 必须位于 <code>scope</code> 下 | <code>identity.manifest-outside-scope</code> |
| <code>environment</code> 只能匹配 <code>[a-z][a-z0-9-]*</code>（小写字母开头，仅含小写字母、数字和连字符） | <code>identity.invalid-environment</code> |
| Vite <code>base</code> 必须位于 <code>scope</code> 内 | <code>compile.public-path-outside-scope</code> |
| <code>scope</code> 必须等于 <code>serviceWorkerUrl</code> 所在目录 | <code>identity.scope-outside-worker-directory</code> |

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
| <code>POLICY.offlineFallback.path</code> | <code>"/offline.html"</code> | 仍为 <code>"/offline.html"</code> |
| <code>POLICY.resources[].pathPrefix</code> | <code>"/assets"</code> 等 | 仍为 <code>"/assets"</code> 等 |

例如策略中的 <code>/offline.html</code> 会解析为 <code>/app/offline.html</code>。不要在策略路径前重复写 <code>/app</code>，否则会变成 <code>/app/app/offline.html</code>。把图标放在项目的 <code>public/icons/</code>，构建后确认站点确实能从 <code>/app/icons/</code> 返回这些文件。若增加截图或快捷方式，也要将它们的 URL 改为部署路径内的真实文件或页面。

<code>serviceWorkerUrl</code> 必须直接位于 <code>scope</code> 目录下：<code>scope: "/app/"</code> 搭配 <code>/app/assets/sw.js</code> 会以 <code>identity.scope-outside-worker-directory</code> 构建失败，因为浏览器默认只允许 worker 控制它所在目录及以下的路径，平台也不支持用 <code>Service-Worker-Allowed</code> 响应头放宽。

若同一域名下同时部署根应用与 `/m/` 子应用，还需要共享登记表和根 worker 排除规则，按[同源多应用部署示例](/operations/release#root-mobile-paths)配置并发布。

## 资源规则的写法约束

<code>resourceClass</code> 只能取 <code>asset</code>、<code>navigation-public-static</code>、<code>navigation-public-dynamic</code>、<code>public-data</code>、<code>session-data</code>、<code>mutation</code>、<code>stream</code>、<code>unclassified</code>。前四类可以缓存；后四类（<code>session-data</code>、<code>mutation</code>、<code>stream</code>、<code>unclassified</code>）是拒绝类，只接受 <code>cache: "none"</code>，写其他值会以 <code>policy.unsafe-cache-strategy</code> 失败。

<code>pathPrefix</code> 的写法与匹配：

- 必须是规范路径：以 <code>/</code> 开头，除根路径 <code>"/"</code> 外不能以 <code>/</code> 结尾，不能含 <code>*</code>（无通配符），否则 <code>path.invalid</code>。
- 按完整路径段匹配、忽略查询串：<code>/assets</code> 匹配 <code>/assets/app.js</code>，不匹配 <code>/assets-old</code>。
- 同一前缀（URL 解码后）不能出现两次，否则 <code>compile.duplicate-path-prefix</code>。
- 拒绝类前缀之内不能再放允许缓存的规则，例如已有 <code>{ pathPrefix: "/api", resourceClass: "session-data", cache: "none" }</code> 时，再写 <code>/api/catalog</code> 的 <code>public-data</code> 规则会以 <code>compile.allow-under-deny</code> 失败；需要公开的接口应放在另一个不在拒绝前缀下的路径。
- 多条规则重叠时，拒绝规则优先，其次是更长的前缀。

导航规则（<code>navigation-public-static</code>、<code>navigation-public-dynamic</code>）上写 <code>cache</code> 不会改变导航行为：只要没被拒绝，所有导航都是 network-first，回退顺序见[离线体验](/guide/offline)。

## 策略只声明意图

应用不能向平台注入任意 Service Worker 代码、Workbox 路由或 callback。平台会把策略编译为 <code>PwaPlan</code>，自动合并不可覆盖的安全拒绝规则。完整资源分类与准入条件见[缓存安全模型](/architecture/security)。

下一步：选择[离线体验](/guide/offline)和[安装与更新](/guide/updates)的交互，再按[上线前检查](/start/checklist)验证。
