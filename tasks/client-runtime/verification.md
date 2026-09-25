# 验证记录：client-runtime

> 模块质量门禁（#78）的可复现结果。任务事实源仍是 GitHub Issues #4。

## 环境与对象

- 日期：2026-09-16
- 分支：`feat/client-runtime`，基线 `origin/main` = `f9aaf58`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64，Google Chrome 152.0.7977.84（本机安装的稳定版）
- 被验证的提交：第一次门禁在 `26382c1`（#71–#77）上执行；独立评审之后的修复见"评审修复后的重新执行"

## 干净 worktree 门禁（`26382c1`）

从 `26382c1` 新建独立的 git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0；client-runtime 依次检查构建期、页面运行期（DOM lib）与浏览器自测三个 tsconfig |
| `pnpm test` | 退出 0；contracts 138、harness 61、core 94、engine-workbox 37、sw-runtime 87、client-runtime 75，全部通过 |
| `pnpm test:browser` | 退出 0；harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12 全部通过，日志打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动（忽略的构建与测试输出除外），随后删除。

## 独立评审

由新上下文的评审代理只读审阅本分支相对 `main` 的全部改动。它自行跑了 typecheck、单元测试、lint 与浏览器自测，并另写三个探针脚本实测监听生命周期。结论为 **REQUEST CHANGES**：2 个阻断项、4 个应修项、4 个可选项。计划指定的五个重点里，只有"监听泄漏"一项存在实证缺陷。

| 编号 | 发现 | 属实 | 处置 |
|---|---|---|---|
| B1 | `takeover()` 注册的 `controllerchange` 监听与 10 秒定时器没有登记进 `teardown`，`dispose()` 管不到；`postMessage` 抛错时 `controlled` 无人 await。两条路径都在 10 秒后产生未处理拒绝，并残留监听与定时器 | 是 | 已修：`teardown` 改为可单独撤销的集合；`takeover()` 把"清理并 settle"的函数登记进去；`applyUpdate()` 用 `try/catch` 包住 `postMessage`，抛出前先取消等待 |
| B2 | `dispose()` 清空 `teardown` 后，在飞行的 `register()` 仍会执行 `watchForUpdates`，向新对象注册监听；且守护它的测试是**空过**的——只断言事件为空，而订阅者已被清空，缺陷在与不在都通过 | 是 | 已修：`register()` 在 `await` 之后重新检查 `disposed`；测试改为直接断言迟到的 registration 上监听数为 0 |
| S2 | `logout()` 不解绑旧 registration 的 `updatefound` 监听；`teardown` 只增不减 | 是 | 已修：`watchForUpdates()` 返回撤销句柄，`logout()` 调用它 |
| S3 | 三条源码扫描（DOM 全局、reload/`caches`、动态 import）都没有反向探针，正则改错会永远绿 | 是 | 已修：新增自检用例，对每条模式给出应命中与不应命中的样本 |
| S4 | reload/导航正则漏掉 `window.location = `、`document.location = `、`history.go`、`window.open`，守护面小于 ADR-0013 的断言 | 是 | 已修：拆成五条具名模式并补齐上述写法 |
| S5 | 缺 `tasks/client-runtime/verification.md` | 是 | 本文件 |
| O1 | `registered` 的 `metadata.scope` 是注册返回的绝对 URL，规格写作 `{ scope }` 容易被读成配置里的路径 | 是 | 规格注明是绝对 URL；不改已被浏览器自测验证的行为 |
| O2 | 并发 `applyUpdate()` 未覆盖 | 是 | 规格写明语义，并补一条并发测试 |
| O3 | `src/client/index.ts` 的注释仍是"`promptInstall` 将在 #73 到来"的未来时态 | 是 | 已改写 |
| O4 | `docs/architecture/security-model.md:17` 仍是无条件的"登出必须清除平台管理的用户敏感缓存分类"，建议加脚注指向 ADR-0013 | 是 | 已修：经项目所有者批准后加脚注，说明 v1 该分类为空集、登出因而不删缓存；条款本身保持无条件，它约束的是 v1.1 准入的运行时缓存 |

评审同时确认四项无发现，并给出了判断依据：事件 `metadata` 不含敏感值（四处 emit 全为空对象或注册 scope，`JsonPrimitive` 索引签名结构上拒绝嵌套，且 `emit` 是闭包私有、调用方无从自行发事件）；确认更新不可能绕开用户（`SKIP_WAITING_MESSAGE` 全包仅一处 postMessage，位于 `applyUpdate()` 内）；登出不动缓存；TypeScript 严格度下四处 `as` 均有边界检查兜底。

