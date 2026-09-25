# 实现计划：public-read-cache

## 概览

按 [spec/public-read-cache.md](../../spec/public-read-cache.md) 交付 v1.1 公共读取缓存：
- `PwaPolicy v3` / `PwaPlan v3`，显式开启段、上限与 `configDigest`；
- 引擎端口的运行时缓存能力（`workbox-strategies`、`workbox-expiration`，不外露）；
- 平台 worker 的响应准入、network-first / SWR 执行、激活期清理、登出清理与 `served-from-cache` 信号；
- client-runtime 的新事件；Vite 接受 v3，Nuxt 明确拒绝启用的 v3；
- Chrome 桌面端真实浏览器证据。

风险集中在四处，任务顺序照此安排：

1. **改动所有已交付应用都在运行的平台 worker 的 `fetch` 路径**。这是平台第一次让业务请求进入 worker 写入的缓存。先写 ADR-0035 提议稿，接受后才动代码。每个改动 sw-runtime 的任务都跑全仓回归（含 vite、nuxt、examples 的浏览器测试）。v1/v2 的 golden 与浏览器行为一字不改。
2. **Workbox 模块和浏览器的实际行为是否符合规格的假设，目前没有证据**。包括：过期插件是否按最久未使用淘汰、按什么时间判断过期、配额错误时的行为；`Set-Cookie` 是否对 worker 不可见；导航由缓存提供时怎样把事件可靠送到新页面。T1 先探路，结论决定 T6–T9 的实现方式。
3. **私有数据误入缓存**。准入是纯函数，每条拒绝分支都有 RED 测试与变异证明，并列为评审重点。
4. **新增事件类型会让穷举检查的代码编译失败**。Vue/React 的 `reduce` 对 `PwaClientEvent["type"]` 做了 `never` 检查（`packages/react/src/store.ts:61`、`packages/vue/src/store.ts` 同构），业务代码可能也这样写。T9 同步两个绑定，迁移说明写明这一点。

## 架构决定

- **ADR 先于代码**：T1 写 ADR-0035 提议稿，内容包括：v3 显式开启与 v1/v2 不升级；编译规则表；准入条件与 `Set-Cookie` 的责任划分；两个新缓存 kind 与激活期清理；登出复用离线写清理握手；`served-from-cache`；回滚到旧平台版本时的残留、不做网络超时、SWR 不用于动态 HTML 三项已知限制。修订 ADR-0008（缓存 kind）、ADR-0012（请求判断表"v1 没有运行时缓存"）、ADR-0013（新增页面事件）三处结论。项目所有者接受后才开始 T2。
- **准入放在 sw-runtime，执行放在引擎**：准入是平台策略，写成 sw-runtime 里零依赖的纯函数 `admitRuntimeResponse`，可以单测，也可以做变异。引擎只接受一个平台定义的 `admit(response) => Promise<boolean>` 回调，不接受也不暴露 Workbox 插件、策略类或选项。
- **写入时间用内部头记录**（T1 探路 3 已确认）：写入缓存副本时加内部头 `x-pwa-platform-cached-at`，读取时校验存活时间并**剥离后**再交给页面。存活时间以这个内部头为准，过期插件只负责条目数淘汰和配额清空。这样不依赖 Workbox 内部的 IndexedDB 模型，也不依赖服务端 `Date` 头。
- **`configDigest` 用零依赖的同步算法**：core 目前没有摘要工具，编译也是同步的。对规范化后的 `{ limits, rules }` JSON 计算 FNV-1a 64 位摘要，输出 16 位十六进制。它只用来判断缓存是否作废，不承担安全用途，ADR 里写明是非密码学摘要。碰撞的后果只是旧数据留到过期，而且读取总要经过当前规则的判断。
- **登出复用 `pwa:offline-write:clear` 握手**：消息名不变。worker 在回 `cleared` 之前同时删除全部运行时缓存；任何一项删除失败都不回 `cleared`。这让 client-runtime 的 logout 逻辑不用改，只扩展 worker 的语义，并写入 ADR。
- **导航事件的交付**（T1 探路 4 已确认）：worker 以 `resultingClientId` 暂存一条待取记录（上限 16 条，30 秒过期），client-runtime 初始化时发一次查询取走；不直接向导航页面发消息。子资源命中直接向 `clientId` 发消息。
- **新依赖**：`workbox-strategies@7.4.1`、`workbox-expiration@7.4.1`，与现有 `workbox-precaching@7.4.1` 对齐（2026-09-24 查 npm registry，两者都是 latest）。`workbox-expiration` 带进传递依赖 `idb@^7.0.1`。按 `docs/operations/dependency-changes.md` 登记。
- **不改 contracts 的 `LIFECYCLE_EVENT_TYPES`**：`served-from-cache` 是 client-runtime 的页面事件，跟 `update-applied` 同级，由 client-runtime 的事件类型承载。T2 核实两个列表的关系后再定。

## 任务定义

### 任务 1：ADR-0035 提议稿与浏览器探路

**说明：** 写 ADR-0035 提议稿；在会话临时目录中用一个最小 worker（直接使用 `workbox-strategies` / `workbox-expiration` 7.4.1）实测以下问题，结论写进本计划的 T1 实施记录。探路代码不提交。

**验收标准：**
- ADR-0035 状态为"提议"，内容按"架构决定"第一条，并附探路结论。
- 探路逐条给出"可行 / 不可行 / 部分可行"与证据：
  1. 同源响应带 `Set-Cookie` 时，worker 里 `response.headers.get("set-cookie")` 是否为 `null`。
  2. `ExpirationPlugin` 的 `maxEntries` 淘汰依据的是写入时间还是最近使用时间；`purgeOnQuotaError` 在配额错误时的实际行为。
  3. 在 `cacheWillUpdate` 中给缓存副本加内部头、在 `cachedResponseWillBeUsed` 中校验并剥离，页面最终能否读到该头。
  4. 导航由缓存提供时：向 `resultingClientId` 发消息能否被新页面收到；按"暂存 + 页面查询"方案能否稳定取到。
  5. 断网（`context.setOffline(true)`）时 network-first 能否回退到缓存；SWR 在返回缓存之后是否完成后台更新。
- 全仓链接扫描 0 失效。

**验证：** 项目所有者接受 ADR 后，把状态改为"已接受"并单独提交。

**依赖：** 无。

**预计范围：** S（ADR）加探路。

#### T1 实施记录（2026-09-24）

**ADR-0035 提议稿**：[docs/adr/0035-explicit-public-read-runtime-cache.md](../../docs/adr/0035-explicit-public-read-runtime-cache.md)，内容按验收标准，附探路记录。

