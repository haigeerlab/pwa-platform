# 规格：public-read-cache

> 状态：**已批准（项目所有者，2026-09-24）**。能力图同日新增本模块行并评审通过；上限按下文取值，本期不做网络超时。

## 目标

交付路线图 v1.1 cache：业务可以把**已评审为公共内容**的同源 `GET` 读取显式交给平台 worker 做运行时缓存，从而在断网或网络失败时仍能读到最近一次成功的公共数据与公共动态页面。平台负责响应准入、配额、时效、清理和页面可感知的"数据来自缓存"信号；业务负责分类是否正确。

成功标准：

- 未显式开启的应用（v1/v2 策略，以及 v3 中 `runtimeCache.enabled=false`）的请求判断不变，不写入任何运行时缓存，也不会因本模块出现新的登出失败。（2026-09-24 修订：原稿写"行为逐字节不变"；worker 产物体积、配置字段和激活/登出清理的变化见 ADR-0035。）
- 任何不满足准入条件的响应都不会进入平台缓存，且写入失败从不影响返回给页面的响应。
- 页面总能知道一次读取是否由缓存提供、缓存于何时。
- 登出、恢复 worker、配置变更和新版本激活后，不会留下可被读取的过期或越界条目。

决定见 [ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)。

## 已核实的现状（2026-09-24）

| 事实 | 位置 |
|---|---|
| `PwaResourceRule.cache` 已接受 `none` / `cache-first` / `network-first` / `stale-while-revalidate` | `packages/contracts/src/policy.ts:16` |
| 编译器对非拒绝类原样保留策略，拒绝类编译为 `deny` 且排在最前；允许规则落在拒绝前缀下时报 `compile.allow-under-deny` | `packages/core/src/rules.ts:14`、`:45`、`:51` |
| worker 对未预缓存的允许请求一律透传（"v1 没有运行时缓存"） | `packages/sw-runtime/src/worker/decide.ts` |
| **示例应用根路径已声明 `navigation-public-static` + `network-first`**：若直接执行已有字段，现有应用升级后会静默开始运行时缓存 | `packages/examples-browser-e2e/apps/shared/identity.ts:61` |
| `PwaPlan` 有 v1、v2 两个闭合形状；v2 由离线写引入 | `packages/contracts/src/plan.ts` |
| 缓存名为 `pwa:<appId>:<environment>:<seed>:<kind>`，`kind` 目前只有 `precache`；恢复 worker 按 `appCachePrefix` 删除全部平台缓存 | `packages/contracts/src/cache-namespace.ts`、`packages/sw-runtime/src/recovery-worker/index.ts` |
| 引擎只依赖 `workbox-precaching` 7.4.1，端口只做预缓存 | `packages/engine-workbox/package.json`、`spec/workbox-engine.md` |
| 安全模型要求运行时缓存从显式 allowlist 开始，准入前评估 `Vary`、凭据模式、响应头和配额；v1.1 后被标记为用户敏感的分类仍须登出清除 | `docs/architecture/security-model.md` |

## 范围

### 交付

- `PwaPolicy v3` / `PwaPlan v3`：显式开启段与上限，编译期校验与确定性输出；v1/v2 不静默升级。
- 平台 worker 执行两种策略：`network-first`（`public-data` 与 `navigation-public-dynamic`）与 `stale-while-revalidate`（仅 `public-data`）。
- 响应准入、单条大小上限、条目数上限、最长存活时间、浏览器配额错误处理。
- 新的缓存 kind 与激活期清理规则；恢复 worker 通过现有前缀删除自动覆盖。
- client-runtime：新页面生命周期事件 `served-from-cache`；`logout()` 在注销前清空运行时缓存。
- Vite 链路（Vue/React）接受 v3 配置；Nuxt 适配器对启用的 v3 明确报错。
- 引擎端口扩展：经 `workbox-strategies` 与 `workbox-expiration` 实现，不外露 Workbox 类型或选项。
- Chrome 桌面端真实浏览器证据。

### 不交付

