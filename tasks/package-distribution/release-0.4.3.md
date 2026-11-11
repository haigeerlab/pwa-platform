# npm 发布记录：0.4.3

> 2026-11-11：十个公开包已发布到 `latest`，完成公开读回与全新消费。接入方在 Safari 13.1／14.1 上的复测待补记。

## 范围与基点

本版包含：

1. [PR #148](https://github.com/haigeerlab/pwa-platform/pull/148)：修复 Safari 13 上 worker 不接管请求、丢弃更新确认的问题。根因是内部 `canParseUrl` 对显式 `undefined` 基址执行 `new URL`，Safari 13 会抛错（见 [0.4.1 记录的更正](release-0.4.1.md)）。
2. [PR #147](https://github.com/haigeerlab/pwa-platform/pull/147) 中的产物变化：
   - 生成的 worker 显式以最低浏览器版本为构建目标；
   - 更新提示条按钮间距不再用 flex `gap`，宽度在 `min()` 前加 `24rem` 回退。

计划见 [release-0.4.3-plan.md](release-0.4.3-plan.md)。

- 准备 PR [#149](https://github.com/haigeerlab/pwa-platform/pull/149) 的合并提交是 `59ffd72`，该提交的 main CI 七项全部通过；门禁已包含 `pnpm check:browser-floor`。`v0.4.3` 标签与 `release/npm-0.4.3` 分支都固定于该提交。
- 从合并提交重新打包的十个包，与已做过消费验证的候选包逐文件一致：只有 `package.json` 的依赖键顺序不同，排序后完全相同。

## 发布与集中读回

- 在交互式终端中按依赖顺序连续提交。第一个包 contracts 的网页身份验证链接超时，npm 查询验证结果时返回 E404，contracts 未提交。随后 core 的验证完成，其余九个包都返回 0。之后单独重新提交 contracts：沿用已完成的验证，返回 0，再单独批准。
- contracts 公开之前，其余九个包已陆续公开，最早在 09:10:31Z。在 contracts 公开的 09:13:08Z 之前，安装任何依赖 contracts 0.4.3 的包都会失败，这个空窗约 3 分钟。
- 2026-11-11T09:13:18Z 集中读回：十个包的 `latest` 均为 0.4.3，tarball 均返回 HTTP 200，SHA-256 与发布归档一致，平台内部依赖全部为 0.4.3。

| 包 | 发布时间（UTC） | SHA-256 |
| --- | --- | --- |
| contracts | 09:12:45 | `9db101f320e2c980f81ee370f7647af5de7b44375ce16a2f3215b9787ca9e26d` |
| core | 09:09:14 | `27b47df3490d240fe904aa969b7fcabd2973dae06f3f5b58631bada3443dc299` |
| engine-workbox | 09:12:49 | `2ec9d070d6fab0579ee1e939fc3082f35cb6bdf3d2aae723c2185a45e1e80e66` |
| build-verifier | 09:11:53 | `8dbd412b932f0131746efa9e35d219cc749676830bc9b35b2ca30ed02e36fa48` |
| sw-runtime | 09:09:23 | `9a01da2e09da57c74119321039935b34e49b7f05cae2fbcec497ee797ce07cce` |
| client-runtime | 09:10:56 | `3ea17872299251a25f9e5c7e1abd1a9cc0f76ae79f1631a2b020b9b874025462` |
| vite | 09:12:00 | `a344ae4240118c855ec9c1af7435fe1c45d6c27a81cab03479f2c9edfea60ec4` |
| entry-resilience | 09:10:00 | `0043b346790ca0da79abe79e30c9d262d0f0278c5fc81ec6bd15442b1e918466` |
| vue | 09:10:33 | `7571c4ed4ce65064dfb87e3865550bc8b017b504eb60b7d700cac670e8ea0ea1` |
| react | 09:10:05 | `783837ffeaad6b2fa61777afbe3450d229386407402925052cd13879f41d6ed1` |

## 全新消费

三个只从公共 registry 安装的全新项目都构建通过：Vite 8.3.0 + React 19.3.0、Vite 8.3.0 + Vue 3.5.42、Vite 5.4.21 + React 19.3.0。

- 锁文件中平台包的 resolved 地址全部是官方 registry，依赖闭包全为 0.4.3。
- 生成的 `sw.js` 中，`canParseUrl` 已带 `base === void 0` 分支；worker 与恢复 worker 通过 es-check（按 `.browserslistrc` 判定）。
- 打包后的 CSS 保留了 `@supports` 定位回退和外边距间距。
- **宿主 CSS 压缩会删掉宽度回退**：Vite 8 默认按新版浏览器压缩 CSS，把被 `min()` 覆盖的 `width: 24rem` 删掉了；Vite 5 保留了它。这只影响 Firefox 74 上提示条的宽度。需要支持旧浏览器的宿主应把 `build.cssTarget` 设为最低版本，这已写进文档站兼容页。

## 未完成

- 接入方用 BrowserStack 在 Safari 13.1 上复测（点“更新”能接管、服务端挂起时出现离线页、原有整套检查），并在 Safari 14.1 上作对照。有余力时加测 iOS 13.x。
