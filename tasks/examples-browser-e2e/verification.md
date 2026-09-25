# 验证记录：examples-browser-e2e

> 模块质量门禁及后续质量修订的可复现结果。本模块的任务以本地编号 T1–T14 记录在 [plan.md](plan.md)，GitHub 账号恢复后补建 issue 并回填编号。

## 环境与对象

- 日期：2026-09-17
- 分支：`feat/examples-browser-e2e`，基线 `main` = `c1e1a52`（模块规格与计划已在 main 上）
- 环境：Node v24.18.0，pnpm 11.18.0，macOS 15.7.3（24G419）arm64，Google Chrome 152.0.7977.84（本机安装的稳定版），Playwright 1.63.0
- 被验证的提交：门禁先在 `6fb01dd`（T1–T8）上执行；处置门禁失败与独立评审之后在 `52513a2` 上重新执行

本分支相对 `main`：10 条提交、51 个文件、1771 行新增 22 行删除。

| 提交 | 标记 | 内容 |
|---|---|---|
| `8771f87` | `Task: T1` | 包骨架与 Vue 示例 |
| `091b469` | `Task: T2` | React 示例（新增 `react-dom`） |
| `7a4fe20` | 无 | 跨模块修复：React 绑定的方法等待 facade attach（项目所有者批准，见 plan 的 T1–T3 补记） |
| `7eb41e6` | `Task: T3` | 三个站点版本与冒烟测试 |
| `aad6256` | `Task: T4` | 安装与离线 E2E |
| `63da7ad` | `Task: T5` | 更新提示与恢复演练 |
| `c22ea3e` | `Task: T6` | build-verifier 三类校验 |
| `4f95b7c` | `Task: T7` | 上游移交缺口三项 |
| `6fb01dd` | `Task: T8` | 入口文档同步与 ADR 评估 |
| `52513a2` | `Task: T9` | 门禁失败与独立评审的处置 |

`7a4fe20` 没有 `Task:` 标记：它修的是 vue-react-adapters 已交付的包，不属于本模块任何一个任务。

## 干净 worktree 门禁

从被验证的提交新建独立的 detached git worktree（位于 `/tmp` 下的会话临时目录，不在仓库内），依次执行。两轮的差别只有被检出的提交：

| 命令 | `6fb01dd`（处置前） | `52513a2`（处置后） |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0 | 退出 0 |
| `pnpm test` | 退出 0，788 通过 | 退出 0，788 通过 |
| `pnpm typecheck` | **退出 2** | 退出 0 |
| `pnpm test:browser` | 退出 0 | 退出 0，97 通过、2 跳过 |

处置后一轮的逐包计数：

- `pnpm test`：contracts 139、browser-test-harness 61、core 94、build-verifier 100、engine-workbox 37、sw-runtime 87、client-runtime 80、vue 36、vite 94、react 60。本包没有单元测试，按规格不声明 `test` 脚本，被 `--recursive` 跳过。
- `pnpm test:browser`：browser-test-harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12、vite 11、**examples-browser-e2e 33 通过、2 跳过**。所有包日志均打印 `chromium 152.0.7977.84 (configured channel)`。

**第一轮 typecheck 失败的原因**：本包 `tsconfig.json` 声明 `types: ["node"]`，`package.json` 却没有声明 `@types/node`。主工作区里 TypeScript 沿目录向上解析，落到了仓库之外的 `/path/to/user/node_modules/@types/node`（22.13.4，`--traceResolution` 实测），因此 T1–T8 在主工作区的"typecheck 通过"都依赖这份仓库外的类型；干净 worktree 往上没有这个目录，报 `TS2688`。这正是干净 worktree 门禁要拦的"只在本机成立"。补声明后，主工作区的解析也落回仓库内的 24.13.4。

## 依赖与供应链

相对 `main`，lockfile **+62 行、0 行删除**。

- 新增的外部包三个，均经项目所有者批准：`react-dom@19.3.0`（T2，带传递依赖 `scheduler@0.28.0`）、`@types/react-dom@19.3.0`（T9）。
- `@types/node@24.13.4` 在 T9 补声明，**lockfile 中已有同一版本**（另外 6 个包在用），没有新下载。
- 发布时间均满足 `minimumReleaseAge: 1440`：`react-dom` 19.3.0 为 2026-09-09T17:17，`scheduler` 0.28.0 为 2026-09-09T17:17，`@types/react-dom` 19.3.0 为 2026-09-09T18:07。
- **非 registry 来源的 `resolution`：无**（新增条目均只有 `integrity`）。**声明安装脚本的包：无**（registry 元数据中三个包都没有 `preinstall`/`install`/`postinstall`，lockfile 中无 `requiresBuild`）。
- 本包 importer 的 workspace link 六条：browser-test-harness、build-verifier、contracts、react、vite、vue。
- `pnpm-workspace.yaml` 与根 `package.json` 未被本分支触碰，供应链设置没有被放宽。

## 变异检查汇总

每条变异都做到：锚点唯一命中、测试转红且死在目标断言上、还原后与 HEAD 逐字节一致、基线复跑。被别的东西先杀死的变异不计入，另换一个。

| 任务 | 变异 | 结果 |
|---|---|---|
| T1 | 策略离线页路径写成绝对 URL | 构建以 `compile.offline-fallback-not-built` 失败 |
| T3 | recovery 站点保留 v1 的 `sw.js` | 冒烟测试失败（原计划"跳过 v2 构建"被 harness 目录校验先杀死，不计） |
| T4 | 构建后把 manifest 的 `display` 改坏 | 恰好两条字段测试失败 |
| T4 | 只在构建出的 `sw.js` 里关掉离线降级 | 恰好两条"未缓存路由走离线页"失败（删离线页会连应用壳离线测试一起失败、分不清是哪条断言起作用；关掉策略里的离线降级被配置校验先杀死，两者均不计） |
| T5 / T9 复核 | v2 worker 在 install 时 `skipWaiting` | 四条更新测试全红，第一条死在 `registration.waiting` |
| T5 / T9 复核 | 恢复 worker 注册 fetch 并转发网络 | 两个示例的"什么都不提供"在恢复接管**之后**的断言转红；删除集合与第 4 步通过 |
| T6 | 指纹资源响应头基线改成 `no-cache` | 两个示例的正向发布检查转红，恰好三条诊断 |
| T6 | 构建时从 bundle 删掉一个指纹资源 | 已固化为常驻测试，先跑对照构建 |
| T7 | React Provider 依赖改回整个 `config` 并重建 `dist` | 只有 React 重渲染测试转红（`Received: "not registered"`）；**同一变异下 react 包 60 条单元测试全部通过** |
| T9 | 在 `main.tsx` 注入类型错误 | typecheck 退出 2，证明 `.tsx` 已在检查范围内 |
| T10 | 对现状新增 `#outside-usepwa` 的 `toBeHidden()` 断言 | 精确 Playwright 用例报 `Received: visible`；加入原生 `hidden` 后同一用例通过，错误文本断言仍保留 |

**没有变异的项**：真实 `beforeinstallprompt`——浏览器没有发出该事件，"事件已发出而按钮没出现即判失败"这条分支在本机无法触发，只能按代码审阅确认。

## 独立评审

由新上下文的 `code-reviewer` 代理审阅 `6fb01dd`，重点按 plan 指定。代理自行复跑基线（33 通过、2 跳过），做了临时探针与三次变异，全部还原并以 `git status`、shasum 与 `dist` md5 证明；未读取仓库中未跟踪的私有文档。

