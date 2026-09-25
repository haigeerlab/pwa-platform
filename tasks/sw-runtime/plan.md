# 实现计划：sw-runtime

## 概览

按 [spec/sw-runtime.md](../../spec/sw-runtime.md) 交付私有包 `@pwa-platform/sw-runtime`，包含以下几部分：

- **构建期入口**：生成并注入 worker 配置。
- **平台 worker**：安装与激活、请求判断表、提示更新。
- **恢复 worker**：生产 worker 异常时的恢复路径。
- **共用的跳过等待消息**：页面与 worker 都使用。
- **两个 worker 入口脚本**：vite-adapter 打包的对象。

先在单元测试层完成全部核心判断，再用 Chrome 桌面端的浏览器自测验证 V1 验收矩阵中 worker 一侧的场景，并执行恢复演练。

## 架构决定

- **入口与依赖边界**：
  - `.` 只依赖 contracts；
  - `./worker` 只依赖 `@pwa-platform/engine-workbox/worker`；
  - `./recovery-worker` 与 `./messages` 没有依赖。
  - 配置的形态与校验放在没有依赖的共享模块中，构建期与运行期共用，保证"注入前的校验"与"启动时的校验"是同一份规则。
- **路径匹配**：sw-runtime 自带与 policy-compiler 相同的解码与整段匹配实现；一致性测试以开发依赖 `@pwa-platform/core` 的 `compilePlan` 为准。
- **请求判断表**：实现为不依赖事件对象的纯函数（输入请求方法、URL、是否导航与配置，输出"不接手 / 查预缓存 / 网络优先导航"）。`fetch` 监听只负责把判断结果落到 `respondWith`。这样判断表可以在 Node 中逐行测试。
- **浏览器自测**：沿用 workbox-engine 的做法。globalSetup 用 vite 8.3.0 打包两个入口脚本，打包后先注入清单、再注入配置，输出到 git 忽略的目录；fixture 站点分 v1 与 v2 两个版本，再加一个恢复版本。
- **恢复演练**：由浏览器自测自动执行步骤 1 到 4，并把实测的缓存名集合写入验证记录。

## 任务定义

### 任务 1：包骨架、依赖边界与跳过等待消息

**说明：** 建立包结构与入口，实现没有依赖的 `./messages`，并用测试守护各入口的依赖边界。

**验收标准：**

- `package.json` 声明六个导出：`.`、`./worker`、`./recovery-worker`、`./messages`、`./platform-worker-entry`、`./recovery-worker-entry`。包为私有，`files` 只含 `dist`。运行时依赖只有 contracts 与 engine-workbox（`workspace:*`）。
- 构建期、运行期（WebWorker lib）的 tsconfig 与构建脚本可用，build、typecheck、test 通过。
- `SKIP_WAITING_MESSAGE` 为冻结对象 `{ type: "pwa:skip-waiting" }`。`isSkipWaitingMessage` 只接受恰好这一形态，拒绝多余字段、其他值、数组、`null` 与原型不是普通对象的值。
- 依赖边界测试按 TypeScript 语法树读取导入，自检使用真实的判断条件，并覆盖单引号、无分号、缩进与再导出写法：
  - `.` 只导入 contracts；
  - `./worker` 只导入 engine-workbox 的 `./worker`；
  - `./recovery-worker` 与 `./messages` 没有包导入。

**验证：**

- `pnpm --filter @pwa-platform/sw-runtime test` 与 `typecheck` 通过，`pnpm install` 不新增 lockfile 包条目。
- 变异检查：让 `isSkipWaitingMessage` 接受多余字段，让恢复 worker 入口导入 Workbox。

**依赖：** 无。

**预计范围：** M（包配置、tsconfig、消息模块、边界测试）。

### 任务 2：构建期 worker 配置与注入

**说明：** 实现两种配置的生成、共享校验与注入。

**验收标准：**

- `createPlatformWorkerConfig` 与 `createRecoveryWorkerConfig` 先用 `validatePlan` 校验计划，字段与来源和规格一致。计划无效时抛错，信息只含诊断码与路径。
- 共享校验拒绝以下情况，错误信息只写字段名与索引：
  - `kind` 或 `version` 不对；
  - 缓存名不是 `pwa:…:precache`；
  - 拒绝基线不完整或顺序不对；
  - 路径规则形态不对；
  - 降级页形态不对；
  - `updateMode` 不是 `"prompt"`；
  - 恢复配置的前缀不是 `pwa:…:`。
