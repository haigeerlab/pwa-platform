# 规格：offline-write-extension

## 目标

交付路线图 v3 的可选离线写入能力：业务可将**已声明为非敏感**的 JSON `POST` 意图显式入队，并在拥有匹配会话绑定的受控页面中显式重放。平台提供受限的持久化、配额、清理与可观察状态；业务服务端继续拥有授权、幂等、冲突处理和最终用户体验。

成功标准：队列永不接手任意网络写请求，绝不在账户切换后重放旧账户意图，登出/恢复后不留下可重放记录，且同一幂等键不会因网络不确定性产生第二个业务意图。

决定见 [ADR-0027](../docs/adr/0027-explicit-session-bound-offline-write-queue.md)。

## 已核实的现状（2026-09-20）

| 事实 | 位置 |
|---|---|
| 现有 worker 对所有非 `GET` 请求均不接手 | `spec/sw-runtime.md` 请求判断表、`packages/sw-runtime/src/worker/handlers.ts` |
| `PwaPolicy` 与 `PwaPlan` 都是 v1；Plan 是闭合的 15 字段结构 | `packages/contracts/src/policy.ts`、`packages/contracts/src/plan.ts` |
| 平台 worker 配置严格封闭，现有运行期没有 IndexedDB、sync 或写入消息 | `packages/sw-runtime/src/shared/config.ts`、`packages/sw-runtime/src/worker/handlers.ts` |
| `logout()` 只注销 registration；恢复 worker 只清 Cache Storage 后取消 Push | `spec/client-runtime.md`、`spec/sw-runtime.md` |
| 安全模型要求登出清除平台管理的用户敏感分类，且默认拒绝 mutation | `docs/architecture/security-model.md` |

## 范围

### 交付

- `PwaPolicy v2` / `PwaPlan v2` 的离线写 target 声明、验证和确定性编译；v1 输入不得静默降级。
- 平台 worker 的消息协议、IndexedDB 队列、显式 flush、精确配额、会话绑定隔离与敏感状态清理。
- 恢复 worker 对 identity 派生的离线写数据库的最小删除。
- client-runtime 的 logout 清理握手；Vite、Nuxt、Vue/React 对协调 v2 配置的适配。
- 新包 `@pwa-platform/offline-write`：页面侧 typed facade，只通过消息协议与受控 worker 通信。
- Chrome 桌面端真实浏览器证据：入队、断网保留、匹配绑定重放、绑定变化删除、logout 清理、恢复清理与拒绝类请求仍透传。

### 不交付

- 对任意 API 的 fetch 拦截、自动重放、Background Sync、Periodic Sync、Push 触发 flush。
- `GET` 缓存、私有响应缓存、离线读取、文件/表单/二进制正文、自定义请求头、跨源目标、`PUT`/`PATCH`/`DELETE`。
- 加密一个业务声称为非敏感的正文，或自动判定正文是否包含敏感数据。
- 平台侧冲突解决、授权判断、服务端幂等存储、死信重放、响应正文持久化、遥测中记录载荷。

## 契约

### 策略与计划

`PwaPolicy` 升为 `schemaVersion: 2`，新增必填字段：

```ts
type PwaOfflineWriteTarget = {
  readonly id: string;                 // 1–64，稳定、唯一的 ASCII slug
  readonly pathPrefix: `/${string}`;  // mountPath 相对，按完整路径段匹配
  readonly maxBodyBytes: number;      // 1–16_384
};

type PwaOfflineWritePolicy = {
  readonly enabled: boolean;
  readonly maxEntries: number;        // 1–50，enabled=false 时为 0
  readonly maxTotalBodyBytes: number; // 1–524_288，enabled=false 时为 0
  readonly targets: readonly PwaOfflineWriteTarget[];
};
```

