# 包边界

## 公开包

宿主包是业务应用唯一的常规入口。业务应用应安装一个宿主 facade，并在后续按需安装可选功能包。

```text
@pwa-platform/vue
@pwa-platform/react
@pwa-platform/nuxt
@pwa-platform/tanstack-start (deferred — did not pass the feasibility gate, see "SSR 适配器" below)
@pwa-platform/next        (future)
```

首批 npm 预发布只包含 Vite、Vue、React 接入的依赖闭包。内部包虽必须随宿主包作为传递依赖公开分发，业务项目仍不应直接依赖其实现入口；`@pwa-platform/vite` 是构建配置中的明确例外。`@pwa-platform/nuxt` 与可选模块保留在工作区，暂不对外发布。发布范围见 [npm 包发布流程](../operations/npm-package-release.md)。

## 内部包

`contracts` 不依赖框架，只负责类型、schema 和诊断。`core` 负责归一化、基线合并、优先级和 `PwaPlan` 编译。同源拓扑（[ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md)）在两者中都是只增不改的扩展：contracts 增加登记表契约与 `validateOriginRegistry`、拓扑类型 `shared-origin` 与路径规则动作 `exclude`；core 为根应用生成 `exclude` 规则并做子 scope 检查。`sw-runtime`、`client-runtime` 和 `engine-workbox` 实现浏览器行为。`build-verifier` 校验契约和编译计划。构建与宿主适配器只能向下依赖这些包。

业务应用不得引入内部包以配置原始 Workbox 路由或 Service Worker handler。

## 引擎包

`@pwa-platform/engine-workbox` 封装 Workbox，只由 `sw-runtime` 与 `vite-adapter` 使用；业务应用与宿主包不得直接引入。平台注入编译计划清单的决定见 [ADR-0011](../adr/0011-platform-injects-compiled-precache-manifest.md)，规格见 [spec/workbox-engine.md](../../spec/workbox-engine.md)。

- 构建期入口 `.`（`injectPrecacheManifest`）：只依赖 `contracts`，不导入 Workbox，由 `vite-adapter` 在构建时调用。
- 运行期入口 `./worker`（`createPrecacheEngine`）：只依赖精确版本的 `workbox-precaching` 与 `workbox-core`，不导入 Node 模块或构建期入口；由 `sw-runtime` 在平台 worker 中调用，平台 worker 必须经过打包。
- 引擎的公开类型不包含 Workbox 的选项、插件或 callback。
- 两个入口的依赖边界由包内的依赖边界测试守护。

## 运行时包

`@pwa-platform/sw-runtime` 提供平台 worker 与恢复 worker：由 `vite-adapter` 打包与发布，由 `client-runtime` 使用其消息常量；业务应用与宿主包不得直接引入。决定见 [ADR-0012](../adr/0012-platform-worker-runtime-config-and-recovery-worker.md)，规格见 [spec/sw-runtime.md](../../spec/sw-runtime.md)。

- 构建期入口 `.`：从 `PwaPlan` 生成 worker 配置并在打包后注入，另导出 worker 自身的路径匹配器 `createPathMatcher`；只依赖 `contracts`。worker 配置接受的规则动作包含 `exclude`（同源根应用排除子 scope，永不接管，[ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md)）。
- 运行期入口 `./worker`（平台 worker）：只依赖 `@pwa-platform/engine-workbox/worker`，不导入 contracts、Workbox 或 Node 模块。
- 运行期入口 `./recovery-worker`：不依赖任何包，因此恢复产物中不含 Workbox，也不注册 `fetch` 监听。
- 入口 `./messages`：页面与 worker 共用的跳过等待消息，不依赖任何包，供 `client-runtime` 使用。
- 入口 `./push-payload`：平台 Push 格式、校验与 3072 字节上限，不依赖任何包；平台 worker 与 `@pwa-platform/push/server` 共用这一份实现。
- 入口脚本 `./platform-worker-entry` 与 `./recovery-worker-entry` 读取注入点，是 `vite-adapter` 打包的对象。
- 各入口的依赖边界由包内测试按导入闭包守护：恢复 worker 与消息模块的整条导入链都不得出现包导入或平台 worker 的源码。

`@pwa-platform/client-runtime` 提供页面侧的客户端 facade：由 `vite-adapter` 接入、由 `vue-react-adapters` 包装成框架绑定；业务应用通过宿主 facade 使用它，不直接引入。决定见 [ADR-0013](../adr/0013-client-facade-and-page-side-lifecycle-events.md)，规格见 [spec/client-runtime.md](../../spec/client-runtime.md)。