- 私有、会话、个性化、鉴权后数据的缓存；`session-data`、`mutation`、`stream`、`unclassified` 的拒绝语义不变。
- 运行时 `cache-first`；`asset` / `navigation-public-static` 的运行时缓存（它们继续走预缓存或透传）。
- 跨源 / CDN 响应、不透明响应、重定向响应、`206` 与带 `Range` 的请求（沿用 ADR-0023）。
- 网络超时（`networkTimeoutSeconds`）、后台刷新、预取、Background Sync、SWR 刷新完成通知。
- Vue/React 绑定上的新公开面；Nuxt 的运行时缓存支持。
- 按规则的独立配额或独立存活时间。

## 契约

### 策略

`PwaPolicy` 升为 `schemaVersion: 3`，在 v2 字段之外新增必填字段：

```ts
type PwaRuntimeCachePolicy = {
  readonly enabled: boolean;
  readonly maxEntries: number;     // 1–200，每个运行时缓存各自计数；enabled=false 时为 0
  readonly maxEntryBytes: number;  // 1–1_048_576，单条响应正文字节上限；enabled=false 时为 0
  readonly maxAgeSeconds: number;  // 60–604_800，写入后可被读取的最长时间；enabled=false 时为 0
};

type PwaPolicyV3 = Omit<PwaPolicyV2, "schemaVersion"> & {
  readonly schemaVersion: 3;
  readonly runtimeCache: PwaRuntimeCachePolicy;
};
```

上限取值于 2026-09-24 评审确定。按"每个运行时缓存各自计数"，最坏占用约 2 × 200 × 1 MiB = 400 MiB，实际受浏览器配额约束。

编译规则（`enabled=true` 时）：

| 资源分类 | `none` | `network-first` | `stale-while-revalidate` | `cache-first` |
|---|---|---|---|---|
| `public-data` | 透传 | **执行** | **执行** | 报错 `compile.runtime-strategy-unsupported` |
| `navigation-public-dynamic` | 透传 | **执行** | 报错 `compile.runtime-strategy-unsupported` | 报错 `compile.runtime-strategy-unsupported` |
| `asset`、`navigation-public-static` | 维持现状（预缓存或透传） | 维持现状 | 维持现状 | 维持现状 |
| 四类拒绝分类 | `deny`，不变 | `deny` | `deny` | `deny` |

- `enabled=false` 时，所有运行时策略按今天的语义透传，编译结果除版本号与 `runtimeCache` 字段外与 v2 相同。
- `enabled=true` 但没有任何可执行规则时，编译给出警告 `compile.runtime-cache-unused`，不报错。
- 动态 HTML 不允许 SWR：已缓存的旧 HTML 会在线上直接展示，而它引用的带哈希资源可能已随新版本从预缓存和宿主移除，页面会损坏。
- contracts 使用专属 `runtime-cache.*` 诊断码，不回显路径以外的输入。输入乱序时 core 输出相同的计划。

### 计划与 worker 配置

`PwaPlan v3` 在 v2 字段之外新增闭合字段 `runtimeCache`：`enabled`、三项上限，以及由编译器从上限和可执行规则计算出的 `configDigest`。worker 配置只携带同样的最小运行时信息，不注入原始 policy。

### 请求判断

对命中可执行规则的请求，worker 先按现有顺序判断（拒绝基线 → `exclude` / `deny` → 预缓存 → `Range` 透传），仍未处理时才进入运行时缓存。请求满足以下全部条件才会被运行时缓存读写，否则透传：

- 同源、`GET`、不带 `Range`、不带 `Authorization` 请求头。
- 缓存键为完整 URL，**包含查询串**。这与离线导航回退忽略查询串（ADR-0034）不同：同一路径不同查询是不同的数据。

### 响应准入

只有同时满足下列条件的网络响应才写入缓存；不满足时照常返回给页面，只是不写入：

