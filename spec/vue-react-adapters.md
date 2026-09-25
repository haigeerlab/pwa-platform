# 规格：vue-react-adapters

## 目标

把 client-runtime 的 facade 包装成 Vue 3 与 React 19 的惯用绑定：应用在框架的生命周期里拿到 PWA 状态与方法，不自己创建 facade、不自己订阅事件、不自己管销毁。

- **状态绑定**：把 facade 的五个生命周期事件映射为一组可观察状态，随框架的响应式系统更新。
- **生命周期归属**：facade 的创建与 `dispose()` 绑定到框架的作用域（React 的 effect 清理、Vue 3.5+ 的应用卸载钩子）。Vue 3.4 没有可用的卸载钩子，见"已知限制"。
- **方法透传**：`register`、`promptInstall`、`applyUpdate`、`logout` 原样转发，不改变语义、不增加重试或轮询。

界面仍归业务应用：适配器只给到"状态与方法"，按钮、弹窗与文案不在本模块（[ADR-0013](../docs/adr/0013-client-facade-and-page-side-lifecycle-events.md)）。

成功标准：两个包在各自框架的惯用写法下暴露同一组状态与方法；同一串事件序列在两侧产出相同的状态序列，由一致性测试钉死。真实浏览器中的安装、离线、更新、登出验证归 `examples-browser-e2e`（[V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)第 10 行把"Vue 与 React 示例"的证据类型定为真实浏览器 E2E，负责模块是它，不是本模块）。

## 范围

**交付物：**

- 私有工作区包 `packages/vue`，包名 `@pwa-platform/vue`（沿用 README 与包边界文档中已写死的名称）：
  - 单一入口 `.`：`createPwa(config)` 返回 Vue 插件供 `app.use()`；`usePwa()` composable 读取状态与方法；注入键与类型。
- 私有工作区包 `packages/react`，包名 `@pwa-platform/react`：
  - 单一入口 `.`：`PwaProvider` 组件；`usePwa()` hook；类型。
