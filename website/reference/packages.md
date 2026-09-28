# 包与公开入口

业务应用先按[包选择](/start/choose)确定直接依赖。以下状态对应已发布的 <code>0.1.0</code> 正式包，npm `latest` 指向该版本。

依赖只从上往下走，上层可以调用下层，下层不知道上层存在：

```text
宿主层   @pwa-platform/vue · @pwa-platform/react · (nuxt)      ← 你直接使用
构建层   @pwa-platform/vite                                    ← 你在构建配置里使用
运行时层 client-runtime（页面侧）· sw-runtime（worker 侧）
         engine-workbox（缓存引擎）                            ← 你碰不到，随上层自动安装
编译层   core（编译计划）· build-verifier（产物质检）
契约层   contracts（类型与校验）
可选模块 push · offline-write · entry-resilience               ← 需要时再装
```

## 几条不能碰的红线

1. **身份上线后不可变更。** <code>scope</code>、Service Worker URL、manifest ID 和缓存命名空间一旦在生产环境注册就不能再改；确实需要变更，必须先有架构决策记录和迁移计划。
2. **不能注入自己的 Service Worker 代码或 Workbox 配置**，只能通过 <code>PwaPolicy</code> 声明意图。
3. **敏感请求默认不缓存。** 私有数据、写操作、流媒体和未分类请求都不会进入缓存，想缓存某类请求必须在策略里明确声明，且不能突破安全基线。
4. **界面归业务。** 平台只提供状态和方法，不弹任何提示，也不替业务刷新页面。
5. **正式包不代替业务应用的生产浏览器验收**，尤其是 Chrome Android，见[兼容范围](/reference/compatibility)。

## 业务直接使用

| 包 | 作用 | 状态 |
| --- | --- | --- |
| [`@pwa-platform/vite`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/vite/README.md) | Vite 构建插件，生成并校验平台产物 | npm 0.1.0 |
| [`@pwa-platform/vue`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/vue/README.md) | <code>createPwa()</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.1.0 |
| [`@pwa-platform/react`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/react/README.md) | <code>PwaProvider</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.1.0 |
| [`@pwa-platform/contracts`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/contracts/README.md) | 配置 TypeScript 类型；仅在直接导入类型时单独安装 | npm 0.1.0 |
| [`@pwa-platform/entry-resilience`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/entry-resilience/README.md) | 可选的入口清单校验、恢复页构建与页面侧检查 | npm 0.1.0 |

<code>@pwa-platform/vite</code> 是构建配置中明确允许直接使用的底层入口。其余常规运行时能力应通过 Vue 或 React 绑定调用。

## 随上层自动安装

[`core`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/core/README.md) 编译策略；
[`client-runtime`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/client-runtime/README.md) 负责页面侧注册与生命周期；
[`sw-runtime`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/sw-runtime/README.md) 负责 worker 行为；
[`engine-workbox`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/engine-workbox/README.md) 封装缓存引擎；
[`build-verifier`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/build-verifier/README.md) 核对产物。这些包虽已随首批分发，但业务应用不应把它们当成配置 API。

## 十个 README 的阅读结构

README 统一回答六个开发者问题：这个包解决什么、谁应直接安装、有哪些公开入口、最小用法是什么、哪些
行为不属于它、去哪里读取完整接入或安全说明。业务入口包侧重可复制的安装与框架示例；底层包侧重导出
边界和“什么时候不要直接使用”。若 README 与生成类型或本参考页冲突，以当前 0.1.0 的 package exports
和类型声明为准，并应把冲突视为文档缺陷。

## 当前不供外部项目安装

<code>nuxt</code>、<code>push</code>、<code>offline-write</code>、<code>browser-test-harness</code>、<code>examples-browser-e2e</code> 和 <code>release-tools</code> 仍是工作区私有包。前三者属于[可选能力](/guide/optional)；后三者服务于平台测试与治理。

源仓库中的[包边界文档](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/package-boundaries.md)定义每个入口允许的依赖和职责，若需要维护平台本身，应以该文档为准。
