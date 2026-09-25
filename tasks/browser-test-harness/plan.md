# 实现计划：browser-test-harness

## 概览

交付私有工作区包 `@pwa-platform/browser-test-harness`，供运行时模块在真实浏览器中验证行为：

- 只监听本机的 fixture 服务器与不依赖框架的最小页面；
- 只用于自测的 worker fixture；
- worker 注册与状态、请求是否经过 worker、缓存快照、响应头与生命周期事件的断言工具；
- 支持 Chrome 桌面端与实验性 Chrome Android 目标的 Playwright Test fixture；
- CI 中独立的 browser job，以及 ADR-0010 与文档同步。

本模块不实现平台 worker、客户端运行时、事件传输协议或安装断言。

> Tasks tracked in GitHub Issues #16

## 架构决定

- **包结构**：
  - `src/`：TypeScript 源码，用 `tsc` 构建到 `dist/`，与现有包一致；
  - `fixtures/`：最小页面与 worker fixture，均为不经构建的静态文件，随包分发（`files` 包含 `fixtures`），由导出的路径函数定位；
  - `test/`：Vitest 单元测试，不启动浏览器；
  - `browser-tests/`：Playwright 浏览器自测，Vitest 不收集这个目录。
- **依赖**：`@playwright/test` 精确固定为 `1.63.0`，同时声明为 `peerDependencies` 与 `devDependencies`；运行时依赖只有 `@pwa-platform/contracts`。安装后检查 lockfile diff，确认新增传递依赖都来自 registry、没有未批准的安装脚本。
- **浏览器**：Playwright 配置默认使用 `channel: "chrome"`。本地与 CI 都依赖已安装的 Google Chrome 稳定版，不执行 `playwright install`。
- **根脚本**：`scripts/run-workspace.mjs` 增加 `test:browser` 操作，行为与 `test` 一致。不带 filter 时只对声明了该脚本的包运行。
- **等待方式**：所有断言工具都基于显式条件等待（worker 状态、controller、事件），不使用固定时长的 sleep，以免在 CI 上不稳定。
- **Android 目标**：只实现连接与端口转发，并用单元测试覆盖参数；本模块不在设备上验证，这一限制写入 README 与验证记录。（#46 独立评审后按项目所有者决定移除 Android 目标，见 `tasks/browser-test-harness/verification.md`。）
- **CI 实跑证据**：需要推送分支才能取得。任务 6 只做本地验证，远端通过与报红的证据在任务 7 中、经项目所有者授权推送后取得。

## 任务定义

### 任务 1：包骨架、Playwright 依赖与根脚本 test:browser

**说明：** 建立 harness 包与 Playwright 配置，引入 `@playwright/test`，给根脚本加上 `test:browser` 操作，并用一个冒烟自测证明 Chrome 能在本地启动。

**验收标准：**

- `packages/browser-test-harness` 具备 `build`、`test`、`test:browser`、`typecheck` 脚本；`@playwright/test` 精确为 `1.63.0`，同时出现在 `peerDependencies` 与 `devDependencies`。
- Playwright 配置使用 `channel: "chrome"`，只收集 `browser-tests/`；Vitest 只收集 `test/`。
- 冒烟自测在 Chrome 中打开一个页面并通过；浏览器版本写入测试注解。
- `pnpm test:browser` 不带 filter 时先构建依赖，再对有该脚本的包运行；带 `--filter` 时只运行目标包，包名写错以非零码退出。
- 依赖边界测试断言包的依赖只有 contracts 与 `@playwright/test`。

**验证：**

- `CI=true pnpm install --frozen-lockfile` 在提交后的 lockfile 上通过；审阅 lockfile diff 并记录新增的传递依赖。
- 按带 filter、不带 filter、包名写错三种方式运行 `test:browser`。
- `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck` 通过。

**依赖：** 无。

**预计范围：** M（包的 `package.json`、tsconfig、Playwright 与 Vitest 配置、冒烟自测、`scripts/run-workspace.mjs`、根 `package.json`、lockfile）。

### 任务 2：fixture 服务器与最小页面

**说明：** 实现 `startFixtureServer` 与最小页面，并提供 `fixtureServer` Playwright fixture。

**验收标准：**

- 服务器只绑定 `127.0.0.1`，`origin` 为 `http://localhost:<端口>`。
- 支持版本化站点与 `deploy`，支持按路径前缀的响应头规则（后声明者覆盖）与运行中替换。
- 请求记录只包含方法、路径与时间。
- 解码后越界的路径（包括编码后的 `..` 与指向目录外的符号链接）返回 404；非 `GET`/`HEAD` 返回 405；按扩展名设置 `Content-Type`。
- 最小页面在 Chrome 中渲染出标记元素，页面本身不注册 worker。
- `fixtureServer` fixture 每个测试一个实例，测试结束后关闭。