- `enabled=false` 时 targets 为空，所有上限为 0；`enabled=true` 时 targets 非空，id 与解码后路径前缀均唯一。
- 路径必须在 identity scope 内，并且必须落在一条 `mutation` 资源规则下；该规则照旧编译为 `deny`，所以普通 fetch 的非 `GET` 透传语义不变。target 不得被 `session-data`、`stream`、`unclassified`、`exclude` 或另一条更高优先级拒绝规则覆盖。策略 target 是独立的离线写入许可，不改变读取缓存和请求判断表。
- `PwaPlan v2` 新增闭合的 `offlineWrites` 字段：`enabled`、identity 派生的数据库名、总配额和已解析的绝对 target 前缀及上限。worker 配置含相同的最小运行时信息；不注入原始 policy、业务正文或 session binding。
- contracts 用专属 `offline-write.*` 诊断码，不回显 target、绑定、键或正文；core 对输入乱序输出相同 plan。

### 页面 API

```ts
type OfflineWriteIntent = {
  readonly targetId: string;
  readonly path: string;          // 同源、scope 内，且匹配目标前缀
  readonly body: unknown;         // 可 JSON 序列化，UTF-8 后不超过 target 上限
  readonly idempotencyKey: string;// 1–128 ASCII；同一业务意图跨重试不变
  readonly sessionBinding: string;// 16–128 ASCII opaque 值；不得是用户标识、token 或 PII
};

type OfflineWriteQueue = {
  enqueue(intent: OfflineWriteIntent): Promise<{ readonly status: "queued" | "existing" }>;
  flush(sessionBinding: string): Promise<{ readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number }>;
  clear(): Promise<void>;
};
```

- 只能在已注册且当前控制页面的同 scope worker 上调用；否则拒绝并不创建本地记录。模块从不调用 `register()`、`fetch()`、IndexedDB 或 Background Sync。
- worker 对输入做精确字段、普通对象、长度、JSON、路径、target 与配额校验；错误只返回稳定代码。`enqueue` 在写入成功后才解析为 `queued`。
- 同一幂等键只能映射到完全相同的 target、path、UTF-8 JSON 正文和 session binding；相同则 `existing`，不同则拒绝。键由业务创建并跨重试复用，平台绝不生成、替换或记录响应正文。
- `flush(binding)` 先永久删除所有其他 binding 的记录，再只按 FIFO 发送匹配 binding 的记录。请求固定为同源 `POST`、`credentials: "same-origin"`、`content-type: application/json` 与 `idempotency-key`；不接受来自意图的 headers。
- 2xx 删除；网络错误和 5xx 保留；401/403 标记为 `authorization-required`，其他 4xx 标记为 `rejected`，均不自动重试。失败状态不含响应正文。后续 `enqueue` 同键同意图可返回 existing，业务必须以新的业务意图重新提交。

### 清理与恢复

- `logout()` 向当前 worker 发清理请求并等待带关联 id 的确认，成功后才注销 registration；确认超时、协议不匹配或删除失败均拒绝 logout 并保留 registration。未启用离线写时，worker 同样确认空清理，保持统一语义。
- 平台 worker 的清理只删除其注入数据库名；恢复 worker 接收同一 identity 派生名，在 Cache Storage 清理完成后删除该数据库、取消 Push 订阅、最后 claim。删除被 `blocked` 或失败时不得 claim。
- `clear()` 走同一 worker 路径；业务不得自行猜数据库名或调用 `indexedDB.deleteDatabase`。

## 服务端责任

服务端必须把 `(idempotencyKey, request digest)` 以原子唯一约束认领；同键不同摘要返回明确客户端错误；未完成重复返回 409/202 或经过有界等待的原结果；保留时间覆盖最长可能离线期。网络超时是未知结果，平台可能用相同键再送一次，因此服务端不得把“同一键再次到达”当作新业务意图。

## 命令

```bash
pnpm --filter @pwa-platform/contracts test
pnpm --filter @pwa-platform/core test
pnpm --filter @pwa-platform/sw-runtime test
pnpm --filter @pwa-platform/client-runtime test
pnpm --filter @pwa-platform/offline-write test
pnpm build && pnpm test && pnpm typecheck && pnpm lint
pnpm test:browser
```

## 测试策略