- `injectWorkerConfig` 要求 `self.__PWA_WORKER_CONFIG` 恰好出现一次（注释也计入），注入 `JSON.stringify(config)`，结果确定，替换模式字符不被展开；配置不合法时抛错。

**验证：**

- 单元测试覆盖 storefront 与 root-minimal 两个 golden 计划、注入点 0/1/2 次、U+2028 等特殊字符、不回显输入。
- 变异检查：跳过计划校验；注入点只要求至少一次；共享校验不检查 `updateMode`。

**依赖：** 任务 1。

**预计范围：** M（配置、校验、注入与测试）。

### 任务 3：路径匹配与一致性测试

**说明：** 实现运行期的路径解码与第一条匹配规则，并证明与 policy-compiler 一致。

**验收标准：**

- 路径匹配符合规格：
  - 忽略查询串与片段，逐段解码；
  - `%2F` 不解码，非法转义保留原样，非 UTF-8 字节替换为 U+FFFD；
  - 前缀按完整路径段比较，按规则顺序取第一条匹配。
- 一致性测试用 `compilePlan` 编译多组计划，覆盖以下前缀与构建文件：`/%61ssets`、`%2F`、`%zz`、`%C3%A9` 与 `é`、非 UTF-8 字节、同名前缀的兄弟段（`/api` 与 `/apis`）。对每个构建文件，运行期匹配选中的规则与 core 的结果一致：该文件进入预缓存，当且仅当它首先匹配的是 `asset` 分类、策略不是 `none` 的允许规则。
- `@pwa-platform/core` 只作为开发依赖，不出现在任何运行期入口的导入中。

**验证：**

- 单元测试与一致性测试通过。
- 变异检查：`%2F` 被解码；前缀按字符串前缀而非整段比较；取最后一条匹配。

**依赖：** 任务 1。

**预计范围：** S（匹配模块与测试）。

### 任务 4：平台 worker 的安装、激活、请求判断表与更新消息

**说明：** 实现 `registerPlatformWorker` 与平台 worker 入口脚本，并在单元层覆盖全部行为。

**验收标准：**

- **启动**：启动时用共享校验检查配置，不合法即抛错；用配置中的缓存名与注入的清单创建引擎；只注册 `install`、`activate`、`fetch`、`message` 四个监听，不调用 `skipWaiting` 与 `clients.claim`。
- **请求判断表**：纯函数实现，逐行覆盖规格：
  - 非 `GET`、跨源、未分类、拒绝规则的请求不接手；
  - 非导航请求只在 `engine.match` 命中时返回缓存；
  - 导航网络优先，网络返回任何响应都原样返回；
  - 网络失败时依次尝试精确命中、目录 URL 加 `index.html`、降级页，最后返回 `Response.error()`。
- **更新消息**：只有来自同源窗口客户端的确认消息才在 `waitUntil` 中调用 `skipWaiting`。
- **入口脚本**：`platform-worker-entry` 读取 `self.__PWA_WORKER_CONFIG` 与 `self.__WB_MANIFEST` 并调用注册函数，两个注入点各出现一次。

**验证：**

- 单元测试用伪造的 `ServiceWorkerGlobalScope` 与事件覆盖以上行为，并断言 `waitUntil` 与 `respondWith` 在事件派发期间同步调用。
- 变异检查：
  - 拒绝规则的请求也查预缓存；
  - 导航在网络返回 404 时改用降级页；
  - 目录映射对不以 `/` 结尾的路径也生效；
  - 不检查消息来源；
  - activate 后调用 `clients.claim`。

**依赖：** 任务 2、任务 3。

**预计范围：** M（注册函数、判断表、入口脚本与测试）。

### 任务 5：恢复 worker

**说明：** 实现 `registerRecoveryWorker` 与恢复 worker 入口脚本。

**验收标准：**

