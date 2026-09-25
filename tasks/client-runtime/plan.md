# 实现计划：client-runtime

## 概览

按 [spec/client-runtime.md](../../spec/client-runtime.md) 交付私有包 `@pwa-platform/client-runtime`，包含以下几部分：

- **构建期入口**：从 `PwaPlan` 生成精简的 `PwaClientConfig`。
- **页面 facade**：注册、安装引导、确认更新、登出注销。
- **生命周期事件**：页面侧可观察的四个事件，用 contracts 的信封发出。

先在单元测试层用假的 `ServiceWorkerContainer` 覆盖全部状态机分支，再用 Chrome 桌面端的浏览器自测对接真实的平台 worker，验证 V1 验收矩阵中页面一侧的场景。

## 架构决定

- **入口与依赖边界**：
  - `.`（页面运行期）依赖 contracts 与 `@pwa-platform/sw-runtime/messages`，不含 Node 模块；
  - `./build`（构建期）只依赖 contracts，不含 DOM 专有 API。
  - 两个入口都不导入 sw-runtime 的 worker 入口，由导入闭包测试守护。
- **容器注入**：facade 接受可选的 `ServiceWorkerContainer`，默认取 `navigator.serviceWorker`。这样全部状态机分支可以在 Node 中用假容器逐条测试，浏览器自测只验证与真实 worker 的协议。
- **事件发出**：facade 内部维护订阅者列表，事件信封在发出前经 contracts 的字段约定构造；测试用 `readLifecycleEvent` 反向校验每个信封。
- **不重新加载页面**：`applyUpdate()` 只发送确认消息并等待 `controllerchange`。验收矩阵要求"不得全局强制刷新"，是否 reload 由应用决定。单元测试断言代码路径中不存在任何重载调用。
- **浏览器自测**：沿用 sw-runtime 的做法。globalSetup 用 vite 8.3.0 打包 sw-runtime 的平台 worker 入口脚本，注入 fixture 计划与配置，生成 v1 与 v2 两个站点版本；页面侧加载本包的构建产物。

## 任务定义

### 任务 1：包骨架、构建期配置与依赖边界

**说明：** 建立包结构与两个入口，实现 `createClientConfig`，并用测试守护依赖边界。

**验收标准：**

- `package.json` 声明两个导出 `.` 与 `./build`。包为私有，`files` 只含 `dist`。运行时依赖只有 contracts 与 sw-runtime（`workspace:*`）。
- 页面运行期与构建期的 tsconfig 与构建脚本可用，build、typecheck、test 通过。
- `createClientConfig` 先用 `validatePlan` 校验计划，字段与来源和规格一致：`appId`、`scope`、`serviceWorkerUrl`、`updateMode` 取自身份与计划，`installEnabled` 为 `plan.install !== null`。计划无效时抛错，信息只含诊断码与路径，不回显输入。
- 输出确定，与计划的键顺序无关。
- 依赖边界测试按 TypeScript 语法树读取导入，自检使用真实的判断条件：`.` 不含 Node 模块，`./build` 不含 DOM 专有 API，两者都不导入 sw-runtime 的 worker 入口。

**验证：**

- `pnpm --filter @pwa-platform/client-runtime test` 与 `typecheck` 通过，`pnpm install` 不新增 lockfile 包条目。
- 变异检查：跳过计划校验；`installEnabled` 恒为真；让 `.` 的闭包导入 sw-runtime 的 worker 入口。

**依赖：** 无。

**预计范围：** M（包配置、tsconfig、构建期入口、边界测试）。

### 任务 2：facade 骨架、配置校验与注册

**说明：** 实现 `createPwaClient` 与 `register()`，建立订阅机制与 `dispose()`。

**验收标准：**

- `createPwaClient` 校验配置形态，字段缺失或类型不对时抛错。
- `register()` 以 `config.serviceWorkerUrl` 注册、`scope` 为 `config.scope`；重复调用返回同一次注册，不重复注册。
- `subscribe()` 返回取消订阅函数；`dispose()` 之后不再发出任何事件，且已注册的监听全部移除。
- `registered` 事件在注册成功后发出，`metadata` 为 `{ scope }`。
- 注册失败时抛错，不发出事件。

