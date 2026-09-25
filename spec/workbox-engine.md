# 规格：workbox-engine

## 目标

封装 Workbox 的 InjectManifest 模式，为平台 worker 提供预缓存引擎端口：

- **构建期**：把 `PwaPlan.precache` 按 Workbox manifest 格式注入平台 worker 源码中的注入点。
- **运行期**：在 worker 中基于 `workbox-precaching` 提供预缓存端口，由 sw-runtime 在 install、activate 与请求处理时调用。

Workbox 的选项、插件与 callback 都不暴露给业务（[ADR-0002](../docs/adr/0002-declarative-policy-and-compiled-plan.md)），预缓存清单与规则优先级只来自已编译的计划（[ADR-0007](../docs/adr/0007-separate-contracts-from-policy-compilation.md)）。

成功标准：

- sw-runtime 只通过端口使用预缓存，不直接导入 Workbox。
- 注入结果与 `PwaPlan.precache` 一一对应、顺序一致；注入点或计划不合法时，构建期直接失败。
- 在真实浏览器中：install 按清单填充以 contracts `cacheName(identity, "precache")` 命名的缓存；部署新清单并激活后，只移除该缓存里已不在清单中的条目；引擎不拦截请求、不跳过等待、不触碰其他缓存。

## 范围

**交付物：**

- 私有工作区包 `packages/engine-workbox`，包名 `@pwa-platform/engine-workbox`（沿用 README 与包边界文档中的名称）：
  - 入口 `.`（构建期，Node）：`injectPrecacheManifest`、`WORKBOX_INJECTION_POINT`；只依赖 `@pwa-platform/contracts`，不导入 Workbox。
  - 入口 `./worker`（运行期，Service Worker）：`createPrecacheEngine` 与类型 `PwaPrecacheEngine`；依赖 `workbox-precaching` 与 `workbox-core`，不导入任何 Node 模块。
- 单元测试（Vitest）与浏览器自测（Playwright 与 browser-test-harness，测试 worker 由 vite 打包）。
- `docs/adr/0011-platform-injects-compiled-precache-manifest.md`：修订 [ADR-0003](../docs/adr/0003-workbox-inject-manifest.md)，平台按 Workbox InjectManifest 模式注入编译计划的预缓存清单，不使用 `workbox-build` 扫描构建产物。
- 同步 `docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- 平台 worker 本身、请求路由与 fetch 处理、离线降级、更新提示、恢复 worker、跨缓存清理（归 sw-runtime）。
- 路径规则对应的运行时缓存策略（能力图：运行时缓存留待后续能力）。
- 打包平台 worker、写出构建产物文件（归 vite-adapter）。
- `workbox-build`、`workbox-window`、`generateSW`，以及 Workbox 的 `PrecacheRoute`、`cleanupOutdatedCaches`、navigation preload。
- 在引擎中重新推导预缓存清单或规则优先级。

## 依赖

- **运行时依赖**：`@pwa-platform/contracts`（`workspace:*`）、`workbox-precaching@7.4.1`、`workbox-core@7.4.1`，精确版本。已核实：
  - 发布已满 1 天，没有安装脚本；
  - 在本仓库的供应链设置下试安装通过，只新增 `workbox-precaching`、`workbox-core`、`workbox-routing`、`workbox-strategies` 四个包；
  - Workbox 各版本都没有 provenance，`trustPolicy: no-downgrade` 不判为降级。
- **开发依赖**：`@pwa-platform/browser-test-harness`（`workspace:*`）、`@playwright/test@1.63.0`、`vite@8.3.0`（lockfile 中已有，目前由 vitest 引入）、`@types/node@24.13.4`。
- **不引入 `workbox-build`**：它的传递依赖 `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1` 被 `trustPolicy: no-downgrade` 拒绝；而且它按 glob 扫描构建产物生成清单，与 core 已编译的清单重复。
- **运行期入口必须打包**：Workbox 的模块使用裸模块导入（如 `workbox-core/_private/logger.js`）并读取 `process.env.NODE_ENV`，因此 `./worker` 入口必须先经打包器处理，并把 `process.env.NODE_ENV` 定义为 `"production"`，才能在 worker 中运行。平台 worker 的打包由 vite-adapter 负责；本模块的浏览器自测用 vite 打包测试 worker。

## 公开契约

### 构建期：注入预缓存清单

`injectPrecacheManifest(workerSource: string, plan: PwaPlan): string`

- `WORKBOX_INJECTION_POINT` 为 `self.__WB_MANIFEST`，与 Workbox 的默认注入点一致。
- 注入发生在打包之后：平台 worker 源码先由打包器处理，注入点必须在打包产物中原样保留（打包时不得改写或压缩它），再对产物调用本函数（[ADR-0011](../docs/adr/0011-platform-injects-compiled-precache-manifest.md)）。
- 先用 contracts 的 `validatePlan` 校验计划；无效时抛错，错误信息只列出诊断码与路径，不回显输入内容。
- 再按运行期端口的规则检查 `plan.precache`：`revision` 为 `null` 或非空字符串，URL 不重复。contracts 接受这两种条目，但端口会在 worker 启动时拒绝，因此在构建期抛错；错误信息只给出条目路径（如 `/precache/1/revision`）。
- 注入点必须在 worker 源码中按字面恰好出现一次（注释中的出现也计入）；出现 0 次或多于 1 次时抛错。
- 注入内容是 JSON 数组，每个元素为 `{"url": 条目 URL, "revision": 条目 revision}`，与 `plan.precache` 的顺序和内容一一对应：不增加、删除或改写条目，不生成 `integrity`。
- 结果是确定的：相同输入得到逐字节相同的输出。
- 纯函数：不读写文件，不打包，不压缩。

### 运行期：预缓存端口

`createPrecacheEngine({ cacheName, entries }): PwaPrecacheEngine`

- `cacheName` 应当是 contracts `cacheName(identity, "precache")` 的结果；引擎要求它以 `pwa:` 开头、以 `:precache` 结尾，否则抛错，以免误用 Workbox 的默认缓存名。
- `entries` 是注入的清单（`self.__WB_MANIFEST`）：每项 `url` 为规范的同源绝对路径，规则与 contracts 对 `PwaPlan.precache` 的规则相同（以 `/` 开头，不含查询、片段、点段、`//` 与反斜杠，URL 解析不会改写它）；`revision` 为非空字符串或 `null`。条目不合法或 URL 重复时抛错。
- 创建引擎时不注册任何事件监听，也不调用 `skipWaiting` 或 `clients.claim`。

