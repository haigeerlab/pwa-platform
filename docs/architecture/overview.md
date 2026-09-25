# 架构概览

## 设计原则

平台由通用运行时、宿主适配器和声明式产品策略组成，而不是逐项目复制的 PWA 模板。

```text
Business application
  -> host facade (Vue / React / Nuxt / TanStack Start / Next)
  -> build adapter + client runtime
  -> policy compiler (`@pwa-platform/core`)
  -> Service Worker runtime
  -> Workbox engine
```

依赖只能向下流动。契约层永不依赖 UI 框架；Service Worker 运行时不得引入框架或应用服务端代码。

## 公开与内部边界

公开 facade 是 `@pwa-platform/vue` 一类的宿主包。内部包承载契约类型、客户端运行时、Service Worker 运行时、Workbox 集成、构建适配器和校验能力。

消费方配置应用键和 `PwaPolicy`。适配器解析构建产物和应用身份；`@pwa-platform/core` 将策略编译为 `PwaPlan`；适配器输出 manifest、worker、离线降级页和校验报告。

## 资源分类

策略描述资源意图，而不是暴露 Workbox callback：

| 分类 | 默认行为 |
|---|---|
| asset | 由宿主构建产物输出时预缓存 |
| public static/navigation | 可采用显式缓存策略 |
| public dynamic data | 可采用显式的短生命周期缓存策略 |
| private/session data | 仅网络 |
| mutation | 仅网络 |
| stream/WebSocket/token | 仅网络 |

允许规则永远不能覆盖平台安全拒绝规则。

## 运行时缓存（v1.1）

预缓存之外，平台 worker 可以对业务显式声明为公共内容的同源 `GET` 读取做运行时缓存（`PwaPolicy` v3，[ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）：`public-data` 可用 `network-first` 或 `stale-while-revalidate`，`navigation-public-dynamic` 可用 `network-first`。它走与预缓存相同的分层：策略由 `@pwa-platform/core` 编译进 `PwaPlan`，Service Worker 运行时判断请求后交给引擎端口执行；Workbox（`workbox-strategies`、`workbox-expiration`）只出现在引擎内部，不外露类型或选项。未使用 v3 或未开启 `runtimeCache.enabled` 时，worker 对未预缓存的请求一律透传，已写的 `network-first` 等字段不被执行。可选的网络超时（[ADR-0038](../adr/0038-network-timeout.md)）同时作用于导航与 `network-first` 运行时缓存。
