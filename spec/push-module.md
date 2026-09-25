# 规格：push-module

## 目标

为业务应用提供**可选的** Web Push 能力：页面上的订阅与取消订阅、worker 中按平台格式展示通知、点击通知后在本应用内打开或聚焦页面，以及业务后端构造推送内容时使用的契约。典型场景是工单与审批提醒（[vben 分析](../docs/product/vben-admin-pwa-analysis.md)）。

平台只负责"订阅拿得到、通知显示得对、点击去得对"。推送的发送、VAPID 密钥、订阅存储、偏好、去重与送达保证归业务后端（[ADR-0006](../docs/adr/0006-optional-shared-origin-and-push-modules.md)、[职责分工](../docs/product/ownership-and-raci.md)）。

成功的样子：

- 应用显式调用订阅时才请求通知权限；拿到订阅后交给应用自己发往后端，平台不发任何网络请求。
- 平台 worker 收到符合平台格式的推送时展示通知；格式不符时不展示任何内容，也不记录推送内容。
- 点击通知只会在本应用的源和 scope 内打开或聚焦页面；推送里写的地址超出范围时退回 scope 根地址。
- 不使用推送的应用：页面上不加载推送代码，不请求权限，worker 的行为与现在相同（推送事件永远不会到达）。
- 业务后端用平台提供的函数构造推送内容，构造结果必然能被平台 worker 接受。

## 已核实的现状（2026-09-18，读仓库代码与文档）

| 事实 | 位置 |
|---|---|
| 仓库中没有任何推送代码，lockfile 中没有推送或 VAPID 相关的包 | 全仓检索 |
| 平台 worker 只注册 `install`、`activate`、`fetch`、`message` 四个监听，单元测试断言恰好这四个；改变需要新 ADR | `packages/sw-runtime/src/worker/handlers.ts`、`packages/sw-runtime/test/worker/platform-worker.test.ts`、ADR-0012 |
| worker 配置是封闭的 8 个字段，未知字段令 worker 启动失败；`PwaPlan` 是封闭的 15 个字段，`PwaPolicy.extensions` 不进入计划 | `packages/sw-runtime/src/shared/config.ts`、`packages/contracts/src/plan.ts`、`spec/contracts-foundation.md` |
| 恢复 worker 只注册 `install` 与 `activate` | `packages/sw-runtime/src/recovery-worker/`、ADR-0012 |
| client-runtime 的页面侧事件固定为四个，改门面或事件集需要新 ADR；`logout()` 注销 worker，注销会同时让该注册上的推送订阅失效 | ADR-0013、ADR-0020 |
| 推送内容只能包含不透明事件数据和由同一应用控制的导航目标；打开应用后必须重新校验鉴权与实时授权 | `docs/architecture/security-model.md`"Push 隐私" |
| 指标、日志与事故复盘中不得出现推送订阅地址或推送内容 | `docs/product/observability.md`、`docs/operations/release-and-incident-runbook.md`、`packages/contracts/src/diagnostics.ts` |
| Push 是渐进增强，用特性检测，不可用时基础体验必须可用；Safari 与 Firefox 属渐进兼容档，推送不做保证 | `docs/architecture/compatibility.md`、`docs/architecture/browser-matrix.md` |
| 可选模块的先例：独立包、不改已交付包的公开契约、自己的诊断码、不引入第三方依赖 | `docs/architecture/package-boundaries.md`（entry-resilience 一节）、ADR-0018 |

前两行合起来说明：**推送处理无法做成完全不碰已交付包的可选模块**。通知只能由接收推送的那个 worker 展示，而平台 worker 既不接受额外监听，也不接受额外脚本（`CLAUDE.md` 禁止注入任意 worker 代码），另起一个 worker 又会改变 `serviceWorkerUrl` 与 scope。因此本模块对 sw-runtime 做一处有 ADR 的扩展，其余全部放在新包里。

## 范围

### 本模块交付

