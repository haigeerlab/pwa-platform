# 验证记录：vue-react-adapters

> 模块质量门禁（T5）的可复现结果。本模块的任务以本地编号 T1–T5 记录在 `tasks/vue-react-adapters/plan.md`，GitHub 账号恢复后补建 issue 并回填编号。

## 环境与对象

- 日期：2026-09-17
- 分支：`feat/vue-react-adapters`，基线 `main` = `6feb422`
- 环境：Node v24.18.0，pnpm 11.18.0，Darwin 24.6.0 arm64，Google Chrome 152.0.7977.84（本机安装的稳定版），Playwright 1.63.0
- 被验证的提交：门禁先在 `e12db2c`（T1–T4）上执行；独立评审之后在 `c95ad54` 上重新执行

本分支相对 `main`：6 条提交、26 个文件、2542 行新增 3 行删除。`Task: T1` 至 `Task: T5` 各一条，标记完整。

| 提交 | 内容 |
|---|---|
| `3be2dc7` | 模块规格与计划（含能力图该行的修订） |
| `c7ee2d2` | T1 `@pwa-platform/vue`：插件与 composable |
| `171682a` | T2 `@pwa-platform/react`：Provider 与 hook |
| `d4ec63e` | T3 一致性测试 |
| `e12db2c` | T4 ADR-0016 与入口文档同步 |
| `c95ad54` | T5 独立评审的处置 |

## 干净 worktree 门禁

从被验证的提交新建独立的 detached git worktree，依次执行。两轮的差别只有被检出的提交：

| 命令 | `e12db2c`（评审前） | `c95ad54`（评审后） |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0，10 个包 | 退出 0，10 个包 |
| `pnpm test` | 退出 0，**777** 通过 | 退出 0，**787** 通过 |
| `pnpm typecheck` | 退出 0，10 个包 | 退出 0，10 个包 |
| `pnpm test:browser` | 退出 0 | 退出 0，**64** 通过 |

冻结安装通过意味着 lockfile 与各 manifest 完全一致，没有未提交的依赖漂移。评审修复未改动 lockfile（`git diff e12db2c..HEAD -- pnpm-lock.yaml` 为空），因此两轮安装的依赖图相同。

评审后一轮的逐包计数：

- `pnpm test`：contracts 139、browser-test-harness 61、core 94、build-verifier 100、engine-workbox 37、sw-runtime 87、client-runtime 80、**vue 36**、vite 94、**react 59**。
- `pnpm test:browser`：browser-test-harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12、vite 11。

**`pnpm test:browser` 的关键观察**：输出中**没有** `packages/vue` 或 `packages/react` 的任何条目——两个新包不声明 `test:browser` 脚本，被 `--recursive` 静默跳过而非报错，整体退出 0。这正是规格所依赖的行为（真实浏览器验证归 `examples-browser-e2e`），此前只从既有包的现状推断，本次在干净环境中得到直接证据。

## 依赖与供应链

本模块是全平台**第一次引入第三方运行时依赖**，此前所有包的运行时依赖都是工作区内部包或 Node 内建。

- 新增（均经项目所有者批准）：`vue@3.5.42`、`react@19.3.0`、`@types/react@19.3.0`。
- `@types/react` 是必需而非便利：实测 `react@19.3.0` 的 `types` 与 `typings` 字段均为空、`dependencies` 为空，没有它就无法在本仓的 `strict` + `isolatedDeclarations` 下 `import` react。vue 自带类型，无此问题。
- 发布时间均满足 `minimumReleaseAge: 1440`：vue 3.5.42 为 2026-08-27，react 与 `@types/react` 的 19.3.0 均为 2026-09-09。
- lockfile 累计 **+191 行**：vue 与 `@vue/*` 九件、react、`@types/react`、`csstype`、`entities`、`estree-walker`、`magic-string`，以及 `@vue/compiler-sfc` 拖入的四个 `@babel/*`。
- **非 registry 来源的 `resolution`：无。** 这一项 pnpm 从 lockfile 安装时不再复查，只能靠人工审阅拦截，已逐次核对（T1、T2、T3 各一次，T5 汇总一次）。
- **声明安装脚本的包：无。** 安装过程未出现 `ERR_PNPM_IGNORED_BUILDS`。
- workspace link 恰好三条：`react → client-runtime`、`react → vue`（devDependency，仅供一致性测试）、`vue → client-runtime`。
- `pnpm-workspace.yaml` 未被本分支触碰，供应链设置没有被放宽。

