# 规格：network-timeout

> 状态：**已批准（项目所有者，2026-09-24）**。能力图同日新增本模块行，随本规格一起评审通过。

## 目标

弱网下网络请求挂起时，不让用户一直对着空白页等待。业务在策略中显式写一个超时秒数；超过这个时间还没收到网络响应，平台 worker 就改用已有的离线回退或运行时缓存。

成功标准：

- 未写超时的应用：策略、编译出的计划与注入的 worker 配置与本模块之前**逐字节相同**，请求判断不变。
  - **更正（2026-09-24，NT4 实测）**：原稿写"worker 产物逐字节相同"，不成立。导航超时分支写在平台 worker 中，页面侧对 `reason` 的校验与 worker 共用同一份代码，因此未开启的应用的平台 worker、恢复 worker 与页面自身的 JS 包也随平台版本变化（ADR-0038"影响"一节）；注入的 worker 配置不含新键、与此前逐字相同，图标、manifest 等其余产物逐字节相同。
- 写了超时的应用：导航在 N 秒内没有收到响应头时，得到与网络失败时相同的回退（预缓存的应用壳或离线页）；network-first 的运行时缓存在 N 秒后用缓存应答，页面收到 `served-from-cache`，`reason` 为 `network-timeout`。
- 没有任何可用回退或缓存时，继续等网络，绝不因为超时而把一个本来会成功的请求变成错误。

## 已核实的现状（2026-09-24）

| 事实 | 位置 |
|---|---|
| 普通导航（`navigate` 判断）先等网络，只有 `fetch` 被拒绝或返回错误响应时才用回退；没有超时 | `packages/sw-runtime/src/worker/handlers.ts` 的 `navigate()` |
| 运行时缓存的 network-first 使用 Workbox `NetworkFirst`，未设置 `networkTimeoutSeconds` | `packages/engine-workbox/src/worker/runtime.ts` |
| 缓存命中时的 `reason` 只按策略区分：network-first 一律记为 `network-failed` | 同上；`packages/sw-runtime/src/messages/index.ts` 的 `PwaRuntimeCacheReason` |
| public-read-cache 把"不做网络超时"登记为已知限制 | ADR-0035、`docs/guides/public-read-cache.md` |
| Workbox 7.4.1 的 `NetworkFirst`：超时后若缓存命中则用缓存；缓存未命中则继续等网络；网络响应晚到时仍走写入缓存的流程 | `node_modules/.pnpm/workbox-strategies@7.4.1/.../NetworkFirst.js` 的 `_handle` |

## 已确认的前提（项目所有者，2026-09-24）

1. 在 `PwaPolicy` 新增**可选**的顶层字段 `networkTimeoutSeconds`，v1、v2、v3 都可以写；同时作用于导航与运行时缓存的 network-first。
2. **默认关闭**：不写时一切与现在相同。
3. `served-from-cache` 的 `reason` 新增取值 `network-timeout`。
4. 取值为 1–30 的整数秒。
5. 页面直接发出、worker 不拦截的请求不受影响；stale-while-revalidate 不涉及。

## 范围

### 本模块交付

- **契约**（contracts）：`PwaPolicy` v1/v2/v3 的可选 `networkTimeoutSeconds`；`PwaPlan` 的同名可选字段；校验规则。
- **编译**（core）：写了时原样进入计划，未写时计划不含该键。
- **worker 配置与判断**（sw-runtime）：worker 配置新增可选字段；`navigate()` 与运行时缓存的 page/data 路径按下文执行超时；`PwaRuntimeCacheReason` 新增 `network-timeout`。
- **引擎**（engine-workbox）：运行时缓存引擎接受超时秒数，传给 `NetworkFirst`，并区分缓存命中是因为超时还是网络失败。
- **页面事件**（client-runtime）：`served-from-cache` 的 `metadata.reason` 可能为 `network-timeout`；框架绑定只转交，不改。
- **ADR-0038**；public-read-cache 接入说明的已知限制更新；超时的接入说明。

### 不在范围

按路由分别设置超时；对 stale-while-revalidate、预缓存命中、`cache-first` 的请求设置超时；页面直接发出的请求；超时后中止网络请求以节省流量（请求照常完成，结果按下文处理）；后台刷新与重试。

## 依赖

contracts-foundation、policy-compiler、workbox-engine、sw-runtime、client-runtime、public-read-cache（复用其运行时缓存引擎与 `served-from-cache` 信号）。

## 契约

### 策略与计划

```ts
// PwaPolicyV1 / V2 / V3 都增加：
readonly networkTimeoutSeconds?: number;   // 1–30 的整数
// PwaPlan v1 / v2 / v3 都增加：
readonly networkTimeoutSeconds?: number;   // 与策略相同；策略未写时计划不含该键
```

- 校验：非整数、小于 1、大于 30 时报 `schema.invalid-value`，路径 `/networkTimeoutSeconds`；不回显值。写成非 number 类型（例如字符串）时按仓库对数字字段的一贯做法报 `schema.invalid-type`；显式写 `networkTimeoutSeconds: undefined`（键存在但值为 `undefined`，不同于完全不写该键）在 JSON 可序列化性检查阶段即被拒绝，报 `value.not-serializable`，先于该字段自身的 schema 校验。
- 策略不升版本：这是可选字段，旧策略原样有效。

### worker 配置

worker 配置新增可选字段 `networkTimeoutSeconds`，只在计划中存在时写入。未写时 worker 配置的字段集合、键顺序与字节都与本模块之前相同。