- 启动时校验恢复配置，不合法即抛错。
- `install` 在 `waitUntil` 中调用 `skipWaiting`。`activate` 在 `waitUntil` 中先删除名称以 `appCachePrefix` 开头的全部缓存，再调用 `clients.claim`。
- 只注册 `install` 与 `activate`：单元测试断言没有 `fetch` 与 `message` 监听。
- `appId` 以当前 `appId` 开头的其他应用、其他环境与非平台缓存都不被删除。
- 入口脚本读取 `self.__PWA_WORKER_CONFIG` 并调用注册函数，不包含 `self.__WB_MANIFEST`。

**验证：**

- 单元测试通过。
- 变异检查：注册 `fetch` 监听；按 `pwa:<appId>` 而非完整前缀删除；先 `claim` 再删除且不等待删除完成。

**依赖：** 任务 2。

**预计范围：** S（注册函数、入口脚本与测试）。

### 检查点：核心 API

- 全部核心判断在单元层有成立与不成立两类测试，变异检查已完成。
- 向项目所有者汇报配置格式、判断表与入口形态后，再进入浏览器自测。

### 任务 6：浏览器自测基础、首次在线访问与预缓存资源

**说明：** 建立打包入口脚本、注入配置的浏览器自测流程，验证首次在线访问与预缓存资源的返回。

**验收标准：**

- globalSetup 用 vite 8.3.0 打包两个入口脚本，打包后先用 `injectPrecacheManifest` 注入清单，再用 `injectWorkerConfig` 注入配置，生成 fixture 站点的 v1、v2 与恢复版本，输出目录被 git 忽略。产物中如果还有模块语法、`require` 或 `process.env`，直接报错。
- fixture 站点的计划包含：应用壳 `index.html`（归为 `asset`）、带指纹资源、带 revision 的资源、离线降级页、拒绝规则覆盖的私有数据路径，以及没有匹配任何规则的路径。
- 首次在线访问：worker 以 `serviceWorkerUrl` 注册，scope 等于身份 `scope`；安装后预缓存恰好是清单条目，平台缓存命名空间中没有其他条目。
- 在线请求预缓存资源时，由 worker 从缓存返回（`fromServiceWorker` 为真），fixture 服务器没有收到请求。

**验证：**

- `pnpm test:browser --filter @pwa-platform/sw-runtime` 在本地 Chrome 通过，并重复运行确认稳定。
- 变异检查：注入配置时换用另一个应用的缓存名；非导航请求不查预缓存。

**依赖：** 任务 4、任务 5。

**预计范围：** M（Playwright 配置、globalSetup、fixture 站点、浏览器自测）。

### 任务 7：离线启动、导航降级与拒绝请求的浏览器自测

**说明：** 在 Chrome 中验证后续离线启动、未缓存导航的降级，以及拒绝与未分类请求。

**验收标准：**

- 断网后重新打开应用壳 URL（目录形式）时页面正常渲染。
- 断网导航到未缓存路由时：启用降级得到降级页；使用未启用降级的计划变体时得到网络错误。
- 断网时，导航到拒绝规则或未分类路由得到网络错误，不返回任何缓存内容。
- 在线请求拒绝与未分类路径时，请求不经 worker 处理（`fromServiceWorker` 为假），平台缓存中没有对应条目；断网时得到网络错误。

**验证：**

- 浏览器自测通过并重复运行确认稳定。
- 变异检查：离线导航对任意路由返回应用壳；拒绝规则的导航也使用降级页。

**依赖：** 任务 6。

**预计范围：** M（fixture 计划变体与浏览器自测）。

### 任务 8：发现更新与恢复演练的浏览器自测

**说明：** 在 Chrome 中验证提示更新的完整流程，并自动执行恢复演练。

**验收标准：**

- **发现更新**：
  - 部署 v2 后新 worker 保持等待，已打开页面没有被重新加载；
  - 页面发送确认消息后，新 worker 接管页面（`waitForControllerChange`）；
  - 激活后，旧 revision 的预缓存条目被清理，其他缓存的名称、条目数与内容不变。
