# 验证记录：sw-runtime

> 模块质量门禁（#66）的可复现结果。任务事实源仍是 GitHub Issues #3。

## 环境与对象

- 日期：2026-09-16
- 分支：`feat/sw-runtime`，基线 `origin/main` = `b3b69d5`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64，Google Chrome 152.0.7977.84（本机安装的稳定版）
- 被验证的提交：第一次门禁在 `d3df6ad`（#57–#65）上执行；独立评审之后的修复在 `88b9a0b`（#66）中，重新执行的结果见"#66 提交上的重新执行"

## 干净 worktree 门禁（`d3df6ad`）

从 `d3df6ad` 新建独立的 git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0；sw-runtime 依次检查构建期、运行期（`WebWorker` lib）与浏览器自测三个 tsconfig |
| `pnpm test` | 退出 0；contracts 138 条、harness 61 条、core 94 条、engine-workbox 37 条、sw-runtime 87 条，全部通过 |
| `pnpm test:browser` | 退出 0；harness 22 个、engine-workbox 6 个、sw-runtime 13 个全部通过，日志打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动（忽略的构建与测试输出除外），随后删除。

## #66 提交上的重新执行

从 `88b9a0b`（#66，包含独立评审后的全部修复）新建独立 worktree，执行结果：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test` | 退出 0；contracts 138 条、harness 61 条、core 94 条、engine-workbox 37 条、sw-runtime 87 条，全部通过 |
| `pnpm test:browser` | 退出 0；harness 22 个、engine-workbox 6 个、sw-runtime 13 个全部通过，三个包的日志都打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动，随后删除。spec-guard 产物校验 15 项通过、0 警告、0 失败，本分支 10 条提交带 closing keyword（#57–#66）。

评审修复处另做两项变异检查，确认断言没有因修复而变弱：

| 变异 | 失败的测试 |
|---|---|
| 平台 worker 在 `activate` 后调用 `clients.claim()` | 浏览器自测 `does not claim the clients that registered it`（该用例刚去掉固定等待，仍然抓住） |
| `activate` 不调用引擎清理 | 单元测试 `hands install and activate to the engine without…` |

改动后源码逐字节还原，还原后单元测试 87 条、浏览器自测 13 个全部通过；浏览器自测另重复运行 2 次，均为 13/13。

## 依赖与供应链

| 任务 | lockfile 变化 | 核对 |
|---|---|---|
| #57 | `packages/sw-runtime` 新增运行时依赖 `@pwa-platform/contracts`、`@pwa-platform/engine-workbox`（均 `workspace:*`） | 只新增工作区链接，没有新增包 |
| #59 | 新增开发依赖 `@pwa-platform/core`（`workspace:*`） | 只用于路径匹配的一致性测试，不出现在任何运行期入口的导入中 |
| #62 | 新增开发依赖 `@playwright/test@1.63.0`、`@pwa-platform/browser-test-harness`（`workspace:*`）、`@types/node@24.13.4`、`vite@8.3.0` | 四项都是 lockfile 中已有的版本，只新增导入记录 |

- 整个分支没有给 lockfile 新增任何第三方包条目，`pnpm-workspace.yaml` 与 `.github/` 都没有改动，没有登记任何供应链豁免。
- 运行时依赖只有 contracts 与 engine-workbox，由 `test/package-boundaries.test.ts` 按导入闭包断言。

## 独立评审

由一个全新上下文的只读评审代理审阅了 `main...feat/sw-runtime`（`d3df6ad`，#57–#65）。它运行了单元测试与三份 tsconfig 的类型检查，按要求没有在主工作区运行浏览器自测，临时探针写在自己的目录中，仓库没有改动。结论：**没有阻断项**，3 项应修（都是文档与交付物一致性），7 项可选。每一项都已对照代码核实属实，无误报。

**应修（均已处理）：**

| # | 问题 | 处理 |
|---|---|---|
| 1 | 文档基线中新增的 sw-runtime 行前后各有一个空行，GFM 表格遇空行即结束，该行会被渲染成普通文本 | 删除两处空行，使其紧接 workbox-engine 行；并补上指向本记录的链接（另两行原本就有） |
| 2 | 本验证记录尚未被 git 跟踪，按当时的分支开 PR，评审者看不到演练记录与门禁结果 | 随 #66 提交纳入交付 |
| 3 | 规格判断表第 4 行写"命中缓存才返回，否则不接手"，而 ADR-0012 与实现是"清单内但缓存缺失时回退网络"；两者可区分（回退网络时 `fromServiceWorker` 为真） | 项目所有者决定改规格与 ADR 对齐：命中返回缓存，清单内缓存缺失回退网络，不在清单内不接手 |