### 导航（`navigate` 判断）

设置了超时时：

1. 发起网络请求，同时开始计时。
2. N 秒内网络有响应（包括 4xx/5xx）：与现在相同，返回网络响应。
3. N 秒内网络失败：与现在相同，按顺序使用回退。
4. N 秒到了还没有响应：按顺序查找回退（与第 3 步同一个列表）。
   - 找到时，立即返回回退；之后到达的网络结果被接住并丢弃，不产生未处理的 Promise 拒绝，不写入任何缓存。
   - 一个都没有时，继续等网络，之后按第 2、3 步处理。

未设置超时时，`navigate()` 的行为与现在逐行相同。

### 运行时缓存（public-read-cache 的 network-first）

设置了超时时，引擎把它作为 `networkTimeoutSeconds` 传给 `NetworkFirst`：

- N 秒后缓存命中：用缓存应答，信号 `reason` 为 `network-timeout`（页面导航经由既有的"暂存 + 查询"通道，数据请求直接发给请求它的页面）。
- N 秒后缓存未命中：继续等网络；网络成功则正常返回，网络失败则 page 路径用导航回退、data 路径返回网络错误（与现在相同）。
- 网络响应晚到：通常会写入；worker 被回收时可能丢失（尽力而为）。
- 网络在 N 秒内失败而缓存命中：`reason` 仍为 `network-failed`。

stale-while-revalidate 不受影响。

### 页面事件

`served-from-cache` 的 `metadata.reason` 取值为 `network-failed`、`network-timeout`、`stale-while-revalidate` 之一。按 `reason` 分支处理的业务代码需要接住新值；接入说明写明。

## 命令

```bash
pnpm --filter @pwa-platform/contracts test
pnpm --filter @pwa-platform/core test
pnpm --filter @pwa-platform/engine-workbox test
pnpm --filter @pwa-platform/sw-runtime test
pnpm --filter @pwa-platform/client-runtime test
pnpm --filter @pwa-platform/sw-runtime test:browser
pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm test:browser
```

## 测试策略

- **契约与编译**：合法值 1 与 30、非法值 0、31、1.5、字符串；v1/v2/v3 各一例；未写时计划不含该键（深比较）。
- **worker 单元测试**（假作用域与假计时器）：导航的四个分支（按时响应、按时失败、超时有回退、超时无回退继续等网络）；超时后晚到的网络结果被接住；未设置时行为不变。运行时缓存：超时且缓存命中时 `reason` 为 `network-timeout`、网络失败且缓存命中时为 `network-failed`、超时且未命中时继续等网络。
- **引擎**：超时参数传给 `NetworkFirst`；命中原因的区分。
- **真实浏览器**（Chrome 桌面 N）：一个对指定路径**挂起不返回**的夹具。导航到该路径时，N 秒后显示离线页（或应用壳）；运行时缓存路径在 N 秒后得到缓存内容与 `network-timeout` 信号；未设置超时时同一路径持续挂起（在测试给定的时长内不出现回退）。"挂起"的实现方式（harness 响应规则，或 Playwright 对 worker 请求的路由拦截）由计划的第一个任务实测后决定。
- **逐字节**：未写超时时，注入的 worker 配置与此前逐字相同，平台代码以外的构建产物逐字节相同（一次性对照，写入验证记录）。
- 每个行为配一次变异。

## 边界

- **始终**：未写超时时行为与产物不变；超时只把请求导向已有的回退或缓存，不引入新的缓存写入；晚到的结果不产生未处理拒绝。
- **先询问**：按路由的超时；超时后中止请求；对 SWR 或预缓存设置超时；改变回退顺序。
- **绝不**：因超时把一个本来会成功的请求变成错误；在没有回退也没有缓存时提前返回错误。

## 验收标准

- 上述测试通过，既有测试不改断言（`PwaRuntimeCacheReason` 等固定清单只新增）。
- ADR-0038 被接受，并以增补修订 ADR-0012（导航判断）、ADR-0013（事件 `reason` 取值）与 ADR-0035（已知限制）。
- 接入说明：超时的写法与建议值、`reason` 新值、与离线页和运行时缓存的配合；public-read-cache 接入说明更新已知限制。
- 干净 worktree 门禁通过，独立评审完成；验证记录登记未取得的证据（Android、桌面 N-1、CI，以及真实弱网而非模拟挂起）。

## 开放问题

无。"挂起"夹具的实现方式由计划第一个任务实测决定。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不新增分层。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 新增本模块行记录在能力图的修订节中；关注项本身的权威文档不变。 |
| decisions | create | ADR-0038：导航与 network-first 运行时缓存的网络超时，修订 ADR-0012 的导航判断与 ADR-0035 的已知限制。 |
| lifecycle-and-recovery | follow | 生命周期不变；导航回退的触发条件增加"超时"，记在 ADR-0038 与 sw-runtime。 |
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
| browser-test-harness | follow | 若需要"挂起不返回"的夹具能力，在本模块计划中评估，不改变该关注项的权威文档。 |
| workbox-engine | follow | 引擎端口增加超时参数，记在本模块规格；该关注项的权威文档不变。 |
| sw-runtime | update | 平台 worker 的导航与运行时缓存增加超时；worker 配置新增可选字段。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 插件只转交计划，不需改动。 |
| client-runtime | update | `served-from-cache` 的 `reason` 新增 `network-timeout`（ADR-0013 增补）。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | Nuxt 同样只转交计划。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | update | 其已知限制"不做网络超时"解除，接入说明同步。 |
