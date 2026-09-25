# 实现计划：push-module

## 概览

按 [spec/push-module.md](../../spec/push-module.md) 交付可选的 Web Push 能力：
- 平台推送格式（零依赖，worker 与后端共用）；
- 平台 worker 的 `push` 与 `notificationclick` 监听；
- 恢复 worker 激活时取消推送订阅；
- 新包 `@pwa-platform/push`：页面入口（状态、订阅、取消订阅）与后端入口（构造、校验推送内容）；
- Chrome 桌面端真实浏览器证据。

风险集中在三处，任务顺序照此安排：

1. **改动已交付包 sw-runtime 的 worker 行为**。平台 worker 的监听集合与恢复 worker 的激活步骤都受 ADR-0012 约束，所以先写 ADR-0021 提议稿，经项目所有者接受后才动代码；每个改动 sw-runtime 的任务结束时跑全仓回归，独立源的既有测试除监听数量断言外一字不改。
2. **真实浏览器能证明到什么程度未知**。CDP 投递推送、无推送服务时的订阅、通知点击，此前都没在仓库中实测过。T1 先在临时目录里探路，结论决定 T7 的场景范围；做不到的部分登记为未取得的证据，不用测试替身冒充。
3. **推送内容的隐私**。格式、错误信息、日志中都不得出现推送内容或订阅地址；每个任务的测试都要覆盖这一点，并列为评审重点。

## 架构决定

- **ADR 先于代码**：T1 写 ADR-0021 提议稿，修订 ADR-0012 的两处结论（平台 worker 的监听集合、恢复 worker 的激活步骤），引用 ADR-0006、ADR-0013，不改它们的结论。项目所有者接受后才开始 T2。
- **格式模块放在 sw-runtime 的新零依赖入口 `./push-payload`**：worker 必须内含校验逻辑，而应用不得直接导入 sw-runtime，因此新包再导出同一份实现，不写第二份。
- **不新增外部依赖**。新包只依赖工作区内的 sw-runtime；lockfile 只会多出新包的 importer。
- **不改 client-runtime、vue、react、vite、nuxt、contracts、core**。worker 仍由 sw-runtime 的入口构建，vite 与 nuxt 打包出的 worker 自动带上新监听，靠它们既有的浏览器测试兜住回归。
- **真实浏览器证据放在 sw-runtime 的浏览器测试**：那里的夹具站点直接使用平台 worker 入口，最接近被测对象。页面入口的浏览器测试放在新包，范围按 T1 结论定。

## 任务定义

### 任务 1：ADR-0021 提议稿与浏览器探路

**说明：** 写 ADR-0021 提议稿；在会话临时目录中用一个临时的最小 worker 实测三件事，结论写进本计划的 T1 实施记录。探路代码不提交。

**验收标准：**
- ADR-0021 状态为"提议"，内容包括：平台 worker 固定注册 `push` 与 `notificationclick` 的理由（为什么不能做成可选的独立 worker、为什么不设配置开关）；推送格式与字节上限；点击目标的范围限制与"不导航已有窗口"；恢复 worker 取消订阅；对 ADR-0012 两处结论的修订；已知限制（worker 体积、Chrome 的通用提示）。
- 探路结论逐条给出"可行 / 不可行 / 部分可行"与证据：
  1. Playwright CDP 会话的 `ServiceWorker.deliverPushMessage` 能否把推送投递给本机 Chrome 上的 worker，`getNotifications()` 能否读到展示结果；
  2. 在不访问推送服务的前提下，`pushManager.subscribe` 是成功、失败还是挂起（不为此放开网络）；
  3. 能否在真实浏览器中触发 `notificationclick`，以及 `clients.openWindow` 在非用户点击触发时的表现。
- 全仓链接扫描 0 失效。

**验证：** 项目所有者接受 ADR 后，把状态改为"已接受"并单独提交。

**依赖：** 无。

**预计范围：** S（ADR）加探路。

#### T1 实施记录（2026-09-18）

**ADR-0021 提议稿**：[docs/adr/0021-push-handling-in-the-platform-worker.md](../../docs/adr/0021-push-handling-in-the-platform-worker.md)，内容按验收标准，另附浏览器实测结论。

**浏览器探路**（Chrome 153.0.8010.50 桌面端，Playwright 1.63.0，会话临时目录中的最小 worker 与本机静态服务器，代码不入库）：

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | CDP `ServiceWorker.deliverPushMessage` 能否投递推送并读到展示结果 | **可行** | 授予通知权限后投递 `hello`，`getNotifications()` 读到 `{ title: "T:hello", body: "b", tag: "t1" }` |
| 2 | 不访问推送服务时 `pushManager.subscribe` 的表现 | **不可行**（明确失败，不挂起） | 无头与有界面模式都以 `AbortError: Registration failed - permission denied` 失败；权限为 `granted`，之后 `getSubscription()` 为空。原因推测是 Playwright 关闭了 Chrome 的后台网络，未查证；按计划不放开网络 |
| 3 | 能否在真实浏览器中触发 `notificationclick` | **部分可行** | 经 Playwright 在真实 worker 内派发合成事件，处理函数执行；`clients.openWindow` 以 `InvalidAccessError: Not allowed to open a window.` 拒绝（合成事件没有用户激活） |

**对后续任务的影响**：
- T7 的真实浏览器场景确定为：合格推送展示通知、不合格推送不展示、既有场景不受影响；页面入口可在真实浏览器中验证 `getPushState` 的非订阅状态与 `subscribePush` 的失败路径。
- 订阅成功、点击后打开或聚焦，以单元测试为准，在验证记录中登记为未取得的证据。
- 规格的测试策略已预留"无法触发的部分以单元测试为准"，无需修订规格。

### 检查点 A：ADR 已接受，探路有结论

- ADR-0021 已接受；探路结论若使规格的测试策略不成立，先修订规格再继续。

### 任务 2：推送格式模块（sw-runtime `./push-payload`）

**说明：** 实现规格第 1 节的格式：类型、`validatePushPayload`、`PUSH_PAYLOAD_MAX_BYTES`，以及供后端使用的构造函数所需的校验诊断。

**验收标准：**
- 零依赖入口 `./push-payload`，导入闭包测试证明它不导入任何模块（与 `./messages` 同一套测试）。
- 边界测试：每个字段的长度上限恰好与超出一个字符、`title` 为空、多余字段、`v` 不为 1、非 JSON、非对象、UTF-8 字节上限恰好与超出一字节（含多字节字符）。
- 错误只给诊断码与字段路径，测试断言错误信息中不含输入值。
- 公开导出测试钉住新入口的导出集合；sw-runtime 其他入口的导出不变。