**验证：**

- 单元测试用假的 `ServiceWorkerContainer` 覆盖成功、失败、重复调用、取消订阅与 `dispose`。
- 变异检查：重复调用时重复注册；`dispose` 后仍向订阅者推送；注册用的 scope 取自 `serviceWorkerUrl` 而非 `scope`。

**依赖：** 任务 1。

**预计范围：** M（facade 骨架、事件机制与测试）。

### 任务 3：安装引导

**说明：** 拦截并保存 `beforeinstallprompt`，实现 `promptInstall()`。

**验收标准：**

- 收到 `beforeinstallprompt` 时调用 `preventDefault` 并保存事件，发出 `install-eligible`。
- `promptInstall()` 在有保存的提示时触发它并等待用户选择，返回 `"accepted"` 或 `"dismissed"`；没有保存的提示时返回 `"unavailable"`，不抛错。
- 提示被消费后不再重复使用：第二次调用返回 `"unavailable"`。
- 收到 `appinstalled` 时发出 `installed`。
- 未调用 `promptInstall()` 时，facade 绝不自行触发提示。

**验证：**

- 单元测试用假事件覆盖接受、取消、无提示、重复调用与事件顺序。
- 变异检查：不调用 `preventDefault`；提示消费后仍可重复触发；收到事件时自动触发提示。

**依赖：** 任务 2。

**预计范围：** S（安装引导与测试）。

### 任务 4：确认更新与登出

**说明：** 实现 `applyUpdate()` 与 `logout()`，并发出 `update-waiting`。

**验收标准：**

- 注册出现 `waiting` 的 worker 且页面已被另一个 worker 控制时，发出 `update-waiting`；首次安装（页面未被控制）不发。
- `applyUpdate()` 在有等待中的 worker 时，向它发送 sw-runtime 的 `SKIP_WAITING_MESSAGE` 并等待 `controllerchange`，返回 `true`；没有等待中的 worker 时返回 `false`，不发送消息。
- `applyUpdate()` 的任何路径都不重新加载页面。
- `logout()` 注销本应用的注册并返回 `true`；没有注册时返回 `false`。任何路径都不删除缓存。
- 确认消息使用 sw-runtime 导出的常量，本包不另造消息形态。

**验证：**

- 单元测试覆盖有无等待 worker、有无注册、消息内容与 `controllerchange` 等待。
- 变异检查：自造消息字面量而不用常量；无等待 worker 时也发消息；`logout` 顺带删除缓存；`applyUpdate` 后调用 `location.reload`。

**依赖：** 任务 2。

**预计范围：** M（更新与登出路径、测试）。

### 检查点：facade 契约

- 四个事件与四个方法在单元层都有成立与不成立两类测试，变异检查已完成。
- 向项目所有者汇报 facade 形态与事件信封后，再进入浏览器自测。

### 任务 5：浏览器自测基础、注册与事件序列

**说明：** 建立对接真实平台 worker 的浏览器自测流程，验证首次在线访问与事件顺序。

**验收标准：**

- globalSetup 用 vite 8.3.0 打包 sw-runtime 的平台 worker 入口脚本，注入 fixture 计划与配置，生成 v1 与 v2 两个站点版本，输出目录被 git 忽略。
- fixture 页面加载本包产物，创建 facade 并把发出的事件收集到页面变量中。
- 首次在线访问：`register()` 之后注册的 scope 等于身份 `scope`，活动 worker 的脚本 URL 等于 `serviceWorkerUrl`。
- 收集到的事件用 `expectLifecycleSequence` 断言类型顺序，每个信封都能通过 `readLifecycleEvent`。

**验证：**

- `pnpm test:browser --filter @pwa-platform/client-runtime` 在本地 Chrome 通过，并重复运行确认稳定。
- 变异检查：注册时传错 scope；事件信封缺少 `appId`。

**依赖：** 任务 3、任务 4。

**预计范围：** M（Playwright 配置、globalSetup、fixture 站点、浏览器自测）。

