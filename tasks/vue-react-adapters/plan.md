# 实现计划：vue-react-adapters

## 概览

按 [spec/vue-react-adapters.md](../../spec/vue-react-adapters.md) 交付两个私有包 `@pwa-platform/vue` 与 `@pwa-platform/react`：把 client-runtime 的 facade 包装成两个框架各自惯用的绑定。

本模块是全平台**第一次引入第三方运行时依赖**（此前所有包的运行时依赖都是工作区内部包或 Node 内建）。风险因此不在算法——两个绑定各几十行、没有一处判断是新的——而在三处**边界**：

1. **两份实现会不会分叉**。项目所有者选定"各自实现 + 一致性测试"，那份测试就是唯一的守护；它写不出来或写得空洞，这个决定当场失效。
2. **peer 范围比开发依赖宽**。typecheck 跑在 `vue@3.5.42` 上，而 peer 允许 3.4，两者差一个 `app.onUnmount()`。特性检测的**两个分支都要有测试**，否则检测写反方向也没人发现。
3. **react 包为一致性测试引入 `@pwa-platform/vue` 作 devDependency**。它绝不能漏进生产闭包——否则只用 React 的应用会被拖上 Vue，而这正是"两个独立包"这个决定要避免的事。

任务据此拆分，按包垂直切：每个任务结束时，对应的包是完整可用的，而不是"所有包的骨架都建好了但没一个能跑"。

## 架构决定

- **不重新实现 facade 的任何判断**。适配器只做三件事：订阅事件、把事件翻成布尔、把方法转发回去。状态翻转规则见规格，除 `installed` 清掉 `installEligible` 外一律只置位不复位——facade 不发"取消"类事件，凭空复位就是在编造它没有的语义。
- **两侧各有一份 `store.ts`，互不导入**。这是项目所有者的决定，代价由 T3 的一致性测试承担。
- **公开面各多一个可选 `client` 注入点**，与 client-runtime 的 `PwaClientOptions.container` / `target` 同一范式。这不是为了灵活性，是 T3 的**前置条件**：本仓的一致性测试只走对方的公开面，而 `createPwa(config)` 内部自建 facade 时测试无从喂事件。
- **Vue 的卸载清理用特性检测**，peer 保持 `^3.4.0`（项目所有者 2026-09-17 决定，五处"Vue 3.4+"文档一字不改）。
- **两个包都不提供 `test:browser`**。真实浏览器验证归 `examples-browser-e2e`；`pnpm test:browser` 的 `--recursive` 会跳过没有该脚本的包。

### 已实测确认的前提

这些事实在写规格时实测过，任务的验收标准直接依赖它们：

- **`app.onUnmount()` 是 Vue 3.5.0 引入的**。`@vue/runtime-core@3.4.38` 的 `App` 接口公开成员为 `version`、`config`、`use`、`mixin`、`component`、`directive`、`mount`、`unmount`、`provide`、`runWithContext`，**没有任何卸载回调注册点**；3.5.0 的 `App` 相对它恰好只多 `onUnmount(cb: () => void): void` 一个成员。CHANGELOG 将其记在 3.5.0 的聚合特性列表（#4619）。
- **`Plugin` 类型在 3.4.38 与 3.5.0 中逐字相同**（`FunctionPlugin | ObjectPlugin`），因此插件签名不需要版本分支。
- **`vue@3.5.42`（2026-08-27）与 `react@19.3.0`（2026-09-09）都已过供应链闸门**（`minimumReleaseAge: 1440`）。
- **仓库未启用 type-aware linting**（`eslint.config.js` 只用 `tseslint.configs.recommended`，无 `parserOptions.project`），因此 `typeof app.onUnmount === "function"` 不会被 `no-unnecessary-condition` 判为多余条件——尽管在 3.5.42 的类型下它看起来恒真。
- **`--recursive run <script>` 跳过没有该脚本的包**：仓库现有的 `contracts`、`core`、`build-verifier` 都没有 `test:browser`，而 CI 的 browser job 长期为绿。

## 任务定义

### 任务 1：`@pwa-platform/vue` 完整交付