- **worker 侧（sw-runtime，需 ADR-0021）**：平台 worker 固定注册 `push` 与 `notificationclick` 两个监听；按平台推送格式展示通知；点击时在 scope 内打开或聚焦页面。恢复 worker 激活时取消本注册的推送订阅。不改 worker 配置格式，不改 `PwaPlan`。
- **推送格式**：一个零依赖的格式模块（类型、校验、大小上限），worker 与后端契约共用同一份实现。
- **新包 `@pwa-platform/push`**：
  - 页面入口：特性检测、查询状态、订阅、取消订阅；
  - 后端入口：构造与校验推送内容（纯 TypeScript，不含发送、加密与 VAPID 签名）。
- **真实浏览器证据**（Chrome 桌面端）：推送到达后展示通知、格式不符时不展示、不使用推送的应用不受影响。

### 不在范围

- 推送的发送、加密、VAPID 签名与密钥管理，订阅在后端的存储，偏好中心，去重，送达保证（[路线图](../docs/product/roadmap.md) 不含保证送达）。
- client-runtime 门面与 vue/react 绑定的任何改动；推送相关的页面侧生命周期事件与 worker 到页面的消息通道（留作后续，需同时修订 ADR-0013）。
- 通知的操作按钮（`actions`）、静默推送、后台同步、角标（Badging API）。
- 在 Nuxt 与 Vite 插件中新增任何推送选项：worker 由 sw-runtime 的入口构建，两者无需改动。
- 同源拓扑下跨应用的推送路由：每个应用只处理推送到自己注册上的消息，浏览器按注册分发。

## 依赖

- **sw-runtime**：平台 worker 与恢复 worker 的入口、`isSameOriginWindow` 等已有工具。
- **client-runtime**：只作为使用前提（应用先用它注册 worker）；新包不导入它的运行时代码。页面入口需要的 scope 取自应用已有的 `PwaClientConfig`，只在类型上引用。
- **contracts**：诊断码表的命名规则。

## 设计

### 1. 推送格式

业务后端发送的推送内容是一段 UTF-8 JSON，形状固定：

```ts
type PwaPushPayload = {
  readonly v: 1;
  readonly title: string;       // 1–120 个字符
  readonly body?: string;       // 至多 480 个字符
  readonly tag?: string;        // 至多 64 个字符；同 tag 的通知相互替换
  readonly url?: string;        // 点击后的目标；相对地址按 scope 解析
  readonly data?: string;       // 不透明事件标识，至多 256 个字符，平台不解释
};
```

- 字段集合封闭，多一个字段即不合格；UTF-8 编码后总长不超过 **3072 字节**（Web Push 单条记录上限 4096 字节，扣除加密开销后留足余量）。
- 显示文本（`title`、`body`）由业务写入。按安全模型，推送内容**不得包含令牌、凭据、订阅地址或授权信息**；业务数据应只放不透明标识，由应用打开后重新向后端取数。平台不检查文本内容，这一条写入接入文档。
- 不提供图标字段，通知也不设图标，由浏览器使用站点默认图标；不为此扩展 worker 配置（已决定事项）。

### 2. 平台 worker 的两个新监听（sw-runtime）

- **`push`**：解析 `event.data.text()` 并按上节校验。合格时 `event.waitUntil(registration.showNotification(title, { body, tag, data: { url, data } }))`。不合格、为空或解析失败时**不展示任何通知**，不记录内容；Chrome 此时会自行显示一条通用提示，这一行为写入接入文档。
- **`notificationclick`**：关闭通知，把 `url` 按 scope 解析；结果不在本应用的源与 scope 内、或解析失败时，改用 scope 根地址。随后若已有同源、同 scope 且地址完全相同的窗口客户端，则聚焦它；否则 `clients.openWindow(目标)`。**不导航已有窗口**，不向页面发消息。
- 两个监听都不读写任何缓存，不影响 `fetch` 的判定，也不依赖 worker 配置中的新字段。
- 格式模块作为 sw-runtime 的新零依赖入口 `./push-payload` 导出（与 `./messages` 同样由导入闭包测试守住）；应用不直接导入 sw-runtime，后端通过 `@pwa-platform/push` 的再导出使用。
- **恢复 worker**：激活时，在删除本应用缓存之后，取消本注册上的推送订阅（`registration.pushManager.getSubscription()` 存在则 `unsubscribe()`）；取消失败不影响缓存删除与接管。恢复 worker 仍不注册 `push` 或 `notificationclick`，因此不会展示任何平台通知。业务后端此后向该订阅发送会收到失效响应，据此清理。