### 任务 6：更新提示与登出的浏览器自测

**说明：** 在 Chrome 中验证提示更新的完整流程与登出注销。

**验收标准：**

- **发现更新**：
  - 部署 v2 后发出 `update-waiting`，新 worker 保持等待；
  - 确认之前，已打开页面没有被重新加载（用页面标记验证）；
  - 调用 `applyUpdate()` 后新 worker 接管页面（`waitForControllerChange`），页面**仍未**被重新加载。
- **登出**：
  - `logout()` 之后注册消失，页面不再被任何 worker 控制；
  - `appCachePrefix` 下的缓存名与条目数与登出前完全一致（用 `snapshotCaches` 与 `diffCacheSnapshots` 比对），证明登出不删缓存。

**验证：**

- 浏览器自测通过并重复运行确认稳定。
- 变异检查：`applyUpdate` 后重新加载页面；`logout` 删除 `appCachePrefix` 下的缓存。

**依赖：** 任务 5。

**预计范围：** M（v2 fixture 与浏览器自测）。

### 任务 7：ADR-0013 与文档同步

**说明：** 记录本模块的架构决定，并同步相关文档。

**验收标准：**

- 新增 `docs/adr/0013-client-facade-and-page-side-lifecycle-events.md`，记录以下决定：
  - 公开形态是工厂函数返回的 facade 对象；
  - 本期只发页面侧可观察的四个事件，worker 侧三个事件的接入需要新 ADR；
  - 登出清理只注销注册、不删除任何缓存，以及该结论与安全模型、路线图的关系；
  - 配置由构建期从 `PwaPlan` 生成；
  - `applyUpdate()` 不重新加载页面。
- `docs/architecture/package-boundaries.md` 写明 client-runtime 两个入口的依赖边界，以及它使用 sw-runtime 的消息常量。
- `README.md` 与 `docs/DOCUMENTATION-BASELINE.md` 同步；能力图的修订（依赖加 `sw-runtime`、build order 调整）已随本模块落地。

**验证：**

- 相对链接能解析；文档中的模块名都来自能力图。
- ADR-0013 与 ADR-0004、ADR-0005、ADR-0012 及规格一致。

**依赖：** 任务 6。

**预计范围：** S（ADR-0013、包边界、README、文档基线）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0013 的写法之后，再进入模块质量门禁。

### 任务 8：client-runtime 模块质量门禁

**说明：** 完成模块级验证、独立评审与 CI 实跑证据。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅，重点包括：事件 `metadata` 是否可能带入敏感值、facade 是否泄漏监听、确认更新是否绕开用户确认、登出是否动了缓存、文档一致性。阻断项与应修项已处理。
- 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让本模块浏览器自测失败的提交使 browser job 报红，撤销后恢复为绿，证据在合并前取得。
- 结果写入 `tasks/client-runtime/verification.md`，并注明 Chrome Android 与桌面端 N-1 尚未执行的原因。

**验证：**

- 干净 worktree 的命令输出；
- spec-guard 产物校验；
- CI 运行链接、结论、Node 与 Chrome 版本。

**依赖：** 任务 7。

**预计范围：** M（验证记录与评审修复）。

## Task List

> Tasks tracked in GitHub Issues #4

### Phase 1：facade 契约

- #71 包骨架、构建期配置与依赖边界
- #72 facade 骨架、配置校验与注册（blocked by #71）
- #73 安装引导（blocked by #72）
- #74 确认更新与登出（blocked by #72）

### Phase 2：浏览器验证

- #75 浏览器自测基础、注册与事件序列（blocked by #73、#74）
- #76 更新提示与登出的浏览器自测（blocked by #75）

### Phase 3：交付