**浏览器探路**（Chrome 153.0.8010.53 桌面端，Playwright 1.63.0，`workbox-strategies` / `workbox-expiration` 7.4.1 装在会话临时目录，`--ignore-scripts`，不进仓库与 lockfile；最小 worker 与本机服务器，代码不入库）：

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | worker 能否读到 `Set-Cookie` | **不能** | `headers.get("set-cookie")` 为 `null`，头名列表中没有；同一响应的 `x-probe` 可见 |
| 2 | 淘汰依据；配额错误的行为 | **最久未使用；全局清空** | 写 a、b、c，读 a，写 d → 剩 a、c、d。配额压到 300 000 字节写 900 KB：页面照常拿到响应，两个启用 `purgeOnQuotaError` 的缓存都被删除 |
| 3 | 内部时间头只留在缓存副本 | **可行** | 副本带 `x-pwa-platform-cached-at`，页面响应没有；超过存活时间后自有校验拒绝返回 |
| 4 | 导航事件如何交给新页面 | **只有"暂存 + 查询"可靠** | 页面晚于消息开始监听时，直接发送的消息丢失（`startMessages()` 后仍为空）；查询时 `source.id` 与 `resultingClientId` 一致，取到暂存记录 |
| 5 | 断网回退与 SWR 后台更新 | **可行** | `setOffline(true)` 对 worker 的请求生效，network-first 返回缓存并送达事件；SWR 三次读取依次为 10、10、11 |

探路第一轮的配额结论被探针自身干扰：查询时的 `caches.open` 会重建被删掉的缓存，且写大响应前旧条目已全部过期。修正后单独重跑得到上表结论。

**对后续任务的影响**：
- 架构决定"写入时间用内部头记录"成立。`ExpirationPlugin` 的 `maxAgeSeconds` 同时开启，用于后台清理，但不作为权威：它的读取期判断依赖服务端 `Date` 头，而没有 `Date` 头的条目在探路中被后台清理先删掉了，无法单独确定其行为。
- 导航事件只走"暂存 + 查询"，不直接发送。T7 实现暂存，T9 实现查询。
- 配额错误清空全部运行时缓存。规格已同步（评审结论第 5 项），T6 的验收标准相应调整。
- 发现 ADR-0027 的"旧 v1 policy/plan 会被拒绝"与当前实现不符（v1、v2 都被接受）。ADR-0035 以实际实现为准并写明，ADR-0027 的文字另行更正，不在本模块范围内。

### 检查点 A：ADR 已接受，探路有结论

- 探路推翻了哪条架构决定，就先改本计划再继续。

### 任务 2：contracts —— v3 策略类型与校验

**说明：** 新增 `PwaRuntimeCachePolicy`、`PwaPolicyV3` 及其校验，照 v2 引入 `offlineWrites` 的方式处理。

**验收标准：**
- v3 形状闭合；`enabled=false` 时三项上限必须都为 0；`enabled=true` 时上限落在规格的区间内（1–200、1–1 048 576、60–604 800），边界值两侧都有测试。
- 新增 `runtime-cache.*` 诊断码，不回显输入值。
- v1/v2 策略的校验结果不变（既有测试一字不改）。
- 核实 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 事件类型的关系，结论写进 T2 实施记录。

**验证：** `pnpm --filter @pwa-platform/contracts test && pnpm --filter @pwa-platform/contracts typecheck`

**依赖：** 检查点 A。

**预计文件：** `packages/contracts/src/policy.ts`、`src/validate.ts`、`src/diagnostics.ts`、`test/validate.test.ts`、`test/models.test-d.ts`。

**预计范围：** M。

#### T2 实施记录（2026-09-24）

- 提交 `a7ed2ca`（由 `executor` 子代理实现，主会话验收）。先写测试得到 RED（6 项失败），实现后 contracts 192/192 通过；根目录 `pnpm build`、`pnpm typecheck`、`pnpm lint` 通过。变异：把 `maxEntries` 上限 200 改为 201，边界测试转红；还原后与提交逐字节一致。
- 与计划的偏离：
  - `PwaPolicyV3` 写成平铺的对象类型，而不是 `Omit<PwaPolicyV2, "schemaVersion"> & {...}`。`validate.ts` 的编译期守卫要求 schema 输出与公开类型完全相同，交叉类型通不过；V1、V2 也都是平铺写法。
  - 上限字段在 schema 层就只接受"0 或区间内整数"，例如 `maxAgeSeconds` 为 1–59 时无论是否启用都报 `schema.invalid-value`。启用与否的约束由 `runtime-cache.disabled-configuration` / `enabled-configuration` 两个码负责。
  - 既有测试改了两行：一条把"不支持的版本"示例从 3 改为 4；类型测试中 `PwaPolicy["schemaVersion"]` 从 `1 | 2` 改为 `1 | 2 | 3`。
- **遗留到 T4 的风险**：core 的 `compile.ts` 对版本号不是 2 的策略一律产出 v1 计划，所以在 T4 之前，编译 v3 策略会**静默得到 v1 计划**（丢失 `runtimeCache` 与 `offlineWrites`），而不是报错。只影响本分支，T4 修复，检查点 B 须专门验证。
- **`LIFECYCLE_EVENT_TYPES` 的核实结论**：contracts 的列表（8 项）支撑 `PwaEventEnvelope`，这是带 `version`、`timestamp`、`appId`、`metadata` 的受校验信封。client-runtime 的 `CLIENT_EVENT_TYPES` 是其中 5 项的子集，`PwaClientEvent = PwaEventEnvelope<...>`，Vue/React 的 `reduce` 对它做穷举检查。规格里 `served-from-cache` 的形状与信封不同。**T9 开工前要定**：把 `url`、`cachedAt`、`reason` 放进信封的 `metadata`、加入两个列表（与现有事件同路），还是另开一条页面事件通道。结论写进 ADR-0035 的修订。

### 任务 3：contracts —— v3 计划与缓存命名

**说明：** 新增 `PwaRuntimeCachePlan`、`PwaPlanV3` 及其校验；`CACHE_KINDS` 加入 `runtime-pages`、`runtime-data`；新增 `runtimeDataCacheName(identity, configDigest)`。

**验收标准：**
- `PwaPlanV3` 闭合，比 v2 多 `runtimeCache` 一个字段；`configDigest` 必须是 16 位小写十六进制。
- 缓存名均以 `cacheNamespacePrefix` 开头，因此仍以 `appCachePrefix` 开头（恢复 worker 的删除范围自动覆盖）。有测试断言这一点。
- 公开 API 快照的更新只包含上述新增。

**验证：** `pnpm --filter @pwa-platform/contracts test`（含公开 API 快照）

**依赖：** T2。

**预计文件：** `packages/contracts/src/plan.ts`、`src/cache-namespace.ts`、`src/validate.ts`、`test/validate.test.ts`、`test/__snapshots__/public-api.d.ts.snap`。

**预计范围：** M。

### 任务 4：core —— v3 编译

**说明：** 新增 `compileRuntimeCache()`，按规格的编译规则表处理，算出 `configDigest`，v3 策略产出 v3 计划。

**验收标准：**
- 编译规则表的每个格子都有测试，包括 `enabled=false` 时全部透传、`compile.runtime-strategy-unsupported`、`compile.runtime-cache-unused` 警告。
- `configDigest` 只由上限和可执行规则决定：输入乱序时不变，改任何一项上限或规则时变化。
- v1/v2 的 golden 输出一字不改；v3 `enabled=false` 的输出除版本号与 `runtimeCache` 字段外与同内容的 v2 相同，有测试断言。