### 3. 页面入口 `@pwa-platform/push`

```ts
type PwaPushTarget = { readonly scope: string };   // 与 PwaClientConfig.scope 相同
type PwaPushState = "unsupported" | "no-registration" | "denied" | "prompt" | "subscribed" | "not-subscribed";

function getPushState(target: PwaPushTarget): Promise<PwaPushState>;
function subscribePush(target: PwaPushTarget, options: { readonly applicationServerKey: string }): Promise<PushSubscriptionJSON>;
function unsubscribePush(target: PwaPushTarget): Promise<PushSubscriptionJSON | null>;
```

- **特性检测**：没有 `serviceWorker`、`PushManager` 或 `Notification` 时状态为 `unsupported`，订阅以明确的错误拒绝；不做浏览器嗅探。
- **只在应用调用 `subscribePush` 时请求权限**；应用负责在用户手势中调用。权限被拒时以明确错误拒绝，不重试。
- **注册来源**：按 `scope` 取已有注册（`getRegistration(scope)` 且其 scope 完全相同），没有时状态为 `no-registration`，订阅拒绝；本包**从不注册 worker**。
- **订阅**固定 `userVisibleOnly: true`；`applicationServerKey` 是 base64url 编码的公钥，格式不对时在调用浏览器之前拒绝。已有订阅且公钥相同时直接返回它；公钥不同时拒绝并提示先取消订阅（不静默替换）。
- 返回值是 `PushSubscriptionJSON`，由应用自己发往后端；本包不发任何网络请求，不保存订阅，不把订阅地址写入任何日志或错误信息。
- `unsubscribePush` 返回被取消的订阅（供应用通知后端删除），没有订阅时返回 `null`。接入文档写明：`logout()` 会注销 worker 并使订阅失效，应用应在登出前先取消订阅并通知后端。

### 4. 后端入口 `@pwa-platform/push/server`

```ts
function createPushPayload(input: Omit<PwaPushPayload, "v">): string;   // 校验并序列化；不合格时抛出带诊断码的错误
function validatePushPayload(text: string): PwaPushPayload | null;       // 与 worker 使用同一份实现
const PUSH_PAYLOAD_MAX_BYTES: 3072;
```

- 纯函数、零依赖，可在 Node 与其他运行时使用；错误只报诊断码与字段路径，不回显值。
- 发送由业务后端用自己选择的 Web Push 库完成，接入文档给出最小示例（不作为本仓库的依赖）。

## 命令

```bash
pnpm --filter @pwa-platform/sw-runtime test
pnpm --filter @pwa-platform/push test
pnpm --filter @pwa-platform/push test:browser
pnpm build && pnpm test && pnpm typecheck && pnpm lint
pnpm test:browser
```

## 测试策略

