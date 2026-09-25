# 稳定契约

## PwaIdentity

平台控制的身份包括 `appId`、`manifestId`、origin、scope、Service Worker URL、manifest URL、挂载路径、环境和缓存命名空间种子。生产身份字段不可变；变更它们属于迁移，而不是普通配置修改。

安装元数据是独立校验的契约：`startUrl`、`display`、名称、短名称、主题/背景色和必需图标变体，以及可选的 `description`、`categories`、`orientation`、`displayOverride`、`screenshots`、`shortcuts`（[ADR-0037](../adr/0037-install-metadata-manifest-members.md)、[接入说明](../guides/manifest-fields.md)）。身份控制 URL 所有权；产品配置只能在平台校验规则内提供展示元数据。

## PwaPolicy

业务控制、可序列化的意图包括安装启用、离线降级、更新模式、显式资源分类和可选功能模块。不得包含 DOM 引用、Node 请求对象、任意函数或原始 Workbox callback。

`schemaVersion: 3`（[public-read-cache](../../spec/public-read-cache.md)）在 v2 字段之外新增必填的 `runtimeCache`：`enabled` 加三项上限 `maxEntries`（1–200）、`maxEntryBytes`（1–1 048 576）、`maxAgeSeconds`（60–604 800），`enabled: false` 时三项上限均为 0。它只让 `public-data`（`network-first` 或 `stale-while-revalidate`）与 `navigation-public-dynamic`（仅 `network-first`）两类资源执行运行时缓存策略；v1、v2 策略与 v3 且 `enabled: false` 的行为不变，运行时策略照旧透传。

## PwaPlan

它是身份、安装元数据、策略、宿主拓扑和平台基线的可审计编译结果，记录生成产物位置、预缓存资源、缓存规则、拒绝规则、更新行为、策略版本，以及启用同源治理时的登记表版本。

`PwaPlan v3` 在 v2 字段之外新增闭合字段 `runtimeCache`：三项上限与 `configDigest`（对规范化后的上限与可执行规则计算的非密码学摘要，用于判断缓存是否随配置变化而作废）。worker 运行时配置只携带这些字段中运行期需要的最小信息，不注入原始 policy。

缓存命名空间新增两个 kind（`CACHE_KINDS`）：`runtime-pages`（动态 HTML，每次新 worker 激活整体删除）与 `runtime-data`（公共数据，缓存名带 `configDigest`，激活时删除 digest 不同的旧缓存）。两者都落在既有的 `cacheNamespacePrefix` 之下，因此仍在 `appCachePrefix` 之下，恢复 worker 现有的前缀删除自动覆盖它们，不需要改恢复 worker 的逻辑。

## 事件

客户端运行时暴露稳定且保护隐私的生命周期事件：注册、可安装、安装、worker 等待、激活、离线降级、缓存清理和 Push 交互。`served-from-cache`（[public-read-cache](../../spec/public-read-cache.md)）在响应确实由运行时缓存提供时发出，`metadata` 为 `{ url, cachedAt, reason }`；`url` 含查询串，业务把生命周期事件转发到遥测前必须先去掉它。事件 payload 不得包含令牌、订阅 endpoint 或用户数据。
