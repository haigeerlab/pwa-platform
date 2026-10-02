# npm 发布记录：0.3.2

> 状态：十个公开包已通过 npm 命令行发布，完成统一公开读回；文档更新待合入与部署。

## 范围与代码基点

相对 `0.3.1`，本版修复 Vite 宿主中 `public/` 下中文等非 ASCII 文件名的 URL 路径解析，并让平台的 `generateBundle` 钩子使用 Rollup 的 `post` 顺序。保留文件名中的字面 `@`，对 URL 中有特殊意义的 `?`、`#` 转义。公开 API、PWA 身份、Service Worker scope 与缓存策略不变；业务源码和素材无需改名。修复经 [PR #135](https://github.com/haigeerlab/pwa-platform/pull/135) 合入 `main`，合并提交为 `e19c540a91132458c421e949ac9e80e937ce467f`，其[完整 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36990292178) 成功。

发布分支 `release/npm-0.3.2` 从上述 `main` 提交创建，发布提交为 `d4cde4bc89adce7196caf905860c696ba2220f93`；相对 `main` 仅更改十包版本号和 Vite 随包 onboarding skill 版本。发布时工作树干净。十包统一为 `0.3.2`，Nuxt、Push、离线写入等私有包不发布。

## 候选检查

在发布提交上，`pnpm install --frozen-lockfile`、`pnpm build`、`pnpm check:publish` 和 `pnpm test:onboarding-smoke` 均通过。十个 `pnpm pack` 归档经独立临时项目离线安装，全部公开根入口可导入，归档中的公开依赖均已改写为 `0.3.2`，没有 `workspace:` 依赖。随包 onboarding skill 的十三个线上文档链接均返回 HTTP 200。

原 PC 项目的临时副本使用实际 `0.3.2` tarball 构建成功，保留了 33 个中文 `.svga` 文件名，并临时加入名为 `ç» 2 10@2x.png` 的 PNG；产物包含该 PNG。该文件名未在原项目中出现或被业务源码引用。原项目仍使用 `0.3.1`，尚未升级或重建。临时副本构建仍报告宿主 Sass 弃用与 CSS 语法警告，未出现平台文件名校验错误。

| 包 | 已发布 tarball SHA-256 |
| --- | --- |
| contracts | `2a7929a9d7046978cc27f04d8250e8aae7765fb0d07ee806a85f4424ecf1c1c0` |
| core | `b7982c04dfb0949874387aa03a71c7ee1ab9fd510bf7ca04ea09d8c51675a9c4` |
| engine-workbox | `d583b80312120b813bcb23e436e7e13dcf2281dcbefb1e65883876cbcba4c4da` |
| build-verifier | `6e1970c26b755b2a61ba29aee201e1430f6647a2b05be6e83aa8e16f15368925` |
| sw-runtime | `c00d36fc2539cef54e9474102b0e0261f17dd74ca9823e0450a21091106fac9b` |
| client-runtime | `26ca27650d5d95ba813a8d175aa5201b12641b4546cf4ddf03759a90b9f2f2fa` |
| vite | `39d6e7c316ecb9307b67c75e6e38a352a132529a5d093f7aedd5f30fd8ea21f9` |
| entry-resilience | `3bdec5a10ecc5fd3a019a587eb43a538066cb720b432df78eaaeb276e7edc46b` |
| vue | `993c132cf2c4cf20e65c835e92e4d02e8c3e2a88a06e21c70845a5c79945e7c3` |
| react | `55e6556d97b7db77b536403736c193118d8c29087e878ae7cbda5fba3938b7f6` |

## 命令行发布与统一读回

发布前 `npm whoami` 为 `jianian`，该账号是 `pwa-platform` 组织 owner；十包线上最新版本均为 `0.3.1`，`0.3.2` 未占用，npm 暂存列表为空。按依赖顺序用 `npm stage publish <tarball> --access public --tag latest` 连续提交十包；整批暂存后按依赖顺序执行 `npm stage approve <stage-id>`，各包所需的 npm 安全密钥身份验证完成。全部命令成功返回后，暂存列表为空。

随后统一从公共 registry 读回：十包 `version` 与 `dist-tags.latest` 均为 `0.3.2`；十个 tarball 均返回 HTTP 200，下载内容与上表本地候选逐字节一致。全新临时消费项目以 `npm install` 从公共 registry 安装十包与所需 peer 依赖，十个已安装包版本均为 `0.3.2`，十个公开根入口全部导入成功。

包可安装不代表原 PC 项目或任何业务应用通过生产部署门禁。原项目的版本升级与构建仍需单独执行；文档站的版本展示更新也不改变此结论。
