# 规格：examples-browser-e2e

## 目标

交付 Vue 3 与 React 19 的示例应用，并在真实浏览器中执行 [V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)第 6 行"Vue 与 React 示例"所要求的验证：**安装、离线启动、更新提示、恢复路径**四项，两个示例各跑一套。

这是整个 v1 的**验收出口**。此前每个模块都把"真实浏览器里的端到端行为"移交到这里：client-runtime 的安装引导与登出、sw-runtime 的离线降级与恢复 worker、vite-adapter 的构建产物、vue-react-adapters 的 Provider 与 hook 运行时路径。本模块是它们第一次被放在一起、以应用的姿态运行。

成功标准：两个示例分别构建成功并通过 build-verifier 校验；四项 E2E 在**已取得的浏览器范围内**全部通过；未能取得的范围如实登记，不以"通过"计。

> **本模块的验收在当前条件下不完整。** V1 验收矩阵要求示例"在必测范围内"通过四项 E2E，而[浏览器矩阵](../docs/architecture/browser-matrix.md)定义的必测范围是 Chrome 桌面端与 Chrome Android 各自的 N 与 N-1。本模块没有 Android 测试设备，也未获授权下载上一主版本的 Chrome，因此只能取得 **Chrome 桌面端 N** 的证据。这一点写进验收标准而非只写进已知限制：**V1 发布前必须补齐，否则该行证据不成立**（详见"已知限制"）。

## 范围

**交付物：**

- 私有工作区包 `packages/examples-browser-e2e`，一个包内含两个示例与一套 E2E（项目所有者 2026-09-17 决定）：
  - `apps/vue/`：Vue 3 示例应用。用 `defineComponent` 与 `h()` 渲染函数，**不用 SFC**——`.vue` 需要 `@vitejs/plugin-vue`，而渲染函数经 Vite 构建无需任何框架插件（已实测）。
  - `apps/react/`：React 19 示例应用。**用 JSX**——Vite 8 内置的转换会把它编译成 `react/jsx-runtime` 的 `jsx`/`jsxs` 调用，无需 `@vitejs/plugin-react`（已实测产物）。
  - `browser-tests/`：四项 E2E，两个示例各一套。
  - `global-setup.ts`：用 vite-adapter 的插件真实构建每个示例的多个版本。
  - 两个示例都通过各自框架的绑定接入平台：Vue 用 `createPwa` 插件加 `usePwa()`，React 用 `PwaProvider` 加 `usePwa()`；界面自行实现更新提示与安装按钮——那正是 [ADR-0013](../docs/adr/0013-client-facade-and-page-side-lifecycle-events.md) 留给应用的部分。
- `tasks/examples-browser-e2e/verification.md`：按[浏览器矩阵](../docs/architecture/browser-matrix.md)的"版本号"字段登记实测环境，逐场景记录结果，并按[恢复演练](../docs/operations/recovery-drill.md)的模板附上演练记录。
- 同步 `README.md`、`docs/DOCUMENTATION-BASELINE.md`；若本模块产生难以逆转的决定，另立 ADR。

**不做的事：**

- **不修改任何已交付包**。发现缺陷时提出并记录，修复归属包所有；本模块只负责暴露它。
- **不新建平台能力**：示例只消费已有的公开入口（vite 插件、两个框架绑定），不绕过它们直接使用 `client-runtime` 或 `sw-runtime`。
- **不覆盖 Vue 3.4 的清理缺口**（项目所有者 2026-09-17 决定）：那需要再装一套 `vue@3.4.x` 跑第二组 fixture，与"示例展示推荐用法"相冲突。该缺口仍记在 vue-react-adapters 名下。
- **不做 SSR**（归 `ssr-adapters`）、不做 Push（归 `push-module`）、不做多 PWA 同源拓扑（归 `shared-origin-topology`）。
- **不决定 Chrome Android 的验证方式**：[ADR-0010](../docs/adr/0010-real-browser-verification-with-playwright.md) 把它留给"第一个**具备测试设备**的运行时模块"，本模块没有设备，因此不是那个模块。

## 依赖

- **运行时依赖**：无。本包不发布运行时代码，示例应用的依赖写在包的 `devDependencies` 中。
- **开发依赖**：
  - 工作区包（均为 `workspace:*`）：`@pwa-platform/vite`、`@pwa-platform/vue`、`@pwa-platform/react`、`@pwa-platform/contracts`（示例声明 identity/policy 用）、`@pwa-platform/build-verifier`（响应头与基线校验用）、`@pwa-platform/browser-test-harness`。
  - 已在 lockfile：`vite@8.3.0`、`vue@3.5.42`、`react@19.3.0`、`@types/react@19.3.0`、`@playwright/test@1.63.0`。
  - **新增一项：`react-dom@19.3.0`**（项目所有者 2026-09-17 批准）。React 示例要真正渲染就必须有渲染器，而它不在 lockfile；发布于 2026-09-09，满足 `minimumReleaseAge: 1440`，带入传递依赖 `scheduler`。[兼容性策略](../docs/architecture/compatibility.md)本就把 "React / react-dom `>=19.2.0 <20.0.0`" 列为**应用侧**支持范围；vue-react-adapters 规格中"不声明 `react-dom`"针对的是适配器包（渲染器由应用选择），而示例正是那个"应用"。不改动任何已交付包的 peer 声明。
  - **不需要框架 Vite 插件**：`@vitejs/plugin-vue` 与 `@vitejs/plugin-react` 都不引入，理由见上文交付物。