- `response.type === "basic"`，`status === 200`，`response.redirected === false`。
- `Content-Type` 的 MIME 类型：`public-data` 规则必须为 `application/json` 或 `+json` 后缀；`navigation-public-dynamic` 规则必须为 `text/html`。
- `Cache-Control` 不含 `no-store`、`private`。SWR 规则下还不得含 `no-cache`、`must-revalidate`、`max-age=0` 或 `s-maxage=0`（SWR 会不经重新验证直接交出缓存；后三项于 2026-09-24 T13 评审后收紧）。network-first 允许 `no-cache`，因为它在线时总会先请求网络。
- **`Set-Cookie` 无法由 worker 检查**：Fetch 规范把 `Set-Cookie` / `Set-Cookie2` 列为 forbidden response-header name，basic 过滤响应的头列表不含它们，worker 读到的永远是空值（<https://fetch.spec.whatwg.org/#forbidden-response-header-name>）。因此平台**不承诺**拦截带 Cookie 的响应。业务责任是：可执行规则覆盖的路径不得设置 Cookie；如果确实会设置，响应必须同时带 `Cache-Control: private`，由上一条拦下。这一点写入 ADR-0035、安全模型与接入指南。
- `Vary` 不存在，或只包含 `Accept-Encoding`、`Accept`；`Vary: *` 或其他任何字段一律不写入。
- 正文字节数不超过 `maxEntryBytes`。没有可信 `Content-Length` 时按实际读取的字节数判定，超出即放弃写入。
- 写入失败（含 `QuotaExceededError`）只丢弃这一次写入；配额错误时清空**全部**运行时缓存以回收空间（Workbox 的配额回调是全局的，见 ADR-0035 探路 2），预缓存不受影响；页面收到的响应不受影响。

### 读取与时效

- 读取时，超过 `maxAgeSeconds` 的条目视为不存在，并在读取时删除。条目数超过 `maxEntries` 时按最久未使用淘汰。
- network-first：网络成功就返回网络响应（满足准入则更新缓存）；网络失败时返回未过期的缓存条目，没有则按现有规则处理（导航走离线降级，其他请求得到网络错误）。
- SWR：有未过期条目就立即返回，同时发起网络请求更新缓存；没有则等待网络。
- 写入时间由 worker 记录，**不得出现在交给页面的响应头里**。记录方式在计划阶段确定。

### 缓存命名与清理

- 新增两个缓存 kind，都在现有 `cacheNamespacePrefix` 之下：
  - `runtime-pages`：动态 HTML。**每次新 worker 激活都整体删除**，避免旧版本 HTML 引用已被移除的资源。
  - `runtime-data`：公共数据。缓存名带 `configDigest`，激活时删除当前前缀下所有 digest 不同的 `runtime-data` 缓存。规则或上限一变，旧数据就作废。
- 新 worker 激活时，如果 `runtimeCache.enabled=false`，删除当前前缀下全部运行时缓存。
- 恢复 worker 现有的"删除 `appCachePrefix` 下全部缓存"已覆盖运行时缓存，不需要改恢复 worker 的逻辑，但真实浏览器测试要证明这一点。
- **已知限制**：回滚到不认识运行时缓存的旧平台版本时，旧 worker 不会删除这些缓存。它们不会被读取，但会一直占用空间，直到恢复 worker 或下一次 v3 激活。这一点写入 ADR 与发布回滚手册。
- 这是缓存命名空间行为的变更，按项目边界须有 ADR-0035 与迁移说明。

### 页面信号：`served-from-cache`

client-runtime 新增页面生命周期事件，沿用现有信封（ADR-0013 / ADR-0026）：

```ts
// PwaEventEnvelope<"served-from-cache">
{
  version: 1,
  type: "served-from-cache",
  timestamp: string,            // ISO 8601，事件发出时间
  appId: string,
  metadata: {
    url: string,                // 同源路径 + 查询串，不含 origin 与 fragment
    cachedAt: number,           // 写入时间，epoch 毫秒
    reason: "network-failed" | "stale-while-revalidate",
  },
}
```