**验证：** `pnpm --filter @pwa-platform/sw-runtime test` 通过；全仓 build、test、typecheck、lint 通过。

**依赖：** 检查点 A。

**预计范围：** S。

#### T2 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。子代理遵守了"不用 git 还原"的要求。**

- 新入口 `@pwa-platform/sw-runtime/push-payload`（`src/push-payload/index.ts`），不导入任何模块，导入闭包测试守住；包的导出由六个变为七个。
- 导出：`PUSH_PAYLOAD_VERSION`、`PUSH_PAYLOAD_MAX_BYTES`、`PUSH_PAYLOAD_ISSUE_CODES`（7 个问题码）、`checkPushPayload`（校验已解析的值，供 T5 的构造函数使用）、`checkPushPayloadText`（字节上限 → `JSON.parse` → 校验）、`validatePushPayload`（worker 用，不合格返回 `null`）。
- 细则：
  - 长度按 Unicode 码点计数；各字段上限按规格，`url` 另设 1–2048 码点的格式上限（落点范围由 worker 检查）。
  - 多余字段报在整体路径 `""` 上，不回显键名；缺少 `title` 报 `push.payload-field-type`。
  - 从不调用访问器属性；成功时返回新的冻结对象；任何输入都不抛出。
  - `checkPushPayload` 本身不检查字节数，T5 的构造函数须对序列化结果另做字节检查。
- 测试：新增 49 条（`test/push-payload.test.ts`），含"错误中不出现输入标记"的断言；sw-runtime 单元测试 147 条。全仓 build、test（1340 条）、typecheck、lint 退出 0。

**变异**（子代理四个，主会话复做 a 与 c，结论一致，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a 长度改按 UTF-16 单元计数 | 5 条转红（五个字段的边界各一条） |
| b 去掉字节上限 | 2 条转红 |
| c 放行多余字段 | 2 条转红 |
| d 返回输入对象本身 | 1 条转红 |

### 任务 3：平台 worker 的 `push` 与 `notificationclick`

**说明：** 在 `attachPlatformWorker` 中注册两个新监听，行为按规格第 2 节。

**验收标准：**
- 监听集合断言由四个改为六个，每个一次；这是独立源既有测试中唯一改动的断言。
- `push`：合格时展示一次、标题与各字段映射正确、`waitUntil` 收到展示的 Promise；不合格、为空、解析失败时不展示，且不调用任何日志。
- `notificationclick`：关闭通知；目标地址解析覆盖相对地址、绝对同源 scope 内、跨源、同源 scope 外、`..` 与百分号编码绕过、解析失败，后四者退回 scope 根地址；已有地址完全相同的同源窗口时聚焦，否则 `openWindow`；从不调用 `navigate`。
- 两个监听不打开、不读写任何缓存（假缓存存储断言零调用）。
- 变异：去掉范围检查、把"完全相同"改为前缀匹配、合格判定恒真，各自至少一条测试转红。

**验证：** sw-runtime 单元测试通过；全仓回归通过（含 vite、nuxt、examples 的浏览器测试，它们构建出的 worker 会带上新监听）。

**依赖：** T2。

**预计范围：** M。

#### T3 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。子代理遵守了"不用 git 还原"的要求。**

- `attachPlatformWorker` 新增 `push` 与 `notificationclick` 两个监听，注释引用 ADR-0021。
  - `push`：`validatePushPayload` 不合格即返回，不调用 `waitUntil`，不打日志；合格时 `showNotification`，选项只含出现的 `body`、`tag` 与 `data: { url, data }`，无图标与操作按钮。`showNotification` 的 Promise 原样交给 `waitUntil`，不另加处理。
  - `notificationclick`：关闭通知；从 `data.url` 读地址时不调用访问器；新文件 `src/worker/notification-target.ts` 的 `resolveNotificationTarget` 做范围检查（非字符串、解析失败、跨源、带用户名密码、`href` 不以 scope 开头，一律退回 scope）；已有地址完全相同的窗口则聚焦，否则 `openWindow`；失败被吞掉，从不导航已有窗口。
- 既有测试只改了两处监听集合断言（四个改为六个），其余未改。新增 32 条测试（`test/worker/push-notification.test.ts`），含两个监听零缓存调用、零 `console` 调用。
- 结果：sw-runtime 单元测试 179 条；全仓 build、test（1372 条）、typecheck、lint 退出 0；全仓浏览器测试 138 条通过、2 条跳过，vite、nuxt、examples 构建出的 worker 带上新监听后既有场景照常通过。

**变异**（子代理四个，主会话复做 a，结论一致，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a 去掉"以 scope 开头"的检查 | 5 条转红（scope 外、`..`、编码的 `..`、带编码段的绝对路径、前缀相似的兄弟路径） |
| b 已有窗口改为前缀匹配 | 1 条转红 |
| c `push` 不做格式校验 | 3 条转红 |
| d 去掉 `focusOrOpen` 的异常捕获 | 1 条转红 |

**已知边界**：地址中的 `%2f` 不是路径分隔符，`/app/..%2fother` 按字面留在 scope 内；服务器不得对路径做规范化（运维手册已有要求），T9 评审时复核。

### 任务 4：恢复 worker 取消推送订阅

**说明：** 恢复 worker 激活时，在删除本应用缓存之后取消本注册的推送订阅。

**验收标准：**
- 有订阅时调用一次 `unsubscribe`；无订阅时不报错；`getSubscription` 或 `unsubscribe` 失败时，缓存删除与接管照常完成。
- 删除顺序：先删缓存，再取消订阅（测试断言调用顺序）。
- 恢复 worker 的监听集合仍只有 `install` 与 `activate`。
- 变异：去掉取消订阅，或让取消失败中断接管，各自转红。

**验证：** sw-runtime 单元测试与浏览器测试通过；全仓回归通过。

**依赖：** T2（可与 T3 并行）。

**预计范围：** S。

#### T4 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。子代理遵守了"不用 git 还原"的要求。**