- **恢复演练**：按恢复演练的步骤 1 到 4 执行：
  - 对照缓存用 contracts 计算：同应用旧 revision、同应用其他环境、`appId` 前缀重叠的其他应用、非平台缓存；
  - 恢复 worker 立即接管页面，没有用户操作；
  - 在线请求不经 worker 处理，断网请求预缓存资源得到网络错误；
  - 删除集合与保留集合完全一致；
  - 部署修复后的 worker 后，按正常更新流程激活、重新预缓存，并通过离线启动检查。
- 测试把实测的缓存名集合输出到日志，供验证记录使用。

**验证：**

- 浏览器自测通过并重复运行确认稳定。
- 变异检查：平台 worker 安装后自行跳过等待；恢复 worker 不调用 `claim`；恢复 worker 删除非平台缓存。

**依赖：** 任务 6。

**预计范围：** M（v2、恢复版本与修复版本的 fixture，浏览器自测）。

### 任务 9：ADR-0012 与文档同步

**说明：** 记录本模块的架构决定，并同步相关文档。

**验收标准：**

- 新增 `docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md`，记录以下决定：
  - 运行时配置在构建期注入（打包后注入，与清单一致）；
  - 恢复 worker 是独立入口与产物；
  - 跳过等待的确认消息；
  - 目录导航对应 `index.html`；
  - 拒绝与未分类请求不接手；
  - 安装期的响应拒绝项作为已知限制。
- `docs/architecture/package-boundaries.md` 写明 sw-runtime 各入口的依赖边界，以及入口脚本由 vite-adapter 打包。
- `README.md` 与 `docs/DOCUMENTATION-BASELINE.md` 同步。

**验证：**

- 相对链接能解析；文档中的模块名都来自能力图。
- ADR-0012 与 ADR-0005、ADR-0007、ADR-0011 及规格一致。

**依赖：** 任务 8。

**预计范围：** S（ADR-0012、包边界、README、文档基线）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0012 的写法之后，再进入模块质量门禁。

### 任务 10：sw-runtime 模块质量门禁

**说明：** 完成模块级验证、独立评审、恢复演练记录与 CI 实跑证据。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅，重点包括：请求判断表是否可能缓存或返回私有响应、路径匹配与 core 是否一致、恢复 worker 的删除范围与 fetch 监听、更新消息的来源检查、文档一致性。阻断项与应修项已处理。
- 恢复演练记录按模板写入验证记录，并注明 Chrome Android 与桌面端 N-1 尚未执行的原因。
- 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让本模块浏览器自测失败的提交使 browser job 报红，撤销后恢复为绿，证据在合并前取得。
- 结果写入 `tasks/sw-runtime/verification.md`。

**验证：**

- 干净 worktree 的命令输出；
- spec-guard 产物校验；
- CI 运行链接、结论、Node 与 Chrome 版本。

**依赖：** 任务 9。

**预计范围：** M（验证记录、恢复演练记录与评审修复）。

## Task List

> Tasks tracked in GitHub Issues #3

### Phase 1：核心 API

- #57 包骨架、依赖边界与跳过等待消息
- #58 构建期 worker 配置与注入（blocked by #57）
- #59 路径匹配与一致性测试（blocked by #57）
- #60 平台 worker 的安装、激活、请求判断表与更新消息（blocked by #58、#59）
- #61 恢复 worker（blocked by #58）

### Phase 2：浏览器验证

- #62 浏览器自测基础、首次在线访问与预缓存资源（blocked by #60、#61）
- #63 离线启动、导航降级与拒绝请求的浏览器自测（blocked by #62）
- #64 发现更新与恢复演练的浏览器自测（blocked by #62）

### Phase 3：交付