**结论：尚不可进入交付**——2 个阻断项、5 个应修项、6 个建议项。逐项处置如下，全部落在 `52513a2`。

### 阻断项

- **B1：恢复演练第 4 步测试随机失败。** 恢复 worker 安装时界面已收到 `update-waiting`，提示永不消失，`deployAndOffer` 等按钮可见便立即返回，点击早于 v1 worker 出现。**本会话复现**：未改动的 HEAD 上 16 次运行失败 4 次，均为 `No controllerchange within 10000 ms`。**处置**：第 4 步改为等 waiting 槽；`deployAndOffer` 增加"部署前提示不得已在"的前提断言。修复后同一测试重复 30 次全部通过。T5 记录中"变异引入的不稳定"的归因是错的，已在 plan 中更正。
- **B2：React 示例的 `.tsx` 不在 typecheck 范围内。** `tsconfig.app.json` 的 `include` 只匹配 `*.ts`。**本会话核实**：`--listFilesOnly` 中 React 只有 `version.ts` 与 `virtual.d.ts`；纳入后唯一错误是 `react-dom/client` 缺类型。**处置**：纳入 `*.tsx`，新增 `@types/react-dom@19.3.0`（项目所有者批准）；注入类型错误的对照确认生效。T2、T7 中"typecheck 通过"的记录已更正。

### 应修项

- **S1：在线请求检查区分不了平台 worker 与恢复 worker。** 应用壳 URL 以 fetch 发出、不是导航，平台 worker 也放行。**处置**：改请求发布出的 worker 预缓存清单中的资源，并在部署恢复 worker 前先断言同一请求为 `fromServiceWorker: true` 作对照；离线分支同样改用该资源。
- **S2：真实安装提示的跳过条件看按钮而非事件。** **处置**：初始化脚本在捕获阶段计数原始事件，计数为 0 才登记"未取得"。评审探针同时确认本机两个示例 8 秒内事件计数为 0、图标为 1×1，所以**当前登记为"未取得"属实**。
- **S3：`7a4fe20` 的审批与记录缺失。** 该修改是项目所有者在本会话中批准的，评审代理看不到会话内容，因此标为"未证实"。**处置**：审批与 T1–T3 实施记录补入 plan；评审指出的新行为"Provider 永久卸载后调用永不结束"补入 `spec/vue-react-adapters.md` 已知限制。评审复核修复本身正确（等待者在微任务中继续，不会漏掉 `registered`）。
- **S4：演练第 1 步只断言预缓存非空。** **处置**：断言条目数等于发布出的 worker manifest 长度（两个示例均为 3）。
- **S5：验证记录缺项、基线行措辞过度。** **处置**：本文件补齐；基线行去掉"每项配有变异检查"，写明 CI 证据待账号恢复。

### 建议项

1. 重组 `PwaPlan` 时手填字段过多、交叉核对偏少 → 已改为从发布出的 worker 读回请求基线、离线降级与更新模式，并用实际返回的 manifest 的 `id`、`scope` 与身份交叉核对。`pathRules` 仍留空并注明。
2. `release.spec.ts` 注释写"两条诊断"而断言为三条 → 已改。
3. `global-setup.ts` 直接改写 `version.ts` 源码，进程被杀时源码停在 v2 → **不改**：`global-setup` 开头已校验源码必须声明 `"v1"`，中断后下次运行会以明确的错误停下，且 `git status` 会显示该文件被改动，不会静默产出两个相同的版本。
4. 重渲染测试依赖"facade 重建后无人重新注册"这一前提 → 已在测试注释中写明。
5. 把"更新提示常驻"与 B1 关联 → 已写入 ADR 评估中的新发现缺口。
6. 基线行 CI 证据的说法 → 并入 S5。

## 浏览器矩阵记录

