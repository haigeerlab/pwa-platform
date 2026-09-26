# 实现计划：capability-comparison

依据：[模块规格](../../spec/capability-comparison.md)。

1. 核对公开包与当前工作区的状态，收集对照产品的官方资料。验收：每个对照维度有可追溯来源，不把截图格子当作证据。
2. 撰写独立对照页，按产品职责、安装离线、更新、缓存与交付分维度呈现；另列尚未发布的工作区增量。验收：状态清楚，没有无法证实的“缺失”判断。
3. 首页与导航增加简短入口，构建文档站并检查链接、手机端表格和文案。验收：`pnpm docs:build` 通过，未改运行时或发布 npm。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| capability-map | `spec/CAPABILITY-MAP.md` | 登记页面的事实来源与依赖。 |
| capability-comparison | `website/introduction/tooling-comparison.md`、`website/index.md`、`website/.vitepress/config.ts`、本规格与计划 | 提供有来源的对照与入口，约束版本分层。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 已登记对照模块。 |
| capability-comparison | delivered | `website/introduction/tooling-comparison.md`、`website/index.md`、`website/.vitepress/config.ts`、`tasks/capability-comparison/verification.md` | 独立页面与首页入口已完成，并记录本地构建与来源核对证据。 |