**说明：** 建立 `packages/vue`，实现 store、插件与 composable，连同该包的全部单元测试与依赖边界测试。

**验收标准：**

- `package.json`：包名 `@pwa-platform/vue`，私有，`type: module`，单一导出 `.`，`files` 只含 `dist`；运行时依赖只有 `@pwa-platform/client-runtime`（`workspace:*`）；`vue: ^3.4.0` 为 peer；devDependency 钉 `vue@3.5.42`。四个脚本齐备（`build`、`test`、`typecheck`，**不含 `test:browser`**）。
- `store.ts` 按规格的翻转表实现，初始值四个布尔全为 `false`，`installed` 同时清掉 `installEligible`。
- `createPwa(options)` 返回 Vue `Plugin`：`install(app)` 时创建（或取用注入的）facade、订阅事件、`provide(PWA_KEY, binding)`。
- **卸载清理用特性检测**：`if (typeof app.onUnmount === "function") app.onUnmount(() => client.dispose())`，注释说明 3.4 上该成员不存在。
- `usePwa()` 只做 `inject`，无副作用、不注册 `onScopeDispose`；缺少 `provide` 时抛错。
- `state` 是 `Readonly<Ref<PwaState>>`，应用写不回去。
- `isolatedDeclarations` 要求每个导出显式标注类型，`PWA_KEY` 写成 `export const PWA_KEY: InjectionKey<PwaBinding> = Symbol(...)`。
- 依赖边界测试（照 client-runtime 的导入闭包写法）：生产闭包只允许 `@pwa-platform/client-runtime` 与 `vue`；不得出现 `node:` 内建、不得出现 `@pwa-platform/vite`、不得动态加载模块；源码扫描不得出现 `caches`、页面重载与导航调用。每条检查配自证伪探针。

**验证：**

- `pnpm --filter @pwa-platform/vue test`、`typecheck`、`build` 通过。
- 三条卸载相关用例：① 带 `onUnmount` 的假 `App` → 触发回调后 `dispose()` 被调用；② **不带 `onUnmount` 的假 `App`（模拟 Vue 3.4）→ `install` 不抛错、绑定照常可用、未调 `dispose()`**；③ `usePwa()` 无 `provide` 时抛错。
- 变异检查：删掉特性检测的 `typeof` 判断（用例 ② 应报错）；把 `installed` 的清除改成不清；让 `usePwa()` 在缺 `provide` 时返回空对象；`state` 去掉 `Readonly`。

**依赖：** 无。

**预计范围：** L（包配置、store、插件、composable、边界测试）。

#### T1 实施记录（2026-09-17）

**规格更正：`PwaInstallOutcome` 取不到。** 按规格字面写 `PwaMethods` 时发现，该类型只存在于 client-runtime 的 `facade.d.ts` 内部，其公开入口 `dist/client/index.d.ts` 并未再导出它，而包的 `exports` 只暴露 `.`，深层导入会被 Node 拒绝。改用 `Pick<PwaClient, "register" | "promptInstall" | "applyUpdate" | "logout">`：形状与规格所述相同，且四个签名直接取自 facade 类型，比照着手写更不可能与上游漂移。规格"公开契约"一节已相应更正。

**变异检查结果。** 每项均自证——锚点唯一命中、文件 md5 确已改变、还原后逐字节一致；四项跑完基线复跑 35 passed：

| 变异 | 结果 |
|---|---|
| 删掉 `typeof app.onUnmount === "function"` | **杀死**（1 failed）。Vue 3.4 那条用例确有证伪力，不是摆设 |
| `installed` 不再清 `installEligible` | **杀死**（4 failed，store 与 binding 两个文件都抓到） |
| `usePwa()` 缺 provide 时返回 `{}` 而非抛错 | **杀死**（1 failed） |
| `PwaBinding.state` 去掉 `Readonly` | **存活——实证等价变异**（35 passed） |

最后一项如实记录，不补测试去假装杀死它：`Readonly<Ref<T>>` 是纯类型层面的约束，运行时 `.value` 依然可写，任何运行时断言都区分不出两者。要在运行时真正挡住写入，须改用 Vue 的 `readonly()` 包一层代理——那是另一个设计决定（多一层代理开销，且 `state.value` 的读取路径随之改变），不在本规格的承诺内。T2 的 React 侧没有对应项：那里的快照是普通对象，引用稳定性才是要守的性质。

