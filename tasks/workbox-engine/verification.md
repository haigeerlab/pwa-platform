# 验证记录：workbox-engine

> 模块质量门禁（#55）的可复现结果。任务事实源仍是 GitHub Issues #6。

## 环境与对象

- 日期：2026-09-16
- 分支：`feat/workbox-engine`，基线 `origin/main` = `732ad40`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64，Google Chrome 152.0.7977.84（本机安装的稳定版）
- 被验证的提交：第一次门禁在 `cb82ad4`（#49–#54）上执行；独立评审之后的修复在 #55 提交中，重新执行的结果见"#55 提交上的重新执行"

## 干净 worktree 门禁（`cb82ad4`）

从 `cb82ad4` 新建独立的 git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0；engine-workbox 依次检查构建期、运行期（`WebWorker` lib）与浏览器自测三个 tsconfig |
| `pnpm test` | 退出 0；contracts 138 条、harness 61 条、core 94 条、engine-workbox 34 条，全部通过 |
| `pnpm test:browser` | 退出 0；harness 浏览器自测 22 个、engine-workbox 浏览器自测 6 个全部通过，日志打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动（忽略的构建与测试输出除外），随后删除。

## #55 提交上的重新执行

从 `a37c722`（#55，包含独立评审后的全部修复）新建独立 worktree，执行结果：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test` | 退出 0；contracts 138 条、harness 61 条、core 94 条、engine-workbox 37 条，全部通过 |
| `pnpm test:browser` | 退出 0；harness 浏览器自测 22 个、engine-workbox 浏览器自测 6 个全部通过，日志打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动，随后删除。spec-guard 产物校验 15 项通过、0 警告、0 失败，本分支 7 条提交带 closing keyword（#49–#55）。此后的提交是 CI 报红用的临时失败提交、它的撤销，以及验证记录与文档基线。

## 依赖与供应链

| 任务 | lockfile 变化 | 核对 |
|---|---|---|
| #49 | 新增 `workbox-core`、`workbox-precaching`、`workbox-routing`、`workbox-strategies`，均为 `7.4.1` | 均来自 registry，没有安装脚本，也没有 `bin`；`workbox-precaching` 依赖另外三个，`workbox-routing` 与 `workbox-strategies` 只依赖 `workbox-core`；冻结安装通过 |
| #52 | `packages/engine-workbox` 新增开发依赖 `@playwright/test@1.63.0`、`@pwa-platform/browser-test-harness`（`workspace:*`）、`@types/node@24.13.4`、`vite@8.3.0` | 只新增这 4 条导入记录，没有新增包：它们在 lockfile 中已有同版本条目（vite 原由 vitest 引入） |

- 运行时依赖只有 `@pwa-platform/contracts`、`workbox-core@7.4.1` 与 `workbox-precaching@7.4.1`，由 `test/package-boundaries.test.ts` 断言。
- 没有引入 `workbox-build`：它的传递依赖 `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1` 被 `trustPolicy: no-downgrade` 拒绝（规格"依赖"一节）。
- `pnpm-workspace.yaml` 与 `.github/` 在本分支上没有改动，没有登记任何供应链豁免。

## 独立评审

由一个全新上下文的只读评审代理审阅了 `main...feat/workbox-engine`（`cb82ad4`，#49–#54）。它运行了单元测试、typecheck 与 eslint，只在自己的临时目录中复现问题，主工作区没有改动。结论：没有阻断项，4 项应修，8 项可选。4 项应修都已逐条对照代码核实为真实问题。

**应修（均已处理）：**

