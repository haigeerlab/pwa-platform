# ADR-0016：框架绑定的划分与形态

## 状态

已接受（2026-09-17）。落实 [ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 中"框架绑定归 vue-react-adapters"的划界，消费 [ADR-0015](0015-vite-plugin-build-pipeline.md) 交付的页面配置。

2026-09-17 增补服务端渲染语义（见决策末条），由 [ssr-adapters](../../spec/ssr-adapters.md) 提出、项目所有者批准。

2026-09-18 后续修订：两个绑定同批暴露 `checkForUpdate` 与 `updateCheck` 选项，服务端渲染时拒绝的方法由四个变为五个，见 [ADR-0020](0020-client-update-check.md)。

2026-09-20 后续修订：两个状态机消费 `update-applied`，在页面实际接管后清除过期的更新提示，见 [ADR-0026](0026-update-applied-page-lifecycle-event.md)。

## 背景

[ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 定下了 facade 的形态、页面侧生命周期事件与登出语义，并明确把"按钮、弹窗与文案"留给业务应用与框架适配器，但没有规定框架绑定本身长什么样：一个包还是两个、Vue 与 React 是否要对称、共享逻辑放在哪、两侧行为怎么保证一致。

能力图原先还把"Vite 接入入口"记在本模块名下。而页面配置的交付在 [ADR-0015](0015-vite-plugin-build-pipeline.md) 中已由虚拟模块 `virtual:pwa-config` 承担，那一项因此成了重复职责。

本模块也是全平台**第一次引入第三方运行时依赖**：此前所有包的运行时依赖都是工作区内部包或 Node 内建。

## 决策

- **两个独立包，不是一个包两个子路径入口。** `@pwa-platform/vue` 与 `@pwa-platform/react` 各自交付。README 与[包边界](../architecture/package-boundaries.md)早已写死这两个名字，但更要紧的理由是 peer 依赖不互相污染：只用 React 的应用不应被要求安装 Vue。

- **本模块不提供 Vite 接入入口，能力图相应修订。** 该行职责由"薄 facade、状态绑定和 Vite 接入入口"改为"薄 facade 与状态绑定"。两条理由：vite-adapter 的公开面测试存在的目的就是防止它退化成再导出层，框架包转发 `pwa()` 会在另一处重建这个层；而框架包会随应用打进浏览器 bundle，`pwa()` 却是 Node 构建期代码。两个框架包都不依赖 `@pwa-platform/vite`，由包边界测试钉死。

- **各按框架惯例，不强求 API 对称。** Vue 用插件 + composable（`app.use(createPwa({ config }))` 后 `usePwa()`），React 用 Provider + hook。状态容器一边是 `Ref`、一边是快照值。强行统一会让两边都不像本框架的代码。两侧暴露的**状态与方法集合相同**：四个布尔（`registered`、`installEligible`、`installed`、`updateWaiting`）与 facade 的五个方法（含 `checkForUpdate`）；`subscribe` 与 `dispose` 不在公开面——前者由绑定本身承担，后者归框架作用域。

- **状态机在两个包中各实现一份，由一致性测试守护。** 不建第三个内部包，也不塞进 client-runtime（那要改已交付包的公开契约，而 ADR-0013 明确把框架绑定划归本模块）。绑定本身很薄，两份各几十行。本仓已有先例：build-verifier 自带第二份 `Cache-Control` 解析，与 harness 的那份由一致性测试守护。翻转规则：

  | 事件 | 效果 |
  |---|---|
  | `registered` | `registered = true` |
  | `install-eligible` | `installEligible = true` |
  | `installed` | `installed = true`，`installEligible = false` |
  | `update-waiting` | `updateWaiting = true` |
  | `update-applied` | `updateWaiting = false` |

  `installed` 清掉 `installEligible`，因为 facade 在 `appinstalled` 时丢弃保存的安装提示；`update-applied` 清掉 `updateWaiting`，因为已提示页面观察到接管后该提示不再可操作。其余状态没有凭空复位路径。`logout()` 是可见的后果——它只返回布尔、不发事件，因此 `registered` 停在 `true`。

- **一致性测试落在 `packages/react`，只走对方的公开面。** React 侧走本包相对路径，Vue 侧经 `createPwa` 装进一个假 app 后读回绑定，两侧共用同一个假 `PwaClient` 发事件，**逐个事件比对快照序列**而非只比末态。**它守护的范围仅限状态序列**：快照的引用稳定性、方法转发、生命周期清理各由所属包自己的测试守护——独立评审实测确认，破坏 Vue 侧的引用稳定性或把 `logout()` 错转成 `register()`，一致性套件均照常全绿而各自包的测试报红。把它说成"钉住行为相同"会让后来者高估覆盖面。这与 build-verifier 比对 `Cache-Control`、sw-runtime 比对路径匹配、vite 比对产物采集是同一套安排：两份实现只在有东西钉住它们时才可接受。**跨包导入解析到 `dist` 而非源码**，因此改动 Vue 侧后必须重新 build 才能信任该测试——已用一次对照实验证实：同一变异不重建时 50 passed（假绿），重建后 3 failed。

- **公开面各多一个可选 `client` 注入点。** 与 client-runtime 的 `PwaClientOptions.container` / `target` 同一范式。这不是为了灵活性，而是一致性测试的前置条件：`createPwa(config)` 若在内部自建 facade，测试就无从给绑定喂事件，而本仓的一致性测试从不深层导入对方的内部模块。

- **Vue 的 peer 下限保持 `^3.4.0`，卸载清理用特性检测。** `app.onUnmount()` 是 Vue 3.5.0 引入的（实测：`@vue/runtime-core@3.4.38` 的 `App` 接口公开成员中没有任何卸载回调注册点，3.5.0 相对它恰好只多这一个成员；CHANGELOG 记在 3.5.0 的聚合特性列表 #4619），而 `Plugin` 类型在两版本中逐字相同，因此插件签名不需要版本分支。插件检测该成员是否存在：3.5+ 在应用卸载时 `dispose()` facade，3.4 不清理。代价记入"影响"。不抬高下限，因此 README、能力图、[兼容性策略](../architecture/compatibility.md)、contracts-foundation 规格与路线图五处"Vue 3.4+"一字未改。

- **`@types/react` 是必需的开发依赖。** react 自身不发布 TypeScript 类型（实测 `react@19.3.0` 的 `types` 与 `typings` 字段均为空），没有它就无法在本仓的 `strict` + `isolatedDeclarations` 下 `import` react。它不随包分发，peer 仍只声明 `react`。vue 没有这个问题——自带类型。

- **React 侧把全部逻辑压进纯 TypeScript 的 store，facade 在 effect 中 attach。** `useSyncExternalStore` 只能在渲染中运行，而本模块不引入渲染器，留在组件里的逻辑就没有任何单元测试。store 因此承载状态、订阅与五个方法，Provider 只有五行、hook 只有两行。facade 在 effect 内创建而非渲染期：React 的 StrictMode 故意 mount → unmount → mount，渲染期创建的 facade 会被第一次清理 dispose 掉、第二次挂载复用成死对象。

- **只做单元测试，真实浏览器验证归 `examples-browser-e2e`。** 能力图与 [V1 验收矩阵](../architecture/v1-acceptance-matrix.md)都把"Vue/React 示例与真实浏览器验证矩阵"记在那个模块名下。两个包都不提供 `test:browser` 脚本。

- **服务端渲染期间，两个绑定都报告初始状态，五个方法一律拒绝**（2026-09-17 增补）。服务端没有 service worker、安装提示与 facade，绑定不应假装有。
  - **React**：`usePwa()` 调用 `useSyncExternalStore` 时传入 `getServerSnapshot`，恒返回初始状态。这是 React 在服务端与水合期间读取的快照；缺了它，服务端渲染直接抛错。Provider 的 effect 在服务端本就不执行，因此不会创建 facade。无 `window` 时 hook 交出的是一组立即拒绝的方法；store 自己的方法不变，仍然等待 facade。
  - **Vue**：插件在无 `window` 且未注入 `client` 时不创建 facade（创建会访问 `navigator.serviceWorker` 并抛错），提供初始状态与同一组立即拒绝的方法，也不注册卸载回调。注入的 `client` 只用于测试替身，因此在 Node 中注入时仍走浏览器路径，现有单元测试不受影响。
  - **拒绝而不是挂起，也不是静默成功。** 让方法等待一个永远不会出现的 facade，调用就永远不结束；静默成功会让应用误以为已经注册。两侧的错误信息逐字相同。
  - **服务端路径的证据放在 `examples-browser-e2e`。** 该包已依赖 `react-dom`，而本 ADR 前文让 React 包不带任何渲染器，其包边界测试也钉住了这一点。那里用 `react-dom/server` 与 `vue/server-renderer` 做真实渲染，并比对两侧的初始状态与拒绝信息。两个绑定包各自另有不需要渲染器的单元测试。

## 影响

- **Vue 3.4 上 facade 不会被自动 `dispose()`。** `app.unmount()` 之后仍留着 facade 注册的监听：`installEnabled` 时 `window` 上的 `beforeinstallprompt` 与 `appinstalled`、registration 的 `updatefound`、安装中 worker 的 `statechange`，以及 `applyUpdate()` 在飞行时的 `controllerchange` 监听与超时定时器。典型 SPA 中 `app.unmount()` 发生在整页销毁前，这些监听随页面一同消失；真正会累积的是同一页面内反复创建与销毁应用实例的场景——组件测试、微前端宿主、水合失败后重建。3.5+ 不存在此问题。
- **上一条与[兼容性策略](../architecture/compatibility.md)对"支持"的定义存在张力。** 该文档称"支持"表示该范围具备 peer dependency 校验、构建 fixture 和浏览器行为测试。本 ADR 不修改该文档；张力留给首次生产发布前的兼容性复审决定是否加脚注。
- **React 的 hook 本身没有单元测试覆盖**，`usePwa()` 在 Provider 之外抛错这条验收标准同样无法单测——`useContext` 在渲染之外调用会先被 React 的 dispatcher 拦下。逻辑已全部压进 store（完整覆盖），hook 只剩一行，其正确性由 `examples-browser-e2e` 在真实浏览器中覆盖。
- **维护一致性测试有一条硬约束**：改动 Vue 侧后必须 `pnpm --filter @pwa-platform/vue build`，否则该测试读到过期 `dist` 而假绿。
- `examples-browser-e2e` 在这两个包之上构建示例与验证矩阵；登出场景按 ADR-0013 的语义判定。
- ~~`ssr-adapters` 若要复用这两个绑定，需另行处理服务端渲染：本期两侧都不实现 SSR，`useSyncExternalStore` 的 `getServerSnapshot` 参数不传。~~ 已由 2026-09-17 增补处理（见决策末条）。
- **服务端路径的一致性测试同样读取 `dist`**：改动任一绑定后，须先重新 build，再信任 `examples-browser-e2e` 的服务端渲染测试。已用变异实测：两侧错误信息不一致时，只有一致性用例转红。
- **`client` 注入点有了第一个生产用途**（2026-09-17）：`@pwa-platform/nuxt` 在运行时挂载路径与身份不一致时，把 facade 包装成 `register()` 立即拒绝、其余方法照常转发的对象，再交给 `createPwa`。注入点原本只是一致性测试的前置条件，公开面没有变化，但它已不再"只用于测试"，改动其语义需要同时考虑 Nuxt 模块。
- **服务端判定依赖 `typeof window === "undefined"`。** 服务端运行时若自行定义了全局 `window`，绑定会走浏览器路径，并在创建 facade 时抛出明确错误。本增补不为这种环境做特判。
- **改变状态集合、翻转规则或绑定形态会同时影响两个包与 `examples-browser-e2e`**，需要新的 ADR。给 client-runtime 增加 `unregistered` 事件以便 `logout()` 后状态回落，同样需要新的 ADR——那是改已交付包的公开契约。
- 规格见 [spec/vue-react-adapters.md](../../spec/vue-react-adapters.md)，依赖边界见[包边界](../architecture/package-boundaries.md)。
