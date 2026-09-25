# 贡献指南

提交代码前，阅读 `CLAUDE.md`、当前模块 Spec、其计划和关联 ADR。公开契约、身份、缓存策略、依赖或兼容性变更都需要测试；若难以逆转，还必须新增 ADR。

GitHub Issues 是任务事实源。不要添加仓库内的 todo 列表。

## 提交前检查

本地运行 `pnpm lint`、`pnpm test`、`pnpm build` 和 `pnpm typecheck`；改动涉及浏览器行为时，再运行 `pnpm test:browser`（需要本机安装 Google Chrome）。日常提交保存在短期工作分支；分支推送不触发 CI。准备合入时创建目标为 `main` 的 PR：Draft 阶段不执行耗时 job，转为 Ready 后以及后续更新时，CI 以冻结 lockfile 执行 Node 22／24 和浏览器检查（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。同一 PR 的新运行会取消旧运行。

`main` 仅通过 PR 合入，三个 CI job 是必需检查；不要用 `[skip ci]` 或路径过滤绕过它们。正式发布前，发布负责人对最终 `main` 提交手动运行完整 CI，并核对运行 SHA 与发布 SHA 一致。`main` 与文档版本分支的推送本身不触发 CI。

## 依赖与发布

- 新增、升级依赖，登记豁免，或批准依赖的安装脚本，按[依赖变更流程](docs/operations/dependency-changes.md)执行。
- 生产发布前必须通过[发布门禁](docs/operations/release-and-incident-runbook.md#发布门禁)；回滚与事故处置见同一手册。
- 安全漏洞按 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。