- **格式模块**：合格与不合格的边界（每个字段的长度上限、多余字段、错误版本、非 JSON、UTF-8 字节上限恰好与超出一字节）；worker 与后端入口使用同一实现的一致性测试。
- **恢复 worker 单元测试**：有订阅时取消、无订阅时不报错、取消失败时缓存删除与接管照常；监听集合仍只有两个。
- **worker 单元测试**：沿用 sw-runtime 的假作用域。监听集合由四个变为六个（原断言按 ADR 更新）；推送合格时展示一次、字段映射正确；不合格时不展示；点击时的地址解析（相对地址、跨源、scope 外、`..` 与编码绕过、解析失败）；已有相同窗口时聚焦、否则打开；两个监听不触碰缓存。
- **页面入口单元测试**：以假 `navigator` 覆盖六种状态、公钥格式、已有订阅的两种情况、权限拒绝、不发网络请求、错误信息不含订阅地址。
- **真实浏览器（Chrome 桌面端）**：通过 Playwright 的 CDP 会话调用 `ServiceWorker.deliverPushMessage` 直接向平台 worker 投递推送，不经过真实推送服务；授予通知权限后，用 `registration.getNotifications()` 断言展示结果。场景：合格推送展示通知；不合格推送不展示平台通知；不使用推送的独立源夹具行为不变（沿用已有用例）。每个场景配一次变异。
- **需要立项探路确认**（计划 T1）：CDP 投递在本机 Chrome 上是否可用；`pushManager.subscribe` 在无法访问推送服务的环境中能否成功；点击通知能否在真实浏览器中触发。无法触发的部分以单元测试为准，并在验证记录中登记为未取得的证据。

## 边界

- **始终**：特性检测；推送内容与订阅地址不进入任何日志、诊断或错误信息；点击目标限制在本应用的源与 scope 内；不使用推送的应用行为不变。
- **先询问**：新增依赖（包括 Web Push 发送库）；改变 worker 配置、`PwaPlan`、client-runtime 门面或事件集；让 worker 在点击时导航已有窗口；推送格式增加字段。
- **绝不**：平台自动请求通知权限；平台代应用发送订阅或推送；在 worker 中执行推送内容携带的任何脚本或地址以外的指令；把订阅地址或推送内容写进指标。

## 验收标准

- ADR-0021 被接受，修订 ADR-0012 中"只注册四个监听"的结论与恢复 worker 的激活步骤，并记录理由。
- sw-runtime 的平台 worker 注册六个监听；推送与点击行为满足第 2 节，单元测试与变异证明；独立源的既有测试全部通过且未修改（监听数量断言除外）。
- `@pwa-platform/push` 的页面入口与后端入口满足第 3、4 节；公开导出由测试钉住；不含第三方依赖。
- Chrome 桌面端真实浏览器场景通过，`--repeat-each 10` 无失败。
- 文档同步：ADR-0012 增补、sw-runtime 规格、包边界、安全模型的接入说明、兼容性（iOS 只对已安装到主屏的应用提供推送）、README、路线图、文档基线新增本模块一行（`target`）。
- 干净 worktree 门禁通过，独立评审完成，`tasks/push-module/verification.md` 登记未取得的证据（至少包括 CI、Android、真实推送服务、真实的通知点击）。

## 已决定事项（2026-09-18，项目所有者）

- worker 中的推送与点击处理**始终内置**，不设配置开关，不改 worker 配置与 `PwaPlan`。
- 页面 API 放在**独立新包** `@pwa-platform/push`，不改 client-runtime 门面与绑定。
- 后端部分**只做契约**（格式、构造、校验），不含发送实现，不引入依赖。
- 推送相关的页面侧事件**本次不做**。
- 恢复 worker 激活时**取消本注册的推送订阅**（原开放问题 1）。
- 通知**不设图标**，不扩展 worker 配置（原开放问题 2）。

## 已知限制

- 平台 worker 的体积会增加（两个监听与格式校验，预计数百字节），所有应用都承担，包括不用推送的应用。
- 格式不合格的推送在 Chrome 上会显示浏览器的通用提示；这是 `userVisibleOnly` 的结果，平台无法避免。
- 平台不知道后端是否还持有已失效的订阅；登出或恢复后的清理依赖业务后端处理发送失败。

## 开放问题

无。探路中需要实测确认的事项列在测试策略中，由计划的 T1 处理。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

## 修订：真实订阅与真实送达的证据收尾（2026-09-24，已评审通过）

### 起因