| # | 问题 | 处理 |
|---|---|---|
| 1 | 构建期与运行期的校验不一致：contracts 的 `validatePlan` 接受空 `revision` 与重复的预缓存 URL（已实测 `ok: true`），这样的计划能注入成功，而 worker 启动时 `createPrecacheEngine` 抛错，每个客户端安装都会失败 | 项目所有者决定由引擎在注入时补充校验：`injectPrecacheManifest` 在 `validatePlan` 之后检查 `revision` 为 `null` 或非空字符串、URL 不重复，否则构建期抛错，错误信息只给出条目路径；contracts 不改动；规格公开契约与测试策略同步；新增单元测试 |
| 2 | 端口的条目 URL 只检查以 `/` 开头、不以 `//` 开头：`/\evil.example/a.js`、`/<制表符>/evil.example/a.js`、`/<换行>/evil.example/a.js` 都能通过，解析结果是 `http://evil.example/a.js`（已实测） | 项目所有者决定采用与 contracts `PwaPlan.precache` 相同的规范路径规则：不含 `//`、反斜杠，可解析，且解析后的 `pathname` 与原文逐字一致，因此查询串、片段、点段与控制字符都被拒绝；重复检测改为按字符串比较；新增上述写法与百分号编码的单元测试 |
| 3 | 依赖边界测试用正则提取导入，要求双引号、行首与结尾分号，单引号、无分号或缩进的写法会让检查空跑；自检用例另写了一份谓词副本，没有 worker 侧反例 | 改用 TypeScript 的 `preProcessFile` 提取导入、再导出、动态导入与 `require`，Workbox 绑定按语法树读取并包括再导出；两个谓词提为共享常量，自检直接使用它们，探针覆盖单引号、无分号、缩进、类型导入、再导出与副作用导入 |
| 4 | 规格要求注入测试覆盖 U+2028 等特殊字符，但测试只有百分号编码与 `"</script>\`（#50 的汇报称已覆盖，实际没有）；规格写"先注入、后打包"，而浏览器自测是先打包、后注入 | revision 加入 U+2028 与 U+2029，断言注入结果含原字符且求值后相等；项目所有者决定规格与 ADR-0011 都写明注入发生在打包之后、注入点必须在打包产物中原样保留，global-setup 的注释改为引用 ADR-0011 |

**可选：**

| # | 问题 | 处理 |
|---|---|---|
| 1 | "不接管客户端"的断言在 activate 完成前就执行，晚到的 `clients.claim()` 会被漏掉 | 先等待 active worker 进入 `activated`，再等 500 ms 后检查页面没有 controller |
| 2 | 没有断言 `install`/`activate` 在事件派发期间同步调用 `waitUntil` | 新增 install 单元测试（下载在单元测试中必然失败，只断言同步调用），activate 用例在 await 之前断言 |
| 3 | `engine.match` reject 时测试 worker 不回复，页面等到 30 秒超时，报错不直观 | worker 回复 `{ error }`，probe 收到后抛出带原始错误的异常 |
| 4 | "其他缓存保持不变"只比较名称与条目数 | 另外比较这些缓存的请求 URL 列表 |
| 5 | 三个返回值的 URL 形态不同，注释容易让 sw-runtime 误比较 | 类型注释与规格端口表写明：`urls()` 是原样的路径，`install` 是不含 `__WB_REVISION__` 的绝对 URL，`activate` 是缓存键 |
| 6 | 无法解析的 URL（如 `http://[bad`）让 `match` 抛 `TypeError` | 先用 `URL.canParse` 判断，返回 `undefined`；单元测试覆盖 |
| 7 | 注入点按子串计数，`myself.__WB_MANIFEST` 也会被当作注入点，替换后语法损坏 | 保留：规格明确规定按字面计数（注释也计入），损坏会以语法错误暴露；写入已知限制 |
| 8 | 文档基线称变异检查已在本地通过，但证据文件尚未提交 | 本验证记录随 #55 提交，基线状态在 CI 证据取得后再改为 verified |