### 修复过程中被新测试抓到的第二个缺陷

修 B1 时，第一版把**清理函数**登记进了 `teardown`，而真正会 settle promise 的 `cancel` 没有登记。结果 `dispose()` 只摘监听、清定时器，`applyUpdate()` 的 promise 永远 pending——调用方从挂起十秒后报错变成永久挂死，比原缺陷更糟。它被本轮新补的 `ends an applyUpdate that is still waiting` 当场抓出（测试超时），随即改为登记"清理并 settle"的同一个函数。这条记录保留，说明该测试不是事后补写的摆设。

## 评审修复后的重新执行

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 138、harness 61、core 94、engine-workbox 37、sw-runtime 87、client-runtime **80**，全部通过 |
| `pnpm test:browser` | 退出 0；harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12 全部通过 |

client-runtime 单元测试由 75 增至 80：替换了 1 条空过断言，新增 5 条（dispose 中断在飞行的 applyUpdate、postMessage 失败不泄漏等待、dispose 后不监听迟到的 registration、logout 停止监听旧注册、并发 applyUpdate），另加 1 条源码扫描自检。

## 变异检查

每项变异后运行对应测试，确认失败；随后逐字节还原（md5 比对），基线复跑通过。

### 评审修复的守护（本次门禁）

| 变异 | 结果 |
|---|---|
| `takeover()` 的取消函数不登记进 `teardown` | 被抓到 |
| `applyUpdate()` 不用 `try/catch` 包住 `postMessage` | 被抓到 |
| `register()` 在 `await` 之后不再检查 `disposed` | 被抓到 |
| `logout()` 不停止监听旧注册 | 被抓到 |
| 把 `caches` 扫描正则改成永不匹配 | 被抓到（新增的自检用例失败）|

### 各任务累计（#71–#76）

| 任务 | 变异数 | 结果 |
|---|---|---|
| #71 包骨架与构建期配置 | 3 | 全部被抓到 |
| #72 facade 与注册 | 6 | 全部被抓到（首轮一项存活，见下）|
| #73 安装引导 | 6 | 全部被抓到 |
| #74 确认更新与登出 | 9 | 8 项被抓到，1 项经核实为等价写法（见下）|
| #75 浏览器层注册与事件 | 2 | 全部被抓到 |
| #76 浏览器层更新与登出 | 2 | 全部被抓到 |

两处未按"全部抓到"收尾的情况，均未以补写测试掩盖：

- **#72**：变异"`dispose()` 后仍向订阅者推送"存活。核实后确认 `emit` 开头那句 `if (disposed) return;` 在 `listeners.clear()` 之后**不可达**，删与不删行为完全一致。处置是删除该行冗余代码，并把变异重定为"删除 `listeners.clear()`"，重做后被抓到。
- **#74**：变异"先发消息再订阅 `controllerchange`"存活。核实后确认两行之间没有 `await`，事件不可能插入其间，两种顺序当下等价；要让变异被抓到只能让假对象在 `postMessage` 时同步触发接管，而真实浏览器不会如此。处置是保留代码顺序（为将来插入 `await` 留出安全边界），并改写规格中那句不成立的理由。

## 稳定性

client-runtime 浏览器自测独立运行 6 次全部通过：#75 两次（5/5）、#76 两次（12/12）、门禁一次（12/12）、评审修复后一次（12/12）。

## 打包产物核对

浏览器自测的 globalSetup 打包 sw-runtime 的平台 worker 入口与本包的页面入口，注入后写入站点。核对真正部署的产物（非 `bundle/` 下的注入前中间件）：

| 产物 | 大小 | 注入点残留 | 模块语法 | `process.env` | workbox |
|---|---|---|---|---|---|
| `site-v1/app/sw.js` | 64371 字节 | 无 | 无 | 无 | 有（经引擎依赖，符合预期）|
| `site-v2/app/sw.js` | 64371 字节 | 无 | 无 | 无 | 有 |
| `site-v1/app/assets/client.js` | 8848 字节 | 无 | 无 | 无 | **无** |

`site-v1/app/sw.js` 中已注入的缓存名为 `pwa:clientfixture:production:r1:precache`。页面包不含 workbox，即没有把 worker 的依赖捎进页面。

## 依赖与供应链