**验证：** `pnpm --filter @pwa-platform/core test`

**依赖：** T3。

**预计文件：** `packages/core/src/compile.ts`、`src/runtime-cache.ts`（新）、`src/internal/digest.ts`（新）、`test/runtime-cache.test.ts`（新）、`test/compile-basics.test.ts`。

**预计范围：** M。

#### T3/T4 实施记录（2026-09-24）

- 提交 `177b838`（T3，contracts）与 `003081a`（T4，core），均由 `executor` 子代理（sonnet）实现，主会话在检查点 B 验收；TDD 先 RED 后 GREEN。
- T3：`PwaPlanV3`/`PwaRuntimeCachePlan` 沿用 `plan.ts` 既有的 `Expand<PwaPlanFields & {...}>` 交叉类型写法（与 T2 记录里 `policy.ts` 必须写成平铺类型不同——`plan.ts` 的这个写法在 v1/v2 上已经通过同一条编译期守卫，v3 同样通过，未触发 T2 遇到的那个限制）。`CACHE_KINDS` 增加 `runtime-pages`、`runtime-data`；新增 `runtimeDataCacheName`。全仓 `pnpm test` 意外发现两处预先存在的失败（均因 T2 让 `schemaVersion: 3` 成为合法字面量，两个"故意传入不支持版本号 3"的旧测试改为触发缺字段诊断而非版本诊断）：`packages/core/test/compile-basics.test.ts` 改为断言 `schema.missing-field`；`packages/sw-runtime/test/config.test.ts` 把探针版本号从 3 改成 4（沿用 T2 记录里同一类修复的先例）。
- T4：`compileRuntimeCache()`（`packages/core/src/runtime-cache.ts`）按规格表逐格编译；`configDigest` 用零依赖 FNV-1a 64（`internal/digest.ts`，BigInt 实现，`""`/`"a"` 测试向量通过）对 `{limits, rules}` 的规范 JSON 字符串取摘要，规则按 `pathPrefix` 排序以保证输入乱序不变摘要。修复了 T2 记录中标记的风险：`compile.ts` 的三元表达式原先只匹配 `schemaVersion === 2`，v3 策略会静默产出 v1 计划；改为先判 3 再判 2。顺带把 v2 专属的 offline-write 目标前置校验条件扩到 v3（两者 `offlineWrites` 形状相同），避免同一问题在 v3 上只能等到最终 `validatePlan` 才用不同的诊断码报出。
- 变异证明：(a) 让 `navigation-public-dynamic` 也接受 SWR → 表格测试转红；(b) 摘要输入去掉 `maxAgeSeconds` → 摘要变化测试转红；(c) 把三元表达式条件强制为 `false`（v3 落到 v1）→ 3 个集成测试转红。三次均先验证转红、再还原、`git status`/`git diff --stat` 确认与提交逐字节一致。
- **sw-runtime 现状（T7 之前）**：`packages/sw-runtime/src/build/config.ts:24` 的 `createPlatformWorkerConfig` 里 `offlineWrites: validated.schemaVersion === 2 ? validated.offlineWrites : { enabled: false }` 对 v3 计划落进 `else` 分支——v3 的 `offlineWrites`（哪怕 `enabled: true`）和 `runtimeCache` 都被静默丢弃，config.ts 完全未读取 `runtimeCache` 字段。不会抛错，只是产出的 worker 配置里运行时缓存和（v3 下的）离线写都不存在。Vite（`packages/vite/src/*.ts`）与 Nuxt（`packages/nuxt/src/artifacts.ts`）都不直接引用 `schemaVersion`/`offlineWrites`/`runtimeCache`，只是把 `PwaPlan` 转手交给 `createPlatformWorkerConfig`，所以两者的行为与 sw-runtime 完全一致（同样的静默丢弃，非报错）。T7 需要把这个三元表达式也改成三路。

- **检查点 B 验收时的修正（主会话）**：子代理报告 `createPlatformWorkerConfig` 只认 `schemaVersion === 2`，T4 之后 v3 计划的 `offlineWrites` 会被静默替换为 `{ enabled: false }`。这是本模块引入的回归，不等到 T7：先加测试"v3 计划保留离线写配置"得到 RED，把条件改为"v1 才关闭"后 GREEN。`runtimeCache` 在 T7 之前仍不进入 worker 配置，worker 对 v3 计划的行为等同 `enabled=false`（全部透传），这是安全的默认。另外更正了本记录第一条：两个任务都由子代理实现，不是主会话。

### 检查点 B：契约与编译就位

- `pnpm build && pnpm test && pnpm typecheck` 全仓通过，已交付包的测试没有改动。

**检查点 B 结果（2026-09-24，主会话，提交 `ab3feb1`）**：`pnpm build && pnpm typecheck && pnpm lint && pnpm test` 退出码 0，16 个包共 1947 个测试通过（contracts 200、core 172、sw-runtime 215，其余见日志；没有跑改动前的基线做数量对比）。既有测试的改动都由版本号或缓存 kind 的扩展引起：把"不支持的版本"示例从 3 改为 4（contracts、sw-runtime）；core 一处改为断言真实诊断；类型测试把策略与计划的版本联合扩展到 3；`CACHE_KINDS` 的期望值加入两个运行时 kind。逐行看过被删除的行，没有放宽任何断言。未跑浏览器测试：本阶段没有改动 worker 或页面的运行时行为（sw-runtime 的修正只影响构建期配置，已有单测覆盖）。

### 任务 5：sw-runtime —— 响应准入纯函数

**说明：** 实现 `admitRuntimeResponse(response, { resourceClass, strategy, maxEntryBytes })`，覆盖规格"响应准入"的全部条件，不涉及 Cache API。

**验收标准：**
- 每条拒绝分支都有一个先失败再通过的测试：非 basic、非 200、重定向、MIME 两类、`no-store`、`private`、SWR 下的 `no-cache`（network-first 下放行）、`Vary`（`*`、其他字段、合法组合）、有 `Content-Length` 时超限、没有 `Content-Length` 时读取超限。
- 读取正文用克隆，不消耗交给页面的响应；超限时尽早停止读取。
- 每条拒绝分支一次变异证明：删掉该分支后，至少一个断言转红。

**验证：** `pnpm --filter @pwa-platform/sw-runtime test -- admit`

**依赖：** 检查点 B。可与 T6 并行。

**预计文件：** `packages/sw-runtime/src/worker/admit.ts`（新）、`test/worker/admit.test.ts`（新）。

**预计范围：** S。

### 任务 6：engine-workbox —— 运行时缓存端口

**说明：** 新增 `createRuntimeCacheEngine({ cacheName, strategy, maxEntries, maxAgeSeconds, admit })`，返回 `handle(request): Promise<{ response, servedFromCache: null | { cachedAt, reason } }>`。按 T1 结论实现写入时间的记录、校验与剥离。