- #65 ADR-0012 与文档同步（blocked by #64）
- #66 sw-runtime 模块质量门禁（blocked by #65）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 运行期路径匹配与 core 的实现不一致 | 高：可能缓存或返回私有响应 | 任务 3 以 `compilePlan` 做一致性测试；独立评审重点检查 |
| 网络失败的判定：`fetch` 抛错与离线状态在不同浏览器中表现不同 | 中 | 只把 `fetch` 抛错当作网络失败，不读 `navigator.onLine`；浏览器自测覆盖 404 与断网两种情况 |
| 测试中的 `context.setOffline` 是否作用于 worker 发起的请求 | 中：离线断言可能不成立 | 同时以 fixture 服务器的请求记录为依据；如果离线模拟对 worker 无效，停下来与项目所有者确认替代方案 |
| 更新消息来源检查在测试中难以构造跨源来源 | 低 | 单元测试覆盖来源判断，浏览器自测覆盖同源成功路径 |
| 恢复 worker 立即接管的时序（`skipWaiting` 与 `claim`）导致测试不稳定 | 中 | 用 `waitForControllerChange` 等待接管；重复运行确认稳定 |
| 两个注入点的顺序与相互包含 | 低 | 配置注入点不包含清单注入点的字面；globalSetup 在注入后检查两处都已替换 |
| 桌面端 N-1 与 Chrome Android 暂时无法执行 | 中：浏览器矩阵的必测项不完整 | 验证记录写明未执行的原因；获取 N-1 需要下载时先询问 |

## 执行顺序

任务 1 → 任务 2、任务 3（可并行）→ 任务 4、任务 5 → 检查点"核心 API" → 任务 6 → 任务 7、任务 8 → 任务 9 → 检查点"交付前" → 任务 10。每个任务一个提交，提交信息带 `Closes #<task>`。

## 修订：Range 请求不由预缓存应答

规格见 [spec/sw-runtime.md](../../spec/sw-runtime.md) 的同名修订，决定见 [ADR-0023](../../docs/adr/0023-range-requests-bypass-precache.md)。分支 `fix/sw-runtime-range-passthrough`，基于 `main` 的 `5fe9b0a`。每个任务一个提交，提交信息带 `Task: R<n>`，不写 closing keyword。

#### R1：规格修订、ADR-0023（提议）与本计划

**验收：** 规格修订、ADR-0023（状态为"提议"）与本节一次提交。
**验证：** 文档内的链接都能指向实际存在的文件。

#### R2：判断表的 `range` 分支（TDD）

**范围：** `src/worker/decide.ts` 中的 `PwaRequestInput.range` 与 `"range"` 原因；`src/worker/handlers.ts` 的 fetch 监听填入 `range`；单元测试；把 `test/sw-range-and-deploy-transition` 分支上的 Range 浏览器复现测试带过来（只带 Range 部分，包括 fixture 服务器的 Range 支持），并补上"不带 Range 仍由预缓存应答"的断言。
**验收：** 先提交会失败的测试，确认为红；实现后转绿。规格"测试策略增量"列出的情况全部覆盖。
**验证：** `pnpm --filter @pwa-platform/sw-runtime test` 与 `test:browser` 通过，Range 用例连续运行两次结果一致；`browser-test-harness`、`engine-workbox`、`client-runtime` 的浏览器自测通过（它们共用 fixture 服务器）。
**依赖：** R1。

#### R3：接受 ADR-0023 与文档同步

**范围：** 项目所有者接受后，把 ADR-0023 的状态改为"已接受"并单独提交；在规格判断表第 5 行加上修订说明；在 `tasks/sw-runtime/verification.md` 的已知限制中加入"离线时预缓存媒体无法播放或拖动"。
**依赖：** R2。

#### R4：修订质量门禁

**范围：** 在干净的 worktree 中运行全仓库的 `test`、`build` 与 sw-runtime 的 `test:browser`；完成规格要求的变异检查；做独立评审；结果写入 `verification.md` 的"修订门禁：Range 请求"一节。
**依赖：** R3；如果 push-module 已先合入 `main`，本分支需先变基到它之后。

### Task List（修订）

- R1 规格修订、ADR-0023（提议）与本计划
- R2 判断表的 `range` 分支（blocked by R1）
- R3 接受 ADR-0023 与文档同步（blocked by R2）
- R4 修订质量门禁（blocked by R3）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 与 push-module 同改 `src/worker/handlers.ts` | 低：两边改的是不同位置 | 合入 `main` 前先确认对方的进度；后合入的一方负责变基 |
| fixture 服务器的 Range 支持影响其他包的浏览器自测 | 中 | R2 跑所有共用 fixture 服务器的包 |
| 媒体元素的第一个请求就带 `Range`，离线播放整体失效 | 中：可能有业务误以为预缓存能支持离线播放 | 写入已知限制与 ADR-0023 的影响 |

