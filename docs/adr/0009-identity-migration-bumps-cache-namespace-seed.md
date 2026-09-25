# ADR-0009：身份迁移提升缓存命名空间种子

## 状态

已接受（2026-09-15）。修订 [ADR-0008](0008-cache-namespace-and-identity-baseline.md) 中关于身份迁移的一句表述。

## 背景

ADR-0008 的"影响"一节写道：身份迁移必须提升 `schemaVersion`，并附带迁移与回滚计划。这句话与后来确定的契约不一致：

- 在 contracts 中，`schemaVersion` 标识的是契约的序列化形状，v1 契约里它固定为字面量 `1`。要提升它，必须先有新的契约版本和迁移函数，因此它无法作为单个应用的身份迁移手段。
- [contracts 规格](../../spec/contracts-foundation.md)规定，`cacheNamespaceSeed` 就是 ADR-0008 命名格式里的 identity-revision 段。缓存命名空间前缀由它与 `appId`、`environment` 共同推导，对应 contracts 中的 `cacheNamespacePrefix`。

## 决策

- ADR-0008 列出了一组生产不可变字段。变更其中任意一个都是一次身份迁移，必须以有名称的迁移提出，并把 `cacheNamespaceSeed` 提升为该应用在该环境中从未用过的新值。
- 迁移仍须附带清理与回滚计划，这一点与 [ADR-0004](0004-identity-is-immutable-after-production-registration.md) 一致。
- `schemaVersion` 只在契约的序列化形状发生变化时提升，与单个应用的身份迁移无关。
- ADR-0008 中"身份迁移必须提升 `schemaVersion`"一句由本决策取代，ADR-0008 的其余决定保持不变。

## 影响

- **新旧缓存可区分**：每次迁移都会产生新的完整前缀 `pwa:<appId>:<environment>:<cacheNamespaceSeed>:`，新旧 revision 的缓存可以明确区分。
- **旧缓存可定位**：同一应用、同一环境下各 revision 的缓存都位于应用前缀 `pwa:<appId>:<environment>:` 之下（contracts 中的 `appCachePrefix`），迁移清理步骤和恢复 worker 据此找到旧 revision 的缓存。如果迁移同时变更了 `appId` 或 `environment`，旧缓存位于旧的应用前缀之下。
- **种子不得复用**：复用种子会让新身份读到旧 revision 的缓存。
- **与 ADR-0008 的对应关系**：ADR-0008 所说的"当前应用完整前缀"，由 contracts 规格中的两级前缀实现。本 ADR 不改动 ADR-0008 的这句表述。
- **后续规则与工具**：发布基线的比较规则和迁移记录要求见[身份发布基线规则](../operations/identity-release-baseline.md)；比较工具由 build-verifier 实现。
