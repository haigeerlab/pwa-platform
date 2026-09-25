# PWA Platform — Agent 上下文

修改代码前，先阅读本文件、`AGENTS.md`、`docs/architecture/overview.md` 和当前模块规格。

## 项目定位

这是一个可复用的 PWA 基础设施项目，而不是业务应用。必须将框架适配、浏览器运行时行为和产品缓存策略相互隔离。

## 不可突破的边界

- `PwaIdentity` 由平台拥有，生产注册后不可变更。
- 业务应用通过 `PwaPolicy` 声明意图；不得注入任意 Service Worker 代码或原始 Workbox 配置。
- 对私有数据、写操作、流媒体和未分类请求，Service Worker 默认拒绝缓存。
- Workbox 是实现引擎，不是公开 API。
- 未新增 ADR 和迁移计划时，不得变更 `scope`、Service Worker URL、manifest ID 或缓存命名空间行为。

## 工作流

1. 将 `spec/CAPABILITY-MAP.md` 作为 Initiative 索引。
2. 开始模块实现前，必须完成其规格与计划。
3. 默认保持公开契约有文档且向后兼容。
4. 按变更层级运行相应的单元、构建和真实浏览器校验。
5. 将难以逆转的架构选择记录为 ADR。

## 文档事实源

- 架构：`docs/architecture/`
- 产品范围与路线图：`docs/product/`
- 决策：`docs/adr/`
- 能力图与模块规格：`spec/`
- 模块实现计划：`tasks/<module-id>/plan.md`
