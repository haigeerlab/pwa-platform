# 规格：browser-test-harness

## 目标

为运行时模块提供可复用的真实浏览器验证能力，包括：不依赖 UI 框架的 fixture 服务器与最小页面、只用于自测的 worker fixture，以及基于 Playwright Test 的断言工具。sw-runtime、client-runtime 等模块交付时，直接用它产出 [V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)中的"真实浏览器 E2E"证据，并执行[恢复演练](../docs/operations/recovery-drill.md)中的检查，不需要各自重新搭建。

成功标准：

- 运行时模块只需编写测试用例与自己的 worker，服务器、部署切换、worker 状态与接管、缓存快照、离线与响应头检查都可以直接调用 harness。
- harness 的自测在 CI 的 Google Chrome 稳定版上通过；有意破坏任一断言工具时，对应自测失败。
- 同一套测试可以在本地切换到 Chrome 桌面端 N-1 上运行，运行步骤写入文档。

## 范围

**交付物：**

- 私有工作区包 `packages/browser-test-harness`，包名 `@pwa-platform/browser-test-harness`，只依赖 `@pwa-platform/contracts`、`@playwright/test` 与 Node 内置模块。
- fixture 服务器、最小页面、worker fixture、断言工具与 Playwright Test fixture（详见下文）。
- harness 自测：Vitest 单元测试（不启动浏览器）与 Playwright 浏览器自测。
- 根脚本新增 `test:browser` 操作；CI 新增独立的 browser job。
- `docs/adr/0010-real-browser-verification-with-playwright.md`：记录采用 Playwright Test 作为真实浏览器验证工具。
- `packages/browser-test-harness/README.md`：用法，以及桌面端 N-1 的本地运行步骤。
- 同步 `docs/architecture/package-boundaries.md`、`docs/architecture/browser-matrix.md`、`DOCUMENTATION-BASELINE.md`、`README.md`。

**不做的事：**

- 平台 worker、恢复 worker、注册与更新提示的任何实现（归 sw-runtime、client-runtime）。
- 生命周期事件在页面与 worker 之间的传输协议（归 client-runtime）。harness 只校验测试收集到的事件值。
- 安装相关断言（`beforeinstallprompt`、`display-mode`），归 examples-browser-e2e。
- Chrome Android 的运行目标：由第一个具备测试设备的运行时模块在其规格中决定（见"已决定事项"）。
- 设备云、Chrome for Testing 下载、测试报告上传等新工具或新的下载源。
- Safari、Firefox、Edge 的运行配置（浏览器矩阵中不阻塞的档位，由使用方按需补充）。

## 依赖

- `@playwright/test` 固定为 `1.63.0`（精确版本，不带范围）。已核实：发布已满 1 天；包及其依赖 `playwright`、`playwright-core` 没有安装脚本，带 provenance 与 trusted publisher，满足[依赖变更流程](../docs/operations/dependency-changes.md)。
- harness 包把 `@playwright/test` 同时声明为 `peerDependencies` 与 `devDependencies`，版本相同。使用 harness 的模块在自己的 `devDependencies` 中声明同一版本，保证全仓库只有一份 Playwright。
- `@types/node` 精确固定为 `24.13.4`，只作为 harness 包的 `devDependencies`，为 fixture 服务器提供 Node 类型（项目所有者于 #41 中确认）。
  - 没有使用 22.x：`@types/node` 22.x 依赖的 `undici-types@6.21.0` 没有 provenance，而更早发布的版本带 provenance，安装被 `trustPolicy: no-downgrade` 拒绝；24.x 依赖的 `undici-types` 7.18.x 都带 provenance，不需要豁免。
  - 24.x 的类型可能包含 Node 22 没有的 API。服务器的单元测试在 CI 的 Node 22 上运行，用到不存在的 API 会失败。
- 运行时包只能在 `devDependencies` 中引用 harness，不得在生产代码中导入。

## 公开契约

所有导出都来自包入口 `@pwa-platform/browser-test-harness`，构建产物位于 `dist`，与其他工作区包一致。包入口加载时会读取环境变量并注册 fixture，因此 `package.json` 不声明 `sideEffects: false`。

| 类别 | 导出 |
|---|---|
| Playwright | `test`、`expect`，类型 `HarnessTestArgs`、`HarnessWorkerArgs` |
| 服务器与页面 | `startFixtureServer`、`fixturePath`、`MINIMAL_PAGE_MARKER`，类型 `FixtureServer`、`FixtureServerOptions`、`HeaderRule`、`RequestRecord` |
| worker | `registerWorker`、`waitForController`、`waitForControllerChange`、`readRegistration`、`waitForWorkerState`、`requestFromPage` |
| 缓存与响应头 | `snapshotCaches`、`createCaches`、`diffCacheSnapshots`、`expectDeletedExactlyUnderPrefix`、`expectCacheControl` |
| 生命周期事件 | `expectLifecycleSequence` |
| 常量 | `BROWSER_VERSION_ANNOTATION`、`CHROME_PATH_ENV` |