### 任务 2：`@pwa-platform/react` 完整交付

**说明：** 建立 `packages/react`，实现 store、Provider 与 hook，连同该包的单元测试与依赖边界测试。**本任务不含一致性测试**（见 T3）。

**验收标准：**

- `package.json`：包名 `@pwa-platform/react`，私有，单一导出 `.`；运行时依赖只有 `@pwa-platform/client-runtime`；`react: ^19.2.0` 为 peer，**不声明 `react-dom`**；devDependency 钉 `react@19.3.0`。脚本同 T1。
- `store.ts` 与 Vue 侧同一张翻转表，但**独立实现**，不导入对方。
- `getSnapshot()` 在状态未变时返回**同一对象引用**——否则 `useSyncExternalStore` 会判定为无限更新。
- `PwaProvider` 用 `createElement` 构造上下文，**不使用 JSX**（`tsconfig.base.json` 没有 `jsx` 选项）；facade 在 effect 中创建、在 effect 清理中 `dispose()`。
- `usePwa()` 是 `useSyncExternalStore(store.subscribe, store.getSnapshot)` 的一行包装；在 Provider 之外调用时抛错。
- 依赖边界测试同 T1，另加一条：生产闭包**不得出现 `@pwa-platform/vue`**（T3 会把它加进 devDependency，这条守卫必须先于它存在）。

**验证：**

- `pnpm --filter @pwa-platform/react test`、`typecheck`、`build` 通过。
- 单元测试：订阅与取消订阅、四个事件的状态翻转、快照引用稳定性、方法透传（含抛错原样冒泡）、适配器不额外调用 facade。
- 变异检查：`getSnapshot()` 每次返回新对象（引用稳定性用例应报错）；翻转表改一条；取消订阅后仍通知。

**依赖：** 无（与 T1 可并行，但 T3 要等两者都完成）。

**预计范围：** L（包配置、store、Provider、hook、边界测试）。

#### T2 实施记录（2026-09-17）

**新增依赖 `@types/react@19.3.0`（项目所有者批准）。** react 自身不发布 TypeScript 类型（实测 `react@19.3.0` 的 `types` 与 `typings` 字段均为空），本仓的 `strict` + `isolatedDeclarations` 下没有它就无法 `import` react。它只是 devDependency，不随包分发，peer 仍只声明 `react`。vue 没有这个问题——自带类型，所以 T1 一路顺畅。规格"依赖"一节已相应更新。

**逻辑全部下沉到 `store.ts`，Provider 与 hook 只剩几行。** 规格写"facade 在 effect 中创建、在 effect 清理中 `dispose()`"，照字面实现会撞上两件事：① React 的 StrictMode 故意 mount → unmount → mount，渲染期创建的 facade 会被第一次清理 dispose 掉、第二次挂载复用成死对象；② 方法若挂在组件内部，没有渲染器就**测不到方法透传**，而本任务的验收标准明确要求测它。因此 store 提供 `attach(client)` / `detach()`，由 Provider 的 effect 调用——store 是纯 TS，状态、订阅与四个方法全部可测；Provider 五行、hook 两行。这不是偏离规格，而是"把全部逻辑放进纯 TS store"这句话的落实方式。

**四个方法改为 `async`，是测试抓出来的。** 初版写 `register: () => bound().register()`，未挂载时 `bound()` 同步抛错，于是 `rejects.toThrow()` 用例失败。对照 facade 后确认是实现错而非测试写法错：facade 自己返回 rejected promise（它的存活检查跑在 async 方法体内），而 `PwaMethods` 的签名写着 `Promise<...>`；同步抛错会让调用方对这一种失败用 `try/catch`、对其他所有失败用 `.catch()`。Vue 侧不需要同样处理——它在 `install` 时同步创建 facade，没有"未挂载"这条路径。这是两侧的真实差异，不影响 T3（一致性测试比的是状态序列）。

