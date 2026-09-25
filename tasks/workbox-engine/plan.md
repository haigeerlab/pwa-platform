# 实现计划：workbox-engine

## 概览

交付私有工作区包 `@pwa-platform/engine-workbox`，为平台 worker 提供预缓存引擎端口：

- 构建期入口：`injectPrecacheManifest` 把 `PwaPlan.precache` 按 Workbox manifest 格式注入 worker 源码；
- 运行期入口：`createPrecacheEngine` 基于 `workbox-precaching` 的 `PrecacheController` 提供 install、activate、精确匹配与清单列表；
- 用 vite 打包测试 worker，借助 browser-test-harness 在真实 Chrome 中验证；
- ADR-0011 修订 ADR-0003，并同步文档。

本模块不实现平台 worker、路由、离线降级、运行时缓存策略或跨缓存清理，也不打包平台 worker。

> Tasks tracked in GitHub Issues #6

## 架构决定

- **包结构**：
  - `src/build/`：构建期源码，只依赖 `@pwa-platform/contracts`，由包入口 `.` 导出；
  - `src/worker/`：运行期源码，只依赖 `workbox-precaching` 与 `workbox-core`，由 `./worker` 导出；
  - 两部分使用各自的 tsconfig：构建期使用 Node 类型，运行期使用 `WebWorker` lib，互不混用全局类型；
  - `test/`：Vitest 单元测试；`browser-tests/`：Playwright 浏览器自测；`fixtures/`：测试 worker 源码与 fixture 站点。
- **依赖**：`workbox-precaching@7.4.1` 与 `workbox-core@7.4.1` 为运行时依赖，精确固定；`vite@8.3.0`、`@playwright/test@1.63.0`、`@types/node@24.13.4` 与 browser-test-harness 为开发依赖。安装后审阅 lockfile，确认只新增预期的 Workbox 包。
- **错误处理**：构建期与端口参数校验以抛出 `Error` 表达，信息只含诊断码、路径或字段名，不回显输入内容；不新增 contracts 诊断码。
- **测试 worker 打包**：浏览器自测开始前，用 vite 的构建 API 把测试 worker 源码打包为单文件（`process.env.NODE_ENV` 定义为 `"production"`），输出到被 git 忽略的目录，再作为 fixture 站点提供。测试 worker 充当 sw-runtime 的替身，只在测试中出现。
- **CI 实跑证据**：需要推送分支才能取得。任务 6 只做本地验证，远端通过与报红的证据在任务 7 中、经项目所有者授权推送后取得。

## 任务定义

### 任务 1：包骨架、Workbox 依赖与依赖边界

**说明：** 建立 `packages/engine-workbox`，引入 Workbox 依赖，建立两个入口与依赖边界测试。

**验收标准：**

- 包具备 `build`、`test`、`test:browser`、`typecheck` 脚本；`exports` 只有 `.` 与 `./worker`，均指向 `dist`。
- `workbox-precaching` 与 `workbox-core` 精确为 `7.4.1`；lockfile 只新增 `workbox-precaching`、`workbox-core`、`workbox-routing`、`workbox-strategies`，没有安装脚本或非 registry 来源。
- 依赖边界测试：构建期源码只导入相对模块与 `@pwa-platform/contracts`；运行期源码只导入相对模块、`workbox-precaching` 与 `workbox-core`，不导入 Node 模块。
- 构建期与运行期分别类型检查通过。

**验证：**

- `CI=true pnpm install --frozen-lockfile` 通过，并记录 lockfile diff。
- `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck` 通过。

**依赖：** 无。

**预计范围：** M（`package.json`、两份 tsconfig 与构建配置、入口文件、依赖边界测试、lockfile）。

### 任务 2：构建期注入 `injectPrecacheManifest`

**说明：** 实现把计划清单注入 worker 源码的纯函数。

**验收标准：**

