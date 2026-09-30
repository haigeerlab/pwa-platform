# 实现计划：ai-onboarding

本计划依据[规格](../../spec/ai-onboarding.md)（已缩减，见其"缩减记录"）与 [ADR-0045](../../docs/adr/0045-ai-onboarding-skill-shipped-in-vite-package.md)。交付物是一份短清单 `packages/vite/skills/pwa-onboarding/SKILL.md`，随 `@pwa-platform/vite` 发布，不进入生产构建。

## 任务

全部完成。每项可独立验证，改动集中在 `packages/vite`、`scripts`、`packages/examples-browser-e2e/onboarding-smoke` 与文档。

- [x] **S1 打包**：`files` 含 `skills`，`exports` 不变，`check-package-distribution.mjs` 只允许 `@pwa-platform/vite` 含 `skills`。验证：打包测试与 `check:publish`。
- [x] **S2 清单**：`SKILL.md` 一页，front matter 三个字段，`metadata.version` 等于包版本。验证：front matter、版本、体积、只含 Markdown、无写入命令、关键规则、已缩减机制不再出现的内容测试。
- [x] **S3 不进入生产构建**：`onboarding-smoke` 用哨兵字符串与逐文件哈希证明，`public/` 变异必须被检测出。
- [x] **S4 文档**：《选择接入包》、英文 README、根 README、发布流程、更新日志、`vite-adapter` 与 `examples-browser-e2e` 规格增补。

## 修订：文档改从仓库副本读取（2026-09-30）

依据规格“修订记录”与 ADR-0045 的 2026-09-30 增补。

- [ ] **S5 读取方式**：删除 `packages/vite/scripts/bundle-docs.mjs`、`packages/vite/test/bundle-docs.test.ts`、`build` 中的调用与 `.gitignore` 条目；`files` 去掉 `docs`；`check-package-distribution.mjs` 改为任何包都不得含 `docs`；`SKILL.md` 改为“在线 → 仓库副本 → 停”；内容测试断言新读取顺序与三个要素（问位置、路径换算、版本比较），且不再出现 `node_modules/@pwa-platform/vite/docs`；同步《选择接入包》、根与包 README、发布流程、更新日志。验证：`pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm test:onboarding-smoke`、`pnpm check:publish`，`npm pack --dry-run` 不含 `docs/`。
- [ ] **S6 场景评估**：用 `onboarding-smoke/template` 准备干净的 Vite + Vue、Vite + React 项目；全新助手只拿到清单和仓库副本，在线文档站不可达；维护会话扮演项目所有者回答确认问题；产物跑 onboarding-smoke 的冒烟检查，并核对“绝不”项。结果与发现记入 [verification.md](verification.md)，清单缺陷另行修订。

## 缩减说明

本计划原有 16 个任务（关卡内容、状态文件、双语、一致性测试、场景夹具与评分表、场景评估、两次独立评审……）已在 2026-09-29 缩减，见规格的"缩减记录"和 [verification.md](verification.md)。完整实现保留在 git 历史里。

## 门禁

`pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm test:onboarding-smoke`、`node scripts/check-package-distribution.mjs`；`verify-artifacts` 与文档交付核验。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| developer-entry | `README.md` | 根 README 的开发状态增加 `ai-onboarding` 一条；同时更新 `website/start/choose.md`、`website/guide/integration-by-capability.md`、`packages/vite/README.md` 作为清单的入口、复制命令与边界。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 模块行由 spec-guard `add-module` 写入 PR #88 分支；本计划不再直接修改能力图。 |
| decisions | `docs/adr/0045-ai-onboarding-skill-shipped-in-vite-package.md` | skill 的位置、打包方式与否决的备选。 |
| package-distribution | `spec/package-distribution.md`、`docs/adr/0028-npm-prerelease-distribution.md`、`docs/operations/npm-package-release.md`、`tasks/package-distribution/plan.md`、`tasks/package-distribution/release-2026-09-20.md` | 发布内容含 `skills/`：实际改动 `scripts/check-package-distribution.mjs` 与 `docs/operations/npm-package-release.md`，其余权威文档不变。 |
| vite-adapter | `spec/vite-adapter.md`、`docs/adr/0015-vite-plugin-build-pipeline.md`、`docs/adr/0022-vite-injects-manifest-link.md`、`docs/adr/0040-validate-manifest-icons-during-vite-build.md` | 包内新增 `skills/`，`exports` 与运行时不变：实际改动 `spec/vite-adapter.md` 的增补一节。 |
| examples-browser-e2e | `spec/examples-browser-e2e.md`、`docs/guides/update-prompt.md`、`tasks/examples-browser-e2e/verification.md` | onboarding-smoke 增加清单不进入生产构建的检查：实际改动 `spec/examples-browser-e2e.md` 的增补一节。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| developer-entry | delivered | `README.md`、`website/start/choose.md`、`packages/vite/README.md` | 根 README 增加 `ai-onboarding` 条目；《选择接入包》新增“用 AI 引导接入”，英文 README 新增 Onboarding skill 一节，给出两种安装目录、两种调用与边界。 |
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块行已由 spec-guard `add-module` 写入 PR #88 分支（`c2aced5`）。 |
| decisions | delivered | `docs/adr/0045-ai-onboarding-skill-shipped-in-vite-package.md` | 清单的位置、打包方式与否决的备选已记录，并在缩减后同步过。 |
| package-distribution | delivered | `scripts/check-package-distribution.mjs`、`docs/operations/npm-package-release.md` | 只有 `@pwa-platform/vite` 的 `files` 含 `skills`；发布流程加“升级版本时同步 `metadata.version`”一条。 |
| vite-adapter | delivered | `spec/vite-adapter.md` | 增补“ai-onboarding 增补（2026-09-29）”：`files` 含 `skills`，`exports` 与运行时不变，版本相等由测试强制。 |
| examples-browser-e2e | delivered | `spec/examples-browser-e2e.md` | 增补 onboarding-smoke 的哨兵与哈希核对（DT8）。 |
