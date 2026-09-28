# 06Δ · 架构风险增量复核（eb5836e → dad5d1e）

范围：`git diff eb5836e..HEAD -- packages/*/src`，以及上一轮 R1–R15 和 07 中标为已完成或部分完成的建议。行号均指 HEAD。复核只读代码与测试，没有运行测试；对上一轮的状态说明一律按怀疑态度重新核对，不直接采信。

> **主会话复核结论（优先于下文）**
>
> - **R9、R15 的“部分完成”属实**，已逐条复现：`git merge-base --is-ancestor 237ec67 c077274` 为否，R9 修复不在 npm 0.2.1；`docs/guides/` 下仍有 10 份指南，`website/` 仍链接 `blob/main/docs/guides/update-prompt.md`。
> - **N1 属实，已修复**：[#60](https://github.com/haigeerlab/pwa-platform/pull/60)（待合并）。新增单元测试在去掉修复后失败、恢复后通过；全量单元测试 2430 个、client-runtime 与示例应用 Chrome E2E 共 103 个通过。未发布版本不受影响。
> - **R4 比下表所写的轻**：`requiredReleaseChecks` 确实没有调用方，但仓库的参考发布门禁 `examples-browser-e2e/release-verifier` 早已用 `verifyReleaseGateCoverage` 检查覆盖，不传 baseline 时报 `verify.baseline-missing` 并失败，上一轮 #13 的验收标准其实已经满足。真正的余项是门禁自带一份硬编码清单，与 `requiredReleaseChecks` 重复维护；[#62](https://github.com/haigeerlab/pwa-platform/pull/62) 已改为直接取用。直接调用 `verifyRelease` 时空报告为 `ok`，这是 API 注释写明的设计。
> - **N4 降为文档问题**：拒绝以 `Service-Worker-Allowed` 放宽 scope 是 [spec/contracts-foundation.md:21](../../../spec/contracts-foundation.md) 与 [website/guide/configuration.md:143](../../../website/guide/configuration.md) 明文写下的有意取舍，不是回归；只有 `CHANGELOG.md:19` “浏览器本来就拒绝，只影响从未工作的配置”一句不准确（部署方自加该响应头时浏览器会接受）。
> - **补充 N6（P3，注释过时）**：`packages/sw-runtime/src/worker/decide.ts:71` 的注释仍说 `authorization` 只对 `public-data` 规则生效，而同文件 `:125` 已对 `navigation-public-dynamic` 导航生效（R1 修复）。`:34` 描述的是只用于非导航请求的透传原因，是准确的。
> - **补充 N7（P3，偶发失败）**：本轮 client-runtime Chrome E2E 首跑时 `browser-tests/served-from-cache.spec.ts:59` 失败 1 次，随后单独重跑 3 次、整套重跑 1 次均通过。
> - N2、N3 仍为“待验证”，本轮未做浏览器探针。

**先说一个版本事实**：R9 的修复（237ec67，#54）合并在 0.2.1 发布提交 c077274 **之后**，`git merge-base --is-ancestor` 已确认它不在 0.2.1 里。`CHANGELOG.md:3-5` 把它列在 Unreleased 下，但 `packages/*/package.json` 仍写 0.2.1。所以 06 表里的“R9 ✅ 已修复”只对 HEAD 源码成立，**npm 0.2.1 用户拿不到这个修复**。

## (a) R1–R15 复核

| 编号 | 上轮严重度 | 上轮声明 | 复核结论 | 证据 |
|---|---|---|---|---|
| R1 | P2 | 已修复 | 确认已修复 | `sw-runtime/src/worker/decide.ts:125` 导航分支加了 `!authorization`；`test/worker/decide.test.ts:359`；`browser-tests/runtime-cache.spec.ts:250`（CDP 注入 Authorization 后不写入 pages 缓存） |
| R2 | P3 | 登记为限制 | 仍开放（接受为限制） | `admit.ts` 注释说明不检查 Set-Cookie；build-verifier 候选项未做 |
| R3 | P2 | 已修复 | 确认已修复 | `contracts/src/validate.ts:455-458`；`test/validate.test.ts:58-62`。注意这条规则与 `:451` 叠加后，等价于要求 **scope 恰好等于 SW 所在目录**（CHANGELOG 0.2.0 已写明） |
| R4 | P2 | 已缓解 | **部分**：状态声明偏乐观 | `build-verifier/src/release.ts:48-56` 仍然是“空报告即 ok”。`requiredReleaseChecks` 只在 README 和测试中使用，仓库里 release-tools、vite、nuxt 都没有调用它。07#13 的验收标准（生产预设缺 baseline 时失败）未达成 |
| R5 | P2 | 已修复 | 确认（同一 worker 实例内）。跨实例未覆盖，见 N2 | `handlers.ts:222-237`；`test/worker/platform-worker.test.ts:1268`；`browser-tests/offline-write.spec.ts:93` |
| R6 | P2 | 已缓解 | 部分 | 只有 `sw-runtime/playwright.engines.config.ts` 接入了 WebKit/Firefox，且不阻断（`release-tools/src/gate-commands.ts:18`）。client-runtime 的 R9 用例和 examples 的更新、恢复 E2E 都不在引擎冒烟里；R12 用例在非 Chromium 上 skip（`runtime-cache.spec.ts:266`） |
| R7 | P2 | 已修复 | 确认已修复 | `scripts/run-workspace.mjs:27` 带 `--no-bail`；`release-tools/vitest.config.ts:10` 超时 20s |
| R8 | P2 | 已修复 | 确认已修复 | `handlers.ts:476-496`；`runtime-cache.spec.ts:128-136` |
| R9 | P2 | 根因查明并修复 | **部分**，且未发布 | `client-runtime/src/client/facade.ts:422-431` 只修了 `registered`。`checkForUpdate()` 仍会无超时地挂起：`facade.ts:237` 的 `await current.update()` 挂住后，`sharedUpdateCheck` 的 `pendingCheck` 一直占位，定时检查全部排在它后面。ADR-0043:17 自己也写了“真机结论保持待定”。另外修复引入了回归，见 N1 |
| R10 | — | 已解决 | 确认（这是 ADR 裁定，不是代码修复） | ADR-0041 |
| R11 | P3 | 未处理 | 仍开放 | `handlers.ts:125`、`:395-397` 只校验同源 |
| R12 | P3 | 已修复 | 确认已修复。有副作用，见 N3 | `handlers.ts:81-83`、`engine-workbox/src/worker/runtime.ts:52-54`；`runtime-cache.spec.ts:264-298`（只在 Chromium 上跑） |
| R13 | P3 | 已文档化 | 仍开放（接受为限制） | `vue/package.json:29` 仍是 `^3.4.0` |
| R14 | P3 | 已查明并修复 | 部分 | `recovery-worker/index.ts:47-60` 已改为逐项删除；故障注入用例见 `offline-write.spec.ts:159-218`。剩余两点：(1)“fail closed”只对未受控页面有效，已受控页面在 activate 时本来就会被接管；(2) 失败后永不重试，残留的缓存或队列库会一直留到下次部署。另外 `:80` 在 `onblocked` 时立即 reject，但 deleteDatabase 请求其实还挂着、之后可能成功，这是一个**待验证**的“恢复被误判为失败”路径 |
| R15 | P3 | 已修复 | 部分 | `website/guide/updates.md:53` 仍链接到 `blob/main/docs/guides/update-prompt.md`，这正是上一轮点名的问题模式 |

**建议项复核**：
- 确认已完成：#1、#2、#4、#6、#8、#11、#12（`examples-browser-e2e/browser-tests/release.spec.ts:81`）、#15、#16、#17（`gate-commands.ts:17`，阻断）、#19。
- #9 确认完成（`react/test/ui-locale*.test.ts`、`vue/test/ui-locale.test.ts`）。
- **部分完成**：#7（覆盖面同 R6）、#13（同 R4）、#14（同 R15）。
- #10：真机项，无法从代码核验。

## (b) 新发现风险

**N1 · P2 · 已确认（代码推理），缺少测试 · 回访页漏掉正在安装的更新**
- 位置：`facade.ts:422-427` 的快速路径拿到已有注册时，这个注册可能**已经有一个 installing worker**；`watchForUpdates` 只处理 `current.waiting`（`:160`）和之后才触发的 `updatefound`（`:188`），没有处理挂载那一刻已存在的 `current.installing`。
- 失败场景：回访导航触发浏览器的 soft update，新 sw.js 已开始安装（precache 大、慢网），`updatefound` 在 facade 挂载监听之前就已触发。结果是本页面生命周期内永远不会发出 `update-waiting`，更新提示不出现。`checkForUpdate()` 返回 `update-available`，但并不补发这个事件。
- 为什么是回归：旧路径的 `register()` 会排在 update 任务之后，而 update 任务在 Install 完成后才结束，所以 `register()` 返回时 `waiting` 已经就绪，能被正常宣告。ADR-0043 声称“仍走既有的 update-waiting 路径”，与代码不符；`facade.test.ts:449-500` 只测了 waiting 和无 active 两种情形。
- 修复：`watchForUpdates` 挂载时，如果 `current.installing !== null`，对它执行与 `onUpdateFound` 相同的 statechange 订阅；补一个单元测试。投入 S。

**N2 · P3 · 部分待验证 · flush 单飞的边界**
- (1) 加入在途 flush 的调用方拿到的是**上一轮**的结果。这一轮开始之后才入队的写入不在其中，但结果里 `retained=0` 看起来像“已清空”，调用方无法区分。spec（`offline-write-extension.md:101`）已登记，但 API 没有给出任何信号。
- (2) 单飞表只在单个 worker 实例的内存里。更新接管窗口内，旧 worker 的 flush 仍在 `waitUntil` 里跑，新 worker 又收到 flush，同一个幂等键仍可能被发两次。待验证：在 flush 发送过程中触发 skipWaiting，数服务端收到的 POST。
- (3) 客户端用 `exactKeys` 严格解析结果（`offline-write/src/index.ts:79`），将来给结果加字段（比如 `joined`）会让新旧版本互不兼容。
- 修复：优先做 trailing pass（在途时再来的请求，在当前一轮结束后合并补跑一轮），不需要改消息格式。投入 S。

**N3 · P3 · 已确认（代码路径），浏览器行为待验证 · precache 超配额也会清掉运行时缓存**
- 位置：`handlers.ts:82` 注册的是 workbox 全局 quota 回调，而 `engine-workbox/src/worker/engine.ts:1` 的 PrecacheController 同样经 StrategyHandler.cachePut 触发这个回调（workbox-strategies 7.4.1 `StrategyHandler.js:323`）。
- 失败场景：新版本 install 时 precache 写入超配额，**正在安装的** worker 以 `keep=undefined` 调用 `deleteRuntimeCaches`，清掉当前活动旧版本还在用的 pages 和 data 运行时缓存。之后 install 仍然失败，每次重试都再清一遍，用户在旧版本下的离线公共数据就这样丢了。spec 只写了“运行时写入超配额时清理”。
- 修复：在 ADR-0035 中明确这一行为，或者让回调只在 activated 状态下执行。投入 S。
- 探针：在 CDP `overrideQuotaForOrigin` 下部署一个 precache 更大的 v2，观察 v1 的运行时缓存。

**N4 · P3 · 已确认 · 0.2.0 在 minor 版本中收紧了身份校验**
- `identity.scope-outside-worker-directory` 会拒绝用 `Service-Worker-Allowed` 响应头放宽 scope 的**既有可用**部署。CHANGELOG 写的“只影响从未工作的配置”对这类部署不成立。
- 身份又是不可变的，这类用户升级后既无法构建，也不能改身份。
- 修复：CHANGELOG/ADR 补一句迁移说明，或提供显式豁免。投入 S。

**N5 · P3 · 已确认 · 版本与状态文档不一致**
- R9 修复只在 Unreleased，而 06 的状态表和 `verification.md:317` 读起来像已随 0.2.1 发布。
- 修复：在 06 的 R9 行注明“修复未发布，下一版起生效”。投入 XS。

## (c) 13 维度 vs 上一轮

1. 模块边界：无变化。新增的 `registerRuntimeCacheQuotaCleanup` 以类型导入注入，没有把 Workbox 泄漏到 sw-runtime（`handlers.ts:6`）。
2. 公开 API 与配置契约：略退化。R4 默认值依旧宽松；新增 `locale` 和诊断码是增量改动；N4 属于破坏性校验。
3. PwaIdentity：改善（R3），但 N4 需要迁移说明。
4. SW 注册与 scope：改善（R3、R9 的 registered），但 N1 是新引入的回归。
5. 缓存准入、隔离、清理：改善（R1、R8、R12），N3 是新增副作用。
6. 更新生命周期：退化。N1；R9 中 `checkForUpdate()` 挂起依旧。
7. 离线与恢复链路：改善（R14 逐项删除），但失败后不重试、onblocked 误判待验证。
8. 多标签页：改善（R5），跨 worker 实例未覆盖（N2）。
9. 安全：改善（R1）；R11 和 R2 仍开放。
10. 浏览器兼容：小幅改善。引擎冒烟不阻断且只覆盖 sw-runtime，关键的 R9、R12 用例只在 Chromium 上跑。
11. 可测试性：改善，新增故障注入、配额、单飞、接入冒烟等用例；缺口是 N1、跨 worker flush、非 Chromium 下的配额。
12. 可维护性：改善（R7、N1–N6 的门禁修补）；handlers.ts 继续膨胀，已有 500+ 行。
13. 文档、实现与测试一致性：退化。R9“已修复”对 npm 0.2.1 不成立（N5）；ADR-0043 关于 update-waiting 的表述与代码不符（N1）；R4 的“已缓解”没有调用方支撑。