评审确认无问题的点：`install`/`activate` 在第一个 `await` 之前同步调用 `waitUntil`，404 会让安装失败；Workbox 7.4.1 `activate` 返回值的处理与 ADR-0011 一致；`PrecacheController` 原样使用传入的缓存名，activate 只打开该缓存；`match` 先查精确的缓存键表、找不到时不读缓存，查询串变体、`/`、`index.html` 与跨源 URL 都不命中；注入输出是合法的 JavaScript 表达式、键顺序固定、用 `slice` 拼接避开 `$&` 陷阱、错误信息不回显输入；引擎源码没有规格"禁止"清单中的任何 API，公开类型不含 Workbox；浏览器自测的断言足够严格，探针读取状态的时序正确；lockfile 只新增 4 个 Workbox 包；ADR-0003、ADR-0011、包边界与 README 与代码一致。

## 变异检查

每项都是修改一处实现后运行对应测试，确认失败，再恢复并确认源码逐字节一致。

| 任务 | 变异 | 失败的测试 |
|---|---|---|
| #49 | 构建期入口导入 `node:fs/promises` | `keeps the build-time entry on contracts only, without Workbox, Node modules or worker sources` |
| #50 | 注入点只要求至少出现一次 | `fails unless the injection point occurs exactly once, counting comments` |
| #50 | 反转清单顺序 | `replaces the injection point with the plan's precache entries in plan order`、`produces a manifest equal to plan.precache, keeping null revisions`、`keeps special characters safe for JavaScript and equal after evaluation` |
| #50 | 跳过计划校验 | `rejects an invalid plan with diagnostic codes and paths but without echoing its values` |
| #51 | 不检查 `cacheName` 的 `:precache` 后缀 | `requires a contracts precache cache name` |
| #51 | 允许重复 URL | `rejects duplicate URLs, including different spellings of the same path`（#55 起改名为 `rejects duplicate URLs`） |
| #51 | `match` 读所有缓存，而不是只读 `cacheName` | `reads a revisioned entry from its own precache under Workbox's revision cache key`、`uses the plain URL as the key of a fingerprinted entry and ignores fragments` |
| #51 | 解析 URL 时保留片段 | `resolves against the base, drops the fragment and keeps the query`、`uses the plain URL as the key of a fingerprinted entry and ignores fragments` |
| #52 | `match` 不查清单，直接用解析后的 URL 读 `cacheName` | 浏览器自测 `serves every manifest entry from the precache while offline…`（带 revision 的条目取不到）与 `returns undefined for URLs outside the manifest…`（`/planted.txt` 被读出） |
| #52 | install 跳过清单的第一条 | 浏览器自测 `stores exactly the manifest entries…` 与离线读取（`/assets/app.3f9a2c7d.js` 取不到） |
| #52 | 打包时去掉 `process.env.NODE_ENV` 的定义 | globalSetup 报错 `The bundled test worker is not self-contained: a process.env reference`，测试不运行 |
| #53 | activate 之后删除其他缓存 | 浏览器自测 `after the new version takes over, removes only entries dropped from the manifest and keeps other caches intact` |
| #53 | 端口注册 fetch 监听并用网络响应 | 浏览器自测 `the engine neither intercepts requests, claims clients nor skips waiting` |
| #53 | 端口在 install 中调用 `skipWaiting` | 上述两个 #53 浏览器自测 |
| #53 | activate 不调用 Workbox 清理，返回空结果 | 浏览器自测 `after the new version takes over, …` |
| #55 | 注入时不检查空 revision | `rejects precache entries that contracts accept but the worker engine would reject, without echoing them` |
| #55 | 注入时不检查重复 URL | 同上 |
| #55 | 端口不比较解析后的 `pathname` 与原文 | `rejects paths that are not canonical, including spellings the URL parser resolves to another origin` |
| #55 | `match` 不先判断 URL 能否解析 | `returns undefined without reading any cache for URLs outside the manifest or that cannot be parsed` |
| #55 | 边界测试改回按正则提取导入 | `detects forbidden imports however they are written, so the boundary checks are not vacuous` |
| #55 | 注入结果中去掉 U+2028 | `keeps special characters safe for JavaScript and equal after evaluation` |
| #55 | 端口在 activate 之后调用 `clients.claim()` | 浏览器自测 `the engine neither intercepts requests, claims clients nor skips waiting` |