- 恢复 worker 的 `recover()` 在删除本应用缓存之后、`clients.claim()` 之前调用 `cancelPushSubscription`：没有 `pushManager` 时跳过；`getSubscription` 或 `unsubscribe` 失败被吞掉；不打日志。监听集合仍只有 `install` 与 `activate`，注释引用 ADR-0021。
- 删除缓存失败时的行为与原来相同（在取消订阅之前就已拒绝）。
- **既有断言的改动**：两条断言精确调用顺序的测试，期望序列中加入了 `getSubscription`（"删除完成后才接管"与"没有缓存时只接管"），这是计划允许的例外；其余既有断言未改。新增 6 条测试。
- 结果：sw-runtime 单元测试 185 条，浏览器测试 17 条（真实恢复 worker 的演练场景通过）；全仓 build、test、typecheck、lint 退出 0；全仓浏览器测试 138 条通过、2 条跳过。

**变异**（子代理三个，主会话复做 a，结论一致，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a 去掉取消订阅 | 6 条转红 |
| b 去掉异常捕获（取消失败中断接管） | 3 条转红 |
| c 取消订阅移到删除缓存之前 | 5 条转红 |

**已知边界**：`getSubscription` 若永不返回，接管会一直等待；真实浏览器中未观察到，记为 T9 评审项。

### 检查点 B：worker 侧就位

- 全仓回归通过；独立源既有测试除监听数量断言外未改。

### 任务 5：新包骨架与后端入口

**说明：** 建立 `@pwa-platform/push`（结构参照 entry-resilience），实现 `./server` 入口：再导出格式模块，并提供 `createPushPayload`。

**验收标准：**
- 包只依赖 `@pwa-platform/sw-runtime: workspace:*`，无第三方依赖；lockfile 只多出本包的 importer。
- `createPushPayload` 与 worker 使用同一份校验实现（一致性测试：同一组输入两边结论相同）；不合格时抛出带诊断码的错误，信息中不含输入值。
- 后端入口不引用任何浏览器全局对象，在 Node 中可直接运行（测试在 node 环境跑）。
- 公开导出测试钉住导出集合。

**验证：** `pnpm --filter @pwa-platform/push test` 通过；全仓 build、test、typecheck、lint 通过；`pnpm install --frozen-lockfile` 通过。

**依赖：** 检查点 B。

**预计范围：** M（新包脚手架文件多，但逻辑少）。

#### T5 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收并修复一处遗漏。子代理遵守了"不用 git 还原"的要求。**

- 新包 `@pwa-platform/push`（结构参照 entry-resilience），本任务只有 `./server` 一个导出入口；唯一依赖 `@pwa-platform/sw-runtime: workspace:*`，无 devDependencies（`typescript`、`vitest` 由工作区根解析，与 contracts 相同）。根目录的 lint 与构建配置自动覆盖新包，无需改动。
- `./server` 再导出 sw-runtime 格式模块的类型、常量、`checkPushPayloadText`、`validatePushPayload`；新增 `PwaPushPayloadInput`、`PwaPushPayloadError`（信息格式为"诊断码 at 路径"，不含输入值）与 `createPushPayload`（描述符拷贝、`checkPushPayload`、序列化、`checkPushPayloadText` 字节检查）。输入自带 `v` 键时按多余字段拒绝。
- 新增 `tsconfig.server.json`：只用 ES 库、不含 DOM 类型检查后端入口，证明它不依赖浏览器全局对象。
- **主会话发现并修复**：拷贝目标原为普通对象，输入里自有的 `__proto__` 键（如 `JSON.parse` 产出）会改掉拷贝的原型而不是成为字段，多余字段因此被悄悄吞掉。先补测试确认转红，再改为 `Object.create(null)`，测试转绿。
- lockfile 只多出 `packages/push` 的 importer（依赖 sw-runtime 的 `link:`），`pnpm install --frozen-lockfile --offline` 通过。
- 测试：新包 39 条（导出、清单、导入闭包、源码扫描、14 行一致性表、字节上限、访问器、非对象、`v` 键、`__proto__`、错误不含输入）。全仓 build、test、typecheck、lint 退出 0（子代理执行；主会话的修复后重跑了新包的 test、typecheck、lint）。

**变异**（子代理三个，主会话复做 a，结论一致，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a 去掉序列化后的字节检查 | 1 条转红 |
| b 直接展开输入而非描述符拷贝 | 1 条转红（访问器被调用） |
| c 把输入值写进错误信息 | 4 条转红 |

### 任务 6：页面入口

**说明：** 实现规格第 3 节的 `getPushState`、`subscribePush`、`unsubscribePush`。

**验收标准：**
- 六种状态各有测试；特性检测不读 `navigator.userAgent`（源码扫描测试）。
- 只在 `subscribePush` 中调用 `Notification.requestPermission`；`getPushState` 从不请求权限。
- 按 scope 取注册且 scope 完全相同；没有注册时不注册 worker。
- 公钥格式在调用浏览器之前校验；已有订阅公钥相同时直接返回，不同时拒绝且不取消原订阅。
- 不发任何网络请求（源码扫描禁止 `fetch`、`XMLHttpRequest`、`sendBeacon`）；错误信息中不含订阅地址（测试构造含标记的地址并断言）。

**验证：** 新包单元测试通过；全仓回归通过。

**依赖：** T5。

**预计范围：** M。

#### T6 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。子代理遵守了"不用 git 还原"的要求。**

- 新包增加页面入口 `.`（`src/client/index.ts`），不导入任何模块，也不导入 `./server` 与 sw-runtime。导出 `getPushState`、`subscribePush`、`unsubscribePush`、`PwaPushClientError`（信息恰为错误码，不带 `cause`）、`PUSH_CLIENT_ERROR_CODES`（8 个）及类型。
- 行为按规格第 3 节：
  - 三个函数先校验 `scope`（以 `/` 开头结尾、不含 `?` 与 `#`），不合格以 `push.invalid-target` 拒绝。
  - 特性检测只看全局对象是否存在；注册按 `scope` 精确比较；从不注册 worker。
  - 状态判断顺序：不支持 → 无注册 → 权限被拒 → 已订阅 → 待请求 → 未订阅。权限被拒时即使存在订阅也报 `denied`（订阅已收不到推送）。
  - 订阅时先严格解码公钥（base64url、无填充、尾部位为零、65 字节且以 0x04 开头），再接触浏览器；已有订阅且公钥相同时直接返回，不同时拒绝且不动原订阅；只在权限为 `default` 时请求权限；浏览器的订阅错误整体丢弃，改报 `push.subscribe-failed`。
