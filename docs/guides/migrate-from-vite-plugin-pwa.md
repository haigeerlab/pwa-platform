# 从 vite-plugin-pwa 迁移到 PWA 平台

> 适用对象：使用 Vite 构建、当前用 `vite-plugin-pwa` 提供 PWA 能力的 Vue 3 或 React 19 单页应用。
> 依据：本仓库 `0.1.0` 正式包与当前源码，截至 2026-09-26；Vite 5 与开发服务行为已发布。示例配置取自 `packages/examples-browser-e2e/apps/`；vue-vben-admin 的情况见[分析报告](../product/vben-admin-pwa-analysis.md)。
> 标注“**需实测**”的内容只在源码层面核对过，还没有在真实接入中验证。第四节的 vben 专项已在 2026-09-18 做过真实接入试验，结果见[分析报告第七节](../product/vben-admin-pwa-analysis.md#七真实接入试验结果2026-09-18)。

Vite 5 + Vue 3.4 应用可优先使用[业务项目接入作业单](vite5-vue34-host-integration.md)；若有混淆或 CSS 清理插件，仍须在宿主仓库检查插件链。

## 一、先确认能不能迁

| 条件 | 要求 | 不满足时 |
|---|---|---|
| Vite | 已发布 0.1.0：`^5.0.0 || ^8.0.0` | 固定安装 0.1.0，并用真实业务构建验证 |
| 框架 | Vue `^3.4.0` 或 React `^19.2.0` | 其他框架没有绑定，只能直接用 client-runtime，本指南不覆盖 |
| `base` | 同源的绝对路径，以 `/` 开头、以 `/` 结尾，例如 `/` 或 `/admin/` | 相对路径 `./` 与完整 URL 会在构建时报错 |
| 部署形态 | 一个源上只有这一个 PWA，或按 [ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md) 登记的根应用与子路径应用 | 其他形态暂不支持 |
| 包的获取 | 十个 npm 包已发布 `0.1.0`，`latest` 指向此版 | 固定 0.1.0 并验证真实业务构建 |

## 二、能力对照

| vite-plugin-pwa | 本平台 | 差异 |
|---|---|---|
| `VitePWA({ manifest })` | `pwa({ identity, install, policy, topology })`，manifest 由 `identity` 与 `install` 生成 | `id`、`scope`、`start_url` 由身份统一推导，不能单独写错 |
| `workbox.globPatterns` | `policy.resources` 中 `resourceClass: "asset"` 的规则 | 按路径前缀声明，不用 glob。没有规则覆盖的构建产物不会被预缓存 |
| `workbox.runtimeCaching` | `PwaPolicy v3` 可显式缓存同源公共 GET | 仅经公共响应准入的读取可使用 `network-first` 或 `stale-while-revalidate`；私有、写入、流媒体和未分类请求仍不缓存，见[公共读取缓存](public-read-cache.md) |
| `navigateFallback` | `policy.offlineFallback` | 平台的导航是网络优先；断网时依次尝试同一 URL、目录下的 `index.html`、离线页 |
| `registerType: "prompt"` + `useRegisterSW` | 绑定里的 `state.updateWaiting` + `applyUpdate()` | 只有提示模式，不跳过等待，也不自动刷新页面 |
| `registerType: "autoUpdate"` | 不支持 | 平台要求用户确认后才切换版本（[ADR-0005](../adr/0005-update-prompt-and-recovery-worker.md)） |
| `injectRegister` / `virtual:pwa-register` | 应用显式调用 `register()` | 不调用就没有 Service Worker |
| 定时 `registration.update()` | `checkForUpdate()` 与 `updateCheck: { intervalMs }` | 见[第三节第 6 步](#6-更新提示与主动检查更新)，[ADR-0020](../adr/0020-client-update-check.md) |
| 私有接口：需要自己不配缓存规则 | 默认拒绝：未分类、会话数据、写操作、流媒体一律不接管 | 更安全，但要把接口前缀声明清楚 |
| 登出时自己清缓存 | `logout()` 注销注册 | v1 不缓存私有数据；启用 v2 离线写时，worker 先清专属队列，失败则不注销 |
| 开发环境 `devOptions` | 0.1.0 的 `vite dev` 可加载页面配置，但不生成 worker | 开发入口不要调用 `register()`；用 `vite build` + `vite preview` 验证离线与更新 |

## 三、迁移步骤

### 1. 关掉 vite-plugin-pwa

从 Vite 配置里删掉 `VitePWA(...)`，并删除应用里对 `virtual:pwa-register` 的引用。项目如果用环境变量控制开关（vben 用的是 `VITE_PWA`），就让它保持关闭，并删掉 CI 中临时打开它的步骤。

两个插件不能同时启用：两边都会生成 manifest 和 worker 脚本。

### 2. 写身份、安装信息与策略

建议集中写在一个文件里，例如 `src/pwa/identity.ts`：

```ts
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";

export const BASE = "/"; // 与 Vite 的 base 相同

export const IDENTITY: PwaIdentity = {
  appId: "admin",
  manifestId: BASE,
  origin: "https://admin.example.com", // 生产部署的源
  scope: BASE,
  serviceWorkerUrl: `${BASE}sw.js`,
  manifestUrl: `${BASE}manifest.webmanifest`,
  mountPath: BASE,
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: BASE,
  display: "standalone",
  name: "Admin Console",
  shortName: "Admin",
  themeColor: "#1677ff",
  backgroundColor: "#ffffff",
  icons: [
    { src: `${BASE}icons/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${BASE}icons/512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
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
    { pathPrefix: "/api", resourceClass: "session-data", cache: "none" },
  ],
};
```

要点：

- **身份一旦上线就不可变**（[ADR-0004](../adr/0004-identity-is-immutable-after-production-registration.md)）。`scope`、`serviceWorkerUrl`、`manifestId` 与缓存命名空间，上线前就要定好；改动需要 ADR 和迁移计划。
- **`policy` 里的路径是相对挂载路径的**。挂载在 `/admin/` 时，`/offline.html` 指的是 `/admin/offline.html`；写成 `/admin/offline.html` 会变成 `/admin/admin/offline.html`，构建会失败。
- **只写导航规则不会预缓存页面**。应用外壳（`/index.html`）、离线页和每个产物目录都要各写一条 `asset` 规则。
- **路径前缀按完整路径段匹配，不支持通配。** `/assets` 能匹配 `/assets/x.js`，但 `/assets-` 匹配不到 `/assets-x.js`。多条规则同时命中时，先看拒绝规则，再按前缀长度，长的优先，所以 `/` 和 `/assets` 可以并存。
- **同源的接口前缀要显式声明**成 `session-data`（读）或 `mutation`（写）。不声明的请求平台也不接管，但写明之后，策略就能起到审计作用。跨源的接口 worker 一律不接管，不用声明。
- **`asset` 规则要写 `none` 以外的缓存策略才会被预缓存**，示例里用的是 `cache-first`。其他类别即使写了 `network-first` 之类的策略，worker 在 v1 也不会执行。
- **`asset` 规则一个产物都没匹配到时，构建会给出警告 `compile.asset-rule-unmatched`**，可以借此发现写错的目录名。

### 3. 接入 Vite 插件

```ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { BASE, IDENTITY, INSTALL, POLICY } from "./src/pwa/identity";