原验收登记了四项未取得的证据：真实订阅成功、经真实推送服务送达、真实点击后的打开或聚焦、`getNotifications()` 偶发查不到通知。ADR-0021 把订阅失败归因于"Playwright 关闭了后台网络"，但当时没有查证。

2026-09-24 的一次性探针（脚本在会话临时目录，未入库；Chrome 153.0.8010.50 stable、Playwright 1.63.0）得出以下结论：

| 启动方式 | 无头 | 有界面 | 是否去掉 `--disable-background-networking` |
|---|---|---|---|
| `browser.newContext()` | `AbortError: Registration failed - permission denied` | 同左 | 无影响 |
| `chromium.launchPersistentContext(临时目录)` | 订阅成功，得到 `fcm.googleapis.com` endpoint | 同左 | 无影响 |

- **根因是非持久化 context。** 它等同于无痕 profile，Chrome 在其中拒绝推送订阅。与后台网络无关，ADR-0021 的归因有误。
- **真实送达可以在本机完成，不需要后端，也不需要第三方库。** 用 `node:crypto` 实现 VAPID（RFC 8292）签名与 aes128gcm（RFC 8291）加密，发到 FCM 返回 `201`。无头 Chrome 中的 worker 收到后展示通知，3 轮 × 10 条共 30 条全部送达，每轮 1.5–2 秒。
- 真实点击仍然无法自动化：`clients.openWindow` 需要用户激活，这一点不变。

### 已确认的前提（项目所有者，2026-09-24）

1. 发送器只作为测试工具，**不作为公开的后端 SDK**，不引入 `web-push` 等依赖。后端发送仍归业务，ADR-0021 的边界不变。
2. 需要访问 FCM 的测试单独成套，**不进入默认的 `pnpm test:browser` 和模块门禁**。
3. 只在 **React 示例**中加 Push 演示，并配套本地发送脚本，供手动和真机验证；Vue 示例不接入。
4. 本次一并查明 `getNotifications()` 查不到通知的问题。
5. 以补充节修正 ADR-0021 的错误归因，并更新验证记录。

### 放置位置（与前提 1 的措辞有偏差，2026-09-24 项目所有者确认接受）

前提 1 原先说发送器放在 push 包的 browser-tests 里。实际读代码后改为放在 `examples-browser-e2e`，原因如下：

- push 包的浏览器夹具只有一个最小 worker（`packages/push/browser-tests/site/app/sw.js`），没有 `push` 监听，无法证明平台 worker 的展示逻辑；
- sw-runtime 的夹具有平台 worker，但没有页面订阅入口；
- 只有示例应用同时具备 Vite 构建出的**真实平台 worker**和 `@pwa-platform/push` 页面入口，端到端链路只有在这里才完整；
- `examples-browser-e2e` 是私有包，永远不发布（ADR-0028），"不作为公开 SDK"由包边界天然保证。

### 交付物增量

**测试用发送器（`examples-browser-e2e` 内部，不导出）**
- `createVapidKeys()`：生成 P-256 密钥对。
- `sendTestPush(subscription, vapidKeys, payloadText, options?)`：用 VAPID ES256 JWT 签名，按 aes128gcm 加密后 POST 到 endpoint，只返回 HTTP 状态码。
- 只依赖 `node:crypto` 与全局 `fetch`，不新增任何依赖。
- 任何输出（返回值、错误、日志）都不包含 endpoint、`p256dh`/`auth` 或 VAPID 私钥。错误只报阶段和状态码。

**联网测试套件（Chrome 桌面，`launchPersistentContext`，无头）**
- 独立的 Playwright 配置与脚本 `test:browser:network`，放在示例包内。根目录的 `pnpm test:browser` 不会运行它。
- 场景：
  1. 在 React 演示页经 `subscribePush` 订阅，得到真实 endpoint；
  2. 用 `createPushPayload` 构造合格负载，经 FCM 送达后，平台 worker 展示的通知标题、正文、tag 与构造值一致；
  3. 构造不合格负载（带多余字段）经 FCM 送达后，不展示平台通知；
  4. `unsubscribePush` 之后，再向旧 endpoint 发送返回 `404` 或 `410`，证明接入文档中"后端据失效响应清理"的依据成立。