- 测试：新包 118 条（页面入口新增 79 条及边界测试扩展），含"错误中不出现订阅地址标记"、源码扫描（无 `userAgent`、网络、存储、日志与 `.register(`）。lockfile 无变化；全仓 build、test（1496 条）、typecheck、lint 退出 0。
- 已知边界：`getRegistration` 与 `getSubscription` 自身的拒绝原样透出（浏览器错误不含订阅信息）；T9 评审时复核。

**变异**（子代理四个，主会话复做 a，结论一致，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a 去掉 scope 精确比较 | 1 条转红 |
| b `getPushState` 在 `default` 时请求权限 | 1 条转红 |
| c 公钥不同时取消原订阅并重新订阅 | 2 条转红 |
| d 透出浏览器的订阅错误 | 2 条转红 |

### 任务 7：真实浏览器证据

**说明：** 在 Chrome 桌面端按规格测试策略验证，场景范围以 T1 探路结论为准。

**验收标准：**
- sw-runtime 浏览器测试：授予通知权限后，经 CDP 投递合格推送，`getNotifications()` 读到一条标题与正文正确的通知；投递不合格推送，读不到平台通知；既有场景照常通过。
- 若 T1 证明可行：新包浏览器测试覆盖 `getPushState` 的真实状态与订阅、取消订阅；通知点击的打开与聚焦。不可行的部分写入实施记录与验证记录。
- 等待以状态为准；每个场景一次变异，死在目标断言上；`--repeat-each 10` 无失败。

**验证：** 相关包的 `test:browser` 通过；变异与重复运行结果写入实施记录。

**依赖：** T4、T6。

**预计范围：** M。

#### T7 实施记录（2026-09-18）

**实现由 `executor` 子代理完成；投递丢失由 `debugger` 子代理在临时目录中定位；主会话验收并加强反向场景。**

**sw-runtime 浏览器测试**（`browser-tests/push.spec.ts`，使用既有 v1 站点，`fixture-site.ts` 与 `global-setup.ts` 未改）：
1. 合格推送：经 CDP `ServiceWorker.deliverPushMessage` 投递，`getNotifications()` 读到一条通知，标题、正文、tag 与 `data: { url, data }` 正确。
2. 不合格推送不显示：非 JSON 与含多余字段的推送各投递 8 次，再投递 tag 为 `sentinel` 的合格推送；等哨兵出现后，断言由平台 worker 显示的通知（`data` 带 `url` 的）恰好只有哨兵。
3. 点击：在真实 worker 内派发合成的 `notificationclick`，通知被关闭。打开或聚焦窗口无法证明（T1）。

**新包浏览器测试**（`packages/push/browser-tests/`，自带最小经典 worker 的夹具站点，直接以 ES 模块提供构建出的 `dist/client/index.js`）8 个场景：无注册 → `no-registration`；授予权限 → `not-subscribed`；未授予 → Chrome 报 `default`，即 `prompt`；有效公钥订阅 → `push.subscribe-failed`（真实失败路径）且状态不变；无效公钥 → `push.invalid-key`；取消订阅 → `null`；兄弟 scope → `no-registration`；**较宽 scope 注册、查询较窄 scope** → `no-registration`（子代理补充：浏览器对兄弟 scope 本就返回空，只有这一条对"scope 精确比较"的变异敏感）。

**投递"丢失"的定位**（临时目录中带埋点的最小 worker，9 组各 40 次，共 360 次投递）：
- 推送处理函数 360/360 次被调用，`showNotification` 360/360 次成功返回，0 次拒绝。
- 丢失发生在登记之后：`showNotification` 成功返回，但约 20%–65% 的通知从此不出现在 `getNotifications()` 中，之后也不会出现。完全不经过推送与 CDP、在页面上直接调用 `showNotification`，5 次中仍丢 3 次。
- 排除了同时打开的通知数上限、无头与有界面的差异、投递间隔。结论：这是本机 Chrome 153 与自动化环境下通知接口本身的行为，与推送投递和平台 worker 无关，平台代码无法也无需处理。原因（例如 macOS 系统通知权限）未查证。
- 因此正向场景用"同一 tag 重投直到可见"（`deliverPushUntilShown`，至多 10 次）是符合失败方式的做法；反向场景由主会话把每类不合格推送从 1 次改为 8 次，使单类漏检率从约 50% 降到约 0.4%。

**其他改动**：
- 根目录 `eslint.config.js` 一行：把既有的"worker 全局变量"例外扩展到 `packages/push/browser-tests/site/**/*.js`（静态经典 worker 夹具），沿用文件中的先例；这是超出原定改动范围的唯一文件，lint 门禁要求如此。
- 新包 devDependencies：`@playwright/test` 1.63.0、`@pwa-platform/browser-test-harness`、`@types/node` 24.13.4，均为仓库已有版本；lockfile 只多出本包 importer 的 devDependencies 段。包清单测试随之更新。

**变异**（均还原，`shasum` 一致）：

| 变异 | 结果 |
|---|---|
| a `push` 监听一律提前返回 | 3 个 sw-runtime 场景全部转红 |
| b 显示的标题加前缀 | 场景 1 转红 |
| c 去掉 `notification.close()` | 场景 3 转红 |
| d 页面入口去掉 scope 精确比较 | 较宽 scope 场景转红（兄弟 scope 场景不敏感，见上） |
| e 有注册即报 `subscribed` | 3 条转红 |
| f（主会话）worker 把不合格推送也按固定标题显示 | 加强后的场景 2 在 5/5 次重复中转红（多出 16 条平台通知）；基线 3/3 通过 |

**稳定性**：
- 子代理最初把两个包的 `--repeat-each 10` 并行运行，sw-runtime 的点击场景失败一次（worker 内 `getNotifications({ tag })` 为空，而页面刚确认过该通知存在）；同时推送包的运行出现浏览器启动超时（明确的资源争用）。按顺序重跑：sw-runtime 30/30、推送包 80/80 通过。那次点击失败的原因**未查证**，未修改测试。
- 主会话加强场景 2 后，sw-runtime 的 `push.spec.ts` 按顺序 `--repeat-each 10`：30/30 通过（1.2 分钟）。
- 全仓 build、test、typecheck、lint、test:browser 退出 0（子代理执行）；`pnpm install --frozen-lockfile --offline` 通过。

### 检查点 C：证据齐备

- 全部可行场景通过且各有变异；不可行的范围逐条登记。

### 任务 8：文档同步