- 两侧各自实现的状态机（`store.ts`），互不导入，由一致性测试守护行为相同。**一致性测试落在 `packages/react`**，该包因此把 `@pwa-platform/vue` 列为 devDependency（项目所有者 2026-09-17 决定）。
- 单元测试（Vitest，Node 环境）。**不含浏览器自测**：两个包都不提供 `test:browser` 脚本，`pnpm test:browser` 的 `--recursive` 会跳过没有该脚本的包（仓库现有的 `contracts`、`core`、`build-verifier` 三个包就没有该脚本，而 CI 的 browser job 长期为绿，这一行为已被既有事实证明）。
- `docs/adr/0016-framework-bindings.md`：记录两个包的划分、绑定形态、状态映射、一致性测试的归属，以及 Vue 的支持版本下限与特性检测。
- 同步 `docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- **任何界面**：更新提示的按钮与文案、安装入口的位置、离线提示的样式，全部归业务应用（ADR-0013）。本模块不导出任何组件模板、样式或可视元素——`PwaProvider` 只提供上下文，不渲染任何 DOM。
- **Vite 接入入口**：本模块不转发 `pwa()`，两个框架包都不依赖 `@pwa-platform/vite`。页面配置已由 vite-adapter 的虚拟模块 `virtual:pwa-config` 交付。能力图该行的职责描述已于 2026-09-17 相应修订（见"已决定事项"）。
- **真实浏览器验证**：归 `examples-browser-e2e`。
- 新的生命周期事件或状态：消费 client-runtime 当前的五个事件；`update-applied` 只结束既有的 `updateWaiting`，不增加状态字段（ADR-0026）。
- 自动重试注册、轮询更新、超时后自动刷新页面：facade 没有这些语义，适配器不得凭空添加。
- 修改 client-runtime 或任何上游包的公开契约。
- Vue 2、React 18、SSR 与 `nuxt` / `tanstack-start`（归 `ssr-adapters`）。

## 依赖

- **运行时依赖**：`@pwa-platform/client-runtime`（`workspace:*`），两个包相同。
- **peer 依赖**（项目所有者 2026-09-17 批准新增）：
  - `@pwa-platform/vue` → `vue: ^3.4.0`
  - `@pwa-platform/react` → `react: ^19.2.0`
  - 范围取自 [README](../README.md) 第 9 行与[兼容性策略](../docs/architecture/compatibility.md)的"初始支持范围"。**不声明 `react-dom`**：兼容性矩阵里的 "React / react-dom" 说的是应用侧环境，而本模块只用 `react` 包导出的 `useSyncExternalStore`、`createContext`、`useContext`、`createElement`，渲染器由应用选择。
- **开发依赖**：`vue@3.5.42`、`react@19.3.0`、`@types/react@19.3.0` 钉死具体版本供 typecheck 与单元测试使用；`packages/react` 另加 `@pwa-platform/vue`（`workspace:*`）供一致性测试导入。
  - **`@types/react` 是必需的，不是可选的便利**：react 自身不发布 TypeScript 类型（实测 `react@19.3.0` 的 `types` 与 `typings` 字段均为空、`dependencies` 为空），没有它就无法在本仓的 `strict` + `isolatedDeclarations` 下 `import` react。它只是 devDependency，不随包分发；peer 仍只声明 `react`，"不声明 `react-dom`"不受影响（项目所有者 2026-09-17 批准）。vue 没有这个问题——它自带类型。
  - 三者均已满足供应链闸门（实测发布时间：vue 3.5.42 为 2026-08-27，react 与 `@types/react` 的 19.3.0 均为 2026-09-09，都超过 `minimumReleaseAge: 1440` 的 1 天）。按[依赖变更流程](../docs/operations/dependency-changes.md)，交付 PR 需附 lockfile diff 审阅与冻结安装结果。
- **不新增测试框架依赖**：不引入 `@vue/test-utils` 或 `@testing-library/react`。代价见"已知限制"第一条。

### peer 范围比开发依赖宽，这是有意的

typecheck 与测试跑在 `vue@3.5.42` 上，而 peer 允许 3.4。两者的差异只有一处与本模块相关：`app.onUnmount()` 是 3.5.0 引入的（实测：`@vue/runtime-core@3.4.38` 的 `App` 接口里没有它，3.5.0 的 `App` 接口相对 3.4.38 恰好只多这一个成员）。`Plugin` 类型在两版本中逐字相同，因此插件签名不需要版本分支。处理方式见下文的特性检测。

## 公开契约

下文的类型按本仓规格的惯例裸用，代码块内不写 import：`PwaClientConfig` 与 `PwaClient` 来自 `@pwa-platform/client-runtime`；`Plugin`、`InjectionKey`、`Ref` 来自 `vue`；`ReactElement`、`ReactNode` 来自 `react`。

**`PwaInstallOutcome` 是个例外，它取不到。** 该类型只存在于 client-runtime 的 `facade.d.ts` 内部，其公开入口 `dist/client/index.d.ts` 并未再导出它，而包的 `exports` 只暴露 `.`，深层导入会被 Node 拒绝。因此两侧的 `PwaMethods` 实现为 `Pick<PwaClient, "register" | "promptInstall" | "applyUpdate" | "logout">`：形状与下文写法相同，且四个签名直接取自 facade 类型，不可能与上游分叉——比照下文手写反而更容易漂移。（T1 实施时发现，2026-09-17。）

### 两侧共享的状态形状

```ts
type PwaState = {
  /** `registered` 事件已发出：worker 已在计划的 scope 注册。 */
  readonly registered: boolean;
  /** `install-eligible` 已发出且尚未安装：可以调用 promptInstall()。 */
  readonly installEligible: boolean;
  /** `installed` 事件已发出。 */
  readonly installed: boolean;
  /** `update-waiting` 已发出：有新版本在等待，可以调用 applyUpdate()。 */
  readonly updateWaiting: boolean;
};
```

四个布尔由 client-runtime 的五个事件驱动：`update-waiting` 置位、`update-applied` 复位同一个 `updateWaiting` 字段，其他三个事件各自对应一个字段；不聚合、不派生额外字段。初始值全为 `false`。

### 两侧共享的方法形状

```ts
type PwaMethods = {
  register(): Promise<void>;
  promptInstall(): Promise<PwaInstallOutcome>;
  applyUpdate(): Promise<boolean>;
  logout(): Promise<boolean>;
};
```

五个方法原样转发给 facade，返回值与抛错行为不变。**`subscribe` 与 `dispose` 不出现在公开面**：前者由绑定本身承担，后者归框架作用域。

### Vue：插件 + composable

```ts
export type PwaBinding = PwaMethods & { readonly state: Readonly<Ref<PwaState>> };
export type PwaOptions = {
  readonly config: PwaClientConfig;
  /** 默认由 config 创建 facade；显式传入只为测试与一致性比对注入假实现。 */
  readonly client?: PwaClient;
};
export const PWA_KEY: InjectionKey<PwaBinding>;
export function createPwa(options: PwaOptions): Plugin;
export function usePwa(): PwaBinding;
```

- `app.use(createPwa({ config }))` 时创建 facade、订阅事件并 `provide` 绑定。
- **`client` 是测试注入点**，与 client-runtime 的 `PwaClientOptions.container` / `target` 同一范式（那两个字段的注释写的也是"显式传入只为测试注入"）。没有它，`packages/react` 里的一致性测试就无法给 Vue 侧的绑定喂事件——本仓的一致性测试只走对方的公开面，不深层导入对方的内部模块，见"测试策略"。
- **卸载清理用特性检测**，因为 `app.onUnmount()` 只存在于 Vue 3.5+：

  ```ts
  // Present from Vue 3.5.0. The peer range allows 3.4, where an app has no unmount hook at all.
  if (typeof app.onUnmount === "function") app.onUnmount(() => client.dispose());
  ```

  开发依赖是 3.5.42，所以在类型上 `onUnmount` 是必选成员、这个条件看起来恒真；它的意义只在 3.4 的运行时。仓库未启用 type-aware linting（`eslint.config.js` 只用 `tseslint.configs.recommended`，没有 `parserOptions.project`），因此不会被判为多余条件。3.4 上的后果见"已知限制"。
- `usePwa()` 只做 `inject`，没有副作用，因此不注册 `onScopeDispose`——facade 的生命周期属于应用，不属于调用它的某个组件。
- `usePwa()` 在没有 `provide` 时抛错，不返回一个静默失效的空绑定。
- `state` 是 `Ref`，在模板中直接解包；`Readonly` 阻止应用写回。

### React：Provider + hook

```ts
export type PwaBinding = PwaMethods & { readonly state: PwaState };
export function PwaProvider(props: {
  readonly config: PwaClientConfig;
  /** 与 Vue 侧对称的测试注入点，默认由 config 创建 facade。 */
  readonly client?: PwaClient;
  readonly children?: ReactNode;
}): ReactElement;
export function usePwa(): PwaBinding;
```

- `PwaProvider` 用 `createElement` 构造上下文，**不使用 JSX**：仓库的 `tsconfig.base.json` 没有 `jsx` 选项，为一个不渲染任何元素的 Provider 去改全仓编译配置不划算。
- facade 在 effect 中创建、在 effect 清理中 `dispose()`。React 侧没有 Vue 那样的版本缺口。
- `usePwa()` 内部是 `useSyncExternalStore(store.subscribe, store.getSnapshot)`；`getSnapshot` 在状态未变时返回同一对象引用，否则 React 会判定为无限更新。
- `usePwa()` 在 Provider 之外调用时抛错。

### 状态机（两侧各自实现）

两个包各有一份 `store.ts`，形状相同、互不导入：订阅 facade 事件 → 按事件类型翻转对应布尔 → 通知订阅者。翻转规则：

| 事件 | 效果 |
|---|---|
| `registered` | `registered = true` |
| `install-eligible` | `installEligible = true` |
| `installed` | `installed = true`，`installEligible = false` |
| `update-waiting` | `updateWaiting = true` |
| `update-applied` | `updateWaiting = false` |

`installed` 同时清掉 `installEligible`，因为安装提示已被消费（facade 在 `appinstalled` 时清除保存的提示，`promptInstall()` 此后返回 `"unavailable"`）。`update-applied` 清掉 `updateWaiting`，因为该页面已观察到接管，提示不再可操作；它不表示页面已刷新。除此之外，适配器不凭空复位。`logout()` 之后 `registered` 停在 `true`，见"已知限制"。

## 命令

```bash
pnpm --filter @pwa-platform/vue build
pnpm --filter @pwa-platform/vue test
pnpm --filter @pwa-platform/vue typecheck

