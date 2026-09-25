# ADR-0001：使用 pnpm monorepo 与私有占位包

## 状态

已接受

## 背景

平台包含共享运行时、构建适配器、宿主 facade、示例和浏览器测试，尚未确定 npm 发布 scope。

## 决策

使用 pnpm workspace。开发包采用私有 `@pwa-platform/*` 占位命名空间与 `workspace:*` 引用；发布配置延后到一次统一的预发布迁移。

## 影响

本地集成和测试无需向 registry 发布。未来发布只需要一次协调的 import/scope 迁移，不会改变运行时身份或策略契约。