**一条验收标准无法单测，如实记录。** "`usePwa()` 在 Provider 之外抛错"写不出单元测试：`useContext` 在渲染之外调用会先被 React 的 dispatcher 拦下（Invalid hook call），根本走不到那句 `store === null` 检查。它归入规格已记录的 hook 缺口，由 `examples-browser-e2e` 覆盖。拿一个测不到的路径冒充已覆盖，正是本模块反复要避免的事。

**变异检查结果。** 每项自证——锚点唯一命中、文件 md5 确已改变、还原后逐字节一致；五项跑完基线复跑 37 passed：

| 变异 | 结果 |
|---|---|
| `getSnapshot()` 每次返回新对象 | **杀死**（1 failed） |
| `installed` 不再清 `installEligible` | **杀死**（2 failed） |
| 取消订阅变成 no-op | **杀死**（1 failed） |
| 去掉"状态未变不通知"的判断 | **杀死**（1 failed） |
| 去掉刚加的 `async` | **杀死**（2 failed）——上一条修复确实被守住 |

与 T1 不同，本任务**没有等价变异**：React 侧要守的性质（快照引用稳定性、通知时机、async 语义）全部运行时可观察，而 T1 那个存活项（去掉 `Readonly`）是纯类型约束。

#### 2026-09-17 更正：未挂载时的方法不再 reject

上文"四个方法改为 `async`"一段记录的"未挂载时 `bound()` 抛错、调用以 rejected promise 结束"**已被替换**。`examples-browser-e2e` 的第一次真实渲染发现，这个行为让最自然的写法静默失效：React 的 effect 子先父后，`PwaProvider` 内的子组件在挂载 effect 里调用 `register()` 时，Provider 自己的 effect 还没 attach facade，调用被拒、`void` 吞掉 rejection，页面从未注册。单元测试没有渲染器，结构上抓不到 effect 顺序。

现行为：**无 facade 时方法等待下一次 `attach` 再转发**（首次挂载前与 StrictMode 重挂载的 detach 间隙同样适用）。原先的"挂载前抛错"与"detach 后抛错"两条测试已替换为覆盖等待语义的三条；把等待改回立即 reject 的变异恰好杀死这三条（57 过 3 挂）。上表"去掉刚加的 `async`"一行描述的是旧实现下的结果，保留为历史。

### 检查点：两个包各自成立

- 两个包分别 `build` / `test` / `typecheck` 通过，各自的依赖边界测试为绿。
- 此时两份 store 尚无任何机制保证一致——这正是 T3 存在的理由，不要在此处跳过它。

### 任务 3：一致性测试

**说明：** 在 `packages/react` 内比对两侧在同一事件序列下的状态序列。

**验收标准：**

- `packages/react` 的 devDependency 加 `@pwa-platform/vue`（`workspace:*`）。
- **驱动方式遵循本仓既有范式**：React 侧走本包相对路径 `../src/store.js`；Vue 侧走 `@pwa-platform/vue` 的**公开入口**——用假 `App` 调 `createPwa({ config, client }).install(app)`，从 `provide` 取出绑定后读 `state.value`。两侧共用同一个假 `PwaClient` 发事件。
- 事件序列至少覆盖：首次注册、安装可用后安装、更新等待、**同一事件重复到达**、**乱序到达**。
- 断言状态快照序列**逐项**相等，而不只是末态相等——末态相同而中间过程不同，正是分叉最容易藏身的地方。
- T2 立下的"react 生产闭包不得含 `@pwa-platform/vue`"边界测试在本任务后**仍为绿**。

**验证：**

- `pnpm --filter @pwa-platform/react test` 通过。
- 变异检查：把 Vue 侧 store 的某一条翻转规则改掉（一致性测试必须报红）。**这条变异是本任务是否有效的唯一证据**——一个改了一侧却照样全绿的一致性测试，等于没写。
- 另需确认：`pnpm install` 后 `@pwa-platform/vue` 只出现在 react 包的 `devDependencies`，不进 `dependencies`。

**依赖：** 任务 1、任务 2。

**预计范围：** M（测试与假实现）。

#### T3 实施记录（2026-09-17）