- 构建期入口 `./build`：从 `PwaPlan` 生成 `PwaClientConfig`，只依赖 `contracts`，不含 DOM 专有 API。
- 页面运行期入口 `.`：`createPwaClient`（含 2026-09-18 起的 `checkForUpdate()` 与可选自动检查，[ADR-0020](../adr/0020-client-update-check.md)）与生命周期事件类型，依赖 `contracts` 与 `@pwa-platform/sw-runtime/messages`，不导入 Node 模块，也不导入 sw-runtime 的 worker 入口。
- 更新确认只使用 sw-runtime 导出的消息常量，本包不另造消息形态。
- 两个入口的依赖边界由包内测试按导入闭包守护；同一组测试还扫描源码，确保包内不出现页面重载、导航调用与 `caches` API（ADR-0013）。

`@pwa-platform/offline-write` 是协调 v2 的可选页面包：应用在完成常规 worker 注册、并且页面已经由同 scope worker 控制后才显式创建队列。它只导出 `createOfflineWriteQueue({ scope })` 及其 intent/queue 类型，提供 `enqueue`、`flush`、`clear` 三个受限协议入口；决定见 [ADR-0027](../adr/0027-explicit-session-bound-offline-write-queue.md)，规格见 [spec/offline-write-extension.md](../../spec/offline-write-extension.md)。

- 唯一生产依赖是 `@pwa-platform/sw-runtime/messages`；不引入第三方包，不访问 `fetch`、IndexedDB、Background Sync 或 `navigator.serviceWorker.register`。
- 只有当前受控的同 scope worker 才能接收消息；不受控、端口协议错误或超时都拒绝且不创建页面侧持久状态。
- 它不替代 `client-runtime.logout()`：logout 与 recovery 的清理属于 worker 所有的敏感状态生命周期。

## 校验包

`@pwa-platform/build-verifier` 回答编译器答不上来的问题：预缓存条目是否真的出现在发布产物中、部署返回的响应头是否符合基线、公开 HTML 的响应头是否可重新验证（`html-headers`，[ADR-0032](../adr/0032-html-response-header-check.md)，导出 `verifyHtmlHeaders`）、本次身份是否仍与槽位基线一致、同源子应用发布前线上根应用是否已排除它（`release-order`，[ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md)），以及带指纹资产是否满足 R/R-1/R-2 与七天保留窗口（`release-retention`，[ADR-0024](../adr/0024-release-retention-verification.md)，导出 `verifyReleaseRetention`）。发布编排器显式提供历史记录与当前可用路径；Vite 单次构建不执行这项检查。它还导出 `verifyReleaseGateCoverage`，仅验证调用方声明的必需检查都出现在报告中；发布方必须把该覆盖结果与 `report.ok` 合取，实际必需集仍由外部发布协议决定（[ADR-0025](../adr/0025-release-gate-completeness-and-external-orchestration.md)）。业务应用与宿主包不得直接引入。决定见 [ADR-0014](../adr/0014-build-verification-boundary-and-report.md)，规格见 [spec/build-verifier.md](../../spec/build-verifier.md)。

- 单一入口 `.`，只依赖 `contracts`：计划合法性调用 `validatePlan`，不重新实现任何 `compile.*` 判断，也不依赖 `core`。（`core` 只作为开发依赖出现在测试中，用来编译发布顺序校验所需的真实计划。）
- 零网络：响应头由调用方采集后传入，本包不发请求。
- 零写盘，且只有 `baseline-file.ts` 一个模块可以读盘（`node:` 内建模块仅此一处可用）；其余全部是纯函数，因而发布检查可在 CI 中离线运行。
- 覆盖函数不读取环境、身份、拓扑或发布历史，不推断默认必需集，也不把“检查均被执行”判作“检查均通过”。
- 自带 `Cache-Control` 解析：生产代码不得导入测试包，因此不复用 harness 的解析器，两份实现由一致性测试守护。
- 以上边界由包内的导入闭包测试按文件逐条守护。

## 构建适配器