### fixture 服务器

`startFixtureServer(options)` 启动一个基于 `node:http` 的静态服务器：

- **监听**：只绑定 `127.0.0.1`，端口由系统分配；`origin` 为 `http://localhost:<端口>`。浏览器把 localhost 视为安全上下文，Service Worker 可以注册。
- **Host 校验**：只接受 `localhost:<端口>` 与 `127.0.0.1:<端口>`，其他 Host 返回 403，防止 DNS 重绑定后被外部网页读取。
- **版本化站点**：`options.versions` 是"版本名 → 目录"的映射。`deploy(版本名)` 原子地切换当前提供的目录，用来模拟一次部署，例如把 v1 的 worker 换成 v2。
- **响应头规则**：按解码后的请求路径前缀设置响应头，后声明的规则覆盖先声明的同名响应头；值为数组时每个值发送一行同名响应头；可在运行中通过 `setHeaderRules` 替换。
- **请求记录**：记录每个到达服务器的请求的方法、原始请求路径（去掉查询串）与时间，不记录请求体或响应体。用于判断"请求直接到达了服务器"。
- **只按原始写法提供文件**：请求路径解码后含 `.` 或 `..` 段、空段、反斜杠或 NUL 时返回 404；文件的真实路径必须与请求写法逐字一致，因此符号链接、大小写变体等别名一律返回 404，响应头规则不会被绕过或套到别的文件上。目录不带结尾斜杠时返回 301 重定向；只处理 `GET` 与 `HEAD`，其他方法返回 405。
- **内容类型**：按扩展名设置 `Content-Type`，至少覆盖 `.html`、`.js`、`.mjs`、`.css`、`.json`、`.webmanifest`、`.png`、`.svg`、`.txt`。
- `close()` 关闭服务器并释放端口。

### 最小页面

包内提供一个不依赖任何框架的 HTML 页面模板，只包含一个可见的标记元素，便于断言"页面已渲染、没有白屏"。页面声明内联空图标，浏览器不会请求 `/favicon.ico`，请求记录保持确定。页面不自动注册 worker，由测试通过断言工具显式注册，避免 harness 替运行时模块决定注册行为。

### worker fixture

包内的 worker fixture **只用于 harness 自测**，不代表平台行为，不作为运行时代码导出：

| fixture | 行为 | 用来自测 |
|---|---|---|
| 透传 worker | fetch 时 `respondWith(fetch(request))`，激活时接管客户端 | 请求经过 worker 的检测 |
| 无 fetch worker | 不注册 fetch 监听，激活时接管客户端 | 请求未经过 worker 的检测 |
| 版本化 worker | 同一 URL 的 v1 与 v2，均不调用 `skipWaiting` | 部署切换、等待状态，以及"只等待时接管检测必须失败" |
| 接管 worker | 同一 URL 的 v1 与 v2，v2 调用 `skipWaiting` 并接管客户端 | 接管检测成功 |
| 清理 worker | 激活时删除名称以指定前缀开头的缓存 | 缓存快照比对 |

### 断言与辅助工具

| 工具 | 作用 |
|---|---|
| `registerWorker(page, { scriptUrl, scope })` | 在页面中注册 worker，等待注册完成 |
| `waitForController(page, scriptUrl)` | 等待页面由指定脚本 URL 的 worker 控制；只比较 URL，区分不了同一 URL 的新旧版本 |
| `waitForControllerChange(page, trigger)` | 执行 `trigger`（例如部署并触发更新）后等待 `controllerchange`，并确认新的 controller 就是 registration 的 active worker；新版本只等待时失败。`trigger` 不得导航页面 |
| `readRegistration(page, scope)` | 读取 scope 完全相同的注册的 installing、waiting、active 三个位置的脚本 URL |
| `waitForWorkerState(page, scope, state)` | 等待指定位置出现 worker；轮询实现，可能错过极短的 installing 状态，同样只比较 URL |
| `requestFromPage(page, url)` | 从页面发起同源请求，绕过 HTTP 缓存，返回状态码或网络错误，以及 Playwright 报告的 `fromServiceWorker`；忽略 URL 片段，用唯一的 `x-pwa-harness-request` 请求头匹配响应 |
| `snapshotCaches(page)` | 记录当前 origin 的缓存名与每个缓存的条目数，不读取响应体；缓存名在记录过程中变化时重试，仍变化则失败 |
| `createCaches(page, specs)` | 按给定名称创建缓存并各写入至少一个条目，用于恢复演练的对照缓存 |
| `diffCacheSnapshots(before, after)` | 返回被删除、新增、条目数变化的缓存 |
| `expectDeletedExactlyUnderPrefix(before, after, prefix)` | 断言被删除的缓存正好是名称以 `prefix` 开头的全部缓存，其余缓存名称与条目数不变，且没有新增缓存（对应恢复演练第 3 步） |
| `expectCacheControl(response, { include, exclude })` | 按指令逐个判定 `Cache-Control`：逗号与换行（Playwright 合并同名多行时使用换行）都分隔指令；只写指令名时只匹配不带值的指令，`name=*` 匹配任意值，`name=value` 要求该值；同名指令重复出现即失败；等号两侧带空白等格式错误的指令被忽略 |
| `expectLifecycleSequence(values, types)` | 用 contracts 的 `readLifecycleEvent` 校验测试收集到的事件值，并断言已知事件的类型顺序；无效事件导致失败，未知事件被忽略 |