## 各任务的变异检查（T1–T3）

每一项都自证：锚点唯一命中、注入后文件 md5 确已改变、还原后与基线逐字节一致；每组跑完复跑基线确认回到全绿。这套自证不是形式——本仓此前发生过变异脚本在函数体内丢失 PATH、一个变异都没注入而基线照常通过的情况，其表现与"守卫都没问题"完全一致。

### T1 `@pwa-platform/vue`

| 变异 | 结果 |
|---|---|
| 删掉 `typeof app.onUnmount === "function"` | **杀死**（1 failed）——Vue 3.4 那条用例确有证伪力 |
| `installed` 不再清 `installEligible` | **杀死**（4 failed，store 与 binding 两个文件都抓到） |
| `usePwa()` 缺 provide 时返回 `{}` 而非抛错 | **杀死**（1 failed） |
| `PwaBinding.state` 去掉 `Readonly` | **存活——等价变异**（见"三处没有守卫的地方"） |

### T2 `@pwa-platform/react`

| 变异 | 结果 |
|---|---|
| `getSnapshot()` 每次返回新对象 | **杀死**（1 failed） |
| `installed` 不再清 `installEligible` | **杀死**（2 failed） |
| 取消订阅变成 no-op | **杀死**（1 failed） |
| 去掉"状态未变不通知"的判断 | **杀死**（1 failed） |
| 去掉四个方法的 `async` | **杀死**（2 failed） |


> **2026-09-17 更正**：上表 T2 一行及其背后的"未挂载时方法 reject"行为已被替换为"等待下一次 attach"。该缺陷由 `examples-browser-e2e` 的冒烟测试在真实浏览器中发现（React 子组件挂载 effect 先于 Provider 的 attach 执行，注册静默失败），修复与变异证据记在 `tasks/vue-react-adapters/plan.md` 的 T2 实施记录末尾。本记录其余内容仍对应合并时的提交。

### T3 一致性测试：一次对照实验

跨包导入解析到 `@pwa-platform/vue` 的 `dist` 而非源码，这给强制变异埋了陷阱：改了 Vue 源码却没重新 build，测试会照常全绿，而那与"一致性测试没能发现分叉"表现完全相同。因此同一个变异（Vue 侧 `installed` 不再清 `installEligible`）跑两次，唯一差别是有没有重建：

| | vue 是否重建 | 结果 |
|---|---|---|
| RUN A | 否 | **50 passed 全绿**——读到过期 dist，假绿的现场 |
| RUN B | 是 | **3 failed**——一致性测试确实在驱动 Vue 的实现 |

**`3 failed` 这个数量是自洽的**，比"报红了"更能说明问题：十条序列中只有三条 `install-eligible` 先于 `installed` 的会被该变异影响；另外两条含 `installed` 的序列里，`installed` 到达时 `installEligible` 本就是 `false`，清与不清结果相同。影响面正好等于预期，说明变异打中的是那条规则本身，而非造成全局破坏。

该陷阱现已写入规格的"命令"一节（要求用 `pnpm test --filter` 而非 `pnpm --filter … test`）、ADR-0016 与包边界文档。

## 独立评审

由新上下文的 `code-reviewer` 代理执行，审查重点按 plan 指定。代理自行复核了基线（777 通过、lockfile +191、3 条 workspace link、0 死链），并对源码做了探针实验，实验后源码逐字节还原。

**结论：尚不可进入交付**——1 个阻断项、3 个应修项、7 个建议项。逐项处置如下，全部落在 `c95ad54`。

### 阻断项

