# 规格：capability-comparison

## 目标

让评估者看清 PWA Platform 与常见 PWA 接入工具的职责差异，并能判断当前 npm 包是否满足其项目。对照不能把工作区功能算作已发布功能，也不能根据应用截图推断其他项目没有某项能力。

## 范围与原则

- 在文档站设置独立的工具能力对照页，首页只放入口和一句定位，不塞入横向大表。
- 对照 PWA Platform、vite-plugin-pwa、Workbox 与 PWABuilder；注明前三者侧重接入层，PWABuilder 还覆盖项目模板和商店打包。
- 只依据各项目官方文档与本仓库公开契约描述；优先描述“如何提供”与“谁负责”，避免没有来源的二元评分。对照注明核查日期和来源。
- 将 `0.1.0-beta.1` 已发布能力与尚未发布的 Vite 5 兼容、默认更新 UI 分区说明。不得给后者提供可直接安装的命令。
- 原截图中的 Elk、HA 等属于业务应用，版本、部署和交互差异较大；本页不依据截图为这些应用打分。

## 验收

1. 独立页面与首页、侧边栏互链；手机端可阅读，站点构建通过。
2. 每项外部产品描述有直接的官方来源；本平台状态与公开发布和源码一致。
3. 页面说明 SPA 页面刷新与 Service Worker 接管是不同动作，默认 UI 的发布状态和宿主定制范围明确。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不修改该权威文档。 |
| architecture | follow | 不修改该权威文档。 |
| developer-entry | follow | 不修改该权威文档。 |
| capability-map | update | 登记对照模块与依赖。 |
| decisions | follow | 不修改该权威文档。 |
| lifecycle-and-recovery | follow | 不修改该权威文档。 |
| ci-baseline | follow | 不修改该权威文档。 |
| supply-chain | follow | 不修改该权威文档。 |
| browser-matrix | follow | 不修改该权威文档。 |
| v1-acceptance | follow | 不修改该权威文档。 |
| identity-release-baseline | follow | 不修改该权威文档。 |
| release-and-incident | follow | 不修改该权威文档。 |
| recovery-drill | follow | 不修改该权威文档。 |
| browser-release-evidence | follow | 不修改该权威文档。 |
| package-distribution | follow | 不修改该权威文档。 |
| cloudflare-test-deployment | follow | 不修改该权威文档。 |
| browser-test-harness | follow | 不修改该权威文档。 |
| workbox-engine | follow | 不修改该权威文档。 |
| sw-runtime | follow | 不修改该权威文档。 |
| offline-write-extension | follow | 不修改该权威文档。 |
| build-verifier | follow | 不修改该权威文档。 |
| release-gate-contract | follow | 不修改该权威文档。 |
| local-ci-record | follow | 不修改该权威文档。 |
| release-orchestration-protocol | follow | 不修改该权威文档。 |
| vite-adapter | follow | 不修改该权威文档。 |
| client-runtime | follow | 不修改该权威文档。 |
| vue-react-adapters | follow | 不修改该权威文档。 |
| update-notice-ui | follow | 不修改该权威文档。 |
| capability-comparison | create | 新增公开对照页及本模块事实记录。 |
| examples-browser-e2e | follow | 不修改该权威文档。 |
| pwa-entry-resilience | follow | 不修改该权威文档。 |
| ssr-adapters | follow | 不修改该权威文档。 |
| shared-origin-topology | follow | 不修改该权威文档。 |
| push-module | follow | 不修改该权威文档。 |
| public-read-cache | follow | 不修改该权威文档。 |
