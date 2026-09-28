# npm 发布记录：0.2.0

> 状态：十个 `0.2.0` 包已发布至 npm，`latest` 均指向 `0.2.0`。逐包读回完整 tarball、完整性摘要与候选比对均通过；从 registry 安装全部十包后，类型检查与生产构建通过。

## 范围与版本选择

十个公开包：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`entry-resilience`、`vue`、`react`，统一 `0.2.0`。内容是 2026-09-27 架构审查的修复（PR #27–#42），变更与升级须知见 [CHANGELOG](../../CHANGELOG.md) 的 0.2.0 小节。

选 minor 而不是 patch：manifest 图标构建期校验（ADR-0040）与身份 scope 校验（`identity.scope-outside-worker-directory`）可能让在 0.1.0 上通过的构建失败，且新增了公开 API（更新提示 `locale`、`requiredReleaseChecks`、新诊断码）。`^0.1.0` 的接入方不会被自动升级。

本记录只说明库包分发，不构成任何业务应用的生产发布证据（见[npm 包发布流程](../../docs/operations/npm-package-release.md)末段）。

## 候选与门禁

- 准备 PR：[#44](https://github.com/haigeerlab/pwa-platform/pull/44)。候选提交 `84bcfa29d5f04d82583c5a05f1bb2f52efe2297f`（发布分支的唯一提交），合并提交 `15d8dd9`。两者之间 `packages/` 无差异。
- 候选门禁在候选提交的干净副本上执行（2026-09-28T04:23Z，macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 153.0.8010.53），全部 exit 0：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile`、`lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过 |
| `pnpm test` | 2420 个用例通过 |
| `pnpm test:browser` | 273 个用例通过（含更新提示 UI 套件 18 个） |
| `pnpm test:onboarding-smoke` | 通过（打包产物离线安装，Vite 8 + React） |
| `pnpm test:browser:engines` | 116 通过、8 跳过（Chromium 专有用例） |
| `pnpm test:browser:network` | 4 通过（真实 FCM） |
| `pnpm audit --ignore-registry-errors` | 无已知漏洞 |

- 逐包 `pnpm pack` 检查：版本均为 0.2.0；内部依赖均精确为 0.2.0，无 `workspace:` 残留；README、LICENSE 齐全；无多余文件；未扫出密钥模式。
- 独立消费验证（候选 tarball）：Vite 5.0.0 + Vue 3.4.0 项目安装十包 tarball 后，`vue-tsc --noEmit` 与 `vite build` 通过，产物含 `sw.js`、`manifest.webmanifest`、`offline.html`、`pwa-recovery-worker.js`；反向检查（`locale = "fr"`）按预期被类型检查拒绝。
- 发布前确认十包 `0.2.0` 在 registry 均不存在。合并后 `main`（`15d8dd9`）上的 CI 全部通过。

## 发布

- 执行人：项目所有者（npm 身份认证与 2FA 由本人完成）。从 `main` @ `15d8dd9` 的干净克隆执行 `pnpm install --frozen-lockfile && pnpm build`，确认十包版本为 0.2.0 后，按依赖顺序逐包 `pnpm publish --access public --tag latest`。
- 第一次执行发布循环时，本地克隆尚未包含 PR #44（版本仍为 0.1.0），`contracts@0.1.0` 被 registry 以 403 拒绝，循环在第一个包停止，**未发布任何内容**；registry 读回确认十包仍为 0.1.0。之后更新克隆并加入“版本必须为 0.2.0 才开始”的前置检查。
- 正式发布循环十包均报告成功。registry 登记时间（UTC，2026-09-28）：

| 包 | 登记时间 | 候选 SHA-256（前缀） | integrity 与下载一致 | 与候选逐文件比对 |
|---|---|---|---|---|
| contracts | 05:00:34 | `c3ea3006` | ✅ | 相同 |
| engine-workbox | 05:00:39 | `a67b285d` | ✅ | 相同 |
| build-verifier | 05:00:40 | `1b80979b` | ✅ | 相同 |
| client-runtime | 05:00:44 | `2cdbdec5` | ✅ | 相同 |
| vite | 05:00:46 | `55f03bd1` | ✅ | 相同 |
| entry-resilience | 05:00:48 | `7a07a689` | ✅ | 相同 |
| vue | 05:00:50 | `cd524f6f` | ✅ | 相同 |
| react | 05:00:52 | `84991017` | ✅ | 相同 |
| core | 05:01:17 | `1ea50ccd` | ✅ | 相同 |
| sw-runtime | 05:03:56 | `c07707d2` | ✅ | 相同 |

## 事件：`sw-runtime` 登记延迟

- 发布循环报告 `sw-runtime@0.2.0` 发布成功，但约 05:02–05:08 UTC 期间 registry 查不到该版本：元数据先返回 “version not found”，05:03:56 登记后 tarball 仍返回 404，直到 **05:08:12 UTC** 才可下载。同一时间 `latest` 已指向 0.2.0 的 `client-runtime`、`vite`、`vue`、`react`、`entry-resilience` 精确依赖 `sw-runtime@0.2.0`，此窗口内安装这些包会以 `ETARGET` 失败（已实测复现）。
- 登记时间与发布顺序不一致（`core` 实际先于 `engine-workbox` 发布，登记却晚约 40 秒），说明 registry 登记是异步的；`sw-runtime` 更可能是登记延迟而非首次发布失败。期间项目所有者按建议单独重发了 `sw-runtime`，其终端输出未留存在本记录中，因此无法确认 0.2.0 由哪一次上传登记；无论哪次，最终登记的 tarball 与候选逐文件相同，完整性摘要一致。
- 影响窗口约 6 分钟。改进：下次发布在每个包 `publish` 后等待该版本 tarball 可下载，再发布依赖它的下一个包；或先以非 `latest` 标签发布全部包、核对后再统一移动 `latest`。

## 发布后验证

- 十包 `latest` 均为 `0.2.0`（`next` 仍为历史的 `0.1.0-beta.2`，`entry-resilience` 无 `next`）。
- 在全新目录用 npm 直接从 registry 安装全部十个 `0.2.0`（Vite 5.0.0、Vue 3.4.0、React 19.2.0），`npm install`、`vue-tsc --noEmit` 与 `vite build` 均 exit 0；使用的是 registry 分发物，不是本地 tarball。
