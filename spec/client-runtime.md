# 规格：client-runtime

## 目标

实现平台的页面侧运行时：把 Service Worker 的注册、安装引导、更新提示与登出清理收拢到一个 facade 后面，让业务应用不直接接触 `navigator.serviceWorker`。

- **构建期**：从已校验的 `PwaPlan` 生成精简的 `PwaClientConfig`，页面只拿到它，拿不到整份计划。
- **页面运行期**：注册 worker；保存并按应用要求触发安装提示；发现等待中的新版本并在应用确认后让它接管；登出时注销注册。
- **状态事件**：以 contracts 的 `PwaEventEnvelope` 发出页面侧可观察的五个生命周期事件，供应用与框架适配器订阅。

身份字段由平台拥有，页面不得覆盖（[ADR-0004](../docs/adr/0004-identity-is-immutable-after-production-registration.md)）；更新默认提示、确认后才接管（[ADR-0005](../docs/adr/0005-update-prompt-and-recovery-worker.md)）；确认消息使用 sw-runtime 导出的常量，不新造协议（[ADR-0012](../docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md)）。

成功标准：在 Chrome 桌面端的真实浏览器中，[V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)里由 client-runtime 负责或参与的场景，页面一侧的通过标准全部成立：

- **首次在线访问**：worker 以身份的 `serviceWorkerUrl` 注册，注册的 scope 等于身份的 `scope`。
- **发现更新**：新 worker 保持等待；客户端可以显示更新提示；确认之前任何已打开的页面都不被刷新或重新加载；确认之后新 worker 激活并控制页面，曾提示该更新的页面收到 `update-applied` 并清除提示。
- **安装**：页面收到 `beforeinstallprompt` 后依次发出 `install-eligible` 与 `installed` 事件。

## 范围

**交付物：**

- 私有工作区包 `packages/client-runtime`，包名 `@pwa-platform/client-runtime`（沿用 README 与包边界文档中的名称）：
  - 入口 `.`（页面运行期，DOM）：`createPwaClient`、类型 `PwaClient`、`PwaClientConfig`、`PwaClientEvent`。依赖 `@pwa-platform/contracts`（类型与事件信封）与 `@pwa-platform/sw-runtime/messages`（确认消息常量）。不导入 Node 模块，不导入 sw-runtime 的 worker 入口。
  - 入口 `./build`（构建期，Node）：`createClientConfig(plan)`。只依赖 `@pwa-platform/contracts`。
- 单元测试（Vitest）与浏览器自测（Playwright 与 browser-test-harness，与真实的平台 worker 对接）。
- `docs/adr/0013-client-facade-and-page-side-lifecycle-events.md`：记录 facade 形态、本期事件集合、登出清理语义与配置来源。
- 同步 `docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- 更新提示的界面：facade 只发出 `update-waiting` 并提供 `applyUpdate()`，按钮、弹窗与文案归业务应用与框架适配器（`vue-react-adapters`）。
- **确认后自动刷新页面**：验收矩阵要求"不得全局强制刷新"。`applyUpdate()` 只发送确认消息并等待新 worker 接管，是否重新加载由应用决定。
- worker 侧三个事件（`activated`、`offline-fallback`、`cache-cleaned`）：平台 worker 不发送任何消息，页面观察不到。见"已知限制"。
- 删除任何缓存：见"已决定事项"中的登出清理语义。
- 打包与产物写出、把配置送进页面模块（归 vite-adapter）。
- Push 订阅与通知（归 push-module）；框架绑定（归 vue-react-adapters）。
- 修改 contracts、core、workbox-engine 或 sw-runtime 的公开契约。
- Chrome Android 的运行方式（见"开放问题"）。

## 依赖

- **运行时依赖**：`@pwa-platform/contracts`、`@pwa-platform/sw-runtime`，均为 `workspace:*`。不新增第三方依赖。
- **开发依赖**：均已在 lockfile 中：`@pwa-platform/browser-test-harness`、`@pwa-platform/core`（浏览器自测用 `compilePlan` 编译 fixture 计划）、`@playwright/test@1.63.0`、`vite@8.3.0`、`@types/node@24.13.4`。
- **能力图已修订**：`client-runtime` 的依赖加上 `sw-runtime`。原表把两者放在同一组，与 [ADR-0012](../docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md)"sw-runtime 导出常量供 client-runtime 使用"矛盾；build order 中 client-runtime 相应移到 sw-runtime 之后。

## 公开契约

### 构建期：生成客户端配置

```ts
function createClientConfig(plan: PwaPlan): PwaClientConfig;