**跨包导入走的是 `dist` 而不是源码，这给强制变异埋了一个必须处理的陷阱。** `@pwa-platform/vue` 的 `exports` 指向 `./dist/index.js`，一致性测试读到的是构建产物。改了 vue 的源码却忘记重新 build，测试会照常全绿——而那和"一致性测试没能发现分叉"看起来一模一样。

因此本任务的变异做成了**对照实验**：同一个变异（Vue 侧 `installed` 不再清 `installEligible`）跑两次，唯一差别是有没有 `pnpm --filter @pwa-platform/vue build`：

| | vue 是否重建 | 结果 |
|---|---|---|
| RUN A | 否 | **50 passed 全绿**——读到过期 dist，这就是假绿的现场 |
| RUN B | 是 | **3 failed**——一致性测试确实在驱动 Vue 的实现 |

还原源码并重建后基线复跑 50 passed，`packages/vue/src/store.ts` 的 md5 逐字节回到原值。这一对照同时证明了两件事：测试没有在自比自，以及那个陷阱真实存在——**后续任何改动 Vue 侧的工作，跑一致性测试前必须先 build vue**。

**`3 failed` 这个数量是自洽的**，这比"报红了"更能说明问题。十条序列里只有三条 `install-eligible` 先于 `installed` 的会被该变异影响；另外两条含 `installed` 的序列（`["update-waiting","installed","install-eligible","registered"]` 与 `["installed","install-eligible"]`）中，`installed` 到达时 `installEligible` 本就是 `false`，清与不清结果相同，本就不该报红。影响面正好等于预期，说明变异打中的是那条规则本身，而不是造成了某种全局破坏。

**`packages/react` 不需要额外声明 `vue`。** `@pwa-platform/vue` 的 peer 依赖由 pnpm 从 workspace 解析，typecheck 一次通过。依赖落位已核对：`dependencies` 只有 client-runtime、`peerDependencies` 只有 react、`@pwa-platform/vue` 只在 `devDependencies`，production deps 中没有 vue；lockfile 仅增 3 行 workspace link，无非 registry 来源、无安装脚本。T2 立下的"生产闭包不得含 `@pwa-platform/vue`"边界测试在本任务后仍为绿。

**一致性测试自带一条证伪用例**（"the parity suite can actually fail"），断言比较逻辑确实能区分差异。它与上面的变异各管一头：那条防止比较退化成自比自，变异证明测试真的连着 Vue 的实现。两者缺一，这套守卫都可能在无声中变成摆设。

### 任务 4：ADR-0016 与文档同步

**说明：** 记录本模块的决定，并同步三处文档。

**验收标准：**

- `docs/adr/0016-framework-bindings.md` 记录：两个包的划分与理由、各按框架惯例的绑定形态、状态翻转表、一致性测试的归属与驱动方式、**Vue 的支持版本下限与特性检测**、公开面上那个测试注入点的用途。
- `docs/architecture/package-boundaries.md` 新增"宿主适配器"一节，写明两个包的依赖边界，以及 react 包对 vue 包的 devDependency 只用于一致性测试。
- `README.md` 的交付状态与包清单同步。
- `docs/DOCUMENTATION-BASELINE.md` 新增 vue-react-adapters 行，状态 `target`（CI 证据取得前不翻 `verified`）。
- 逐行复验文档基线表格的列数，避免插入行把表格挤散。
- **不改** `docs/architecture/compatibility.md`：项目所有者选择保持 Vue 3.4 且不改文档，该文档与 3.4 清理缺口之间的张力已记在规格的"已知限制"，留给首次发布前的兼容性复审。

**验证：**

- 全仓扫描跨文档锚点与相对链接可解析；ADR 的每条断言与实现对照核验。

**依赖：** 任务 3。

**预计范围：** M（ADR 与三处文档）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0016 的写法之后，再进入模块质量门禁。

### 任务 5：模块质量门禁

