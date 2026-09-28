# 包导览：每个包做什么、不做什么

面向业务开发者的包选择、依赖分层图和"几条不能碰的红线"已合并进文档站的[选择接入包](https://pwa-platform-docs.pages.dev/start/choose)与[包与公开入口](https://pwa-platform-docs.pages.dev/reference/packages)（本仓库源文件：`website/start/choose.md`、`website/reference/packages.md`）。已发布包（`vite`、`vue`、`react`、`contracts`、`entry-resilience`）的详细用法见其自身 README（`packages/*/README.md`）；`push` 与 `offline-write` 仍是工作区私有包、没有 README，它们的接入细节留在 `docs/guides/push-integration.md`（内部文档）与本仓库的模块规格 `spec/push-module.md`、`spec/offline-write-extension.md`。请以文档站、各包 README 与规格为准；本文件保留仅为兼容旧链接。

面向平台维护者的测试分层、能力图索引和关键 ADR 列表见[包边界](../architecture/package-boundaries.md)与[能力图](../../spec/CAPABILITY-MAP.md)。
