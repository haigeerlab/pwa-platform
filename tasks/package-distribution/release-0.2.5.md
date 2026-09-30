# npm 发布记录：0.2.5

> 状态：候选门禁已完成，待项目所有者裁决依赖审计结果、上线文档站后发布。

## 范围与版本选择

十个公开包统一 `0.2.5`。自 `0.2.4`（`9159dc2`）以来，随包发布的内容只有 `@pwa-platform/vite` 有变化；其余九个包只有 `package.json` 的版本号与新增的本机测试脚本（`test:browser:real`、`test:browser:android`，不影响运行时）变化。详见 [CHANGELOG](../../CHANGELOG.md)。

| 包 | 改动 |
|---|---|
| `vite` | 不再随包发布文档副本：`files` 恢复为 `["dist", "skills"]`，删除 `scripts/bundle-docs.mjs`（ADR-0045 2026-09-30 增补，[#106](https://github.com/haigeerlab/pwa-platform/pull/106)）；AI 接入清单改为“在线文档站 → 仓库副本 → 停”，读副本时问一次位置、按路径换算、比较版本；新增第 6 步“本机自检”并写明完成标准（[#106](https://github.com/haigeerlab/pwa-platform/pull/106)）；自检使用独立浏览器配置文件并在结束后清理（[#107](https://github.com/haigeerlab/pwa-platform/pull/107)）；README 相应更新 |

本记录只说明库包分发，不构成任何业务应用的生产发布证据。

## 候选与门禁

- 准备提交：`release/0.2.5` @ `565cfa3`（基于 `main` @ `2f28e3a`）；门禁针对该提交的包内容，本页与门禁基线文字的后续提交不改变随包内容。
- 候选门禁在该提交的全新克隆上执行（2026-09-30，macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 154.0.8037.59）：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过 |
| `lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过（`check:publish`：10 个包） |
| `pnpm test` | 16 个套件共 2556 个用例通过，0 失败 |
| `pnpm test:browser` | 10 个套件共 295 个用例通过，0 失败 |
| `pnpm test:onboarding-smoke` | 4 个用例通过 |
| `pnpm test:browser:engines` | 291 通过、17 跳过（Chromium 专有用例，与 0.2.4 相同） |
| `pnpm test:browser:network` | 本机未运行（需真实 FCM）；以 `main` CI 的 network job 为准 |
| `pnpm audit --ignore-registry-errors` | **13 个**（4 高、6 中、3 低），全部位于根目录开发依赖：`undici` 7.29.0（路径 `.>wrangler>miniflare>undici`，10 条，含 TLS 证书校验绕过等高危）与 `brace-expansion` 5.0.9（路径经 `eslint`，3 条）。逐包 `pnpm ls --prod --depth Infinity` 确认**不在十个公开包的生产依赖树中**。发布前是否升级由项目所有者裁决，见下文 |

- 逐包 `pnpm pack`：十包版本均为 0.2.5。`vite` 包不含 `docs/`。候选 tarball SHA-256：

| 包 | SHA-256 |
|---|---|
| contracts | `b1d80d303a8c8f609bf7f32ef9d7a172158883b248d180ead38ce4b165cb7393` |
| core | `c4b6f9ede17712ed684218ae03a9c41c0fc7a5c2bec2d86963c5a0b7ec82bcfc` |
| engine-workbox | `89ee8d51e7ea75bc690ea7f27622d2346e3cebed8c17a1a5509f7bb6354c9279` |
| build-verifier | `0fa97ccb90937f089bfca2360865c468abc2a32f7368410f82abc4463fe2a586` |
| sw-runtime | `3de8e647d49b6149c88d66484840648d11d971101bc60543f95fbeb4d7cb8c3a` |
| client-runtime | `f9dc3d2cc10f3997f27c847500548fa7580d0d81639c9416d8e5a3ffc15b3f11` |
| vite | `cc8cfd7d8dc5be8d21aad5e22b8b80a7d773f5adbfca739f6ff014e142974593` |
| entry-resilience | `4b0ea80277b08cb69e358e727374ee794487f5dd974d386de6dbcfb8184103ca` |
| vue | `4b6c3b2a4779bcf89b41e8bc7ee0f72b6ce8252ae30d0bf047ced682e59a5f94` |
| react | `dfc84b0fa31c6747e133fcdf90a9d896f16b0212e053a6581aaf27f6dac32c95` |

## 待裁决

1. 依赖审计：根目录开发依赖中的 `undici`（经 `wrangler`）与 `brace-expansion`（经 `eslint`）。