- 导出 `WORKBOX_INJECTION_POINT`（`self.__WB_MANIFEST`）与 `injectPrecacheManifest(workerSource, plan)`。
- 用 contracts 的 `validatePlan` 校验计划，无效时抛错，信息只含诊断码与路径。
- 注入点必须按字面恰好出现一次，否则抛错。
- 注入内容是与 `plan.precache` 一一对应、顺序一致的 `{url, revision}` JSON 数组；结果确定；不读写文件。

**验证：**

- 单元测试：注入点 0/1/2 次；条目对应与顺序；`revision: null`；含百分号编码与 U+2028 的 URL 注入后可被 JS 解析且与计划 JSON 等价；无效计划抛错且不回显输入；相同输入输出逐字节一致。
- 变异检查：放宽"恰好一次"、打乱顺序、跳过计划校验后，对应测试失败。

**依赖：** 任务 1。

**预计范围：** S（注入源码与单元测试）。

### 任务 3：运行期预缓存端口 `createPrecacheEngine`

**说明：** 基于 `PrecacheController` 实现端口，并用单元测试覆盖参数校验。

**验收标准：**

- `createPrecacheEngine({ cacheName, entries })` 返回 `PwaPrecacheEngine`，提供 `install`、`activate`、`match`、`urls`。
- `cacheName` 必须以 `pwa:` 开头、以 `:precache` 结尾；条目 `url` 以 `/` 开头，`revision` 为非空字符串或 `null`；URL 不得重复；否则抛错。
- 创建与调用都不注册事件监听，不调用 `skipWaiting`、`clients.claim`；`match` 精确匹配清单 URL（忽略片段），只读 `cacheName`。

**验证：**

- 单元测试覆盖参数校验（前后缀、条目格式、重复 URL）与 URL 归一（片段、同源）。
- 依赖边界测试仍通过；运行期类型检查通过。
- 变异检查：放宽缓存名校验或重复 URL 检查后，对应测试失败。

**依赖：** 任务 2。

**预计范围：** S（端口源码、参数校验与单元测试）。

### 检查点：核心 API

- 构建期注入与运行期端口的 API 与规格一致，单元测试与变异检查完成。
- `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck` 通过。

### 任务 4：浏览器自测基础与 install、match

**说明：** 建立 vite 打包测试 worker 的流程，并在 Chrome 中验证安装与匹配。

**验收标准：**

- `vite@8.3.0` 为开发依赖；浏览器自测开始前把测试 worker（用 `injectPrecacheManifest` 注入 fixture 计划，调用端口）打包为单文件，输出目录被 git 忽略。
- install 后 `cacheName` 中恰好包含清单条目，带 revision 的条目以 `__WB_REVISION__` 缓存键保存。
- 断网时 `match` 返回已缓存内容；不在清单中的 URL 返回 `undefined`。
- 清单中有条目返回 404 时，worker 安装失败。

**验证：**

- `pnpm test:browser --filter @pwa-platform/engine-workbox` 在本地 Chrome 通过，并重复运行确认稳定。
- 变异检查：让 `match` 忽略清单、让 install 跳过条目后，对应自测失败。

**依赖：** 任务 3。

**预计范围：** M（Playwright 配置与打包步骤、测试 worker、fixture 站点、浏览器自测）。

### 任务 5：activate 清理与端口边界

**说明：** 验证部署新清单后的清理行为，以及端口不拦截请求、不跳过等待、不触碰其他缓存。

**验收标准：**

- 部署新清单（增删条目、改变一个 revision）并由新 worker 接管后，activate 只删除已移除的条目、更新 revision 变化的条目。
- 同 origin 的其他缓存（同应用其他 revision、其他应用、非平台缓存）保持名称与条目数不变。
- 引擎不拦截请求（`fromServiceWorker` 为假）；测试 worker 自身不调用 `skipWaiting` 时，新版本保持 waiting。

**验证：**

- 浏览器自测使用 harness 的 `snapshotCaches`、`waitForControllerChange`、`requestFromPage` 与 `waitForWorkerState`。
- 变异检查：让 activate 删除其他缓存、让端口注册 fetch 监听或调用 `skipWaiting` 后，对应自测失败。

