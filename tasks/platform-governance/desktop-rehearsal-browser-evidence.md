# 浏览器发布证据：`rehearsal-desktop-cloudflare-2026-09-22`（演练）

> **演练记录，不对应任何真实的生产发布。** 按[生产发布浏览器证据](../../docs/operations/browser-release-evidence.md#发布证据记录模板)的模板填写，环境是 Cloudflare 测试站。它是[桌面发布演练清单](desktop-release-rehearsal.md)第 2 项的产出，接续 [verification.md](verification.md) 中"修订演练 D5"那份本地预览下的演练记录。
>
> 每一格都注明证据来源。"现场"指在 Cloudflare 测试站上取得；"本地自动化"指 `examples-browser-e2e` 等包在本机 fixture 上的真实浏览器测试，不能代替现场证据。

## 发布上下文

| 字段 | 值 |
| --- | --- |
| 发布尝试 ID | `rehearsal-desktop-cloudflare-2026-09-22`（演练） |
| 发布通道 | `desktop`（创建时确定，未更改） |
| 已知 Android 问题（`desktop` 通道必填） | React 示例在 Chrome Android 152 上未取得安装事件（[examples-browser-e2e 验证记录](../examples-browser-e2e/verification.md) 的 T14）；Chrome Android N 从未取得。本通道不在 Android 上做任何检查，也不做任何保证（ADR-0030） |
| CI 证据形式 | **本地替代**（[ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md)）：2026-09-23 对候选提交 `e7458f3cbff7da1f4079b5326e9bab4a1ae911e0` 运行 `pnpm gate:local`，Node 22.22.0 与 24.18.0 各七项退出码全为 0，结论通过，签署人 **hageer**。记录在仓库外 `pwa-release-records/local-ci-2026-09-23-e7458f3/`（`record.md` SHA-256 前 16 位 `09ac170753bcd4ae`）。替代理由：仓库账号 `haigeermail` 令牌失效，无法取得真实 CI；GitHub 恢复后须补跑 |
| 应用与稳定槽位 | React / Vue 的 Cloudflare `main`（`https://pwa-platform-react-demo.pages.dev/app/`、`https://pwa-platform-vue-demo.pages.dev/app/`）；恢复演练在隔离槽位 `drill` |
| 候选构建 | 线上 v2，由 `e7458f3` 以 `--release=v2` 构建；当前生产部署 React `8589bf50-b6d2-493f-9551-ea4b7dd8adec`、Vue `8472fc4d-ca25-45ca-a4f1-1237db6be642` |
| 受保护环境 | Cloudflare Pages 测试站（身份环境为 `test`，不是生产） |
| 执行日期（UTC） | 2026-09-21 至 2026-09-23（各项见证据引用） |
| 执行者 | Claude（自动化、部署与记录）；项目所有者（原生安装点击） |
| Platform 审阅者 | 未指定 |
| Product fixture 确认 | 未指定 |
| Infrastructure 环境确认 | 未指定 |

## 必测浏览器环境

| 平台 | 层级 | 完整 Chrome 版本 | 操作系统及版本 | 设备/主机型号 | Android 自动更新状态与 Google Play 轮换记录 | 日期（UTC） | 执行者 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop | N | 153.0.8010.50（2026-09-21 现场）、153.0.8010.53（2026-09-22 恢复演练；2026-09-23 原生安装，由 DevTools 协议读取） | macOS 15.7.3 | 本机 Mac（arm64） | 不适用 | 2026-09-21 至 2026-09-23 | Claude、项目所有者 | [Cloudflare 验证记录](../cloudflare-test-deployment/verification.md)；原生安装见下文 |
| Chrome Desktop | N-1 | Chrome for Testing 152.0.7977.82 | macOS 15.7.3 | 本机 Mac（arm64） | 不适用 | 2026-09-21 至 2026-09-23 | Claude、项目所有者 | 同上"桌面 Chrome N-1 门禁"与恢复演练两节；原生安装见下文 |
| Chrome Android | N | 不在本通道 | — | — | — | — | — | — |
| Chrome Android | N-1 | 不在本通道 | — | — | — | — | — | — |

## V1 场景结果

| 平台 | 层级 | 首次在线访问 | 后续离线访问 | 未缓存/隐私/流式响应 | 更新检测 | 异常恢复 worker | Vue 示例安装 | React 示例安装 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop | N | 通过（现场） | 通过（现场） | 有条件通过：现场不适用，以本地真实浏览器自动化为准（见下文"隐私与流式响应的判定"）；现场只证明了请求到 404 时保留网络响应 | 通过（现场） | 通过（现场，`drill`） | 通过（现场，含已安装窗口离线重载） | 通过（现场，2026-09-23 含已安装窗口离线重载） | 见下注 1 |
| Chrome Desktop | N-1 | 通过（现场） | 通过（现场） | 有条件通过：现场不适用，以本地真实浏览器自动化为准（同上） | 通过（现场，`drill`：恢复演练第 4 步检测到等待中的新版本并受控激活） | 通过（现场，`drill`） | 通过（现场，2026-09-23，含已安装窗口离线重载） | 通过（现场，2026-09-23，含已安装窗口离线重载） | 见下注 2 |
| Chrome Android | N | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | — |
| Chrome Android | N-1 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | — |

注 1（N）：[Cloudflare 验证记录](../cloudflare-test-deployment/verification.md)的"T3/T4 首次线上部署与桌面 Chrome 现场验证"（首次在线）、"main v2 桌面受控更新与离线模拟补验"与"Vue 自动后置门禁、生产历史保留审计与真实断网导航"（离线、更新）、"桌面 Chrome 原生安装与已安装窗口离线重载"（安装）、"`drill` 槽位按模板的恢复演练"（恢复）。本地自动化见 [verification.md](verification.md) 的 D5。

注 2（N-1）：同一验证记录的"桌面 Chrome N-1 门禁"：Chrome 152 访问 React/Vue 的 `main` 与 `drill` 四个槽位，取得 controller、预缓存与断网离线页；同一 Chrome 152 下本地 39 个浏览器场景 37 通过、2 跳过（见下文"N-1 的两项跳过"）。恢复见"`drill` 槽位按模板的恢复演练"。

注 3（N-1 更新检测）：2026-09-22 恢复演练第 4 步在两站 `drill` 发布修复后的 worker；Chrome for Testing 152.0.7977.82 的页面检测到等待中的新版本并显示更新提示，驱动脚本等待 `#apply-update` 出现且可点击后点击（该按钮只在页面检测到等待中的新版本时出现，`recovery-drill-driver.mjs` 第 178 行），新 worker 随后激活，断网重载显示 `v2`。证据：`pwa-release-records/recovery-drill-2026-09-22/react-run2/step4.json`（`1f3db124221e`）与 `vue/step4.json`（`c5223de648d3`）。按本模块部署契约第 7 条，提示更新本就在隔离槽位演练，因此计为现场证据。2026-09-23 补引用，未重测。

### 隐私与流式响应的判定

项目所有者 2026-09-23 决定：**本演练中该场景现场不适用，以本地真实浏览器自动化证据为准。**

- 两个测试站都是纯静态 Pages 站点，没有私有接口，也没有流式响应；现场验证需要先向测试站部署专门的动态端点，属于为补演练证据而扩大测试站范围，不做。
- 该场景验证的是 Service Worker 对这类请求拒绝缓存的判定，已在本机真实 Chrome N 与 N-1 上由自动化测试覆盖；现场只多证明"CDN 不改写这类响应"，而测试站不产生这类响应。
- **业务项目发布时必须现场验证**：业务项目有真实的私有与流式端点，其每次发布的浏览器证据记录不得沿用本判定。

### N-1 的两项跳过

2026-09-21 的 N-1 门禁中，39 个场景有 2 项跳过，原因是浏览器没有自行触发真实的 `beforeinstallprompt`（[Cloudflare 验证记录](../cloudflare-test-deployment/verification.md)"桌面 Chrome N-1 门禁"一节）。这两项属于**安装资格**场景，其余 37 项覆盖首次在线、离线、更新、恢复与发布检查。判定：这两项不能计为通过；N-1 的安装资格事件由 D5 的 `install.spec.ts`（本地，D3 之后能取得真实 `beforeinstallprompt`）与原生安装记录另行证明，但**不是现场证据**。

## 原生安装记录

| 平台 | 层级 | 应用 | 安装资格事件 | 安装完成 | 独立窗口启动 | 起始 URL | 期望/观察到的 display-mode | 已安装窗口离线重载 | 事件顺序 | 状态 | 证据引用（SHA-256 前 12 位） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop 153.0.8010.53 | N | React 示例（Cloudflare `main`） | 观察到（页面出现 Install） | 观察到（页面显示 installed） | 是：安装后点击"打开" | `/app/` | standalone / standalone | 通过：文档来自 Service Worker，状态 200，显示 `v2` | eligible → installed → standalone | 通过 | `install-react-N.json`（`b50bb5bec5d9`） |
| Chrome Desktop 153.0.8010.53 | N | Vue 示例（Cloudflare `main`） | 观察到 | 观察到 | 是：安装后点击"打开" | `/app/` | standalone / standalone | 通过：同上 | eligible → installed → standalone | 通过 | `install-vue-N.json`（`e65d95ee148b`） |
| Chrome for Testing 152.0.7977.82 | N-1 | React 示例（Cloudflare `main`） | 观察到 | 观察到 | 是：安装后未点"打开"，改从生成的应用快捷方式启动 | `/app/` | standalone / standalone | 通过：同上 | eligible → installed → standalone | 通过 | `install-react-N-1.json`（`c00572dad7b9`） |
| Chrome for Testing 152.0.7977.82 | N-1 | Vue 示例（Cloudflare `main`） | 观察到 | 观察到 | 是：安装后点击"打开" | `/app/` | standalone / standalone | 通过：同上 | eligible → installed → standalone | 通过 | `install-vue-N-1.json`（`7f9b3443db27`） |

2026-09-23 在 Cloudflare `main` 现场取得，四项都用全新的临时浏览器配置。分工：Claude 以驱动脚本启动浏览器、经 DevTools 协议读取完整版本、等待并点击页面内的 Install 按钮（DevTools 输入属于可信用户手势）；浏览器自身的安装确认框只能人工操作，由项目所有者点击"安装"与"打开"；独立窗口出现后，脚本读取 `display-mode` 与版本，再做离线重载。

- **离线重载同时让页面与 Service Worker 断网。** 平台 worker 对导航是网络优先，只让页面断网时 worker 仍可联网取回文档，会假通过。脚本对页面与 worker 两个调试目标都设置离线，并在 worker 内发一次请求确认失败（四项均为 `network-failed:TypeError`），然后重载：四项的文档都来自 Service Worker、状态 200，页面显示 `v2` 与应用壳标题。之后恢复网络。
- **N-1 React 未点"打开"。** 安装完成后没有打开应用窗口，Claude 以 `open` 启动这次生成的应用快捷方式，得到独立窗口；与 D5 第四项相同，满足"独立窗口启动"。
- **2026-09-21 的两项 N 安装记录被本次取代。** 当时未写明浏览器版本与 display-mode 观察值（Vue 应用 ID `echimdikjbkcoalacaabgelfcipfckfc`，React 应用 ID `gnaioiedojpgpkkjjbmbkhckniddkeki`，见 Cloudflare 验证记录"桌面 Chrome 原生安装与已安装窗口离线重载"），本表以 2026-09-23 的完整记录为准。
- 证据在仓库外 `~/Documents/haigeer-labs/pwa-release-records/desktop-install-cloudflare-2026-09-23/`（四份结果 JSON 与驱动日志 `driver.log`，`c264832144db`）；驱动脚本 `pwa-release-records/tools/native-install-driver.mjs`（`0e9d5f56bf66`）。结果文件不含响应体。
- 结束后四个测试浏览器已关闭，临时配置已删除，本次新生成的四个应用快捷方式已移到废纸篓（其中一个因重名改名为 `PWA Platform Vue Demo (N-1 2026-09-23).app`）；之前已有的快捷方式未动。

本地预览下的四项原生安装（D5）见 [verification.md](verification.md)，可作为操作方法的参考。

## 恢复演练

| 演练子记录 | 控制权已获得 | 无 fetch 拦截 | 仅删除当前应用缓存前缀 | 修复 worker 后恢复离线启动 | 状态 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- |
| React `drill`（N 与 N-1） | 通过 | 通过 | 通过 | 通过 | 通过 | `pwa-release-records/recovery-drill-2026-09-22/react-run2/recovery-drill-record.md`（SHA-256 前缀 `f27960f0729e920a`） |
| Vue `drill`（N 与 N-1） | 通过 | 通过 | 通过 | 通过 | 通过 | `pwa-release-records/recovery-drill-2026-09-22/vue/recovery-drill-record.md`（SHA-256 前缀 `81431fbae4a99a11`） |

React 的第一次运行因驱动脚本缺陷无效，已如实记录后重做，见 [Cloudflare 验证记录](../cloudflare-test-deployment/verification.md)"`drill` 槽位按模板的恢复演练"。

## 最终结论

| 检查 | 结论 | 说明 |
| --- | --- | --- |
| 发布通道 | `desktop` | 必测平台为 Chrome 桌面端 N 与 N-1 |
| 必测平台与 N/N-1 完整记录 | 通过 | N 与 N-1 的完整版本均已记录（原生安装为 2026-09-23 的现场记录） |
| 全部 V1 场景 | 有条件通过 | 条件：隐私/流式响应按"隐私与流式响应的判定"以本地真实浏览器证据为准（项目所有者 2026-09-23 决定）；N-1 更新检测引用 `drill` 恢复演练的现场证据（注 3） |
| 原生安装 | 通过 | 2026-09-23 现场四项（N/N-1 × Vue/React）全部通过，含已安装窗口离线重载 |
| 恢复演练 | 通过 | 两站 `drill`，N 与 N-1 |
| V1 发布证据 | **有条件通过** | 条件有三：隐私/流式响应按本记录的判定以本地真实浏览器证据为准；CI 为已签署的本地替代记录，GitHub 恢复后须补跑；另见发布演练清单，机器门禁的 `release-retention` 仍因历史发布缺计划未执行（第 3 项） |

## 补齐原生安装缺口（已完成）

2026-09-23 已按上文"原生安装记录"的方式补齐：原计划由项目所有者全程手工执行，实际改为 Claude 驱动浏览器、项目所有者只点击浏览器安装确认框。之后如需重做，运行 `node ~/Documents/haigeer-labs/pwa-release-records/tools/native-install-driver.mjs <新的证据目录> <新的临时配置目录>`，按系统通知依次点击四个确认框的"安装"与"打开"。
