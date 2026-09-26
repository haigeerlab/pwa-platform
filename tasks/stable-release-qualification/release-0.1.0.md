# npm 正式版发布记录：0.1.0

> 状态：十个 `0.1.0` 正式包已发布至 npm；逐包读回 `latest`、完整 tarball 与完整性摘要均通过。

## 范围与通道

本次候选为十个公开包：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`entry-resilience`、`vue`、`react`。所有包版本为 `0.1.0`，使用 npm `latest` 标签。发布顺序依照[npm 发布流程](../../docs/operations/npm-package-release.md)。源码提交在发布前固定并记录于下节。

本次只依据 **`desktop`** 通道判定。Chrome 桌面 154.0.8037.57 与 153.0.8010.53 均有完整浏览器矩阵和原生安装观察；Android 只有一台实体设备，不能满足 `desktop+android` 的 N/N-1 两机条件。Android 与 iPhone 的真机结果如实保存在[验收记录](verification.md)，不得据此宣称手机通道通过。Safari iPhone 离线恢复后曾短暂显示 `not registered`，已安装 worker 仍控制页面，结束应用重开后恢复；根因未确定，记录为渐进兼容差异。

## 候选与门禁

- 运行环境：macOS arm64，Node 22.22.0，pnpm 11.18.0。独立消费夹具使用 Vite 5.0.0、Vue 3.4.0 和 React 19.3.0。
- 已完成：全仓构建、类型检查、lint、单元测试、文档构建、`check:publish`、依赖审计；Chrome 154/153 的全仓浏览器回归均为 228/228 通过（九套件，0 失败、0 跳过），新增的单 Origin 故障用例在两版各通过。浏览器日志分别为 `/private/tmp/pwa-stable-release-browser154.log`（SHA-256 `d9c9cfa0975fd42d2aad0070baf22d3ccef1c09320d43e32317be43987e6d296`）和 `/private/tmp/pwa-stable-release-browser153.log`（SHA-256 `20dcce3e2cd66a077f0d20227d24d93c4d92e97006e7c53897ccbaf440d21b8e`）。其余结果见[验收记录](verification.md)。
- 十包从最终构建打包；共检查 497 个归档文件、README、LICENSE、公开 exports 与内部依赖版本，未见私有项目资料或多余源码。独立宿主从这些 tarball 安装后类型检查、生产构建均通过。
- 发布后，在全新目录直接从 npm 安装全部十个 `0.1.0`（Node 22.22.0、Vite 5.0.0、Vue 3.4.0、React 19.3.0），`npm install`、TypeScript `--noEmit` 与 Vite 生产构建均退出 0；该检查使用 registry 分发物，不是本地 tarball。
- 发布源码提交：`870bf93a3ac78e4593f0916192a34448fd09e270`。发布前，公共 registry 中十个 `0.1.0` 均不存在。2026-09-26 UTC 按依赖顺序从此干净提交发布十包；逐包确认 `latest=0.1.0`、registry `dist.integrity` 与实际下载 tarball 一致、文件清单与候选一致。npm 重写了部分归档中 `package.json` 的字段顺序，逐字段 JSON 内容相同；除此之外所有文件逐字节相同。最终再次检查十个包的 `latest` 均为 `0.1.0`，内部依赖均精确指向 `0.1.0`；`vite` / `entry-resilience` peer 范围为 Vite 5 或 8，`vue` 为 Vue 3.4 起。

| 包 | 干净提交候选 SHA-256 | npm 下载 SHA-256 |
| --- | --- | --- |
| `@pwa-platform/contracts` | `8be07d523a0f04916e47ab7bf06c0a60c8ed28bf53f3a0407bce000323179b06` | `7c66f11909a442528f9614c1d1892d036efbb6bc92fdb9ab46e1017923c8e279` |
| `@pwa-platform/core` | `3eb1282acf846aa963f171699d59466699b17ba895852ff2ba4e7ae2e9569d05` | `c1e5781c31908b2b6aa0de8db7a34398d2ada5a4031423afa9aac828ef3c3fc0` |
| `@pwa-platform/engine-workbox` | `da304930f83400b8f41ec5c536531cb5af20e0f8d1537bfe376a2275dcdd735d` | `94b820a2902452edd2830063c981f97745e5f4d1a1264d65908b15a2660f6fc6` |
| `@pwa-platform/build-verifier` | `1cf14a15595a1b4a395bba13e12a489e272a878e575f9b54ca945a83470a0e31` | `38027db20e056b64523c60a5c2b4081f474b88ed15d73400b113d6ffeb90f433` |
| `@pwa-platform/sw-runtime` | `df20b3e987db0759ba097f644c2b1ffb7c8e6335d09f81e037160eed4288e609` | `1a11149a3c9e2e934f3c5fb5db9f0ac5b67240d627a9c50620d3c34cbfde731f` |
| `@pwa-platform/client-runtime` | `ff55207e7509bfbc86547f20370669e45973e71e5b37698209d6d5dfb6803add` | `c163ea29613a3223e9532dbd22c29b092edd4d048568eb6e36f0bb34f338e86e` |
| `@pwa-platform/vite` | `9fdaa6a4e55c98b2b9fc51167381a633c31cdc96fe334ff54b9b4582dd0d0c47` | `91b6133ea283ab5181e18e01f9a38d9c9c6520f5bfe5ab449b3ab568ae9e0ab0` |
| `@pwa-platform/entry-resilience` | `1d65f7f4767e1ae963f6d5d15cfa8f15185d576347cfe53e6d07489082e3e913` | `7c2d67726851b6bae79c978279a72796e369a4a614c02c8c8f3388b70142eb08` |
| `@pwa-platform/vue` | `8b9b20ac7c4fb56c3ce92dd6505171fd3f7c3deb736959d14748062e9e827dad` | `88e586769758f2834308876e8b9ed1a8d26cca60675c861324f8500b611c4a09` |
| `@pwa-platform/react` | `7eed61dd96e8d20275bbcc50bf0f951eef5a16d77fc94f4b5b7fa15e739deaad` | `cf482631f63b13e5104160fd7a1508d189d7dfa385e1ec8ea120b94df8946049` |

正式包可被安装不代表任何业务宿主已具备生产发布证据。首次业务部署仍须验证真实 origin、路径、响应头、更新、离线与回退。