**B1：`PwaProvider` 在 `config` prop 引用变化时重建 facade，且状态不回滚。** effect 依赖数组里放的是 `config` 对象，而 `<PwaProvider config={{ … }}>` 这种字面量写法每次渲染都产生新引用；`detach()` 当时只清订阅、不复位状态。于是新建的 facade 从未 `register()`，store 却仍报告 `registered: true`，界面据此显示"已注册"。评审用探针实测了这条链。

三重守卫同时漏掉了它：一致性测试不涉及渲染，Provider 当时没有任何测试，store 的测试也从未演练过"重建"。

**处置**：两处都改。effect 依赖收窄到 config 的五个标量字段（React 官方文档明确把对象依赖标为此类问题的来源）；`detach()` 同时复位状态——没有 facade 时那些标志什么也不描述，让这个坏状态在类型之外也不可表示。effect 体抽成 `bindFacade(store, config, client?)`，使 create → attach → detach → dispose 整个周期无需渲染器即可单测。

### 应修项

- **M1：一致性测试里那条"证明本套件能失败"的用例永远不会失败。** 它从未调用 `vueSequence`，只证明了 `toEqual` 能区分布尔值；而它的注释声称防止"比较退化成自比自"——那句话是错的，真把 `vueSequence` 改成 `return reactSequence(types)` 它照样通过。**这是本模块自己产出的一个"不会失败的测试"**，与整个模块反复防范的正是同一类问题。**处置**：改名为"the comparison itself discriminates"，注释如实写明它只验证比较器、不验证两侧的连接，并指明真正的证据是 ADR-0016 记录的对照变异实验。测试文件内无法证明那种连接。
- **M2：规格"命令"一节列出的命令会直接复现假绿。** 它列的 `pnpm --filter @pwa-platform/vue test` 不经过 `scripts/run-workspace.mjs`，因而不重建依赖，与 ADR-0016 写下的硬约束自相矛盾。**处置**：改为 `pnpm test --filter @pwa-platform/react`，并在该节说明为何不能用另一种写法。
- **M3：验收标准 4 称"React 侧由 effect 清理实测"，而 `packages/react/src/index.ts` 当时零测试覆盖。** ADR 与验证记录当时只承认"hook 本身没覆盖"，低估了缺口——facade 的创建与销毁不在 store 里，正是 B1 的藏身处。**处置**：`bindFacade` 抽出并单测（4 条用例）；验收标准 4 改为如实描述——React 侧实测的是 `bindFacade`，组件里那一行 `useEffect` 调用及其依赖数组没有渲染器可测。

### 建议项

- **S1** `attach()` 重复调用会泄漏上一次订阅 → 已修（先 `unsubscribe?.()`）并补测试。
- **S2** 注入的 `client` 也会被 `dispose()`，所有权未写明 → 两侧注释补齐。
- **S3** `INITIAL_STATE` 是导出的可变共享对象 → 两个包都 `Object.freeze`，并各加一条 `Object.isFrozen` 断言。
- **S4** `packages/vue/test/binding.test.ts` 中一条用例在 binding 为 `undefined` 时恒真 → 先断言 `toBeDefined()`。
- **S6** ADR 与包边界称一致性测试"钉住行为相同"，实际只钉状态序列（评审实测：破坏 Vue 侧引用稳定性或把 `logout()` 错转成 `register()`，该套件均照常全绿，由各自包的测试抓住）→ 两处措辞收窄。
- **S7** ADR 中"`@vue/runtime-core@3.4.38` 的 `App` 接口没有卸载回调注册点，3.5.0 相对它恰好只多这一个成员"在离线环境无法复核 → 复核方式记录于此：从 registry 取两个版本的 tarball，解出 `package/dist/runtime-core.d.ts`，以 `sed -n '/interface App<HostElement/,/^}/p'` 提取接口体比对。3.4.38 的公开成员为 `version`、`config`、`use`、`mixin`、`component`、`directive`、`mount`、`unmount`、`provide`、`runWithContext` 及下划线内部字段；3.5.0 相对它仅多 `onUnmount(cb: () => void): void`。
- **S5：不采纳，理由如下。** 建议补一条走真实 `createApp()` + `app.mount()` / `app.unmount()` 的测试，以验证 Vue 确实会调用注册的卸载回调。但 `app.mount()` 需要一个 DOM 容器，而本包的 vitest 运行在 `node` 环境，规格又明确禁止新增测试框架依赖（jsdom / happy-dom 都是新增依赖，需另行批准）。评审提到既有的真实 `createApp()` 用例之所以可行，是因为 `runWithContext()` 不需要 mount。**在不引入新依赖的前提下，假 `App` 的两分支覆盖已是上限**；真实卸载路径归 `examples-browser-e2e`。

