# npm 正式版发布记录：0.1.0

> 状态：候选已完成真机和归档验收；registry 发布与读回结果在实际执行后补录。

## 范围与通道

本次候选为十个公开包：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`entry-resilience`、`vue`、`react`。所有包版本为 `0.1.0`，使用 npm `latest` 标签。发布顺序依照[npm 发布流程](../../docs/operations/npm-package-release.md)。源码提交在发布前固定并记录于下节。

本次只依据 **`desktop`** 通道判定。Chrome 桌面 154.0.8037.57 与 153.0.8010.53 均有完整浏览器矩阵和原生安装观察；Android 只有一台实体设备，不能满足 `desktop+android` 的 N/N-1 两机条件。Android 与 iPhone 的真机结果如实保存在[验收记录](verification.md)，不得据此宣称手机通道通过。Safari iPhone 离线恢复后曾短暂显示 `not registered`，已安装 worker 仍控制页面，结束应用重开后恢复；根因未确定，记录为渐进兼容差异。

## 候选与门禁

- 运行环境：macOS arm64，Node 22.22.0，pnpm 11.18.0。独立消费夹具使用 Vite 5.0.0、Vue 3.4.0 和 React 19.3.0。
- 已完成：全仓构建、类型检查、lint、单元测试、文档构建、`check:publish`、依赖审计；Chrome 154/153 的全仓浏览器回归均为 228/228 通过（九套件，0 失败、0 跳过），新增的单 Origin 故障用例在两版各通过。浏览器日志分别为 `/private/tmp/pwa-stable-release-browser154.log`（SHA-256 `d9c9cfa0975fd42d2aad0070baf22d3ccef1c09320d43e32317be43987e6d296`）和 `/private/tmp/pwa-stable-release-browser153.log`（SHA-256 `20dcce3e2cd66a077f0d20227d24d93c4d92e97006e7c53897ccbaf440d21b8e`）。其余结果见[验收记录](verification.md)。
- 十包从最终构建打包；共检查 497 个归档文件、README、LICENSE、公开 exports 与内部依赖版本，未见私有项目资料或多余源码。独立宿主从这些 tarball 安装后类型检查、生产构建均通过。
- 发布源码提交：待固定。npm CLI 已验证登录到有权操作此 scope 的账号；2026-09-26 16:00 UTC 左右，公共 registry 中十个 `0.1.0` 版本 URL 全部返回 404。既有九包的 `latest` 均为 beta.1、`next` 均为 beta.2；`entry-resilience` 为新包。发布后的版本、`latest`、registry tarball 与候选内容读回：待执行。

| 包 | 候选 tarball SHA-256 |
| --- | --- |
| `@pwa-platform/contracts` | `8be07d523a0f04916e47ab7bf06c0a60c8ed28bf53f3a0407bce000323179b06` |
| `@pwa-platform/core` | `3eb1282acf846aa963f171699d59466699b17ba895852ff2ba4e7ae2e9569d05` |
| `@pwa-platform/engine-workbox` | `da304930f83400b8f41ec5c536531cb5af20e0f8d1537bfe376a2275dcdd735d` |
| `@pwa-platform/build-verifier` | `1bfd574cfb8864355e491a54f0f5e1989d66a06fa3f8ec321896985a4aaa8164` |
| `@pwa-platform/sw-runtime` | `8c5665277b230a744d9331bfec07b4a6a2d72dd13a9763a5795f96cc53a7c589` |
| `@pwa-platform/client-runtime` | `cd558d70ad9dcd10ea722f00b0657f2f972ae8e793f72e71ae0679de31104cd4` |
| `@pwa-platform/vite` | `eedb3ab2aafb9246a9f953da7ff916dc29aec707086b7c3d7751915bad03a609` |
| `@pwa-platform/entry-resilience` | `1d65f7f4767e1ae963f6d5d15cfa8f15185d576347cfe53e6d07489082e3e913` |
| `@pwa-platform/vue` | `8b9b20ac7c4fb56c3ce92dd6505171fd3f7c3deb736959d14748062e9e827dad` |
| `@pwa-platform/react` | `7eed61dd96e8d20275bbcc50bf0f951eef5a16d77fc94f4b5b7fa15e739deaad` |

正式包可被安装不代表任何业务宿主已具备生产发布证据。首次业务部署仍须验证真实 origin、路径、响应头、更新、离线与回退。