**验证：**

- 单元测试覆盖越界、方法限制、响应头覆盖顺序、部署切换、请求记录与内容类型。
- 浏览器自测：通过 `fixtureServer` 打开最小页面，断言标记元素可见。
- 变异检查：去掉越界判断或响应头覆盖顺序后，对应测试失败。

**依赖：** 任务 1。

**预计范围：** M（服务器源码、页面 fixture、Playwright fixture、单元测试、浏览器自测）。

### 任务 3：worker 注册、状态与请求工具

**说明：** 实现 worker 相关的断言工具，以及透传、无 fetch、版本化三种 worker fixture。

**验收标准：**

- 提供 `registerWorker`、`waitForController`、`readRegistration`、`waitForWorkerState`、`requestFromPage`。
- worker fixture 只放在 `fixtures/`，不从包入口作为运行时代码导出。
- `requestFromPage` 返回状态码或网络错误，以及 `fromServiceWorker`。

**验证：**

- 浏览器自测：
  - 注册透传 worker 后页面被控制；
  - 部署 v2 后出现 waiting worker，页面仍由 v1 控制；
  - 透传 worker 下 `fromServiceWorker` 为真；无 fetch worker 下为假，且服务器记录到该请求；
  - 离线时请求得到网络错误。
- 每个工具至少覆盖一个成立与一个不成立的情况。
- 变异检查：让 `waitForWorkerState` 读错位置、让 `requestFromPage` 忽略 `fromServiceWorker` 后，对应自测失败。

**依赖：** 任务 2。

**预计范围：** M（断言工具源码、三种 worker fixture、浏览器自测）。

### 检查点：核心流程

- 在本地 Chrome 中，服务器、页面、worker 注册、部署切换与请求检测全部跑通。
- `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm test:browser` 通过。

### 任务 4：缓存与响应头断言

**说明：** 实现缓存快照、对照缓存创建、快照比对、前缀删除断言与 `Cache-Control` 断言，以及清理 worker fixture。

**验收标准：**

- 提供 `snapshotCaches`、`createCaches`、`diffCacheSnapshots`、`expectDeletedExactlyUnderPrefix`、`expectCacheControl`。
- 快照只包含缓存名与条目数，不读取响应体。
- `expectDeletedExactlyUnderPrefix` 在多删、少删或保留缓存的条目数变化时失败。
- `expectCacheControl` 按指令逐个判定，大小写不敏感，忽略指令值两侧空白。

**验证：**

- 单元测试覆盖快照比对与 `Cache-Control` 解析。
- 浏览器自测：用 contracts 的 `appCachePrefix`、`cacheName` 构造对照组（同应用旧 revision、同应用其他环境、以当前 `appId` 开头的其他应用、非平台缓存），清理 worker 激活后断言成立；再构造少删与多删的情况，断言失败。
- 浏览器自测：服务器响应头规则能被 `expectCacheControl` 检出与拒绝。
- 变异检查：把前缀比较改为包含判断、去掉条目数比较后，对应测试失败。

**依赖：** 任务 3。

**预计范围：** M（断言源码、清理 worker、单元测试、浏览器自测）。

### 任务 5：生命周期事件断言与运行目标

**说明：** 实现 `expectLifecycleSequence`，以及 `harnessTarget` 的 `chrome-desktop` 与 `chrome-android` 两种目标，并编写包 README。

**验收标准：**

- `expectLifecycleSequence` 用 contracts 的 `readLifecycleEvent` 校验每个事件值：无效事件导致失败，未知事件被忽略，已知事件类型顺序必须与期望一致。
- `chrome-desktop` 默认使用 `channel: "chrome"`，设置 `PWA_HARNESS_CHROME_PATH` 时改用该可执行文件。
- `chrome-android` 通过 Playwright 的实验性 Android 支持连接设备，支持 `PWA_HARNESS_ANDROID_SERIAL`，对服务器端口执行 `adb reverse`，测试结束后撤销转发。
- 包 README 写明用法，以及桌面端 N-1 与 Chrome Android 的运行步骤和已知限制。

**验证：**

- 单元测试覆盖事件顺序校验（有效、无效、未知事件）、可执行文件覆盖与 Android 参数（设备选择、`adb reverse` 与撤销）。
- 浏览器自测：用 `PWA_HARNESS_CHROME_PATH` 指向本机 Chrome 运行一次冒烟自测。
- 变异检查：让事件校验跳过无效事件后，对应测试失败。

**依赖：** 任务 4。

**预计范围：** M（事件断言、运行目标 fixture、单元测试、README）。

### 任务 6：CI browser job、ADR-0010 与文档同步

**说明：** 在 CI 中新增 browser job，记录 ADR-0010，并同步相关文档。

