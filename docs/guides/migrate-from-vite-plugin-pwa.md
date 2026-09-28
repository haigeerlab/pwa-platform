# 从 vite-plugin-pwa 迁移到 PWA 平台

通用的迁移步骤、能力对照和先决条件检查已合并进文档站的[从 vite-plugin-pwa 迁移](https://pwa-platform-docs.pages.dev/guide/migration)（本仓库源文件：`website/guide/migration.md`）。请以文档站为准；本文件保留仅为兼容旧链接，并保留下面这段仅供内部参考的专项案例。

Vite 5 + Vue 3.4 应用的具体接入作业单见 [vite5-vue34-host-integration.md](vite5-vue34-host-integration.md)（内部文档）。

## 内部专项案例：vue-vben-admin（保留，不代表通用指导）

> **内部文档。** 以下内容按 vben v5（提交 `df014ae`）的源码整理，并在 2026-09-18 用 `apps/web-antd` 做过真实接入试验（本机 Chrome 153），与内部分析报告 [vben-admin-pwa-analysis.md](../product/vben-admin-pwa-analysis.md) 配套阅读。这是针对一个具体第三方模板的接入记录，不是平台通用指导；通用做法（例如运行时配置脚本要移入固定子目录）已经吸收进文档站的迁移指南。

- **关掉原插件**：各应用的 `.env.production` 保持 `VITE_PWA=false`，删掉 `.github/workflows/deploy.yml` 里用 `sed` 打开它的步骤。vben 原来的 worker 从来没有注册过（`injectRegister: false`，也没有手动注册），所以用户浏览器里没有需要替换的旧注册。
- **加插件**：vben 的 `defineConfig` 用 `mergeConfig` 合并应用的 `vite` 字段，插件数组会拼接，在应用的 `vite.config.ts` 里写 `vite: { plugins: [pwa({...})] }` 即可。
- **产物目录**：vben 按扩展名分目录输出（`assetFileNames: '[ext]/[name]-[hash].[ext]'`，chunk 在 `js/`，入口在 `jse/`）。先构建一次，看 `dist` 的顶层目录，给每个目录写一条 `asset` 规则，例如 `/js`、`/jse`、`/css`，以及实际出现的图片、字体目录。
- **运行时配置文件是当前最大的缺口。** vben 构建时在产物根目录生成 `_app-config-<版本>-<哈希>.js`，`index.html` 直接引用它，生产环境只从它设置的全局变量读配置（`packages/effects/hooks/src/use-app-config.ts`）。
  - 文件名每次构建都会变，而路径前缀按完整路径段匹配，写不出能覆盖它的规则。于是它不会被预缓存，**断网时应用外壳加载不到它，应用起不来**。试验中已复现：页面一直停在 vben 的启动动画上。
  - 关掉 `extraAppConfig` 行不通：生产环境会拿不到配置。
  - 可行的绕法：修改 vben 自己的 `internal/vite-config/src/plugins/extra-app-config.ts`，把文件输出到一个子目录（例如 `config/`），再写一条 `/config` 的 `asset` 规则。这是接入方代码里的改动，平台不需要改。试验中照此修改后，断网时首页和 hash 路由都能完整打开。注意 `fileName` 和注入到 `index.html` 的 `src` 两处都要改。
  - 平台侧是否要支持"根目录下带哈希的单个文件"，留作待评估的问题。
- **路由**：vben 生产环境用 hash 路由，所有导航都落在首页文档上。断网时会命中预缓存的 `index.html`，试验中 `#/analytics` 这样的路由能正常离线打开。
- **新版本检测组件**：vben 默认开启 `check-updates.vue`，每分钟用 HEAD 请求比对首页 `ETag`。建议关掉它：在应用的 `src/preferences.ts` 里用 `defineOverridesPreferences` 覆盖 `app: { enableCheckUpdates: false }`，改用平台的 `updateCheck` 和 `updateWaiting`。如果要保留，两套提示需要在应用层合并成一个。
- **接口**：vben 的 `VITE_GLOB_API_URL` 通常是跨源地址，worker 本来就不接管。如果生产环境通过同源的 `/api` 代理，就把 `/api` 声明为 `session-data`。
- **预缓存体积**：vben 的产物较多，任一条预缓存下载失败都会导致安装失败。试验中 `web-antd` 的预缓存是 215 个条目、约 3.77 MB，在本机回环地址上首个 worker 激活用时约 1.3–3.4 秒。真实网络下的耗时与成功率仍要在目标环境里测。
