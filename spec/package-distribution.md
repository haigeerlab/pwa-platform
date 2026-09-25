# 规格：package-distribution

## 目标

让 Vite + Vue 或 Vite + React 的最小 PWA 接入包具备可复核的 npm 预发布条件。包可安装不代表业务应用通过生产发布门禁。

## 范围

- npm 组织：`@pwa-platform`；用户已确认公开 MIT 分发。
- 首批包：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`vue`、`react`。它们统一为 `0.1.0-beta.0`，默认 `next` 标签，公开 registry 与 MIT 许可证。
- 根项目、测试包、Nuxt 和 v1 后的可选包继续 `private: true`。
- 只改分发元数据、许可证、包说明和发布检查；不改变运行时 API、Service Worker 身份或缓存行为。

## 验收

1. 首批九包的生产依赖在首批集合内闭合，按依赖顺序可打包；tarball 中的 `workspace:*` 全部转为真实版本，所有 `exports` 路径存在。
2. 每个 tarball 含 README 与 MIT LICENSE；无仓库凭据、测试夹具、私有文件或未构建源码；从独立项目安装后公开入口可解析。
3. 冻结安装、lint、build、typecheck、单测、Chrome 桌面浏览器测试与依赖审计有本次候选证据；受限环境失败和产品失败分别记录。
4. 首次公开上传前确认账号、组织权限、版本可用性、完整 tarball 清单、签名/哈希与发布次序；实际上传另行执行。
5. 业务生产部署仍遵守按发布通道（ADR-0030）确定的浏览器 N/N-1、原生安装、真实响应头与恢复演练门禁，`desktop+android` 通道另要求 Android；这些证据不能由 npm 包测试替代。

## 非目标

初始准备阶段不发布包；经所有者后续明确指示，实际 npm 预发布作为独立步骤执行并记录。不创建 GitHub 对象，不把运行时业务数据缓存、Push、离线写入、Nuxt 或入口灾备放入首批 npm 分发。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| architecture | follow | 本次不改变该基线的权威文档或验收结论。 |
| browser-matrix | follow | 本次不改变该基线的权威文档或验收结论。 |
| browser-release-evidence | follow | 本次不改变该基线的权威文档或验收结论。 |
| browser-test-harness | follow | 本次不改变该基线的权威文档或验收结论。 |
| build-verifier | follow | 本次不改变该基线的权威文档或验收结论。 |
| capability-map | update | 新增 package-distribution 模块依赖与范围。 |
| ci-baseline | follow | 本次不改变该基线的权威文档或验收结论。 |
| client-runtime | follow | 本次不改变该基线的权威文档或验收结论。 |
| cloudflare-test-deployment | follow | 本次不改变该基线的权威文档或验收结论。 |
| decisions | create | 新增 npm 首批分发 ADR。 |
| developer-entry | update | 公开包的版本、范围和发布状态写入项目入口。 |
| examples-browser-e2e | follow | 本次不改变该基线的权威文档或验收结论。 |
| identity-release-baseline | follow | 本次不改变该基线的权威文档或验收结论。 |
| lifecycle-and-recovery | follow | 本次不改变该基线的权威文档或验收结论。 |
| local-ci-record | follow | 不改变该基线的权威文档或验收结论。 |
| offline-write-extension | follow | 本次不改变该基线的权威文档或验收结论。 |
| package-distribution | create | 新增本模块 spec、计划与发布操作说明。 |
| product-direction | follow | 本次不改变该基线的权威文档或验收结论。 |
| push-module | follow | 本次不改变该基线的权威文档或验收结论。 |
| pwa-entry-resilience | follow | 本次不改变该基线的权威文档或验收结论。 |
| recovery-drill | follow | 本次不改变该基线的权威文档或验收结论。 |
| release-and-incident | follow | 本次不改变该基线的权威文档或验收结论。 |
| release-gate-contract | follow | 本次不改变该基线的权威文档或验收结论。 |
| release-orchestration-protocol | follow | 本次不改变该基线的权威文档或验收结论。 |
| shared-origin-topology | follow | 本次不改变该基线的权威文档或验收结论。 |
| ssr-adapters | follow | 本次不改变该基线的权威文档或验收结论。 |
| supply-chain | follow | 本次不改变该基线的权威文档或验收结论。 |
| sw-runtime | follow | 本次不改变该基线的权威文档或验收结论。 |
| v1-acceptance | follow | 本次不改变该基线的权威文档或验收结论。 |
| vite-adapter | follow | 本次不改变该基线的权威文档或验收结论。 |
| vue-react-adapters | follow | 本次不改变该基线的权威文档或验收结论。 |
| workbox-engine | follow | 本次不改变该基线的权威文档或验收结论。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