## 示例应用的形态

两个示例是**同一个应用的两种框架实现**：相同的身份、相同的策略、相同的界面行为，只有绑定方式不同。这样两套 E2E 可以断言同一组结果，差异只会来自框架绑定本身。

每个示例必须具备（否则安装判定无从执行）：

- 完整的 `PwaInstallMetadata`：`startUrl`、`display`、名称、主题色与四个图标（192/512 各含 `any` 与 `maskable`）。
- 启用 `offlineFallback` 的 `PwaPolicy`，以及预缓存应用壳、资源与离线页的规则。**策略中的路径是 mount-relative**，由 `compilePlan` 解析到 `mountPath` 之下——写成绝对 URL 会得到重复前缀并以 `compile.offline-fallback-not-built` 失败。
- 界面上可观察的三件事：更新提示（`updateWaiting` 为真时出现，点击调用 `applyUpdate()`）、安装按钮（`installEligible` 为真时出现，点击调用 `promptInstall()`）、以及一处随版本改变的可见标记，供更新测试区分 v1 与 v2。
- 两处与平台无关的应用自有交互，两个示例写法相同（T7 实施时补入，2026-09-17）：**计数器按钮**，用于按需触发重渲染；**登出按钮**，调用 `logout()` 并按其返回值显示应用自己的登出标记——那正是 [vue-react-adapters](vue-react-adapters.md) 的已知限制留给应用的做法。
- **仅 React 示例**：一处位于 `PwaProvider` 之外的 `usePwa()` 调用，将抛出的错误保留在带 `hidden` 属性的测试专用 DOM 元素中。端到端测试因此仍能断言真实渲染路径的报错，而示例用户与辅助技术不会看到测试诊断；该路径的单元测试到不了（渲染之外 React 的 dispatcher 会先拦下 `useContext`）。

## 站点版本与部署模拟

`global-setup.ts` 用插件构建每个示例的三个版本，`FixtureServer` 的 `deploy()` 在测试中切换：

| 版本 | 内容 | 用途 |
|---|---|---|
| `v1` | 正常构建 | 首次访问、安装、离线启动 |
| `v2` | 改动一处应用壳内容后重建，哈希随之改变 | 更新提示 |
| `recovery` | 以 `v1` 为底，把插件写出的 `pwa-recovery-worker.js` 复制到身份的 `serviceWorkerUrl` 位置 | 恢复路径 |