**验收标准：**
- 公开类型不出现任何 Workbox 类型；公开 API 快照只多出这个工厂函数及其类型。
- 过期条目不会返回且会被删除；超过条目数时淘汰最久未使用的条目；配额错误时清空全部运行时缓存、`precache` 保持不变，且不影响返回的响应；`admit` 返回 false 时不写入。
- 页面拿到的响应里没有内部头。
- 新依赖按 `dependency-changes.md` 登记：lockfile 变化逐项解释（`workbox-strategies`、`workbox-expiration`、`idb`）；worker 导入白名单测试同步更新。

**验证：** `pnpm --filter @pwa-platform/engine-workbox test && pnpm --filter @pwa-platform/engine-workbox test:browser`

**依赖：** 检查点 B。

**预计文件：** `packages/engine-workbox/package.json`、`pnpm-lock.yaml`、`src/worker/runtime.ts`（新）、`src/worker/index.ts`、`browser-tests/runtime.spec.ts`（新）。另外 `docs/operations/dependency-changes.md` 追加登记。

**预计范围：** M。

#### T5 实施记录（2026-09-24）

- 提交 `81efda6`、`fdac935`（`executor` 子代理，sonnet），主会话验收后补 `f5dffb0`。
- 先 RED（模块不存在），实现后 sw-runtime 全部通过；typecheck、lint 通过。11 项变异逐一转红，其中"按实际字节计数"的变异让测试进程因无限流耗尽内存而崩溃，失败是显式的，但不是单条断言失败；提前停止读取另有"产生的块数少于 20"的断言守着。
- 子代理的偏离：`reader.cancel()` 不 await（Node 里克隆响应的 tee 流上它永不 settle，但取消信号立即生效）；"缺少 Content-Type"用例改用字节正文，因为字符串正文会被自动加上 `text/plain`。
- **主会话验收发现**：`endsWith("+json")` 会放行 `text/x+json`、`image/foo+json`，比约定宽。补测试得 RED（3 项失败）后收紧为 `application/<subtype>+json`，GREEN，提交 `f5dffb0`。

#### T6 实施记录（2026-09-24）

- 提交 `ecbb813`（依赖与包边界测试）、`bd71f11`（引擎与浏览器测试）、`bdea13e`（lint 修正），`executor` 子代理（sonnet）实现，主会话验收。
- 依赖（项目所有者 2026-09-24 批准）：
  1. **为什么需要**：执行 network-first / SWR 与条目数、配额控制；ADR-0003 规定 Workbox 是实现引擎，不另写一套。
  2. **影响范围**：`@pwa-platform/engine-workbox` 的运行时依赖，随包分发，只进入 worker 入口。
  3. **lockfile 审阅**：新增包条目只有 `workbox-expiration@7.4.1`、`idb@7.1.1`，加 importer 的两条声明；`workbox-strategies@7.4.1` 原本就是 `workbox-precaching` 的传递依赖。两者都是带 integrity 的普通 registry 条目，没有安装脚本，不需要 `minimumReleaseAgeExclude`、`trustPolicyExclude` 或 `allowBuilds`。
  4. **冻结安装**：主会话 `pnpm install --frozen-lockfile --offline` 通过；子代理报告全仓 build、typecheck、lint、test 通过。
- 引擎浏览器测试 8 个场景（Chrome 153.0.8010.53），子代理 `--repeat-each 5` 为 40/40；主会话复跑 engine-workbox 全部浏览器测试 14/14 通过。7 项变异逐一转红：不剥离时间头、过期不删除、把 `maxAgeSeconds` 交给 `ExpirationPlugin`、交换 reason、忽略 `admit`、放大 `maxEntries`、关闭 `purgeOnQuotaError`。
- 与计划的偏离：
  - **没有先写失败测试**，是先写实现再写浏览器测试。变异表证明测试能够捕获对应缺陷，但 RED 先行的顺序没有做到。
  - `workbox-expiration@7.4.1` 的类型声明在本仓库 `exactOptionalPropertyTypes` 下不满足 `WorkboxPlugin`，因此插件列表有一处类型断言，并从 `workbox-core/types.js` 做了仅类型的导入；包边界测试已登记。
- **实现修订 ADR-0035 两处**（已写入 ADR）：`ExpirationPlugin` 不配置 `maxAgeSeconds`，否则它会按服务端 `Date` 头否决刚写入的条目；配额清理只覆盖本次 worker 启动以来插件读写过的缓存。

### 任务 7：sw-runtime —— 请求路径与 `served-from-cache` 发送

**说明：** worker 配置增加 `runtimeCache`；`decide` 增加 `runtime` 判定（在拒绝基线、`exclude`/`deny`、预缓存、`Range` 之后，并排除带 `Authorization` 的请求）；`handlers` 调用引擎，由缓存提供时发出事件（子资源发给 `clientId`，导航按 T1 方案暂存）。

**验收标准：**
- 判断顺序有测试钉住：拒绝类与 `exclude` 总是优先；`Range`、`Authorization` 请求透传；缓存键包含查询串。
- v1/v2 配置下行为不变：既有测试一字不改，另加一条断言说明 v2 的 `network-first` 规则仍然透传。
- 事件只在缓存提供时发出，载荷只含同源路径、查询串、`cachedAt`、`reason`。

**验证：** `pnpm --filter @pwa-platform/sw-runtime test`，以及全仓 `pnpm test`。

**依赖：** T5、T6。

**预计文件：** `packages/sw-runtime/src/shared/config.ts`、`src/worker/decide.ts`、`src/worker/handlers.ts`、`src/messages/index.ts`、对应单测。

**预计范围：** M。

### 任务 8：sw-runtime —— 激活期清理与登出清理

**说明：** 激活时整体删除 `runtime-pages`；删除 digest 不同的 `runtime-data`；`enabled=false` 时删除全部运行时缓存。`pwa:offline-write:clear` 的处理在回 `cleared` 之前删除全部运行时缓存。

**验收标准：**
- 激活清理只删当前 `cacheNamespacePrefix` 下的运行时缓存；`precache`、其他应用、其他环境、非平台缓存都保持不变。
- 登出清理：任何一项删除失败都不回 `cleared`；未启用时同样回 `cleared`。
- 恢复 worker 代码不改；另加一条单测断言它删除了两个运行时 kind。
- 每个删除范围判断配一次变异证明。

**验证：** `pnpm --filter @pwa-platform/sw-runtime test`

**依赖：** T7。

**预计文件：** `packages/sw-runtime/src/worker/handlers.ts`、`src/worker/runtime-cleanup.ts`（新）、对应单测。

**预计范围：** S–M。

#### T7/T8 实施记录（2026-09-24）

