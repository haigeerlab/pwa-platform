# 路线图

| 发布阶段 | 交付结果 | 包含 | 不包含 |
|---|---|---|---|
| Foundation | 稳定契约与规划产物 | 身份、安装 manifest 契约、策略 schema、编译器、校验模型 | 宿主接入 |
| v1 | 安全 PWA 基线 | manifest、静态预缓存、离线页、更新、会话元数据清理、校验器 | API/私有缓存、Push、离线写入 |
| v1.1 cache | 明确的公共读取缓存 | 已评审的公共 JSON/HTML 规则、配额控制、时效体验 | 私有/会话缓存 |
| v1 adapters | Vite 消费方 | Vue 3.4+、React 19.2+ | SSR 适配器 |
| v1.1 | SSR 消费方 | Nuxt 3.11+/4.5+、经矩阵验证后的 TanStack Start | Next.js |
| v2 topology | 同源治理 | 根路径/子路径 scope 登记和部署检查（`shared-origin-topology`，Vite 接入；Nuxt 暂不支持） | 跨应用客户端状态共享、多层嵌套 |
| v2 engagement | 可选 Push | `@pwa-platform/push` 订阅客户端、平台 worker 通知处理、后端 Push 格式契约 | 保证送达、平台代为发送或存储订阅 |
| v3 | 选定的离线写入 | 由业务拥有幂等/冲突契约的队列 | 任意 API 的自动重放 |
