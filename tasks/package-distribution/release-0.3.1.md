# npm 发布记录：0.3.1

> 状态：十个 npm 包已发布并完成公开读回；文档站更新待合入与部署。执行顺序见[本次计划](release-0.3.1-plan.md)。

## 范围

相对已发布的 `0.3.0`，本版修复 Windows 上 Vite 构建的 bundle URL 路径、入口恢复页的本地文件入口路径，以及仓库 pnpm 子进程启动。公开 API、PWA 身份、scope 与缓存策略不变。十个公开包统一升级 `0.3.1`；Nuxt、Push、离线写入等私有包不发布。

## 候选门禁

候选基点为合入 Windows 修复的 `main` 提交 `99c5055b1c5076322800db618226b19f250270d7`。该提交的 [GitHub CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36969134484) 七项任务全部通过，包括 Windows build、Node 22/24、Chrome、Edge、WebKit/Firefox 与真实 FCM。候选变更只涉及版本元数据、随包文案、发布检查、changelog 与本记录。[PR #131](https://github.com/haigeerlab/pwa-platform/pull/131) 合入为 `fc335992b31803e343a2329d33358c6635f754af`；该最终 `main` 提交的 [CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36971756682) 七项任务全部成功。

本地候选环境：macOS arm64、Node 24.18.0、pnpm 11.18.0、Chromium 154.0.8037.93。

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过；878 个锁文件条目通过供应链策略，锁文件未修改 |
| `pnpm lint`、`pnpm build`、`pnpm typecheck` | 通过 |
| `pnpm test` | 通过，全部 16 个工作区测试套件 |
| `pnpm test:browser` | 通过；Chrome 全套，含 Vite、入口恢复及 React/Vue 宿主 |
| `pnpm test:onboarding-smoke` | 通过；候选 tarball 安装的宿主 4 项 |
| `pnpm docs:build`、`pnpm docs:check-evidence`、`pnpm docs:check-public-api` | 通过；网站当前仍与 npm `0.3.0` 匹配 |
| `pnpm check:publish`、`pnpm test:release-branch` | 通过；十个公开包元数据与分支规则 |
| `pnpm test:browser:engines` | 通过；WebKit／Firefox 合计 122 项通过、50 项按配置跳过 |
| `pnpm test:browser:network` | 本地未运行；最终发布提交的 CI 中真实 FCM 任务通过 |
| `pnpm audit --ignore-registry-errors` | 7 项：1 low、2 moderate、4 high；全部是私有 Nuxt 包的开发依赖链（`devalue`、`node-forge`），未进入本次十个公开包的生产依赖链；按手册为非阻塞报告 |

十个候选 tarball 均为 `0.3.1`，含 README 和 MIT LICENSE，`exports` 目标存在，无 `workspace:*` 依赖、测试目录、环境文件或多余 skill。从独立临时项目安装十包并导入全部公开根入口通过；依赖树内 26 处公开包引用均为 `0.3.1`。

| 包 | 候选 tarball SHA-256 |
| --- | --- |
| contracts | `a4db95c0aeb2ff0b0c6618e368a4ee950eb3921c074498f17f73f0aeb197b66b` |
| core | `90306e9e38ccafa981cb013efa076e2706b66c7a9db3e18df95ef6c62df2ca79` |
| engine-workbox | `63a0d0d79e85771f61ec615e423ade611f12acd3d957180cab22ce9d409515f5` |
| build-verifier | `8048fbda5fd905e64cdd2084765fefff5561b32ab13192fa2427d6acc7bbd544` |
| sw-runtime | `9d7ffd66214f3dc3fe2aa65ba114e2b93be44271bc15f80fad598a838fce0018` |
| client-runtime | `0f23ac6521b11ed7b27e3d8845f1388430357cb9e875f38eb5beb6000f05ce1e` |
| vite | `39298d0fede82798968cdb681f2112804b3b81feeb0c799cd4e92a08192f9d72` |
| entry-resilience | `1e8d38bdfa28c95f2ee37355dd41855af7d8af45e40634f0c9132f1ebc7687dd` |
| vue | `8dc2970c52c8cdb2b9c77158c09abacf5a3c18743049f08ed8b728180aa133e8` |
| react | `11e039a24605dfa274042fd4652ef1a1c2ce441318f52718ebfc4c56714c72f3` |

## 发布与读回

`v0.3.1` 标签和 `release/npm-0.3.1` 分支均固定于 `fc335992b31803e343a2329d33358c6635f754af`，发布时分支干净。发布前网站 `website/` 与当前文档站生产分支内容一致，随包 onboarding skill 的 12 个线上链接均返回 200；`npm whoami` 为 `jianian`，目标 `0.3.1` 的十包均未被占用。

从固定发布分支重新构建并打包十包。与候选 tarball 相比，八包字节相同；`client-runtime`、`vite` 的归档仅因 `package.json` 中 `devDependencies` 键顺序不同而变化，JSON 值及其他解包文件均相同。最终发布归档的 SHA-256 如下：

| 包 | 已发布 tarball SHA-256 |
| --- | --- |
| contracts | `a4db95c0aeb2ff0b0c6618e368a4ee950eb3921c074498f17f73f0aeb197b66b` |
| core | `90306e9e38ccafa981cb013efa076e2706b66c7a9db3e18df95ef6c62df2ca79` |
| engine-workbox | `63a0d0d79e85771f61ec615e423ade611f12acd3d957180cab22ce9d409515f5` |
| build-verifier | `8048fbda5fd905e64cdd2084765fefff5561b32ab13192fa2427d6acc7bbd544` |
| sw-runtime | `9d7ffd66214f3dc3fe2aa65ba114e2b93be44271bc15f80fad598a838fce0018` |
| client-runtime | `6ffb73f4d3afbf0a2699ae87746ded76144ebd68f4e610e620edb3d9043366cd` |
| vite | `85dd01d0ad4034040ea3a74dcc9792fb297f4b44b20ccbaedd54ad0eb99d510c` |
| entry-resilience | `1e8d38bdfa28c95f2ee37355dd41855af7d8af45e40634f0c9132f1ebc7687dd` |
| vue | `8dc2970c52c8cdb2b9c77158c09abacf5a3c18743049f08ed8b728180aa133e8` |
| react | `11e039a24605dfa274042fd4652ef1a1c2ce441318f52718ebfc4c56714c72f3` |

按项目所有者要求，先用 `npm stage publish <tarball> --access public --tag latest` 连续提交十包，整批提交后统一核对暂存版本、公开权限和 SHA-1；十包均进入 `staged`。之后按依赖顺序逐包完成 npm 的触控 ID 认证与 `npm stage approve`。首轮认证超时，状态仍为十包暂存；重新认证后十包全部批准成功，没有重发已暂存版本。

批准完全部十包后统一从公共 registry 读回：十包 `dist-tags.latest` 均为 `0.3.1`，十个 tarball 均返回 200，SHA-1 与 registry 元数据一致，下载归档与上表对应的本地归档逐字节相同。全新临时消费项目以 `npm install --ignore-scripts` 从公共 registry 安装十包，十个根入口导入成功，依赖树中的平台包全部为 `0.3.1`，无嵌套旧版。

文档站发布后补记版本分支、部署 ID 和线上核验结果。业务应用生产验收仍由各通道独立执行。
