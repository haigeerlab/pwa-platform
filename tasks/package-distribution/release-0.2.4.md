# npm 发布记录：0.2.4

> 状态：十个 `0.2.4` 包已发布至 npm，`latest` 均指向 `0.2.4`（2026-09-29 16:20:39 UTC 全部可下载）。读回的 tarball integrity 全部一致，内容与审核的候选包一致；从 registry 安装的 Vite 5 + Vue 3.4 与 Vite 5 + React 19.2 项目类型检查与构建通过。批准顺序与依赖顺序不一致，造成约 4 分钟安装失败窗口，见"事件"。

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

执行人：项目所有者（npm 身份 `jianian`，2FA 与暂存批准由本人完成）。发布源为 `main` @ `147fb27`（#99 合并提交）的全新克隆，本地分支 `main` 跟踪 `origin/main`、工作区干净，不使用 `--no-git-checks`；按依赖顺序对十包执行 `pnpm publish --access public --tag latest`，十包均进入暂存（输出 `Published package` 时 tarball 仍为 404）。发布前从该提交重新构建并打包：6 包与候选字节相同，`client-runtime`、`entry-resilience`、`sw-runtime`、`vite` 4 包仅 `package.json` 内部依赖的键序不同，其余文件逐字节一致。键序是 pnpm 改写 `workspace:` 依赖时的波动，每次打包涉及的包不固定（读回比对时为下表另外 4 包），不影响内容。

| 包 | 公开（registry `time`，UTC） | SHA-256（前缀） | integrity 与下载一致 | 与审核候选比对 |
|---|---|---|---|---|
| contracts | 16:17:39 | `c2a51537` | ✅ | 相同 |
| core | 16:19:41 | `8086c264` | ✅ | 相同 |
| engine-workbox | 16:16:11 | `fee09d72` | ✅ | 相同 |
| build-verifier | 16:15:35 | `96ed1751` | ✅ | 内容相同（`package.json` 键序不同） |
| sw-runtime | 16:15:35 | `6c045e4a` | ✅ | 内容相同（`package.json` 键序不同） |
| client-runtime | 16:16:49 | `350ca136` | ✅ | 内容相同（`package.json` 键序不同） |
| vite | 16:15:59 | `060d0885` | ✅ | 内容相同（`package.json` 键序不同） |
| entry-resilience | 16:17:53 | `54d116ff` | ✅ | 相同 |
| vue | 16:15:44 | `d5ed9a6d` | ✅ | 相同 |
| react | 16:16:26 | `8ebda15d` | ✅ | 相同 |

## 事件

- **公开顺序与依赖顺序不一致（约 4 分钟安装失败窗口）**：`build-verifier`、`sw-runtime`、`vue`、`vite` 于 16:15:35–16:15:59 最先公开，而底层依赖 `contracts`（16:17:39）与 `core`（16:19:41）最后公开；16:15 至 16:20:39（十包 tarball 全部可下载）之间，安装 `@pwa-platform/vue@0.2.4` 等会因依赖尚不可下载而失败。未重发，窗口随 `core` 同步结束自行关闭。这是继 0.2.3 之后第二次出现同类窗口：发布流程第 9 条的"按依赖顺序批准、被依赖的包可下载后再批准下一层"需要在批准时逐层核对，而不只是按顺序点击。
- 发布命令最初由助手在会话中准备，自动权限分类器拒绝了助手直接执行发布，改由项目所有者在自己的终端执行同一组命令。

## 发布后验证

- 2026-09-29 16:20:39 UTC 读回：十包 `dist-tags.latest` 均为 `0.2.4`，`0.2.4` tarball 均返回 200，下载内容的 SHA-512 与 `dist.integrity` 一致；与审核候选比对见上表。`@pwa-platform/vite@0.2.4` 含 `skills/pwa-onboarding/SKILL.md` 与 `docs/`（11 页 + `README.md`，共 12 个文件）。
- 从 registry 安装（不使用本地 tarball；锁文件中 8 个 `@pwa-platform/*@0.2.4` 的 integrity 与 registry 一致）：
  - Vite 5.0.0 + Vue 3.4.0 + `@vitejs/plugin-vue` 5.0.0：`pnpm install`、`vue-tsc --noEmit`、`vite build` 均 exit 0。
  - Vite 5.0.0 + React 19.2.0：`pnpm install`、`tsc --noEmit`、`vite build` 均 exit 0。
  - 两个产物都含 `sw.js`、`pwa-recovery-worker.js`、`manifest.webmanifest`、`offline.html`；`node_modules/@pwa-platform/vite/` 下有 `docs/` 与 `skills/`。