**可选（7 项，均已处理）：**

| # | 问题 | 处理 |
|---|---|---|
| 4 | `activate` 的 `.catch(() => undefined)` 吞掉了引擎刻意设计的"大声失败"守卫（Workbox 改字段名时的诊断信号） | 去掉无差别捕获，让该拒绝浮现；`install` 的写法本就正确，保持不变 |
| 5 | `decide.test.ts` 的注释与断言相反，且用例中没有 fragment | 改为说明"路径规则按解码键匹配，清单成员判断是精确字符串" |
| 6 | 实现有第六档 `unparsable`（URL 无法解析时不接手），规格与 ADR 都没写 | 项目所有者决定在规格判断表补一行 |
| 7 | `requestBaselineDenials` 与 `scope` 校验了但运行期从不读；基线列表与 contracts 的强耦合没有文档 | 在共享配置的类型上注明两者只作审计用途，并说明该耦合是有意的 fail-closed；已知限制补一条 |
| 8 | `precache.spec.ts` 用固定 500 ms 等待证明否定命题 | 去掉固定等待：激活完成即意味着 `activate` 中的 `clients.claim()` 已生效，无需等待 |
| 9 | 计划声称注入测试覆盖 U+2028，实际只有百分号编码形式 | 补一条断言：原始 U+2028 与 U+2029 都被规范路径校验拒绝，永远进不了注入产物 |
| 10 | fixture 身份的 `origin` 与随机端口的服务器不符 | 加注释说明运行期不读 `identity.origin`，worker 从 `scope.location` 取自身 origin |

评审核实无问题的点（摘要）：拒绝、未分类、跨源与非 GET 请求在到达任何缓存分支前就返回"不接手"，且写缓存的路径只有 Workbox 的 `PrecacheController.install` 一条（引擎从不调用 `precache()`，因此不会注册额外监听或路由）；离线导航候选表恰好三项并经清单过滤，`no-fallback` 变体中降级页仍在预缓存里，因而是有效对照；恢复前缀正则拒绝截断值，contracts 对各段转义使 `startsWith` 不会误伤前缀重叠的其他应用；更新消息的形状检查读取 `Reflect.ownKeys` 与属性描述符、不触发访问器，来源检查排除了非 window 客户端与跨源；路径解码与 core 逐字符一致，实测 `%2F`、`%252F`、`%ED%A0%80`、兄弟段与尾斜杠均与编译器一致，且 `%ED%A0%80` 解码后不与哨兵碰撞；注入序列化的是校验后的副本、键序固定、用 `slice` 拼接避开替换模式；两个注入点互不包含，重复注入会被计数为 2 次而失败；浏览器自测的接管证据用的是"注册前打开、始终未受控的页面"，`waitForControllerChange` 还校验新 controller 就是注册的 active worker。

## 变异检查

每项都是修改一处实现后运行对应测试，确认失败，再恢复并确认源码逐字节一致。共 34 项。

