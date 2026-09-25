# ADR-0020：客户端主动检查更新

## 状态

已接受（2026-09-18）。决定内容即项目所有者同日评审通过的规格修订。在 [ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 的 facade 与 [ADR-0016](0016-framework-bindings.md) 的框架绑定上各新增一项公开能力，不改变 [ADR-0005](0005-update-prompt-and-recovery-worker.md) 的“提示、确认后才接管”。

## 背景

浏览器只在导航到作用域内页面、以及功能事件距上次检查超过 24 小时等时机，自行检查 worker 脚本是否有新版本。后台管理这类单页应用常常整天不刷新页面：部署了新版本，`update-waiting` 却一直不发出，用户停在旧版本上。

[vue-vben-admin](../product/vben-admin-pwa-analysis.md) 用一个与 Service Worker 无关的组件弥补这一点：定时向首页发 HEAD 请求比对 `ETag`，发现变化就提示刷新。这证明需求真实存在，但它检查的是 HTML，与 worker 的版本不是同一个东西——刷新后页面可能仍由旧 worker 控制。

facade 已有完整的更新检测路径：`register()` 之后监听 `updatefound` 与安装中 worker 的 `statechange`，按 worker 去重后发出 `update-waiting`。缺的只是“让浏览器现在就去检查”的入口。

## 决策

- **检查对象是 worker 脚本，不是 HTML。** `checkForUpdate()` 只调用 `registration.update()`。检查到的就是确认后能接管页面的那个版本，新版本的发现与 `update-waiting` 的发出全部复用现有路径，事件集合仍是四个。
- **返回值只作参考。** `"update-available"` 表示 `update()` 兑现后 `installing` 或 `waiting` 不为空，`"up-to-date"` 表示两者都为空，`"unavailable"` 表示没有注册。新版本可能随后安装失败，提示仍以 `update-waiting` 为准。并发调用共享一次检查；`update()` 的错误原样抛给调用方。
- **自动检查是运行期选项，不进 `PwaPolicy` 或 `PwaClientConfig`。** 检查频率是页面行为，不是身份或缓存策略；放进构建期配置要改 contracts、core、vite-adapter 三个已交付包的契约，收益只是“可在构建期审计”。代价是频率不出现在构建报告里。
- **间隔下限 60 秒，默认关闭。** 平台注册时不设 `updateViaCache`，按规范默认值 `"imports"`，每次检查都绕过 HTTP 缓存请求一次 `serviceWorkerUrl`。下限防止它变成高频轮询；上限 2 147 483 647 是 `setTimeout` 能接受的最大值。
- **页面不可见时不检查。** 到点时页面隐藏就跳过并记为欠一次；回到可见时，若欠着一次或距上次自动检查开始已满一个间隔，立即检查一次。计时从上一次检查结束起算，检查不会重叠。手动调用不推迟自动检查的计时，但两者同时发生时只发一次请求。
- **自动检查的失败一律吞掉。** 不抛出、不发事件、不留下未处理的 Promise 拒绝，下一个周期照常检查。不读取 `navigator.onLine`：它在很多网络环境下不可靠，断网时让检查失败再吞掉更简单。
- **自动检查挂在注册的生命周期上。** `register()` 成功后开始，`logout()` 时停止，下次 `register()` 成功后重新开始；`dispose()` 显式停止调度器并撤销计时器与可见性监听。只经撤销清单撤销不够：检查仍在进行时，它结束后会重新设定计时器。这个缺陷在实现验收时由测试复现并修复。
- **框架绑定同批暴露，`client` 与 `updateCheck` 互斥。** `usePwa()` 返回的方法里加入 `checkForUpdate`；服务端渲染时它与其他方法一样以同一条信息拒绝。选项经 Vue 的 `createPwa` 与 React 的 `PwaProvider` 传入；注入的 `client` 已经建好，绑定无法再给它设置自动检查，因此两者同时传入时抛错，而不是静默忽略。React 的 effect 依赖 `updateCheck?.intervalMs` 这个字段，不依赖对象本身。

## 影响

- **部署方要知道检查请求的频率**：约为“可见标签页数 × 每 `intervalMs` 一次”，每次请求一次 `serviceWorkerUrl`，以 60 秒下限计，每个可见标签页每小时最多 60 次。已写入[发布与事故运行手册](../operations/release-and-incident-runbook.md)。
- **`@pwa-platform/nuxt` 不转发 `updateCheck`。** 它在运行时挂载路径与身份不一致时会自行包装 `client` 再交给 `createPwa`，与互斥规则冲突；包装是展开原对象，所以 `checkForUpdate()` 本身照常可用。是否以及如何转发 `updateCheck` 留作开放问题，等有 Nuxt 消费方时再做。届时的做法：由 Nuxt 运行时插件自己用 `updateCheck` 创建 facade，需要时再用 `bindClientToRuntimeBase` 包装，最后作为 `client` 交给 `createPwa`。绑定层只收到 `client`，不违反互斥规则；改动只涉及 nuxt 包的模块选项与运行时插件。
- **React 的“`intervalMs` 不变就不重建 facade”没有真实渲染的测试。** React 包不带渲染器（ADR-0016），依赖列表被抽成纯函数、按 `Object.is` 逐项断言。
- **`PwaClient` 多了一个必需方法。** 任何手写的 `PwaClient` 实现（包括测试里的假对象）都要补上它；平台内的都已补齐。
- **改变检查对象、把设置放进构建期配置、降低下限、新增事件或状态字段、改变 `updateViaCache`，都需要新的 ADR。**
- 规格见 [spec/client-runtime.md](../../spec/client-runtime.md) 的“修订：主动检查更新”与 [spec/vue-react-adapters.md](../../spec/vue-react-adapters.md) 的同名修订，实现计划见 [tasks/client-runtime/plan.md](../../tasks/client-runtime/plan.md) 的 U1–U6。