pnpm test --filter @pwa-platform/react
pnpm --filter @pwa-platform/react build
pnpm --filter @pwa-platform/react typecheck
```

**react 的测试务必用 `pnpm test --filter`，不要用 `pnpm --filter … test`。** 前者走 `scripts/run-workspace.mjs`，它会先构建依赖；后者直接调包内脚本、跳过构建。而一致性测试读的是 `@pwa-platform/vue` 的 **`dist`**，跳过构建就会在改过 Vue 源码之后读到过期产物、全绿通过——这正是 [ADR-0016](../docs/adr/0016-framework-bindings.md) 记录的那个陷阱，已由对照实验复现（不重建 50 passed，重建后 3 failed）。

两个包都必须有 `build` 脚本：`scripts/run-workspace.mjs` 在任何操作前先 `--recursive run build`。

## 测试策略

- **Vue 绑定（纯 Node，无 DOM）**：插件的 `install(app)` 只需要一个假的 `App` 对象（实现 `provide`，按用例决定要不要 `onUnmount`），不必挂载真实组件，因此不需要 `@vue/test-utils`。三条用例：
  - 带 `onUnmount` 的假 `App`：断言 `provide` 收到绑定、facade 订阅已建立；触发记录下来的 `onUnmount` 回调，断言 `dispose()` 被调用。
  - **不带 `onUnmount` 的假 `App`（模拟 Vue 3.4）**：断言 `install` 不抛错、绑定照常可用、且没有调用 `dispose()`。这条覆盖特性检测的另一个分支——少了它，检测写错方向也没人发现。
  - `usePwa()` 在没有 `provide` 时抛错。
- **React store（纯 Node）**：直接驱动 store，覆盖订阅、状态翻转、快照引用稳定性（状态未变时 `getSnapshot()` 返回同一引用）、取消订阅后不再收到通知。
- **一致性测试（在 `packages/react` 内）**：同一串事件序列分别喂给两侧，断言状态快照序列逐项相等。序列至少覆盖：首次注册、安装可用后安装、更新等待、更新完成、事件重复到达、乱序到达。该测试是本模块"各自实现"决定的唯一守护，缺了它两份实现就会无声分叉。
  - **驱动方式遵循本仓既有范式**：跨包只走公开面，本包走相对路径。React 侧 `import { ... } from "../src/store.js"`；Vue 侧经 `@pwa-platform/vue` 的公开入口——用假 `App` 调 `createPwa({ config, client }).install(app)`，从 `provide` 拿到绑定后读 `state.value`。两侧共用同一个假 `PwaClient` 发事件。这与 build-verifier 比对 `Cache-Control`（"parity is measured on observable behaviour"，因为 harness 只公开断言函数而不公开解析器）、sw-runtime 比对路径匹配、vite 比对产物采集是同一套安排。
  - **不深层导入对方的 `store.ts`**：两个包的 `exports` 都只声明 `.`，`@pwa-platform/vue/dist/store.js` 会被 Node 的 exports 字段拒绝；为测试开一个内部入口则等于把 store 抬进公开面。注入点方案不动公开概念，只多一个可选字段。
- **方法透传**：用假的 `PwaClient` 断言五个方法的调用与返回值原样转发，抛错原样冒泡；断言适配器没有额外调用 facade（不自行 `register`、不轮询）。
- **越界断言**：公开面只有上文列出的导出，不再导出 client-runtime 的任何类型或函数。
- **依赖边界**：沿用 client-runtime 的导入闭包检查——两个包的生产闭包里只允许 `@pwa-platform/client-runtime` 与各自的框架包，不得出现 `node:` 内建、不得出现 `@pwa-platform/vite`，不得动态加载模块；**`packages/react` 的生产闭包尤其不得出现 `@pwa-platform/vue`**（它只是一致性测试的 devDependency，漏进生产闭包会让 React 应用拖上 Vue）。同时扫描源码确认不出现 `caches`、页面重载与导航调用（与 ADR-0013 同一组守护）。
- **变异检查**：逐个破坏状态翻转规则、快照引用稳定性、特性检测的条件与抛错分支，确认对应测试失败，恢复后源码逐字节一致。

## 边界

- **始终**：facade 由绑定创建并由框架作用域销毁；状态只由事件驱动；方法原样转发；两侧状态形状保持一致并由一致性测试钉死。
- **先询问**：新增任何第三方依赖（含测试框架）；扩大事件集合或状态字段；让适配器自动调用 `register()`；提供任何可视组件；依赖 `@pwa-platform/vite`；改变 Vue 或 React 的 peer 版本下限。
- **禁止**：重新实现 facade 的任何判断；在适配器里重试、轮询或超时后刷新页面；把 `subscribe` / `dispose` 暴露给应用；根据 User-Agent 分支；使用 `App` 接口上以下划线开头的内部字段来绕过卸载钩子的缺失；两个 store 互相导入以"避免重复"。

## 验收标准

1. `@pwa-platform/vue` 与 `@pwa-platform/react` 各提供上文的单一入口，依赖边界由测试守护。
2. 两侧状态形状与翻转规则一致，由 `packages/react` 中的一致性测试在同一事件序列上钉死。
3. 五个方法原样转发，适配器不产生额外的 facade 调用。
4. 框架作用域结束时 facade 被 `dispose()`。Vue 侧在 `app.onUnmount` 可用时实测 `dispose()` 被调用，不可用时实测 `install` 不抛错且绑定照常可用——特性检测的两个分支各有一条测试。**React 侧实测的是 `bindFacade()`**：Provider 的 effect 体被抽成这个纯函数，其 create → attach → detach → dispose 周期连同"teardown 后状态复位"一并单测。组件里那一行 `useEffect` 调用本身、以及它的依赖数组，没有渲染器可测，与 hook 同属已知缺口，由 `examples-browser-e2e` 覆盖。
5. 单元测试与变异检查覆盖以上行为；两个包都不引入测试框架依赖。
6. ADR-0016 记录本模块的决定；能力图、包边界、README 与文档基线已同步。

## 已决定事项（项目所有者，2026-09-17）

- **新增 `vue` 与 `react` 作为 peer 依赖**。这是本模块的硬前置，两者都不在 lockfile 中。
- **两个独立包，不是一个包两个子路径入口**。README 第 63–64 行与包边界文档第 8–9 行已写死这两个包名；更要紧的是 peer 依赖不互相污染——只用 React 的应用不应被要求装 Vue。
- **共享逻辑各自实现，由一致性测试守护**，不建第三个内部包、不塞进 client-runtime。绑定本身很薄，两份各几十行；本仓已有先例（build-verifier 自带 `Cache-Control` 解析，与 harness 的那份由一致性测试守护）。塞进 client-runtime 则要改已交付包的公开契约，而 ADR-0013 明确把框架绑定划归本模块。
- **各按框架惯例，不强求 API 对称**。Vue 用插件 + composable，React 用 Provider + hook；状态容器一边是 `Ref`、一边是快照值。强行统一会让两边都不像本框架的代码。
- **只做单元测试，真实浏览器留给 `examples-browser-e2e`**。能力图与 V1 验收矩阵都把"Vue/React 示例与真实浏览器验证矩阵"记在那个模块名下，本模块自建一套会把它的活提前做一半。
- **本模块不提供 Vite 接入入口，能力图相应修订**。该行职责由"薄 facade、状态绑定和 Vite 接入入口"改为"薄 facade 与状态绑定"。两条理由：[包边界](../docs/architecture/package-boundaries.md)明确 vite-adapter 是"唯一被应用直接引入的内部包"，其公开面测试存在的目的就是防止它退化成再导出层，框架包转发 `pwa()` 会在另一处重建这个层；更实际的是框架包会随应用打进浏览器 bundle，而 `pwa()` 是 Node 构建期代码。**该修订改变了 `vue-react-adapters` 的 rowDigest（`5496c3f3a7a1` → `2517367fe6f9`）；issue #8 的正文尚未刷新，state.json 中的旧指纹有意保留，待 tracker 可用时经 `/sync-map` 刷新后再写回。**
- **`logout()` 之后状态保持现状，写进文档**。不由适配器自行复位——那是在编造 facade 没有的语义；也不为此给 client-runtime 增加 `unregistered` 事件——那要改已交付包的公开契约。见"已知限制"。
- **一致性测试放在 `packages/react`**，该包把 `@pwa-platform/vue` 列为 devDependency。另一条路（两包各存一份相同的事件序列 fixture）会让复制分叉，本仓一贯反对。
- **Vue 的 peer 下限保持 `^3.4.0`，用特性检测处理卸载钩子**。不抬到 `^3.5.0`，因此 README、能力图、`compatibility.md`、`contracts-foundation` 规格与路线图五处"Vue 3.4+"一字不改，能力图的 `goalDigest` 也不受影响。代价是同一个包在 3.4 与 3.5+ 上清理行为不同，如实记入"已知限制"。

## 已知限制

- **React 的 hook 本身没有单元测试覆盖**。`useSyncExternalStore` 必须在渲染中调用，而本模块不引入渲染器（`react-dom`）或 `@testing-library/react`。缓解办法是把全部逻辑放进纯 TS 的 store——store 被完整覆盖，hook 只剩一行 `useSyncExternalStore(store.subscribe, store.getSnapshot)`，其正确性由 `examples-browser-e2e` 在真实浏览器中覆盖。**这是"只做单元测试"这一决定的直接代价，如实记录而不是假装已覆盖。**
- **Vue 3.4 上 facade 不会被自动 `dispose()`**。`app.onUnmount()` 是 3.5.0 引入的，而 3.4 的 `App` 接口没有任何卸载回调注册点（实测其公开成员为 `version`、`config`、`use`、`mixin`、`component`、`directive`、`mount`、`unmount`、`provide`、`runWithContext`，其余为下划线开头的内部字段，不可依赖）。`app.unmount()` 之后仍留着的是 facade 注册的监听：`installEnabled` 时 `window` 上的 `beforeinstallprompt` 与 `appinstalled`、registration 的 `updatefound`、安装中 worker 的 `statechange`，以及 `applyUpdate()` 在飞行时的 `controllerchange` 监听与超时定时器。**实际影响的边界要说清楚**：典型 SPA 中 `app.unmount()` 发生在整页销毁前，这些监听随页面一同消失；真正会累积的是同一页面内反复创建与销毁应用实例的场景（组件测试、微前端宿主、水合失败后重建）。3.5+ 上不存在此问题。
- **`compatibility.md` 对"支持"的定义与上一条存在张力**。该文档称"支持"表示该范围具备 peer dependency 校验、构建 fixture 和浏览器行为测试；而本模块在 3.4 上有上述清理缺口。项目所有者 2026-09-17 选择保持 3.4 并不改文档，此张力记录在此，供首次发布前的兼容性复审决定是否加一行脚注。本期不改该文档。
- **`logout()` 之后 `registered` 仍为 `true`**。facade 的 `logout()` 只返回布尔、不发事件，适配器无从得知注册已消失，因此状态不回落。应用若要在界面上反映登出，需自行根据 `logout()` 的返回值处理。同理，`registered`、`installEligible`（除被 `installed` 清掉外）一旦置位都不再变回 `false`；`updateWaiting` 则在页面观察到实际接管时由 `update-applied` 清掉。
- **React 侧：Provider 永久卸载后发出的方法调用永远不会结束**（2026-09-17 补记，随 `7a4fe20` 引入）。方法在 facade 尚未 attach 时等待下一次 attach，这是为了让 Provider 内子组件在挂载 effect 中调用成立（React 的 effect 子先父后）；代价是 Provider 卸载之后若再无 attach，调用返回的 promise 既不 resolve 也不 reject。典型用法下发起调用的组件随 Provider 一同卸载，不会留下未处理的拒绝；但持有绑定引用、在卸载后才发起调用的异步流程会一直挂起。Vue 侧不受影响：facade 在插件安装时即创建。由 `examples-browser-e2e` 的 T9 独立评审指出。
- **SSR 未覆盖**：`useSyncExternalStore` 的 `getServerSnapshot` 参数不传，Vue 侧也不处理服务端渲染。SSR 归 `ssr-adapters`。（2026-09-17 起已由 ssr-adapters 补上服务端语义，见 [ADR-0016](../docs/adr/0016-framework-bindings.md) 增补。）

## 开放问题

本期无。上一版的三条（Vite 接入入口的归属、`logout()` 后的状态回落、一致性测试的位置）与 Vue 的支持版本下限，均已由项目所有者于 2026-09-17 裁决，记入"已决定事项"。

## 修订：主动检查更新（2026-09-18，已评审通过）

绑定层随 client-runtime 同批修订：`PwaMethods` 加入 `checkForUpdate`，Vue 的 `createPwa` 与 React 的 `PwaProvider` 增加 `updateCheck` 选项，服务端渲染时该方法同样拒绝，`client` 与 `updateCheck` 同时传入时抛错。完整契约、测试与验收标准见 [client-runtime 规格的同名修订](client-runtime.md#修订主动检查更新2026-09-18已评审通过)。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。