type PwaClientConfig = {
  readonly appId: string;
  readonly scope: string;
  readonly serviceWorkerUrl: string;
  readonly updateMode: PwaUpdateMode;
  /** `plan.install !== null`：宿主构建产出了安装元数据。 */
  readonly installEnabled: boolean;
};
```

- 计划先经 `validatePlan` 校验；无效时抛错，错误消息不回显输入内容。
- 字段全部取自已校验计划，不做推导；页面拿不到路径规则与预缓存清单。
- 输出确定，与计划的键顺序无关。

### 页面运行期：客户端 facade

```ts
function createPwaClient(options: {
  readonly config: PwaClientConfig;
  readonly container?: ServiceWorkerContainer;
  readonly target?: EventTarget;
}): PwaClient;

type PwaClient = {
  register(): Promise<void>;
  /** 有保存的安装提示时触发它并等待用户选择；没有时返回 "unavailable"。 */
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
  /** 有等待中的 worker 时发送确认消息并等待它接管；没有时返回 false。不重新加载页面；等待超时抛错。 */
  applyUpdate(): Promise<boolean>;
  /** 注销本应用的注册；没有注册时返回 false。不删除 Cache Storage。启用离线写时，先由 worker 清除其专属队列。 */
  logout(): Promise<boolean>;
  subscribe(listener: (event: PwaClientEvent) => void): () => void;
  /** 移除本 facade 注册的全部监听，供 SPA 卸载与测试使用。 */
  dispose(): void;
};
```

- 配置在 `createPwaClient` 中校验，字段不合法时抛错。
- `container` 默认取 `navigator.serviceWorker`，显式传入只为测试注入；它与 `config.scope`（注册路径）是两回事，故不共用 `scope` 这个名字。
- `target` 是安装事件（`beforeinstallprompt`、`appinstalled`）的监听目标，默认取全局 `window`，同样只为测试注入。`config.installEnabled` 为假时不取默认值、也不注册监听。
- `register()` 以 `config.serviceWorkerUrl` 注册、`scope` 为 `config.scope`；重复调用返回同一次注册。注册失败不被记住，调用方可以重试。
- facade 自行保存 `beforeinstallprompt` 事件（调用 `preventDefault`），`promptInstall()` 才有可触发的对象。
- 所有监听都由 facade 注册与移除，应用不接触 `navigator.serviceWorker`。
- `applyUpdate()` 先订阅 `controllerchange` 再发送确认消息。两步目前在同一个同步块内，事件不可能插在中间，因此这个顺序当下与相反顺序等价；这样写是为了将来两步之间若插入 `await`，也不会出现错过接管的窗口。10 秒内没有接管就抛错，而不是返回 `false`（后者已表示"没有可应用的更新"）。
- `applyUpdate()` 与 `logout()` 都用 `container.getRegistration(config.scope)` 查找注册，因此页面没有调用过 `register()` 也能使用；`update-waiting` 则需要 `register()`，监听在那时建立。
- `applyUpdate()` 并发调用是安全的：每次各自等待接管，同一次 `controllerchange` 让它们一起完成；确认消息本身幂等，worker 侧重复收到不改变结果。
- 已发出 `update-waiting` 的 facade 持续监听页面侧 `controllerchange`：接管来自本页、同 scope 的其他标签页或恢复 worker 时都发出一次 `update-applied`。确认投递失败或 10 秒等待超时不发；若超时后才接管，监听仍在并在那时发出。它不使用 worker 消息、页面间消息或自动刷新，见 [ADR-0026](../docs/adr/0026-update-applied-page-lifecycle-event.md)。
- `dispose()` 会让在飞行的 `applyUpdate()` 以错误结束，而不是留下一个无人等待的等待：否则超时会在 facade 退役很久之后抛出一个没有归属的拒绝。
- `logout()` 同时停止对旧注册的更新监听：一个已注销的注册若仍报告更新，页面会为一个不存在的注册提示用户。协调 v2 启用离线写时，它先通过一条关联的消息端口要求当前 controller 清除 worker 拥有的专属队列；缺少 controller、确认超时、确认形状不匹配或清理失败均返回 `false`，不调用 `unregister()`。
- `logout()` 成功注销后清除 facade 内部记住的注册，之后可以重新 `register()`。注册已被其他标签页移除时，`logout()` 仍返回 `false`，但同样停止监听与自动检查并清除记住的注册。已打开的其他标签页仍由旧 worker 控制到关闭为止，这是 `unregister()` 的既有语义。
- `dispose()` 之后 facade 已退役：再调用它的任何方法都抛错，而不是静默无操作。重复 `dispose()` 不抛错。
- 订阅者之间互相隔离：某个监听器抛错时，其余监听器照常收到该事件，错误也不会冒泡到发出事件的代码路径。

### 生命周期事件

以 contracts 的 `PwaEventEnvelope` 发出，`version` 为 `1`，`appId` 取自配置，`timestamp` 为 ISO 8601，`metadata` 只含非敏感的扁平值。

| 事件 | 发出时机 | metadata |
|---|---|---|
| `registered` | `navigator.serviceWorker.register` 成功 | `{ scope }`：注册返回的 scope，是带 origin 的绝对 URL，不是配置里的路径 |
| `install-eligible` | 收到 `beforeinstallprompt` 并保存 | `{}` |
| `installed` | 收到 `appinstalled` | `{}` |
| `update-waiting` | 注册出现 `waiting` 的 worker，且页面已被另一个 worker 控制 | `{}` |
| `update-applied` | 已发出 `update-waiting` 的页面观察到 `controllerchange` | `{}` |

事件用 `readLifecycleEvent` 可读；`metadata` 绝不包含令牌、endpoint、用户标识或响应体（[可观测性](../docs/product/observability.md)）。

## 命令

```bash
pnpm --filter @pwa-platform/client-runtime build
pnpm --filter @pwa-platform/client-runtime test
pnpm test:browser --filter @pwa-platform/client-runtime
pnpm --filter @pwa-platform/client-runtime typecheck
```

CI 的 browser job 已递归运行 `pnpm test:browser`，本模块的浏览器自测随之在 CI 中运行，不需要修改工作流。

## 测试策略

- **单元测试（Vitest，Node）**：
  - **配置**：字段与来源、确定性；无效计划抛错且不回显输入；facade 收到不合法配置时抛错。
  - **facade 行为**：用假的 `ServiceWorkerContainer` 与假的注册对象覆盖注册、重复注册、安装提示的保存与触发（接受、取消、无提示）、确认更新（有等待 worker、无等待 worker）、登出（有注册、无注册）、`dispose` 之后不再发出事件。
  - **事件**：五个事件的信封字段与顺序；每个信封都能通过 `readLifecycleEvent`；`metadata` 不含约定之外的键。`update-applied` 仅在本 facade 先前已提示更新且实际发生接管后发出。
  - **不刷新**：确认更新的路径中不调用任何形式的页面重载。
  - **依赖边界**：按 TypeScript 语法树检查各入口的导入，`.` 不含 Node 模块，`./build` 不含 DOM 专有 API，两者都不导入 sw-runtime 的 worker 入口。
- **浏览器自测（Playwright 与 browser-test-harness，Chrome 桌面端）**：由 vite 打包 sw-runtime 的平台 worker 入口，注入 fixture 计划与配置，组成版本化站点；页面侧加载本包：
  - **首次在线访问**：`register()` 后注册的 scope 等于身份 `scope`，活动 worker 的脚本 URL 等于 `serviceWorkerUrl`；`registered` 事件发出。
  - **发现更新**：部署 v2 后 `update-waiting` 发出，已打开页面没有被重新加载（用页面标记验证）；调用 `applyUpdate()` 后新 worker 接管（`waitForControllerChange`），页面仍未被重新加载且提示消失；另以两个同 scope 标签页确认它们各自观察接管并消除陈旧提示。
  - **登出**：`logout()` 之后注册消失，页面不再被控制；`appCachePrefix` 下的缓存条目数与登出前完全一致（用 `snapshotCaches` 与 `diffCacheSnapshots` 比对）。协调 v2 fixture 另证明：队列实际存在时，facade 在注销前收到 worker 的清理确认，identity 专属数据库随后不存在。
  - **事件序列**：收集页面发出的事件值，用 `expectLifecycleSequence` 断言类型顺序。
- **变异检查**：逐个破坏配置校验、注册参数、确认消息、登出注销与事件发出，确认对应测试失败，恢复后源码逐字节一致。

## 边界

- **始终**：身份字段只来自已校验计划；确认消息使用 sw-runtime 导出的常量；事件信封通过 contracts 的读取函数；facade 移除自己注册的全部监听。
- **先询问**：新增依赖；下载浏览器或驱动；修改 contracts、core、workbox-engine 或 sw-runtime 的公开契约；在确认更新后自动重新加载页面；让登出删除任何缓存；扩大事件集合。
- **禁止**：让应用覆盖身份字段；把令牌、用户标识或响应体写进事件 `metadata`；根据 User-Agent 分支；在未收到应用调用时自行触发安装提示或跳过等待。

## 验收标准

1. `@pwa-platform/client-runtime` 提供上文两个入口，依赖边界由测试守护。
2. 构建期配置确定，计划无效或配置不合法时抛错。
3. facade 的注册、安装引导、确认更新、登出行为符合上文契约；确认更新不重新加载页面。
4. 五个事件的信封与顺序符合契约，且都能被 `readLifecycleEvent` 读取。
5. 单元测试、浏览器自测与变异检查覆盖以上行为；`pnpm test:browser` 在本地与 CI 通过。
6. ADR-0013 记录本模块的架构决定；能力图、包边界、README 与文档基线已同步。

## 已决定事项（项目所有者，2026-09-16）

- **页面侧可观察事件为五个**：`registered`、`install-eligible`、`installed`、`update-waiting`、`update-applied`。后者仅在已提示页面观察到实际接管时结束提示；`activated`、`offline-fallback`、`cache-cleaned` 的触发点仍在平台 worker 内，而 sw-runtime 不发送任何消息；接入它们需要修改已交付模块的公开契约，本期不做（ADR-0026）。
- **登出清理只注销 registration，不删除任何缓存**。registration 是 v1 中唯一实际存在的"平台会话元数据"（路线图的 v1 交付项）；`appCachePrefix` 下 v1 只有公共静态应用壳，删除它不清除任何私有数据（平台对 `session-data`、`mutation`、`stream`、`unclassified` 一律 `deny`），却会让登出后的离线启动失效。[安全模型](../docs/architecture/security-model.md)要求清除的"用户敏感缓存分类"在 v1 为空集，本决定自动满足它。
- **安装引导拦截 `beforeinstallprompt`** 并保存事件，由应用调用 `promptInstall()` 决定展示时机（ADR-0005 的"应用拥有展示"）。
- **公开形态是工厂函数返回 facade 对象**：注册状态、待用的安装提示、等待中的 worker 都是该对象的内部状态，应用不必自行串联。
- **配置由构建期从 `PwaPlan` 生成**，与 sw-runtime 对称；页面拿不到整份计划。
- **能力图修订**：`client-runtime` 的依赖加 `sw-runtime`，build order 中移到 sw-runtime 之后。
- **注入的容器参数叫 `container`**，不叫 `scope`：后者与 `config.scope`（注册路径）同名异义，调用方几乎必然误读。本模块尚未交付，改名没有下游代价。
- **`dispose()` 之后调用任何方法都抛错**。facade 的 `dispose` 用于 SPA 卸载，之后残留的引用继续调用是调用方的缺陷；抛错能当场暴露它，静默无操作只会把问题推迟。
- **订阅者抛错互相隔离**：一个写得不好的埋点订阅者不应让更新提示 UI 收不到事件，也不应让已经成功的注册流程失败。错误不转成新的事件类型。
- **安装事件的监听目标由 `target` 注入**，与 `container` 对称，默认是全局 `window`。安装事件不在 `ServiceWorkerContainer` 上，没有注入点就只能在测试里改全局状态。
- **`installEnabled` 为假时完全不介入安装**：不注册监听、不发 `install-eligible`、`promptInstall()` 直接返回 `"unavailable"`。若照常拦截，`preventDefault` 会压下浏览器的原生安装提示，而没有任何代码会调用 `promptInstall()` 把它放出来——等于静默禁掉了安装。
- **安装提示消费一次即丢弃**：`BeforeInstallPromptEvent.prompt()` 按规范只能调用一次，因此 `promptInstall()` 取出提示后立即清除，`prompt()` 抛错时也不保留、错误照常冒泡给调用方。`appinstalled` 之后同样清除。
- **`applyUpdate()` 等待超时抛错，默认 10 秒**：返回值 `false` 已经表示"没有等待中的更新"，再用它表示"确认已发出但 worker 没接管"会把两种截然不同的情况合并。抛错让应用可以分别处理（例如提示用户手动刷新）。
- **`update-waiting` 对同一个等待中的 worker 只发一次**：`registration.waiting` 与 `updatefound` 两条路径都可能观察到同一个 worker，按 worker 对象去重。页面未被任何 worker 控制时（首次安装）不发，因为那不是"更新"。
- **v1 的 `logout()` 只注销注册**：不触碰 `caches`，包内任何位置都不出现 `caches` API。这一点由测试扫描源码守护，而不仅靠断言调用次数。协调 v2 的离线写清理由 [ADR-0027](../docs/adr/0027-explicit-session-bound-offline-write-queue.md) 增补：它仍不删除 Cache Storage，但必须在注销前由 worker 删除专属 IndexedDB 队列。

## 已知限制

- **worker 侧三个事件未接入**：`activated`、`offline-fallback`、`cache-cleaned` 本期不发出。[可观测性](../docs/product/observability.md)描述的是平台最终形态，不是 v1 的实现承诺；接入需要 sw-runtime 增加消息发送能力，属于修改已交付模块的公开契约，需要新的 ADR。
- **`update-waiting` 依赖页面已被控制**：首次访问（页面未被任何 worker 控制）时安装的第一个 worker 不算"等待中的更新"，不发该事件。

## 开放问题

- **Chrome Android**：本模块没有测试设备，[浏览器矩阵](../docs/architecture/browser-matrix.md)的 Android 必测项继续作为已知限制，与 sw-runtime 一致（[ADR-0010](../docs/adr/0010-real-browser-verification-with-playwright.md)）。
- **桌面端 N-1**：需要本机备有上一个主版本的 Chrome，获取它属于下载，未经授权不执行。

## 修订：主动检查更新（2026-09-18，已评审通过）

### 起因

浏览器只在导航到作用域内页面、以及功能事件距上次检查超过 24 小时等时机自行检查新 worker。后台管理这类单页应用常常整天不刷新页面，部署了新版本也发现不了，`update-waiting` 一直不发出。vue-vben-admin 用一个与 Service Worker 无关的轮询组件弥补这一点（HEAD 请求首页比对 `ETag`），见 [vben-admin PWA 分析](../docs/product/vben-admin-pwa-analysis.md) 第四节。本修订在 facade 上提供等价能力，但检查的对象是 worker 本身：检查到的就是确认后能接管页面的那个版本。

### 已确认的前提（项目所有者，2026-09-18；同日评审通过本修订，开放问题保持开放）

- 以修订已交付模块的方式落地，能力图不变：“更新提示”本在 client-runtime 的职责内。
- 提供手动方法，外加默认关闭的自动检查。
- Vue 与 React 绑定同批暴露（修订 [vue-react-adapters](vue-react-adapters.md) 的公开契约）。

### 不变的部分

- 更新仍是“提示、确认后才接管”（ADR-0005）：检查只触发浏览器的更新流程，不发确认消息、不跳过等待、不重新加载页面。
- 事件集合的更新周期语义由 ADR-0026 补充：检查发现的新版本仍经现有的 `updatefound` → `statechange` 路径发出 `update-waiting`，实际接管后由页面侧 `controllerchange` 发出 `update-applied`；去重规则不变。
- 不修改 contracts、core、workbox-engine、sw-runtime 的公开契约；`PwaClientConfig` 与构建期入口 `./build` 不变。

### 公开契约增量

```ts
type PwaUpdateCheckResult = "update-available" | "up-to-date" | "unavailable";

