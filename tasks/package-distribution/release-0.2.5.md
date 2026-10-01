# npm 发布记录：0.2.5

> 状态：十个 `0.2.5` 包已发布至 npm，`latest` 均指向 `0.2.5`（2026-10-01 03:22:01 UTC 全部公开）。读回内容与审核的候选包一致；文档站已先于发布从发布提交上线。批准顺序与依赖顺序不一致，造成约 2 分钟安装失败窗口，见“事件”。

## 范围与版本选择

十个公开包统一 `0.2.5`。自 `0.2.4`（`9159dc2`）以来，随包发布的内容只有 `@pwa-platform/vite` 有变化；其余九个包只有 `package.json` 的版本号与新增的本机测试脚本（`test:browser:real`、`test:browser:android`，不影响运行时）变化。详见 [CHANGELOG](../../CHANGELOG.md)。

| 包 | 改动 |
|---|---|
| `vite` | 不再随包发布文档副本：`files` 恢复为 `["dist", "skills"]`，删除 `scripts/bundle-docs.mjs`（ADR-0045 2026-09-30 增补，[#106](https://github.com/haigeerlab/pwa-platform/pull/106)）；AI 接入清单改为“在线文档站 → 仓库副本 → 停”，读副本时问一次位置、按路径换算、比较版本；新增第 6 步“本机自检”并写明完成标准（[#106](https://github.com/haigeerlab/pwa-platform/pull/106)）；自检使用独立浏览器配置文件并在结束后清理（[#107](https://github.com/haigeerlab/pwa-platform/pull/107)）；README 相应更新 |

本记录只说明库包分发，不构成任何业务应用的生产发布证据。

## 候选与门禁

- 准备提交：`release/0.2.5`，第一轮 @ `565cfa3`（基于 `main` @ `2f28e3a`）；依赖升级（[#113](https://github.com/haigeerlab/pwa-platform/pull/113)）后变基，第二轮 @ `6fc9553`。本页与门禁基线文字的后续提交不改变随包内容。
- 候选门禁在该提交的全新克隆上执行（第一轮 2026-09-30，第二轮 2026-10-01；macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 154.0.8037.59）。下表为第二轮结果：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过 |
| `lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过（`check:publish`：10 个包） |
| `pnpm test` | 16 个套件共 2511 个用例通过，0 失败（第一轮记录曾误写为 2556，按套件逐项相加两轮均为 2511） |
| `pnpm test:browser` | 10 个套件共 295 个用例通过，0 失败 |
| `pnpm test:onboarding-smoke` | 4 个用例通过 |
| `pnpm test:browser:engines` | 291 通过、17 跳过（Chromium 专有用例，与 0.2.4 相同） |
| `pnpm test:browser:network` | 本机未运行（需真实 FCM）；以 `main` CI 的 network job 为准 |
| `pnpm audit --ignore-registry-errors` | 无已知漏洞。第一轮报 13 个（4 高、6 中、3 低：`undici` 7.29.0 经 `wrangler`，`brace-expansion` 5.0.9 经 `eslint`），第二轮前又出现 1 个低危（`serialize-javascript` 7.1.1 经私有 nuxt 包）；均位于开发依赖、不在十个公开包的生产依赖树中，已由 [#113](https://github.com/haigeerlab/pwa-platform/pull/113) 升级修复 |

- 逐包 `pnpm pack`：十包版本均为 0.2.5。`vite` 包不含 `docs/`。与第一轮相比，`build-verifier`、`client-runtime`、`sw-runtime`、`vite` 的 tarball 哈希不同，差异只在 `package.json` 内部依赖的键顺序（pnpm 改写 `workspace:` 所致，按键排序后完全相同），其余文件一致。第二轮候选 tarball SHA-256：

| 包 | SHA-256 |
|---|---|
| contracts | `b1d80d303a8c8f609bf7f32ef9d7a172158883b248d180ead38ce4b165cb7393` |
| core | `c4b6f9ede17712ed684218ae03a9c41c0fc7a5c2bec2d86963c5a0b7ec82bcfc` |
| engine-workbox | `89ee8d51e7ea75bc690ea7f27622d2346e3cebed8c17a1a5509f7bb6354c9279` |
| build-verifier | `af6f3438597eb18d7bfa970a2e8b65b7b5f4f5871e654c57fa3a1f12b1b0739b` |
| sw-runtime | `de58103efd3c041f54f9e2829ac1c3056e4cda0b02231d662bbe535144b77665` |
| client-runtime | `d5f7978e19363eac2a729d5df476597a0837d5850c0d445c831363439812f674` |
| vite | `dd78cc7c2757dd43f12d7c67dd111f5a53147582011f22fe9d2ce22a2f353476` |
| entry-resilience | `4b0ea80277b08cb69e358e727374ee794487f5dd974d386de6dbcfb8184103ca` |
| vue | `4b6c3b2a4779bcf89b41e8bc7ee0f72b6ce8252ae30d0bf047ced682e59a5f94` |
| react | `dfc84b0fa31c6747e133fcdf90a9d896f16b0212e053a6581aaf27f6dac32c95` |

## 发布

- 发布提交：`main` @ `5a2ee76`（[#114](https://github.com/haigeerlab/pwa-platform/pull/114) 合并提交），文件树与门禁第二轮 `6fc9553` 对应提交相同（`c6ce0cf0…` → 合并后 `c45475b3…`，差异仅本记录）。标签 `v0.2.5` 指向该提交。
- 对该提交手动运行 CI（[run 36808744221](https://github.com/haigeerlab/pwa-platform/actions/runs/36808744221)）：Node 22、Node 24、Chrome 三项必需检查与 Edge、引擎冒烟、真实 FCM 三项不阻塞检查全部通过。
- 文档站先于 npm 上线（发布流程第 11 条），见[文档站构建与部署](../../docs/operations/documentation-site.md)的 2026-10-01 记录。
- 项目所有者在干净克隆（`main` @ `5a2ee76`）中执行 `pnpm publish --access public --tag latest` 逐包提交，十包全部进入暂存后在 npmjs.com 批准。
- 发布目录重新打包的 tarball 与门禁候选相比，`package.json` 以外的文件全部一致；`package.json` 仅内部依赖键顺序不同（按键排序后相同）。

## 读回

2026-10-01 03:41 UTC 起逐包读回：

- 十个 `https://registry.npmjs.org/@pwa-platform/<包>/-/<包>-0.2.5.tgz` 均返回 200，`dist-tags.latest` 均为 `0.2.5`（`next` 仍为历史的 `0.1.0-beta.2`）。
- registry tarball 与发布目录打出的包逐字节比对：`contracts`、`core`、`engine-workbox`、`build-verifier`、`entry-resilience`、`vue`、`react` 完全相同；`sw-runtime`、`client-runtime`、`vite` 除 `package.json` 外文件全部相同，`package.json` 按键排序后相同（`pnpm publish` 重新打包时内部依赖键顺序不同）。

- 从公开 registry 以 `npm install` 新建两个消费项目（Node 24.18.0），按 `website/start/choose`、`vue`／`react` 与配置指南首个示例接入，并挂载 `./ui` 默认更新提示：
  - Vite 5.4.21 + Vue 3.4.38（`@vitejs/plugin-vue` 5.2.4，`vue-tsc` 2.2.12，TypeScript 5.9.3）；Vite 5.4.21 + React 19.2.8（`@vitejs/plugin-react` 4.7.0，TypeScript 5.9.3）。
  - `npm ls` 中 `@pwa-platform/vite`、`core`、`sw-runtime`、`client-runtime` 均为 0.2.5，无嵌套旧版本；`vue-tsc --noEmit`／`tsc --noEmit` 与 `vite build` 均 exit 0；`dist/` 含 `sw.js`、`manifest.webmanifest`、`offline.html`、`pwa-recovery-worker.js`，`index.html` 恰有一个 manifest 链接。
  - 已安装的 `@pwa-platform/vite` 的 `files` 为 `["dist", "skills"]`，包内没有 `docs/`；`skills/pwa-onboarding/SKILL.md` 的 `metadata.version` 为 `0.2.5`，含“本机自检”与“独立的配置文件”两处新规则。
  - 只做到构建层面，未在浏览器中预览。Vue 项目的 `vue-tsc` 需要常规的 `*.vue` 类型声明；`vite.config.ts` 用 `.ts` 扩展名导入时需在 tsconfig 启用 `allowImportingTsExtensions`（文档在 TS5097 处已说明）。

## 事件：批准顺序与依赖顺序不一致（约 2 分钟）

各包公开时间（registry `time`，UTC）：`contracts` 03:19:45、`sw-runtime` 03:19:54、`react` 03:20:04、`client-runtime` 03:20:16、`build-verifier` 03:20:33、`vite` 03:20:38、`entry-resilience` 03:20:40、`engine-workbox` 03:21:01、`vue` 03:21:12、`core` 03:22:01。`sw-runtime` 等依赖 `core@0.2.5` 的包先于 `core` 公开，03:19:54 至 03:22:01 之间安装这些包会因找不到 `core@0.2.5` 失败；03:22:01 后全部可安装。

这是继 0.2.3（约 9 分钟）、0.2.4（约 4 分钟）之后第三次出现。本次发布时维护会话准备了按层批准、每层确认可下载后再批下一层的流程，实际批准为一次完成。发布流程第 9 条已据此补充。

