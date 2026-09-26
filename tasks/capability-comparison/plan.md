# 实现计划：capability-comparison

依据：[模块规格](../../spec/capability-comparison.md)。

1. 核对 npm `0.1.0` 正式包与当前工作区状态，收集对照工具和应用的官方资料。验收：每个对照维度有可追溯来源，不把用户截图中的格子当作证据。
2. 维护工具职责对照页，按产品职责、安装离线、更新、缓存与交付分维度呈现；区分正式包能力与未公开的工作区功能。验收：状态清楚，没有无法证实的“缺失”判断。
3. 以固定官方仓库提交建立成熟应用能力页，并把带图例的完整矩阵放在首页。验收：无法确认的格子保留“未确认”，详情页给出提交和源文件。
4. 更新导航，构建文档站并检查桌面、375px 表格与链接。验收：`pnpm docs:build` 通过，表格只在自身容器滚动，未改运行时或发布 npm。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| capability-map | `spec/CAPABILITY-MAP.md` | 登记页面的事实来源与依赖。 |
| capability-comparison | `spec/capability-comparison.md`、`website/introduction/tooling-comparison.md`、`website/introduction/application-comparison.md`、`tasks/capability-comparison/verification.md` | 提供有来源的工具与应用对照，约束版本和证据分层；首页与导航消费该事实源。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 已登记对照模块。 |
| capability-comparison | delivered | `website/introduction/tooling-comparison.md`、`website/introduction/application-comparison.md`、`website/index.md`、`tasks/capability-comparison/verification.md` | 工具页、固定提交的应用页与首页完整矩阵已完成，并记录来源、构建和响应式核对证据。 |