**说明：** 完成模块级验证、独立评审与交付记录。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck 全部通过；`pnpm test:browser` 照常通过（两个新包被跳过，不报错）。
- **依赖变更证据**：`pnpm install --frozen-lockfile` 通过，附 lockfile diff 审阅——新增了哪些传递依赖、是否有依赖声明安装脚本、有无非 registry 来源的 `resolution`（按[依赖变更流程](../../docs/operations/dependency-changes.md)，最后一项 pnpm 从 lockfile 安装时不再检查，只能靠审阅拦截）。
- 由新上下文的独立评审代理审阅，重点包括：两份 store 是否真的等价、一致性测试是否可能空过、特性检测的两个分支是否都被覆盖、react 生产闭包是否可能混入 vue、快照引用稳定性是否可靠、`usePwa()` 的抛错路径、文档一致性。阻断项与应修项已处理。
- **CI 证据**：GitHub 账号恢复后取得（PR 上 quality job 通过，加一次报红/恢复的对照）；在此之前按 build-verifier 与 vite-adapter 的先例执行本地完整门禁，并在记录中写明它**不替代** CI 证据，基线行保持 `target`。
- 结果写入 `tasks/vue-react-adapters/verification.md`。

**验证：**

- 干净 worktree 的命令输出；spec-guard 产物校验；CI 运行链接（账号恢复后补）。

**依赖：** 任务 4。

**预计范围：** M（验证记录与评审修复）。

## Task List

> Tasks tracked in this plan using local ids (T1–T5). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword——写一个不存在的 issue 号比不写更糟。
>
> 另有一处待办随账号恢复一并处理：能力图 `vue-react-adapters` 行的职责描述已于 2026-09-17 修订（rowDigest `5496c3f3a7a1` → `2517367fe6f9`），issue #8 的正文摘要尚未刷新，需走 `/spec-guard:sync-map`。state.json 中的旧指纹**有意保留**，以便检测如实报出这处分歧。

### Phase 1：两个绑定各自成立

- T1 `@pwa-platform/vue` 完整交付
- T2 `@pwa-platform/react` 完整交付（可与 T1 并行）

### 检查点：两个包各自成立（T1、T2 之后）

### Phase 2：守护与交付

- T3 一致性测试（blocked by T1, T2）
- T4 ADR-0016 与文档同步（blocked by T3）

### 检查点：交付前（T4 之后）

- T5 模块质量门禁（blocked by T4）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **一致性测试空过** | 高：它是"各自实现"这个决定的唯一守护，空过等于两份实现从此自由分叉 | T3 强制一条变异检查——改掉 Vue 侧任一条翻转规则，该测试必须报红。逐项比对状态序列而非只比末态 |
| **react 生产闭包混入 `@pwa-platform/vue`** | 高：只用 React 的应用被拖上 Vue，"两个独立包"的决定当场失效 | T2 **先于** T3 立下这条边界测试（静态导入闭包扫描，不看 node_modules）；T3 完成后复验它仍为绿 |
| **Vue 3.4 分支无人覆盖** | 中：特性检测写反方向也全绿，而 3.4 用户拿到的是坏行为 | T1 用**不带 `onUnmount` 的假 `App`** 单独跑一条用例；变异检查删掉 `typeof` 判断时该用例必须报错 |
| **React hook 本身无单元测试** | 中：`useSyncExternalStore` 需渲染器，而本模块不引入 `react-dom` | 已知限制，项目所有者知情决定。逻辑全部压进纯 TS store（完整覆盖），hook 只剩一行；其正确性由 `examples-browser-e2e` 在真实浏览器中覆盖 |
| **快照引用不稳定** | 中：`useSyncExternalStore` 判定为无限更新，页面卡死 | T2 专门一条用例断言状态未变时 `getSnapshot()` 返回同一引用；变异检查让它每次返新对象 |
| **Vue 3.4 上 facade 不被 dispose** | 低—中：监听累积，仅在同页反复建销应用实例时显现 | 项目所有者知情决定；已记入规格"已知限制"，边界与实际影响写明 |
| 首次引入第三方运行时依赖 | 中：供应链面扩大 | 两个版本已过 `minimumReleaseAge` 闸门；T5 要求 lockfile diff 审阅与冻结安装证据 |

## 执行顺序

任务 1、任务 2（可并行）→ 检查点"两个包各自成立" → 任务 3 → 任务 4 → 检查点"交付前" → 任务 5。

每个任务一个提交，提交信息带 `Task: T<n>`（账号不可用期间不写 closing keyword）。