**验收标准：**

- `.github/workflows/ci.yml` 新增 `browser` job：`ubuntu-latest`、Node 24、权限与触发条件和并发设置沿用现有配置、action 固定到与现有 job 相同的 SHA；冻结安装后运行 `pnpm test:browser`；不执行 `playwright install`，不上传报告。
- 新增 `docs/adr/0010-real-browser-verification-with-playwright.md`：记录采用 Playwright Test、CI 使用预装 Chrome、Android 实验性支持的限制。
- `docs/architecture/package-boundaries.md` 登记 harness 为内部测试包，运行时包只能在 `devDependencies` 中引用。
- `docs/architecture/browser-matrix.md` 链接 harness 的运行步骤。
- `DOCUMENTATION-BASELINE.md` 与 `README.md` 同步。

**验证：**

- 本地按 browser job 的步骤执行一遍。
- 核对 job 中不读取 secret、没有写权限、没有新的 action。
- 相对链接能解析；文档中的模块名都来自能力图。

**依赖：** 任务 5。

**预计范围：** M（`ci.yml`、ADR-0010、包边界、浏览器矩阵、文档基线、README）。

### 检查点：交付前

- 全部断言工具都有成立与不成立两类自测，变异检查已完成。
- 与项目所有者确认 README 中的 Android 运行步骤与已知限制之后，再进入模块质量门禁。

### 任务 7：browser-test-harness 模块质量门禁

**说明：** 完成模块级验证、独立评审与 CI 实跑证据。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅：服务器安全（只绑定本机、越界拒绝）、断言是否可能误报通过、依赖与供应链、CI 权限。阻断项与应修项已处理。
- 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让一个浏览器自测失败的提交使 browser job 报红，撤销后恢复为绿。
- 结果写入 `tasks/browser-test-harness/verification.md`，包括 CI 中实测的 Chrome 版本。

**验证：**

- 干净 worktree 的命令输出；
- spec-guard 产物校验；
- CI 运行链接、结论、Node 与 Chrome 版本。

**依赖：** 任务 6。

**预计范围：** M（验证记录与评审修复）。

## Task List

### Phase 1：基础

- #40 包骨架、Playwright 依赖与根脚本 test:browser
- #41 fixture 服务器与最小页面（blocked by #40）
- #42 worker 注册、状态与请求工具（blocked by #41）

### Phase 2：断言能力

- #43 缓存与响应头断言（blocked by #42）
- #44 生命周期事件断言与运行目标（blocked by #43）

### Phase 3：交付

- #45 CI browser job、ADR-0010 与文档同步（blocked by #44）
- #46 browser-test-harness 模块质量门禁（blocked by #45）

## 风险与缓解

| 风险 | 影响 | 缓解方式 |
|---|---|---|
| CI runner 预装的 Chrome 与 Playwright 1.63.0 不兼容，或新 headless 模式行为不同 | 高 | 任务 1 先在本地用 `channel: "chrome"` 跑通；任务 7 以 CI 实跑为准，失败时再决定是否需要其他浏览器来源（先询问） |
| worker 生命周期存在时序差异，导致自测不稳定 | 中 | 只用显式条件等待；自测在本地连续运行多次确认稳定 |
| Playwright 作为 peer 依赖在 pnpm 工作区中解析出多份 | 中 | 精确固定版本；依赖边界测试与 lockfile 审阅确认只有一份 |
| Android 实验性支持在设备上不可用 | 中 | 本模块不承诺设备验证；限制写入 README、ADR 与验证记录，由第一个使用方确认 |
| 断言工具误报通过，使运行时模块的证据失真 | 高 | 每个工具都有成立与不成立两类自测，并做变异检查；独立评审重点审查 |
| fixture 服务器被当作通用服务器暴露 | 中 | 只绑定 `127.0.0.1`，只处理 `GET`/`HEAD`，越界路径拒绝，并有单元测试 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6 → 任务 7，每个任务单独提交。全部完成后开一条模块 PR，正文写 `Closes #16`。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| browser-test-harness | `packages/browser-test-harness/README.md` | 说明全仓浏览器测试逐包串行及原因。 |
| push-module | `spec/push-module.md`、`docs/adr/0021-push-handling-in-the-platform-worker.md`、`docs/guides/push-integration.md`、`tasks/push-module/verification.md` | 串行化的起因：点击场景在重负载下偶发失败。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| browser-test-harness | delivered | `packages/browser-test-harness/README.md` | 2026-09-24 在"串行运行"说明处补充全仓逐包串行一句（`--workspace-concurrency=1`）。 |
| push-module | delivered | `tasks/push-module/verification.md` | 2026-09-24 追加"点击场景偶发失败的根因调查"一节（`54c8fd5`）。 |