`PwaPrecacheEngine` 提供：

| 方法 | 行为 |
|---|---|
| `install(event)` | 在 install 事件中调用。把清单中尚未缓存或 revision 已变化的条目下载并写入 `cacheName`，带 revision 的条目用 Workbox 的 `__WB_REVISION__` 缓存键区分；任一请求失败即安装失败。在事件派发期间调用 `event.waitUntil`。返回已更新与未更新条目的绝对 URL（不含 `__WB_REVISION__`）。 |
| `activate(event)` | 在 activate 事件中调用。删除 `cacheName` 中已不在清单内的条目，不删除、不打开任何其他缓存。返回被删除的缓存键：绝对请求 URL，带 revision 的条目含 `__WB_REVISION__`。 |
| `match(url)` | 只读 `cacheName`。把 `url` 解析为同源绝对 URL 并忽略片段后，与清单 URL 精确匹配，不推断 `index.html`、`.html` 或查询参数变体；不在清单中、无法解析或尚未缓存时返回 `undefined`，从不访问网络。 |
| `urls()` | 返回 `entries` 中原样的 URL（路径），顺序一致。 |

## 命令

```bash
pnpm --filter @pwa-platform/engine-workbox build
pnpm --filter @pwa-platform/engine-workbox test
pnpm test:browser --filter @pwa-platform/engine-workbox
pnpm --filter @pwa-platform/engine-workbox typecheck
```

CI 的 browser job 已递归运行 `pnpm test:browser`，引擎的浏览器自测随之在 CI 中运行，不需要修改工作流。

## 测试策略

- **单元测试（Vitest，Node）**：
  - 注入：注入点出现 0 次、1 次、2 次；注入结果与计划一一对应且顺序一致；`revision: null`；含百分号编码的 URL 与含 U+2028 等特殊字符的 revision 注入后 JS 可解析且 JSON 等价；无效计划抛错且不回显输入；contracts 接受但端口会拒绝的条目（空 revision、重复 URL）抛错；输出确定。
  - 端口参数：`cacheName` 前后缀、条目格式、规范路径（包括反斜杠、制表符、换行等会解析到其他源的写法）、重复 URL 的校验逻辑。
  - 依赖边界：构建期入口不导入 Workbox 与 Node 以外的包；运行期入口不导入 Node 模块。导入按 TypeScript 语法树读取，引号、分号与缩进的写法都不影响检查。
- **浏览器自测（Playwright 与 browser-test-harness，Chrome）**：测试 worker 源码先由 vite 打包，再对产物调用 `injectPrecacheManifest` 注入 fixture 计划，组成版本化站点：
  - install 后 `cacheName` 中恰好包含清单条目，带 revision 的条目以 `__WB_REVISION__` 缓存键保存；断网时 `match` 返回缓存内容，不在清单中的 URL 返回 `undefined`；
  - 部署新清单（增删条目、改变一个 revision）并由新 worker 接管后，activate 只删除已移除的条目、更新 revision 变化的条目，其他缓存（包括同应用其他 revision 的对照缓存）保持不变；
  - 引擎不拦截请求（`fromServiceWorker` 为假），不跳过等待（测试 worker 自身不调用 `skipWaiting` 时新版本保持 waiting）；
  - 清单中有条目返回 404 时，worker 安装失败。
- **变异检查**：逐个破坏注入与端口的核心判断，确认对应测试失败，恢复后源码逐字节一致。