- 提交 `787363d`（T7）、`54a1c10`（T8），`executor` 子代理（sonnet）实现，主会话验收。
- T7：worker 配置新增必填的 `runtimeCache`，缓存名总是存在（v1、v2 与 v3 未启用时也有），供 T8 清理使用。判断表新增 `runtime` 判定与 `authorization` 透传；预缓存命中优先；导航只在 `navigation-public-dynamic` 规则下、子资源只在 `public-data` 规则下进入运行时缓存。导航在网络失败且没有缓存时，回退到与现有导航完全相同的预缓存候选。信号：子资源直接发给 `clientId`；导航按 `resultingClientId` 暂存，由新消息 `pwa:runtime-cache:pending` 取走。
- T8：激活时删除页面缓存，并删除 digest 不同的数据缓存（未启用时全部删除）；登出握手在回 `cleared` 之前删除全部运行时缓存，删除失败时走既有的 `rejected` 回复。恢复 worker 未改，补了一条单测证明它的前缀删除覆盖两个运行时 kind。
- 变异 (a)–(g) 逐一转红：运行时优先于预缓存、去掉 `authorization` 透传、直接向导航发消息、把 v2 规则当成运行时规则、激活删除当前数据缓存、按更宽的前缀删除、删除失败仍回 `cleared`。
- 与计划的偏离：**没有先写失败测试**，是先写实现，事后逐条验证验收标准与变异。既有测试改动：配置快照加入 `runtimeCache`；`platform-worker.test.ts` 的"激活交给引擎"一条改为等待新增的 `waitUntil`。
- `handlers.ts` 只以类型导入引擎工厂，实际工厂在 `worker/index.ts` 注入：workbox-core 的开发日志在模块加载时访问 `self`，这样单测不需要 Workbox。

**主会话验收发现（未修复，等项目所有者决定）**：`workbox-expiration` 把每个条目的"缓存名|URL"和时间戳记在全源共享的 IndexedDB 库 `workbox-expiration`（对象仓库 `cache-entries`）中，只有 Workbox 的 `deleteCacheAndMetadata` 会同时清掉这些记录。激活、登出、恢复 worker 三条清理路径都只调用 `caches.delete`，因此：登出后用户访问过的公共数据 URL（含查询串）仍留在浏览器里；页面缓存每次激活以同名重建，旧记录只在 `maxEntries` 淘汰时被顺带删除。依据：`workbox-expiration@7.4.1` 的 `models/CacheTimestampsModel.js`（`DB_NAME`、`_getId` 为 `cacheName + '|' + url`）与 `ExpirationPlugin.js` 的 `deleteCacheAndMetadata`。

**检查点 C 结果（2026-09-24，主会话，提交 `54a1c10` 之上）**：`pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:browser` 退出码 0。单测 16 个包全部通过（sw-runtime 280、engine-workbox 37、contracts 200、core 172）。浏览器测试 9 个包全部通过，没有跳过、没有重试才通过的：harness 22、engine-workbox 14、sw-runtime 26、push 8、client-runtime 17、vite 22、entry-resilience 14、nuxt 12、examples 47，Chrome 153 桌面端。vite、nuxt、examples 的浏览器测试没有改动。上面的 IndexedDB 残留不在这些测试的覆盖范围内。

**IndexedDB 残留的修复（2026-09-24，项目所有者选择"三处都清"）**：
- 决定写入 ADR-0035"过期记录与缓存一起清理"（`28b394a`）。
- 实现 `04d8ef9`（`executor` 子代理，sonnet）：新增零依赖的 `src/shared/expiration-records.ts`，用原生 IndexedDB 按缓存名删除 `workbox-expiration` 的记录，库不存在时不创建。激活与登出按与删除缓存相同的规则删除记录，失败会传到登出握手，回复 `rejected`。恢复 worker 在删除缓存之后按 `appCachePrefix` 删除记录，失败时吞掉，不阻止接管。单测先 RED 后 GREEN；清理函数本身先写实现。浏览器测试 a（用真实 Workbox 写入的记录做库结构守卫）与 b（不会新建库）通过；端到端的"登出、恢复后没有记录"留给 T11。4 项变异逐一转红。
- 子代理报告的冲突，由主会话处理（`ed9a87b`）：vite 的既有测试"恢复 worker 里不能有 Workbox"是按单词 `workbox` 检查的，恢复 worker 现在要写出库名 `"workbox-expiration"`，测试因此失败。改为检查 Workbox 每个模块加载时写在 `self` 上的 `workbox:<模块>:<版本>` 标记：平台 worker 必须有，恢复 worker 必须没有，另外断言库名字面量存在。变异：临时让恢复 worker 导入 `workbox-core/_version.js`，测试转红；还原后工作区干净。
- 已知风险：清理函数写死了 Workbox 的库版本 1。以后升级 Workbox 如果库版本变了，打开会失败，登出会一直被拒绝。~~库结构守卫测试用真实 Workbox 写入记录，版本一变就会失败，升级时能被发现。~~ **（2026-09-24 T13 评审更正：这句不属实，是主会话未核对就写下的。`expiration-records.spec.ts` 的记录由测试按写死的结构手工写入，不经过 Workbox。真正起守卫作用的是 T11 的两个端到端测试，它们先由真实 Workbox 写入记录、断言记录存在，再断言清理后不存在。）**
- 不支持 `indexedDB.databases()` 的环境才会走"打开后发现是新建的就中止"这条兜底路径，Chrome 不走，浏览器测试没有覆盖它。

**检查点 C 复跑（2026-09-24，主会话，提交 `ed9a87b`）**：`pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:browser` 退出码 0。单测 16 个包全部通过（sw-runtime 295）；浏览器测试 9 个包全部通过，没有跳过、没有重试才通过的：harness 22、engine-workbox 14、sw-runtime 28、push 8、client-runtime 17、vite 22、entry-resilience 14、nuxt 12、examples 47。子代理两次报告 release-tools 集成测试有一条偶发超时（与本模块无关）；主会话的两次全仓运行中它都通过了。

### 检查点 C：worker 侧就位

- 全仓 `pnpm build && pnpm test && pnpm typecheck && pnpm test:browser` 通过；vite、nuxt、examples 的浏览器测试没有改动也全部通过。

### 任务 9：client-runtime —— `served-from-cache` 事件与绑定同步

**说明：** client-runtime 新增事件类型与接收逻辑，初始化时取回导航的待取记录；Vue/React 的 `reduce` 各补一个不改状态的分支。

**验收标准：**
- 事件只在收到合法的 worker 消息时发出；消息形状不对或来源不是当前 controller 时忽略。
- 导航场景：页面在 worker 发消息之后才初始化，仍能收到事件。
- Vue/React 的状态形状与公开 API 不变，两个包的一致性测试都覆盖新分支。

**验证：** `pnpm --filter @pwa-platform/client-runtime test && pnpm --filter @pwa-platform/vue test && pnpm --filter @pwa-platform/react test`

**依赖：** 检查点 C。

**预计文件：** `packages/client-runtime/src/client/events.ts`、`src/client/facade.ts`、`packages/vue/src/store.ts`、`packages/react/src/store.ts`、对应单测。

**预计范围：** M。

### 任务 10：适配器 —— Vite 接受 v3，Nuxt 拒绝启用的 v3