export default defineConfig({
  base: BASE,
  plugins: [pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL, topology: { kind: "standalone-origin" } })],
});
```

插件在构建时生成 manifest、打包平台 worker 并注入预缓存清单，最后校验产物；缺少计划需要的产物时，构建失败。

**有构建后混淆的项目：**把 `pwa()` 放在混淆插件之后。若混淆插件在 Vite 生成指纹文件名后改写代码，还必须设置固定随机种子，并在相同源码上连续构建两次，比对所有同名 JS/CSS 的 SHA-256。隔离 Vite 5 夹具中的混淆步骤未设置固定随机种子时，实测同名 JS 内容不同而 worker 不变；设置固定种子后才稳定。不能用关闭指纹或只刷新页面掩盖这一问题，因为旧页面仍可能请求同名但内容已改变的资源。

图标与离线页放进 `public/`，路径要与 `INSTALL.icons` 和 `offlineFallback.path` 对应。不要引用第三方 CDN 上的图标。

**manifest 链接由插件注入。** 构建时，插件会在每个 HTML 入口的 `<head>` 里注入 `<link rel="manifest" href="<identity.manifestUrl>">`，`index.html` 里不用再写（[ADR-0022](../adr/0022-vite-injects-manifest-link.md)）。如果原来已经手写了：

- 地址必须是逐字等于 `identity.manifestUrl` 的 `/` 路径，或位于 `identity.origin` 且路径相同的完整 URL；相对写法和带 `<base>` 的页面会构建失败。满足条件的链接会原样保留，不会重复注入；需要加 `crossorigin` 之类属性时，可以继续手写。
- 地址不一致、指向其他源，或者一页里有多个，构建会失败。删掉旧链接，交给插件注入即可。

### 4. 声明虚拟模块的类型

插件通过虚拟模块 `virtual:pwa-config` 把页面配置交给应用。0.1.0 可在 `tsconfig.json` 的 `compilerOptions.types` 中加入 `"@pwa-platform/vite/virtual"`，同时保留项目原有类型：

```json
{
  "compilerOptions": {
    "types": ["vite/client", "@pwa-platform/vite/virtual"]
  }
}
```

### 5. 安装绑定并注册

Vue：

```ts
// main.ts
import config from "virtual:pwa-config";
import { createPwa } from "@pwa-platform/vue";

