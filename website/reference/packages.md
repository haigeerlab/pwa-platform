# 包与公开入口

业务应用先按[包选择](/start/choose)确定直接依赖。以下状态对应已发布的 <code>0.1.0</code> 正式包，npm `latest` 指向该版本。

## 业务直接使用

| 包 | 作用 | 状态 |
| --- | --- | --- |
| <code>@pwa-platform/vite</code> | Vite 构建插件，生成并校验平台产物 | npm 0.1.0 |
| <code>@pwa-platform/vue</code> | <code>createPwa()</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.1.0 |
| <code>@pwa-platform/react</code> | <code>PwaProvider</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.1.0 |
| <code>@pwa-platform/contracts</code> | 配置 TypeScript 类型；仅在直接导入类型时单独安装 | npm 0.1.0 |
| <code>@pwa-platform/entry-resilience</code> | 可选的入口清单校验、恢复页构建与页面侧检查 | npm 0.1.0 |

<code>@pwa-platform/vite</code> 是构建配置中明确允许直接使用的底层入口。其余常规运行时能力应通过 Vue 或 React 绑定调用。

## 随上层自动安装

<code>core</code> 编译策略；<code>client-runtime</code> 负责页面侧注册与生命周期；<code>sw-runtime</code> 负责 worker 行为；<code>engine-workbox</code> 封装缓存引擎；<code>build-verifier</code> 核对产物。这些包虽已随首批分发，但业务应用不应把它们当成配置 API。

## 当前不供外部项目安装

<code>nuxt</code>、<code>push</code>、<code>offline-write</code>、<code>browser-test-harness</code>、<code>examples-browser-e2e</code> 和 <code>release-tools</code> 仍是工作区私有包。前三者属于[可选能力](/guide/optional)；后三者服务于平台测试与治理。

源仓库中的[包边界文档](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/package-boundaries.md)定义每个入口允许的依赖和职责，若需要维护平台本身，应以该文档为准。