| 任务 | 变异 | 失败的测试 |
|---|---|---|
| #57 | `isSkipWaitingMessage` 接受多余字段 | `rejects every other value` |
| #57 | 恢复 worker 入口导入 `workbox-core` | `./recovery-worker-entry` 的闭包检查 |
| #57 | 恢复 worker 相对导入平台 worker 源码 | `./recovery-worker` 的闭包检查 |
| #58 | 跳过计划校验 | `are rejected by both functions…` |
| #58 | 注入点只要求至少出现一次 | `fails unless the injection point occurs exactly once` |
| #58 | 共享校验不检查 `updateMode` | 共享校验与注入两处用例 |
| #58 | 恢复前缀只要求以 `pwa:` 开头 | 前缀结构与注入两处用例 |
| #58 | 拒绝基线不查顺序 | `requires the complete baseline denials in canonical order` |
| #58 | 注入调用方传入的对象而非校验后的副本 | `is deterministic and independent of the config's key order` |
| #58 | 规范路径不比较解析后的 `pathname` | scope、路径规则、特殊字符三处用例 |
| #59 | `%2F` 当作分隔符解码 | `%2F` 用例、编码斜杠用例、一致性测试 |
| #59 | 前缀按字符串开头比较 | 整段匹配用例、未分类用例（`/appendix` 会命中 `/app`） |
| #59 | 取最后一条匹配 | 顺序用例、查询串用例、两份一致性测试 |
| #59 | 不去掉查询串与片段 | `ignores the query and the fragment` |
| #59 | 规则前缀不解码 | 顺序用例、查询串用例、一致性测试 |
| #60 | 拒绝规则的请求也继续处理 | 判断表用例与 fetch 不接手用例 |
| #60 | 导航在网络返回 404 时改用降级页 | `answers navigations from the network, whatever it responds` |
| #60 | 所有导航都回退到应用壳 | 6 条导航相关用例 |
| #60 | 不检查消息来源 | `ignores every other message and source` |
| #60 | activate 后调用 `clients.claim` | `hands install and activate to the engine without…` |
| #60 | 清单成员判断忽略查询串 | `passes through allowed requests the plan does not precache` |
| #60 | 非导航请求未命中清单也接手 | 3 条用例 |
| #61 | 恢复 worker 注册 `fetch` 监听 | 监听清单用例、入口脚本用例 |
| #61 | 按 `pwa:<appId>` 删除（不含结尾冒号） | 删除集合用例、调用顺序用例 |
| #61 | 先 `claim` 再删除 | 调用顺序用例 |
| #61 | 跳过恢复配置校验 | 先校验再注册用例 |
| #61 | `install` 不调用 `skipWaiting` | install 用例 |
| #62 | 注入配置时换用另一个应用的缓存名 | 浏览器自测 `precaches exactly the plan's entries` |
| #62 | 非导航请求一律不查预缓存 | 浏览器自测 `are served from the precache without reaching the server` |
| #63 | 离线导航对任意路由都回退到应用壳 | 浏览器自测：未缓存路由用例、降级页关闭用例 |
| #63 | 拒绝规则的导航也使用降级页 | 浏览器自测 `never answers a denied or unclassified navigation from a cache` |
| #64 | 平台 worker 安装后自行跳过等待 | 浏览器自测：更新用例与恢复演练用例 |
| #64 | 恢复 worker 删除所有缓存 | 浏览器自测：演练用例报出越界删除的缓存名 |
| #64 | 恢复 worker 不接管客户端 | 浏览器自测：未受控页面等待 controller 超时（见下） |

**一项变异最初存活，已修正断言：** #64 的"恢复 worker 不调用 `clients.claim()`"第一次没有让任何用例失败。原因是 `waitForControllerChange` 不足以证明接管：恢复 worker 用 `skipWaiting` 取代了正在控制页面的旧 worker，浏览器本来就会切换该页面的 controller。修正方式是在注册任何 worker **之前**先打开一个页面，它始终未受控（这同时证明平台 worker 不接管客户端），恢复 worker 激活后它必须变为受控。改完重做同一变异，等待 controller 超时失败，被抓到。

## 恢复演练记录

按[恢复演练](../../docs/operations/recovery-drill.md)执行，由 `browser-tests/lifecycle.spec.ts` 的"recovery drill"用例自动完成步骤 1 到 4。

- **环境**：Chrome 桌面端 152.0.7977.84（必测档 N），Darwin arm64，2026-09-16。
- **身份**：fixture 应用 `swfixture`，环境 `production`，`cacheNamespaceSeed` = `r1`；缓存名由 contracts 的 `appCachePrefix` 与 `cacheName` 计算，未手写。

**步骤 1：安装当前 worker 并填充缓存**

| 缓存 | 条目数 | 预期 |
|---|---|---|
| `pwa:swfixture:production:r1:precache` | 4 | 删除（当前 revision） |
| `pwa:swfixture:production:r0:precache` | 2 | 删除（同应用、同环境的旧 revision） |
| `pwa:swfixture:staging:r1:precache` | 1 | 保留（其他环境） |
| `pwa:swfixture-eu:production:r1:precache` | 1 | 保留（`appId` 以当前 `appId` 开头的其他应用） |
| `images-v1` | 3 | 保留（非平台缓存） |