- 本分支相对 `main` **新增第三方包解析条目 0 个**；lockfile 只增加 workspace importers（contracts、sw-runtime 为运行时依赖，playwright、harness、core、engine-workbox、@types/node、vite 为开发依赖，全部已在 lockfile 中）。
- `pnpm-workspace.yaml`、`.github/workflows/ci.yml`、根 `package.json`、`eslint.config.js`、`tsconfig.base.json` 均未改动。

## 与 spec、ADR 和能力图的边界核对

- 能力图 `client-runtime`：管理注册、安装引导、更新提示、状态事件与登出清理命令，并以浏览器 harness 验证页面与 worker 协议。一致。
- **能力图已修订**：`client-runtime` 的依赖加 `sw-runtime`（它必须导入后者的确认消息常量），build order 中相应移到 sw-runtime 之后。原表与 ADR-0012、包边界文档矛盾，本次修正。
- ADR-0004：身份字段由平台拥有，页面不得覆盖。一致：配置全部由构建期从已校验计划生成。
- ADR-0005：默认提示更新，应用拥有提示的展示。一致。
- ADR-0012：使用 sw-runtime 导出的确认消息常量，不另造协议。一致，且由测试断言是该常量对象本身而非形似副本。
- ADR-0013：记录本模块的五项决定。
- `packages/contracts`、`core`、`engine-workbox`、`sw-runtime`、`browser-test-harness` **零改动**：没有为实现本模块而修改任何已交付包的公开契约。

## CI 实跑证据

分支 `feat/client-runtime`、PR #79。工作流 `.github/workflows/ci.yml` 未改动，三个 job 全部由 `pull_request` 事件触发。