#51 中有一项变异没有让测试失败：`match` 原先先用一个清单 URL 集合判断成员关系，去掉这层判断后单元测试全部通过。原因是 Workbox 的缓存键表本来就按精确 URL 查找，这层判断是多余的。处理方式是删掉这个集合，由 `getCacheKeyForURL` 保证精确匹配，并在代码注释中说明；同时换上上表中"读所有缓存"与"保留片段"两项变异。精确匹配在 #52 的浏览器自测中由"`match` 不查清单"变异再次验证。

#55 的"去掉 U+2028"变异前两次写错了：第一次多了一个右括号，第二次把行分隔符原样写进了正则。两次的变异代码都无法编译，测试失败是因为文件加载失败，而不是断言发现了问题，因此不计入。第三次改为 `split(String.fromCharCode(8232)).join("?")`，先确认 tsc 通过，再确认上表中的断言失败。

## Workbox 7.4.1 的类型与实际返回值不一致

`workbox-precaching@7.4.1` 的 `_types.d.ts` 把 `PrecacheController.activate()` 的结果声明为 `{ deletedCacheRequests: string[] }`，而源码与 `build/` 下的开发、生产产物实际返回 `{ deletedURLs }`。#51 按类型读取，TypeScript 检查与当时的单元测试都没有发现；#53 新增的单元测试与浏览器自测都复现为 `TypeError: deletedCacheRequests is not iterable`（Workbox 已把自己的 promise 交给 `waitUntil`，所以缓存清理照常完成，只是端口的返回值 reject）。

修复：引擎读取实际返回的 `deletedURLs`，字段缺失或不是字符串数组时抛错。记录在 ADR-0011 的"影响"中，升级 Workbox 时需要重新核对。

## 稳定性

- **#52**：`pnpm exec playwright test` 连续 5 次，每次 4 个全部通过（20/20）。
- **#53**：连续 5 次，每次 6 个全部通过（30/30），整套约 7 秒。
- **#55 评审修复后**：连续 3 次，每次 6 个全部通过（18/18）；单元测试 37 条通过。
- 引擎浏览器自测沿用 harness 的 `workers: 1` 串行运行。

## 打包产物核对（#52）

vite 8.3.0 以 lib 模式输出单个 IIFE（`browser-build/bundle/precache-worker.js`，约 52 KB，不压缩）：

- 没有 `import`/`export` 语句、动态 `import()`、`require()` 或 `process.env`；
- `NODE_ENV` 定义为 `"production"` 后，Workbox 的开发日志代码（`logger`、`__WB_DISABLE_DEV_LOGS`）被移除；
- `self.__WB_MANIFEST` 恰好出现一次，Workbox 自身源码中没有这个字符串；
- 注入后的 worker 中清单与 fixture 计划逐条一致。

每次运行时，globalSetup 自动重复其中两项：产物中没有模块语法、`require` 与 `process.env`（`assertSelfContained`），注入点恰好出现一次（`injectPrecacheManifest`），不满足即失败。开发日志是否被移除只在 #52 中人工核对过。

## 项目所有者确认

- **规格**：引擎把 `PwaPlan.precache` 按 Workbox InjectManifest 格式注入，不使用 `workbox-build`，新增 ADR-0011 修订 ADR-0003；端口只做预缓存；浏览器自测复用 lockfile 中已有的 vite 8.3.0 打包测试 worker。
- **检查点"交付前"**（2026-09-16）：确认 ADR-0011 与 ADR-0003 状态行的写法。

## 与 spec、ADR 和能力图的边界核对

- 没有实现平台 worker、请求路由、离线降级、更新提示、恢复 worker 或跨缓存清理；`browser-tests/worker/` 中的 worker 只是驱动端口的替身。
- 能力图 `workbox-engine`：封装 Workbox InjectManifest 并实现引擎端口，不暴露原始 Workbox 配置，只依赖 contracts-foundation。一致；发布的 `dist/worker/*.d.ts` 中没有 Workbox 类型。
- ADR-0002、ADR-0007：清单只来自编译后的计划，引擎不推导清单与优先级。一致。
- 没有修改 GitHub 仓库设置与 CI 工作流；CI 的 browser job 递归运行 `pnpm test:browser`，引擎自测随之运行。