- `served-from-cache` 加入 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`（2026-09-24 定稿，原稿的独立事件形状作废）。
- 只在响应**确实由运行时缓存提供**时发出；网络响应、预缓存命中和离线降级页都不发。
- 导航由缓存提供时，新页面可能还没注册监听器。client-runtime 初始化后必须仍能收到这次导航对应的事件，不能因为消息先到而丢失。实现方式：worker 按 `resultingClientId` 暂存，client-runtime 初始化时查询取走；不直接向导航页面发消息（ADR-0035 探路 4）。
- 事件只在本页面内传递。平台不记录、不上报 URL。`metadata.url` 含查询串，业务若把生命周期事件转发到遥测，须先去掉它；接入文档写明。
- Vue/React 绑定本期不新增公开面，业务通过 client-runtime 的事件接口订阅。

### 登出

`logout()` 沿用离线写已有的清理握手：worker 在同一次确认里删除全部运行时缓存，确认后才注销 registration。确认超时、协议不匹配或删除失败时拒绝 logout，并保留 registration。未启用运行时缓存时，worker 同样确认空清理。

### 适配器

- Vite 插件接受 v3 策略，产物、manifest、worker 注入流程不变。
- Nuxt 适配器收到 `runtimeCache.enabled=true` 时以明确诊断失败，不静默忽略。
- 同源多 PWA：根 worker 的 `exclude` 规则先于运行时缓存判断，子路径请求永不写入根应用的运行时缓存。须有测试钉住。

## 命令

```bash
pnpm --filter @pwa-platform/contracts test
pnpm --filter @pwa-platform/core test
pnpm --filter @pwa-platform/engine-workbox test
pnpm --filter @pwa-platform/sw-runtime test
pnpm --filter @pwa-platform/client-runtime test
pnpm --filter @pwa-platform/vite test
pnpm build && pnpm test && pnpm typecheck && pnpm lint
pnpm test:browser
pnpm gate:local
```

## 测试策略

- **contracts / core**：v3 闭合形状、上限边界、`enabled=false` 全零、编译规则表中每个格子、`runtime-cache-unused` 警告、v1/v2 输入不变（golden）、乱序确定性、`configDigest` 稳定且随规则或上限变化。
- **engine-workbox**：端口不外露 Workbox 类型；到期、条目淘汰、配额错误时清空；公开 API 快照。
- **worker 单元**：准入的每一条拒绝分支（非 basic、非 200、重定向、MIME、`no-store`、`private`、SWR 下的 `no-cache`、`Vary`、超大正文、无 `Content-Length`），以及带 `Authorization`、`Range` 的请求，拒绝类与 `exclude` 优先，查询串参与缓存键，写入失败不影响响应。每条拒绝分支配一次变异证明。
- **client-runtime**：`served-from-cache` 只在缓存提供时发出；导航事件不丢失；logout 握手的成功、超时、删除失败三种结果。
- **真实浏览器（Chrome 桌面）**：
  - 在线写入后断网，network-first 返回缓存，并发出 `reason: "network-failed"`。
  - SWR 先返回缓存再更新缓存。
  - 被拒绝的响应断网后得到网络错误。
  - 探针：服务端返回带 `Set-Cookie` 的同源响应时，worker 读到的该头为空。这证明平台确实无法检查它，从而支撑上文的责任划分。
  - 新 worker 激活后 `runtime-pages` 被清空，`runtime-data` 仅在 digest 变化时被清空。
  - logout 与恢复 worker 后，Cache Storage 中没有运行时缓存。
  - v2 策略的示例站行为不变。
- 未取得的 Android、N-1 证据按惯例登记为未执行，不折算为通过。

## 边界

- **始终**：默认关闭；只在 v3 显式开启；同源 GET；响应准入 fail-closed；写入失败不影响响应；登出与恢复都要清理；诊断和事件不回显敏感输入。
- **先询问**：修改上限取值区间；新增可执行分类或策略（含运行时 `cache-first`、动态 HTML 的 SWR）；放宽 `Vary` 或 `Cache-Control` 准入；网络超时；给 Vue/React 绑定新增公开面；Nuxt 支持；新增依赖以外的 Workbox 模块。
- **绝不**：缓存带 `Authorization` 的请求或带 `Cache-Control: private` 的响应；宣称平台能拦截带 `Set-Cookie` 的响应；把写入时间或任何标记加进交给页面的响应；让 v1/v2 策略开始运行时缓存；向业务暴露 Workbox 选项、插件或 callback；在未新增 ADR 的情况下改变 `precache` 缓存或恢复 worker 的删除范围。

## 验收标准

1. ADR-0035 被接受，并附 v2 → v3 迁移说明与回滚已知限制；能力图修订经项目所有者评审通过。
2. v1/v2 策略的编译输出与 worker 行为不变，由 golden 测试和示例站真实浏览器回归证明。
3. 编译规则表中每个格子都有测试，响应准入的每条拒绝分支都有测试和变异证明。
4. `served-from-cache` 在所列场景下发出且只在这些场景下发出，导航场景不丢失。
5. 激活、登出、恢复三条清理路径均由真实浏览器证明。
6. 新依赖按 `docs/operations/dependency-changes.md` 登记，版本在计划阶段按 npm registry 核实。
7. 安全模型、生命周期、契约文档、迁移指南、文档基线与验证记录和实现同步。

## 评审结论（2026-09-24）

1. **上限取值**：按建议值，`maxEntries` 1–200、`maxEntryBytes` 1–1 048 576、`maxAgeSeconds` 60–604 800。
2. **写入时间的记录方式**：交由计划阶段决定，约束不变，即不得出现在交给页面的响应里。
3. **网络超时**：本期不做。弱网下网络请求挂起时，network-first 不会退回缓存；这写入 ADR-0035 的已知限制。
4. **批准后更正（2026-09-24，写计划前发现）**：原稿把"响应不带 `Set-Cookie`"列为 worker 准入条件，但 worker 读不到该头（见"响应准入"）。现改为业务责任，并由 `Cache-Control: private` 兜底，平台不再宣称能拦截。其余契约不变。
5. **T1 探路后更正（2026-09-24）**：配额错误时清空全部运行时缓存，而不是只清出错的那一个；导航事件只走"暂存 + 查询"。依据见 ADR-0035 探路 2、4。其余契约不变。
6. **T13 评审后修订（2026-09-24）**：成功标准第 1 条改为不承诺"逐字节不变"；未启用时登出中的运行时清理为尽力而为；SWR 另拒绝 `must-revalidate`、`max-age=0`、`s-maxage=0`；清理与进行中写入的竞态、查询串中的一次性凭据记为已知限制；不按请求凭据模式判断的理由写入 ADR-0035。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| local-ci-record | follow | 不改本地门禁记录格式。 |
| product-direction | follow | v1.1 cache 已在路线图中；不改产品目标。 |
| architecture | update | 分层图补充运行时缓存经引擎端口执行。 |
| developer-entry | update | README 说明 v3 显式开启的边界。 |
| capability-map | follow | 能力图已声明本模块（待评审）。 |
| decisions | update | 新增 ADR-0035。 |
| lifecycle-and-recovery | update | 激活期运行时缓存清理与回滚已知限制。 |
| ci-baseline | follow | 不改 CI。 |
| supply-chain | update | 新增 `workbox-strategies`、`workbox-expiration`。 |
| browser-matrix | follow | 不改矩阵，未取得证据如实登记。 |
| v1-acceptance | follow | 属于 v1.1，不扩展 v1 验收。 |
| identity-release-baseline | follow | 不改身份基线。 |
| release-and-incident | update | 回滚到旧平台版本时运行时缓存残留的处置。 |
| recovery-drill | update | 演练核对项加入运行时缓存被清除。 |
| browser-release-evidence | follow | 不改生产发布证据模板。 |
| browser-test-harness | follow | 仅复用现有测试工具。 |
| workbox-engine | update | 引擎端口新增运行时缓存能力。 |
| sw-runtime | update | 请求判断表新增运行时缓存分支。 |
| offline-write-extension | follow | 只共用 logout 清理握手，不改队列语义。 |
| build-verifier | follow | 不改校验器。 |
| release-gate-contract | follow | 不改门禁契约。 |
| release-orchestration-protocol | follow | 不改外部编排。 |
| vite-adapter | update | 接受 v3 策略。 |
| client-runtime | update | 新事件 `served-from-cache` 与 logout 清理扩展。 |
| vue-react-adapters | follow | 不改绑定公开面。 |
| examples-browser-e2e | follow | 示例保持 v2，作为不变回归。 |
| pwa-entry-resilience | follow | 不改入口恢复。 |
| ssr-adapters | update | Nuxt 对启用的 v3 明确报错。 |
| shared-origin-topology | follow | 语义不变，仅补测试。 |
| package-distribution | follow | 不改 npm 分发范围。 |
| cloudflare-test-deployment | follow | 不改 Cloudflare 测试部署。 |
| push-module | follow | 不改 Push 模块。 |
| public-read-cache | update | 记录本模块与验证证据。 |