**步骤 2：在同一 `serviceWorkerUrl` 发布恢复 worker** —— 恢复 worker 立即激活，页面未被重新加载（页面上的标记变量仍在）。

**步骤 3：验证恢复行为**

| 检查 | 结果 |
|---|---|
| 接管客户端 | 通过：一个在任何 worker 注册之前打开、此前始终未受控的页面，在恢复 worker 激活后变为受控 |
| 不拦截 fetch（在线） | 通过：请求 `/app/assets/logo.svg` 未经 worker 处理（`fromServiceWorker` 为假），fixture 服务器确实收到该请求 |
| 不拦截 fetch（断网） | 通过：请求此前已预缓存的同一资源得到网络错误，而不是缓存响应 |
| 不拦截 fetch（单元测试） | 通过：`test/worker/recovery-worker.test.ts` 断言恢复 worker 只注册 `install` 与 `activate`，没有 `fetch` 监听 |
| 只删除当前应用前缀下的缓存 | 通过：删除后为 `pwa:swfixture:staging:r1:precache=1`、`pwa:swfixture-eu:production:r1:precache=1`、`images-v1=3`；删除集合恰好是以 `pwa:swfixture:production:` 开头的两个缓存，其余名称与条目数不变 |

**步骤 4：部署修复后的 worker** —— 修复后的 worker 按正常更新流程安装并等待，页面确认后接管；预缓存重新填充为计划的 4 条；断网重开应用壳正常渲染。

**结论**：必测范围内的 Chrome 桌面端 N 全部通过，删除集合与保留集合与预期完全一致。未执行项见"已知限制"。

## 稳定性

| 任务 | 重复运行 |
|---|---|
| #62 | 浏览器自测连续 3 次，每次 5 个全部通过 |
| #63 | 连续 3 次，每次 11 个全部通过 |
| #64 | 连续 3 次，每次 13 个全部通过 |

- 浏览器自测沿用 harness 的 `workers: 1` 串行运行，整套约 11 秒。
- 单元测试 87 条（10 个测试文件）。

## 打包产物核对（#62）

vite 8.3.0 以 lib 模式分别输出两个 IIFE：

| 产物 | 大小 | 核对 |
|---|---|---|
| 平台 worker（注入后） | 64.4 KB | 无模块语法、`require`、`process.env`；两个注入点都已被替换；注入的清单 4 条，指纹文件 revision 为 `null` |
| 恢复 worker（注入后） | 2.7 KB | 同上；整份产物中 `workbox` 出现 **0 次**，证明恢复产物不含 Workbox |

globalSetup 每次运行都重复前一项检查（模块语法、`require`、`process.env`），不满足即失败。

## 与 spec、ADR 和能力图的边界核对

- 能力图 `sw-runtime`：基于编译计划与引擎端口执行安装、激活、预缓存、离线降级、受控清理与恢复 worker 产物；运行时缓存留待后续能力。一致：路径规则中的缓存策略动作本模块不执行，不写任何运行时缓存。
- ADR-0005：默认提示更新，维护只清理平台缓存、不拦截请求的恢复 worker。一致。
- ADR-0007：运行时只消费编译后的计划，不重新实现优先级。一致：配置字段全部取自已校验计划，路径规则按计划顺序取第一条匹配。
- ADR-0011：清单在打包后注入，注入点原样保留。一致：配置注入沿用同一规则，两个注入点互不包含。
- ADR-0012：记录本模块的六项决定。
- 没有实现注册、更新提示界面、生命周期事件传输、登出清理（归 client-runtime），也没有打包与产物写出（归 vite-adapter）。
- 没有修改 contracts、core 或 workbox-engine 的公开契约；没有修改 GitHub 仓库设置与 CI 工作流。

## CI 实跑证据

分支 `feat/sw-runtime`、PR #67。工作流 `.github/workflows/ci.yml` 未修改，三个 job 全部由 `pull_request` 事件触发。