- 联网不可用时整套以明确的原因失败，不静默跳过，也不计为通过。

**React 示例的 Push 演示**（契约增量见 [examples-browser-e2e 修订](examples-browser-e2e.md)）
- 一块演示面板：显示 `getPushState` 状态；可粘贴 VAPID 公钥；提供订阅、取消订阅按钮；提供"复制订阅 JSON"按钮。
- 页面不渲染 endpoint。

**本地发送脚本（手动与真机验证用）**
- `push:keys`：生成 VAPID 密钥，写入被 git 忽略的 `.push-demo/vapid.json`，文件权限 `0600`；只在终端打印公钥。
- `push:send`：读取订阅 JSON（来自文件或 stdin）和 `.push-demo/vapid.json`，用 `createPushPayload` 构造负载后发送，只打印状态码。

**`getNotifications()` 问题的查证**
- 限时查证，目标是区分三种来源：只在 CDP 合成投递时出现、Chrome 通知登记本身的行为、测试写法问题。
- 结论和复现数据写入验证记录。如果证明现有正向场景中"同 tag 重投"的变通已不需要，另开任务处理，本修订不顺手改动。

**人工证据：真实点击**
- 由项目所有者在桌面 Chrome 上执行一次：用演示页订阅，用 `push:send` 发送带 `url` 的推送，点击系统通知，确认在 scope 内打开或聚焦窗口。
- 记录日期、Chrome 版本和结果，标注为人工证据。未执行时继续登记为未取得。

### 本修订不做的事

- 不改 `@pwa-platform/push`、sw-runtime 的实现与公开契约；不改推送格式。
- 不发布 npm 版本，不部署 Cloudflare。演示页随下次部署自然上线，不单独触发部署。
- 不把联网测试加入默认门禁或 CI；不解决 Android 与桌面 N-1 的证据缺口。
- 不接入 Vue 示例。这与"两站配置逐项相同"的原则有偏差，由项目所有者决定接受，在 examples 修订中登记。

### 测试策略增量

- **发送器单元测试（vitest，离线）**：
  - 用 RFC 8291 附录 A 的测试向量验证加密结果逐字节一致；
  - 用公钥验签 VAPID JWT，并断言 `aud` 等于 endpoint 的 origin、`exp` 在 24 小时以内；
  - 各种错误路径的输出都不含 endpoint 与密钥标记。
  - 每项配一次变异。
- **联网套件**：上述 4 个场景，`--repeat-each 5` 无失败。
- **默认门禁不受影响**：断网时 `pnpm test:browser` 照常通过。
- **演示页**：示例的既有构建测试和浏览器测试全部通过且未修改；不支持 Push 时演示面板显示 `unsupported`，不报错。

### 验收标准增量

- 联网套件 4 个场景在 Chrome 桌面 N 上通过，重复 5 次无失败。验证记录中"真实订阅成功"和"经真实推送服务送达"两项改为已取得，并注明需要联网。
- 发送器单元测试与变异通过。`pnpm-lock.yaml` 除 workspace importer 外没有变化，没有新解析的第三方包。
- `.push-demo/` 被 git 忽略；仓库中不含任何 VAPID 私钥或订阅数据。
- `getNotifications()` 问题有结论和复现数据，或有限时查证后仍未定位的如实记录。
- 真实点击有人工证据，或继续登记为未取得。
- ADR-0021 追加补充节，修正归因，原文不改；[Push 接入说明](../docs/guides/push-integration.md)新增"本地联调"一节，说明持久化 profile 的要求和 `push:keys`/`push:send` 的用法；文档基线中本模块一行按实际证据更新（仍为 `target`，因为 Android 与桌面 N-1 未取得）。
- 干净 worktree 门禁通过，独立评审完成。

