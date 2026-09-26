# 规格：capability-comparison

## 目标

让评估者同时看清 PWA Platform 与常见 PWA 接入工具的职责差异，以及它和成熟开源应用在产品能力覆盖上的差异。对照不能把工作区功能算作已发布功能，也不能根据截图或仓库搜索不到代码推断其他项目没有某项能力。

## 范围与原则

- 工具职责对照和应用能力对比分页维护；应用户要求，首页展示带图例的完整应用矩阵，并链接逐项来源页。
- 对照 PWA Platform、vite-plugin-pwa、Workbox 与 PWABuilder；注明前三者侧重接入层，PWABuilder 还覆盖项目模板和商店打包。
- 只依据各项目官方文档与本仓库公开契约描述；优先描述“如何提供”与“谁负责”，避免没有来源的二元评分。对照注明核查日期和来源。
- 将 npm `0.1.0` 正式包与仍在工作区的私有功能分区说明；注明核查时十个公开包的 `latest` 均为 `0.1.0`，Vite 5 兼容和默认更新 UI 已进入正式包。
- 原截图中的 Elk、HA 等属于业务应用，版本、部署和交互差异较大；应用矩阵固定官方仓库提交与核查日期，确认不了的格子写“未确认”，不把搜索不到当作“不支持”。

## 验收

1. 工具页、应用页与首页、侧边栏互链；大表在手机端局部横向滚动，站点构建通过。
2. 每项外部产品描述有直接的官方来源；本平台状态与公开发布和源码一致。
3. 工具页说明 SPA 页面刷新与 Service Worker 接管是不同动作，默认 UI 的发布状态和宿主定制范围明确；应用页注明快照提交、证据边界和非排名性质。

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
| production-readiness-documentation | follow | 应用矩阵由生产审核模块提出并验证，本模块只维护能力对比事实源。 |
| capability-comparison | create | 新增公开对照页及本模块事实记录。 |
| examples-browser-e2e | follow | 不修改该权威文档。 |
| pwa-entry-resilience | follow | 不修改该权威文档。 |
| ssr-adapters | follow | 不修改该权威文档。 |
| shared-origin-topology | follow | 不修改该权威文档。 |
| push-module | follow | 不修改该权威文档。 |
| public-read-cache | follow | 不修改该权威文档。 |