## CI 实跑证据

项目所有者授权推送后，在模块 PR [#56](https://github.com/haigeer-labs/pwa-platform/pull/56) 上取得以下运行（均为 `pull_request` 事件）：

| 提交 | 目的 | 运行 | 结论 |
|---|---|---|---|
| `d853223` | 模块全部提交（#49–#55 与验证记录） | [34997016166](https://github.com/haigeer-labs/pwa-platform/actions/runs/34997016166) | 成功：Quality (Node 22)、Quality (Node 24)、Browser (Google Chrome stable, Node 24) 全部通过 |
| `deef583` | 临时把引擎浏览器自测 `stores exactly the manifest entries…` 中缓存名的期望改为 `"deliberately-wrong"` | [34997211702](https://github.com/haigeer-labs/pwa-platform/actions/runs/34997211702) | 失败：browser job 在 Browser tests 步骤报红，engine 1 个失败（期望 `"deliberately-wrong"`，实际 `"pwa:engine-fixture:staging:b1:precache"`）、5 个通过，harness 22 个通过；Quality (Node 22) 与 Quality (Node 24) 均通过 |
| `e835425` | 撤销 `deef583`；撤销后整棵树与 `d853223` 逐字节一致 | [34997445980](https://github.com/haigeer-labs/pwa-platform/actions/runs/34997445980) | 成功：三个 job 全部恢复为绿 |

三次运行的日志一致显示：

- **Node 版本**：quality job 为 Node 22.23.2 与 24.21.0，browser job 为 Node 24.21.0。
- **冻结安装**：三个 job 都输出"Lockfile passes supply-chain policies (164 entries …)"。
- **单元测试**：两个 quality job 中 contracts 138 条（类型测试无错误）、harness 61 条、core 94 条、engine-workbox 37 条全部通过；依赖审计报告"No known vulnerabilities found"。
- **浏览器**：`google-chrome --version` 为 Google Chrome 152.0.7977.82，两个包的日志都打印 `[browser-test-harness] chromium 152.0.7977.82 (configured channel)`；成功的运行中 harness 浏览器自测 22 个、engine-workbox 浏览器自测 6 个全部通过。本机验证使用的是 152.0.7977.84，CI runner 预装的是 .82。

至此 browser job 对引擎浏览器自测的报红与恢复为绿证据齐全，均在合并前取得。

## 已知限制（移交后续模块）

- **清单与构建产物的一致性**：计划中的预缓存条目是否存在于构建产物中，引擎不检查；由 build-verifier 与 vite-adapter 在各自规格中决定（ADR-0011）。
- **平台 worker 必须打包**：Workbox 使用裸模块导入并读取 `process.env.NODE_ENV`；非 production 构建是否允许，由 vite-adapter 决定（规格开放问题）。
- **`cacheName` 的来源**：sw-runtime 如何在运行期取得 `cacheName` 与其余计划字段，由 sw-runtime 规格决定。
- **离线断言的依据**：`context.setOffline` 是否作用于 service worker 的网络请求没有单独验证；"不访问网络"的结论依据 fixture 服务器的请求记录为空。
- **activate 的防御分支没有测试**：Workbox 返回值缺少 `deletedURLs` 时抛错的分支，在固定的 7.4.1 上无法触发。
- **测试 worker 的探针状态保存在内存中**：Chrome 停止空闲 worker 后会丢失；测试在事件发生后数秒内读取，重复运行中没有出现。
- **Chrome Android**：沿用 harness 的限制，本模块没有运行方式。
- **注入点按字面子串计数**：`myself.__WB_MANIFEST` 或 `self.__WB_MANIFESTS` 也会被当作注入点，替换后产物语法损坏。规格明确按字面计数（注释也计入），损坏会以语法错误暴露，因此保留。