- #77 ADR-0013 与文档同步（blocked by #76）
- #78 模块质量门禁（blocked by #77）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `beforeinstallprompt` 在测试环境中不会自发触发 | 中：安装引导的浏览器证据不完整 | 单元测试用假事件覆盖全部分支；浏览器自测中若 Chrome 未触发该事件，记为已知限制并说明，不伪造事件冒充真实证据 |
| `update-waiting` 的时序：`updatefound` 与 `waiting` 之间存在竞态 | 中：事件可能漏发或重复 | 同时监听 `updatefound` 与注册状态，发出前去重；浏览器自测重复运行确认稳定 |
| `applyUpdate()` 等待 `controllerchange` 可能永不返回 | 中 | 等待带超时并返回明确结果；单元测试覆盖超时路径 |
| 页面侧事件与 worker 真实状态不完全对应 | 中 | 规格与 ADR-0013 写明本期事件集合的边界；worker 侧三个事件列为已知限制 |
| 登出后其他标签页仍被旧 worker 控制 | 低 | `unregister()` 的语义是现有客户端继续被控制到关闭为止；浏览器自测只断言本页面不再被控制，并在规格中说明 |
| 桌面端 N-1 与 Chrome Android 暂时无法执行 | 中：浏览器矩阵的必测项不完整 | 验证记录写明未执行的原因；获取 N-1 需要下载时先询问 |

## 执行顺序

任务 1 → 任务 2 → 任务 3、任务 4（可并行）→ 检查点"facade 契约" → 任务 5 → 任务 6 → 任务 7 → 检查点"交付前" → 任务 8。每个任务一个提交，提交信息带 `Closes #<task>`。

---

## 修订计划：主动检查更新（2026-09-18）

