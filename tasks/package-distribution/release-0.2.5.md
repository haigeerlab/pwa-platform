# npm 发布记录：0.2.5

> 状态：候选门禁（第二轮，含依赖升级）全部通过，审计零漏洞；待合并发布 PR、上线文档站后发布。

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