**验收标准：**
- Vite 插件用 v3 策略构建出的 worker 配置含 `runtimeCache`；产物、manifest 注入流程不变。
- Nuxt 收到 `runtimeCache.enabled=true` 时以专属诊断失败；v3 `enabled=false` 正常构建。
- 同源多 PWA：根应用的 `exclude` 子路径不会进入根应用的运行时缓存（单测）。

**验证：** `pnpm --filter @pwa-platform/vite test && pnpm --filter @pwa-platform/nuxt test`

**依赖：** 检查点 C。可与 T9 并行。

**预计文件：** `packages/vite/test/*`、`packages/nuxt/src/options.ts`（或对应文件）、`packages/nuxt/test/options.test.ts`、`packages/sw-runtime/test/worker/decide.test.ts`。

**预计范围：** S–M。

### 任务 11：真实浏览器证据

**说明：** 在 sw-runtime 的浏览器测试中新增一个夹具站点（按路径设置响应头），覆盖规格"测试策略"中真实浏览器的全部场景；client-runtime 覆盖事件与登出。

**验收标准：**
- 场景：network-first 断网回退并发出 `network-failed`；SWR 先返回缓存再更新；每类被拒绝的响应断网后得到网络错误；`Set-Cookie` 探针；新 worker 激活后 `runtime-pages` 清空、`runtime-data` 只在 digest 变化时清空；logout 与恢复 worker 后没有运行时缓存；v2 夹具行为不变。
- 每个场景配一次变异，证明测试不会空过；`--repeat-each 10` 无失败。
- 未取得的 Android、N-1 证据登记为未执行。

**验证：** `pnpm --filter @pwa-platform/sw-runtime test:browser && pnpm --filter @pwa-platform/client-runtime test:browser`

**依赖：** T8、T9、T10。

**预计文件：** `packages/sw-runtime/browser-tests/runtime-cache.spec.ts`（新）、夹具站点、`packages/client-runtime/browser-tests/served-from-cache.spec.ts`（新）。

**预计范围：** M。

#### T9 实施记录（2026-09-24）

- 事件格式由项目所有者确认后写入 ADR-0035 与规格（`ab019bc`）：沿用现有生命周期信封，`metadata` 为 `{ url, cachedAt, reason }`，`served-from-cache` 同时加入 contracts 的 `LIFECYCLE_EVENT_TYPES` 与 client-runtime 的 `CLIENT_EVENT_TYPES`。业务若把生命周期事件转发到遥测，须去掉带查询串的 `metadata.url`，接入文档写明（T12）。
- 实现 `44d210d`（`executor` 子代理，sonnet），主会话验收。`register()` 成功后：只接受来自当前 controller、并通过 sw-runtime 校验器的 `pwa:runtime-cache:served` 消息；有 controller 时发一次 `pwa:runtime-cache:pending` 查询，10 秒超时，端口随即关闭；挂在既有 teardown 上。Vue/React 的 `reduce` 各补一个不改状态的分支。老版本平台 worker 不认识查询消息，会忽略它，页面超时后不报错。
- Vue/React 部分先写失败测试（运行时与 `TS2345`）；client-runtime 的 13 个测试与实现同一轮写成，没有单独记录 RED。变异 4 项逐一转红（接受任意来源、跳过查询、`served` 为 null 时仍发事件、删掉 Vue 分支后 typecheck 失败）。

#### T10 实施记录（2026-09-24）

- 提交 `6f966f7`（`executor` 子代理，sonnet），主会话验收。
- Vite：不需要改生产代码，v3 配置经 sw-runtime 的 `createPlatformWorkerConfig` 进入 worker；补了三条单测（启用、未启用、与同内容 v2 的预缓存和路径规则相同）。
- Nuxt：沿用它自己的报错方式，新增 `checkNoRuntimeCache`，在模块启动时对 `runtimeCache.enabled=true` 的 v3 策略抛出 `nuxt.runtime-cache-unsupported`（`packages/nuxt/src/artifacts.ts`）。v3 未启用时与 v2 相同。先 RED（3 项失败）再实现。
- 同源多应用：根应用的运行时规则下，子应用 `exclude` 前缀的导航与子资源都是 `excluded` 透传。
- 变异 3 项逐一转红。

#### T11 实施记录（2026-09-24）

- 提交 `a0cffba`（sw-runtime，16 个测试）、`7fa8919`（client-runtime，4 个测试），`executor` 子代理（sonnet），主会话验收。真实 Chrome 153.0.8010.53 桌面端，真实平台 worker（含 Workbox）与真实 client-runtime。
- 12 个场景全部通过：network-first 与 SWR；七类被拒绝的响应（`no-store`、`private`、`Vary: Cookie`、错误 MIME、超大正文、`Authorization`、SWR 下的 `no-cache`）断网后得到网络错误且未写入；`Set-Cookie` 探针（页面与 worker 都读不到它；只带 `Set-Cookie` 的响应**会**被缓存，再带 `private` 则不会）；动态页面导航；激活清理（配置不变时保留数据缓存，改了上限则清掉）；恢复 worker 清掉运行时缓存与本应用的过期记录、保留其他应用的记录；v2 声明的运行时策略不生效；`served-from-cache` 的子资源、晚订阅导航、SWR 三种情形；登出清掉运行时缓存与过期记录。
- `--repeat-each 10`：sw-runtime 160/160，client-runtime 40/40。12 项变异逐一转红。准入的逐分支变异见 T5，这里对 `Cache-Control` 用一个合并变异覆盖 4 个用例。
- 没有发现生产代码缺陷。
- **需要写进接入文档的产品行为**：动态页面如果经过重定向（例如 `/dashboard` 被重定向到 `/dashboard/`），响应带 `redirected` 标记，按准入规则不会被缓存。这符合规格，但业务容易踩到（T12）。
- 未取得：Chrome Android、桌面 N-1，登记为未执行。

**检查点 D 结果（2026-09-24，主会话，提交 `7fa8919`）**：`pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:browser` 退出码 0。单测 16 个包全部通过（sw-runtime 297、client-runtime 134、vite 152、nuxt 83、vue 47、react 76）；浏览器测试 9 个包全部通过，没有跳过、没有重试才通过的：harness 22、engine-workbox 14、sw-runtime 44、push 8、client-runtime 21、vite 22、entry-resilience 14、nuxt 12、examples 47。

### 检查点 D：证据齐备

### 任务 12：文档同步

**验收标准：** 按规格 Documentation impact 表中所有 `update` 行更新：安全模型（`Set-Cookie` 责任划分）、生命周期（激活清理、回滚残留）、契约文档、发布与事故手册（回滚到旧平台版本时的处置）、恢复演练核对项、README、v2 → v3 迁移指南（含穷举事件类型的编译影响）、sw-runtime / workbox-engine / client-runtime / vite-adapter / ssr-adapters 规格中的对应段落。全仓链接扫描 0 失效。

**依赖：** 检查点 D。

**预计范围：** M（纯文档）。

#### T12 实施记录（2026-09-24）