`@pwa-platform/vite` 把上面各包接成一条构建流水线：采集宿主产物、编译计划、生成 manifest、打包并注入两个 worker、以虚拟模块交付页面配置、在末尾校验产物。它由业务应用在 `vite.config` 中挂载，是唯一被应用直接引入的内部包；`vue-react-adapters` 与 `ssr-adapters` 在它之上包装。决定见 [ADR-0015](../adr/0015-vite-plugin-build-pipeline.md)，规格见 [spec/vite-adapter.md](../../spec/vite-adapter.md)。

- 单一入口 `.`：插件工厂 `pwa(options)`，外加常量 `PWA_PLUGIN_NAME` 与只读计划 API 类型 `PwaPluginApi`（任务 4，2026-09-17，供同一构建内的其他插件在 `writeBundle` 或更晚的钩子读取编译后的 `PwaPlan`；深度冻结的副本，`generateBundle` 编译成功前与本次构建失败时为 `null`，决定见 [ADR-0015](../adr/0015-vite-plugin-build-pipeline.md)）。**另外导出不依赖 Vite 插件钩子的产物流水线入口**（ssr-adapters 任务 4，2026-09-17）：函数 `buildPwaArtifacts`、`assertPwaArtifacts`，与类型 `PwaArtifactInput`、`PwaArtifactSourceFile`、`PwaArtifactResult`、`PwaArtifactOutputFile`——输入身份、策略、安装元数据、拓扑、`publicPath` 与最终产物文件列表，输出计划、编译警告与待写出的 worker/manifest 文件；`pwa()` 内部改为调用同一入口，全仓只有一条产物流水线。`@pwa-platform/nuxt` 在 `nitro:build:public-assets` 钩子中调用它。选项的 `topology` 接受同源拓扑 `{ kind: "shared-origin", registry }`，登记表在插件创建时校验；编译警告经 `this.warn` 输出到构建日志（shared-origin-topology 任务 6，ADR-0015 增补）。公开面只有这些与选项类型，不再导出任何上游包的类型或函数——包边界测试断言这一点，防止它退化成一个再导出层。
- 依赖六个平台包（contracts、core、engine-workbox、sw-runtime、client-runtime、build-verifier），`vite` 为 peer 依赖；不新增第三方依赖。
- 不重新实现任何上游能力：计划编译、两处注入、worker 配置生成、页面配置组装、产物校验，全部调用上游的公开入口。
- **`node:fs` 只允许出现在 `public-files.ts`**，由按文件的导入守卫钉死；`node:crypto`、`node:path`、`node:url` 是纯函数工具，全包可用。其余模块只消费传入的数据。读盘只针对 `publicDir`——Vite 把该目录原样复制到输出，这些文件不进 bundle，不读就会让计划描述的构建小于实际发布的构建（ADR-0015）。
- 页面配置经虚拟模块 `virtual:pwa-config` 交付，由已校验的选项组装，与 client-runtime 的 `createClientConfig` 由一致性测试钉死。
- 构建时经 `transformIndexHtml` 向每个 HTML 入口注入 `<link rel="manifest">`；页面已有指向同一地址的链接时原样保留，地址不一致、跨源或多于一个时构建失败。该钩子只在 `pwa()` 中，`buildPwaArtifacts` 不受影响（[ADR-0022](../adr/0022-vite-injects-manifest-link.md)）。

## 宿主适配器

`@pwa-platform/vue` 与 `@pwa-platform/react` 把 client-runtime 的 facade 包装成各自框架的惯用绑定：应用在框架生命周期里拿到状态与方法，不自己创建 facade、不自己订阅事件、不自己管销毁。界面仍归业务应用（[ADR-0013](../adr/0013-client-facade-and-page-side-lifecycle-events.md)）。决定见 [ADR-0016](../adr/0016-framework-bindings.md)，规格见 [spec/vue-react-adapters.md](../../spec/vue-react-adapters.md)。