**依赖：** 任务 4。

**预计范围：** M（v2 fixture 站点、测试 worker 变体、浏览器自测）。

### 任务 6：ADR-0011 与文档同步

**说明：** 记录注入方式的决定，并同步相关文档。

**验收标准：**

- 新增 `docs/adr/0011-platform-injects-compiled-precache-manifest.md`：平台按 Workbox InjectManifest 模式注入编译计划的预缓存清单，不使用 `workbox-build`；ADR-0003 状态注明被修订，原结论保留并指向 ADR-0011。
- `docs/architecture/package-boundaries.md` 写明引擎两个入口的依赖边界与"只由 sw-runtime、vite-adapter 使用"。
- `README.md` 与 `docs/DOCUMENTATION-BASELINE.md` 同步。

**验证：**

- 相对链接能解析；文档中的模块名都来自能力图。
- ADR-0011 与 ADR-0002、ADR-0007 及规格一致。

**依赖：** 任务 5。

**预计范围：** S（ADR-0011、ADR-0003 状态行、包边界、README、文档基线）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0011 与 ADR-0003 的修订写法之后，再进入模块质量门禁。

### 任务 7：workbox-engine 模块质量门禁

**说明：** 完成模块级验证、独立评审与 CI 实跑证据。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅：注入安全与确定性、端口是否可能误报或越界（监听、跳过等待、其他缓存）、依赖与供应链、文档一致性。阻断项与应修项已处理。
- 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让引擎浏览器自测失败的提交使 browser job 报红，撤销后恢复为绿。
- 结果写入 `tasks/workbox-engine/verification.md`。

**验证：**

- 干净 worktree 的命令输出；
- spec-guard 产物校验；
- CI 运行链接、结论、Node 与 Chrome 版本。

**依赖：** 任务 6。

**预计范围：** M（验证记录与评审修复）。

## Task List

### Phase 1：核心 API

- #49 包骨架、Workbox 依赖与依赖边界
- #50 构建期注入 injectPrecacheManifest（blocked by #49）
- #51 运行期预缓存端口 createPrecacheEngine（blocked by #50）

### Phase 2：浏览器验证

- #52 浏览器自测基础与 install、match（blocked by #51）
- #53 activate 清理与端口边界（blocked by #52）

### Phase 3：交付

- #54 ADR-0011 与文档同步（blocked by #53）
- #55 workbox-engine 模块质量门禁（blocked by #54）

## 风险与缓解

| 风险 | 影响 | 缓解方式 |
|---|---|---|
| vite 8 在 Playwright 自测前以编程方式打包 worker 时行为与预期不同（rolldown、模块格式、NODE_ENV 替换） | 高 | 任务 4 先验证打包产物不含裸模块导入与 `process.env`，失败时再决定打包方式（先询问） |
| `PrecacheController` 的内部行为（缓存键、清理范围）与端口承诺不符 | 高 | 端口行为以浏览器自测为准；清理范围用对照缓存断言；评审重点审查 |
| WebWorker 与 Node/DOM 全局类型冲突导致类型检查混乱 | 中 | 构建期与运行期使用独立 tsconfig，并在依赖边界测试中约束导入 |
| Workbox 包的传递依赖或后续版本触发供应链规则 | 中 | 精确固定版本；lockfile 审阅；升级走依赖变更流程 |
| 浏览器自测在 CI 上的时序不稳定 | 中 | 只用显式条件等待；本地重复运行；harness 自测已串行 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6 → 任务 7，每个任务单独提交。全部完成后开一条模块 PR，正文写 `Closes #6`。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| workbox-engine | `spec/workbox-engine.md`、`docs/adr/0011-platform-injects-compiled-precache-manifest.md` | 引擎端口新增运行时缓存能力。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| workbox-engine | delivered | `spec/workbox-engine.md` | 2026-09-24 规格追加"public-read-cache 增补"（`2453445`）。 |