- 提交 `2453445`（`executor` 子代理，sonnet）：新增接入与迁移指南 `docs/guides/public-read-cache.md`；同步安全模型、生命周期、契约文档、发布与事故手册、恢复演练、包概览、README 开发状态；ADR-0008、0012、0013 各追加一条增补，ADR-0027 追加更正说明（实现同时接受 v1 与 v2），原文保留；sw-runtime、workbox-engine、client-runtime、vite-adapter、ssr-adapters 五份规格各追加增补；文档基线本模块一行补充权威文档，状态保持 `target`。
- **主会话验收发现并修正（`078039d`）**：指南的示例策略用了不存在的字段 `resourceRules`，`offlineWrites` 缺零值字段，还漏了 `offlineFallback`、`updateMode`，照抄会校验失败。修正后把示例原样交给 contracts 的 `validatePolicy`，结果 `ok: true`。`Set-Cookie` 一节把风险写成"回放给下一个请求它的人"，而运行时缓存不跨浏览器共享，改为同一浏览器内的风险。已知限制补上两条：配额清理只覆盖本次 worker 启动以来碰过的缓存；升级 Workbox 须通过库结构守卫测试。安全模型把登出清理写成"启用了运行时缓存的应用"才做，实际总会做，已改正。
- 全仓链接扫描 789 个，0 失效；`git diff --check` 通过。

### 任务 13：模块质量门禁

**验收标准：**
- 干净 worktree 冻结安装后，`pnpm gate:local` 全部通过；本模块浏览器测试 `--repeat-each 10` 无失败。
- lockfile 变化只有 T6 登记的三项；逐项解释。
- 新上下文独立评审，重点：
  - 私有数据能否绕过准入写入缓存；
  - 内部时间头能否泄漏给页面；
  - v1/v2 应用是否真的不受影响；
  - 清理范围是否会删到别的应用或 `precache`；
  - 登出在删除失败时是否仍然注销；
  - 测试是否可能空过。
- 阻断项与应修项处理完毕。
- 产出 `tasks/public-read-cache/verification.md`：门禁结果、浏览器矩阵字段、未取得的证据（至少包括 CI、Android、N-1）。文档基线中本模块一行保持 `target`。

**依赖：** T12。

**预计范围：** M。

#### T13 实施记录（2026-09-24）

**独立评审**（新上下文，`code-reviewer` 子代理，opus，只读，范围 `dd9b3a1..9028baf`）：结论 COMMENT，无阻断项，没有找到私有数据绕过准入进入缓存的路径；应修 5 项、建议 6 项。主会话核实后：
- 应修 1 属实：登出后再次 `register()`，`message` 监听器会累积，每条信号发出两次。
- 应修 2 属实：v1/v2 应用并非"逐字节不变"（worker 多约 50 KB、配置多一个字段、激活与登出会做清理；同源上别的 Workbox 把库升版本时，v1/v2 应用会永远登出失败）。
- 应修 3 一半属实：pending 查询的来源检查其实存在（先过 `isSameOriginWindow`），评审说"跨源会得到回复"不成立；但那条测试断言的是 `waitUntil`，而这个分支本来就不调用它，所以恒为通过。
- 应修 4（清理与进行中写入的竞态）按代码阅读成立，未复现。
- 应修 5 属实：安全模型里"评估凭据模式"一句被 T12 删掉，没有记录理由。
- 建议 7 属实，且**证明主会话在 T8 记录里写错了**："库结构守卫测试用真实 Workbox 写入记录"并不成立，已在 T8 记录处更正。

**项目所有者决定**（`0517f2f`，写入 ADR-0035 与规格）：承认 v1/v2 的体积与配置变化，未启用时登出中的运行时清理改为尽力而为；竞态与查询串中的一次性凭据记为已知限制；SWR 另拒绝 `must-revalidate`、`max-age=0`、`s-maxage=0`；补记不按请求凭据模式判断的理由。

**修复**（`executor` 子代理，sonnet，主会话验收）：`75bcbce`（client-runtime：监听器随注册的生命周期撤销；去掉 `startMessages()`，真实浏览器下事件仍然送达）、`156024a`（sw-runtime：未启用时登出清理为尽力而为、激活清理不产生未处理的拒绝；SWR 收紧；修正空转的单测并加正向对照；两条浏览器测试改为等待下一条已知事件作为收尾点；库结构测试改名并指向真正的守卫）、`61d4004`（指南与安全模型按上述决定更正）。每项行为修复先得 RED；7 项变异逐一转红；`--repeat-each 5`：served-from-cache 20/20、runtime-cache 80/80；链接扫描 795 个，0 失效。

**门禁**：`pnpm gate:local` 共三次，签署人 hageer，全部保留在仓库外 `pwa-release-records/`。第 1 次（`61d4004`）Node 24 的浏览器测试因 examples 包一个测试创建浏览器上下文超时而未通过；第 2 次（`61d4004`）14 项全绿，但主会话在运行期间提交了计划记录，工具判定 `tool build is stale`；第 3 次（`59d4d47`）**通过**。另在 `59d4d47` 上：本模块浏览器测试 `--repeat-each 10` 为 sw-runtime 180、client-runtime 40、engine-workbox 80，全部通过；Chrome for Testing 152（桌面 N-1）上本模块浏览器测试全部通过。详见 [verification.md](verification.md)。

## Task List

> Tasks tracked in this plan using local ids (T1–T13). GitHub 账号不可用，没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword。

### Phase 1：决定

- T1 ADR-0035 提议稿与浏览器探路

### 检查点 A：ADR 已接受，探路有结论

### Phase 2：契约与编译

- T2 contracts：v3 策略类型与校验（blocked by 检查点 A）
- T3 contracts：v3 计划与缓存命名（blocked by T2）
- T4 core：v3 编译（blocked by T3）

### 检查点 B：契约与编译就位

### Phase 3：worker 侧

- T5 sw-runtime：响应准入纯函数（blocked by 检查点 B，可与 T6 并行）
- T6 engine-workbox：运行时缓存端口（blocked by 检查点 B）
- T7 sw-runtime：请求路径与 `served-from-cache` 发送（blocked by T5、T6）
- T8 sw-runtime：激活期清理与登出清理（blocked by T7）

### 检查点 C：worker 侧就位

### Phase 4：页面侧与适配器

- T9 client-runtime：`served-from-cache` 事件与绑定同步（blocked by 检查点 C）
- T10 适配器：Vite 接受 v3，Nuxt 拒绝启用的 v3（blocked by 检查点 C，可与 T9 并行）
- T11 真实浏览器证据（blocked by T8、T9、T10）

### 检查点 D：证据齐备

### Phase 5：交付