type PwaClient = {
  // ……原有方法不变
  /**
   * 让浏览器立即检查 worker 脚本是否有新版本。不重新加载页面，不让新版本接管。
   * 没有注册时返回 "unavailable"；检查请求失败时抛错。
   */
  checkForUpdate(): Promise<PwaUpdateCheckResult>;
};

type PwaClientOptions = {
  // ……原有字段不变
  /** 自动检查。省略即关闭。 */
  readonly updateCheck?: { readonly intervalMs: number };
  /** 页面可见性的来源，默认全局 `document`，只为测试注入；未启用 `updateCheck` 时不取默认值。 */
  readonly document?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
};
```

`PwaUpdateCheckResult` 从页面入口 `.` 导出，供绑定与应用使用。

**`checkForUpdate()`**

- 与 `applyUpdate()`、`logout()` 一样，用 `container.getRegistration(config.scope)` 查找注册；没有注册返回 `"unavailable"`。
- 找到注册后调用 `registration.update()`。它兑现时，`installing` 或 `waiting` 不为空即返回 `"update-available"`，否则返回 `"up-to-date"`。
- `"update-available"` 只表示浏览器取到了不同的脚本。新版本若安装失败会变成 `redundant`，不会发出 `update-waiting`；应用应以 `update-waiting` 为提示依据，而不是以这个返回值为依据。
- `update-waiting` 只在调用过 `register()` 之后才会发出（监听在那时建立，原契约不变）。没调用过 `register()` 时，`checkForUpdate()` 仍会检查并返回结果，但不会发出事件。
- `registration.update()` 拒绝时（断网、脚本 404、注册已被移除等），错误原样抛给调用方，不转成事件。
- 并发调用合并：已有检查在进行时，后来的调用拿到同一个结果，不再发请求。
- `dispose()` 之后调用抛错，与其他方法一致。

**自动检查（`updateCheck`）**

- `intervalMs` 必须是整数，范围为 60 000 到 2 147 483 647（`setTimeout` 能接受的最大值），不合法时 `createPwaClient` 抛错。下限用来防止把 worker 脚本的请求变成对服务器的高频轮询。
- 在 `register()` 成功之后开始计时，不在注册时立即检查，因为浏览器注册时刚取过脚本。
- 用链式 `setTimeout` 计时：从上一次检查结束开始算，检查不会重叠。
- 到点时页面不可见（`visibilityState !== "visible"`）就跳过这次检查、记为“欠一次”；页面回到可见时，若欠着一次或距上次自动检查开始已满 `intervalMs`，立即检查一次。页面在后台时不发请求。
- 自动检查的失败一律吞掉：不抛出、不发事件、不留下未处理的 Promise 拒绝，下一个周期照常检查。
- `logout()` 停止自动检查，下次 `register()` 成功后重新开始；`dispose()` 停止并移除可见性监听。
- 不读取 `navigator.onLine`：它在很多网络环境下不可靠，断网时让检查失败再吞掉更简单。

**部署影响**

平台注册时不设置 `updateViaCache`，按规范默认值 `"imports"`，worker 主脚本的检查绕过 HTTP 缓存。每次检查就是向 `serviceWorkerUrl` 发一次请求，频率约为“可见标签页数 × 每 `intervalMs` 一次”。部署文档需写明这一点；以 60 秒下限计，每个可见标签页每小时最多 60 次。

### 框架绑定增量（vue-react-adapters）

- `PwaMethods` 加入 `checkForUpdate`，照原样转发给 facade；服务端渲染时的 `SERVER_METHODS` 同样加入它，调用即以 `SERVER_RENDERING_ERROR` 拒绝。
- Vue：`createPwa({ config, updateCheck })`。React：`<PwaProvider config updateCheck>`，effect 的依赖是 `updateCheck?.intervalMs` 这个字段，不是对象本身（与 `config` 的处理一致）。
- 同时传入 `client` 与 `updateCheck` 时抛错：注入的 facade 已经建好，绑定无法再给它设置自动检查，与其静默忽略，不如当场报错。
- 状态机 `PwaState` 不变，不增加“检查中”状态，因为 facade 没有对应的事件。两份状态机副本之间的一致性测试照旧。

### 本修订不做的事

- Nuxt 模块转发 `updateCheck`：`@pwa-platform/nuxt` 在部分情况下自行构造并注入 `client`，需要单独设计，列入开放问题。
- 在检查更新时顺带检查页面 HTML 或 `ETag`，也就是 vben 的做法。
- 新增事件，或在状态中暴露上次检查时间。
- 检查到新版本后自动接管或自动刷新页面。

### 交付物增量

- `packages/client-runtime`：`checkForUpdate()`、`updateCheck`、`document` 注入、`PwaUpdateCheckResult` 导出。
- `packages/vue`、`packages/react`：方法转发、选项、服务端渲染时的拒绝。
- `docs/adr/0020-client-update-check.md`：记录检查对象选 worker 而不是 HTML、选项放在运行期而不放进 `PwaPolicy`、60 秒下限、隐藏页不检查、自动检查吞掉错误。
- 同步 ADR-0013 与 ADR-0016 的“后续修订”指针、`docs/architecture/package-boundaries.md`、`README.md`、部署相关文档（检查请求的频率）。
- 在 `tasks/client-runtime/plan.md` 追加本修订的任务。

### 测试策略增量

- **单元测试（Vitest）**：
  - 用假注册覆盖 `checkForUpdate()` 的三种返回值、`update()` 拒绝时原样抛错、并发合并为一次请求，以及 `dispose()` 之后调用抛错。
  - 用 Vitest 假计时器与假 `document` 覆盖自动检查：注册前不计时；间隔准确；不重叠；页面隐藏时跳过、回到可见时补检；失败时吞掉并在下个周期继续；`logout()` 与 `dispose()` 后停止；`intervalMs` 越界或不是整数时抛错。
  - 确认检查路径不发确认消息、不重新加载页面（沿用原有的“不刷新”断言）。
  - 绑定层覆盖：方法转发；服务端渲染时拒绝；`client` 与 `updateCheck` 同时传入时抛错；React effect 只随 `intervalMs` 重建。
- **浏览器自测（Chrome 桌面端）**：
  - **手动检查**：打开 v1 页面后部署 v2，不导航，调用 `checkForUpdate()`。断言返回 `"update-available"`、`update-waiting` 发出、页面标记仍在（未重新加载）；随后 `applyUpdate()` 让新版本接管。
  - **无更新**：同一版本下调用，返回 `"up-to-date"`，不发事件。
  - **自动检查**：用 Playwright 的 `page.clock` 快进时间，不真的等 60 秒。断言到点后发出 `update-waiting`；页面隐藏期间不请求 `serviceWorkerUrl`（用网络请求记录断言）。若 `page.clock` 无法驱动 facade 的计时器，记为已知限制，由单元测试承担，不改用低于下限的间隔。
- **变异检查**：逐个破坏返回值判定、并发合并、隐藏页跳过、失败吞掉与 `logout` 停止，确认对应测试失败。

### 边界增量

- **始终**：检查只调用 `registration.update()`；自动检查的计时器与监听都经 `track` 登记，`dispose()` 能全部撤销。
- **先询问**：把检查设置放进 `PwaPolicy` 或 `PwaClientConfig`；降低 60 秒下限；新增事件或状态字段；改变 `updateViaCache`。
- **禁止**：检查路径中发送确认消息或重新加载页面；页面隐藏时发起检查；根据 User-Agent 分支。

### 验收标准增量

1. `checkForUpdate()` 的三种返回值、错误传递与并发合并符合上文契约。
2. 自动检查的启动、间隔、隐藏页跳过与补检、失败吞掉、停止条件符合上文契约，参数不合法时抛错。
3. 真实浏览器中，在不导航的情况下部署新版本后，手动检查与自动检查都能让 `update-waiting` 发出，且页面未被重新加载。
4. Vue 与 React 绑定暴露 `checkForUpdate` 与 `updateCheck`，服务端渲染时调用方法会拒绝，两份状态机的一致性测试通过。
5. ADR-0020 已记录，相关文档已同步；单元测试、浏览器自测与变异检查通过。

### 开放问题

- **Nuxt**：`@pwa-platform/nuxt` 要不要、以什么形式转发 `updateCheck`。它自行构造 `client` 的那条路径与“`client` 和 `updateCheck` 互斥”的规则冲突，需要项目所有者裁决。
- **60 秒下限**：沿用 vben 的默认值。若部署方对 `serviceWorkerUrl` 的请求量有更严格的要求，下限可以提高，但不宜降低。
- **网络恢复时补检**：要不要在 `online` 事件时也补检一次。本草案不做，理由同样是 `navigator.onLine` 不可靠。

## public-read-cache 增补（2026-09-24）

页面侧可观察事件由五个扩为六个，新增 `served-from-cache`（[public-read-cache](public-read-cache.md)、[ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)），同样以 contracts 的 `PwaEventEnvelope` 发出：`metadata` 为 `{ url, cachedAt, reason }`，`reason` 取 `"network-failed"` 或 `"stale-while-revalidate"`；只在响应确实由运行时缓存提供时发出，网络响应、预缓存命中与离线降级页都不发。`register()` 成功后，facade 向当前 controller 查询一次是否存在为本次导航暂存的记录（10 秒超时），确保监听器建立得比 worker 发消息晚时也不丢事件；子资源命中由 worker 直接向 `clientId` 发消息，不经查询。`CLIENT_EVENT_TYPES` 与 contracts 的 `LIFECYCLE_EVENT_TYPES` 同步新增该类型；对客户端事件类型做穷举检查的业务代码（以及 vue-react-adapters 的 `reduce`）需要补一个分支才能通过类型检查，这是一次有意的破坏性变更，写入迁移指南。本节以外的构建期配置（`PwaClientConfig`）与原有五个事件的契约不变。

## network-timeout 增补（2026-09-24）

`served-from-cache` 的 `metadata.reason` 可能为 `network-timeout`（[network-timeout](network-timeout.md)、[ADR-0038](../docs/adr/0038-network-timeout.md)）。facade 的取值校验来自 sw-runtime 的共享消息模块，门面、事件集合与框架绑定不变。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

**2026-09-24 补齐**：本模块当天再次进入修订，按上述约定补齐了该表，见下方 Documentation impact；表只针对那次修订。

## Documentation impact

本表针对 2026-09-24 的两次增补：public-read-cache（新事件 `served-from-cache`）与 network-timeout（`reason` 新值 `network-timeout`），见上文两节增补。`logout()` 清空运行时缓存的握手记在 public-read-cache 规格中。此前交付的部分不据此反推（2026-09-23 的决定）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 不涉及。 |
| decisions | follow | ADR-0035、ADR-0038 由 public-read-cache 与 network-timeout 模块创建；本模块只在 ADR-0013 中增补，记在 client-runtime 一行。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | 不涉及。 |
| supply-chain | follow | 不涉及。 |
| browser-matrix | follow | 不涉及。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | follow | 不涉及。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | worker 侧的变化由 public-read-cache 与 network-timeout 模块记录。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 不涉及。 |
| client-runtime | update | 规格追加两节增补；ADR-0013 追加两处增补。 |
| vue-react-adapters | follow | 两个绑定的 `reduce` 为新事件补了一个分支（代码），绑定的公开面与规格不变。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | 不涉及。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 页面信号的设计与接入说明由该模块维护。 |
