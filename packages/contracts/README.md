# @pwa-platform/contracts

PWA Platform 的公开数据契约：应用身份、安装信息、缓存策略、编译计划、诊断和生命周期事件。

## 谁会使用

- 业务项目可从本包导入 `PwaIdentity`、`PwaInstallMetadata`、`PwaPolicy` 和 `PwaTopology`，为 `@pwa-platform/vite` 配置提供类型。
- 构建适配器、Service Worker 与发布工具使用同一组运行时校验函数，避免各层自行解释配置。
- 如果只接入 Vue／React，通常无需单独安装；框架包和 Vite 包会间接依赖它。

本包只定义和验证数据，不生成 manifest、不注册 worker，也不执行缓存。

## 安装

```sh
npm install @pwa-platform/contracts
```

要求 Node.js 22 或更高版本。包为 ESM。

## 主要契约

| 分组 | 主要导出 | 用途 |
| --- | --- | --- |
| 身份 | `PwaIdentity`, `validateIdentity` | 固定 app ID、manifest ID、Origin、scope、worker／manifest URL、mount path、环境和缓存命名种子 |
| 安装 | `PwaInstallMetadata`, `validateInstallMetadata` | 名称、图标、截图、显示模式、方向、快捷方式和 start URL |
| 策略 | `PwaPolicy`, `PwaPolicyV1/V2/V3`, `validatePolicy` | 安装开关、资源分类、缓存策略、离线页、弱网超时、离线写与公共读取缓存 |
| 拓扑 | `PwaTopology`, `PwaOriginRegistry`, `validateOriginRegistry` | 单应用 Origin 或共享 Origin 的根／子应用登记 |
| 计划 | `PwaPlan`, `PwaPlanV1/V2/V3`, `validatePlan` | 构建层编译出的完整、可供 worker 消费的部署计划 |
| 诊断 | `PwaDiagnostic`, `PwaValidationResult`, `DIAGNOSTIC_CODES` | 不回显敏感配置值的结构化错误和警告 |
| 事件 | `PwaLifecycleEvent`, `readLifecycleEvent` | 跨边界读取平台生命周期事件 |
| 命名 | `appCachePrefix`, `cacheNamespacePrefix`, `cacheName`, `runtimeDataCacheName` | 从身份派生本应用缓存名称 |

常量 `RESOURCE_CLASSES`、`CACHE_STRATEGIES`、`UPDATE_MODES`、`TOPOLOGY_KINDS` 和安装元数据常量可用于表单、配置生成器或静态检查。

## 校验示例

```ts
import {
  validateIdentity,
  validatePolicy,
  type PwaIdentity,
  type PwaPolicyV3,
} from "@pwa-platform/contracts";

const identity: PwaIdentity = {
  appId: "orders",
  manifestId: "/app/",
  origin: "https://orders.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "orders-v1",
};

const policy: PwaPolicyV3 = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/assets/", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api/public/", resourceClass: "public-data", cache: "network-first" },
  ],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: true, maxEntries: 100, maxEntryBytes: 262_144, maxAgeSeconds: 3600 },
};

for (const result of [validateIdentity(identity), validatePolicy(policy)]) {
  if (!result.ok) console.error(result.diagnostics);
}
```

校验函数返回 `PwaValidationResult<T>`，不会把输入值写进诊断。`validateInstallMetadata` 还需要身份参数，以确认 start URL 和快捷方式位于应用 scope 内。

## 关键边界

- 生产 identity 是发布基线，不应在普通版本中更改。
- 路径规则使用 mount-relative 前缀，不接受 glob、正则或回调。
- 私有／会话数据、写入、流媒体和未分类请求不能通过允许规则绕过基础拒绝。
- PwaPolicy v3 的运行时缓存只适用于显式声明的同源公共读取；业务仍须证明响应与用户身份无关。
- 本包不会替业务鉴别公共数据，也不会让所有路由自动离线。

完整字段说明见[身份与策略配置](https://github.com/haigeerlab/pwa-platform/blob/main/website/guide/configuration.md)和[缓存安全模型](https://github.com/haigeerlab/pwa-platform/blob/main/website/architecture/security.md)。

License: MIT.
