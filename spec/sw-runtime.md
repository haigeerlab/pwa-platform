# 规格：sw-runtime

## 目标

实现平台的 Service Worker 运行时：基于编译后的 `PwaPlan` 与 workbox-engine 的预缓存端口，提供平台 worker 与恢复 worker。

- **构建期**：从已校验的 `PwaPlan` 生成 worker 运行时配置，注入打包后的 worker。
- **平台 worker**：安装时填充预缓存，激活时清理自身预缓存中的过期条目；处理请求（预缓存命中、离线导航与降级、拒绝基线与路径规则）；采用提示更新，只在页面确认后跳过等待。
- **恢复 worker**：生产 worker 异常时的恢复路径（[ADR-0005](../docs/adr/0005-update-prompt-and-recovery-worker.md)）。它立即激活并接管客户端，只删除当前应用 `appCachePrefix` 下的缓存，不拦截 fetch。

规则优先级与预缓存清单只来自已编译的计划（[ADR-0007](../docs/adr/0007-separate-contracts-from-policy-compilation.md)）；预缓存只通过引擎端口使用，不直接导入 Workbox（[ADR-0011](../docs/adr/0011-platform-injects-compiled-precache-manifest.md)）。

成功标准：在 Chrome 桌面端的真实浏览器中，[V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)里由 sw-runtime 负责或参与的场景中，worker 一侧的通过标准全部成立：

- **首次在线访问**：worker 安装完成后，预缓存中恰好是 `PwaPlan.precache` 列出的条目。
- **后续离线启动**：断网重开应用壳不白屏；未缓存的导航得到明确降级。
- **未缓存、私有或流式请求**：这类响应不进入平台缓存，断网时得到网络错误。
- **发现更新**：新 worker 保持等待，只有页面确认后才接管。
- **异常 worker 恢复**：[恢复演练](../docs/operations/recovery-drill.md)通过。

## 范围

**交付物：**

- 私有工作区包 `packages/sw-runtime`，包名 `@pwa-platform/sw-runtime`（沿用 README 与包边界文档中的名称）：
  - 入口 `.`（构建期，Node）：`createPlatformWorkerConfig`、`createRecoveryWorkerConfig`、`injectWorkerConfig`、`WORKER_CONFIG_INJECTION_POINT`。只依赖 `@pwa-platform/contracts`。（2026-09-17 增补：`createPathMatcher`，供 `@pwa-platform/nuxt` 以 worker 自身的匹配规则检查预渲染 HTML，见 ADR-0012 增补。）
  - 入口 `./worker`（运行期，平台 worker）：`registerPlatformWorker`。只依赖 `@pwa-platform/engine-workbox/worker`，不导入 contracts、Workbox 或 Node 模块。
  - 入口 `./recovery-worker`（运行期，恢复 worker）：`registerRecoveryWorker`。不依赖任何包。
  - 入口 `./messages`（页面与 worker 共用）：`SKIP_WAITING_MESSAGE`、`isSkipWaitingMessage`。不依赖任何包，供 client-runtime 使用。
  - 入口 `./push-payload`（worker 与后端共用）：平台 Push 格式、校验与 3072 字节上限。不依赖任何包；`@pwa-platform/push/server` 只再导出这一份实现。
  - 两个 worker 入口脚本 `./platform-worker-entry` 与 `./recovery-worker-entry`：读取注入点并调用上面的注册函数，是 vite-adapter 打包的对象。
