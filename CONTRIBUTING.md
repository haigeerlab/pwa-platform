# 贡献指南

提交代码前，阅读 `CLAUDE.md`、当前模块 Spec、其计划和关联 ADR。公开契约、身份、缓存策略、依赖或兼容性变更都需要测试；若难以逆转，还必须新增 ADR。

GitHub Issues 是任务事实源。不要添加仓库内的 todo 列表。

## 提交前检查

本地运行 `pnpm lint`、`pnpm test`、`pnpm build` 和 `pnpm typecheck`；改动涉及浏览器行为时，再运行 `pnpm test:browser`（需要本机安装 Google Chrome）。CI 在每个 PR 上以冻结 lockfile 运行这些检查（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。

建议仓库管理员在 GitHub 的分支保护设置中，把 CI 设为合并到 `main` 前的必需检查。仓库配置不会自动开启这项设置。

## 依赖与发布

- 新增、升级依赖，登记豁免，或批准依赖的安装脚本，按[依赖变更流程](docs/operations/dependency-changes.md)执行。
- 生产发布前必须通过[发布门禁](docs/operations/release-and-incident-runbook.md#发布门禁)；回滚与事故处置见同一手册。
- 安全漏洞按 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。
