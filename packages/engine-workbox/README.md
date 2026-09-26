# @pwa-platform/engine-workbox

PWA Platform 的内部 Workbox 引擎：在构建期注入预缓存清单，在 worker 中提供预缓存和受限运行时缓存端口。

## 谁会使用

业务应用通常**不直接安装或调用**本包。`@pwa-platform/vite` 和 `@pwa-platform/sw-runtime` 会按平台计划组装它。需要开发新的 worker 运行时或构建适配器时才直接使用。

```sh
npm install @pwa-platform/engine-workbox
```

要求 Node.js 22 或更高版本。

## 入口

### `@pwa-platform/engine-workbox`

Node／构建期入口：

| 导出 | 作用 |
| --- | --- |
| `WORKBOX_INJECTION_POINT` | 固定注入点 `self.__WB_MANIFEST` |
| `injectPrecacheManifest(workerSource, plan)` | 把计划中的预缓存条目注入已生成的 worker 源码 |

### `@pwa-platform/engine-workbox/worker`

Service Worker 入口：

| 导出 | 作用 |
| --- | --- |
| `createPrecacheEngine(options)` | 创建 install／activate／match 所需的预缓存引擎 |
| `createRuntimeCacheEngine(options)` | 创建带容量、时效和策略限制的运行时缓存引擎 |
| `PwaPrecacheEngine*` | 预缓存输入、安装与激活结果类型 |
| `PwaRuntimeCacheEngine*` | 运行时缓存选项、命中和响应结果类型 |

```ts
import { injectPrecacheManifest } from "@pwa-platform/engine-workbox";
import { createPrecacheEngine } from "@pwa-platform/engine-workbox/worker";
```

两个入口对应不同运行环境，不应把 worker 入口导入 Node 构建代码，也不应把构建入口打进 Service Worker。

## 平台约束

- 本包只接受平台编译出的精确条目和限制，不向业务暴露任意 Workbox route、plugin 或 callback 配置。
- 运行时缓存不会决定一个请求是否安全；请求分类、同源／GET 基线拒绝和响应准入由 `@pwa-platform/sw-runtime` 完成。
- `cache-first` 只用于预缓存和允许的静态资源；公共数据运行时缓存只支持平台批准的 `network-first` 与 `stale-while-revalidate` 路径。
- opaque、重定向、超限、过期或不满足响应头要求的结果不会因为使用 Workbox 而绕过平台策略。

## 什么时候不要用

如果目标是给 Vite + Vue／React 应用接入 PWA，请使用 `@pwa-platform/vite` 与对应框架包。若你需要完全自由的 Workbox 配置，本平台的受限引擎并不是通用 Workbox 封装。

完整缓存边界见[公共读取缓存](https://github.com/haigeerlab/pwa-platform/blob/main/website/guide/public-read-cache.md)和[缓存安全模型](https://github.com/haigeerlab/pwa-platform/blob/main/website/architecture/security.md)。

License: MIT.