- 各自单一入口 `.`：Vue 是 `createPwa` 插件加 `usePwa()` composable，React 是 `PwaProvider` 加 `usePwa()` hook。两侧暴露同一组状态（四个布尔；`update-applied` 只使 `updateWaiting` 回到 `false`，见 [ADR-0026](../adr/0026-update-applied-page-lifecycle-event.md)）与同一组方法（facade 的五个，2026-09-18 起含 `checkForUpdate`，见 [ADR-0020](../adr/0020-client-update-check.md)），但容器按各自框架的惯例不同——一边是 `Ref`，一边是快照值。`subscribe` 与 `dispose` 不在公开面。
- 两个包都只依赖 `@pwa-platform/client-runtime`；peer 分别是 `vue`（`^3.4.0`）与 `react`（`^19.2.0`）。**不声明 `react-dom`**：只使用 `react` 本身导出的 API，渲染器由应用选择。`@types/react` 是必需的开发依赖，因为 react 不发布自己的类型。
- **两个包互不依赖。** peer 依赖不互相污染——只用 React 的应用不应被要求安装 Vue。`@pwa-platform/react` 在 `devDependencies` 中引用 `@pwa-platform/vue` 仅供一致性测试使用，包边界测试断言它绝不出现在生产导入闭包中。
- 状态机在两个包中各实现一份，由 `packages/react` 中的一致性测试钉住**状态序列**相同（做法同 build-verifier 的第二份 `Cache-Control` 解析）。该测试只走对方的公开面，逐个事件比对快照；引用稳定性、方法转发与生命周期清理不在其守护范围内，各由所属包自己的测试负责。**跨包导入解析到 `dist` 而非源码，因此改动 Vue 侧后必须重新 build 才能信任它**（[ADR-0016](../adr/0016-framework-bindings.md)）。
- 两个包都不提供 `test:browser`：真实浏览器的安装、离线、更新与登出验证归 `examples-browser-e2e`。
- 不重新实现 facade 的任何判断，不重试、不轮询、不在确认更新后刷新页面；不出现 `caches`、页面重载与导航调用。以上边界由各包的导入闭包测试与源码扫描守护。

## SSR 适配器

`@pwa-platform/nuxt` 在最终部署产物之上生成平台产物，而不是在 Vite 客户端构建的输出之上：Nuxt 的预渲染 HTML 在客户端构建结束之后才生成，`public/` 目录由框架复制。应用在 `nuxt.config` 的 `pwaPlatform` 键中声明身份、策略与安装元数据，模块在 `nitro:build:public-assets` 钩子（预渲染已完成、Nitro 尚未固化静态文件清单的时点）调用 vite-adapter 新增的产物流水线入口，为最终 `.output/public` 写出平台 worker、恢复 worker、manifest 与预缓存清单，并执行产物校验；客户端与服务端构建都安装 Vue 绑定，服务端只走 [ADR-0016](../adr/0016-framework-bindings.md) 的服务端渲染安全路径，模块本身**不自动注册** worker（ADR-0013）。决定见 [ADR-0012](../adr/0012-platform-worker-runtime-config-and-recovery-worker.md)（不带尾斜杠导航与拒绝类导航的离线回退修订）、[ADR-0015](../adr/0015-vite-plugin-build-pipeline.md)（产物流水线入口）、[ADR-0016](../adr/0016-framework-bindings.md)（服务端渲染语义），规格见 [spec/ssr-adapters.md](../../spec/ssr-adapters.md)。

- 只支持独立源拓扑，不支持同源拓扑（shared-origin-topology 只做了 Vite 接入）。
- 依赖 `@pwa-platform/client-runtime`、`@pwa-platform/contracts`、`@pwa-platform/vue`、`@pwa-platform/vite`（产物流水线入口）与 `@pwa-platform/sw-runtime`（构建期入口 `.` 的 `createPathMatcher`，用于"拒绝类路径下出现预渲染 HTML 即构建失败"检查）；peer 依赖 `nuxt`（`>=4.5.0 <4.6.0`）与 `vue`（`^3.5.0`）。
- 不得做：不暴露 Workbox 或原始 Service Worker 配置；不自动注册 worker（注册仍是应用在只在客户端执行的位置发起的调用）；不从框架的 `routeRules`、`definePageMeta` 或路由 `ssr` 选项推断数据是否私有。
- **`@pwa-platform/tanstack-start` 未通过可行性门槛，推迟交付**（检查点 A，2026-09-17）：生产托管依赖尚在 beta 的 Nitro v3 且未验证；框架的水合方式会把离线页当作客户端渲染壳应答其他路由，与已决定的离线模型冲突；最终产物的可写入时点依赖插件排序与内部实现，没有公开钩子。详见 [spec/ssr-adapters.md](../../spec/ssr-adapters.md) 范围一节与 [tasks/ssr-adapters/plan.md](../../tasks/ssr-adapters/plan.md) 任务 2、任务 8 实施记录；探路工程 `packages/ssr-spike-tanstack` 已删除。