`recovery` 这一版对应[回滚流程](../docs/operations/release-and-incident-runbook.md#回滚)第 2 步："在同一 `serviceWorkerUrl` 发布恢复 worker"。vite-adapter 有意把恢复 worker 写在旁路路径，由发布流程改名发布（[ADR-0015](../docs/adr/0015-vite-plugin-build-pipeline.md)），因此这一步在构建期模拟那次改名，而不是让插件直接覆盖平台 worker。

v2 的制造方式沿用 vite-adapter 的做法：改源码中一处字符串、构建、**再改回去**，仓库中始终只有一份示例源码。

## 验证矩阵

两个示例各执行下列四项。除安装外，各项的通过标准直接引用 V1 验收矩阵对应场景。

### 一、安装

**可自动化的部分**（项目所有者 2026-09-17 决定，本模块只做这些）：

- 编译出的 `PwaPlan.install` 不为 `null`。
- 页面引用的 manifest 位于身份的 `manifestUrl`，可成功获取，且字段与 `PwaInstallMetadata` 逐项一致。
- 页面收到 `beforeinstallprompt` 时，client-runtime 依次发出 `install-eligible` 与 `installed` 事件，示例界面的安装按钮随之出现。**若该事件在当前环境未触发**，本项按"未取得"登记并说明原因，不按通过计。

**不可自动化的部分**：真实完成安装、从 `PwaPlan.install.startUrl` 以独立窗口启动、并断言 `matchMedia("(display-mode: …)")` 成立——这需要驱动浏览器原生安装界面，Playwright 做不到。**留给发布前的人工核对**，结果写入验证记录。

### 二、离线启动

按 V1 矩阵"后续离线启动"的通过标准：安装并填充缓存后断网，应用壳正常渲染无白屏；导航到未缓存路由显示离线降级页；除 `offlineFallback.path` 外不返回其他路由的缓存内容。

### 三、更新提示

按 V1 矩阵"发现更新"的通过标准：`deploy("v2")` 后新 worker 保持等待、不自行激活；示例界面出现更新提示；**确认之前已打开的页面不被刷新或重新加载**（以页面内标记验证）；确认后新 worker 激活并控制页面，已提示的页面由 `update-applied` 清除提示。两个同 scope 标签页中任一页确认后，两页都必须清除提示，且均不刷新。

同一 URL 的新旧 worker 用 `waitForControllerChange` 区分——`waitForController` 只比较脚本 URL，分辨不了版本。

### 四、恢复路径

按[恢复演练](../docs/operations/recovery-drill.md)的步骤执行，通过标准同该文档：

1. 安装当前 worker、填充预缓存，并用 `createCaches` 建立四个对照缓存（同应用旧 revision、同应用其他环境、其他应用同环境且其 `appId` 以当前 `appId` 开头、非平台缓存），用 `snapshotCaches` 记录。
2. `deploy("recovery")` 并触发更新，恢复 worker 立即激活并接管，无需用户操作。
3. 验证三件事：所有已打开页面由恢复 worker 控制；**页面请求未经 Service Worker**（`requestFromPage` 的 `fromServiceWorker` 为假，并以服务器侧 `requests()` 佐证请求确实到达了服务器）；删除集合与保留集合完全符合预期——用 `expectDeletedExactlyUnderPrefix`，它同时要求没有任何新增缓存。
4. `deploy("v1")` 部署修复后的 worker，预缓存重新填充，断网后离线启动恢复。

### build-verifier 校验

V1 矩阵要求"每个示例的构建通过，且 build-verifier 校验通过"。三类检查都做：

- **产物一致性**：由 vite 插件在构建末尾调用 `verifyArtifacts`，构建通过即已成立。
- **响应头基线**：fixture 服务器按[生命周期](../docs/architecture/lifecycle.md)的基线配置 `headerRules`（worker 与 manifest `no-cache`、指纹资源 `immutable` 且 `max-age` 为正），从页面采集实际响应头后交给 `verifyResponseHeaders` 判定。
- **身份基线**：示例自带基线文件，用 `readIdentityBaseline` 与 `compareIdentityBaseline` 比较；再以 `verifyRelease` 汇总三项。注意其输入中**省略某字段与传 `undefined` 语义不同**：前者表示未检查，后者表示查过且不存在。

## 从上游模块接收的缺口

本模块覆盖以下移交项（项目所有者 2026-09-17 决定覆盖 React 侧，不覆 Vue 3.4）：

- **React Provider 的 effect 依赖与 facade 生命周期**：`<PwaProvider config={{ … }}>` 以字面量传配置时，重渲染不得重建 facade、不得让界面显示与实际不符的状态。重渲染由计数器按钮触发，计数器状态放在 Provider **之上**——放在 Provider 之下只会重渲染子树，配置字面量不会被重建，测试也就证明不了任何事。这正是 vue-react-adapters 独立评审发现的阻断项，其修复中"依赖收窄"那一半**在单元测试里没有守卫**，只能在真实渲染中验证。
- **`usePwa()` 在 Provider 之外抛错**：`useContext` 在渲染之外会先被 React 的 dispatcher 拦下，单元测试到不了那句检查，真实渲染可以。
- **`logout()` 之后 `registered` 停留为真**：在示例界面上观察其实际表现，确认已记录的语义与用户所见一致。

## 命令

```bash
pnpm --filter @pwa-platform/examples-browser-e2e typecheck
pnpm test:browser --filter @pwa-platform/examples-browser-e2e
```

**本包只声明 `typecheck` 与 `test:browser` 两个脚本。** 它不产出 `dist`——示例由 `global-setup.ts` 在测试期构建成多个版本，那不是一次性的库构建；它也没有 Vitest 单元测试，因为它的产出是端到端证据，不是可单测的逻辑。

全仓的 `pnpm build` 与 `pnpm test` 因此跳过本包：`--recursive` 对未声明该脚本的包静默跳过，`contracts` 就是现成先例（它没有 `test:browser`，而 CI 的 browser job 长期为绿）。

**但带 `--filter` 指向单个包时行为不同**：`pnpm --filter <包> <该包未声明的脚本>` 会以 `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` 失败，经 `scripts/run-workspace.mjs` 亦然（实测）。所以上面只列本包真正声明的两条，不要照搬其他包的四条命令模板。

## 测试策略

- **构建先于一切**：`global-setup.ts` 构建失败即全部测试失败。示例由插件真实构建，不手工拼装站点——否则测试验的是这个文件拼出来的东西，而非平台的产物。
- **两个示例断言同一组结果**：E2E 以示例名参数化，Vue 与 React 走同一份断言，差异只应来自绑定本身。任何一侧单独失败都指向该框架的绑定。
- **每项 E2E 必须能失败**：为四项各准备一次变异（例如删除离线降级页、让更新自行激活、让恢复 worker 注册 fetch 监听、破坏 manifest 字段），确认对应测试报红。一个从不报红的端到端测试没有意义。
- **浏览器版本如实登记**：每个测试写入 `browser-version` 注解，日志打印实际版本，按浏览器矩阵的字段抄进验证记录。
- **未取得的范围不得记为通过**：Chrome Android、桌面 N-1、参考档与渐进兼容档一律按"未执行"登记。

## 边界

- **始终**：示例只用公开入口；策略路径写 mount-relative；站点版本由插件构建产出；未取得的证据如实登记。
- **先询问**：新增任何依赖；下载浏览器、驱动或测试设备相关组件；修改任何已交付包；改动浏览器矩阵或 V1 验收矩阵的判定标准。
- **禁止**：手工拼装本应由插件产出的站点；因某项难以自动化就降低其通过标准；把"未执行"写成"通过"；为让测试变绿而修改示例以外的代码。

## 验收标准

1. 两个示例应用各自构建成功，产物由插件写出，`verifyArtifacts` 在构建末尾通过。
2. 四项 E2E 在**Chrome 桌面端 N** 上对两个示例全部通过；每项都配有一次变异检查证明它能失败。
3. 响应头基线与身份基线校验通过，三项由 `verifyRelease` 汇总。
4. 恢复路径按恢复演练的步骤与通过标准执行，删除集合与保留集合完全符合预期，演练记录按其模板写入验证记录。
5. 上文"从上游模块接收的缺口"三项在真实渲染中得到验证。
6. **验收不完整的部分被明确登记**：Chrome Android 的 N 与 N-1、桌面端 N-1、真实安装的原生流程、参考档与渐进兼容档，全部以"未执行"及其原因写入验证记录，并在文档基线中保持 `target`。
7. README 与文档基线已同步；`react-dom` 的引入附 lockfile diff 审阅与冻结安装结果。

## 已决定事项（项目所有者，2026-09-17）

- **验收不完整就如实承认**，不修订治理文档来迁就当前条件。沿用前四个模块的先例记录 Android 与 N-1 的缺席，但因本模块的通过标准明写"必测范围内"，额外标注其验收因此不完整、V1 发布前必须补齐。
- **安装判定只做可自动化的部分**，真实安装流程留给发布前人工核对。把做不到的事写成通过标准，只会让验收从第一天起就不可能成立。
- **单包内含两个示例**：`packages/examples-browser-e2e` 下设 `apps/vue/` 与 `apps/react/`，沿用 vite-adapter 的 `browser-tests/app/` 模式，不改 `pnpm-workspace.yaml` 的 `packages/*`。
- **覆盖 React 侧的移交缺口，不覆 Vue 3.4**。后者需要第二套 `vue@3.4.x` fixture，与示例展示推荐用法相冲突。
- **新增 `react-dom@19.3.0`**，仅作示例包的 devDependency。
- **不引入框架 Vite 插件**：JSX 与 Vue 渲染函数经实测均可由 Vite 8 自身处理。

## 修订：完整更新提示参考实现（项目所有者确认，2026-09-21）

平台仍不渲染任何界面（ADR-0005、ADR-0013 不变）；本修订只把两个示例的更新提示从单个按钮扩成接入方可照抄的完整交互，并补一篇接入指南。不修改任何已交付包。

- **横幅而非模态**：`updateWaiting` 为真时在页面顶部显示 `role="status"` 的横幅，文案 `A new version is available`，含 **Update**（保留 `#apply-update`）与 **Later** 两个按钮。Later 只在当前页面隐藏横幅，等待中的 worker 不受影响。
- **确认中**：点击 Update 后按钮显示 `Updating…` 并禁用，直到 `applyUpdate()` 结束。
- **接管后提示刷新**：`applyUpdate()` 成功后，`#apply-update` 消失，横幅改为 `Reload to use the new version` 与 **Reload** 按钮；只有用户点击时才重新加载。示例与平台都不自动刷新（V1 验收矩阵）。
- **同 scope 其他标签页**：本页未点击、但 `updateWaiting` 由真变假时，按状态机它只可能来自 `update-applied`，本页同样显示 Reload 提示。
- **失败**：`applyUpdate()` 抛错（10 秒内未接管）时显示 `Update failed` 与 **Retry**。
- **定时检查**：两个示例启用 `updateCheck: { intervalMs: 1_800_000 }`（30 分钟），示范推荐配置；此后部署的测试站会按该间隔请求 worker 脚本。
- 两个示例保持相同的元素 id、文案与行为；新增 id 为 `#update-banner`、`#update-later`、`#update-reload`、`#update-error`、`#update-retry`。样式只用少量内联样式，不新增依赖。
- **验证**：E2E 增加确认页出现 Reload 提示、同 scope 另一页出现 Reload 提示、点击 Reload 后显示 v2、Later 隐藏横幅且 worker 仍在等待，各配一次变异检查。失败路径无法在真实浏览器稳定复现，列入已知限制。
- 接入指南写在 `docs/guides/update-prompt.md`，并同步 README 与文档基线。

### 补充修订：区分“页面已是新代码”（项目所有者确认，2026-09-22）

drill 现场演示发现：示例的应用壳导航为 `network-first`，在线时普通刷新即从网络取得新 HTML 与新入口脚本，而新 worker 仍在等待。此时“有新版本”“刷新以使用新版本”都与页面实际不符。

- **判定**：`updateWaiting` 为真时，示例以 `fetch(SHELL_URL, { cache: "no-store" })` 取最新应用壳，提取入口模块脚本地址，与当前文档的入口脚本地址比较。相同即“页面已是新代码”；不同、请求失败、无法解析或 **5 秒内未完成**一律按“页面是旧代码”处理（保守，维持原行为）。横幅在判定完成前不显示，超时保证它不会因请求挂起而永远不出现。
- **页面已是新代码**：横幅文案为 `An update is ready for offline use`，仍需用户点击 Update（`#apply-update`）或 Later；接管成功后横幅消失，不显示 `#update-reload`。
- **页面是旧代码**：维持原流程（`A new version is available` → Update → `Reload to use the new version`）。
- **不自动接管**：即使页面已是新代码，新 worker 仍保持等待直至用户确认（V1 验收矩阵）。
- **验证**：新增 E2E——Later 后刷新，页面为 v2、横幅为离线文案；点击 Update 后横幅消失、无 `#update-reload`、注册中无 waiting；配一次变异检查。原有旧页面确认后出现 Reload 的断言不变。
- 已知代价：出现等待中的更新时，每个页面额外请求一次应用壳；请求挂起时横幅最多延迟 5 秒出现。
- **验证（超时）**：E2E 拦住页面对应用壳的 `fetch` 不作应答，断言横幅约 5 秒后以旧代码文案出现，且拦截确实命中；变异检查把超时改为 60 秒后该用例失败。

## 修订：示例接入入口恢复（2026-09-23，已评审通过）

### 起因

[pwa-entry-resilience](pwa-entry-resilience.md) 的[入口恢复演练](../docs/operations/entry-recovery-drill.md)要求在类生产环境执行一次，而两个示例应用都没有接入该模块：仓库中唯一提到它的地方是一条注释。[ADR-0033](../docs/adr/0033-entry-manifest-supplied-by-the-application.md) 把清单的取得交给业务应用之后，示例正好可以充当"业务方怎么接"的参考实现，并为演练提供被测站点。

### 已确认的前提（项目所有者，2026-09-23）

- **两个示例在代码层面同时接入**，保持既有的"两站配置逐项相同"原则；**但本次只重新部署 React 的 `drill` 槽位**，Vue 的 `drill` 站保持现状，只作为备用入口的目标 Origin 使用（它不需要接入本模块）。
- **不碰 `main` 槽位与生产站。** 演练全部在 `drill` 进行，符合部署契约第 7 条。
- **页面钩子常驻**：示例暴露 `window.__entryUpdate`，供演练驱动反复交入清单而不必重新部署。风险如实登记（见下）。
- **"当前 Origin 不可达"以客户端级拦截模拟**，等效于改 hosts；记录中标注为模拟，不声称真实域名故障。

### 契约增量

**示例应用**

- 两个示例的 Vite 配置在 `pwa()` 之外并列 `pwaEntryResilience({ identity, maxValidityDays: 30 })`；`identity` 与 `pwa()` 使用同一对象。
- 共用的 `POLICY` 增加一条恢复页的资源规则，路径 `/pwa-entry.html`（mount 相对）。两站同时生效；对未部署本次构建的站点没有影响。
- **清单来源做成真实形态**：应用启动时以自身的请求逻辑 `fetch` 同源的 `<mountPath>entry-manifest.json`，解析后调用 `updateEntryManifest(data)`。该文件随站点发布，模拟业务后端接口；请求失败、404 或解析失败都不得让应用报错或中断启动。
- **页面钩子**：`window.__entryUpdate = (data) => updateEntryManifest(data)` 与 `window.__entryCheck = (options) => checkEntryRecovery(options)` 常驻暴露。
- 页面上增加一块状态显示：当前 `checkEntryRecovery()` 的 `kind` 与 `status`，便于肉眼核对；不显示任何备用 Origin 地址（页面侧 API 本就不返回它）。
- **跨模块影响：Cloudflare 上传白名单。** `scripts/build-cloudflare-site.mjs` 按显式白名单校验上传目录，新增的 `app/pwa-entry.html` 与 `app/entry-manifest.json` 必须登记进去，否则构建在写盘后被拒（2026-09-23 实测拒绝信息 `Unexpected upload file: app/entry-manifest.json`）。两者登记为**必需**而非仅允许：这样一旦某次构建漏掉 `pwaEntryResilience()`，构建会失败，而不是静默发布一个没有恢复入口的站点。此项属 [cloudflare-test-deployment](cloudflare-test-deployment.md) 的部署契约。**白名单共有四处执行点**：`build-cloudflare-site.mjs`（构建产物）、`package-cloudflare-site.mjs`（发布包）、`deploy-cloudflare-site.mjs`（上传目录）、`restore-cloudflare-site.mjs`（从发布包恢复），四处都要登记，否则会在链路后段才失败。只有构建脚本把两者登记为**必需**（该处插件由配置保证存在，漏配即构建失败）；其余三处登记为**允许**，使接入之前打的发布包与暂存目录仍可恢复、仍可部署。本修订不改变其余白名单规则。

**演练站点**

- 演练站点为 React 的 `drill` 槽位（`https://drill.pwa-platform-react-demo.pages.dev`，身份 `pwareactdrill`／环境 `test`）。
- 备用入口指向 Vue 的 `drill` 地址，`startPath` 为 `/app/`。两站身份不同，这不影响备用入口的作用。

### 安全边界（如实登记）

- **常驻的 `window.__entryUpdate` 允许任何访问者向自己的浏览器交入一份清单。** 影响仅限该访问者自己的浏览器，且入口必须是 HTTPS、必须由他本人在恢复页上点击才会跳转；示例站点不承载真实用户。生产应用**不应**暴露这样的钩子。
- 示例站点上的 `entry-manifest.json` 是公开静态文件，不含任何敏感数据。

### 本修订不做的事

- 不改 `pwa-entry-resilience` 的实现；本模块只是使用方。
- 不部署 Vue 的 `drill`，不碰两站的 `main` 槽位与生产内容。
- 不做真实域名故障、不动 DNS 或 Cloudflare 项目配置。
- 不发布 npm 版本。

### 测试策略增量

- **单元／构建测试**：React 与 Vue 的构建产物都包含恢复页 `pwa-entry.html` 与其指纹脚本；计划中含 `/pwa-entry.html` 的资源规则；`entry-manifest.json` 缺失或非法时应用仍正常启动（不抛出、不白屏）。
- **真实运行（类生产演练）**：经项目所有者同意后部署 React 的 `drill`，按[入口恢复演练](../docs/operations/entry-recovery-drill.md)执行第 1–6 步，Chrome 桌面 N 与 N-1 各一遍；第 7 步（与恢复 worker 共存）留待下次恢复演练同场执行。驱动脚本与证据存于仓库外 `pwa-release-records/`，脚本记哈希。演练记录写入 [pwa-entry-resilience 的验证记录](../tasks/pwa-entry-resilience/verification.md)，本模块验证记录交叉引用。

### 验收标准增量

- 两个示例的构建产物都含恢复页；两站配置除根目录外仍逐项相同。
- React 的 `drill` 站上，演练第 1–6 步在 N 与 N-1 下全部通过，记录标注"当前 Origin 不可达为客户端级模拟"。
- 演练期间 `main` 槽位与生产站未发生任何写操作。

## 修订：React 示例的 Push 演示（2026-09-24，已评审通过）

### 起因

[push-module 的证据收尾修订](push-module.md)需要一个同时具备真实平台 worker 和 `@pwa-platform/push` 页面入口的站点，来证明真实订阅与真实送达。只有示例应用满足这个条件。目标、前提与验收标准以该修订为准，本节只记录示例这一侧的契约增量。

### 契约增量

- **只改 React 示例。** 这偏离了"两站配置逐项相同"的原则，由项目所有者在 2026-09-24 决定接受：演示页是参考写法和测试载体，不改变两站的 PWA 配置（`identity`、`POLICY`、Vite 插件参数都不变）。两站的差异只在应用界面上。
- 示例包新增 workspace 依赖 `@pwa-platform/push`，只在 React 应用中使用。
- **演示面板**显示 `getPushState({ scope })` 的结果，提供 VAPID 公钥输入框、订阅与取消订阅按钮、"复制订阅 JSON"按钮。订阅只在按钮点击时发起，页面不渲染 endpoint。浏览器不支持时显示 `unsupported`，不影响页面其余部分。
- **包内测试工具**（不导出，示例包本就私有）：测试用发送器、联网套件的独立 Playwright 配置和 `test:browser:network` 脚本，以及 `push:keys`、`push:send` 两个脚本。`.push-demo/` 加入 git 忽略。
- 不新增静态文件，Cloudflare 上传白名单不受影响。

### 安全边界（如实登记）

- 演示面板随下次部署出现在公开的测试站上。访问者只能订阅自己的浏览器；站点没有后端，也不保存订阅。
- VAPID 私钥只存在于本机被忽略的 `.push-demo/vapid.json` 中，或在联网套件的内存中临时生成，不进入仓库和日志。

### 验收标准增量

- React 与 Vue 示例既有的构建测试和浏览器测试全部通过，且未修改。
- 联网套件的 4 个场景见 push-module 修订。

## 修订：示例接入离线页、manifest 扩展字段与网络超时（2026-09-24，已评审通过）

### 起因

2026-09-24 合入的三项能力——平台默认离线页（[ADR-0036](../docs/adr/0036-platform-default-offline-page.md)）、manifest 扩展字段（[ADR-0037](../docs/adr/0037-install-metadata-manifest-members.md)）与网络超时（[ADR-0038](../docs/adr/0038-network-timeout.md)）——只在各自包的测试夹具中验证过。示例应用是业务接入的参考写法，也是 Cloudflare 测试站的内容，应当用上它们，并在两种框架的真实构建上再验证一次。

### 已确认的前提（项目所有者，2026-09-24）

1. 两个示例改法相同，继续遵守"两站配置逐项相同"：三项都写在共用的 `apps/shared/identity.ts` 或两边相同的插件选项里。
2. 离线页改由插件生成：删除两个 `public/offline.html`，开启 `offlinePage: { locale: "en" }`。路径仍是 `/app/offline.html`。
3. 共用策略写入 `networkTimeoutSeconds: 5`。Cloudflare 测试站下次部署后在弱网下的行为随之改变：挂起约 5 秒后显示离线页或应用壳。
4. 安装元数据增加 `description`、一个快捷方式、一张 `wide`（1280x800）与一张 `narrow`（750x1334）截图。
5. 本修订不重新部署 Cloudflare；下次部署自然带上。
6. Nuxt 示例不在范围内（离线页选项不支持 Nuxt）。

### 契约增量

- **离线页**：两站的 `pwa()` 增加 `offlinePage: { locale: "en" }`；`public/offline.html` 删除。策略中离线页的资源规则保持不变。
- **网络超时**：共用 `POLICY` 增加 `networkTimeoutSeconds: 5`。
- **安装元数据**：共用 `INSTALL` 增加
  - `description`：一句英文说明；
  - `shortcuts`：一项，`url` 为 `/app/`（示例只有一个路由，这一项演示写法，复用既有 192 图标）；
  - `screenshots`：`/app/screenshots/wide.png`（1280x800，`formFactor: "wide"`）与 `/app/screenshots/narrow.png`（750x1334，`formFactor: "narrow"`），均为 `image/png`，带 `label`。
- **截图文件**：用 Playwright 对各自示例的首页真实截取，React 与 Vue 各一套，放在各自的 `public/screenshots/`。截图是提交进仓库的静态记录，不随源码自动更新；截取方法写进验证记录。
- **Cloudflare 脚本白名单**：`scripts/build-cloudflare-site.mjs`、`scripts/package-cloudflare-site.mjs`、`scripts/deploy-cloudflare-site.mjs`（以及 `restore-cloudflare-site.mjs` 若有同样的白名单）允许 `app/screenshots/(wide|narrow).png`，**允许但不强制**，与图标的写法一致；登记记入 [cloudflare-test-deployment](cloudflare-test-deployment.md)。
- `installForCloudflare` 与 `identityForCloudflare` 不变；Cloudflare 构建同样带上上述字段。

### 测试策略增量

- `offline.spec.ts`：未缓存路由的断言改为针对生成页——标题为 "You're offline"，页面显示 `install.name`，且不出现应用壳。
- 新增网络超时场景（两站各一）：安装并受控后，用 `context.route` 挂起一个未缓存路由的导航，不放行；断言显示离线页，且耗时不少于 4.5 秒（证明是超时而非失败）、不超过 15 秒。
- `install.spec.ts`：manifest 带有 `description`、`shortcuts`、`screenshots` 且与声明一致；每张截图可从构建站点取得，是 PNG，头部尺寸与 `sizes` 一致（沿用图标的检查方式）。
- Cloudflare 脚本：白名单测试（若脚本有测试）补截图的允许与"其他新文件仍被拒绝"两例。
- 其余既有构建测试与浏览器测试不修改、全部通过。

### 验收标准增量

- 两站构建通过，产物检查（含 `verify.manifest-asset-missing`）通过。
- 上述浏览器场景在本机 Chrome 桌面端通过；新增超时场景 `--repeat-each 5` 稳定。
- 变异：示例未开启 `networkTimeoutSeconds` 时超时场景转红；删除一张截图时构建失败。
- Cloudflare 构建脚本对新产物不报错；对白名单外的新文件仍报错。

## 已知限制

- **Chrome Android 未执行**：本模块没有测试设备，[浏览器矩阵](../docs/architecture/browser-matrix.md)的 Android 必测项（N 与 N-1）继续作为已知限制。[ADR-0010](../docs/adr/0010-real-browser-verification-with-playwright.md)把决定权留给"第一个具备测试设备的运行时模块"，并指出 Playwright 的 Android 支持会忽略离线等上下文选项、**可能让测试误报通过**——这对以离线验证为核心的本模块尤其危险，因此即便取得设备也需先验证该风险。
- **桌面端 N-1 未执行**：需要本机备有上一主版本的 Chrome，获取它属于下载，未经授权不执行。
- **上述两项使本模块的验收不完整**：V1 验收矩阵第 6 行的证据因此尚未齐全，发布前必须补齐。文档基线中本模块一行保持 `target`。
- **真实安装流程无法自动化**：完成安装并以 `display-mode` 启动需要驱动浏览器原生界面。`beforeinstallprompt` 本身还依赖 Chrome 的用户参与度启发式，在自动化环境中未必触发；未触发时按"未取得"登记。
- **参考档与渐进兼容档未执行**：Edge、Safari、Firefox 均未验证，按浏览器矩阵它们不阻塞发布，但差异说明尚缺。
- **Vue 3.4 的清理缺口不在本模块覆盖范围**，仍记在 vue-react-adapters 名下。
- **更新失败路径未经 E2E 验证**：`applyUpdate()` 超时需要新 worker 迟迟不接管，真实浏览器中无法稳定制造；`Update failed`／Retry 只经代码审阅，不计为浏览器证据。

## 开放问题

- **Chrome Android 何时、由谁验证。** 按 ADR-0010 应由第一个具备测试设备的模块决定运行方式，而至今没有模块具备设备。若 v1 发布前仍无设备，需要项目所有者决定：采购设备并按依赖变更流程审批驱动来源、修订浏览器矩阵的必测范围（须立 ADR），还是接受 V1 验收矩阵第 6 行的证据不完整而发布。**本模块不替这个决定做主，只把缺口如实登记。**

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 示例服务于验证，不改变产品范围。 |
| architecture | follow | 不新增分层。 |
| developer-entry | update | README 指向示例与接入指南。 |
| capability-map | update | 示例模块与其依赖登记在能力图中。 |
| decisions | follow | 示例遵循既有 ADR，本模块不产出新的架构决定。 |
| lifecycle-and-recovery | follow | 示例演示既有生命周期，不改变其定义。 |
| ci-baseline | follow | 不改变 CI 工作流。 |
| supply-chain | follow | 不新增第三方依赖。 |
| browser-matrix | follow | 按既有矩阵执行，未取得项记在验证记录。 |
| v1-acceptance | update | V1 验收矩阵中的浏览器场景由本模块的示例与 E2E 提供证据。 |
| identity-release-baseline | follow | 示例身份遵守冻结规则。 |
| release-and-incident | follow | 不改变发布与事故流程。 |
| recovery-drill | follow | 恢复演练由平台治理与 Cloudflare 模块承担。 |
| browser-release-evidence | follow | 证据模板由该模块定义，示例只按其填写。 |
| package-distribution | follow | 示例包保持私有，不进入分发范围。 |
| cloudflare-test-deployment | follow | 部署契约由该模块定义；2026-09-23 与 2026-09-24 的站点文件白名单登记记在该模块的规格与脚本中。 |
| browser-test-harness | follow | 使用既有 harness，不改变其公开面。 |
| workbox-engine | follow | 不触及引擎端口。 |
| sw-runtime | follow | 不改变 worker 行为。 |
| offline-write-extension | follow | 示例不启用离线写队列。 |
| build-verifier | follow | 不改变发布检查；核验工具的修订记在 cloudflare-test-deployment。 |
| release-gate-contract | follow | 不改变覆盖判定。 |
| local-ci-record | follow | 不改变门禁记录模板。 |
| release-orchestration-protocol | follow | 不改变外部发布协议。 |
| vite-adapter | follow | 示例是其使用方，不改变插件契约。 |
| client-runtime | follow | 示例是其使用方，不改变页面侧协议。 |
| vue-react-adapters | follow | 示例是其使用方，不改变绑定公开面。 |
| examples-browser-e2e | create | 本模块自身的事实源：规格、更新提示接入指南与验证记录。 |
| pwa-entry-resilience | follow | 2026-09-23 示例接入该模块；其契约与文档由该模块维护。 |
| ssr-adapters | follow | Nuxt 示例归该模块。 |
| shared-origin-topology | follow | 示例为独立源拓扑。 |
| push-module | follow | 示例不启用 Push。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
