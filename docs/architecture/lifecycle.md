# 运行时生命周期、部署与恢复

## 首次访问与离线行为

首次在线访问会下载应用并注册 worker。只有安装完成且缓存填充后，后续离线启动才能显示应用壳。未访问过的路由或未缓存的数据请求可以降级到离线页；离线不等于所有路由都可用。

## 更新策略

默认模式是 `prompt`：新 worker 等待用户刷新后才接管。`skipWaiting` 不是全局默认值，因为直播、支付和表单会话可能被新旧资源混用打断。

## 缓存响应头

- `sw.js`、manifest 和 HTML：重新校验（`no-cache`）。
- 带指纹的资源：不可变且长缓存。
- 私有 HTML/数据：按平台策略标记为私有且不可缓存。

## 运行时缓存的激活期清理（v1.1）

启用了 `PwaPolicy v3` 公共读取缓存（[public-read-cache](../../spec/public-read-cache.md)、[ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）的应用，新 worker 激活时除了清理自身预缓存中的过期条目，还会：

- 整体删除 `runtime-pages` 缓存（动态 HTML），避免旧版本 HTML 引用已被移除的带哈希资源；
- 删除 `configDigest` 与当前规则不同的 `runtime-data` 缓存；规则或上限一变，旧数据随之作废；
- `runtimeCache.enabled: false` 时，删除当前应用前缀下的全部运行时缓存；
- 同时删除被删缓存对应的 `workbox-expiration` 过期记录（该库按缓存名单独记录写入时间，`caches.delete` 不会清掉它们）。

**回滚残留（已知限制）**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会执行上述清理。这些缓存不会被读取，但会一直占用空间，直到恢复 worker 或下一次 v3 激活。处置方式见[发布与事故处置手册](../operations/release-and-incident-runbook.md#回滚)。

## 恢复

必须维护紧急的无拦截清理 worker。它激活后清除平台拥有的缓存命名空间，覆盖两个运行时缓存 kind（`runtime-pages`、`runtime-data`）与它们对应的 `workbox-expiration` 记录（按 `appCachePrefix` 前缀匹配，尽力而为，失败不阻断接管）；若协调 v2 已启用离线写，还会删除同一 `PwaIdentity` 派生的专属 IndexedDB 队列数据库。任何缓存删除失败或被阻塞都不得接管客户端；成功后才取消 Push 订阅并 claim，且不拦截 fetch 请求。这是一旦生产 worker 异常时的恢复路径。