**验收标准：**
- ADR-0012 增补（指向 ADR-0021）；`spec/sw-runtime.md` 中"不注册其他监听"的表述随之修订。
- `package-boundaries.md` 新增 `@pwa-platform/push` 一节与 sw-runtime 的新入口；安全模型"Push 隐私"补接入要求（推送内容不放令牌与授权信息、打开后重新取数、登出前取消订阅）。
- 兼容性文档：iOS 只对已安装到主屏的应用提供推送；Safari、Firefox 属渐进兼容档。
- 接入说明：后端用自选的 Web Push 库发送的最小示例（不作为仓库依赖）；Chrome 对不合格推送显示通用提示。
- README 交付状态、路线图 v2 engagement 行、文档基线新增本模块一行（`target`）。
- 全仓相对链接与反引号路径扫描 0 失效（已知误报除外）。

**依赖：** 检查点 C。

**预计范围：** M。

#### T8 实施记录（2026-09-19）

- [ADR-0012](../../docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md) 增补 [ADR-0021](../../docs/adr/0021-push-handling-in-the-platform-worker.md) 的两处修订：平台 worker 的监听集合扩为六个；恢复 worker 在删缓存后取消订阅，失败不阻断接管。`spec/sw-runtime.md` 与包边界同步新入口 `./push-payload`、两个新监听和恢复顺序。
- 新增 [Push 接入说明](../../docs/guides/push-integration.md)：应用在用户手势中订阅并自行把结果交给后端；后端用自选库发送平台格式；内容的 3072 字节上限与隐私要求；Chrome 对不合格 Push 的通用提示；登出与恢复发布后的订阅清理。
- 安全模型、兼容性、README、路线图与文档基线已同步。基线的 `push-module` 行保持 `target`，同一单元格明确分列已证明与未证明的证据；表格逐行核对为四列，没有空行截断。
- 会话临时目录中的链接扫描器按受版本控制的 Markdown 文件检查相对链接、锚点与反引号的仓库路径；T9 的验证记录尚未创建时，仅剩三处对该预期文件的引用。T9 写入该文件后会重跑并要求 0 失效（AGENTS 与 shared-origin plan 中的两处已知历史路径误报除外）。

### 任务 9：模块质量门禁

**验收标准：**
- 干净 worktree 冻结安装后，lint、build、test、typecheck、test:browser 全部通过；本模块浏览器测试 `--repeat-each 10` 无失败。
- lockfile 变化只有新包的 importer；逐项解释。
- 新上下文独立评审，重点：
  - 推送内容或订阅地址是否可能进入日志、错误信息或诊断；
  - 点击目标的范围检查能否被绕过；
  - 平台 worker 的新监听是否影响 `fetch` 判定或缓存；
  - 不使用推送的应用是否真的不受影响（页面不加载推送代码、不请求权限）；
  - 恢复 worker 取消订阅失败时是否仍完成接管；
  - 测试是否可能空过。
- 阻断项与应修项处理完毕。
- 产出 `tasks/push-module/verification.md`：门禁结果、浏览器矩阵字段、未取得的证据（至少包括 CI、Android、真实推送服务、真实的通知点击）。文档基线中本模块一行保持 `target`。

**依赖：** T8。

**预计范围：** M。

#### T9 实施记录（2026-09-19）

- 分支已从 `54a6ab7` rebase 到本地 `main` `5fe9b0a`，T8 为 `bf2ead3`。干净 detached worktree 的冻结安装、lint、build、test、typecheck、全仓浏览器测试都通过；初次离线安装仅因本机 store 缺少已锁定 tarball 失败，经项目所有者授权的冻结安装填充 store 后，最终 worktree 的 `--offline` 重跑通过。
- lockfile 相对 `main` 只含 `packages/push` importer：sw-runtime 的 workspace 依赖及 `@playwright/test@1.63.0`、browser-test-harness、`@types/node@24.13.4` 三项既有开发依赖；无解析树变化或豁免。
- 独立评审发现 browser API 查询的 rejection 会原样透出，可能含订阅地址。主会话以 endpoint-marker RED 测试确认（3 条均失败），新增固定 `push.registration-failed` / `push.subscription-failed` 映射后 GREEN；唯一锚点变异改错错误码使 2 条目标断言转红，补丁还原后 SHA-256 一致。T6 记录的“原样透出”边界至此已处理。
- 最终证据、浏览器矩阵、重复运行、恢复演练、独立评审与未取得的证据见 [verification.md](verification.md)。Android 两档、CI、真实 Push 服务/订阅、真实点击打开或聚焦，以及 T7 并行失败根因仍未取得；文档基线行保持 `target`。

## Task List

> Tasks tracked in this plan using local ids (T1–T9). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword。

### Phase 1：决定

- T1 ADR-0021 提议稿与浏览器探路

### 检查点 A：ADR 已接受，探路有结论

### Phase 2：worker 侧

- T2 推送格式模块（blocked by 检查点 A）
- T3 平台 worker 的 `push` 与 `notificationclick`（blocked by T2）
- T4 恢复 worker 取消推送订阅（blocked by T2，可与 T3 并行）

### 检查点 B：worker 侧就位

### Phase 3：新包与证据

- T5 新包骨架与后端入口（blocked by 检查点 B）
- T6 页面入口（blocked by T5）
- T7 真实浏览器证据（blocked by T4、T6）

### 检查点 C：证据齐备

### Phase 4：交付

- T8 文档同步（blocked by 检查点 C）
- T9 模块质量门禁（blocked by T8）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **平台 worker 行为变化波及所有已交付应用** | 高：独立源应用回归 | 新监听只响应推送与点击事件，不碰 `fetch` 与缓存；每个改动 sw-runtime 的任务跑全仓回归，含 vite、nuxt、examples 的浏览器测试 |
| **推送内容或订阅地址泄漏到日志与错误信息** | 高：违反可观测性与安全模型 | 错误只报诊断码与字段路径；带标记值的断言；评审重点 |
| **点击目标越出本应用** | 高：通知被用作跳转到任意地址 | 按源与 scope 整段比较，覆盖编码与 `..` 绕过；变异证明 |
| **真实浏览器无法触发推送或点击** | 中：证据不足 | T1 先探路；做不到的部分登记为未取得的证据，不用替身冒充 |
| **恢复 worker 取消订阅失败阻断恢复** | 中：恢复流程失效 | 取消放在删缓存之后，失败被吞掉；测试钉住顺序与失败路径 |
| **后端与 worker 对格式的判断不一致** | 中：后端构造的推送被 worker 丢弃 | 单一实现再导出；一致性测试 |
| **E2E 不稳定或空过** | 中：证据失真 | 等待以状态为准；每场景变异；`--repeat-each 10` |