- 离线切换直接使用 Playwright 的 `context.setOffline`，harness 不再包装。
- 断言以特性检测为准，不读取 User-Agent（[兼容性策略](../docs/architecture/compatibility.md)）。

### Playwright Test fixture

`test` 由 Playwright 的 `test.extend` 得到，沿用 Playwright 内置的 `browser`、`context`、`page` fixture，额外提供：

- `fixtureSite` 选项与 `fixtureServer`：每个测试一个独立服务器，测试结束自动关闭。
- **浏览器版本记录**：每个测试把 `browser.version()` 写入 `browser-version` 注解；每个 Playwright worker 启动浏览器后在标准输出打印一行实际运行的浏览器与版本，CI 日志中可见。
- **桌面端 N-1**：设置环境变量 `PWA_HARNESS_CHROME_PATH` 时，以该可执行文件代替配置中的 Chrome 渠道；使用方配置自带的其他 `launchOptions` 保留。

## 命令

```bash
pnpm test:browser
pnpm test:browser --filter @pwa-platform/browser-test-harness
pnpm --filter @pwa-platform/browser-test-harness test
```

- 根脚本 `scripts/run-workspace.mjs` 新增 `test:browser` 操作：先构建依赖，再对有该脚本的包执行 `test:browser`；带 `--filter` 时包名不存在即失败，与现有操作一致。
- harness 包的脚本：`build`、`test`（Vitest 单元测试）、`test:browser`（`playwright test`）、`typecheck`。
- 现有的 `pnpm test` 不启动浏览器，不受影响。

## CI

在 `.github/workflows/ci.yml` 中新增 `browser` job：

- 运行在 `ubuntu-latest`，只用 Node 24；权限、触发条件、并发设置与 action 固定方式沿用现有 job。
- 使用 runner 预装的 Google Chrome 稳定版（`channel: "chrome"`），不执行 `playwright install`，不下载浏览器。
- 冻结 lockfile 安装后打印 `google-chrome --version`，再执行 `pnpm test:browser`，失败即报红。
- 不上传测试报告或 trace。

## 测试策略

- **单元测试（Vitest，不启动浏览器）**：服务器的 Host 校验、别名与越界拒绝、重定向、方法限制、响应头规则（覆盖顺序、多行值）、部署切换、请求记录；缓存快照比对；`Cache-Control` 解析与匹配；生命周期事件顺序校验；N-1 可执行文件覆盖。
- **浏览器自测（Playwright，Chrome）**：每个断言工具都配合 worker fixture 至少验证一个成立与一个不成立的情况：
  - 注册与控制；部署 v2 后出现 waiting worker，页面仍由 v1 控制，此时 `waitForControllerChange` 失败；接管 worker 的 v2 接管后 `waitForControllerChange` 成立；
  - 透传 worker 下 `fromServiceWorker` 为真，无 fetch worker 下为假且请求到达服务器；带片段的 URL 能匹配；离线时请求得到网络错误；
  - 清理 worker 激活后，`expectDeletedExactlyUnderPrefix` 在包含"同应用旧 revision、同应用其他环境、以当前 `appId` 开头的其他应用、非平台缓存"的对照组上成立；少删、多删或保留缓存的条目数变化时断言失败；
  - 响应头规则（包括同名两行）能被 `expectCacheControl` 检出。
- **变异检查**：逐个破坏断言工具的核心判断，确认对应自测失败，恢复后源码逐字节一致。
- **依赖边界**：测试断言包的依赖只有 contracts、`@playwright/test` 与 Node 内置模块。

## 边界

- **始终**：服务器只绑定 `127.0.0.1` 并校验 Host；记录中不保存请求体、响应体或缓存内容；依赖精确固定版本；断言使用特性检测；worker fixture 与平台行为保持隔离。
- **先询问**：引入 `@playwright/test` 以外的新依赖；上传报告或 trace；下载浏览器二进制或驱动；接入设备云；扩展到 Safari、Firefox、Edge 或 Chrome Android 的运行配置。
- **禁止**：实现平台 worker 或客户端运行时行为；把 worker fixture 当作运行时代码导出；在测试中访问 localhost 以外的网络；在 CI 中读取 secret 或申请写权限。