按 [spec/client-runtime.md 的同名修订](../../spec/client-runtime.md#修订主动检查更新2026-09-18已评审通过)，给已交付的 facade 与 Vue/React 绑定加入 `checkForUpdate()` 与可选的自动检查。原任务 1–8 已交付，不重开。

> 任务用本地编号 U1–U6 记录。远程仓库当前不可用，不建 issue；提交信息用 `Task: U<n>` 标注，不写 closing keyword。远程恢复后按本表补建 issue，并把编号回填到这里。

### 与并行模块的协调

本修订与 [shared-origin-topology](../../spec/shared-origin-topology.md)（spec-guard 当前的活跃模块）并行开发，2026-09-18 核对的结论如下：

- **工作目录**：本修订在独立的 worktree `../pwa-platform-client-update-check`、分支 `feat/client-update-check` 上开发，不进入主目录。
- **代码不重叠**：对方改 contracts、core、sw-runtime、build-verifier、vite；本修订只改 client-runtime、vue、react。对方对 contracts 与 sw-runtime 的改动是新增，本修订的测试夹具不用新拓扑。
- **ADR 编号**：ADR-0019 已由对方占用（同源登记表与 `exclude`），本修订使用 ADR-0020。
- **共用文档**：`README.md`、`docs/architecture/package-boundaries.md`、`docs/DOCUMENTATION-BASELINE.md` 两边都会改，因此 U5 放在最后，后合入的一方变基解决冲突。
- **spec-guard**：不切换活跃模块。
- **门禁时机**：U6 要等 shared-origin-topology 合入 `main`、本分支变基之后再跑，确保质量门禁基于包含对方改动的代码。

### 架构决定

- **只触发，不检测**：`checkForUpdate()` 只调用 `registration.update()`。新版本的发现与 `update-waiting` 的发出，全部复用 `watchForUpdates` 现有的 `updatefound` → `statechange` 路径，去重规则不变。
- **自动检查挂在注册上**：计时器在 `register()` 成功后启动、`logout()` 时停止，与 `stopWatching` 同生命周期；计时器与可见性监听都经 `track` 登记，`dispose()` 能全部撤销。
- **运行期选项，不进配置**：`updateCheck` 放在 `PwaClientOptions`，不进 `PwaClientConfig` 或 `PwaPolicy`，因此构建期入口、contracts 与 vite-adapter 都不动。
- **可见性注入**：新增 `document` 选项，与 `container`、`target` 对称；单元测试用假 `document` 与 Vitest 假计时器覆盖全部时序分支，浏览器自测用 Playwright 的 `page.clock` 快进时间。

### 任务定义

#### U1：`checkForUpdate()`

**说明：** 在 facade 上实现手动检查，导出 `PwaUpdateCheckResult`。

**验收标准：**

- 没有注册返回 `"unavailable"`；`update()` 兑现后 `installing` 或 `waiting` 不为空返回 `"update-available"`，否则返回 `"up-to-date"`。
- `update()` 拒绝时错误原样抛出，不发事件；并发调用共享同一次检查；`dispose()` 之后调用抛错。
- 检查路径不发送 `SKIP_WAITING_MESSAGE`、不重新加载页面。

**验证：**

- `pnpm --filter @pwa-platform/client-runtime test` 与 `typecheck` 通过。
- 变异检查：返回值判定只看 `waiting`；去掉并发合并；吞掉 `update()` 的错误。每一项都应让测试失败。

**依赖：** 无。

**文件：** `packages/client-runtime/src/client/facade.ts`、`src/client/index.ts`、对应单元测试。

**预计范围：** S。

#### U2：自动检查（`updateCheck` 与 `document` 注入）

**说明：** 实现默认关闭的定时检查，页面隐藏时跳过，回到可见时补检。

**验收标准：**

- `intervalMs` 不是整数或不在 60 000 到 2 147 483 647 之间时，`createPwaClient` 抛错；未启用时不读取全局 `document`。
- `register()` 成功后开始计时，链式计时不重叠；隐藏时跳过并记为欠一次，回到可见时若欠着一次或已满间隔，立即检查。
- 失败被吞掉，不留下未处理的拒绝，下个周期继续；`logout()` 停止，再次 `register()` 重新开始；`dispose()` 撤销计时器与监听。

**验证：**

- 单元测试使用 Vitest 假计时器与假 `document`，并断言没有未处理的 Promise 拒绝。
- 变异检查：隐藏时照常检查；失败时向外抛出；`logout` 后不停；`dispose` 不撤销可见性监听。每一项都应让测试失败。

**依赖：** U1。

**文件：** `packages/client-runtime/src/client/facade.ts`、单元测试（必要时把调度逻辑拆到 `src/client/update-check.ts`）。

**预计范围：** M。

#### 检查点：facade 增量

- 单元测试与变异检查全部完成；原有测试不改动也全部通过，证明对原有行为向后兼容。
- 向项目所有者汇报 facade 增量之后，再改绑定。

#### U3：Vue 与 React 绑定

**说明：** 让两个绑定转发 `checkForUpdate`，增加 `updateCheck` 选项。

**验收标准：**

- `PwaMethods` 含 `checkForUpdate`；服务端渲染时的 `SERVER_METHODS` 加入它，调用以 `SERVER_RENDERING_ERROR` 拒绝。
- Vue 的 `createPwa({ config, updateCheck })` 与 React 的 `<PwaProvider updateCheck>` 把选项传给 facade；同时传入 `client` 时抛错。
- React effect 的依赖是 `updateCheck?.intervalMs`，每次渲染都新建选项对象也不会重建 facade。
- 两份状态机不变，一致性测试通过。

**验证：**

- `pnpm --filter @pwa-platform/vue test`、`pnpm --filter @pwa-platform/react test` 与 `typecheck` 通过；`examples-browser-e2e` 中服务端渲染的一致性测试通过。
- 变异检查：服务端不拒绝；`client` 与 `updateCheck` 同时传入时静默忽略；React 以对象作为依赖。每一项都应让测试失败。

**依赖：** 检查点“facade 增量”。

**文件：** `packages/vue/src/index.ts`、`packages/vue/src/store.ts`、`packages/react/src/index.ts`、`packages/react/src/store.ts`，以及两个包的测试。

**预计范围：** M（两个包成对修改，文件数略多但每处改动很小）。

#### U4：浏览器自测

**说明：** 在 Chrome 桌面端，用真实的平台 worker 验证检查更新。

**验收标准：**

- **手动检查**：打开 v1 页面后部署 v2，不导航，调用 `checkForUpdate()`。返回 `"update-available"`，`update-waiting` 发出，页面标记仍在；之后 `applyUpdate()` 让新版本接管。
- **无更新**：同一版本下调用返回 `"up-to-date"`，不发事件。
- **自动检查**：用 `page.clock` 快进后发出 `update-waiting`；页面隐藏期间网络请求记录中没有对 `serviceWorkerUrl` 的请求。

**验证：**

- `pnpm test:browser --filter @pwa-platform/client-runtime` 连续运行 3 次都通过。
- 如果 `page.clock` 无法驱动 facade 的计时器，把这一点写进 `verification.md`，改由单元测试承担，不采用低于下限的间隔。

**依赖：** U2。U3 可与 U4 并行。

**文件：** `packages/client-runtime` 的浏览器测试及其站点夹具。

**预计范围：** M。

#### U5：ADR-0020 与文档同步

**说明：** 记录架构决定，并同步相关文档。

**验收标准：**

- `docs/adr/0020-client-update-check.md` 写明以下决定：检查 worker 而不是 HTML；选项放在运行期；60 秒下限；隐藏页不检查；自动检查吞掉错误；`client` 与 `updateCheck` 互斥。
- ADR-0013 与 ADR-0016 追加后续修订指针。
- `docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md` 已同步。
- `docs/operations/release-and-incident-runbook.md` 写明检查请求的频率及其对 `serviceWorkerUrl` 的影响。

**验证：** spec-guard 产物校验通过；规格、ADR 与代码中的方法名、默认值、下限逐一比对一致。

**依赖：** U3、U4。

**预计范围：** M（纯文档）。

#### U6：修订质量门禁

**说明：** 做修订级的验证与独立评审，与任务 8 的门禁同一标准。

**验收标准：**

- 在干净 worktree 中冻结安装后，受影响包及其下游（client-runtime、vue、react、nuxt、examples-browser-e2e）的 lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅，重点：检查路径是否绕开用户确认；计时器与监听是否泄漏；隐藏页是否仍发请求；有没有未处理的拒绝；文档是否一致。阻断项与应修项已处理。
- 结果追加到 `tasks/client-runtime/verification.md`。远程与 CI 不可用，CI 实跑证据作为已知缺口写明，待远程恢复后补取。

**验证：** 干净 worktree 的命令输出；评审记录。

**依赖：** U5；shared-origin-topology 已合入 `main`，且本分支已变基。

**预计范围：** S–M。

### Task List（修订）

- U1 `checkForUpdate()`
- U2 自动检查（blocked by U1）
- 检查点：facade 增量
- U3 Vue 与 React 绑定（blocked by 检查点）
- U4 浏览器自测（blocked by U2；可与 U3 并行）
- U5 ADR-0020 与文档同步（blocked by U3、U4）
- U6 修订质量门禁（blocked by U5，以及 shared-origin-topology 合入 main 后的变基）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| `update()` 兑现时 `installing` 尚未出现，或已经变成 `waiting` | 中：返回值误判 | 两者都算 `"update-available"`；规格已写明返回值只作参考，提示以 `update-waiting` 为准 |
| `page.clock` 驱动不了真实页面中的计时器 | 中：自动检查缺少浏览器证据 | 先在 U4 验证可行性；不可行就记为已知限制，由单元测试的假计时器承担 |
| 改动绑定影响 Nuxt 模块（它会注入 `client`） | 中 | 互斥规则只在两者同时传入时抛错；Nuxt 不传 `updateCheck`，行为不变；U6 跑 nuxt 包的全部测试 |
| 自动检查增加对 `serviceWorkerUrl` 的请求量 | 低 | 60 秒下限、隐藏页不检查；U5 在运行手册中写明频率 |
| 远程与 CI 不可用 | 中：缺少 CI 证据 | U6 记为已知缺口；远程恢复后补跑 |

### 执行顺序（修订）

U1 → U2 → 检查点“facade 增量” → U3 与 U4 并行 → U5 → U6。每个任务一个提交，提交信息带 `Task: U<n>`。按全局约定，U1–U4 的实现派给 `executor` 子代理，主会话在任务边界验收。

---

## 修订计划：`update-applied` 页面生命周期事件（ADR-0026，待接受）

本修订处理 examples-browser-e2e 发现的公开契约缺口：`applyUpdate()` 后新 Service Worker 已接管，但页面侧没有让 `updateWaiting` 回落的事件。ADR-0026 已于 2026-09-20 获项目所有者接受；实现按下列 TDD 切片推进。

### 不变量与依赖图

```text
contracts: update-applied
        ↓
client-runtime: update-waiting → controllerchange → update-applied
        ↓                                  ↓
Vue / React reducers                     same-scope sibling tabs
        ↓                                  ↓
example UI state                    browser E2E evidence
```

- 新事件是现有 v1 信封的加性事件，`metadata` 为 `{}`；不新增 `PwaClient` 方法、选项或 worker 消息。
- `controllerchange` 是页面已经具备的浏览器信号。每个已注册页面单独处理它；不引入 BroadcastChannel，不改 sw-runtime。
- 接管前、投递失败和 10 秒超时后都保留 `updateWaiting`；只有实际观察到接管才清除。超时后迟到的接管仍要清除。
- 不刷新页面，不改变 PwaIdentity、scope、Service Worker URL、缓存准入、缓存命名空间或恢复 worker 的 fetch 边界。

### 任务定义

#### A1：接受门与 contracts 事件词表

**说明：** 取得项目所有者对 ADR-0026 的明确接受后，才把其状态改为“已接受”，并将 `update-applied` 加入 lifecycle event 词表。

**验收标准：**

- `LIFECYCLE_EVENT_TYPES`、`PwaLifecycleEventType`、`PwaLifecycleEvent` 和公开 API 快照接受 `update-applied`；其信封仍是 version 1、`metadata` 为 `{}`。
- `readLifecycleEvent` 能读为 `known`；旧版本对新增类型的既有 `unknown` 路径保持其前向兼容语义。
- 只修改事件词表，不修改 Identity、Plan、Policy、缓存或 worker 配置。

**验证：** 先写新增事件的序列化、读取与公开 API 快照测试使其失败，再实现到通过；运行 `pnpm --filter @pwa-platform/contracts test`、`build` 与 `typecheck`。

**依赖：** 项目所有者接受 ADR-0026。

**预计范围：** S。

#### A2：client-runtime 的页面侧完成事件

**说明：** 以 TDD 在 facade 的注册生命周期中加入 `controllerchange` 观察；仅完成本 facade 已发布的等待提示。

**验收标准：**

- `update-waiting` 后实际 `controllerchange` 恰发一次 `update-applied`；没有本地等待提示时的 controller change 不虚构该事件。
- `applyUpdate()` 的成功、`false`、投递异常和 10 秒超时语义不变。失败或超时不会提前发完成事件；超时后迟到的 controller change 仍完成已提示的周期。
- 监听在 `logout()` 与 `dispose()` 后撤销，不泄漏，也不影响已有 `applyUpdate()` 的临时等待和超时清理。
- 源码继续不含 reload、导航、`caches` API 或 worker 入口导入。

**验证：** 先在 facade 单元测试中用假 container 覆盖成功、重复 controller change、无提示、消息投递失败、超时后迟到接管、logout、dispose；每个事件用 `readLifecycleEvent` 反读。变异：提前在 `postMessage` 后发事件、删掉“曾提示”前提、或让 dispose 不撤销监听，测试均须失败。

**依赖：** A1。

**文件：** `packages/client-runtime/src/client/{events,facade}.ts`、相应单元测试与 public-API 快照（若生成）。

**预计范围：** M。

#### A3：Vue 与 React 状态机同步

**说明：** 两个绑定仅消费新增的 client 事件，令 `updateWaiting` 在 `update-applied` 时回落为 `false`。

**验收标准：**

- 两侧 reducer 对 `update-waiting → update-applied` 得到相同快照；其他三个状态字段与方法转发不变。
- 没有等待提示时收到重复 `update-applied` 不改变快照引用；SSR 初始状态与拒绝方法不变。
- React 的跨包 parity suite 覆盖新增序列；Vue/React 的假 facade 与类型测试都包含新事件。

**验证：** 先写两侧 red tests 和 parity 序列，再实现 reducer。变异：仅改一侧或把 `update-applied` 错映射到其他标志，必须由对应单测与 parity 测试捕获。运行两个包的 `test`、`build`、`typecheck`，并重新构建 Vue 后跑 React parity，避免读取过期 `dist`。

**依赖：** A2。

**预计范围：** M。

#### A4：真实浏览器更新与跨标签页证明

**说明：** 更新 examples-browser-e2e 的更新场景，证明提示只在实际接管后消失，且所有已提示的同 scope 标签页都会复位。

**验收标准：**

- 单标签页：v2 等待时提示可见；调用 `applyUpdate()` 后控制权移交、提示消失，页面内随机标记和 v1 DOM 仍在，证明没有刷新。
- 两标签页：同一浏览器上下文的两个已注册 v1 页面各自显示提示；仅在其中一页调用 `applyUpdate()`，两页都观察到 controller change 并隐藏提示，不使用任何页面间自建通信。
- 恢复场景不再依赖“提示出现”判定状态；仍以 waiting 槽、controller change、worker 状态和缓存快照证明恢复，缓存断言不变。

**验证：** 先让现有“接管后提示仍在”的断言改为失败的目标断言，再实现 A1–A3。变异：取消完成事件、只在调用方清除、或在完成路径加入 reload，浏览器断言必须失败。对更新与恢复场景各重复至少 10 次，再运行完整 `pnpm test:browser --filter @pwa-platform/examples-browser-e2e`。

**依赖：** A3。

**预计范围：** M。

#### A5：规格、ADR 和验证记录同步

**说明：** 在代码和浏览器证据成立后，同步事实源；不把尚未取得的发布证据改记为通过。

**验收标准：**

- ADR-0026 标为“已接受”；ADR-0013、ADR-0016 追加受其修订的链接和准确的状态机语义。
- `spec/contracts-foundation.md`、`spec/client-runtime.md`、`spec/vue-react-adapters.md` 与相关计划更新事件表、跨标签页和失败/超时语义；examples 的历史“提示常驻”记录以更正附记保留原始证据。
- 包边界、README、文档基线和 V1 验收矩阵仅在事实确有变化时做最小同步；Android N、React 真机安装、Android 恢复、远端 CI、包分发策略和 Vue 3.4 的既有缺口原样保留。

**验证：** 对照 ADR、规格、公开类型和 E2E 逐项核验；运行 Spec Guard 的只读 artifact 校验与全仓相对链接/锚点检查。

**依赖：** A4。

**预计范围：** M。

#### A6：跨包质量门禁、审查与本地交付

**说明：** 在干净 worktree 中完成与本修订相关的完整验证、跨包审查与本地 Git 交付；GitHub 不可用期间绝不推送。

**验收标准：**

- contracts、client-runtime、Vue、React、Nuxt（注入 client 的下游）和 examples-browser-e2e 的 lint、build、test、typecheck、相关真实浏览器 E2E 均通过；全仓门禁按仓库脚本通过。
- 审查覆盖：事件在 contracts 的向前兼容性、controllerchange 监听生命周期、失败/超时后的状态、跨标签页接管、禁止刷新、缓存/Identity/scope 未变，以及 Vue/React 状态序列一致性。
- 在确认干净状态后创建本地提交；从目标分支做本地 `--ff-only` 合并。记录远端 CI 不可用且未推送。

**验证：** 保存命令输出与浏览器重复运行结果到 `tasks/client-runtime/verification.md`；`git diff --check`、提交前后 `git status --short`、本地 fast-forward 结果均为证据。

**依赖：** A5。

**预计范围：** M。

### 执行顺序

项目所有者接受 ADR-0026 → A1 → A2 → A3 → A4 → A5 → A6。A3 与 A4 不并行：跨标签页浏览器场景必须消费两个绑定已经一致的最终状态语义。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| client-runtime | `spec/client-runtime.md`、`docs/adr/0013-client-facade-and-page-side-lifecycle-events.md` | 页面侧事件与 logout 的两次增补。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| client-runtime | delivered | `spec/client-runtime.md` | 2026-09-24 规格追加 public-read-cache 与 network-timeout 两节增补（`2453445`、`cf1fc96`），ADR-0013 同步增补。 |
