# ADR-0008：缓存命名空间与身份发布基线

## 状态

已接受。"影响"一节中关于身份迁移的表述已被 [ADR-0009](0009-identity-migration-bumps-cache-namespace-seed.md) 修订。

## 背景

恢复 worker、缓存清理和未来同源多 PWA 隔离，都需要稳定且可识别的平台缓存命名空间。生产身份不可变也必须有可比较的事实源。

## 决策

每个应用在仓库内维护受版本控制的 `PwaIdentity` 配置；CI 将其与当前发布基线比较。生产不可变字段为 `appId`、`origin`、`scope`、`serviceWorkerUrl`、`manifestId`、`manifestUrl`、`mountPath` 与 `cacheNamespaceSeed`。环境是独立身份，不能共用缓存命名空间。

缓存命名空间采用可测试的纯函数：`pwa:<escaped-appId>:<environment>:<identity-revision>:<cache-kind>`。各段使用固定分隔符与转义，禁止一个应用的完整前缀成为另一个应用的完整前缀。所有 Workbox 缓存名必须映射到这一命名空间；恢复 worker 只能删除匹配当前应用完整前缀的缓存。

## 影响

`contracts` 提供身份、命名规则和结构校验；`core` 负责策略合并、优先级、冲突与确定性编译。~~身份迁移必须提升 `schemaVersion` 并附带迁移与回滚计划。~~（已被 [ADR-0009](0009-identity-migration-bumps-cache-namespace-seed.md) 取代：身份迁移提升 `cacheNamespaceSeed`，并附带迁移与回滚计划。）

## 增补：新增两个缓存 kind（2026-09-24，[ADR-0035](0035-explicit-public-read-runtime-cache.md)）

缓存 kind 从只有 `precache` 扩展为 `precache`、`runtime-pages`、`runtime-data`，服务于公共读取运行时缓存（[public-read-cache](../../spec/public-read-cache.md)）。两个新 kind 仍落在本 ADR 定义的命名空间下（`pwa:<escaped-appId>:<environment>:<identity-revision>:<cache-kind>`），命名规则、前缀转义与恢复 worker 按完整前缀删除的范围不变。