app.use(createPwa({ config }));
```

```ts
// 根组件或布局组件的 setup
import { usePwa } from "@pwa-platform/vue";

const pwa = usePwa();
if (import.meta.env.PROD) void pwa.register(); // 只在生产包注册；绑定不会自动注册
```

React：

```tsx
import config from "virtual:pwa-config";
import { PwaProvider, usePwa } from "@pwa-platform/react";

<PwaProvider config={config}>{children}</PwaProvider>;
// 组件内：const pwa = usePwa(); useEffect(() => { if (import.meta.env.PROD) void pwa.register(); }, [pwa]);
```

绑定返回的 `state` 包含 `registered`、`installEligible`、`installed`、`updateWaiting` 四个布尔值；方法有 `register`、`promptInstall`、`applyUpdate`、`logout`、`checkForUpdate`。0.1.0 已发布可显式挂载的可选更新提示，使用方式见[安装与更新](../../website/guide/updates.md)。安装按钮仍由应用决定。

### 6. 更新提示与主动检查更新

```ts
// state.updateWaiting 为真时显示提示；用户确认后：
await pwa.applyUpdate(); // 新版本接管，页面不会被自动刷新
location.reload();       // 是否刷新由应用决定
```

后台类应用常常整天不刷新页面，浏览器因此发现不了新版本。可以打开自动检查：

```ts
app.use(createPwa({ config, updateCheck: { intervalMs: 5 * 60_000 } })); // Vue
// <PwaProvider config={config} updateCheck={{ intervalMs: 5 * 60_000 }}> // React
```

- 间隔下限是 60 秒。页面在后台时不检查，回到前台时补检一次。
- 每次检查都会绕过 HTTP 缓存请求一次 `serviceWorkerUrl`，部署时要算进服务器的请求量（[运行手册](../operations/release-and-incident-runbook.md)）。
- 也可以手动调用 `pwa.checkForUpdate()`。它的返回值只作参考，是否提示仍以 `updateWaiting` 为准。
- 如果应用原来有自己的“检测新版本”组件（比如轮询首页 `ETag`），建议换成上面的做法。两套机制同时存在时，用户可能先看到“刷新”，刷新后页面却仍由旧 worker 控制。

### 7. 登出

登出流程里调用 `await pwa.logout()`。它不删除 Cache Storage；v1 不缓存私有数据，因此不需要额外清理。若应用启用了协调 v2 离线写，`logout()` 会先要求当前 worker 清除 identity 专属的离线写队列并等待确认；清理超时、协议错误或删除失败时返回 `false` 并保留 registration，应用应中止自己的登出完成步骤而不是自行删除 IndexedDB。

### 8. 可选：显式离线写

只有业务能为请求提供服务端可原子认领的幂等键，并能提供不含 PII/token 的 opaque session binding 时，才可在 v2 policy 中声明受限 `offlineWrites` target。应用随后在 worker 已控制页面后调用 `createOfflineWriteQueue({ scope })`；它只支持已声明 target 的 JSON `POST` 入队、显式 `flush(binding)` 与 `clear()`，不接手 `fetch`、不自动重放。服务端必须把同一幂等键与请求摘要原子绑定；网络超时属于未知结果，可能重送同一键。

不要让业务自行猜数据库名或调用 `indexedDB.deleteDatabase`。完整配置、状态分类与服务端责任见 [离线写规格](../../spec/offline-write-extension.md)。

### 9. 验证

1. `vite build`，然后 `vite preview`（开发服务器没有 worker）。
2. 浏览器开发者工具中确认：worker 的 scope 等于 `identity.scope`；manifest 的 `id`、`start_url` 正确；Cache Storage 里只有应用外壳、离线页和各产物目录下的文件，没有接口响应。
3. 断网刷新：应用外壳或离线页能打开，不出现白屏。**断网前先清空浏览器的 HTTP 缓存**（开发者工具里的 “Disable cache” 或清除缓存），不只是 Cache Storage：带指纹的资源按基线返回 `immutable`，HTTP 缓存会让没被预缓存的文件照样加载成功，把缺陷掩盖掉。
4. 重新构建、部署一个新版本，不刷新页面：打开了 `updateCheck` 就等一个间隔；没打开就手动调用 `checkForUpdate()`。确认出现更新提示，确认后新版本接管。
5. 部署时按[运行手册](../operations/release-and-incident-runbook.md)的响应头基线配置服务器：worker 脚本与 manifest 用 `no-cache`，带指纹的资源用 `immutable`。

## 四、vue-vben-admin 专项

这一节按 vben v5（提交 `df014ae`）的源码整理，并在 2026-09-18 用 `apps/web-antd` 做过真实接入试验（本机 Chrome 153）。除特别标注外，下面的结论都经过实测。

- **关掉原插件**：各应用的 `.env.production` 保持 `VITE_PWA=false`，删掉 `.github/workflows/deploy.yml` 里用 `sed` 打开它的步骤。vben 原来的 worker 从来没有注册过（`injectRegister: false`，也没有手动注册），所以用户浏览器里没有需要替换的旧注册。
- **加插件**：vben 的 `defineConfig` 用 `mergeConfig` 合并应用的 `vite` 字段，插件数组会拼接，在应用的 `vite.config.ts` 里写 `vite: { plugins: [pwa({...})] }` 即可。
- **产物目录**：vben 按扩展名分目录输出（`assetFileNames: '[ext]/[name]-[hash].[ext]'`，chunk 在 `js/`，入口在 `jse/`）。先构建一次，看 `dist` 的顶层目录，给每个目录写一条 `asset` 规则，例如 `/js`、`/jse`、`/css`，以及实际出现的图片、字体目录。
- **运行时配置文件是当前最大的缺口。** vben 构建时在产物根目录生成 `_app-config-<版本>-<哈希>.js`，`index.html` 直接引用它，生产环境只从它设置的全局变量读配置（`packages/effects/hooks/src/use-app-config.ts`）。
  - 文件名每次构建都会变，而路径前缀按完整路径段匹配，写不出能覆盖它的规则。于是它不会被预缓存，**断网时应用外壳加载不到它，应用起不来**。试验中已复现：页面一直停在 vben 的启动动画上。
  - 关掉 `extraAppConfig` 行不通：生产环境会拿不到配置。
  - 可行的绕法：修改 vben 自己的 `internal/vite-config/src/plugins/extra-app-config.ts`，把文件输出到一个子目录（例如 `config/`），再写一条 `/config` 的 `asset` 规则。这是接入方代码里的改动，平台不需要改。试验中照此修改后，断网时首页和 hash 路由都能完整打开。注意 `fileName` 和注入到 `index.html` 的 `src` 两处都要改。
  - 平台侧是否要支持“根目录下带哈希的单个文件”，留作待评估的问题。
- **路由**：vben 生产环境用 hash 路由，所有导航都落在首页文档上。断网时会命中预缓存的 `index.html`，试验中 `#/analytics` 这样的路由能正常离线打开。
- **新版本检测组件**：vben 默认开启 `check-updates.vue`，每分钟用 HEAD 请求比对首页 `ETag`。按第三节第 6 步，建议关掉它：在应用的 `src/preferences.ts` 里用 `defineOverridesPreferences` 覆盖 `app: { enableCheckUpdates: false }`，改用平台的 `updateCheck` 和 `updateWaiting`。如果要保留，两套提示需要在应用层合并成一个。
- **接口**：vben 的 `VITE_GLOB_API_URL` 通常是跨源地址，worker 本来就不接管。如果生产环境通过同源的 `/api` 代理，就把 `/api` 声明为 `session-data`。
- **预缓存体积**：vben 的产物较多，任一条预缓存下载失败都会导致安装失败。试验中 `web-antd` 的预缓存是 215 个条目、约 3.77 MB，在本机回环地址上首个 worker 激活用时约 1.3–3.4 秒。真实网络下的耗时与成功率仍要在目标环境里测。

## 五、迁移后暂时得不到的能力

- 任意运行时缓存：只支持显式允许的同源公共 GET；私有、写入、流媒体和未分类请求不缓存。
- 推送通知与显式离线写队列：工作区包尚未公开发布；后台同步也未提供。
- manifest 的 `share_target`、自动更新模式、周期同步、角标：未提供；`shortcuts` 与 `screenshots` 已在 beta 包中提供。

## 六、迁移时的注意事项

- **旧缓存不会被平台清理。** 平台 worker 只管理自己命名空间下的缓存，vite-plugin-pwa 留下的 Workbox 缓存会一直留在用户浏览器里。如果原来的 worker 真的注册过，需要评估这部分存储占用。**需实测。**
- **worker 地址变了的情况。** 同一个 scope 只有一个注册，用新的脚本地址注册会替换原注册。原来的 worker 在所有标签页关闭前，仍然控制已打开的页面。
- 遇到构建报错时，错误信息里给的是诊断码和契约路径，不会回显配置的值；诊断码的定义见 `packages/contracts/src/diagnostics.ts`。