## 评审修复后的变异复核

修复本身也要自证。对 B1 的两处修改各注入一次变异（同样自证：锚点唯一、md5 改变、还原后逐字节一致，基线复跑 59 通过、typecheck 退出 0）：

| 变异 | 结果 | 含义 |
|---|---|---|
| M-A 删掉 `detach()` 的状态复位 | **3 failed** | 这一半**有**守卫 |
| M-B 把 effect 依赖改回 `[store, config, client]` | **59 passed 全绿** | 这一半**没有**守卫 |

**M-B 的绿不是通过，是发现。** 它用实验坐实了一件本来只是自述的事：没有渲染器，effect 的依赖数组就没有任何覆盖。B1 的两处修复中，只有"`detach()` 复位"这一半受测试保护；"依赖收窄"那一半只能靠代码审查与后续模块的真实浏览器验证。

## 三处没有守卫的地方（实证，非搪塞）

1. **`PwaBinding.state` 的 `Readonly`**（T1 的等价变异）：去掉后 35 个测试全绿。这是类型层面的约束，运行时 `.value` 依然可写，任何运行时断言都区分不出两者。要在运行时真正挡住写入须改用 Vue 的 `readonly()` 包一层代理——那是另一个设计决定，不在本规格的承诺内。**不补测试去假装杀死它。**
2. **React effect 的依赖数组**（M-B 实证）：见上。
3. **`usePwa()` 在 Provider 之外抛错**：写不出单元测试。`useContext` 在渲染之外调用会先被 React 的 dispatcher 拦下（评审实跑确认报 `Cannot read properties of null (reading 'useContext')`），根本走不到那句 `store === null` 检查。

## 与 spec、ADR 和能力图的边界核对

- **公开面按实际构建产物核对**，而非按规格所述。`packages/vue/dist/index.d.ts` 导出 `createPwa`、`usePwa`、`PWA_KEY` 与 `PwaBinding`／`PwaOptions`／`PwaMethods`／`PwaState`；`packages/react/dist/index.d.ts` 导出 `PwaProvider`、`usePwa` 与 `PwaBinding`／`PwaProviderProps`／`PwaMethods`／`PwaState`。两者**都没有再导出 client-runtime 的任何函数**，只在类型签名中引用 `PwaClient` 与 `PwaClientConfig`（应用必须能传入这两个值），`PwaMethods` 是本包的派生类型而非转发。
- 两个包的 `exports` 均只声明 `.`，`files` 均只含 `dist`，`scripts` 均只有 `build`、`test`、`typecheck`。
- `@pwa-platform/vue` 只出现在 `packages/react` 的 `devDependencies`；生产依赖闭包中没有它，由包边界测试（含反向探针）与 `pnpm list --prod` 双重确认。
- 能力图该行已是修订后的措辞"提供 Vue 3 与 React 19 的薄 facade 与状态绑定。"；`rowDigest` 计算值为 `2517367fe6f9`，而 `.agent/state.json` 仍持有 `5496c3f3a7a1`——**这处分歧是有意保留的**：issue #8 的正文摘要尚未刷新，写回新指纹等于谎报已同步。待 tracker 可用时经 `/sync-map` 处理。`goalDigest` 两侧一致。
- `docs/architecture/compatibility.md` 未被本分支触碰，符合项目所有者"保持 Vue 3.4 且不改文档"的决定。
- 全仓 markdown 的相对链接扫描：**0 条死链**；`docs/DOCUMENTATION-BASELINE.md` 表格逐行复验列数，**0 行异常**。扫描清单取自 `git ls-files '*.md'` 并显式补入尚未跟踪的本文件，因此不会读到仓库中未跟踪的私有文档。