### 执行顺序（修订）

R1 → R2 → R3 → R4。按全局约定，R2 的实现派给 `executor` 子代理，主会话在任务边界验收。

## 修订：导航兜底忽略查询串

规格见[模块规格](../../spec/sw-runtime.md)的同名修订，决定见 [ADR-0034](../../docs/adr/0034-navigation-fallback-ignores-the-query-string.md)。分支 `claude/navigation-fallback-query`，基于 `main` 的 `214df9f`。每个任务一个提交，提交信息带 `Task: NF<n>`。

### 架构决定

- **改动集中在 `decide.ts` 的 `navigationFallbacks`。** `handlers.ts` 的 `navigate` 只按给定顺序尝试候选，不需要改；这样"决定候选"与"执行兜底"仍然分离。
- **旧行为由测试连注释一起钉住，必须显式改写，不能悄悄删。** 那条注释记录的是当时的判断（"带装饰参数的 URL 只会走到降级页"），改写时要写明它已被 ADR-0034 反转，以及为什么。
- **演练缺口与代码一起补。** 这个缺陷能溜过演练，是因为驱动脚本只验证了应用壳能从缓存启动，没在断网状态下真正打开恢复页。修代码而不补演练，下次同类问题照样漏。
- **验证要落到真实浏览器**：单元测试只能证明候选顺序，证明"用户真的看到恢复页"需要断网后的真实导航。
- **执行分工。** NF2 派给 `executor` 子代理；NF3（演练与驱动脚本）留在主会话，因为它要跑真实浏览器并判断截图。

#### NF1：规格修订、ADR 与本计划

**验收：** ADR-0034 与规格修订节（`f6946d1`）已提交；本节随后提交；项目所有者确认后开始 NF2。

#### NF2：候选顺序与测试（TDD，完成：550e3f0；主会话验收：`handlers.ts` 零改动，`decide.ts` 只改候选构造；单元 214 项连续两次通过，浏览器 26 项通过（Chrome 153.0.8010.53），typecheck 与 lint 干净）

**变异检查发现覆盖只到一半。** 去掉新增的“同 `pathname` 候选”后，单元测试转红但**浏览器回归仍然通过**：它走的是 `/app/?return=…`，靠的是“`index.html` 候选丢弃查询串”这一半。第二次变异（把 `index.html` 候选改回保留查询串）确认该回归并非空转——它立即转红。因此两半各有归属：`index.html` 候选由浏览器回归守住，**同 `pathname` 候选目前只有单元覆盖**。

**为什么不在本包补齐：** 要在真实浏览器里单独证明同 `pathname` 候选，需要一个“按自身路径预缓存、且既不是应用壳也不是降级页”的页面。主会话试过往夹具加这样一页，结果逼停两条与本次无关的既有断言（`precache.spec.ts` 的“预缓存与计划完全一致”和 `lifecycle.spec.ts` 的条目计数）——为一条覆盖去改夹具组成的断言不划算。该覆盖改由 **NF3** 在 `pwa-entry-resilience` 的浏览器测试中补：恢复页本来就是这种形态，测试读起来也更贴合真实场景。

**范围：** `packages/sw-runtime/src/worker/decide.ts` 的 `navigationFallbacks`；`packages/sw-runtime/test/worker/decide.test.ts`；必要时 sw-runtime 的真实浏览器测试。

**验收：**
- 候选顺序为：带查询串精确匹配 → 同 `pathname` 丢弃查询串 → 该 `pathname` 的 `index.html` 形式（丢弃查询串）→ 降级页；去重后按序尝试。
- 查询串精确命中清单时仍优先返回该条目（不因新增候选而被跳过）。
- 跨路由不匹配：`/app/guides` 不会拿到 `/app/guide` 的缓存。
- 同路径不在清单时，仍落到降级页。
- 旧用例连注释一起改写，注明被 ADR-0034 反转。
- 真实浏览器：断网后导航到带查询串的预缓存页面，得到该页面本身而非降级页。
- 在线行为与非导航请求判定不变，既有断言不改。

**验证：** 包内 `test` 连续两次、`test:browser`、`typecheck`、`pnpm lint`、`git diff --check`。