## 验收标准

1. `@pwa-platform/browser-test-harness` 提供上文列出的服务器、页面、worker fixture、断言工具与 Playwright Test fixture，依赖只有 contracts、`@playwright/test`（精确版本 `1.63.0`）与 Node 内置模块。
2. fixture 服务器只绑定 `127.0.0.1` 并校验 Host，只按原始写法提供文件（别名与站点目录之外的路径一律 404），只处理 `GET`/`HEAD`，支持部署切换与按路径的响应头规则。
3. 单元测试与浏览器自测覆盖每个断言工具成立与不成立的情况；变异检查确认断言有效。
4. `pnpm test:browser` 在本地 Chrome 稳定版上通过；CI 的 browser job 在 Google Chrome 稳定版上通过，有意制造的失败使其报红。
5. README 写明桌面端 N-1（`PWA_HARNESS_CHROME_PATH`）的运行步骤，并说明 Chrome Android 暂不支持的原因。
6. ADR-0010 记录采用 Playwright Test 的决定；包边界、浏览器矩阵、文档基线与 README 已同步。

## 已决定事项（项目所有者，2026-09-15）

- 真实浏览器验证使用 Playwright Test；Vitest 继续负责单元测试。
- CI 使用 runner 预装的 Google Chrome 稳定版；桌面端 N-1 在本地用同一套测试运行。
- CI 新增独立的 browser job，只跑 Node 24。
- harness 提供 fixture 服务器、最小页面、worker fixture 与断言工具。
- #46 独立评审后：
  - 新增 `waitForControllerChange`，现有按 URL 比较的等待工具保留并写明限制；
  - `expectCacheControl` 采用严格匹配（只写指令名只匹配不带值的指令，`name=*` 匹配任意值，重复指令失败，等号两侧的空白无效）；
  - 移除 Chrome Android 运行目标：Playwright 的 Android 支持是实验性的，首次连接需要下载驱动 APK，且会忽略离线等上下文选项，本模块没有设备可以验证。Chrome Android 的运行方式由第一个具备测试设备的运行时模块决定，所需下载源另行审批；#44 中"用环境变量选择运行目标"的决定随之作废；
  - 每个 Playwright worker 在日志中打印实际运行的浏览器版本。

## 开放问题

- Chrome Android 的验证方式尚未确定（见"已决定事项"），浏览器矩阵对 Chrome Android N 与 N-1 的必测要求不变。
- runner 预装的 Chrome 版本随镜像更新，CI 只能证明"验证当天的稳定版"，不能固定为某个版本号；实测版本通过日志与测试注解记录。

## 增补：全仓浏览器测试逐包串行（2026-09-24，项目所有者决定）

不带 `--filter` 的 `pnpm test:browser` 改为逐包串行：`scripts/run-workspace.mjs` 对该操作传 `--workspace-concurrency=1`。其余操作（`build`、`test`、`typecheck`）与带 `--filter` 的调用不变。

**起因**：pnpm 的 `--recursive run` 默认并发为 4，会同时启动多个包的真实 Chrome。2026-09-24 实测，sw-runtime 的 Push 点击场景在另有两个包的全量浏览器测试同时运行时 20 次失败 4 次（通知 10 秒内未出现 3 次、创建浏览器 context 失败 1 次）；单独运行或只另加一个包时 20/20 通过。门禁结果不应取决于机器负载。证据见 [push-module 验证记录](../tasks/push-module/verification.md)"点击场景偶发失败的根因调查"。

**代价**：全仓浏览器测试的耗时变为各包之和。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

**2026-09-24 补齐**：本模块当天再次进入修订，按上述约定补齐了该表，见下方 Documentation impact；表只针对那次修订。

## Documentation impact

本表针对 2026-09-24 的修订：全仓 `pnpm test:browser` 改为逐包串行（见上文"增补：全仓浏览器测试逐包串行"）。此前交付的部分不据此反推（2026-09-23 的决定）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 不涉及。 |
| decisions | follow | 运行方式的调整，不涉及架构决定。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | CI 仍执行 `pnpm test:browser`，工作流文件不变；串行由根脚本实现，CI 随之串行。 |
| supply-chain | follow | 不涉及。 |
| browser-matrix | follow | 不涉及。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | update | README 说明 harness 自测串行，但未说明全仓运行也已逐包串行；补一句。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | 不涉及。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 本地门禁记录模板的命令不变。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 不涉及。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | 不涉及。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | update | 修订的起因与证据记入 push-module 验证记录的"点击场景偶发失败的根因调查"。 |
| public-read-cache | follow | 不涉及。 |