- **contracts/core**：v2 的闭合形状、上限、重复 target、拒绝路径、v1 明确失败、编译确定性与 plan golden。
- **worker 单元测试**：消息来源与字段、入队原子性、配额边界、同键相同/不同、会话 binding 匹配/改变、响应分类、无 fetch 拦截、消息中不泄露正文。
- **client-runtime / recovery**：logout 成功、ack 丢失、删除失败、未启用配置；恢复删除精确数据库、被 blocked 时不 claim，且不影响 entry-resilience 或其他应用数据库。
- **包边界**：新包不出现 `fetch`、`indexedDB`、`navigator.serviceWorker.register`、Background Sync、日志或载荷/键回显；worker 运行期不导入 Node 或未评审包。
- **真实浏览器**：离线入队后持久化；同 binding 恢复联网后只送一次；不同 binding 先 purge 不发送；logout/recovery 后数据库不存在；非 GET 请求与未声明路径不被 fetch 监听接手。每个安全分支配一次变异。

## 边界

- **始终**：默认拒绝、显式调用、同源+scope+target 验证、会话绑定、配额、登出/恢复清理、稳定且不含输入的诊断。
- **先询问**：新增方法、target/正文/配额上限、允许 headers、Background Sync、自动重放、任何 PII 或敏感正文持久化、修改 v2 迁移语义。
- **绝不**：接手任意 fetch；跨源发送；以新会话重放旧 binding；存储 token/Cookie/Authorization/响应正文；记录或上报正文、绑定或幂等键；宣称 exactly-once。

## 验收标准

1. ADR-0027 与 v2 迁移文档被接受，v1 不会静默运行离线写。
2. 队列 API、worker 与计划契约均为封闭、可验证且向错误输入 fail-closed。
3. 只有显式、匹配 target/binding 的 JSON POST 能写入或发送；所有其他网络写仍完全透传。
4. 配额、幂等键一致性、状态分类及清理的单元与变异测试均通过。
5. Chrome 桌面端真实浏览器证明核心安全路径；未取得 Android、N-1 或 Background Sync 证据必须如实登记。
6. 安全模型、生命周期、包边界、迁移指南、文档基线和验证记录与实现同步。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| local-ci-record | follow | 不改变该基线的权威文档或验收结论。 |
| product-direction | follow | 不改变产品目标。 |
| architecture | follow | 不改变分层方向。 |
| developer-entry | update | README 说明 v2 opt-in 边界。 |
| capability-map | follow | 能力图已声明本模块。 |
| decisions | follow | ADR-0027 是权威决定。 |
| lifecycle-and-recovery | update | recovery 清理队列的顺序已补充。 |
| ci-baseline | follow | 不改 CI。 |
| supply-chain | follow | 无依赖变更。 |
| browser-matrix | follow | 未取得证据保持原记录。 |
| v1-acceptance | follow | 不扩展 v1 验收。 |
| identity-release-baseline | follow | 不改身份基线。 |
| release-and-incident | follow | 不改发布手册。 |
| recovery-drill | follow | 不改运维演练。 |
| browser-release-evidence | follow | 未取得生产发布证据。 |
| browser-test-harness | follow | 仅复用现有测试工具。 |
| workbox-engine | follow | 不改引擎契约。 |
| sw-runtime | follow | 运行时边界由 ADR-0027 约束。 |
| offline-write-extension | update | 记录本模块与验证证据。 |
| build-verifier | follow | 不改校验器。 |
| release-gate-contract | follow | 不改门禁契约。 |
| release-orchestration-protocol | follow | 不改外部编排。 |
| vite-adapter | follow | 仅验证既有 v2 配置。 |
| client-runtime | update | logout 的 v2 清理语义已补充。 |
| vue-react-adapters | follow | 不改绑定公开面。 |
| examples-browser-e2e | follow | 不改示例。 |
| pwa-entry-resilience | follow | 不改入口恢复。 |
| ssr-adapters | follow | 不改 SSR 适配器。 |
| shared-origin-topology | follow | 不改同源拓扑。 |
| package-distribution | follow | 不改 npm 分发范围。 |
| cloudflare-test-deployment | follow | 不改 Cloudflare 测试部署。 |
| push-module | follow | 不改 Push 模块。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