字段按[浏览器矩阵](../../docs/architecture/browser-matrix.md#版本号)。场景为 V1 验收矩阵第 6 行的四项，两个示例各一套。

| 浏览器与档位 | N / N-1 | 完整版本号 | 操作系统 | 日期 | 结果 |
|---|---|---|---|---|---|
| Chrome 桌面端（必测） | N | 153.0.8010.50 | macOS 15.7.3（24G419）arm64 | 2026-09-19 | 离线启动、更新提示、恢复路径：两个示例的自动化覆盖通过。React 已安装桌面 PWA 可从独立窗口启动并显示 `v1`／`registered`；**原始 `beforeinstallprompt` 仍未取得**，不计安装事件通过 |
| Chrome 桌面端（必测） | N-1 | 152.0.7977.82 | macOS 15.7.3（24G419）arm64 | 2026-09-19 | **部分通过**：Chrome for Testing 的完整浏览器套件为 35 通过／2 跳过；离线、更新、恢复及安装元数据／接线均通过。两个跳过项都是未取得真实 `beforeinstallprompt`，不计原生安装通过；隔离自动化也不替代人工独立窗口核验 |
| Chrome Android（必测） | N | — | — | — | **未执行**：无测试设备；Chrome Android 的运行方式尚未确定（ADR-0010） |
| Chrome Android（必测） | N-1 | 152.0.7977.82 | Android 16，Xiaomi 23127PN0CC | 2026-09-19 | **部分通过**：Vue 示例已完成 Chrome 原生安装、从启动器图标以独立 WebAPK 窗口启动；React 在 Chrome 的专用 Pages HTTPS origin 已实际加载、在线刷新、离线应用壳与未缓存路由的离线降级均有现场证据，但未取得原始 `beforeinstallprompt`／页面 `Install` 入口。React 已取得更新提示与用户确认的现场证据，但未证明旧页不刷新或 Worker 接管；后续打开的已安装独立窗口属于设备的非 Chrome 浏览器，不能折算为 Chrome 原生安装证据；Android 恢复场景未执行，故不能外推为该档完整通过 |
| Edge 桌面端（参考） | N | — | — | — | 未执行 |
| Safari（渐进兼容） | 当前稳定版 | 随 iOS 26.6.2 的 Safari | iPhone 16 Pro | 2026-09-20 | **部分通过**：在线应用壳与交互、已缓存应用壳离线刷新通过；修复后从受控的普通 Safari 页面离线导航到未缓存探针，显示预缓存离线页且 `navigator.serviceWorker.controller !== null`。更新提示、安装与 Push 不作保证 |
| Firefox 桌面端（渐进兼容） | 当前稳定版 | — | — | — | 未执行 |

"N"按本机稳定版渠道自动更新到的当前版本判定，未对照 Chrome 官方发布页核实当天的最新主版本。

**按浏览器矩阵的规则，本模块在必测范围上仍没有通过。** 矩阵规定必测档"任一场景失败，质量门禁或发布门禁即失败"，并明写 Chrome Android"拿不到 N-1 时，这一项按未通过处理，不设例外"。本记录如实区分：Android N 与桌面 N-1 未执行；Android N-1 只取得 Vue 的 Chrome 原生安装通过，React 未取得原始浏览器安装事件的页面证据。React 更新提示与确认只取得部分现场证据，未证明旧页不刷新或 Worker 接管；设备非 Chrome 浏览器中的已安装窗口不能填补 Chrome 证据，且 Android 恢复场景未执行。它们都不足以构成完整模块通过，不能把本机桌面端 N 的结果外推。是否调整必测范围属于治理基线变更，须由项目所有者决定并另立 ADR（T8 已确认本模块不修订矩阵）。

**真实安装的原生流程**（完成安装、以独立窗口启动并断言 `display-mode`）需要驱动浏览器原生界面，Playwright 做不到。T13 已以 Android N-1 真机完成 Vue 示例的人工核对；T14 的 Chrome React 安装事件仍未取得。Pages 补充复验发现的独立窗口由设备的非 Chrome 浏览器承载，故不能充作 React 的 Chrome 原生流程；Android N 仍未执行。

### iOS Safari 渐进兼容说明（2026-09-19；2026-09-20 修订）

- **浏览器与环境：** iPhone 16 Pro，iOS 26.6.2 的内置 Safari。
- **已通过：** 用户在线打开 React Pages 根路径，页面显示 `v1` 与 `registered`，`Bump` 从 0 变为 1；关闭网络后刷新同一已缓存页面，React 应用壳仍正常显示。
- **首次观察：** 在应用壳已缓存后，断网访问未缓存导航 `/app/ios-offline-fallback-probe`，等待并刷新一次后仍连续白屏，未显示预期的 `You are offline`。该探针路径在线时由 Pages 返回空的 HTTP 404，故在线白屏是其测试前提，不把它记录为基础 Web 路由故障。
- **修复后实测（2026-09-20）：** iPhone 通过 USB Safari Web Inspector 检查线上 `/app/sw.js`，确认以 `200` 从网络取得，响应为 `Cache-Control: public, max-age=0, must-revalidate`。在普通 Safari 的受控页面中开启飞行模式、导航到同一未缓存探针后，页面正文为 `You are offline` 与 `This page was precached so a navigation with no network still reaches something readable.`；控制台同时确认 `navigator.serviceWorker.controller !== null` 为 `true`。因此该导航由 Worker 接管并返回预缓存的离线页，不是白屏或 Safari 网络错误页。
- **边界：** 这条证据只覆盖 React Pages 的一个未缓存导航和 Safari 渐进兼容；更新提示、原生安装与 Push 仍不作保证，也不改变浏览器矩阵的必测结论。

## 恢复演练记录

按[恢复演练](../../docs/operations/recovery-drill.md#记录模板)的记录模板填写。T5 时写在 plan 中的版本有一行证据不成立（见下方"修复后 worker"一行），以本记录为准。

- 触发：质量门禁。本模块的 PR 尚未创建（GitHub 账号不可用），被验证的提交为 `52513a2`。
- 日期：2026-09-17
- 执行人：自动化执行（`packages/examples-browser-e2e/browser-tests/recovery.spec.ts`），两个示例各跑一遍
- 环境：本地 fixture 服务器（`http://localhost:<系统分配端口>`），干净 worktree
- 应用与环境：`appId` = `pwaexample`，`environment` = `production`，`appCachePrefix` = `pwa:pwaexample:production:`
- 被测 worker 构建标识：`v1` 站点的 `/app/sw.js`（vite-adapter 插件产出的平台 worker）
- 恢复 worker 构建标识：`recovery` 站点的 `/app/sw.js`，内容即 `v1` 的 `pwa-recovery-worker.js`（ADR-0015 的改名在构建期完成）
- 修复后 worker 构建标识：重新部署的 `v1` 站点 `/app/sw.js`

### 浏览器

Chrome 桌面端 N，152.0.7977.84，macOS 15.7.3 arm64。其余必测范围未执行，见上一节。

### 缓存清单

缓存名一律由 contracts 的 `cacheName` / `appCachePrefix` 计算，唯一手写的是非平台缓存名。

| 缓存名 | 步骤 1 条目数 | 步骤 3 结果 | 预期 | 是否一致 |
|---|---|---|---|---|
| `pwa:pwaexample:production:r1:precache`（当前预缓存） | 3（断言等于发布出的 manifest 条目数） | 删除 | 删除 | 是 |
| `pwa:pwaexample:production:r0:precache`（同应用旧 revision） | 2 | 删除 | 删除 | 是 |
| `pwa:pwaexample:staging:r1:precache`（同应用其他环境） | 3 | 保留，3 | 保留 | 是 |
| `pwa:pwaexample-legacy:production:r1:precache`（其他应用，`appId` 以当前值开头） | 1 | 保留，1 | 保留 | 是 |
| `example-app-shell-v1`（非平台缓存） | 1 | 保留，1 | 保留 | 是 |

### 检查结果

| 检查项 | 浏览器 | 结果 | 证据 |
|---|---|---|---|
| 接管客户端，无用户操作 | Chrome 152 桌面 | 通过 | `waitForControllerChange`，触发动作只有部署与 `registration.update()`；之后等 worker 到达 `activated`（`controllerchange` 早于清理完成，T5 实测） |
| 在线请求未经 Service Worker | Chrome 152 桌面 | 通过 | 对照：部署恢复 worker 前，同一预缓存资源 `fromServiceWorker` 为真；部署后为假，服务器侧 `requests()` 记到该请求 |
| 断网请求得到网络错误 | Chrome 152 桌面 | 通过 | 断网后请求同一预缓存资源，`outcome` 为 `network-error` |
| 恢复 worker 未注册 fetch 监听 | 不适用 | 通过 | sw-runtime 单元测试；变异（注册 fetch 并转发）使上一项转红 |
| 删除集合与预期一致 | Chrome 152 桌面 | 通过 | `expectDeletedExactlyUnderPrefix`，加上按上表逐行的断言 |
| 保留集合与预期一致 | Chrome 152 桌面 | 通过 | 同上，条目数一并比对 |
| 修复后 worker 激活，离线启动恢复 | Chrome 152 桌面 | 通过 | 重新部署 `v1` → **等到 waiting 槽出现** → 确认 → `controllerchange` → 预缓存重新填充 → 断网重载应用壳可见。T5 版本以"界面提示出现"为证据，而该提示在部署修复版之前就已存在，不成立（T9 评审 B1） |

### 结论

**Chrome 152 桌面端全部通过；本次演练不构成通过。** 演练文档的通过标准是"必测范围内的每个浏览器"，Chrome Android 与桌面端 N-1 未执行。

## spec-guard 产物校验

`mcp__spec-guard__verify`：9 通过、0 警告、1 失败；GitHub 层因 `gh` 未认证而跳过（不代表通过）。

唯一的失败是"vue-react-adapters 的职责描述改过，对应 issue 正文摘要已过期"。这是上一模块**有意保留**的 `rowDigest` 分歧（记录在 `tasks/vue-react-adapters/verification.md`）：issue #8 的正文尚未刷新，写回新指纹等于谎报已同步，待账号恢复后经 `/spec-guard:sync-map` 处理。与本模块无关，未改动。

## 文档一致性

- 全仓已跟踪 markdown 的相对链接与锚点扫描：0 条失效（T8 执行，扫描器先经注入坏链接与坏锚点的对照）。T9 新增的链接在提交前复扫。
- `docs/DOCUMENTATION-BASELINE.md` 表格逐行复验列数：0 行异常。
- 浏览器矩阵与 V1 验收矩阵未被本分支触碰。

## T10：React 测试探针可见性修订（2026-09-19）

- **原因：** Android N-1 实机预检显示 Provider 外 `usePwa()` 的预期错误被直接渲染。该错误证明 T7 的真实渲染路径存在，并非 React 绑定失效；问题是测试探针成为了示例界面的一部分。
- **RED → GREEN：** 在原有精确文本断言之后加入 `toBeHidden()`，定向 Playwright 用例先以 `Received: visible` 失败；探针加原生 `hidden` 后，同一用例通过，文本断言仍在。
- **验证：** `pnpm --filter @pwa-platform/examples-browser-e2e typecheck`、`pnpm lint` 均通过；完整浏览器套件最终为 **33 passed / 2 skipped**。第一次完整运行曾在 React 恢复测试的离线 `page.reload()` 出现一次 `net::ERR_ABORTED`；未改代码时该用例连续 10 次通过，完整套件重跑也通过，因此未将其归因为 T10 或通过修改测试掩盖。两项跳过仍是未取得真实 `beforeinstallprompt`。
- **边界：** 未改 `@pwa-platform/react`、PWA 策略、Service Worker、浏览器矩阵或 V1 验收矩阵；未新增依赖或 ADR。

## T11：恢复 E2E 稳定性审计（2026-09-19）

- **原始现象：** T10 首次完整套件中，React 恢复场景在 `context.setOffline(true)` 后的 `page.reload()` 一次报出 `net::ERR_ABORTED; maybe frame was detached?`。预缓存已在此前断言中确认重新填充；该签名不同于 T9 已修复的 waiting-slot 竞态，不能据此改写恢复结论。
- **复现矩阵：** 未改源码条件下，React 定向场景 10 次通过；同一场景按 Vue→React 顺序各重复 20 次（40 个执行）无失败产物；完整 35 项套件在 Chromium `153.0.8010.50` 配置下两次通过，各为 **33 passed / 2 skipped**。跳过项仍是未取得真实 `beforeinstallprompt`。
- **决定：** **未复现，未修复。** 不引入 retry、额外延时、放宽断言或常态 trace，因为这些会改变时序或掩盖真实失败。下次再出现该精确签名时，临时启用 Playwright `trace: "retain-on-failure"`，保存失败 trace 后再启动根因修复任务。

## T12：安装图标真实性修复（2026-09-19）

- **发现与边界：** 安装就绪审计确认 Vue 与 React 示例的八个图标文件实际均为 1×1 PNG，manifest 则声明为 192×192／512×512；构建产物原样保留该不一致。Chromium 的安装清单要求实际提供 192 与 512 尺寸图标，不能只声明元数据。[Chrome 安装清单要求](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)
- **RED → GREEN：** 新增安装 E2E，从实际 fixture 站点读取每个图标的 PNG 签名与 IHDR 宽高，并与 manifest `sizes` 比对。修复前两例精确报 `Expected: 192`、`Received: 1`；修复后两例通过。最初一次测试正则转义错误只导致尺寸文本解析失败，已在实现前改正，未作为缺陷证据。
- **处置：** 新增普通与 maskable 两个 SVG 源，离线生成并替换两个示例的八个 PNG。每个 192 文件实测为 192×192，每个 512 文件实测为 512×512。未新增依赖，未改变 `PwaIdentity`、manifest 字段、策略、Service Worker 或公开契约。
- **验证与剩余证据：** `pnpm --filter @pwa-platform/examples-browser-e2e typecheck`、`pnpm lint` 通过；完整浏览器套件在 Chromium `153.0.8010.50` 下为 **35 passed / 2 skipped**。两条跳过仍是浏览器未发出真实 `beforeinstallprompt`，不计安装通过。真机完成原生安装、独立窗口启动与 `display-mode` 仍须单独人工核对。

## T13：Android N-1 原生安装核验（2026-09-19）

- **环境：** Xiaomi 23127PN0CC，Android 16，Chrome `152.0.7977.82`。以 ADB reverse 映射的全新 localhost `4301` 提供当前构建的 Vue `v1`，避免旧 `4173` origin 的等待 Worker 干扰。
- **安装证据：** 设备实际请求 manifest、512 maskable 图标与 Worker；页面显示 `registered`，并出现网页内 `Install` 按钮。用户完成原生安装确认后，启动器出现 `Example` 图标。
- **独立窗口证据：** 用户从该图标启动后，前台活动为 `org.chromium.chrome.browser.webapps.SameTaskWebApkActivity`，无障碍树中没有 Chrome URL 栏或菜单，页面显示 `PWA Platform · Vue example`、`v1` 与 `registered`。Vue 的 Android N-1 原生安装与独立窗口启动通过。
- **边界：** 这不是完整模块通过：Chrome Android N（153）未取得，React 的原生安装未执行，桌面 N-1 与参考／渐进兼容档仍未执行。

## T14：React Android N-1 原生安装事件诊断（2026-09-19）

- **复现：** 以独立 localhost `4302` 与 ADB reverse 提供当前 React `v1`，隔离 Vue 的 `4301` origin。设备页面显示 `PWA Platform · React example`、`v1` 与 `registered`；用户刷新页面并点击 `Bump`，计数从 0 变为 2，证明当前页面的用户交互已实际发生。
- **现场结果：** 刷新、等待和交互之后，页面始终没有 `Install`；无障碍树中也没有该按钮。此时 Worker 已注册，但未记录到原始 `beforeinstallprompt`，因此不能进入浏览器原生安装确认或独立窗口核验。
- **已验证的范围：** 在隔离临时 Chrome 配置下，现有 React 用例 `wiring only: a dispatched install event reaches the interface through the binding` 通过（Chromium `153.0.8010.50`）。它证明事件若被 runtime 接收，公开 client facade、React binding 与示例界面会显示 `Install`；它不证明真机事件一定派发，也不排除真机时序问题。
- **结论与后续：** Android Chrome 的原始安装事件受用户参与度／访问历史启发式影响，这是当时未取得该事件证据的一个合理解释，但并非已证实根因。后续 Pages HTTPS 复验中看到的已安装独立窗口由非 Chrome 浏览器承载（见下节），不改写本次 Chrome 原始事件未取得的事实。若要完整追溯初次安装路径，须在可持续访问的 HTTPS 测试地址上记录原始事件并在未安装状态重测；该选择涉及测试环境，而不是本模块的代码修复。[Chrome 安装条件](https://web.dev/articles/install-criteria)

### Pages HTTPS 补充复验（2026-09-19）

- **环境与操作：** 在同一 Android N-1 真机的专用 Pages HTTPS 测试站加载当前 React `v1`。首次在线加载及用户手动刷新后，页面均显示 `PWA Platform · React example`、`v1` 与 `registered`。
- **离线可用性：** 用户关闭网络并刷新后，设备显示系统离线状态，React 应用壳仍正常渲染，没有白屏或浏览器错误页。这补充了该公开 HTTPS origin 的离线应用壳现场证据。
- **非 Chrome 已安装窗口（不计入 Chrome 证据）：** 网络恢复后，React 页面仍未出现 `Install` 入口；Chrome 的“安装并创建快捷方式”面板显示“已安装此应用”。用户从该入口打开的独立窗口显示 `PWA Platform · React example`、`v1` 与 `registered`；但系统前台活动标识属于设备的非 Chrome 浏览器。该现象只能证明该浏览器存在已安装窗口，**不能**证明 Chrome 原生安装，也不反向证明初次安装时原始 `beforeinstallprompt` 已派发或未派发。
- **证据边界：** 设备拒绝 ADB 注入输入事件，现场点击与刷新均由用户完成；未开启会暴露完整个人 Chrome 会话的远程调试。因此本次只登记页面可观察结果，不把无法安全读取的浏览器内部状态作为结论。

## T15：React Chrome Android N-1 更新提示探针（2026-09-19）

- **更新前：** 在 Chrome 标签页（系统前台活动为 Chrome 的标签页活动）打开正式 Pages `v1`，页面显示 React `v1` 与 `registered`。本地既有浏览器套件重新生成 `v1`、`v2` 与恢复产物，三个 Worker 内容指纹均不同。
- **提示与确认：** 将已验证的 `v2` 静态产物发布到同一 Pages `main` 测试地址后，以同一 URL 在 Chrome 发起新导航；页面显示 `v2`、`registered`，并出现 `A new version is ready`。用户点击该入口后，页面仍可用；按钮仍可见，符合本模块已记录的 `updateWaiting` 不会自动清除的现有契约。
- **未取得：** 此次新导航已直接渲染 `v2`，没有保留一个可见的 `v1` 页面，因此不能证明确认前旧页未刷新；在不接入会暴露完整 Chrome 会话的远程调试前提下，也不能直接读取 Worker 控制权或确认后等待槽。恢复 Worker 及其缓存删除／修复后离线恢复未在 Android 执行。
- **收尾：** 公开 Pages 测试地址已重新部署为 `v1`。本记录只补充 Chrome Android N-1 的更新提示与用户确认现场证据，不将更新完整场景、恢复路径或浏览器矩阵条目改记为通过。

## T16：React Chrome Android N-1 未缓存路由离线降级（2026-09-19）

- **操作：** 用户手动关闭网络后，系统前台活动确认仍是 Chrome 标签页。通过 Android Intent 打开既有 Pages origin 中的 `/app/n1-offline-fallback-probe`；该路径不是应用壳预缓存资源。
- **结果：** Chrome 明确显示设备离线状态；页面渲染 `You are offline` 与离线说明文字，而非 React 应用壳、旧页面内容或 Chrome 网络错误页。这是 `offlineFallback` 对未缓存导航的真实 Chrome Android N-1 现场证据。
- **边界：** 这只覆盖 React 的一个未缓存导航路径；不替代 Android N、Vue 的该路径、真机更新完整流程或恢复演练。

## T17：React Chrome 桌面端 N 已安装窗口核验（2026-09-19）

- **环境：** macOS 15.7.3（arm64），Google Chrome `153.0.8010.50`。本机已有的 `PWA Platform Example` 以 Chrome 的独立应用窗口运行；进程启动信息指向该 Chrome 版本。
- **结果：** 独立窗口页面为 React Pages 测试地址，显示 `PWA Platform · React example`、`v1` 与 `registered`，并提供示例交互入口；窗口没有普通 Chrome 标签页的地址栏。这证明当前 Chrome N 中已安装应用可启动且示例完成注册。
- **边界：** 该应用在本次现场核验开始前已经存在，不能回溯证明初次安装时浏览器发出过原始 `beforeinstallprompt`，也不替代桌面 Chrome N-1、Android N 或完整必测矩阵。

## T18：Chrome 桌面端 N-1 浏览器套件核验（2026-09-19）

- **环境：** macOS 15.7.3（arm64）。从 Google Chrome for Testing 官方里程碑清单取得并在临时目录解压 Chrome `152.0.7977.82`；以 `PWA_HARNESS_CHROME_PATH` 显式传给现有 Playwright harness，未替换系统 Chrome 或修改浏览器配置。
- **结果：** 完整套件以该可执行文件运行 37 项，结果为 **35 通过／2 跳过**。Vue 与 React 的交接、manifest／图标、离线应用壳、未缓存导航离线降级、更新及恢复场景均通过；两个跳过项精确为两套示例的真实 `beforeinstallprompt`。
- **边界：** 跳过不等于安装通过。该测试是隔离的浏览器自动化，不证明桌面 N-1 的原生安装确认或独立窗口启动，也不替代 Android N、Android N-1 的人工证据。测试后工作树保持干净。

## T19：完整更新提示参考实现（任务 15，2026-09-21）

- **改动：** React（`apps/react/src/app.tsx`）与 Vue（`apps/vue/src/app.ts`）的更新提示从单个 `#apply-update` 按钮扩成横幅交互：`updateWaiting` 为真且未被 Later 隐藏时显示 `#update-banner`（`role="status"`，文案 `A new version is available`）、`#apply-update`（文案 `Update`）与 `#update-later`（`Later`）；点击 Update 后按钮变 `Updating…` 并禁用；`applyUpdate()` 成功后横幅变为 `Reload to use the new version` 与 `#update-reload`；`applyUpdate()` 失败则显示 `#update-error`（`Update failed`）与 `#update-retry`。两个示例的 `main` 入口都加了 `updateCheck: { intervalMs: 1_800_000 }`（30 分钟）。只改了 `packages/examples-browser-e2e/` 下的文件，未新增依赖，未动任何已交付包。
- **Reload 提示的判定依据：** `updateWaiting` 只被 `update-applied` 事件清为假，该事件在每个受控同 scope 页面各自的 `controllerchange` 上触发，不区分本页是否点击过 Update。因此确认页与未点击的同 scope 兄弟页共用同一段“`true → false` 就转入 Reload 提示”的逻辑，而不是分别为两种情形写代码。
- **测试环境：** macOS 15.7.3（arm64），Google Chrome `153.0.8010.50`（`channel: "chrome"`，Playwright 配置的本机已安装 Chrome stable，非下载浏览器）。
- **测试结果：**
  - `pnpm lint`：通过。
  - `pnpm --filter @pwa-platform/examples-browser-e2e typecheck`：通过（`tsconfig.json` 与 `tsconfig.app.json` 两个 project 均无诊断）。
  - `pnpm test`：全仓 15 个声明 `test` 脚本的包全部通过；`examples-browser-e2e` 自身 5 项单元测试（`ssr-tests/`）不受影响。
  - `pnpm test:browser --filter @pwa-platform/examples-browser-e2e`：**41 通过／2 跳过**，43 项全部执行完毕，无失败。跳过项是既有的两套示例真实 `beforeinstallprompt` 用例，与本任务无关，按规格已知限制处理。`update.spec.ts` 与 `recovery.spec.ts` 中改动前就有的断言全部保留且通过，没有被削弱或删除。
- **新增／扩展的 4 项断言与变异检查**（临时编辑 `apps/react/src/app.tsx`／`apps/vue/src/app.ts`，用 `npx playwright test --grep "..."` 跑对应用例确认报红，随后用改动前的文件内容原样还原，并以 `diff` 逐字节核对还原结果、`git status --short` 确认工作树干净）：
  1. **确认页出现 `#update-reload`，仍显示 `#version` v1 且保留文档标记**（`update.spec.ts` “confirming hands over control without refreshing the open page”新增的三行断言）：把 Reload 按钮 id 由 `update-reload` 改成 `update-reload-mutated`，其余状态机与点击行为不变。Vue、React 各自的该用例均报红（`toBeVisible()` 定位不到 `#update-reload`），2 项 Reload 测试也一并报红。还原后复测转绿。
  2. **同 scope 另一页也出现 `#update-reload`**（“one confirmation clears the prompt in every controlled same-scope tab”新增的两行断言）：与上一条共用同一次 id 变异——因为两条断言依赖的是同一段“`true → false` 即进入 Reload 提示”的代码，规格本身也是这样描述的（“按状态机它只可能来自 update-applied”）。该用例的 Vue、React 两侧均报红，失败点正是新增的 sibling `#update-reload` 断言。还原后复测转绿。
  3. **点击 `#update-reload` 后 `#version` 变为 v2**（新测试“clicking Reload reloads the confirming page onto the new version”）：把 Reload 按钮的 `onClick` 换成空函数（不调用 `location.reload()`）。先单独变异 React：`--grep "clicking Reload"` 下 React 报红（`#version` 停留在 `v1`）、Vue 未改动保持绿；还原 React 后同样变异 Vue，Vue 报红、React 保持绿。两次都已还原，证明断言确实在检验各自框架自身的点击行为。
  4. **点击 `#update-later` 隐藏 `#update-banner`，且 `readRegistration` 仍报告 waiting worker**（新测试“Later hides the banner without touching the waiting worker”）：把 Later 按钮的 `onClick` 换成空函数（不设置 dismissed 标志）。Vue、React 两侧该用例均报红（`#update-banner` 的 `toHaveCount(0)` 收到 1）。还原后复测转绿。
- **失败路径（`Update failed` / Retry）：** 仅代码审阅，不计为浏览器证据。`applyUpdate()` 需要在 10 秒内没有新 worker 接管才会拒绝，真实浏览器里无法稳定制造这一超时；规格“已知限制”原文已记录这一点，本次实施未改变结论，也未新增自动化尝试。React、Vue 两侧的重试均复用同一个确认函数（点击 Update 与点击 Retry 触发相同逻辑），失败与成功路径在实现上对称。
- **边界：** 未变更 `scope`、Service Worker URL、manifest ID 或缓存命名空间行为；未新增 ADR（没有产生难以逆转的架构决定，改动全部在示例应用界面与其 E2E 内）；未修改浏览器矩阵或 V1 验收矩阵；本任务不覆盖 Chrome Android、桌面 N-1 等既有已知限制，那些仍按 T13–T18 的记录处理。
- **主会话复核修正：** `applyUpdate()` 在没有等待中的 worker 时返回 `false` 而非抛错（ADR-0013），原实现只处理拒绝，会停在 `Updating…`；两个示例改为 `false` 时回到初始状态。修正后重跑 `pnpm lint`、示例包 typecheck 与本包 `test:browser`：41 passed、2 skipped（真实 `beforeinstallprompt` 未取得）。该分支无 E2E，属代码审阅。

## T20（任务 17）：区分"页面已是新代码"的更新提示（2026-09-22）

- **改动：** React（`apps/react/src/app.tsx`）与 Vue（`apps/vue/src/app.ts`）各自新增 `detectPageCurrency`：读出本文档自己的入口模块脚本绝对 URL（`document.querySelector('script[type="module"][src]')`），`fetch(SHELL_URL, { cache: "no-store" })` 取最新应用壳、用 `DOMParser` 解析出其入口脚本并解析为绝对 URL，两者相等为"当前"，否则（含 fetch 失败、非 2xx、解析不到入口脚本）为"陈旧"，与规格的保守默认一致。函数不放进 `apps/shared/`：该目录被 `tsconfig.json`（Node 侧配置）纳入检查、不带 DOM lib，`document`/`fetch`/`DOMParser` 在那份配置下无法通过 typecheck；只有各示例自己的 `tsconfig.app.json` 带 DOM lib，因此两侧各持有一份同逻辑的函数（`SHELL_URL` 本身正常从 `../../shared/identity.js` 导入）。
- **状态机改动：** 新增 `pageCurrency: "current" | "stale" | null`。`null`（未解析，含检查未开始与检查进行中）时横幅保持隐藏，避免文案先出现陈旧文案再切换。`updateWaiting` 假→真时把 `pageCurrency` 重置为 `null`；真→假时，`pageCurrency === "current"` 直接回到 `idle`（横幅整体消失，不出现 `#update-reload`），否则维持原有的 `reload` 分支。`prompt` 阶段文案随 `pageCurrency` 二选一（`An update is ready for offline use` / `A new version is available`），`#apply-update`、`#update-later` 的 id、文案与点击行为不变。
- **检查改为防抖发起，而非立即发起（见下方"实测发现的回归"）：** 两侧检查改为 `setTimeout` 100 ms 防抖，窗口内 `updateWaiting` 提前变假即 `clearTimeout`，从不发出请求；仍保留 `AbortController`，处理防抖后才结束等待周期的情形。
- **测试环境：** macOS 15.7.3（arm64），Google Chrome `153.0.8010.50`（`channel: "chrome"`，Playwright 配置的本机已安装 Chrome stable，非下载浏览器）。
- **测试结果：**
  - `pnpm lint`：通过。
  - `pnpm --filter @pwa-platform/examples-browser-e2e typecheck`：通过（`tsconfig.json` 与 `tsconfig.app.json` 两个 project 均无诊断）。
  - `pnpm test`：全仓 15 个声明 `test` 脚本的包全部通过，共 1597 个用例；`examples-browser-e2e` 自身 5 项单元测试（`ssr-tests/`）不受影响。
  - `pnpm test:browser --filter @pwa-platform/examples-browser-e2e`：**43 通过／2 跳过**，45 项全部执行完毕，无失败。跳过项是既有的两套示例真实 `beforeinstallprompt` 用例，与本任务无关。`update.spec.ts` 与 `recovery.spec.ts` 中改动前就有的断言全部保留且通过。
- **实测发现并修正的回归（`recovery.spec.ts` 间歇失败）：** 第一版实现在 `updateWaiting` 变真时同步立即发起 `fetch`。全量 `test:browser` 回归时，`recovery.spec.ts` 的"the recovery worker serves nothing, online or offline"间歇性失败（`Error: No controllerchange within 10000 ms`）。用 `npx playwright test --grep ... --repeat-each N` 定量对比：改动前 6/6、10/10 稳定通过；改动后（无防抖，仅 `AbortController`）单测隔离下 Vue 侧 4/4 失败、React 侧改善但仍偶发。根因：恢复 worker 在 `install` 事件内调用 `skipWaiting()`，浏览器仍会短暂将其状态置为 `installed`，`client-runtime` 的 `announceWaiting`（`packages/client-runtime/src/client/facade.ts`）照常发出 `update-waiting`，`updateWaiting` 因此在毫秒级窗口内真变又假变——这是 ADR-0026 附录已记录的既有现象（"任何以'更新提示出现'为信号的应用逻辑都会遇到同一个问题"），本任务第一次让它触发一次真实网络请求，与恢复 worker 幾乎同时的接管竞争。加 100 ms 防抖（窗口内提前变假即 `clearTimeout`，从不发出请求）后，`recovery.spec.ts` 单测隔离 `--repeat-each 5`（10 次）与整份文件 `--repeat-each 3`（18 次）全部转绿；全量 `test:browser` 保持 43 通过／2 跳过。
- **新增测试：** `browser-tests/update.spec.ts` 按 `EXAMPLES` 参数化新增一个用例——`installAndControl` → `deployAndOffer(page, fixtureServer, "v2")` → 点击 `#update-later` → `page.reload()`（应用壳导航是 network-first，在线刷新即取得 v2 的 HTML 与入口脚本，等待中的 worker 未受影响）→ 断言 `#version` 为 `v2` 且 `#update-banner` 出现、文案含 `An update is ready for offline use` → `waitForControllerChange` 包裹点击 `#apply-update` → 断言 `#update-banner`、`#update-reload` 均计数为 0，`readRegistration(...).waiting` 为 `null`。既有的"confirming hands over control…"（陈旧路径，断言 `#update-reload` 仍出现）等用例未改语义，逐条复跑保持通过。
- **变异检查：** 把两侧 `detectPageCurrency` 结尾比较从 `... === ownUrl ? "current" : "stale"` 改成 `... === ownUrl && false ? "current" : "stale"`（恒真陈旧）。跑新增用例：Vue、React 均按预期报红（横幅停在 `A new version is available`，`toContainText("An update is ready for offline use")` 超时失败）。随后用改动前的文件备份还原，`diff` 逐字节核对两个文件与还原前完全一致，`git status --short` 只剩本任务实际改动的三个文件；复跑 `pnpm lint`、示例包 typecheck、`pnpm test`（1597 通过）、`pnpm test:browser --filter @pwa-platform/examples-browser-e2e`（43 通过／2 跳过）确认变异前后都符合预期。
- **未取得范围：** fetch 失败、响应非 2xx、解析不到入口脚本这三条"陈旧"兜底路径仅代码审阅，未做浏览器变异——真实浏览器里稳定制造 fetch 失败或损坏 HTML 需要额外的 fixture-server 故障注入，超出本任务范围；规格原文对失败路径的处理标准本就是"保守，维持原行为"，代码路径与成功路径结构对称。
- **边界：** 未改动 `docs/guides/update-prompt.md`（按任务分工留给主会话处理）；未变更 `scope`、Service Worker URL、manifest ID 或缓存命名空间行为；未新增依赖；未修改任何已交付包；未新增 ADR（没有产生难以逆转的架构决定，100 ms 防抖常量与 `AbortController` 用法都是示例内部实现细节，随时可调）；未修改浏览器矩阵或 V1 验收矩阵。

## ADR 评估（T8，2026-09-17）

**结论：不立 ADR-0017。** 本模块没有产生难以逆转的架构决定。逐项依据：

- **没有触碰不可变边界。** `scope`、Service Worker URL、manifest ID、缓存命名空间行为都未改变；示例使用的身份与策略完全经由已交付包的公开入口传入。
- **没有新增公开契约。** `@pwa-platform/examples-browser-e2e` 是私有包，不产出 `dist`、不导出任何符号，只声明 `typecheck` 与 `test:browser` 两个脚本。删除整个包不影响任何其他包。
- **本模块做出的选择都在测试一侧，且可逆：**
  - 恢复 worker 在构建期改名到 `serviceWorkerUrl`——这是在测试中执行 ADR-0015 已规定的发布流程动作，不是新的选择。
  - 发布检查的计划从产物中读回（插件不把编译出的计划写成文件）——属于测试辅助代码的实现方式；若将来插件公开计划，替换一个辅助函数即可。
  - 示例中的计数器、登出按钮与 React 的 Provider 外探针——应用层实现，随时可改；T10 将探针收敛为隐藏的测试 DOM，不构成用户界面或公开契约。
- **治理基线未修订。** [浏览器矩阵](../../docs/architecture/browser-matrix.md)与 [V1 验收矩阵](../../docs/architecture/v1-acceptance-matrix.md)均未改动；Chrome Android 与桌面端 N-1 未取得，按规格登记为未执行，而不是调整必测范围。

**本模块发现、但刻意没有在这里决定的两件事。** 两者若要推进都会改动已交付包的公开契约，因而各自需要独立的 ADR 与迁移计划，不能作为本模块的顺带产出：

1. **事件表没有"更新已应用"事件**（T5 发现）。确认更新后控制权确实移交，但 `updateWaiting` 没有回到假的路径，示例的更新提示因此一直显示。涉及 contracts 的事件词表、client-runtime 与两个框架绑定。**它不只是界面瑕疵**：T9 评审的阻断项 B1 正是由它引起——恢复 worker 安装后提示已在，等待提示出现的测试因此空等，16 次里失败 4 次。任何以"更新提示出现"为信号的应用逻辑都会遇到同一个问题。
2. **vite-adapter 不公开编译出的计划**（T6 发现）。发布检查需要 `PwaPlan`，目前只能从 worker 注入的预缓存清单与身份中重组，且 `pathRules` 无从完整还原。涉及 vite-adapter 的产物形态（ADR-0015）。

## CI 实跑证据：**未取得**

GitHub 账号在本模块开发期间不可用，因此本模块没有 PR、没有 CI 运行记录，也没有"有意制造失败→报红→撤销→恢复为绿"的对照。

上面的干净 worktree 门禁**不替代 CI 证据**：它证明这份代码在本机的干净环境中通过冻结安装与全部门禁，但没有证明 CI 工作流在 Node 22 与 24 两条矩阵线上、在 runner 预装的 Chrome 上同样通过。`docs/DOCUMENTATION-BASELINE.md` 中本模块一行因此保持 `target`。

账号恢复后本模块待办：推送 `main` 与本分支 → 建立模块 PR → 为 T1–T10 补建 sub-issue 并回填 plan 的 Task List → 取得 CI 红绿证据 → 翻转文档基线行。必测范围中的 Chrome Android 与桌面端 N-1 不随 CI 一并取得，另需设备与项目所有者批准。

## ADR-0026 更正附录（2026-09-20）

本记录第 88、237、273 行附近关于“提示永不消失”或“缺少更新已应用事件”的描述，均是当时的历史证据，不再描述当前契约。项目所有者已接受 [ADR-0026](../../docs/adr/0026-update-applied-page-lifecycle-event.md)：`update-applied` 由曾提示更新的页面在 `controllerchange` 后发出，Vue/React 将 `updateWaiting` 复位。它不表示页面已刷新，也不改变缓存、身份、scope 或 Worker 协议。

本地 Chromium `153.0.8010.50` 的定向回归：Vue/React 各自的更新三项（等待、确认后不刷新且提示消失、两个同 scope 标签页中任一确认后两页提示消失）均通过；恢复路径两侧各三项均通过。删除 `emit("update-applied", {})` 的变异后，两个框架的确认后提示消失与跨标签页场景均按预期失败；还原后回归恢复通过。远端 CI 仍未取得，本附录不改变该结论。

## 修订：示例接入入口恢复（2026-09-23）

规格见[模块规格](../../spec/examples-browser-e2e.md)的同名修订。两个示例在代码层面同时接入 `pwaEntryResilience()`，只重新部署 React 的 `drill` 槽位；Vue 的 `drill` 站未改动，仅作为演练中的备用 Origin。

- **XD2 实现**（`e885a9b`，测试加固 `005f298`）：单元 199 项连续两次通过，既有浏览器场景 47 项无回归。三处变异中两处直接转红；"去掉非 200 短路"最初存活，因 404 测试桩让 `json()` 直接失败，改为返回可解析的 JSON 错误体后转红。
- **上传白名单**（`322fc92`、`5201e2c`）：新增的 `app/pwa-entry.html` 与 `app/entry-manifest.json` 必须在四处执行点登记——构建、发布包、上传目录、从发布包恢复。只有构建脚本登记为必需，其余三处为允许，使接入之前的发布包与暂存目录仍可恢复、可部署。
- **种子清单缺陷**（`0b0a897`）：见 [pwa-entry-resilience 的演练记录](../pwa-entry-resilience/verification.md)。
- **XD3 类生产演练**：React `drill` 部署 `901c061f-6d02-400e-8b92-22f620caf576`，Chrome 153.0.8010.53 与 Chrome for Testing 152.0.7977.82 各 17 项检查全部通过。完整记录见 [pwa-entry-resilience 的验证记录](../pwa-entry-resilience/verification.md)"入口恢复演练记录（类生产环境，2026-09-23）"。
- **生产未受影响**：演练期间两站 `main` 的构建回执 `retention.sourceDeploymentId` 保持为 React `5c17e435-…`、Vue `e05fd502-…`，未发生任何 `main` 或生产写操作。

### 全仓质量门禁（XD4，2026-09-23）

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm -r --no-bail test` | 退出 0；16 个包全部通过，其中 examples-browser-e2e 205、sw-runtime 213、contracts 187、entry-resilience 185 |
| Spec Guard 只读核验 | 与 `main` 相同：6 通过 / 4 失败，4 项均为 main 上已有 |

## 修订：React 示例的 Push 演示（2026-09-24）

规格见[模块规格](../../spec/examples-browser-e2e.md)"修订：React 示例的 Push 演示"。本修订的证据登记在 [push-module 的验证记录](../push-module/verification.md)"修订：真实订阅与真实送达"，这里只记示例一侧：

- React 示例新增 Push 面板（`78281c9`），Vue 示例零改动；两站的 PWA 配置（`identity`、`POLICY`、Vite 插件参数）不变。
- 既有浏览器场景 47 项无回归，断言未改；默认 `test:browser` 的用例清单不变。
- 包内新增测试用发送器、`push:keys`/`push:send` 与联网套件 `test:browser:network`，都不导出；`.push-demo/` 被 git 忽略。

2026-09-25 后续：联网套件的持久化 Chrome 启动支持既有的 `PWA_HARNESS_CHROME_PATH`，未设置时继续使用本机稳定版。原四个真实 FCM 场景在 Chrome for Testing 152.0.7977.82（桌面 N-1）与 Google Chrome 153.0.8010.53 各 4/4 通过；逐项结果、环境与范围限制见 [push-module 的后续验证记录](../push-module/verification.md)。这不覆盖 N-1 人工通知点击或 Android。

## 修订：示例接入离线页、manifest 扩展字段与网络超时（2026-09-24）

规格见[模块规格](../../spec/examples-browser-e2e.md)同名修订节，任务 XC1–XC4 见[计划](plan.md)。分支 `claude/examples-new-capabilities`，基于 `main` 的 `41b3d5e`。环境：Node v24.18.0、pnpm 11.18.0、macOS arm64、Google Chrome 153.0.8010.53、Playwright 1.63.0。

| 提交 | 任务 | 内容 |
|---|---|---|
| `17cfd85`、`1bff50f` | XC1 | 规格修订、Cloudflare 白名单登记、计划（`17cfd85` 漏写 `Task:` 尾注，不改写历史） |
| `4abd8ec` | XC2 | 插件生成离线页、共用策略 5 秒超时、离线与超时场景 |
| `654025c`、`b9e1c28` | XC3 | manifest 扩展字段、四张截图、四个脚本的截图白名单 |
| `9206636` | XC4 | 评审修复：规格措辞、超时场景的导航上限 |

### 已取得的证据

- **离线页与超时**：两站 `/app/offline.html` 由插件生成（`locale: "en"`），未缓存路由断网时显示 "You're offline" 与 `install.name`，不出现应用壳。挂起未缓存路由的导航（`context.route` 不放行）后约 5.4–5.6 秒显示离线页；`--repeat-each 5` 10/10，评审修复后 `--repeat-each 3` 6/6。TDD 红灯：未开启超时时场景挂满 Playwright 30 秒。变异"去掉 `networkTimeoutSeconds`"：两站场景转红，评审修复后在 15 秒处以导航超时失败。
- **manifest**：两站 manifest 带 `description`、`shortcuts`（`short_name` 映射）与 `screenshots`（`form_factor` 映射），与声明一致；构建无 `install.*` 警告；截图可从构建站点取得，PNG 头尺寸与 `sizes` 一致。变异"删除一张截图"：构建以 `verify.manifest-asset-missing` 失败。
- **Cloudflare 白名单**：四个脚本以同一正则 `^app/screenshots/(?:wide|narrow)\.png$` 允许截图、不强制；部署脚本测试证明截图被接受、白名单外的 `app/screenshots/other.png` 仍被拒绝，两例都在读取凭据之前停止。变异"去掉部署脚本的截图规则"：测试转红。评审逐一核对了其余列举站点文件的位置（R2 归档、保留审计、部署索引、制品打包、核验工具的发布路径与响应头检查），它们不做白名单或只过滤 `app/assets/`，截图不会被拒绝或漏掉。
- **全仓门禁**（HEAD `17a00db`）：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm -r --no-bail test` 全部通过；示例浏览器全量 51 项通过；`pnpm audit --prod` 无已知漏洞；`git diff --check` 干净。评审修复只改规格措辞与一个测试的导航上限，修复后该场景单独重跑通过。
- **独立评审**：新上下文评审无阻断项；两项应修（规格把入口恢复文件在构建脚本中的"必须"写成了"允许"、截图方法未记录）已修，其余见下。

### 截图的截取方法

截图是提交进仓库的静态记录，界面变化后按下面的方法重新截取：

1. 由于构建会检查截图文件存在，先在两站 `public/screenshots/` 写入同尺寸的占位 PNG。
2. 用示例的 `vite.config.ts` 构建 v1（不改源码），以 `@pwa-platform/browser-test-harness` 的 `startFixtureServer` 把构建目录作为站点根提供。
3. Playwright `chromium.launch({ channel: "chrome" })`，打开 `/app/`，等 `networkidle`，页面状态为 "v1 / registered / 0"：
   - `wide`：视口 1280x800，`deviceScaleFactor: 1`；
   - `narrow`：视口 375x667，`deviceScaleFactor: 2`，得到 750x1334。
4. 覆盖占位文件，核对 PNG 头尺寸。React 与 Vue 各截各的首页（React 页面含 Push 面板）。

脚本是一次性工具，不入仓库。

### 登记的例外与已知限制

- **既有测试的例外改动**：`apps/shared/cloudflare-plan-capture.test.ts` 的最小构建夹具补了 `icons/192.png` 与两张截图的占位文件。原因是快捷方式图标与截图在构建时检查存在性（ADR-0037），共用 `INSTALL` 改变后该夹具必须提供它们；断言本身未改。
- **构建、打包、恢复三个脚本的截图规则没有测试覆盖**：它们没有既有的测试工具，正则与已测试的部署脚本逐字相同，经评审人工核对。把白名单抽成四个脚本共用的模块、由一处测试覆盖，留作后续。
- **Cloudflare 站点上快捷方式名称仍为通用的 "Open example app"／"Example"**：`installForCloudflare` 只改应用名称，不改快捷方式；仅影响观感，未处理。
- **未重新部署 Cloudflare**：测试站下次部署时带上本修订，届时 `main` 槽位在弱网下的行为改为约 5 秒后回退。

### 未取得的证据

- 真实弱网环境（挂起由 Playwright 路由模拟）；富安装对话框的实际外观（需要真实安装流程）。
- Chrome Android、桌面端 N-1、CI。
