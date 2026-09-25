# ADR-0011：平台注入编译计划的预缓存清单

## 状态

已接受（2026-09-15）。修订 [ADR-0003](0003-workbox-inject-manifest.md) 中"Workbox 注入构建 manifest"的做法；平台拥有 worker 源码、采用 Workbox InjectManifest 模式的结论不变。

## 背景

[ADR-0003](0003-workbox-inject-manifest.md) 决定首个引擎采用 Workbox `InjectManifest`，由 Workbox 注入构建 manifest。Workbox 的注入工具（`workbox-build` 及其构建插件）按 glob 扫描构建产物生成清单。

后续决定已经为预缓存清单确立了唯一来源：[ADR-0002](0002-declarative-policy-and-compiled-plan.md) 规定平台把策略编译为可审计的 `PwaPlan`，Workbox 只是内部实现；[ADR-0007](0007-separate-contracts-from-policy-compilation.md) 规定运行时和构建包只消费编译后的计划，不重新实现策略。`PwaPlan.precache` 已由 `@pwa-platform/core` 编译得出。若再由 Workbox 扫描构建产物生成清单，就会出现第二份清单来源，两者可能不一致。

此外，`workbox-build@7.4.1` 的传递依赖 `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1` 被仓库的 `trustPolicy: no-downgrade` 拒绝（[依赖变更流程](../operations/dependency-changes.md)）。

## 决策

- 平台自己把 `PwaPlan.precache` 注入 worker 源码，不使用 `workbox-build`、`generateSW` 或 `workbox-window`。注入由 `@pwa-platform/engine-workbox` 的构建期入口 `injectPrecacheManifest` 完成：
  - 注入点沿用 Workbox 默认的 `self.__WB_MANIFEST`，在 worker 源码中必须恰好出现一次；
  - 注入内容是与 `plan.precache` 顺序、内容一一对应的 `{ url, revision }` JSON 数组，不生成 `integrity`；
  - 计划无效或注入点不是恰好一次时，构建直接失败；
  - 注入发生在打包之后：平台 worker 源码先由打包器处理，注入点必须在打包产物中原样保留（打包时不得改写或压缩它），再对产物注入清单。
- 运行期只使用 `workbox-precaching` 的 `PrecacheController`，通过引擎端口 `createPrecacheEngine` 提供 install、activate 与 match；不使用 `precache()`、`precacheAndRoute`、`PrecacheRoute`、`cleanupOutdatedCaches` 或 navigation preload。端口不注册事件监听、不跳过等待、不接管客户端，只读写 contracts `cacheName(identity, "precache")` 命名的缓存。
- 依赖 `workbox-precaching` 与 `workbox-core`，精确固定为 `7.4.1`。

## 影响

- 平台 worker 仍由平台拥有并可审查，ADR-0003 的前提不变；变化只在清单来源：清单来自编译计划，不来自对构建产物的扫描。
- 计划中的预缓存条目是否确实存在于构建产物中，不再由 Workbox 扫描顺带保证。这项检查由构建一侧负责（能力图中的 build-verifier 与 vite-adapter），具体方式由它们的规格决定。
- Workbox 的模块使用裸模块导入并读取 `process.env.NODE_ENV`，因此平台 worker 必须经过打包，并把 `process.env.NODE_ENV` 定义为 `"production"`；平台 worker 的打包归 vite-adapter。
- 预缓存条目沿用 Workbox 的缓存键格式，带 revision 的条目以 `__WB_REVISION__` 查询参数区分。更换引擎或改变缓存键格式会改变已缓存的内容，需要新的 ADR 与迁移计划。
- 升级 Workbox 属于依赖变更，需按依赖变更流程审阅，并重新运行引擎的单元测试与浏览器自测。Workbox 7.4.1 的类型声明与实际返回值存在不一致：`activate` 的结果声明为 `deletedCacheRequests`，实际返回 `deletedURLs`。引擎按实际返回值读取，字段缺失时直接报错；升级时需要重新核对。
- 引擎的规格见 [spec/workbox-engine.md](../../spec/workbox-engine.md)，包的依赖边界见[包边界](../architecture/package-boundaries.md)。