## 修订：真实订阅与真实送达的证据收尾

规格见[模块规格](../../spec/push-module.md)的"修订：真实订阅与真实送达的证据收尾"，示例侧契约见 [examples-browser-e2e 修订](../../spec/examples-browser-e2e.md)的"修订：React 示例的 Push 演示"。分支 `claude/pwa-platform-review-cba86f`，基于 `main` 的 `c68925b`。每个任务一个提交，提交信息带 `Task: XP<n>`。

### 架构决定

- **全部改动落在私有的示例包里。** `@pwa-platform/push`、sw-runtime 的源码与公开契约零改动，由门禁时的 `git diff --stat` 佐证。
- **测试通过演示页 UI 取得订阅，不加页面钩子。** 联网套件点击"订阅"，再通过"复制订阅 JSON"从剪贴板读出订阅（授予 `clipboard-read`/`clipboard-write`）。这样验证的就是业务方照抄的写法本身，也不必像入口恢复那样常驻测试钩子。如果 XP4 实测剪贴板在无头持久化 context 中不可用，停下来问，不自行改成钩子。
- **持久化 context 由联网套件自己启动。** 不改 browser-test-harness 的 `test` 夹具（它基于 `newContext()`）；套件内用 `chromium.launchPersistentContext(临时目录, { channel: "chrome", headless: true })`，每个测试一个临时 profile，结束后删除。
- **联网套件复用既有的站点构建与静态服务。** 沿用 `browser-tests/global-setup.ts` 和 `sites.ts`，只新增独立的 Playwright 配置 `playwright.network.config.ts`，其 `testDir` 为 `browser-tests-network/`。默认的 `playwright.config.ts` 不会扫描到它。
- **执行分工。** XP2、XP3、XP5 的实现派给 `executor` 子代理（sonnet），XP6 的查证派给 `debugger` 子代理；主会话负责验收、变异和提交。XP4 留在主会话，因为它要在真实网络下逐项判断失败原因。XP7 由项目所有者本人操作。

#### XP1：规格修订与本计划

**验收：** 规格修订已提交（`486be69`）；本节与 Documentation delivery 表一起提交；项目所有者确认后开始 XP2。

#### XP2：测试用发送器（TDD，完成：`e6c9203`；11 项单元测试，RFC 8291 附录 A 向量逐值对照 RFC 原文；主会话验收时把非 2xx 由抛错改为返回状态码；两处变异分别使 3 项、1 项转红）

**范围：** 在 `packages/examples-browser-e2e/push-tools/` 下新增 `sender.ts`，提供 `createVapidKeys()` 与 `sendTestPush(subscription, keys, payloadText)`，只依赖 `node:crypto` 与全局 `fetch`。拆出 `encryptPayload`（可注入发送方密钥和 salt）与 `createVapidAuthorization`（可注入时间），以便使用测试向量。

**验收：**
- 用 RFC 8291 附录 A 的测试向量，加密结果逐字节一致。
- VAPID JWT 能用对应公钥验签（ES256，`ieee-p1363`）；`aud` 等于 endpoint 的 origin，`exp` 距当前时间不超过 24 小时。
- 带标记的 endpoint、`auth`、私钥在所有错误路径的消息中都不出现；非 2xx 响应只返回状态码，不读取也不返回响应体。
- 两处变异转红：加密时去掉末尾的 `0x02` 分隔符；JWT 的 `aud` 改用完整 endpoint。

**验证：** `pnpm --filter @pwa-platform/examples-browser-e2e test`、`typecheck`、`pnpm lint`。

**范围估计：** 小，2–3 个文件（含 vitest 或 tsconfig 的 include 调整）。依赖：XP1。

#### XP3：React 演示面板（完成：`78281c9`；既有浏览器场景 47 项无回归，Vue、push、sw-runtime 零改动，lockfile 只多一个 workspace importer；主会话补了 `getPushState` 的 rejection 处理与启动时的注册竞态）

**范围：** 示例包新增 workspace 依赖 `@pwa-platform/push`（lockfile 只多一行 importer）；React 示例新增一个 Push 面板组件，在 `app.tsx` 中挂载。面板包含：状态显示（`getPushState({ scope: SHELL_URL 对应的 scope })`）、公钥输入框、订阅与取消订阅按钮、"复制订阅 JSON"按钮，以及最近一次操作的结果或错误码。

**验收：**
- 页面任何地方都不渲染 endpoint，错误只显示诊断码。
- 订阅只在按钮点击时发起；不支持 Push 时显示 `unsupported`，页面其余部分正常。
- 面板元素的 id 使用 `push-` 前缀，不与两站共享的既有 id 冲突。
- 既有单元测试与 `test:browser` 全部通过，且断言不改；Vue 示例零改动。

**验证：** 包内 `test`、`typecheck`、`test:browser`；`pnpm lint`；`git diff --stat -- packages/examples-browser-e2e/apps/vue` 为空。

**范围估计：** 中，4 个文件（`package.json`、`pnpm-lock.yaml`、面板组件、`app.tsx`）。依赖：XP1，可与 XP2 并行。

### 检查点 A（XP2、XP3 之后）

- 发送器单元测试与变异通过；演示页在本地构建中可见，既有测试无回归。

#### XP4：联网套件（完成：`6293e19`；`--repeat-each 5` 20/20；默认 `test:browser` 仍为 47 项；两处变异转红；断网验证留到检查点 B 由项目所有者配合。实测两处环境现象并已在测试中处理：新订阅偶发被推送服务以 410 拒绝，15 个新订阅中 3 个；紧密轮询 `getNotifications()` 会丢通知，见 XP6）

**范围：** 新增 `playwright.network.config.ts`、`browser-tests-network/push.network.spec.ts`，以及脚本 `test:browser:network`。实现规格中的 4 个场景：真实订阅；合格负载经 FCM 送达后展示通知，且标题、正文、tag 一致；不合格负载不展示平台通知；取消订阅后再发，返回 `404` 或 `410`。

**验收：**
- 4 个场景在 Chrome 桌面 N 上通过，`--repeat-each 5` 无失败。
- 不合格负载场景中，以"平台 worker 展示的通知带 `data.url` 属性"为判据（沿用 sw-runtime `push.spec.ts` 的写法），区分平台通知与 Chrome 的通用提示。
- 断网运行时整套以明确原因失败，不跳过，不计为通过（手动断网验证一次，写入验证记录）。
- 默认的 `pnpm test:browser` 不包含这套测试：用 `--list` 比较前后的用例清单，证明没有变化。
- 两处变异转红：平台 worker 的 `push` 监听直接返回（在构建产物副本上临时修改）；发送时把负载换成不合格负载。