**范围估计：** 小，1 个源文件与 1–2 个测试文件。依赖：NF1。

#### NF3：演练缺口、同路径候选的浏览器覆盖与复验（完成：`entry-resilience` 新增断网回归，修订前失败、修订后通过；演练文档第 4 步拆出独立一条并注明不可省略；驱动脚本补该检查；以线上 drill 站（仍是修订前的 worker）实跑，该检查失败并记录为端到端差分证据）

**范围增补（NF2 验收后）：** 在 `packages/entry-resilience` 的浏览器测试中新增一条——断网后导航到带 `?return=…` 的恢复页，必须显示入口按钮而非降级页。该处夹具已预缓存 `/app/pwa-entry.html`，正是“同 `pathname` 候选”的形态；以 NF2 之前的 `decide.ts` 跑该用例必须失败，修订后必须通过（差分即证据）。

**范围：** [入口恢复演练](../../docs/operations/entry-recovery-drill.md)第 4 步增加"在当前 Origin 不可达时打开恢复页，确认看到入口按钮而非降级页"；`pwa-release-records/tools/entry-recovery-drill-driver.mjs` 同步补该检查；在本机以修订后的构建复验；[pwa-entry-resilience 验证记录](../pwa-entry-resilience/verification.md)追加本次缺陷的发现与修复经过。

**验收：**
- 驱动脚本在断网状态下打开恢复页并断言存在入口按钮；用修订前的构建跑该检查必须失败，修订后必须通过（差分即证据）。
- 演练文档的检查结果表新增对应行。
- 记录写明：该缺陷由 2026-09-23 的浏览器演示发现，演练此前未覆盖此步。

**范围估计：** 小，文档 2 个、脚本 1 个（仓库外）。依赖：NF2。

#### NF4：质量门禁（完成：全仓 lint、typecheck、build 退出 0，`pnpm -r --no-bail test` 16 个包全部通过；Spec Guard 与 main 相同；记录见 verification.md）

**范围：** 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；结果写入 sw-runtime 验证记录。

**验收：** 全部通过；Spec Guard 与 main 相同。

**范围估计：** 小。依赖：NF3。

### Task List（修订）

- NF1 规格修订、ADR 与本计划
- NF2 候选顺序与测试（blocked by NF1 与确认）
- NF3 演练缺口与线上复验（blocked by NF2）
- NF4 质量门禁（blocked by NF3）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新候选导致跨路由命中 | 高：用户拿到别的页面 | 候选只在同 `pathname` 上构造；跨路由用例保留并加强 |
| 查询串敏感页面离线时拿到同路径缓存 | 中，已接受 | ADR-0034 记录取舍：相比降级页信息更多，且仅在网络已失败后发生 |
| 只改代码不补演练 | 高：同类缺陷继续漏过 | NF3 与 NF2 同属本次修订，且要求以修订前构建复现失败 |
| 在线行为被意外改动 | 高 | 既有在线与非导航断言一律不改，验收逐项核对 |

### 执行顺序（修订）

NF1 → 确认 → NF2 → NF3 → NF4。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| developer-entry | `README.md` | 包清单与能力说明列出本包。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 登记本模块及其依赖。 |
| decisions | `docs/adr/0034-navigation-fallback-ignores-the-query-string.md` | 记录反转"查询串必须一致"的取舍。 |
| lifecycle-and-recovery | `docs/architecture/lifecycle.md` | 生命周期顺序由本模块的运行时行为决定。 |
| sw-runtime | `spec/sw-runtime.md` | 交付 worker 的请求判定与导航兜底契约。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| developer-entry | delivered | `README.md` | 本包在首批发布清单与能力说明中列出。 |
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块与依赖已登记。 |
| decisions | delivered | `docs/adr/0034-navigation-fallback-ignores-the-query-string.md` | ADR-0034 已接受（2026-09-23）。 |
| lifecycle-and-recovery | delivered | `docs/architecture/lifecycle.md` | 安装、激活、清理与恢复 worker 的顺序已记录。 |
| sw-runtime | delivered | `spec/sw-runtime.md` | 规格含本次导航兜底修订与既有请求判定表。 |