## 可选模块

`@pwa-platform/entry-resilience` 提供访问入口灾备：当前 Origin 迁移或不可达时，为已安装应用展示经用户确认的备用入口。清单由业务应用用自己的请求层取得并交入，平台负责保存、判新旧、校验形状与展示（[ADR-0033](../adr/0033-entry-manifest-supplied-by-the-application.md)，取代 ADR-0017 的信任模型）。按 [ADR-0006](../adr/0006-optional-shared-origin-and-push-modules.md) 的方式做成可选模块，信任模型见 [ADR-0017](../adr/0017-entry-manifest-trust-model.md)，交付边界见 [ADR-0018](../adr/0018-entry-resilience-delivery-boundary.md)，规格见 [spec/pwa-entry-resilience.md](../../spec/pwa-entry-resilience.md)。

- 三个入口：
  - `.`：契约、形状校验与展示判定（纯函数），以及浏览器适配器 `createIndexedDbStore`、`createProbes`、`createEntryRuntimePorts`、`createEntryRecoveryChecker`；其中 `parseEntryManifest` 供接入方在 Node 侧（后端或 CI）下发前自查清单，与运行时用的是同一个函数；
  - `./client`：浏览器侧的 `updateEntryManifest()` 与 `checkEntryRecovery()`；
  - `./vite`：构建期插件 `pwaEntryResilience()`。
- **整个 `src/` 不导入任何 `node:` 模块**，由按文件的导入守卫钉死。`src/vite/` 在运行时只导入 `@pwa-platform/vite`，`vite` 与 `contracts` 只做类型导入；`src/client/` 与 `src/page/` 只导入虚拟模块 `virtual:pwa-entry-config`；其余文件不导入任何包。
- 依赖 `@pwa-platform/vite`，`vite` 为 peer 依赖；不引入任何第三方包。包内不含任何密码学校验：加解密与真实性由业务应用的请求层负责。
- **不修改任何已交付包的公开契约**：`PwaPlan` v1、client-runtime、sw-runtime 与框架绑定都保持不变。诊断使用本包自己的 `entry.*` 码表，不追加进 contracts。唯一的上游改动是 `@pwa-platform/vite` 增补的只读计划 API（ADR-0015）。

`@pwa-platform/push` 是可选 Web Push 模块：页面侧只在应用显式调用时查询、订阅或取消订阅；后端侧只提供平台 Push 格式的构造与校验。worker 中固定的 Push 与点击监听仍由 `sw-runtime` 所有（[ADR-0021](../adr/0021-push-handling-in-the-platform-worker.md)），本包不注册 worker、不发网络请求，也不保存订阅。

- 两个入口：`.` 导出 `getPushState`、`subscribePush` 与 `unsubscribePush`，只使用浏览器 Push API；`./server` 导出 `createPushPayload`、格式校验与类型，纯 TypeScript，可在 Node 等后端运行时使用。
- 唯一生产依赖是 `@pwa-platform/sw-runtime` 的 `./push-payload` 公开入口；不引入第三方依赖。页面入口不导入 `client-runtime`，只接收同形的 `{ scope }` 目标；`./server` 不导入 DOM 或页面入口。
- **不改 client-runtime 或框架绑定。** 应用先按既有路径注册 worker，再自行在用户手势中调用页面入口，并自行把返回的订阅发送给后端。

## 测试包

`@pwa-platform/browser-test-harness` 是内部测试包，为运行时模块提供真实浏览器验证能力：fixture 服务器、最小页面、worker 与缓存断言。采用它的决定见 [ADR-0010](../adr/0010-real-browser-verification-with-playwright.md)。

- 只依赖 `contracts` 与 Playwright Test，不依赖任何运行时包。
- 运行时包与宿主包只能在 `devDependencies` 中引用它，生产代码不得导入。
- 包内的 worker fixture 只用于 harness 自测，不代表平台行为。

## 治理工具

`@pwa-platform/release-tools` 是本地门禁工具（[ADR-0031](../adr/0031-local-gate-substitute-for-ci.md)），GitHub 不可用期间代替真实 CI 生成本地门禁记录，决定见 spec/platform-governance.md 的"修订：本地门禁工具入仓"。

- 私有工作区包，不发布到 npm。
- 不依赖任何平台包。
- 只供发布操作者通过根目录的 `gate:local` 脚本使用，不得被产品代码或其他平台包引入。