## 已知限制（移交后续模块）

- **React 的 Provider 与 hook 没有运行时覆盖。** `useSyncExternalStore` 只能在渲染中运行，而本模块不引入渲染器。逻辑已尽可能压进纯 TS 的 store 与 `bindFacade`（两者完整覆盖），组件内剩下的是一行 `useEffect`、一次 `createElement` 与 hook 的三行读取。其中依赖数组与 `usePwa()` 的抛错路径均无守卫（见"三处没有守卫的地方"）。由 `examples-browser-e2e` 覆盖。
- **Vue 3.4 上 facade 不会被自动 `dispose()`。** `app.onUnmount()` 是 3.5.0 引入的，3.4 的 `App` 接口没有任何卸载回调注册点。`app.unmount()` 之后仍留着的是 facade 注册的监听：`installEnabled` 时 `window` 上的 `beforeinstallprompt` 与 `appinstalled`、registration 的 `updatefound`、安装中 worker 的 `statechange`，以及 `applyUpdate()` 在飞行时的 `controllerchange` 监听与超时定时器。典型 SPA 中这些随整页销毁一同消失；真正会累积的是同一页面内反复创建与销毁应用实例的场景——组件测试、微前端宿主、水合失败后重建。
- **上一条与 `compatibility.md` 对"支持"的定义存在张力**（该文档称"支持"表示具备 peer 校验、构建 fixture 和浏览器行为测试）。本期不改该文档，留给首次生产发布前的兼容性复审决定是否加脚注。
- **`logout()` 之后 `registered` 仍为 `true`**：facade 的 `logout()` 只返回布尔、不发事件，适配器无从得知注册已消失。让状态回落需要给 client-runtime 增加 `unregistered` 事件，那是改已交付包的公开契约，须立新 ADR。
- **SSR 未覆盖**：`useSyncExternalStore` 的 `getServerSnapshot` 参数不传，Vue 侧也不处理服务端渲染。归 `ssr-adapters`。
- **维护一致性测试有一条硬约束**：改动 Vue 侧后必须重建 vue 的 `dist`，否则该测试读到过期产物而假绿。已写入规格、ADR-0016 与包边界文档。

**2026-09-17 补记：React 侧的两项已在 `examples-browser-e2e` 中得到真实渲染验证**（该模块 T7，提交 `4f95b7c`）。依赖数组：把 effect 依赖改回整个 `config` 对象并重建 `dist` 后，React 示例的重渲染测试转红（界面显示"not registered"而 worker 仍在），同一变异下本包 60 条单元测试全部通过；`usePwa()` 在 Provider 之外：示例界面显示的错误文本与绑定自身的报错一致。`logout()` 之后 `registered` 停留为真，在两个示例的界面上观察到的表现与上文描述一致。以上各项仍以本条之前的原文为该模块交付时的记录。

## CI 实跑证据：**未取得**

GitHub 账号在本模块开发期间不可用，因此本模块没有 PR、没有 CI 运行记录，也没有"有意制造失败→报红→撤销→恢复为绿"的对照。

上面的干净 worktree 门禁**不替代 CI 证据**：它证明这份代码在本机的干净环境中通过冻结安装与全部门禁，但没有证明 CI 工作流在 Node 22 与 24 两条矩阵线上同样通过。`docs/DOCUMENTATION-BASELINE.md` 中 vue-react-adapters 一行因此保持 `target`，待账号恢复后按 build-verifier 与 vite-adapter 的先例补取证据再翻 `verified`。

账号恢复后本模块待办：推送 `main` 与本分支 → 建立模块 PR（正文写 `Closes #8`）→ 为 T1–T5 补建 sub-issue 并回填 plan 的 Task List → 取得 CI 红绿证据 → 运行 `/spec-guard:sync-map` 刷新 issue #8 的正文摘要并写回 `rowDigest` → 翻转文档基线行。