**验证：** `pnpm --filter @pwa-platform/examples-browser-e2e test:browser:network -- --repeat-each 5`；默认 `test:browser` 的 `--list` 对比。

**范围估计：** 中，3 个文件。依赖：检查点 A。

#### XP5：本地发送脚本（完成：`1281989`；主会话把动态 `import(new URL(...))` 改为 push-tools 自有 tsconfig 与静态 `.ts` 导入，同 release-verifier；冒烟：`push:keys` → 演示页订阅 → `push:send` 输出 `status 201`，通知字段一致）

**范围：** `push-tools/keys.ts` 与 `push-tools/send.ts`，对应脚本 `push:keys` 与 `push:send`，用 Node 24 直接运行 `.ts`，与包内既有脚本的写法一致。根目录 `.gitignore` 增加 `.push-demo/`。

**验收：**
- `push:keys` 写入 `.push-demo/vapid.json`，文件权限 `0600`；文件已存在时不覆盖，除非带 `--force`；终端只打印公钥。
- `push:send` 从 `--subscription <file>` 或 stdin 读取订阅，参数包括 `--title`、`--body`、`--url`、`--tag`，经 `createPushPayload` 构造后发送；只打印状态码。
- 用脚本走通一次：`push:keys` → 在演示页订阅 → `push:send`，通知出现。这一步由主会话在无头持久化 context 中完成，作为冒烟测试。
- `git status` 中看不到 `.push-demo/`。

**验证：** 上述冒烟测试；`pnpm lint`、`typecheck`。

**范围估计：** 小，3–4 个文件。依赖：XP2、XP3。

### 检查点 B（XP4、XP5 之后）

- 真实链路已由自动化与脚本两种方式证明。与项目所有者约定 XP7 的操作时间。

#### XP6：查证 `getNotifications()` 查不到通知（完成：已定位触发条件——通知创建后立即以约 100 ms 间隔紧密轮询 `getNotifications()` 会使其永久丢失，与投递方式及 context 类型无关；Chromium 内部机制未定位；结论写入 XP8 的验证记录）

**范围：** 限时查证，最多一个会话，脚本放在会话临时目录，不入库。分别比较以下三种投递方式下"登记后查不到"的比例：CDP 合成投递、经 FCM 的真实投递、页面直接调用 `showNotification()`。并检查有无 tag、间隔快慢、是否使用持久化 context 等变量的影响。

**验收：** 验证记录中写明每组条件的样本数与漏检率。能定位根因时写出根因；不能定位时如实写明"限时内未定位"及已排除的因素。本任务不改任何测试或实现；若结论表明现有变通可以去掉，另开任务处理。

**范围估计：** 小（只产出文档）。依赖：检查点 A，可与 XP4、XP5 并行。

#### XP7：人工证据——真实点击（2026-09-25“中凯”及原日常“嘉年”资料两种情况均通过）

**范围：** 项目所有者在桌面 Chrome 的日常 profile 中执行：启动示例 → 在演示页订阅 → 用 `push:send --url <scope 内某路径>` 发送 → 点击系统通知。分两种情况各做一次：已有相同地址窗口时应聚焦该窗口；没有时应新开窗口。

**验收：** 验证记录登记日期、Chrome 版本、两种情况的结果，并标注为人工证据。未执行时继续登记为未取得，不阻断 XP9。

**依赖：** 检查点 B。

#### XP8：文档同步（完成：见本任务的提交）

**范围：**
- ADR-0021 追加"补充（2026-09-24）"一节，修正归因，原文不改；
- [Push 接入说明](../../docs/guides/push-integration.md)新增"本地联调"一节：持久化 profile 的要求、`push:keys`/`push:send` 的用法、联网套件的运行方式，并提醒这些都是测试工具，不能用作生产后端；
- 本模块验证记录追加本次修订的证据；
- 文档基线中本模块一行更新"已证明/未证明"，状态仍为 `target`；
- 示例模块验证记录交叉引用；
- 填写 Documentation outcome。

**验收：** 相对链接检查通过；`git diff --check` 通过；Spec Guard 文档核验为 `ready`。

**范围估计：** 中，5–6 个文档。依赖：XP4–XP7。

#### XP9：质量门禁与独立评审（完成：干净 worktree 门禁全绿；独立评审阻断 0、应修 3，已在 `28faba3` 修复并补变异；见验证记录"XP9"）

**范围：** 在干净 worktree 中跑全仓 `pnpm install --frozen-lockfile --offline`、`lint`、`build`、`test`、`typecheck`、`test:browser`，另跑一次联网套件；由新上下文做独立评审，重点检查：泄漏 endpoint 或密钥、联网套件空过、默认门禁被改动、push 与 sw-runtime 被意外改动；审阅 lockfile。

**验收：** 全部通过；评审没有阻断项，应修项已处理；`git diff main --stat -- packages/push packages/sw-runtime` 为空。

**范围估计：** 小。依赖：XP8。

### Task List（修订）

- XP1 规格修订与本计划
- XP2 测试用发送器（blocked by XP1）
- XP3 React 演示面板（blocked by XP1，可与 XP2 并行）
- 检查点 A
- XP4 联网套件（blocked by 检查点 A）
- XP5 本地发送脚本（blocked by XP2、XP3）
- XP6 查证 `getNotifications()`（blocked by 检查点 A，可与 XP4、XP5 并行）
- 检查点 B
- XP7 人工真实点击（blocked by 检查点 B，由项目所有者执行）
- XP8 文档同步（blocked by XP4–XP7）
- XP9 质量门禁与独立评审（blocked by XP8）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| endpoint 或 VAPID 私钥进入日志、错误、页面或仓库 | 高：endpoint 是能力 URL，泄漏即可被他人推送 | 发送器只返回状态码；带标记的断言；`.push-demo/` 被忽略、权限 `0600`；评审重点 |
| FCM 或网络波动导致联网套件不稳定 | 中：证据失真或误报 | 套件不进默认门禁；失败时按"网络/FCM 状态码/展示"分阶段报告；重复 5 次 |
| 联网套件空过（例如订阅失败却被当作通过） | 中 | 断网时必须失败；两处变异 |
| 剪贴板在无头持久化 context 中不可用 | 低：XP4 受阻 | 实测后如不可用即停下来问，不自行加钩子 |
| 只改 React 引起两站漂移 | 低 | PWA 配置不变；新 id 统一用 `push-` 前缀；Vue 零改动由 `git diff --stat` 佐证 |
| RFC 测试向量抄错，导致单元测试自洽但实际错误 | 中 | 向量取自 RFC 原文并注明出处；XP4 的真实送达是最终判据 |