| 提交 | run | 结论 | 三个 job |
|---|---|---|---|
| `5b89faf`（模块完成状态） | [35069546137](https://github.com/haigeer-labs/pwa-platform/actions/runs/35069546137) | success | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser ✅ |
| `33f9684`（有意制造的回归） | [35069781141](https://github.com/haigeer-labs/pwa-platform/actions/runs/35069781141) | failure | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser **❌** |
| `2edb30e`（撤销回归） | [35069944991](https://github.com/haigeer-labs/pwa-platform/actions/runs/35069944991) | success | Quality (Node 22) ✅、Quality (Node 24) ✅、Browser ✅ |

版本：Node 22.23.2 与 Node 24.21.0；browser job 使用 runner 预装的 Google Chrome 152.0.7977.82。本机门禁用的是 152.0.7977.84，与 CI 相差一个补丁号。

**报红证据。** 临时提交 `33f9684` 只改一行：`browser-tests/page-entry.ts` 把事件订阅回调换成空操作，fixture 页面不再收集生命周期事件。选它是因为该文件不被任何单元测试覆盖，且改动后类型与 lint 都干净——推送前已在本地确认 `pnpm lint`、`pnpm typecheck`、`pnpm test` 三项仍绿，避免 quality 跟着报红而让证据失去意义。CI 结果正如预期：两个 quality job 照常通过，只有真实 Chrome 抓到回归，client-runtime 浏览器测试 3 failed / 9 passed：

- `registration.spec.ts:40` 首次访问的事件序列：`Expected lifecycle events [registered] but received []`；
- `registration.spec.ts:56` 重复注册仍只有一个事件；
- `update-and-logout.spec.ts:26` 更新发现：`Expected lifecycle events [registered, update-waiting] but received []`。

这次报红精确证明 browser job 是独立于 quality job 的门禁：页面与 worker 的协议只有在真实浏览器里才被验证，单元测试与源码扫描都覆盖不到。

撤销提交 `2edb30e` 是 `git revert`，与 `5b89faf` 的树完全一致（`git diff --stat 5b89faf 2edb30e` 为空），CI 三个 job 恢复为绿。

## 已知限制（移交后续模块）

- **worker 侧三个生命周期事件未接入**：`activated`、`offline-fallback`、`cache-cleaned` 的触发点在平台 worker 内部，而 sw-runtime 不发送任何消息。接入需要修改其公开契约，须另立 ADR（ADR-0013）。`docs/product/observability.md` 描述的是平台最终形态，不是 v1 的实现承诺。
- **`update-waiting` 依赖页面已被控制**：首次访问时页面尚未被任何 worker 控制，此时安装的第一个 worker 不算更新，不发该事件。
- **登出后当前文档仍被原 worker 控制**：这是 `unregister()` 的规范语义，已打开的客户端保持控制者直到被替换。浏览器自测以"reload 后不再受控"验证，而非断言当场失控。
- **Chrome Android 未执行**：本模块没有测试设备，浏览器矩阵的 Android 必测项继续作为已知限制（ADR-0010）。
- **桌面端 N-1 未执行**：需要本机备有上一个主版本的 Chrome，获取它属于下载，未经授权未执行；本记录只包含 N 的结果。

---

## 修订门禁：主动检查更新（U6，2026-09-18）

按 [修订计划](plan.md#修订计划主动检查更新2026-09-18) 的 U6 执行。受检提交 `0de0767`（分支 `feat/client-update-check`），已变基到 `main` 的 `2337160`，包含 shared-origin-topology 的合并 `dfdf375`。

### 干净 worktree 实跑

环境：新建的独立 detached worktree，Node v24.18.0，pnpm 11.18.0，Google Chrome 153.0.8010.50（本机安装的正式版，未下载任何浏览器或驱动）。

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --offline` | 通过 |
| `pnpm -r --filter './packages/*' build` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test`（全仓） | 通过 |
| `pnpm typecheck`（全仓） | 通过 |
| 各包 `test`：client-runtime / vue / react / nuxt / examples-browser-e2e | 113 / 44 / 71 / 77 / 5，全部通过 |
| `test:browser`：client-runtime（连续 3 次） | 16 / 16 / 16，全部通过 |
| `test:browser`：examples-browser-e2e | 33 通过 |
| `test:browser`：nuxt | 12 通过 |

第一次门禁实跑由子代理执行，中途因接口额度中断，没有交回完整结果，不计入证据。上表是在主会话中对修复后的提交重新完整实跑的结果。

### 独立评审

新上下文的评审代理审阅了 `main...feat/client-update-check` 的全部改动，结论为“修完应修项即可合入”，无阻断项。它逐项确认：没有任何路径绕过 `applyUpdate()` 确认或重新加载页面；页面隐藏时不发检查请求；检查不重叠；没有未处理的 Promise 拒绝；Vue 与 React 的方法集合、服务端拒绝与错误文案一致。

| 项 | 处理 |
|---|---|
| S1 两处文档与 nuxt 注释仍写“四个方法” | 已修（`0de0767`） |
| S2 `logout()` 时有自动检查在进行、随后又 `register()`：旧检查结束时把新调度的计时器按自己的结束时刻重设，并清掉新调度的“检查中”标记。不产生重复请求，但下一次检查的时间会错 | 先写复现测试并确认失败，再用代次计数修复（`cdc9f5e`）；变异检查：去掉代次判断后该测试与 dispose 测试同时失败，恢复后逐字节一致 |
| N2 校验顺序的注释不准确 | 已修 |
| N5 规格与 ADR 对“距上次检查”的措辞不一致 | 规格统一为“距上次自动检查开始” |
| 观察 9：首次访问时 `"update-available"` 之后不会有 `update-waiting` | 在 `checkForUpdate()` 的 JSDoc 中写明 |
| N1 注册已被其他标签页移除时，`logout()` 提前返回，没有停止自动检查 | 修订合入后修复（`fd053d6`），见下方已知限制 |
| N3 纯 JS 传 `updateCheck: null` 抛原生 TypeError | 保留：类型不允许该值 |
| N4 补检用 `Date.now()`，系统时钟跳变会影响补检时机 | 保留：影响很小，Vitest 与 Playwright 的时钟都能控制它 |
| N6 局部变量 `document` 遮蔽全局 | 保留：只影响可读性 |

### 实现期发现并修复的缺陷

- **U2 验收**：`dispose()` 时如有自动检查在进行，检查结束后会重新设置计时器，已销毁的 facade 会一直轮询下去。先复现后修复（显式调用 `scheduler.stop()`）。
- **U6 评审 S2**：见上表。

### 修订的已知限制

- **CI 实跑证据缺失**：远程仓库不可用，修订部分没有 PR 与 CI 运行；远程恢复后补取。
- **页面隐藏在浏览器自测中是模拟的**：通过 `Object.defineProperty(document, "visibilityState")` 加派发 `visibilitychange` 实现，不是真实切换标签页；判断“隐藏时不请求”之前先等待 500 毫秒真实时间。
- **React 的“`intervalMs` 不变就不重建 facade”没有真实渲染的测试**：依赖列表抽成纯函数后按 `Object.is` 断言（ADR-0020）。
- **N1（已修复，`fd053d6`）**：注册已被其他标签页移除时，本页的 `logout()` 不停止自动检查。残留的检查只调用 `getRegistration()` 并返回 `"unavailable"`，不发网络请求。要修复就得改变已交付的 `logout()` 语义，而且还要同时处理注册缓存，否则下次 `register()` 无法重启调度，因此修订时未改。修复：找不到注册时也执行与成功路径相同的本地清理（停止监听与自动检查、清除记住的注册），返回值仍为 `false`。先补两条单元测试并确认失败（停止调度与监听；之后 `register()` 真正重新注册并重启调度与监听），修复后单元 115、浏览器自测 16 全部通过；变异检查：恢复提前返回后这两条测试失败，恢复后逐字节一致。
- **`update()` 永不兑现时**，共享的检查一直处于进行中，之后的手动与自动检查都会等同一个 Promise。是否发生取决于浏览器对 worker 脚本请求的超时处理，未验证。
- **Nuxt 不转发 `updateCheck`**：开放问题，见 ADR-0020。
- **Chrome Android 与桌面端 N-1** 仍未执行，与原模块一致。

---

## ADR-0026：`update-applied` 页面完成事件（2026-09-20）

### 验证结果

环境：本地 Chromium `153.0.8010.50`；所有浏览器命令只启动项目的 loopback fixture server，未推送或访问远端服务。

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 通过 |
| `pnpm test` | 通过；受影响包计数：contracts 179、client-runtime 119、Vue 46、React 74、Nuxt 77、examples 5 |
| `pnpm typecheck` | 通过 |
| `pnpm build` | 通过 |
| `pnpm test:browser` | 通过（全仓浏览器矩阵） |
| `pnpm --filter @pwa-platform/examples-browser-e2e exec playwright test browser-tests/update.spec.ts` | 6 通过：Vue/React 的等待、确认后不刷新且提示消失、同 scope 双标签页接管 |
| `pnpm --filter @pwa-platform/examples-browser-e2e exec playwright test browser-tests/recovery.spec.ts` | 6 通过：Vue/React 的恢复接管、无 fetch 处理、修复后离线恢复 |

变异检查：暂时移除 `emit("update-applied", {})` 并重建 client-runtime 后，两个框架的“确认后提示消失”和“双标签页提示消失”断言均失败；恢复该行并重建后上述 6 项更新场景全部通过。此检查证明 E2E 不只是重述实现细节。

### 跨包审查

按 contracts → client-runtime → Vue/React → examples 的调用链只读审查 `main...HEAD`，结论：**批准合并，无阻断项。**

- **正确性：** 新事件是 v1 envelope 的加性成员；facade 只在本页曾发出 `update-waiting` 后的 `controllerchange` 发出一次完成事件。消息投递失败、等待超时和未曾提示的控制权变更都不会提前复位；超时后的迟到接管仍会完成。
- **生命周期与架构：** 监听归现有 registration watcher 所有，`logout()` 与 `dispose()` 一并移除；跨标签页依赖浏览器原生的每页 `controllerchange`，没有 BroadcastChannel、页面消息或 Worker 消息协议。
- **安全与不变量：** diff 不含缓存 API、reload、导航、身份字段、scope 或 Worker URL 的改动，也没有新增依赖或敏感数据。
- **性能与可读性：** 每个已注册 facade 仅增加一个长寿命监听；事件只在状态转换时分配新状态对象。审查中发现的旧注释“首次访问顺序”与更新事件不符，已改为“声明顺序”。

### 交付边界与已知缺口

- Spec Guard 的 `verify-artifacts.sh` 为 **2 通过、0 失败、1 个历史 tracker 警告**；phase guard 为 `LEGACY_TRACKER_RETIRED`，未读取或改写历史 tracker 状态。
- `documentation_impact.py --module client-runtime` 仍报“documentation baseline must contain exactly one baseline table”。该基线结构问题早于本修订且与本改动无关，未擅自修改。
- Chrome Android、桌面 N-1、React 真机安装、Android 恢复与远端 CI 仍未取得；本修订不把它们记为通过。远端不可用，未创建 PR、未推送。
- 主工作树的 `main` 已确认干净并停在本修订基线；项目所有者随后明确授权本地 `--ff-only` 合并，已 fast-forward 至 `5adcc0e6b16006049bcdceb2f340e80d279c5366`。不推送。