| 提交 | run | 结论 | 三个 job |
|---|---|---|---|
| `8e69769`（模块完成状态） | [35050422021](https://github.com/haigeer-labs/pwa-platform/actions/runs/35050422021) | success | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser (Google Chrome stable, Node 24) ✅ |
| `4bd32ba`（有意制造的回归） | [35050754977](https://github.com/haigeer-labs/pwa-platform/actions/runs/35050754977) | failure | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser **❌** |
| `018663f`（撤销回归） | [35050876229](https://github.com/haigeer-labs/pwa-platform/actions/runs/35050876229) | success | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser (Google Chrome stable, Node 24) ✅ |

版本：Node 22.23.2 与 Node 24.21.0；browser job 使用 runner 预装的 Google Chrome 152.0.7977.82（Playwright 以 `channel: "chrome"` 连接同一版本，日志中记为 `chromium 152.0.7977.82 (configured channel)`）。本机门禁用的是 Chrome 152.0.7977.84，与 CI 相差一个补丁号。

首次运行（`8e69769`）的实跑数量与本地一致：contracts 138、browser-test-harness 61、core 94、engine-workbox 37、sw-runtime 87 个单元测试在 Node 22 与 Node 24 上各通过一次；browser job 中 browser-test-harness 22、engine-workbox 6、sw-runtime 13 个浏览器测试通过。

**报红证据。** 临时提交 `4bd32ba` 只改一行：`src/entries/platform-worker-entry.ts` 把注入的清单换成 `self.__WB_MANIFEST.slice(1)`，让引擎少收到第一条预缓存条目。选它是因为入口脚本不被任何单元测试或边界测试覆盖，因此这次报红精确证明 browser job 是独立于 Quality job 的门禁：两个 Quality job（lint、build、typecheck、全部单元测试）照常通过，只有真实 Chrome 抓到了行为回归。sw-runtime 的浏览器测试 4 failed / 9 passed：

- `precache.spec.ts:17` 首次在线访问的预缓存内容比对失败；
- `precache.spec.ts:48` 预缓存资源改为走网络；
- `lifecycle.spec.ts:40` 更新发现后剩余缓存键 `Expected length: 7 / Received length: 5`；
- `lifecycle.spec.ts:66` 恢复演练的前置断言失败。

撤销提交 `018663f` 是 `git revert`，与 `8e69769` 的树完全一致（`git diff --stat 8e69769 018663f` 为空），CI 三个 job 恢复为绿。

## 修订门禁：Range 请求（R4，2026-09-19）

**基线与范围。** 在干净的 `fix/sw-runtime-range-passthrough` worktree（R3 为 `ef8eb48`）执行。本修订只改变平台 worker 判断表：本会由预缓存回答的非导航请求带有 `Range` 时不接手；`PwaPlan`、`requestBaselineDenials`、`planVersion` 与 worker 配置格式均未改变。

| 门禁 | 命令与结果 |
|---|---|
| 全仓库测试 | `pnpm test` 通过（13 个 workspace 包）；sw-runtime 为 11 个测试文件、104 项测试。 |
| 全仓库构建 | `pnpm build` 通过（13 个 workspace 包）。 |
| 真实浏览器 | `pnpm test:browser --filter @pwa-platform/sw-runtime` 通过：Chrome 153.0.8010.50，19/19；Range 用例确认带 `Range: bytes=0-99` 得到来自服务器的 206 与 `Content-Range`，相同 URL 无 Range 仍由预缓存回答。 |

**变异检查。** 每项均只临时修改 `src/worker/decide.ts`，运行 `pnpm --filter @pwa-platform/sw-runtime test -- test/worker/decide.test.ts test/worker/platform-worker.test.ts`，确认失败后恢复；恢复后 `git diff --exit-code -- packages/sw-runtime/src/worker/decide.ts` 通过。

| 变异 | 报红证据 |
|---|---|
| 删除清单命中后的 `range` 判断 | 3 个失败：`passes through a manifest-hit, non-navigation request that carries Range`，以及 fetch 监听的“does not respond … whatever the header's value”和“derives range … any casing”。 |
| 把 `range` 判断挪到拒绝、排除、未分类与导航判断之前 | 2 个失败：`keeps the original reason for a Range request that would not have been a precache hit anyway` 与 `ignores range on navigations`。 |

**独立评审。** 由全新上下文的只读审阅代理检查 `main...HEAD`，结论：**无阻断项、无可操作问题**。它核对了判断顺序、fetch 头映射、fixture 在无 Range 时的 200/`Content-Length`/body 保持不变，以及 ADR、规格与已知限制的一致性。审阅代理尝试启动 Vitest 时受独立环境的 `.vite-temp` 写入权限限制（EPERM）而未运行测试；本节前述主 worktree 门禁已实际通过。

## 已知限制（移交后续模块）

- **Chrome Android 未执行**：本模块没有测试设备，浏览器矩阵的 Android 必测项继续作为已知限制。第一个具备设备的运行时模块需要决定运行方式（ADR-0010）。
- **桌面端 N-1 未执行**：需要本机备有上一个主版本的 Chrome，获取它属于下载，未经授权未执行；本记录只包含 N 的结果。
- **安装期的响应类拒绝项**：`no-store`、`opaque-response`、`redirect` 约束的是运行时缓存的写入；安装写预缓存由引擎经 Workbox 下载，本模块不检查，靠构建产物与部署响应头保证（ADR-0012）。
- **生命周期事件未发送**：本模块只记录 `activated`、`offline-fallback`、`cache-cleaned` 的触发点，传输协议由 client-runtime 规格决定。
- **离线导航的查询串**：应用壳 URL 带查询串时（例如 `start_url` 带追踪参数），按精确匹配不会命中预缓存，留待真实应用出现后评估。
- **基线列表与 contracts 强耦合**：运行时配置要求 `requestBaselineDenials` 与本包常量逐项同序相等。contracts 将来增加拒绝项而本包常量未同步发布时，已发布的 worker 会在启动校验时抛错、装不上。这是有意的 fail-closed，由单元测试守护两个常量相等。
- **路径匹配是第二份实现**：与 core 的解码规则靠一致性测试保持同步；core 的公开 API 未改动，若将来 core 调整解码规则，需同时更新本模块。
- **离线预缓存媒体不可播放或拖动**：带 `Range` 的媒体请求不由预缓存应答，离线时得到网络错误；v1 不提供离线媒体播放。

## 修订：导航兜底忽略查询串（2026-09-23）

### 对象

规格见[模块规格](../../spec/sw-runtime.md)的同名修订，决定见 [ADR-0034](../../docs/adr/0034-navigation-fallback-ignores-the-query-string.md)。分支 `claude/navigation-fallback-query`，提交：规格与 ADR `f6946d1`、计划 `dc374fe`、实现 `550e3f0`、演练与回归 `97c4bca`。

### 改动范围

`decide.ts` 的 `navigationFallbacks` 新增"同 `pathname` 丢弃查询串"候选，并让 `index.html` 候选同样丢弃查询串；`handlers.ts` 零改动，在线路径与非导航请求判定未变。反转的旧规则由 `decide.test.ts` 的用例连同注释显式改写，注明被 ADR-0034 取代。

### 变异检查

| 变异 | 结果 |
|---|---|
| 去掉"同 `pathname`"候选 | 单元测试转红；**本包的浏览器回归仍通过**（它走 `/app/?return=…`，靠 `index.html` 候选那一半） |
| 把 `index.html` 候选改回保留查询串 | 本包浏览器回归转红，证明它并非空转 |
| 以修订前的 `decide.ts` 跑 `entry-resilience` 的新回归 | 转红，其余 7 项通过 |

"同 `pathname`"候选的真实浏览器覆盖放在 `pwa-entry-resilience`：恢复页本就是"按自身路径预缓存"的形态。在本包补齐需要往夹具加一个同形态页面，会逼停两条与本次无关的夹具组成断言（`precache.spec.ts` 与 `lifecycle.spec.ts`），因此不在本包做。

### 本地质量门禁

| 命令 | 结果 |
|---|---|
| `pnpm --dir packages/sw-runtime test` | 214 项，连续两次一致 |
| `pnpm --dir packages/sw-runtime test:browser` | 26 项通过，Chrome 153.0.8010.53 |
| `pnpm lint`、`pnpm typecheck`、`pnpm build` | 全部退出 0 |
| `pnpm -r --no-bail test` | 退出 0；16 个包全部通过 |
| Spec Guard 只读核验 | 与 `main` 相同 |

### 如实登记

- **对查询串敏感的页面，离线时会拿到同路径的缓存文档**而不是降级页。这是 ADR-0034 的既定取舍，在线行为不变。
- **线上 Cloudflare `drill` 站仍是修订前的 worker**，要等下一次部署才带上修复；实跑证据见 [pwa-entry-resilience 验证记录](../pwa-entry-resilience/verification.md)。
