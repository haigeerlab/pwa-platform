# 可选能力与交付状态

本页用于判断是否值得继续评估某项能力。下列包目前仍是**工作区私有包**，尚未作为 npm 公开接入包发布；不要把它们加进外部业务项目的安装命令。

| 能力 | 工作区包 | 适用场景 | 当前边界 |
| --- | --- | --- | --- |
| Nuxt 适配 | <code>@pwa-platform/nuxt</code> | Nuxt 4.5.x 项目 | 仅独立 origin；尚未对外发布 |
| Web Push | <code>@pwa-platform/push</code> | 用户同意后订阅通知 | 订阅保存、发送和失效清理由业务后端负责 |
| 离线写队列 | <code>@pwa-platform/offline-write</code> | 显式暂存有限的写入意图 | 不拦截 fetch，不自动重放；业务负责幂等与冲突 |
| 入口灾备 | <code>@pwa-platform/entry-resilience</code> | 域名迁移或现有入口不可达 | 备用入口由用户确认；不会迁移登录态或本地数据 |

## 公共读取缓存

公共读取缓存属于已发布 beta 包中的 <code>PwaPolicy v3</code> 能力，不需要另装包。它由业务显式开启，并受[公共响应准入条件](/guide/public-read-cache#响应必须满足的条件)约束。目前 Nuxt 不支持开启。

## 何时阅读工作区指南

拥有源仓库访问权限的平台维护者可参考内部的[包边界](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/package-boundaries.md)、[Push 接入](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/push-integration.md)和[入口灾备接入](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/entry-recovery-integration.md)。这些资料不构成外部业务项目的安装入口；接入前须确认对应包已发布及其浏览器、发布证据。
