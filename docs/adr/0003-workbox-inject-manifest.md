# ADR-0003：首个 Service Worker 引擎采用 Workbox InjectManifest

## 状态

已接受；由 [ADR-0011](0011-platform-injects-compiled-precache-manifest.md) 修订（2026-09-15）：预缓存清单改由平台从编译后的 `PwaPlan` 注入，不再由 Workbox 扫描构建产物生成。下文保留原结论。

## 背景

平台既需要自定义生命周期、安全、更新与降级行为，也需要可靠生成预缓存 manifest。

## 决策

首个引擎采用 Workbox `InjectManifest`。平台拥有 worker 源码，Workbox 注入构建 manifest。

## 影响

worker 保持可审查且受平台控制。首期不支持多个 Service Worker 引擎。