### 已决定事项（项目所有者，2026-09-24）

- 发送器、联网套件和演示脚本放在 `examples-browser-e2e`，不放在 push 包。
- 联网套件以 `--repeat-each 5` 为准。

## 后续修订：Chrome 桌面 N-1 真实 Push 联网取证（2026-09-25）

原 2026-09-24 修订将桌面 N-1 留作证据缺口；本后续单独补取，不改变原修订当时的范围和结论。项目所有者在获知该边界及真实 FCM 发送内容后要求继续。

- 只让私有的 `examples-browser-e2e` 联网套件按 ADR-0010 的 `PWA_HARNESS_CHROME_PATH` 选择桌面 Chrome 可执行文件；未设置时仍启动本机稳定版。联网套件仍不进入默认浏览器门禁或 CI。
- 使用 Google Chrome for Testing 152.0.7977.82（桌面 N-1）运行原有四个真实 FCM 场景：订阅、合格推送展示、不合格推送不展示、取消订阅后旧地址返回失效状态。记录浏览器完整版本、日期、操作系统和逐项结果；失败时如实保留未取得。
- 平台 worker、Push 公开契约、发送器、推送格式和 Android 范围均不变。测试不得将订阅地址、密钥或 VAPID 私钥写入日志和仓库。

**验收：** 四个场景在指定 N-1 浏览器中通过，默认稳定版入口仍可运行；验证记录注明真实联网范围与 N-1 人工点击、Android/CI 尚未取得的部分。此次结果只补桌面 N-1 的联网四场景，不等于桌面 N-1 全矩阵通过，也不代替 Android 证据。

## Documentation impact

本表覆盖 2026-09-24 与 2026-09-25 两次修订；原交付不回填（见上一节）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不改变 Push 的产品范围，发送仍归业务。 |
| architecture | follow | 不新增分层，不改平台 worker 与页面入口。 |
| developer-entry | follow | README 的 Push 描述不变；本地联调写在接入说明中。 |
| capability-map | follow | 模块与依赖不变。示例消费 push 沿用入口恢复修订的先例，不改依赖列。 |
| decisions | update | ADR-0021 追加补充节，修正订阅失败的归因。 |
| lifecycle-and-recovery | follow | 生命周期与恢复行为不变。 |
| ci-baseline | follow | 联网套件不进入 CI 与默认门禁。 |
| supply-chain | follow | 不新增第三方依赖，发送器只用 `node:crypto`。 |
| browser-matrix | follow | 按既有矩阵登记；本后续补测桌面 N-1，Android 仍未取得。 |
| v1-acceptance | follow | Push 是可选模块，不进入 V1 验收矩阵。 |
| identity-release-baseline | follow | 不改变身份。 |
| release-and-incident | follow | 不改变发布与事故流程。 |
| recovery-drill | follow | 恢复 worker 取消订阅的行为不变。 |
| browser-release-evidence | follow | 证据模板不变。 |
| package-distribution | follow | 发送器位于私有示例包，不进入分发范围。 |
| cloudflare-test-deployment | follow | 不新增上传文件，不触发部署。 |
| local-ci-record | follow | 联网套件不进入本地门禁记录的必跑命令。 |
| browser-test-harness | follow | 不改测试工具包；持久化 context 由联网套件自己启动。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | 平台 worker 的推送处理不变，本次只取得证据。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 不涉及。 |
| client-runtime | follow | 不改门面与事件集。 |
| vue-react-adapters | follow | 不改框架绑定。 |
| examples-browser-e2e | update | React 示例新增 Push 演示与联网套件；本后续只为联网套件接入既有的桌面 N-1 浏览器路径选择。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | 不涉及。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | update | 验证记录、ADR-0021 补充节与接入说明的本地联调一节；本后续追加桌面 N-1 真实联网结果。 |
| public-read-cache | follow | 不涉及。 |