### 执行顺序（修订）

XP1 → 确认 → XP2 ∥ XP3 → 检查点 A → XP4 ∥ XP5 ∥ XP6 → 检查点 B → XP7（项目所有者）→ XP8 → XP9。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| decisions | `docs/adr/` | ADR-0021 追加补充节，修正订阅失败的归因。 |
| examples-browser-e2e | `spec/examples-browser-e2e.md`、`docs/guides/update-prompt.md`、`tasks/examples-browser-e2e/verification.md` | 登记 React 演示页与联网套件，交叉引用 push-module 的验证记录。 |
| push-module | `spec/push-module.md`、`docs/adr/0021-push-handling-in-the-platform-worker.md`、`docs/guides/push-integration.md`、`tasks/push-module/verification.md` | 登记真实订阅、真实送达、`getNotifications()` 查证结论与人工点击证据。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| decisions | delivered | `docs/adr/0021-push-handling-in-the-platform-worker.md` | 追加"补充（2026-09-24）"，更正订阅失败的归因，登记真实送达与 `getNotifications()` 的触发条件。 |
| examples-browser-e2e | delivered | `tasks/examples-browser-e2e/verification.md` | 登记 React 演示面板与联网套件；后续补记桌面 N-1 浏览器路径选择和两版联网结果，交叉引用 push-module 的验证记录。 |
| push-module | delivered | `tasks/push-module/verification.md` | 登记真实订阅、真实送达、XP6 结论与 XP7 两份资料各两项人工点击结果；原资料初次未显示通知及重订阅后通过的过程另记；后续补记桌面 N-1 联网四场景通过及剩余缺口；接入说明新增"本地联调"。 |

## 后续：sw-runtime 通知查询改为稀疏轮询（XP6 后续）

XP6 的结论是：通知创建后立即紧密轮询 `getNotifications()` 会使它永久丢失。sw-runtime `packages/sw-runtime/browser-tests/push.spec.ts` 的 `waitForTagState` 每 50 ms 查询一次，正是这种查询方式；`deliverPushUntilShown` 的"同 tag 最多重投 10 次"是为弥补它而加的。本节只改这个测试文件，sw-runtime 源码与公开契约不变。分支 `claude/gifted-jackson-393ce1`，基于 `claude/pwa-platform-review-cba86f` 的 `08302d0`（XP6 记录所在提交）。

### 假设

- 联网套件"先等 2 秒、再每 2 秒查询一次"的节奏在 CDP 投递下同样适用（XP6 表中"批量后统一查询"一组的丢失率为 0–2.5%）。
- 查"不存在"也要用同样的节奏：紧密轮询可能让通知"消失"，使点击用例在处理器没有关闭通知时也通过。

### PQ1：查询改为先等后稀疏轮询（完成：`cb14652`）

**范围：** `waitForTagState` 改为先等 2 秒，再用 `expect.poll` 每 2 秒读一次 `readNotifications`（写法与联网套件的 `waitForTag` 一致）；同时覆盖"出现"和"消失"两种等待。暂时保留重投，并把每次尝试的超时调整到至少能查询两次。更新注释：丢失的原因是查询方式（XP6），而不是环境。不合格推送用例的语义不变：仍然每种投递 8 次，哨兵最后投递，判据仍为 `isPlatformShown`；只更正其中"只有约一半可见"的说明。

**验收：** 类型检查与 lint 通过；`--repeat-each 10` 全部通过。

### PQ2：测量能否去掉重投（完成：`3fc37ca`；只投递一次共 90/90 通过，对照组 16/30 失败，重投已去掉；`noclose` 变异 23 次中空过 1 次，见验证记录）

**方法：** 两组临时改动（先提交 PQ1，改动不提交），各跑 `--repeat-each 10`（每组 30 个用例）：
1. 对照组：恢复 50 ms 紧密轮询，只投递一次，预期大量失败，用来确认本套件里的触发条件；
2. 实验组：稀疏轮询，只投递一次。

**判据：** 实验组 30/30 通过时才去掉重投，改为只投递一次；只要有一次丢失，就保留重投（次数按数据确定），并在注释和验证记录中写明。

**变异：** 在 sw-runtime 源码上临时修改，不提交：`notificationclick` 不再关闭通知，点击用例必须转红；不合格推送也展示通知，不合格推送用例必须转红。用来证明稀疏轮询没有让"出现"和"消失"两个断言变成空过。

**记录：** 在 `tasks/push-module/verification.md` 的末尾另起一个一级小节。

## 后续：Chrome 桌面 N-1 真实 Push 联网取证（2026-09-25）

规格见[模块规格](../../spec/push-module.md)的同名后续修订。原 XP1–XP9 不包含桌面 N-1；本节单独补证据，不更改既有测试场景或平台运行时。

1. 在隔离工作树中让 `examples-browser-e2e` 的联网套件沿用 `PWA_HARNESS_CHROME_PATH`；未设置时继续使用 `channel: "chrome"`。验证包类型检查、该文件 ESLint 与 `git diff --check`。
2. 从 Google 官方固定版本归档准备 Chrome for Testing 152.0.7977.82，核对归档大小、压缩完整性和可执行文件报告的版本。在该路径下运行 `test:browser:network` 原有四场景，再验证默认稳定版入口没有回归。仅在联网套件内创建临时资料和订阅；不输出端点或密钥。
3. 把日期、macOS 与 Chrome 完整版本、四项逐场景结果和失败限制写入[验证记录](verification.md)，同步[文档基线](../../docs/DOCUMENTATION-BASELINE.md)的已证明／未证明部分。N-1 人工点击、Android 与 CI 的缺口保持原样。

**验收：** N-1 的真实 FCM 四场景全部通过；默认稳定版入口通过；仅有测试入口和对应文档变化，`@pwa-platform/push` 与 sw-runtime 源码零改动。N-1 的真实通知点击不在本节验收范围内；若联网服务或订阅失败，则记录具体阶段，不把发送 `201` 等同于浏览器送达。
