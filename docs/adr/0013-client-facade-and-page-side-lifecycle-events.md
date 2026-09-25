# ADR-0013：客户端 facade 与页面侧生命周期事件

## 状态

已接受（2026-09-16）。落实 [ADR-0005](0005-update-prompt-and-recovery-worker.md) 中"应用拥有更新提示的展示"，使用 [ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 定义的确认消息。

2026-09-18 后续修订：facade 新增 `checkForUpdate()` 与可选的自动检查，事件集合与更新语义不变，见 [ADR-0020](0020-client-update-check.md)。

2026-09-20 后续修订：新增页面侧 `update-applied`，在实际接管后结束已提示页面的更新周期，见 [ADR-0026](0026-update-applied-page-lifecycle-event.md)。

2026-09-24 后续修订：新增页面侧 `served-from-cache`，见 [ADR-0035](0035-explicit-public-read-runtime-cache.md)。

## 背景

[ADR-0005](0005-update-prompt-and-recovery-worker.md) 规定默认提示更新，并把提示的展示交给应用的客户端 facade，但没有规定这个 facade 的形态。[ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 定义了跳过等待的确认消息常量，并把提示界面与生命周期事件的传输留给 client-runtime 决定。

contracts 定义了八种生命周期事件类型与它们的信封，以及只读的 `readLifecycleEvent`，但**没有传输通道**。而 sw-runtime 已经交付，平台 worker 不发送任何消息：`activated`、`offline-fallback`、`cache-cleaned` 的触发点在 worker 内部，页面观察不到。

登出清理的语义在三份文档里指向不同方向：[安全模型](../architecture/security-model.md)要求"登出必须清除平台管理的用户敏感缓存分类"；[产品范围](../product/vision-and-scope.md)把"登出清理只会移除平台会话元数据"写在首期非目标里；[路线图](../product/roadmap.md)把"会话元数据清理"列为 v1 的交付项。而 v1 把 `session-data`、`mutation`、`stream`、`unclassified` 一律编译为 `deny`，平台**不缓存任何私有数据**——安全模型要求清除的那个分类，在 v1 是空集。

## 决策

- **公开形态是工厂函数返回的 facade 对象。** `createPwaClient({ config, container?, target? })` 返回带 `register`、`promptInstall`、`applyUpdate`、`logout`、`subscribe`、`dispose` 的对象。注册状态、待用的安装提示、等待中的 worker 都是该对象的内部状态，应用不接触 `navigator.serviceWorker`。`container` 与 `target` 分别默认取 `navigator.serviceWorker` 与全局 `window`，显式传入只为测试注入；`container` 不叫 `scope`，因为后者已是配置中的注册路径。
- **配置由构建期从 `PwaPlan` 生成。** 本包的构建期入口产出 `PwaClientConfig`（`appId`、`scope`、`serviceWorkerUrl`、`updateMode`、`installEnabled`），页面只拿到它，拿不到路径规则与预缓存清单。与 sw-runtime 的运行时配置对称。
- **页面侧可观察事件为五个**：`registered`、`install-eligible`、`installed`、`update-waiting`、`update-applied`，用 contracts 的信封发出，`metadata` 只含非敏感的扁平值。`update-applied` 仅在已经发出 `update-waiting` 的页面观察到 `controllerchange` 后发出，结束该提示周期；其余 worker 侧三个事件仍不发，接入它们需要给已交付的 sw-runtime 增加消息发送能力，属于修改其公开契约。
- **登出只注销注册，不删除任何缓存。** registration 是 v1 中唯一实际存在的"平台会话元数据"。`appCachePrefix` 下 v1 只有公共静态应用壳，删除它不清除任何私有数据，却会让登出后的离线启动失效；安全模型要求清除的分类在 v1 为空集，本决定自动满足它。包内任何位置都不出现 `caches` API，由源码扫描守护。
- **`applyUpdate()` 不重新加载页面。** 它发送确认消息并等待新 worker 接管，是否重新加载由应用决定（[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)禁止全局强制刷新）。10 秒内没有接管则抛错，而不是返回 `false`——后者已表示"没有等待中的更新"，两种情况必须可区分。包内不出现任何页面重载或导航调用，同样由源码扫描守护。

## 影响

- vite-adapter 需要把构建期生成的 `PwaClientConfig` 送进页面（例如生成一个模块），并继续打包 sw-runtime 的两个 worker 入口。
- vue-react-adapters 在这个 facade 之上做框架绑定与状态映射，不另建一套生命周期 API。
- push-module 依赖 client-runtime；它若需要 worker 侧事件，要先解决下一条。
- **worker 侧三个事件的接入需要新的 ADR**，因为它要修改已交付的 sw-runtime 公开契约。[可观测性](../product/observability.md)描述的是平台的最终形态，不是 v1 的实现承诺；v1 已接入五个页面侧事件，其余三个记为已知限制。
- examples-browser-e2e 的登出验收场景按本 ADR 的语义判定：登出后注册消失，缓存保持不变；当前文档保持其控制者直到被替换，这是 `unregister()` 的既有语义。
- 改变 facade 形态、事件集合或登出语义都会跨模块影响 vite-adapter、vue-react-adapters、push-module 与 examples-browser-e2e，需要新的 ADR。
- 规格见 [spec/client-runtime.md](../../spec/client-runtime.md)，依赖边界见[包边界](../architecture/package-boundaries.md)。

## 增补：`served-from-cache`（2026-09-24，[ADR-0035](0035-explicit-public-read-runtime-cache.md)）

页面侧可观察事件由五个扩为六个，新增 `served-from-cache`：只在响应确实由公共读取运行时缓存提供时发出（[public-read-cache](../../spec/public-read-cache.md)），沿用本 ADR 定义的事件信封，`metadata` 为 `{ url, cachedAt, reason }`。子资源命中由 worker 直接向 `event.clientId` 发消息；导航命中由 worker 暂存一条待取记录，client-runtime 在 `register()` 之后查询取走，避免消息先于页面监听器建立而丢失。`served-from-cache` 同时加入 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`；vue-react-adapters 的 `reduce` 各补一个不改变状态的分支。启用了运行时缓存的应用，登出握手在回 `cleared` 之前额外删除全部运行时缓存，语义与协调 v2 的离线写清理并列，握手协议本身不变。

## 增补：`served-from-cache` 的 `network-timeout`（2026-09-24，[ADR-0038](0038-network-timeout.md)）

`served-from-cache` 的 `metadata.reason` 由两种取值增为三种，新增 `network-timeout`：network-first 运行时缓存在设置的超时内没有得到网络响应、改用缓存时使用。网络在超时前失败时仍为 `network-failed`。事件集合与其他字段不变；按 `reason` 穷举分支的业务代码需要补上新值。