## 边界

- **始终**：只消费 `PwaPlan`，不推导清单与优先级；缓存名来自 contracts；依赖精确固定版本；运行期入口不含 Node 依赖，构建期入口不含 Workbox。
- **先询问**：新增 Workbox 包或其他依赖；使用 `workbox-build`、`PrecacheRoute`、`cleanupOutdatedCaches`、navigation preload 或 `integrity`；改变注入点或注入格式；让引擎注册监听、跳过等待或接管客户端。
- **禁止**：向业务暴露 Workbox 的选项、插件或 callback；在引擎中实现路由、运行时缓存策略、离线降级或跨缓存清理；使用计划以外的清单来源。

## 验收标准

1. `@pwa-platform/engine-workbox` 提供两个入口：构建期的 `injectPrecacheManifest` 与 `WORKBOX_INJECTION_POINT` 只依赖 contracts；运行期的 `createPrecacheEngine` 只依赖 `workbox-precaching` 与 `workbox-core`（精确版本 `7.4.1`）。
2. 注入结果与 `plan.precache` 一一对应、顺序一致、结果确定；注入点不是恰好一次或计划无效时抛错。
3. 端口只在被调用时工作：不注册监听、不跳过等待、不接管客户端；install 填充 `cacheName`；activate 只清理 `cacheName` 内的过期条目；`match` 只读缓存并精确匹配。
4. 单元测试、浏览器自测与变异检查覆盖以上行为；`pnpm test:browser` 在本地与 CI 通过。
5. ADR-0011 记录注入方式对 ADR-0003 的修订；包边界、README 与文档基线已同步。

## 已决定事项（项目所有者，2026-09-15）

- 引擎把 `PwaPlan.precache` 按 Workbox InjectManifest 格式注入 worker，不使用 `workbox-build`，新增 ADR-0011 修订 ADR-0003。
- 端口只做预缓存；路径规则对应的运行时缓存策略留待后续能力。
- 浏览器自测复用 lockfile 中已有的 vite 8.3.0 打包测试 worker。

## 已决定事项（项目所有者，2026-09-16，独立评审之后）

- contracts 接受但端口会拒绝的预缓存条目（空 revision、重复 URL），由引擎在注入时补充校验并在构建期失败；contracts 不改动。
- 端口参数中的条目 URL 采用与 contracts `PwaPlan.precache` 相同的规范路径规则，拒绝会被 URL 解析器改写到其他源的写法。
- 注入发生在打包之后，注入点必须在打包产物中原样保留；规格与 ADR-0011 同步写明。

## public-read-cache 增补（2026-09-24）

引擎端口新增运行时缓存能力，服务于 [public-read-cache](public-read-cache.md)（[ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)）：运行期入口新增 `createRuntimeCacheEngine`，基于 `workbox-strategies@7.4.1`（`NetworkFirst`、`StaleWhileRevalidate`）与 `workbox-expiration@7.4.1`（`ExpirationPlugin`，只用于条目数淘汰与配额清空，不配置 `maxAgeSeconds`）封装 `network-first`、`stale-while-revalidate` 两种策略。公开类型不出现任何 Workbox 类型或选项，与预缓存端口的边界原则一致；调用方（sw-runtime）传入平台定义的 `admit(response) => Promise<boolean>` 回调决定是否写入，引擎本身不做准入判断。新增运行时依赖 `workbox-strategies`、`workbox-expiration`（带来传递依赖 `idb@7.1.1`），已按[依赖变更流程](../docs/operations/dependency-changes.md)登记。预缓存端口（`createPrecacheEngine`）与本节以外的契约不变。

## 开放问题

- sw-runtime 在运行期如何取得 `cacheName` 与其余计划字段（例如随清单一同注入的运行时配置），由 sw-runtime 规格决定；引擎只接收参数。
- Workbox 7.4.1 在非 production 构建中会输出开发日志；平台 worker 是否允许开发构建，由 vite-adapter 决定。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

**2026-09-24 补齐**：本模块当天再次进入修订，按上述约定补齐了该表，见下方 Documentation impact；表只针对那次修订。

## Documentation impact

本表针对 2026-09-24 的 public-read-cache 增补：运行期入口新增 `createRuntimeCacheEngine`（见上文增补）。此前交付的部分不据此反推（2026-09-23 的决定）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 不涉及。 |
| decisions | follow | ADR-0035 由 public-read-cache 模块创建。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | 不涉及。 |
| supply-chain | follow | 新增的 `workbox-strategies`、`workbox-expiration` 按依赖变更流程登记在 public-read-cache 的验证记录中。 |
| browser-matrix | follow | 不涉及。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | follow | 不涉及。 |
| workbox-engine | update | 规格追加 public-read-cache 增补，引擎端口新增运行时缓存能力。 |
| sw-runtime | follow | worker 如何调用引擎由 sw-runtime 的增补记录。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 不涉及。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | 不涉及。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 运行时缓存的契约由该模块维护。 |