- 单元测试（Vitest）与浏览器自测（Playwright 与 browser-test-harness，测试 worker 由 vite 打包入口脚本后注入 fixture 计划）。
- 恢复演练记录：在 Chrome 桌面端执行，写入 `tasks/sw-runtime/verification.md`。
- `docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md`：记录运行时配置在构建期注入、恢复 worker 是独立产物、跳过等待的确认消息、目录导航对应 `index.html`。
- 同步 `docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- 执行 `pathRules` 中的运行时缓存策略（如 `stale-while-revalidate`），不写任何运行时缓存。能力图写明"运行时缓存留待后续能力"。
- worker 注册、更新提示界面、生命周期事件在页面与 worker 之间的传输、登出清理（归 client-runtime）。
- 打包 worker、写出产物文件、在 `serviceWorkerUrl` 发布恢复 worker（归 vite-adapter 与发布流程）。
- 清单与构建产物的一致性、部署响应头的校验（归 build-verifier 与部署）。
- Push 的页面订阅、后端发送与订阅存储（归 push-module）；同源子路径拓扑（归 shared-origin-topology）。
- 修改 contracts、core 或 workbox-engine 的公开契约。
- Chrome Android 的运行方式（见"开放问题"）。

## 依赖

- **运行时依赖**：`@pwa-platform/contracts`、`@pwa-platform/engine-workbox`，均为 `workspace:*`。不新增第三方依赖。
- **开发依赖**：
  - 以下都在 lockfile 中已有：`@pwa-platform/browser-test-harness`、`@pwa-platform/core`（仅用于路径匹配的一致性测试），均为 `workspace:*`；`@playwright/test@1.63.0`、`vite@8.3.0`、`@types/node@24.13.4`。
  - `workbox-precaching` 与 `workbox-core` 通过 engine-workbox 间接进入测试 worker 的打包。
- **worker 必须打包**：平台 worker 经引擎依赖 Workbox，需要打包并把 `process.env.NODE_ENV` 定义为 `"production"`（ADR-0011）。恢复 worker 与 `./messages` 没有依赖，打包只是为了注入配置。

## 公开契约

### 构建期：生成并注入 worker 配置

`createPlatformWorkerConfig(plan: PwaPlan): PwaPlatformWorkerConfig`

- 先用 contracts 的 `validatePlan` 校验计划；无效时抛错，错误信息只列出诊断码与路径，不回显输入内容。
- 返回可 JSON 序列化的配置：

  | 字段 | 来源 |
  |---|---|
  | `kind: "platform"`、`version: 1` | 固定值 |
  | `scope` | `identity.scope` |
  | `precacheCacheName` | contracts `cacheName(identity, "precache")` |
  | `requestBaselineDenials` | 原样照抄计划，保持顺序 |
  | `pathRules` | 每条只取 `pathPrefix` 与 `action`，保持计划中的顺序与写法 |
  | `offlineFallback` | 原样照抄计划 |
  | `updateMode` | 原样照抄计划 |

- 结果确定：相同计划得到深度相等的配置。不包含 `install`、`hostBuildOutput`、`artifacts`、`diagnostics` 等运行期不需要的字段。

`createRecoveryWorkerConfig(plan: PwaPlan): PwaRecoveryWorkerConfig`

- 同样先校验计划，返回 `{ kind: "recovery", version: 1, appCachePrefix }`，其中 `appCachePrefix` 由 contracts `appCachePrefix(identity)` 计算。

`injectWorkerConfig(workerSource: string, config: PwaPlatformWorkerConfig | PwaRecoveryWorkerConfig): string`

- `WORKER_CONFIG_INJECTION_POINT` 为 `self.__PWA_WORKER_CONFIG`。它必须在打包后的 worker 源码中按字面恰好出现一次（注释也计入），否则抛错。
- 注入发生在打包之后，注入点必须在打包产物中原样保留，规则与 `self.__WB_MANIFEST` 一致（ADR-0011）。平台 worker 两个注入点都要注入，恢复 worker 只有配置注入点。
- 注入前按运行期的规则校验配置，不合法时抛错。注入内容是 `JSON.stringify(config)`。
- 纯函数：结果确定，不读写文件，不打包，不压缩。

### 运行期：平台 worker

`registerPlatformWorker({ scope, config, manifest }): void`

- `scope` 是 `ServiceWorkerGlobalScope`，`config` 是注入的配置，`manifest` 是注入的清单（`self.__WB_MANIFEST`）。
- 启动时校验配置（`kind`、`version`、字段形态、`updateMode` 为 `"prompt"`），不合法时抛错，worker 脚本求值失败，也就不会安装。然后用 `createPrecacheEngine({ cacheName: config.precacheCacheName, entries: manifest })` 创建引擎。
- 注册 `install`、`activate`、`fetch`、`message`、`push`、`notificationclick` 六个监听，不注册其他监听，也不调用 `importScripts`。后两个监听按 [ADR-0021](../docs/adr/0021-push-handling-in-the-platform-worker.md) 处理平台格式的 Push 与通知点击；它们不读写缓存，不改变下面的 `fetch` 判断表。

**安装与激活：**

- `install` 调用 `engine.install(event)`，任一条目下载失败即安装失败。不调用 `skipWaiting`。
- `activate` 调用 `engine.activate(event)`，只删除自身预缓存中已不在清单内的条目。不调用 `clients.claim`，不删除、不打开任何其他缓存，包括本应用旧 revision 的预缓存。旧 revision 的缓存只由恢复 worker 删除。

**请求处理**：`fetch` 事件按以下顺序判断，第一条成立即停止。"不接手"指不调用 `respondWith`，请求与没有 worker 时完全相同。

| # | 条件 | 处理 |
|---|---|---|
| 1 | 请求方法不是 `GET` | 不接手（`non-get`） |
| 2 | 请求 URL 与 worker 不同源 | 不接手（`cross-origin`） |
| 3 | 请求 URL 无法解析 | 不接手 |
| 4 | 请求路径没有匹配任何 `pathRules`，或第一条匹配的规则是 `deny` | 不接手（`unclassified` 与拒绝规则）。**2026-09-17 修订**：第一条匹配规则是 `deny` 的**导航**，在降级页启用且在清单内时，按"导航"处理，候选只有降级页（[ADR-0012](../docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md) 增补） |
| 5 | 非导航请求 | 请求路径加查询串精确命中注入的清单时读预缓存：命中缓存即返回；清单内但缓存缺失时回退网络（[ADR-0012](../docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md)）。不在清单内则不接手。**2026-09-19 修订**：本会由预缓存应答、但带有 `Range` 请求头（不论取值）的请求不接手（`range`）；拒绝、排除、未分类与不在清单内的请求仍按原有原因不接手。 |
| 6 | 导航请求（`request.mode === "navigate"`） | 网络优先，见下 |

- **路径匹配**与 policy-compiler 相同：
  - 忽略查询串与片段，逐段按 URL 标准解码；
  - `%2F` 不解码，合法的 `%XX` 解码为字节，非法写法保留原样，非 UTF-8 字节替换为 U+FFFD；
  - 前缀按完整路径段比较，按 `pathRules` 顺序取第一条匹配。
- **导航**：
  - 用 `fetch(event.request)` 请求网络，得到任何响应（包括 4xx、5xx 与重定向）都原样返回。
  - 只有网络请求失败（抛错）时才依次尝试：
    1. `engine.match` 请求 URL（去掉片段，查询串必须一致）；
    2. 路径以 `/` 结尾时，`engine.match` 同一 URL 加上 `index.html`；**2026-09-17 修订**：不以 `/` 结尾时，`engine.match` 路径加 `/index.html`（查询串照旧保留）；
    3. `offlineFallback.enabled` 为真时，`engine.match` 降级页路径。
  - 都没有命中时返回网络错误（`Response.error()`）。除降级页以外，不返回其他路由的缓存内容。
- **拒绝基线**：
  - `websocket` 不经过 `fetch` 事件。
  - `no-store`、`opaque-response`、`redirect` 约束的是写入运行时缓存，本模块不写运行时缓存；在线时网络响应原样返回，不做缓存。
  - 安装阶段写预缓存的情况见"开放问题"与已知限制。

**更新**：

- `updateMode` 为 `"prompt"`：新 worker 安装后保持等待，不自行激活。
- `message` 监听只接受满足 `isSkipWaitingMessage` 的消息，并且 `event.source` 必须是与 worker 同源的窗口客户端。满足时在 `event.waitUntil` 中调用 `scope.skipWaiting()`，其他消息一律忽略。

### 运行期：恢复 worker

`registerRecoveryWorker({ scope, config }): void`

- 启动时校验配置（`kind: "recovery"`、`version: 1`、`appCachePrefix` 以 `pwa:` 开头并以 `:` 结尾），不合法时抛错。
- `install` 在 `event.waitUntil` 中调用 `scope.skipWaiting()`。
- `activate` 在 `event.waitUntil` 中先删除名称以 `appCachePrefix` 开头的全部缓存，再尝试取消当前注册的 Push 订阅，最后调用 `scope.clients.claim()`。没有订阅时跳过；`getSubscription()` 或 `unsubscribe()` 的失败被吞掉，不能阻断接管。
- 只注册 `install` 与 `activate` 两个监听：不注册 `fetch`、`message`、`push` 或 `notificationclick`，不导入 Workbox，不访问网络。

### 页面与 worker 共用：跳过等待消息

- `SKIP_WAITING_MESSAGE` 为 `{ type: "pwa:skip-waiting" }`（冻结对象）。
- `isSkipWaitingMessage(value: unknown): boolean`：只有字段恰好为 `type` 且值为 `"pwa:skip-waiting"` 的普通对象才返回真。

### 生命周期事件

本模块不发送生命周期事件，传输协议由 client-runtime 决定。contracts 中与 worker 相关的事件，触发点如下，供 client-runtime 接入：

| 事件 | worker 中的触发点 |
|---|---|
| `activated` | 平台 worker 的 `activate` 完成 |
| `offline-fallback` | 导航返回降级页 |
| `cache-cleaned` | 平台 worker 的 `activate` 删除了预缓存条目，或恢复 worker 删除了缓存 |

## 命令

```bash
pnpm --filter @pwa-platform/sw-runtime build
pnpm --filter @pwa-platform/sw-runtime test
pnpm test:browser --filter @pwa-platform/sw-runtime
pnpm --filter @pwa-platform/sw-runtime typecheck
```

CI 的 browser job 已递归运行 `pnpm test:browser`，本模块的浏览器自测随之在 CI 中运行，不需要修改工作流。

## 测试策略

- **单元测试（Vitest，Node）**：
  - **配置**：两种配置的字段与来源、确定性；无效计划抛错且不回显输入；注入点出现 0 次、1 次、2 次；配置不合法时注入与启动都抛错。
  - **路径匹配的一致性**：用 core 的 `compilePlan` 编译一组计划，覆盖百分号编码的前缀与路径、`%2F`、非法转义、非 UTF-8 字节、同名前缀的兄弟段；验证运行期匹配选中的规则，与 core 选择预缓存条目时首先匹配的规则一致。
  - **请求处理**：用伪造的事件覆盖判断表的每一行，包括查询串、片段、目录导航、降级页启用与未启用、网络失败与 4xx 响应。
  - **更新消息**：来自同源窗口客户端的确认消息触发 `skipWaiting`；其他形态、其他来源的消息被忽略。
  - **恢复 worker**：只注册 `install` 与 `activate`，没有 `fetch` 监听（恢复演练要求的单元测试证据）；只删除 `appCachePrefix` 开头的缓存，包括 `appId` 以当前 `appId` 开头的其他应用不被删除。
  - **依赖边界**：按 TypeScript 语法树检查各入口的导入，要求与上文一致。
- **浏览器自测（Playwright 与 browser-test-harness，Chrome 桌面端）**：由 vite 打包两个入口脚本，再注入 fixture 计划与配置，组成版本化站点：
  - **首次在线访问**：worker 以 `serviceWorkerUrl` 注册，scope 等于身份 `scope`；安装后预缓存恰好是清单条目，平台缓存命名空间中没有其他条目。
  - **预缓存资源**：在线请求预缓存资源时，由 worker 从缓存返回，服务器没有收到请求。
  - **后续离线启动**：
    - 断网重开应用壳 URL（目录形式），页面正常渲染；
    - 断网导航到未缓存路由时，启用降级得到降级页，未启用得到网络错误；
    - 不返回其他路由的缓存内容。
  - **拒绝与未分类请求**：在线时请求不经 worker 处理（`fromServiceWorker` 为假），平台缓存中没有对应条目；断网时得到网络错误。
  - **发现更新**：
    - 部署 v2 后新 worker 保持等待，已打开页面没有被重新加载；
    - 页面发送确认消息后，新 worker 接管页面（`waitForControllerChange`）；
    - 激活后，旧 revision 的预缓存条目被清理，其他缓存不变。
  - **异常 worker 恢复**：按恢复演练的步骤 1 到 4 自动执行。对照缓存包括同应用旧 revision、同应用其他环境、`appId` 前缀重叠的其他应用、非平台缓存；删除集合与保留集合必须完全一致。
- **变异检查**：逐个破坏配置校验、路径匹配、请求判断表、更新消息与恢复清理的核心判断，确认对应测试失败，恢复后源码逐字节一致。

## 边界

- **始终**：只消费 `PwaPlan`，不推导规则优先级与清单；缓存名来自 contracts；平台 worker 只在确认消息后跳过等待；运行期入口不含 Node 依赖；恢复 worker 不含 fetch 监听。
- **先询问**：新增依赖；下载浏览器或驱动（包括 Chrome 桌面端 N-1 与 Chrome Android 所需）；修改 contracts、core 或 workbox-engine 的公开契约；执行运行时缓存策略；接手拒绝或未分类的请求；改变注入点、配置格式或确认消息的格式。
- **禁止**：缓存或返回拒绝、未分类请求的响应；让恢复 worker 注册 fetch 监听或删除 `appCachePrefix` 以外的缓存；根据 User-Agent 分支；执行任意脚本 URL 或未经评审的 `importScripts`。

## 验收标准

1. `@pwa-platform/sw-runtime` 提供上文的入口，各入口的依赖边界由测试守护。
2. 构建期配置与注入结果确定，计划无效、注入点不是恰好一次或配置不合法时抛错。
3. 平台 worker 的安装、激活、请求处理与更新行为符合上文的契约与判断表；路径匹配与 policy-compiler 一致。
4. 恢复 worker 立即激活并接管客户端，只删除 `appCachePrefix` 下的缓存，没有 fetch 监听。
5. 单元测试、浏览器自测与变异检查覆盖以上行为；`pnpm test:browser` 在本地与 CI 通过；Chrome 桌面端的恢复演练记录写入验证记录。
6. ADR-0012 记录本模块的架构决定；包边界、README 与文档基线已同步。

## 已决定事项（项目所有者，2026-09-16）

- 平台 worker 在运行期所需的计划字段，由构建期生成精简的运行时配置并注入打包后的 worker，不注入完整计划，也不在运行期请求计划文件。
- 恢复 worker 是独立的入口与产物：只注册 `install` 与 `activate`，不依赖 Workbox，由部署流程发布到同一 `serviceWorkerUrl`。
- 断网导航时，URL 精确命中预缓存条目才返回；以 `/` 结尾的导航 URL 另外按 `index.html` 查找；再没有命中时返回离线降级页，未启用降级则得到网络错误。（2026-09-17 修订：不以 `/` 结尾的导航 URL 也按 `/index.html` 查找，见 ADR-0012 增补。）
- 更新确认由 sw-runtime 定义消息 `{ type: "pwa:skip-waiting" }`，client-runtime 使用；不修改 contracts。
- 路径解码与匹配由 sw-runtime 自带实现，用 core 的 `compilePlan` 做一致性测试；不修改 core 的公开 API。
- 拒绝基线中针对响应的三项（`no-store`、`opaque-response`、`redirect`）约束的是运行时缓存的写入。安装写预缓存时由构建与部署保证，本模块写入已知限制，不修改引擎。
- 命中拒绝规则或未分类的请求，worker 一律不接手，断网导航时得到浏览器的网络错误，不显示离线降级页。（2026-09-17 修订：命中拒绝规则的导航在断网时显示离线降级页，仍不读写该路径的缓存；未分类请求不变。见 ADR-0012 增补。）

## 开放问题

- **Chrome Android 的运行方式**：本模块仍然没有测试设备，浏览器矩阵的 Android 必测项继续作为已知限制，发布门禁照旧阻塞。第一个具备设备的运行时模块需要决定运行方式（ADR-0010）。
- **Chrome 桌面端 N-1**：N-1 要求本机有一份上一个主版本的 Chrome。获取它需要下载，届时先询问项目所有者；取得之前，验证记录只写 N 的结果。
- **生命周期事件的传输**：由 client-runtime 规格决定，本模块只记录触发点。
- **离线导航的查询串**：应用壳 URL 带查询串时（例如 `start_url` 带追踪参数），按精确匹配不会命中预缓存。是否对导航忽略查询串，留待真实应用出现后再评估。

## 修订：Range 请求不由预缓存应答（2026-09-18，已评审通过）

### 起因

对标调研中，Immich 出过这样的问题：Service Worker 拦截了带 `Range` 请求头的请求，返回 200 而不是 206（immich-app/immich#27923），导致视频无法拖动进度。本仓库的真实浏览器复现测试（分支 `test/sw-range-and-deploy-transition`，提交 `8f8fbaf`）确认平台 worker 有同样的问题：对一个 4096 字节的已预缓存资源请求 `Range: bytes=0-99`，worker 从预缓存返回完整的 200 响应，没有 `Content-Range`，服务器也没有收到请求。原因是判断表第 5 行只看 URL，`engine.match` 收到的是清单 URL 字符串，请求头根本传不进去。

### 已确认的前提（项目所有者，2026-09-18）

- 以修订已交付模块的方式落地，能力图不变。
- 采用"只改 sw-runtime"的方案，不在 `REQUEST_BASELINE_DENIALS` 中新增拒绝项：contracts、core、`PwaPlan` 与 `planVersion` 都不变。
- 带 `Range` 的请求交给网络处理，平台不返回部分内容。离线时拖动已预缓存的音视频不在 v1 的目标之内。

### 不变的部分

- `PwaPlan` 的全部字段、`requestBaselineDenials` 的内容与顺序、worker 配置格式、注入点，以及确认消息。
- 判断表第 1 至 4 行与第 6 行；安装、激活与更新行为；恢复 worker。

### 契约增量

- 判断表第 5 行改为：非导航请求的路径加查询串精确命中清单时，如果请求带有 `Range` 请求头（不论取值，包括 `bytes=0-`），则**不接手**，原因记为 `range`；不带 `Range` 时行为不变。
- `PwaRequestInput` 增加 `range: boolean`，由 fetch 监听以 `request.headers.has("range")` 填入；`PwaPassthroughReason` 增加 `"range"`。只有请求本会由预缓存应答时才使用这个原因：命中拒绝、排除、未分类或不在清单内的请求，仍按原来的原因不接手。
- 导航请求不看 `range`，行为不变。

### 本修订不做的事

- 不从缓存切出部分内容（例如 `workbox-range-requests`）；不写运行时缓存。
- 不改变 `requestBaselineDenials`；`range` 不是计划层面的拒绝项，业务无法通过策略开启或关闭它。
- 不处理发版过渡时旧页面加载已删除资源的问题。该问题由运行手册规定的保留窗口约束，另行评估。

### 测试策略增量

- **单元测试**：判断表覆盖以下情况：带 `range` 的清单内非导航请求得到 `passthrough/range`；带 `range` 的拒绝、排除、未分类、不在清单内的请求保持原来的原因；带 `range` 的导航不受影响；不带 `range` 时第 5 行的结果不变。fetch 监听把请求头正确转成 `range`。
- **浏览器自测**：对已预缓存的二进制资源请求 `Range: bytes=0-99`，在线时得到服务器返回的 206、`Content-Range: bytes 0-99/<size>` 和 100 字节，并且服务器收到了请求；不带 `Range` 的同一请求仍由预缓存应答，服务器没有收到请求。
- **变异检查**：删掉 `range` 判断、或把它移到拒绝判断之前，对应测试必须失败。

### 验收标准增量

1. 上述单元测试与浏览器自测通过；原有单元测试与浏览器自测全部通过。
2. ADR-0023 记录本决定并被接受；本规格判断表第 5 行的说明与本修订一致。
3. 修订门禁在干净的 worktree 中执行，结果写入 `tasks/sw-runtime/verification.md` 的"修订门禁：Range 请求"一节，并附独立评审结论。

## 修订：导航兜底忽略查询串（2026-09-23，已评审通过）

### 起因

导航兜底此前以"请求 URL 去掉片段、但**保留查询串**"作为第一候选，且路径加 `index.html` 的候选同样保留查询串。这是当时的有意决定（本规格"导航"一节，并由 `decide.test.ts` 的用例连同注释钉住），本意是不把一个路由的缓存当成另一个路由的答案。

2026-09-23 在 Cloudflare `drill` 站演示入口恢复时，这条规则造成了具体后果：应用按接入文档传入 `returnPath`，恢复页链接因此带 `?return=…`；当前 Origin 在网络层不可达时，精确候选与预缓存中的 `/app/pwa-entry.html` 匹配不上，于是跳过恢复页、落到离线降级页。**用户在最需要备用入口的时刻看到的是"您已离线"。** 同一次断网下的对照实验：不带查询串正常显示入口按钮，带查询串显示降级页，两次导航除查询串外完全相同。

决定见 [ADR-0034](../docs/adr/0034-navigation-fallback-ignores-the-query-string.md)。

### 已确认的前提（项目所有者，2026-09-23）

- 修平台的通用行为，而不是让入口恢复改用 URL 片段绕开：后者只挡住这一例，同类问题会以别的形式重现。
- 精确匹配（含查询串）仍是第一优先；只有它落空时才丢弃查询串再试一次。
- "绝不返回其他路由的缓存内容"不变；在线行为完全不变。

### 契约增量

本规格"导航"一节的兜底顺序改为：

1. `engine.match` 请求 URL（去掉片段，**查询串保持一致**）；
2. **新增**：`engine.match` 同一 `pathname`（**丢弃查询串**）；
3. 路径以 `/` 结尾时 `engine.match` 该 `pathname` 加 `index.html`，否则加 `/index.html`（**丢弃查询串**；此前保留）；
4. `offlineFallback.enabled` 为真时，`engine.match` 降级页路径；
5. 都不中时返回 `Response.error()`。

候选去重后按上述顺序尝试；不跨路由匹配。

### 不变的部分

- 在线导航：`fetch(event.request)` 的任何响应（含 4xx、5xx、重定向）原样返回。
- 非导航请求的判定：请求路径**加查询串**精确命中清单才读预缓存，本次不改。
- 拒绝基线、缓存命名空间、恢复 worker 与清理行为。

### 本修订不做的事

- 不改非导航请求的匹配规则。
- 不引入查询串白名单或按参数归一化的机制。
- 不改入口恢复模块的实现、恢复页或返回路径校验。

### 测试策略增量

- **单元测试**：改写 `decide.test.ts` 中钉住旧行为的用例与其注释；新增：带查询串的导航在精确落空后命中同路径预缓存；带查询串且同路径不在清单时仍落到降级页；跨路由（`/app/guides` 对 `/app/guide`）仍不匹配；查询串精确命中时优先返回该条目。
- **真实浏览器测试**：断网后导航到"带查询串的预缓存页面"，应得到该页面本身而非降级页。
- **变异检查**：去掉新增的候选，上述浏览器测试与单元测试必须转红。

### 验收标准增量

- 当前 Origin 不可达时，带 `?return=…` 的恢复页导航返回恢复页本身。
- 在线行为与非导航请求的判定与修订前逐项一致。
- 入口恢复演练第 4 步补上"断网状态下打开恢复页并确认能看到入口"，驱动脚本同步；该步骤的缺失正是此缺陷未被演练发现的原因。

## public-read-cache 增补（2026-09-24）

v1.1 交付了公共读取运行时缓存（[public-read-cache](public-read-cache.md)、[ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)），修订本规格中"平台 v1 没有运行时缓存"一类表述：这些表述只对 v1、v2 计划以及 v3 且 `runtimeCache.enabled: false` 成立。v3 且 `enabled: true` 时，请求判断表新增一个分支：命中可执行规则（`public-data` 或 `navigation-public-dynamic`）的请求，在原判断表第 1–5 行（拒绝基线、`exclude`/`deny`、预缓存、`Range` 透传）之后，才进入运行时缓存判断；带 `Authorization` 请求头的非导航请求透传，缓存键为包含查询串的完整 URL。响应准入、时效、配额与清理的完整契约见 public-read-cache 规格，不在本文重复。平台 worker 的固定监听集合、构建期配置注入点与恢复 worker 的行为不因此改变；worker 配置新增必填字段 `runtimeCache`（缓存名、上限、启用状态），v1/v2 计划与 v3 且未启用时该字段的缓存名同样存在，供激活与登出清理使用。

## network-timeout 增补（2026-09-24）

[network-timeout](network-timeout.md) 给平台 worker 增加可选的网络超时（[ADR-0038](../docs/adr/0038-network-timeout.md)）：worker 配置新增可选字段 `networkTimeoutSeconds`，只在计划中存在时写入；设置了它时，`navigate()` 超时后使用回退、没有回退时继续等网络，network-first 运行时缓存引擎收到同一超时；`PwaRuntimeCacheReason` 新增 `network-timeout`。未设置时 `navigate()` 走与此前相同的代码路径，注入的配置不变。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不改变首期交付结果与排除项。 |
| architecture | follow | 运行时分层与依赖方向不变；本次只改导航兜底的候选顺序。 |
| developer-entry | update | README 的包清单与能力说明列出本包。 |
| capability-map | update | 本模块与其依赖登记在能力图中。 |
| decisions | create | ADR-0012（运行时配置与恢复 worker）、ADR-0034（导航兜底忽略查询串）等由本模块产出。 |
| lifecycle-and-recovery | update | 生命周期文档中的安装、激活、清理与恢复 worker 顺序由本模块的运行时行为决定。 |
| ci-baseline | follow | 不改变 CI 工作流。 |
| supply-chain | follow | 不新增第三方依赖。 |
| browser-matrix | follow | 遵守既有分档与 N/N-1 规则。 |
| v1-acceptance | follow | 离线启动等场景的验收口径不变，本次修订使其在带查询串时也成立。 |
| identity-release-baseline | follow | 不改变身份与缓存命名空间规则。 |
| release-and-incident | follow | 不改变发布与事故流程。 |
| recovery-drill | follow | 恢复演练步骤不变；入口恢复演练的补充记在 pwa-entry-resilience。 |
| browser-release-evidence | follow | 证据模板不变。 |
| package-distribution | follow | 本包已在首批分发范围，分发决定不变。 |
| cloudflare-test-deployment | follow | 测试站部署契约不变；本次缺陷在该站点被发现，但修复在平台侧。 |
| browser-test-harness | follow | 使用既有 harness，不改变其公开面。 |
| workbox-engine | follow | 引擎端口不变；兜底候选由本模块决定，不经引擎配置。 |
| sw-runtime | create | 本模块自身的事实源：规格、ADR 与验证记录。 |
| offline-write-extension | follow | 离线写队列不经导航路径。 |
| build-verifier | follow | 不新增发布检查。 |
| release-gate-contract | follow | 不改变覆盖判定。 |
| local-ci-record | follow | 不改变门禁记录模板。 |
| release-orchestration-protocol | follow | 不改变外部发布协议。 |
| vite-adapter | follow | 构建注入的配置形状不变。 |
| client-runtime | follow | 页面侧协议不变。 |
| vue-react-adapters | follow | 不参与框架绑定。 |
| examples-browser-e2e | follow | 示例是验证场所，其证据记在该模块。 |
| pwa-entry-resilience | follow | 该模块是本次修订的受益方；其恢复页与演练记录由它自己维护。 |
| ssr-adapters | follow | SSR 的导航由其自身适配处理。 |
| shared-origin-topology | follow | 不改变同源拓扑规则。 |
| push-module | follow | Push 不经导航路径。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
