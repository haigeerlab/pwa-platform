# 包与公开入口

业务应用先按[包选择](/start/choose)确定直接依赖。以下状态对应已发布的 <code>0.3.1</code> 正式包，npm `latest` 指向该版本。

npm `0.3.1` **已包含**可移植部署和独立的 worker MIME 发布检查；各包的公开入口见下表。
本次补丁修复 Windows 上 Vite bundle URL 和入口恢复页的本地文件路径处理；公开 API 不变。

依赖只沿一个方向走：上层可以依赖下层，下层不知道上层存在。以下是已发布包的实际 `dependencies`：

```text
entry-resilience（可选）                                       ← 需要时再装；依赖 vite，所以位于 vite 之上
宿主层   vue · react（依赖 client-runtime）                     ← 你直接使用
构建层   vite（依赖 core · build-verifier · client-runtime ·    ← 你在构建配置里使用
              sw-runtime · engine-workbox · contracts）
运行时层 client-runtime → sw-runtime → engine-workbox           ← 你碰不到，随上层自动安装
编译层   core（编译计划）· build-verifier（产物质检）
契约层   contracts（类型与校验，运行时依赖 zod）
```

`nuxt`、`push`、`offline-write` 尚未发布，见[当前不供外部项目安装](#当前不供外部项目安装)。

## 几条不能碰的红线

1. **身份上线后不可变更。** <code>PwaIdentity</code> 的九个字段（<code>appId</code>、<code>manifestId</code>、<code>origin</code>、<code>scope</code>、<code>serviceWorkerUrl</code>、<code>manifestUrl</code>、<code>mountPath</code>、<code>environment</code>、<code>cacheNamespaceSeed</code>）一旦在生产环境注册就不能再改，逐项说明见[字段参考](/guide/configuration#field-reference)；确实需要变更，必须先有架构决策记录和迁移计划。
2. **不能注入自己的 Service Worker 代码或 Workbox 配置**，只能通过 <code>PwaPolicy</code> 声明意图。
3. **敏感请求默认不缓存。** 私有数据、写操作、流媒体和未分类请求都不会进入缓存，想缓存某类请求必须在策略里明确声明，且不能突破安全基线。
4. **界面归业务。** 平台核心只提供状态和方法，不会自己弹出提示，也不替业务刷新页面；Vue／React 的 <code>./ui</code> 子路径提供可选的默认更新提示，只有业务显式挂载才显示（见[更新与提示](/guide/updates)）。
5. **正式包不代替业务应用的生产浏览器验收**，尤其是 Chrome Android，见[兼容范围](/reference/compatibility)。

## 业务直接使用

| 包 | 作用 | 状态 |
| --- | --- | --- |
| [`@pwa-platform/vite`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/vite/README.md) | Vite 构建插件，生成并校验平台产物 | npm 0.3.1 |
| [`@pwa-platform/vue`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/vue/README.md) | <code>createPwa()</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.3.1 |
| [`@pwa-platform/react`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/react/README.md) | <code>PwaProvider</code>、<code>usePwa()</code>；可选 <code>./ui</code> 与 <code>./update-notice.css</code> | npm 0.3.1 |
| [`@pwa-platform/contracts`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/contracts/README.md) | 配置类型**与运行时校验函数**（<code>validateIdentity</code>、<code>validatePolicy</code>、<code>validatePlan</code> 等，运行时依赖 <code>zod</code>）；仅在直接导入类型或校验函数时单独安装 | npm 0.3.1 |
| [`@pwa-platform/entry-resilience`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/entry-resilience/README.md) | 可选的入口清单校验、恢复页构建与页面侧检查 | npm 0.3.1 |

<code>@pwa-platform/vite</code> 是构建配置中明确允许直接使用的底层入口。其余常规运行时能力应通过 Vue 或 React 绑定调用。

## 随上层自动安装

[`core`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/core/README.md) 编译策略；
[`client-runtime`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/client-runtime/README.md) 负责页面侧注册与生命周期；
[`sw-runtime`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/sw-runtime/README.md) 负责 worker 行为；
[`engine-workbox`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/engine-workbox/README.md) 封装缓存引擎；
[`build-verifier`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/build-verifier/README.md) 核对产物。这些包均已发布（当前 0.3.1），但业务应用不应把 `core`、`client-runtime`、`sw-runtime`、`engine-workbox` 当成配置 API。

`build-verifier` 例外：它在构建时由 Vite 适配器自动调用，你不需要做任何事；但它导出的**发布检查**可以由你的部署脚本或 CI 直接调用，用来验证线上响应头、worker MIME、可移植部署域名、保留期和发布顺序：`verifyRelease`、`requiredReleaseChecks`、`verifyReleaseGateCoverage`、`verifyResponseHeaders`、`verifyWorkerScriptMime`、`verifyDeploymentOrigin`、`verifyReleaseRetention`、`verifyReleaseOrder`。它是纯判断函数，没有命令行入口，线上数据由你采集。用法见[服务器与 CDN 配置](/operations/hosting#自检)。

## 已发布包的入口

下表与各包 `package.json` 的 `exports` 一一对应（均为 ESM，Node.js 要求 `>=22.0.0`）。不在表内的子路径不是公开入口，导入会失败。

| 包 | 入口 | 内容 |
| --- | --- | --- |
| `@pwa-platform/vite` | `.` | Vite 插件 `pwa()`、`buildPwaArtifacts` 等 |
| | `./virtual` | 仅类型：`virtual:pwa-config` 虚拟模块的声明 |
| `@pwa-platform/vue` | `.` | `createPwa()`、`usePwa()` |
| | `./ui` | 可选的默认更新提示组件 |
| | `./update-notice.css` | 默认更新提示的样式 |
| `@pwa-platform/react` | `.` | `PwaProvider`、`usePwa()` |
| | `./ui` | 可选的默认更新提示组件 |
| | `./update-notice.css` | 默认更新提示的样式 |
| `@pwa-platform/contracts` | `.` | 类型、校验函数、常量、诊断码 |
| `@pwa-platform/entry-resilience` | `.` | 入口清单解析、探测决策与恢复检查（`parseEntryManifest`、`decideRecovery`、`runEntryRecovery` 等） |
| | `./vite` | 构建侧插件 `pwaEntryResilience()` |
| | `./client` | 页面侧 `checkEntryRecovery()`、`updateEntryManifest()` 等 |
| `@pwa-platform/core` | `.` | `compilePlan`（策略编译） |
| `@pwa-platform/client-runtime` | `.` | 页面侧运行时（`createPwaClient`、事件类型） |
| | `./build` | 构建期页面配置生成（`createClientConfig`） |
| `@pwa-platform/sw-runtime` | `.` | 构建期 worker 配置生成与注入 |
| | `./worker` | 平台 worker |
| | `./recovery-worker` | 恢复 worker |
| | `./messages` | 页面与 worker 的消息格式 |
| | `./push-payload` | Push 载荷格式与校验（`checkPushPayload`） |
| | `./platform-worker-entry` | 平台 worker 入口 |
| | `./recovery-worker-entry` | 恢复 worker 入口 |
| `@pwa-platform/engine-workbox` | `.` | 构建期预缓存清单注入（`injectPrecacheManifest`） |
| | `./worker` | worker 内的缓存引擎 |
| `@pwa-platform/build-verifier` | `.` | 构建校验与发布检查 |

## 十个 README 的阅读结构

README 统一回答六个开发者问题：这个包解决什么、谁应直接安装、有哪些公开入口、最小用法是什么、哪些
行为不属于它、去哪里读取完整接入或安全说明。业务入口包侧重可复制的安装与框架示例；底层包侧重导出
边界和“什么时候不要直接使用”。若 README 与生成类型或本参考页冲突，以当前 0.3.1 的 package exports
和类型声明为准，并应把冲突视为文档缺陷。

## 当前不供外部项目安装

<code>nuxt</code>、<code>push</code>、<code>offline-write</code>、<code>browser-test-harness</code>、<code>examples-browser-e2e</code> 和 <code>release-tools</code> 仍是工作区私有包。前三者属于[可选能力](/guide/optional)；后三者服务于平台测试与治理；其中 <code>release-tools</code> 只供本平台仓库的维护者发布使用，业务应用的发布流程不依赖它（业务侧的发布检查见 <code>build-verifier</code>）。

源仓库中的[包边界文档](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/package-boundaries.md)定义每个入口允许的依赖和职责，若需要维护平台本身，应以该文档为准。
