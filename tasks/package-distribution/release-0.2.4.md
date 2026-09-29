# npm 发布记录：0.2.4

> 状态：**候选已准备，尚未发布。** 发布、批准与读回由项目所有者在交互终端完成后补记本页"发布"与"发布后验证"两节。

## 范围与版本选择

十个公开包统一 `0.2.4`。自 `0.2.3`（`87e40a9`）以来，随包发布的内容只有下列变化；其余包只有 `package.json` 版本号变化（仓库内其余改动是不进入 `files` 的 `playwright.config.ts` 与测试）。详见 [CHANGELOG](../../CHANGELOG.md)。

| 包 | 改动 |
|---|---|
| `vite` | 首次随包发布 AI 接入清单 `skills/pwa-onboarding/SKILL.md`（ADR-0045，[#92](https://github.com/haigeerlab/pwa-platform/pull/92)、[#97](https://github.com/haigeerlab/pwa-platform/pull/97)）；随包发布清单所引文档页的离线副本 `docs/`（11 页，构建时由 `website/` 生成，ADR-0045 增补，[#98](https://github.com/haigeerlab/pwa-platform/pull/98)）；README 相应更新 |
| `vue`、`react` | 默认更新提示判定页面是否已是新代码，已是新代码时不再要求刷新（ADR-0046，[#95](https://github.com/haigeerlab/pwa-platform/pull/95)）；判定请求带 `__pwa-page-currency=1`，避免被旧 worker 的预缓存应答（[#96](https://github.com/haigeerlab/pwa-platform/pull/96)） |
| `sw-runtime` | 只有 README 中的当前版本号 |

本记录只说明库包分发，不构成任何业务应用的生产发布证据。

## 候选与门禁

- 准备提交：`release/0.2.4` @ `9159dc2`（基于 `main` @ `4392fc3`）；门禁针对该提交的包内容，本页与后续提交只改发布记录。
- 候选门禁在该提交的全新克隆上执行（2026-09-29，macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 154.0.8037.58）：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过（门禁脚本首次以单个参数调用 pnpm 报"命令不存在"，属脚本引号问题；在同一克隆中直接执行 exit 0） |
| `lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过（`check:publish`：10 个包） |
| `pnpm test` | 16 个套件共 2477 个用例通过，0 失败 |
| `pnpm test:browser` | 10 个套件共 289 个用例通过，0 失败 |
| `pnpm test:onboarding-smoke` | 4 个用例通过 |
| `pnpm test:browser:engines` | 291 通过、17 跳过（Chromium 专有用例；覆盖范围自 0.2.3 起已扩展，见 ADR-0042 增补） |
| `pnpm test:browser:network` | 本机未运行（需真实 FCM）；以 `main` CI 的 network job 为准 |
| `pnpm audit --ignore-registry-errors` | **1 个中危**：`undici` 7.29.0（GHSA-3wwx-pv8p-q78v，WebSocket permessage-deflate 解压未处理错误致 DoS，修复于 ≥7.29.1），路径 `.>wrangler>miniflare>undici`。只在根目录开发依赖（Cloudflare 部署工具）中，**不在任何公开包的依赖树里**。是否在发布前升级由项目所有者决定，见下文 |

- 逐包 `pnpm pack`：十包版本均为 0.2.4，内部 `@pwa-platform/*` 依赖精确为 0.2.4，无 `workspace:` 残留，未扫出密钥模式。`vite` 包含 `skills/pwa-onboarding/SKILL.md` 与 `docs/`（11 页 + `README.md`）。候选 tarball SHA-256 前缀：

| 包 | SHA-256（前缀） |
|---|---|
| contracts | `c2a51537` |
| core | `8086c264` |
| engine-workbox | `fee09d72` |
| build-verifier | `07d28db7` |
| sw-runtime | `dd26a9dc` |
| client-runtime | `8262497d` |
| vite | `ae018216` |
| entry-resilience | `5a57cff1` |
| vue | `d5ed9a6d` |
| react | `8ebda15d` |

- 独立消费验证（候选 tarball，经 `overrides` 指向本地文件）：
  - Vite 5.0.0 + Vue 3.4.0 + `@vitejs/plugin-vue` 5.0.0：`pnpm install`、`vue-tsc --noEmit`（2.2.12）、`vite build` 均 exit 0；导入 `@pwa-platform/vue`、`/ui`、`vite`、`contracts` 成功。
  - Vite 5.0.0 + React 19.2.0：`pnpm install`、`tsc --noEmit`、`vite build` 均 exit 0；导入 `@pwa-platform/react`、`/ui`、`vite`、`contracts` 成功。
  - 两个产物都含 `sw.js`、`pwa-recovery-worker.js`、`manifest.webmanifest`、`offline.html`；业务产物中含更新提示样式与 `__pwa-page-currency` 判定标记，不含清单或离线文档内容；`node_modules/@pwa-platform/vite/` 下有 `docs/` 与 `skills/`。
  - 候选 tarball 的哈希以最终从合并提交重新打包的结果为准；若合并提交与 `9159dc2` 的包内容不同，须重新打包比对。

## 发布前必须完成（[发布流程](../../docs/operations/npm-package-release.md)）

1. **文档站先于 `vite` 上线（第 11 条）**：当前线上为 `docs/v2026.09.27-2`，缺《服务器与 CDN 配置》《默认值与时间约定》，也没有"用 AI 引导接入"一节。须从本次发布合并提交建立新的 `docs/v…` 版本分支并部署，三项检查（`website/` 无差异、`SKILL.md` 链接全部 200、`id="ai-onboarding"` 存在）结果记入本页。
2. **按依赖顺序批准暂存版本（第 7–9 条）**：`contracts` → `core`／`engine-workbox`／`build-verifier` → `sw-runtime` → `client-runtime` → `vite` → `entry-resilience`／`vue`／`react`；被依赖的包可下载之前不批准依赖它的包。
3. 发布须在交互终端进行（2FA）；`409 previously staged`／`403 previously published`／`ERR_PNPM_OTP_NON_INTERACTIVE` 均表示已提交过，去批准或跳过，不要重发。
4. **`audit` 的开发依赖漏洞**：`undici` 7.29.0 只经根目录 `wrangler` 引入，不进入任何公开包。项目所有者决定：发布前按[依赖变更流程](../../docs/operations/dependency-changes.md)升级（另开 PR，合并后需重跑门禁），或记录为已知项照常发布。**决定（2026-09-29，项目所有者）：记录为已知项，照常发布 0.2.4**；依赖升级另行处理，不阻塞本次发布。

## 文档站发布（第 11 条）

- 2026-09-29：`#99` 合并提交 `147fb27` 的 `main` CI（run 36594306515）结论 success；阻塞项 Node 22／24、Chrome 通过，不阻塞的 Edge、真实 FCM 通过。不阻塞的引擎冒烟失败 1 例：Firefox 上 `client-runtime` `served-from-cache.spec.ts:59` 的在线预热请求未成功；前一次 `main`（`4392fc3`）在 Firefox 上失败的是另一例（`sw-runtime` `runtime-cache.spec.ts:231`），两者都不涉及本次改动的代码，候选门禁本机运行时均通过，按 Firefox 偶发失败处理并另行跟进。
- 从 `147fb27` 建立并推送 `docs/v2026.09.29`。上传前经 Pages API 只读核对：生产、预览自动部署关闭（`false`／`none`，总开关 `false`），当月四个 Pages 项目非跳过部署 136 次（Free 上限 500）；Pages Token 无读取账户套餐的权限，未重新确认套餐。产物 110 个文件、共约 3.3 MB，最大文件 316,725 字节，无 Functions 或 `_worker.js`。
- Production branch 由 `docs/v2026.09.27-2` 改为 `docs/v2026.09.29`，改后复读确认未产生部署（生产部署仍为 `ba3e33e4`）。
- 从该提交重新构建后以 Wrangler 手动上传一次：生产部署 ID `ff750f1b-1abb-432d-b8ee-b9128ed14fdd`，分支 `docs/v2026.09.29`，提交 `147fb27`。
- 三项检查全部通过：`git diff --stat origin/docs/v2026.09.29 147fb27 -- website/` 为空；`SKILL.md` 的 11 个文档站链接均返回 200；线上《选择接入包》含 `id="ai-onboarding"`（计数 1）。

## 发布

待发布后填写。

## 发布后验证

待发布后填写：十包 `latest` 与 `dist.integrity` 读回、与候选 tarball 比对、从 registry 安装 Vite 5 + Vue 3.4 与 Vite 5 + React 19.2 独立项目，并确认 `@pwa-platform/vite@0.2.4` 包内含 `skills/pwa-onboarding/SKILL.md` 与 `docs/`。