- T12 文档同步（blocked by 检查点 D）
- T13 模块质量门禁（blocked by T12）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **平台 worker 的 `fetch` 行为变化波及所有已交付应用** | 高：v1/v2 应用回归 | 只有 v3 且 `enabled=true` 才进入新分支；v1/v2 golden 与既有测试一字不改；每个 sw-runtime 任务跑全仓回归，含 vite、nuxt、examples 的浏览器测试 |
| **私有数据被写入缓存** | 高：违反安全模型 | 准入是纯函数，每条拒绝分支都有 RED 测试与变异证明；`Set-Cookie` 由业务承担并以 `private` 兜底，写入安全模型与接入指南；评审重点 |
| **Workbox 行为与假设不符** | 中：存活时间、淘汰或配额语义不对 | T1 探路；存活时间以平台自己的内部头为准，不依赖 Workbox 内部模型 |
| **内部时间头泄漏给页面** | 中：页面看到平台内部数据 | 引擎单测与真实浏览器测试都断言页面拿到的响应没有该头 |
| **导航事件丢失** | 中：页面误以为数据是新的 | T1 探路定方案；T9、T11 覆盖"页面晚于消息初始化" |
| **清理删到不该删的缓存** | 高：其他应用或 `precache` 数据丢失 | 删除范围限定在当前 `cacheNamespacePrefix` 与两个运行时 kind；变异证明；真实浏览器断言其他缓存不变 |
| **新增事件类型破坏穷举检查的代码** | 中：绑定包与业务 TS 编译失败 | T9 同步 Vue/React；迁移指南写明；包仍是 beta，按 ADR-0028 的预发布规则处理版本号 |
| **回滚到旧平台版本后缓存残留** | 低：公共数据占用空间，不会被读取 | ADR 与发布手册写明；恢复 worker 可以清除 |
| **弱网下 network-first 一直挂起** | 低：已接受的已知限制 | ADR 写明；以后再单独评审是否引入超时 |
| **E2E 不稳定或空过** | 中：证据失真 | 等待以状态为准；每场景变异；`--repeat-each 10` |

## 待定问题

无。评审结论见规格"评审结论（2026-09-24）"。


## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| architecture | `docs/architecture/overview.md` | 分层图补充运行时缓存经引擎端口执行。 |
| developer-entry | `README.md` | 说明 `PwaPolicy v3` 显式开启的边界。 |
| decisions | `docs/adr/` | 新增 ADR-0035。 |
| lifecycle-and-recovery | `docs/architecture/lifecycle.md` | 激活期运行时缓存清理与回滚残留的已知限制。 |
| supply-chain | `pnpm-workspace.yaml`、`docs/operations/dependency-changes.md` | 按依赖变更流程登记新增的 `workbox-strategies`、`workbox-expiration`。 |
| release-and-incident | `docs/operations/release-and-incident-runbook.md` | 回滚到旧平台版本时运行时缓存残留的处置。 |
| recovery-drill | `docs/operations/recovery-drill.md` | 演练核对项加入运行时缓存被清除。 |
| workbox-engine | `spec/workbox-engine.md`、`docs/adr/0011-platform-injects-compiled-precache-manifest.md` | 引擎端口新增运行时缓存能力。 |
| sw-runtime | `spec/sw-runtime.md`、`docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md` | 请求判断表新增运行时缓存分支。 |
| vite-adapter | `spec/vite-adapter.md`、`docs/adr/0015-vite-plugin-build-pipeline.md`、`docs/adr/0022-vite-injects-manifest-link.md` | 接受 v3 策略。 |
| client-runtime | `spec/client-runtime.md`、`docs/adr/0013-client-facade-and-page-side-lifecycle-events.md` | 新事件 `served-from-cache` 与 logout 清理扩展。 |
| ssr-adapters | `spec/ssr-adapters.md`、`tasks/ssr-adapters/verification.md`（T10 交付）、`docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md`（2026-09-17 增补两处离线导航回退）、`docs/adr/0015-vite-plugin-build-pipeline.md`（2026-09-17 增补不依赖 Vite 插件钩子的产物流水线入口）、`docs/adr/0016-framework-bindings.md`（2026-09-17 增补服务端渲染语义） | Nuxt 对启用的 v3 明确报错。 |
| public-read-cache | `spec/public-read-cache.md`、`docs/adr/0035-explicit-public-read-runtime-cache.md`、`docs/guides/public-read-cache.md`、`tasks/public-read-cache/plan.md` | 记录本模块与验证证据。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| architecture | delivered | `docs/architecture/overview.md` | T12（`2453445`）同步了 `lifecycle.md`、`contracts.md`、`security-model.md`；2026-09-24 补"运行时缓存（v1.1）"一节，说明运行时缓存经编译计划与引擎端口执行、Workbox 不外露。 |
| developer-entry | delivered | `README.md` | T12（`2453445`）在开发状态中加入本模块、`PwaPolicy v3` 显式开启、ADR-0035 与接入说明链接，并注明 Nuxt 暂不支持开启。 |
| decisions | delivered | `docs/adr/0035-explicit-public-read-runtime-cache.md` | ADR-0035 已于 2026-09-24 接受，并记录 T13 评审后的实现修订；ADR-0008、0012、0013 各追加增补。 |
| lifecycle-and-recovery | delivered | `docs/architecture/lifecycle.md` | "运行时缓存的激活期清理（v1.1）"一节写明激活清理、过期记录清理与回滚残留；恢复 worker 的清理范围同步更新。 |
| supply-chain | delivered | `tasks/public-read-cache/verification.md` | "依赖变更"一节按流程登记两个新增运行时依赖、所有者批准、lockfile 审阅与冻结安装结果；无需豁免或构建脚本批准，`pnpm-workspace.yaml` 与流程文档本身无需改动。 |
| release-and-incident | delivered | `docs/operations/release-and-incident-runbook.md` | T12 新增"回滚到不认识运行时缓存的旧平台版本"一节：残留不是安全问题、清理时机、无需额外操作。 |
| recovery-drill | delivered | `docs/operations/recovery-drill.md` | T12 加入"运行时缓存与过期记录被清除"核对项及记录模板行，未启用时填"不适用"。 |
| workbox-engine | delivered | `spec/workbox-engine.md` | T12 追加"public-read-cache 增补（2026-09-24）"：运行期入口新增 `createRuntimeCacheEngine`。 |
| sw-runtime | delivered | `spec/sw-runtime.md` | T12 追加增补，修订"平台 v1 没有运行时缓存"一类结论；ADR-0012 同步增补请求判断表与恢复 worker 删除范围。 |
| vite-adapter | delivered | `spec/vite-adapter.md` | T12 追加增补：插件接受 `PwaPolicy v3`。 |
| client-runtime | delivered | `spec/client-runtime.md` | T12 追加增补：页面侧事件由五个扩为六个，新增 `served-from-cache`；ADR-0013 同步增补。 |
| ssr-adapters | delivered | `spec/ssr-adapters.md` | T12 追加增补：`@pwa-platform/nuxt` 对启用的 `PwaPolicy v3` 明确报错。 |
| public-read-cache | delivered | `tasks/public-read-cache/verification.md` | T13 门禁结果、未取得的证据（CI、Android、N-1）与已知限制已记录；ADR-0035 与[接入指南](../../docs/guides/public-read-cache.md)已交付，基线本行保持 `target`。 |
