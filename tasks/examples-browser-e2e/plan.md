# 实现计划：examples-browser-e2e

## 概览

按 [spec/examples-browser-e2e.md](../../spec/examples-browser-e2e.md) 交付 Vue 3 与 React 19 示例应用，并在真实浏览器中执行 [V1 验收矩阵](../../docs/architecture/v1-acceptance-matrix.md)第 6 行要求的四项验证。

本模块是整个 v1 的**验收出口**：此前每个模块都把"真实浏览器里的端到端行为"移交到这里。因此它的风险不在写测试，而在三处：

1. **证据的诚实度。** 必测范围包含 Chrome Android 与桌面 N-1，两者当前都拿不到。任何把"未执行"写成"通过"的做法，都会让 V1 验收矩阵那一行失去意义——而它正是发布门禁的依据。
2. **测试能不能失败。** 端到端测试最容易变成摆设：站点没构建好也能"通过"，断言写在永远为真的条件上也能"通过"。每一项都必须配一次变异证明它会报红。
3. **两个示例必须可比。** 它们是同一个应用的两种框架实现，断言同一组结果；任何一侧单独失败都应当指向该框架的绑定，而不是指向两个示例写得不一样。

## 架构决定

- **断言优先走 DOM，不优先走内部状态。** vite-adapter 的 fixture 把 client 挂在 `window` 上供 `page.evaluate` 读取，那是 fixture 的合理做法；本模块交付的是**示例**，其验收语义是"用户看到的行为正确"。因此更新提示是否出现、安装按钮是否出现，一律断言界面；`window` 暴露只保留给生命周期事件序列这类 DOM 上看不见的东西。
- **两个示例共享身份、策略与界面契约**，只有绑定方式不同。E2E 以站点参数化：同一批断言在两个 `describe` 中各跑一次，各自 `test.use({ fixtureSite })`。不使用 Playwright `projects` 让整批 spec 跑两遍——那会把与框架无关的检查（build-verifier 一项）也无谓地重复。
- **站点由插件真实构建，不手工拼装。** 沿用 vite-adapter 的做法：`global-setup.ts` 跑真实 `vite build`。手工拼装的站点只能证明拼装脚本本身。
- **恢复 worker 在构建期模拟"改名发布"**，不让插件直接覆盖平台 worker。[回滚流程](../../docs/operations/release-and-incident-runbook.md#回滚)要求恢复 worker 发布在同一 `serviceWorkerUrl`，而 vite-adapter 有意把它写在旁路路径由发布流程改名（ADR-0015）。
- **未取得的证据一律按"未执行"登记**，附原因。不因难以自动化就降低通过标准。

### 已实测确认的前提

这些事实在写规格时实测过，任务的验收标准直接依赖它们：

- **Vite 8 内置转 JSX**，产物为 `import { jsx, jsxs } from "react/jsx-runtime"` 的调用形式，**不需要 `@vitejs/plugin-react`**。
- **Vue 的 `defineComponent` + `h()` 经 Vite 构建无需 `@vitejs/plugin-vue`**（`.vue` SFC 则必须有它，因此示例不用 SFC）。
- **`react-dom` 不在 lockfile**，React 示例要渲染必须新增它（已获批准，`19.3.0`，带传递依赖 `scheduler`）。
- **缺失脚本的行为分两种**：`--recursive` 无 filter 时静默跳过（`contracts` 没有 `test:browser` 而 CI browser job 长期为绿）；**带 `--filter` 指向单包时会以 `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` 失败**。本包只声明 `typecheck` 与 `test:browser`。
- **harness 的 `fixtureSite` 是 Playwright option fixture**，用 `test.use({ fixtureSite })` 绑定；`FixtureServer` 提供 `deploy(version)`、`setHeaderRules()`、`requests()`。
- **`waitForController` 分辨不了同一 URL 的新旧 worker**，更新与恢复都必须用 `waitForControllerChange`。
- **`expectDeletedExactlyUnderPrefix` 同时要求没有任何新增缓存**，因此恢复演练第 3 步的比对要在重新预缓存之前完成。
- **页面 `reload()` 之后是新的 window**：新的 facade、新的事件数组、没有对 registration 的订阅。不重新建立绑定，页面什么都观察不到——vite-adapter 的 `installAndControl` 为此踩过一次。

## 任务定义

### 任务 1：包骨架与 Vue 示例

**说明：** 建立 `packages/examples-browser-e2e`，交付 Vue 示例应用，并用 vite-adapter 的插件成功构建一次。

**验收标准：**

- `package.json`：私有，`type: module`，**只声明 `typecheck` 与 `test:browser` 两个脚本**（不产出 `dist`，无单元测试）；不含任何框架 Vite 插件。
- **依赖按任务实际需要分批声明**，不一次列全。本任务需要：`@pwa-platform/vite`、`@pwa-platform/vue`、`@pwa-platform/contracts`、`@pwa-platform/browser-test-harness`（均 `workspace:*`），以及 `vite@8.3.0`、`vue@3.5.42`、`@playwright/test@1.63.0`。React 三件（`@pwa-platform/react`、`react@19.3.0`、`@types/react@19.3.0`、`react-dom@19.3.0`）随 T2 加入，`@pwa-platform/build-verifier` 随 T6 加入——否则本任务的验收要对着一批当时用不到的依赖打转。
- `apps/vue/`：用 `defineComponent` 与 `h()` 渲染，不使用 SFC。界面具备三件可观察的事：更新提示（`updateWaiting` 为真时出现，点击调用 `applyUpdate()`）、安装按钮（`installEligible` 为真时出现，点击调用 `promptInstall()`）、以及一处随版本改变的可见标记。
- 通过 `createPwa` 插件与 `usePwa()` 接入，不直接使用 `client-runtime`。
- 身份与策略完整：`PwaInstallMetadata` 含 `startUrl`、`display`、名称、主题色与四个图标；策略启用 `offlineFallback`，并为应用壳、资源与离线页各写预缓存规则。**策略中的路径是 mount-relative**，写成绝对 URL 会以 `compile.offline-fallback-not-built` 失败。
- 一次 `vite build` 成功，产出计划、平台 worker、恢复 worker、manifest 与页面配置。

**验证：**

- `pnpm --filter @pwa-platform/examples-browser-e2e typecheck` 通过；构建脚本产出上述文件。
- 变异检查：把策略里的离线页路径写成绝对 URL，构建必须失败并指向 `compile.offline-fallback-not-built`。

**依赖：** 无。

**预计范围：** L（包配置、示例应用、身份与策略、构建跑通）。

### 任务 2：React 示例

**说明：** 交付与 Vue 示例对等的 React 实现。

**验收标准：**

- `apps/react/`：用 JSX 编写（Vite 内置转换，无插件），通过 `PwaProvider` 与 `usePwa()` 接入。
- **与 Vue 示例共享同一份身份、策略与界面契约**：相同的 `appId`、scope、安装元数据与预缓存规则，相同的三件可观察界面行为，只有绑定方式不同。两份示例的差异限于框架写法。
- `react-dom@19.3.0` 加入 devDependencies；lockfile diff 审阅确认无非 registry 来源、无安装脚本。
- 一次 `vite build` 成功，产物结构与 Vue 示例对等。

**验证：**

- typecheck 与构建通过；两个示例的产物清单逐项对照（同名文件、同样的计划结构）。
- 变异检查：把策略的 `install.enabled` 改为 `false`。**实测结果与本条最初的预期不同，按实际行为记录**：构建并非产出一个 `install` 为 `null` 的计划，而是**直接失败**——`This build enables no installation, so the pwa plugin writes no manifest — but the identity names one.` 这正是 [spec/vite-adapter.md](../../spec/vite-adapter.md) 留下的那条开放问题的现场：`plan.install` 为 `null` 时没有模块生成 manifest，而身份仍要求它存在。变异因此被杀死，只是杀死它的是这条约束而非安装界面的消失；示例要观察"没有安装能力时界面如何"，需要一个不声明 `manifestUrl` 的身份，那超出本任务范围。

**依赖：** 任务 1。

**预计范围：** L。

### 检查点：两个示例都能构建

- 两个示例各自构建成功，产物对等。
- 此时还没有任何浏览器证据——下面每一项都要配一次变异，否则无法区分"通过"与"没测到"。

### 任务 3：站点版本与 E2E 骨架

**说明：** `global-setup.ts` 构建三个站点版本，接入 fixture 服务器，并以一条冒烟测试证明链路通。

**验收标准：**

- 三个版本按规格构建：`v1`（正常）、`v2`（改一处应用壳内容后重建，**改完还原源码**）、`recovery`（以 `v1` 为底，把 `pwa-recovery-worker.js` 复制到身份的 `serviceWorkerUrl` 位置）。
- 每个示例各有自己的三版本；产物落在 `<version>/<mountPath>/` 之下，与身份的 scope 对齐。
- fixture 服务器按[生命周期](../../docs/architecture/lifecycle.md)的响应头基线配置 `headerRules`：worker 与 manifest `no-cache`，指纹资源 `immutable` 且 `max-age` 为正。
- 冒烟测试：页面加载、worker 注册成功、`registered` 事件发出——两个示例各一条。

**验证：**

- `pnpm test:browser --filter @pwa-platform/examples-browser-e2e` 跑通冒烟测试。
- 变异检查：让 `global-setup` 跳过 `v2` 的构建，依赖它的测试必须失败而非静默跳过。

**依赖：** 任务 2。

**预计范围：** L（三版本构建、恢复 worker 改名、响应头规则、冒烟）。

### 任务 4：安装与离线 E2E

**说明：** 两项验证，两个示例各跑一遍。

**验收标准：**

- **安装（只做可自动化的部分）**：`PwaPlan.install` 不为 `null`；manifest 位于身份的 `manifestUrl`、可获取、字段与安装元数据逐项一致；收到 `beforeinstallprompt` 后依次发出 `install-eligible` 与 `installed`，**且示例界面的安装按钮随之出现**。该事件未触发时按"未取得"登记并说明原因，**不按通过计**。
- **离线启动**：安装并填充缓存后断网，应用壳正常渲染无白屏；导航到未缓存路由显示离线降级页；除 `offlineFallback.path` 外不返回其他路由的缓存内容。
- 断言优先走 DOM；事件序列用 `expectLifecycleSequence`。

**验证：**

- 变异检查各一次：删掉离线降级页后离线导航测试必须失败；破坏 manifest 的一个字段后安装测试必须失败。

**依赖：** 任务 3。

**预计范围：** M。

#### T4 实施记录（2026-09-17）

**真实 `beforeinstallprompt` 未取得。** 两个示例在 Chrome 152 无头模式下等待 8 秒均未收到该事件（自动化配置下的参与度启发式，外加 1×1 占位图标）。按规格登记为"未取得"并 skip，**不计为通过**；测试以 `not-obtained` 注解留下记录，供验证记录引用。

**安装的"依次发出两个事件"改由界面观察。** 框架绑定不交出 `subscribe`，示例拿不到原始事件流，因此以事件的效果为准：`install-eligible` 到达 → 安装按钮出现，`installed` 到达 → 按钮消失、`#installed` 出现。验证这条链路的测试**由测试自己派发事件**，名字里写明 "wiring only"，它证明的是 facade → 绑定 → 界面的接线，不是浏览器判定可安装——两者被刻意分成两条测试。

**manifest 字段不与源配置自比。** 期望值取自 `identity.ts` 的 `INSTALL`，而构建也读同一个文件，改源配置会让两边一起变。所以变异放在**构建产物**上：构建后把 manifest 的 `display` 改为 `browser`，恰好两条字段测试失败，接线测试不受影响。

**离线变异换了一个，原计划那个证明不了测试。** "删掉离线降级页"会让预缓存安装失败，连应用壳离线启动一起挂，分不清是哪条断言在起作用。先试"关掉策略里的 `offlineFallback`"，构建在加载配置时就失败，没有任何测试执行到——变异被配置校验杀死，而非被测试杀死。最终做法是**只在构建出的 `sw.js` 里**把注入的 `offlineFallback` 改成 `{"enabled":false}`（注入代码找不到锚点即抛错，防止替换静默落空）：恰好两条"未缓存路由走离线页"失败，两条"应用壳离线启动"照常通过。

**删掉一条自己写的废测试。** 初版 offline.spec 里有一条只比较两个字符串常量的测试，不可能在任何有意义的情况下失败，已删除。

### 任务 5：更新与恢复 E2E

**说明：** 两项验证，恢复一项按恢复演练的完整步骤执行。

**验收标准：**

- **更新提示**：`deploy("v2")` 后新 worker 保持等待、不自行激活；示例界面出现更新提示；**确认之前已打开的页面不被刷新或重新加载**（以页面内标记验证）；确认后新 worker 激活并控制页面。用 `waitForControllerChange` 判定接管。
- **恢复路径**按[恢复演练](../../docs/operations/recovery-drill.md)四步执行：建立四个对照缓存（同应用旧 revision、同应用其他环境、其他应用同环境且其 `appId` 以当前 `appId` 开头、非平台缓存）并快照 → `deploy("recovery")` 触发接管 → 验证接管、**请求未经 Service Worker**（`requestFromPage` 的 `fromServiceWorker` 为假，并以服务器侧 `requests()` 佐证请求确实到达）、删除集合与保留集合完全符合预期（`expectDeletedExactlyUnderPrefix`）→ `deploy("v1")` 后预缓存重新填充、离线启动恢复。
- **缓存名一律用 contracts 的 `appCachePrefix` 与 `cacheName` 计算，不手写。**

**验证：**

- 变异检查各一次：让更新 worker 自行激活（跳过等待），更新测试必须失败；让恢复 worker 注册一个 `fetch` 监听，恢复测试必须失败。
- 恢复演练记录按其模板写入验证记录。

**依赖：** 任务 4。

**预计范围：** L（恢复一项涉及四个对照缓存与四个步骤）。

#### T5 实施记录（2026-09-17）

**`controllerchange` 早于恢复清理完成。** 恢复 worker 在 `install` 里 `skipWaiting()`，浏览器在**激活开始**时就把该注册的客户端交给新 worker，而删缓存跑在 `activate` 的 `waitUntil` 里——`clients.claim()` 排在删除之后，却不是接管发生的原因。实测：`waitForControllerChange` 返回后立刻快照，四个对照缓存和预缓存**一个都没删**；等 1500 ms 再看，全空。因此步骤 3 的快照改为等 `registration.active.state === "activated"`（该状态意味着 `waitUntil` 已结算）。**没有改成轮询缓存本身**——那等于把演练要问的答案当成等待条件。

**更新提示在应用更新后不会消失。** 确认后控制权确实移交，但 `#apply-update` 仍在。这不是示例的缺陷：事件表（`packages/contracts/src/events.ts`）没有"更新已应用"这个事件，`updateWaiting` 没有任何回到假的路径。测试按**现状**断言按钮仍可见，并标注原因，这样将来契约若变化不会静默通过。此项列入 T7/T8 的上游移交缺口。

**"页面未被刷新"用两个见证。** 确认前在 window 上写一个随机标记，确认后读回；同时断言文档仍显示 `v1`——刷新会换成 v2 的包并丢掉标记。

**变异检查一：更新 worker 自行激活。** 在 `global-setup` 里给构建出的 v2 `sw.js` 追加 `install` 时 `skipWaiting()`（锚点缺失即抛错）。四条更新测试全红，而且是分别被两处断言杀死：提示**仍然出现**（`update-waiting` 仍短暂发出），但等待槽已空，第一条死在 `registration.waiting`；第二条死在点击后 10 秒内没有 `controllerchange`——worker 早已自行接管。

**变异检查二：恢复 worker 注册 fetch 监听。** 给 recovery 站点的 `sw.js` 追加 `event.respondWith(fetch(event.request))`。两个示例的"恢复 worker 什么都不提供"各自转红（`fromServiceWorker` 为真），删除集合与步骤 4 两条不受影响——正是演练文档所说的：断网检查分不清"没拦截"和"拦截了但缓存已删"，`fromServiceWorker` 才是分界。附带现象：React 的步骤 4 在该变异下也失败（等不到 `controllerchange`），这是变异引入的不稳定，不是稳定的击杀，不计入本次结论。

两次变异都已还原，`global-setup.ts` 与 HEAD 逐字节一致，基线复跑 22 passed / 2 skipped。

#### 恢复演练记录

按[恢复演练](../../docs/operations/recovery-drill.md)的记录模板填写。

- 触发：质量门禁。本模块的 PR 尚未创建（GitHub 账号被封，全程本地流程），落地提交见本分支 `feat/examples-browser-e2e`。
- 日期：2026-09-17
- 执行人：自动化执行（`packages/examples-browser-e2e/browser-tests/recovery.spec.ts`），两个示例各跑一遍
- 环境：本地 fixture 服务器（`http://localhost:<系统分配端口>`，`startFixtureServer`），Chrome 无头
- 应用与环境：`appId` = `pwaexample`，`environment` = `production`，`appCachePrefix` = `pwa:pwaexample:production:`
- 被测 worker 构建标识：`v1` 站点的 `/app/sw.js`（vite-adapter 插件产出的平台 worker）
- 恢复 worker 构建标识：`recovery` 站点的 `/app/sw.js`，内容即 `v1` 的 `pwa-recovery-worker.js`（ADR-0015 的改名由发布流程完成，这里在构建期完成）
- 修复后 worker 构建标识：重新部署的 `v1` 站点 `/app/sw.js`

##### 浏览器

| 浏览器 | 版本号 | 是否执行 |
|---|---|---|
| Chrome 桌面（macOS） | 152.0.7977.84 | 是 |
| Chrome Android | — | **未取得**：无可用设备或设备云 |
| Chrome 桌面 N-1 | — | **未取得**：本机只安装了当前稳定版 |

##### 缓存清单

缓存名一律由 contracts 的 `cacheName` / `appCachePrefix` 计算，测试里没有手写的缓存名。

| 缓存名 | 步骤 1 条目数 | 步骤 3 结果 | 预期 | 是否一致 |
|---|---|---|---|---|
| `pwa:pwaexample:production:r1:precache`（当前预缓存） | 3 | 删除 | 删除 | 是 |
| `pwa:pwaexample:production:r0:precache`（同应用旧 revision） | 2 | 删除 | 删除 | 是 |
| `pwa:pwaexample:staging:r1:precache`（同应用其他环境） | 3 | 保留，3 | 保留 | 是 |
| `pwa:pwaexample-legacy:production:r1:precache`（其他应用，`appId` 以当前值开头） | 1 | 保留，1 | 保留 | 是 |
| `example-app-shell-v1`（非平台缓存） | 1 | 保留，1 | 保留 | 是 |

##### 检查结果

| 检查项 | 浏览器 | 结果 | 证据 |
|---|---|---|---|
| 接管客户端，无用户操作 | Chrome 152 | 通过 | `deployRecovery` 用 `waitForControllerChange`，触发动作只有部署与 `registration.update()` |
| 在线请求未经 Service Worker | Chrome 152 | 通过 | `requestFromPage` 的 `fromServiceWorker` 为假，且服务器侧 `requests()` 记到该请求 |
| 断网请求得到网络错误 | Chrome 152 | 通过 | 同一条测试的离线分支，`outcome` 为 `network-error` |
| 恢复 worker 未注册 fetch 监听 | 不适用 | 通过 | sw-runtime 单元测试；本模块以 `fromServiceWorker` 为现场佐证 |
| 删除集合与预期一致 | Chrome 152 | 通过 | `expectDeletedExactlyUnderPrefix` 加上按上表逐行的断言 |
| 保留集合与预期一致 | Chrome 152 | 通过 | 同上，条目数一并比对 |
| 修复后 worker 激活，离线启动恢复 | Chrome 152 | 通过 | 重新部署 `v1` → 界面提示 → 确认接管 → 预缓存重新填充 → 断网重载应用壳可见 |

##### 结论

**Chrome 152 桌面全部通过；本次演练不构成完整通过。** 演练文档的通过标准是"必测范围内的每个浏览器"，而 Chrome Android 与桌面 N-1 本次未取得。按规格，未取得一律登记为未执行，不折算为通过。

### 任务 6：build-verifier 三类校验

**说明：** 让 V1 矩阵"每个示例的构建通过，且 build-verifier 校验通过"这一条成立。

**验收标准：**

- **产物一致性**：由插件在构建末尾调用 `verifyArtifacts`，构建通过即成立；测试断言该调用确实发生过（例如故意移除一个预缓存条目后构建失败）。
- **响应头基线**：从页面采集实际响应头，交给 `verifyResponseHeaders` 判定。
- **身份基线**：示例自带基线文件，用 `readIdentityBaseline` 与 `compareIdentityBaseline` 比较。
- 三项以 `verifyRelease` 汇总。注意其输入中**省略某字段与传 `undefined` 语义不同**：前者表示未检查，后者表示查过且不存在。

**验证：**

- 变异检查：把某个指纹资源的响应头改成 `no-cache`，响应头校验必须失败。

**依赖：** 任务 3。

**预计范围：** M。

#### T6 实施记录（2026-09-17）

**插件不把编译出的计划写成文件，所以计划得从产物里读回来。** 三项检查只读 `plan.identity` 与 `plan.precache`：`precache` 取自构建出的平台 worker 注入的 `manifest`（那正是 `plan.precache`），`identity` 就是构建拿到的那个对象。用之前先交叉核对——worker 注入的 `scope` 必须等于身份的 `scope`，`precacheCacheName` 必须等于 `cacheName(IDENTITY, "precache")`——否则等于拿另一次构建的产物去比这份身份的基线。`PwaPlan` 是封闭形状，其余字段照本示例的配置填写；唯独 `pathRules` 没有任何产物完整记录（worker 的规则有路径和动作，没有资源类别与来源），留空并写明**没有任何检查读它**。这个对象是给三项检查的输入，不是"编译器产出了这份计划"的断言。

**先断言三项都跑了，再断言 `ok`。** 省略某项输入时该项根本不出现在报告里，而 `verifyRelease` 什么都不验也是 `ok: true`。所以正向测试第一句断言的是 `checks` 的名字恰好是 `["artifacts", "response-headers", "identity-baseline"]`。同理断言指纹条目至少有一条——一条都没有的话，基线中 `immutable` 那一半从未被判定，报告却照样为绿。

**响应头从服务器采，不从 Service Worker 采。** 用 `page.request`（不经 worker）逐条 GET，读回真实响应头。基线关心的是部署返回什么，不是 worker 回放什么。

**"响应头改 no-cache 必须失败"做成了常驻测试而不是一次性变异。** `fixtureServer.setHeaderRules()` 可以在测试内改部署，于是把指纹目录改成 `no-cache`、重采、断言 `verifyResponseHeaders` 报出恰好三条诊断（`immutable` 缺失、`max-age` 缺失、`no-cache` 被禁）。改的是部署，不是计划也不是检查。

**变异检查（正向测试）：** 把 `sites.ts` 的指纹资源基线规则改成 `no-cache`，两个示例的正向测试各自转红，诊断与上面那三条一致；另外两条测试不受影响。已还原，`sites.ts` 与 HEAD 逐字节一致。

**产物一致性用一次构建证明插件真的在调用 `verifyArtifacts`。** 追加一个无 `enforce` 的插件（平台插件是 `enforce: "post"`，所以它的 `writeBundle` 先跑），从 bundle 里删掉一个指纹 JS，构建必须以 `does not contain everything the plan requires: verify.artifact-missing at /precache/<n>/url` 拒绝。**同一条测试先跑一次不带该插件的对照构建**——没有对照的话，一个根本构建不起来的配置读起来和"检查生效"一模一样。

**身份基线是手写文件，不是从 `identity.ts` 生成的。** `apps/shared/release-baseline/production.json` 按[身份发布基线](../../docs/operations/identity-release-baseline.md)的 `<目录>/<槽位>.json` 约定存放。生成它会让比较变成恒真：身份被改动时基线要报漂移，而不是跟着一起变。

**新增依赖：** `@pwa-platform/build-verifier`（`workspace:*`）。lockfile 只多了一条 workspace link，没有新的外部包。

本包基线 28 passed / 2 skipped（跳过的仍是 T4 登记的"未取得 `beforeinstallprompt`"）。

### 任务 7：上游移交缺口的验证

**说明：** 覆盖 vue-react-adapters 移交的三项（项目所有者 2026-09-17 决定覆盖 React 侧，不覆 Vue 3.4）。

**验收标准：**

- **React Provider 的 effect 依赖与 facade 生命周期**：以字面量 `config={{ … }}` 传配置并触发重渲染，facade 不得被重建，界面不得显示与实际不符的注册状态。这是该模块独立评审所发现阻断项的另一半——其"依赖收窄"在单元测试中**没有守卫**，只有真实渲染能验。
- **`usePwa()` 在 Provider 之外抛错**：在示例中放置一处 Provider 之外的调用路径并断言其抛错；结果仅置于带 `hidden` 属性的测试专用 DOM 元素，不属于示例界面。
- **`logout()` 之后 `registered` 停留为真**：在界面上观察其实际表现，确认与已记录的语义一致。

**验证：**

- 第一项配一次变异：把 React 示例的 Provider 依赖改回整个 config 对象，该测试必须失败。**这条变异是本任务存在的理由**——它证明这里补上了单元测试到不了的地方。

**依赖：** 任务 5。

**预计范围：** M。

#### T7 实施记录（2026-09-17）

**示例新增计数器与登出按钮（项目所有者 2026-09-17 决定加计数器）。** 两个示例写法相同、元素 id 相同，保持界面契约一致；规格的"示例应用"一节已同步。

**计数器状态必须放在 Provider 之上。** React 示例的 `Root` 持有计数，并以 `config={{ ...config }}` 传配置，于是每次点击都让 Provider 拿到一个新对象。放在 `App`（Provider 之下）只会重渲染子树，配置字面量不会被重建，测试什么都证明不了。展开虚拟模块而不是手写字段，是为了继续只经公开入口取配置。

**变异检查（本任务存在的理由）：** 把 `packages/react/src/index.ts` 的 effect 依赖改回 `[store, client, config]` 并**重建 react 包的 `dist`**（示例经 workspace link 解析到 `dist`，不重建就是假绿）。结果：

- React 的重渲染测试转红：`Expected: "registered"`、`Received: "not registered"`——界面说未注册，而 worker 其实还在；
- Vue 的同名测试照常通过——那边没有任何东西重建配置，这条对 Vue 只是界面一致性检查，测试注释里写明了这一点；
- **同一变异下 react 包的 60 条单元测试全部通过。** 单元测试没有渲染器，依赖数组无人覆盖；这条 E2E 补上的正是这里。

已还原，`src/index.ts` 与 HEAD 逐字节一致，重建后 `dist/index.js` 的 md5 回到变异前的值（`6a779346…`）。

**界面与实际分别断言。** 重渲染测试既断言 `#registered` 仍为 registered，也断言浏览器里注册确实还在——只看界面的话，一个对早已消失的注册说"已注册"的绑定也能通过。

**`logout()` 按现状断言。** 点击后应用自己的标记显示"logged out"（`logout()` 返回真）、浏览器中注册确实消失，而 `#registered` **仍为 registered**——与 vue-react-adapters 已知限制的描述一致，两个示例表现相同。示例按该限制建议的做法，用返回值维护自己的登出标记。

**`usePwa()` 在 Provider 之外。** React 示例在 Provider 旁放一个探针组件，`try` 中调用 `usePwa()` 并把错误信息渲染出来；测试断言文本恰为绑定自己的报错。该 hook 每次都调用、每次都在 `useContext` 之后抛出，hook 顺序不会变化。这是示例中唯一为测试而存在的元素。

**不在本任务范围、转交 T8/T9 的发现：** T5 观察到更新应用后提示不会消失（事件表没有"更新已应用"事件）。它不是 vue-react-adapters 移交的三项之一，记入验证记录的"新发现缺口"，不在这里消化。

本包基线 33 passed / 2 skipped。

### 检查点：证据齐备

- 四项 E2E、build-verifier 三类校验、三项移交缺口全部通过，且各自的变异检查已完成。
- 未取得的范围（Chrome Android、桌面 N-1、真实安装、参考档与渐进兼容档）已逐条登记原因。

### 任务 8：文档同步

**说明：** 同步入口文档；评估是否需要 ADR。

**验收标准：**

- `README.md` 的交付状态与 `docs/DOCUMENTATION-BASELINE.md` 新增本模块一行，状态 `target`（CI 证据取得前不翻 `verified`）。
- 逐行复验文档基线表格的列数。
- **评估是否需要 ADR**：本模块若未产生难以逆转的架构决定，则不立；若立，编号 `0017`。判断依据写入验证记录。
- **不修订** [浏览器矩阵](../../docs/architecture/browser-matrix.md)与 [V1 验收矩阵](../../docs/architecture/v1-acceptance-matrix.md)：必测范围的调整属于治理基线变更，须由项目所有者决定并另立 ADR。

**验证：**

- 全仓扫描跨文档锚点与相对链接可解析。

**依赖：** 任务 7。

**预计范围：** S。

#### T8 实施记录（2026-09-17）

- `README.md`：仓库定位与开发状态两处写入本模块"正在交付"，并如实写明 Chrome Android、桌面端 N-1 与真实安装原生流程未取得；工作区包清单补入 `@pwa-platform/examples-browser-e2e`。"当前已落地的包"一句**未改**——与 vue-react-adapters 同样处于"正在交付"，两者都不应提前列入。
- `docs/DOCUMENTATION-BASELINE.md`：新增本模块一行，状态 `target`，事实源指向规格与验证记录。表格 23 行逐行复验列数，0 行异常。
- **ADR 评估：不立 ADR-0017。** 依据写入 [verification.md](verification.md)。T5、T6 各发现一处上游契约缺口（没有"更新已应用"事件；插件不公开编译出的计划），都要改已交付包的公开契约，只登记、不在本模块决定。
- **移交闭环在源头补记。** `tasks/vue-react-adapters/verification.md` 的"已知限制（移交后续模块）"末尾追加一条带日期的补记，指向 T7 的验证结果；原文不改。
- 浏览器矩阵与 V1 验收矩阵未修订。
- **链接扫描：** 全仓 77 个已跟踪 markdown、224 条相对链接与锚点，0 条失效。扫描清单取自 `git ls-files`（新文件先暂存再扫），不会读到未跟踪的私有文档。扫描器先做了对照：注入一条坏链接与一条坏锚点，两者都被识别，正确锚点通过；注入已还原。

#### T1–T3 实施记录（2026-09-17 补记）

T1–T3 的实施细节当时只写在提交说明里，T9 独立评审指出 plan 中缺失，此处补记要点，详见各提交：

- **T1（`8771f87`）**：包骨架与 Vue 示例。`isolatedDeclarations` 要求四处显式标注（vite 配置默认导出、`App: Component`、setup 返回的渲染函数、virtual 模块声明）；virtual 模块的类型由绑定签名推导（`Parameters<typeof createPwa>[0]["config"]`），不复制。离线页路径写成绝对 URL 的变异按预期以 `compile.offline-fallback-not-built` 失败。
- **T2（`091b469`）**：React 示例，新增 `react-dom@19.3.0`（经项目所有者批准，带传递依赖 `scheduler@0.28.0`）。
- **跨模块修复（`7a4fe20`）**：T3 冒烟时发现 React 示例从未注册——effect 子先父后，`Registrar` 在 Provider attach facade 之前调用 `register()`，当时的实现抛错并被 `void` 吞掉。**项目所有者于 2026-09-17 在会话中批准修改已交付的 `@pwa-platform/react`**（选项"修绑定包：方法等待 attach"）。修复让方法等待下一次 attach；该修改在 `tasks/vue-react-adapters/plan.md` 与 `verification.md` 中有带日期的更正说明。它引入的"Provider 永久卸载后调用永不结束"已补入 `spec/vue-react-adapters.md` 的已知限制（T9）。
- **T3（`7eb41e6`）**：三个站点版本与冒烟测试。原计划的"跳过 v2 构建"变异被 harness 启动时的目录校验先行杀死；改为让 recovery 保留 v1 的 `sw.js`，由目标断言杀死。

#### T9 更正（2026-09-17）

T9 的干净 worktree 门禁与独立评审推翻了前面几条记录。原文保留不改，以下为更正：

- **"typecheck 通过"在 T1–T8 中对本机之外不成立。** 本包从未声明 `@types/node`，主工作区的 TypeScript 一路向上解析到了仓库之外的 `/path/to/user/node_modules/@types/node`（22.13.4）；干净 worktree 里 typecheck 以 `TS2688` 失败。已补声明 `@types/node@24.13.4`（项目所有者批准）。
- **React 示例的 `.tsx` 从未被 typecheck。** `tsconfig.app.json` 的 `include` 只匹配 `*.ts`，`app.tsx` 与 `main.tsx` 不在程序内。T2 验收"typecheck 与构建通过"与 T7 的"typecheck 通过"对 React 侧没有检查任何东西；提交 `091b469` 说明中的 "after it passed typecheck" 与事实不符（提交说明无法改写，在此更正）。纳入后唯一的错误是 `react-dom/client` 缺类型，已新增 `@types/react-dom@19.3.0`（项目所有者批准）。
- **T5 的恢复第 4 步测试提交时就不稳定，不是"变异引入的不稳定"。** 恢复 worker 在走向 `skipWaiting` 途中经过 installed，界面因此已显示更新提示，而提示永不消失；`deployAndOffer` 等按钮可见便立即返回，点击早于 v1 worker 出现。未改动的 HEAD 上 16 次运行失败 4 次。T5 记录把变异二下 React 步骤 4 的失败归因于变异，这是错的。已改为等待 waiting 槽，修复后 30 次全部通过；同一变异下步骤 4 现在通过。
- **T5 的"在线请求未经 Service Worker"区分不了平台 worker 与恢复 worker。** 请求的是应用壳 URL，它以 fetch 发出、不是导航，平台 worker 本来就放行。已改为请求一个预缓存资源，并在部署恢复 worker 之前先断言同一请求为 `fromServiceWorker: true` 作对照；离线分支同样改用该资源，与演练文档措辞一致。
- **T4 的真实 `beforeinstallprompt` 跳过条件看的是按钮而非事件。** 已改为用初始化脚本在捕获阶段计数原始事件：计数为 0 才登记"未取得"，计数大于 0 而按钮未出现即判失败。
- **恢复演练记录**中"修复后 worker 激活"一行把"界面提示"当作证据，而该提示在部署修复版之前就已存在；更正后的演练记录见 [verification.md](verification.md)。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认文档写法（以及是否需要 ADR）之后，再进入模块质量门禁。

### 任务 9：模块质量门禁

**说明：** 完成模块级验证、独立评审与交付记录。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- **依赖变更证据**：`pnpm install --frozen-lockfile` 通过，附 `react-dom` 引入的 lockfile diff 审阅。
- 由新上下文的独立评审代理审阅，重点包括：两个示例是否真的等价、每项 E2E 是否可能空过、恢复演练的缓存对照是否完整、安装那一项"未取得"与"通过"是否被清楚区分、移交缺口的三项是否真的验到了单元测试到不了的地方、文档一致性。阻断项与应修项已处理。
- **CI 证据**：GitHub 账号恢复后取得；在此之前按先例执行本地完整门禁，并写明它**不替代** CI 证据，基线行保持 `target`。
- 结果写入 `tasks/examples-browser-e2e/verification.md`，含浏览器矩阵要求的全部字段与恢复演练记录模板。

**验证：**

- 干净 worktree 的命令输出；spec-guard 产物校验；CI 运行链接（账号恢复后补）。

**依赖：** 任务 8。

**预计范围：** M。

#### T9 实施记录（2026-09-17）

门禁、独立评审与处置的完整记录见 [verification.md](verification.md)。要点：第一轮干净 worktree 门禁 typecheck 失败（`@types/node` 未声明，主工作区解析到仓库外）；独立评审 2 个阻断项、5 个应修项、6 个建议项，全部处置于 `52513a2`，第二轮门禁六步全部通过。**按浏览器矩阵，Chrome Android 与桌面端 N-1 未取得即计为未通过，本模块在必测范围上没有通过**；本机 Chrome 桌面端 N 的结果不外推。CI 证据未取得，基线行保持 `target`。

### 任务 10：React 测试探针可见性修订

**说明：** Android N-1 实机预检暴露出 `usePwa()` Provider 外错误被直接渲染到 React 示例页面。保留该真实渲染路径的端到端覆盖，但不把测试诊断作为用户界面的一部分。

**验收标准：**

- `#outside-usepwa` 仍包含绑定自身的精确错误文本，证明 Provider 外调用路径仍实际执行。
- 该元素带原生 `hidden` 属性；页面与辅助技术树均不展示该测试诊断。
- 不修改 `@pwa-platform/react`、PWA 策略、Service Worker 或公开契约。

**验证：**

- 先新增 `toBeHidden()` 断言并确认现状报红，再以最小 JSX 修改恢复为绿。
- 重跑 examples 包的 typecheck 与完整浏览器套件；现有四项 PWA 验收语义不得改变。

**依赖：** 任务 9。

**预计范围：** XS。

#### T10 实施记录（2026-09-19）

- 实机 Android N-1 预检中，React 示例把 Provider 外错误直接显示给用户；这不是绑定故障，而是 T7 为覆盖真实渲染路径而加入的测试探针泄露。
- 先在现有错误文本断言之后加入 `toBeHidden()`；精确 Playwright 用例如预期报 `Received: visible`。随后仅把探针元素改为原生 `hidden`，错误文本断言与隐藏断言一同通过。
- `pnpm --filter @pwa-platform/examples-browser-e2e typecheck` 与 `pnpm lint` 通过。完整浏览器套件第一次出现 React 恢复场景的单次 `page.reload: net::ERR_ABORTED`；在未改代码的条件下，定向用例 10 次重复均通过，完整套件复跑为 **33 passed / 2 skipped**。两项跳过仍是未取得真实 `beforeinstallprompt`，不是通过。
- 无 ADR：私有示例的测试 DOM 可逆，未改变公开接口、Service Worker、策略或验收矩阵。

### 任务 11：恢复 E2E 稳定性审计

**说明：** T10 的第一次完整浏览器套件在 React 恢复场景中一次性报出 `page.reload: net::ERR_ABORTED; maybe frame was detached?`。该失败发生在恢复后的预缓存已确认填充、刚切离线重载应用壳时；必须先区分可复现竞态与瞬时浏览器导航中断，不能以重试、放宽断言或加延时掩盖它。

**验收标准：**

- 在未改恢复逻辑、断言、超时或重试策略的前提下，分别验证隔离、Vue→React 顺序与完整套件条件。
- 若未能稳定复现，如实记录浏览器、失败签名、重复矩阵与升级条件；不把“未复现”写成“已修复”。
- 若再次发生，才以临时 `trace: "retain-on-failure"` 配置采集失败现场并另开根因修复；常态套件不增加 trace 负担或改变时序。

**依赖：** 任务 10。

**预计范围：** XS。

#### T11 审计记录（2026-09-19）

- 失败签名仅出现一次：React 的“部署修复 worker 后重新填充预缓存并恢复离线启动”在 `context.setOffline(true)` 后的 `page.reload()` 报 `net::ERR_ABORTED; maybe frame was detached?`。此前的等待槽竞态（T9 B1）签名是 `No controllerchange within 10000 ms`，两者不能混为同一故障。
- 未改代码下，React 定向运行 10 次通过；Vue 与 React 的同一恢复场景各重复 20 次，均无 Playwright 失败产物；完整 35 项套件在当前 Chromium `153.0.8010.50` 配置下两次通过（各 **33 passed / 2 skipped**）。两项跳过仍是未取得真实 `beforeinstallprompt`。
- 结论：**未复现，未修复。** 没有足够证据修改恢复逻辑、导航断言或超时。下一次出现该签名时，临时启用 Playwright `trace: "retain-on-failure"` 收集现场，再根据 trace 开启独立根因修复任务。

### 任务 12：安装图标真实性修复

**说明：** 安装就绪审计确认两套示例的 manifest 把 1×1 PNG 声明为 192×192 与 512×512；构建产物同样错误。修复静态图标资产，并把二进制尺寸纳入现有安装 E2E 门禁。

**验收标准：**

- Vue 与 React 示例的 `any`、`maskable` 图标均为真实的 192×192 与 512×512 PNG；manifest 路径与元数据不变。
- 保留项目内可维护的 SVG 图标源；不新增依赖、不改变 `PwaIdentity`、策略、Worker 或公开契约。
- 安装 E2E 从实际 fixture 站点获取每个图标，校验 PNG 签名及 IHDR 宽高等于 manifest 的 `sizes`；旧 1×1 资产必须使该断言失败。
- 真实 `beforeinstallprompt` 未取得仍登记为未取得，绝不因图标修复自动改记为通过。

**验证：**

- RED：两套示例均在实际响应的 PNG 中读到 `1`，与声明的 `192` 不符。
- GREEN：定向尺寸门禁、examples 包 typecheck 与完整浏览器套件通过；原生安装仍留给真机人工核对。

**依赖：** 任务 11。

**预计范围：** XS。

#### T12 实施记录（2026-09-19）

- 安装就绪审计直接读取源码与构建产物：两个示例的八个文件均为 1×1 PNG，manifest 却声明 192×192／512×512。这不满足 Chromium 对实际图标尺寸的要求，不是设备或自动化环境导致的显示差异。
- 先新增从 fixture 站点读取 PNG 签名与 IHDR 宽高的测试；两例均精确报 `Expected: 192`、`Received: 1`。测试正则最初有一次转义错误，已在实现前更正；不把该错误计作缺陷证据。
- 新增两个项目内 SVG 源（普通与 maskable），以系统图像工具离线生成八个 PNG。所有 192 文件实测为 192×192，所有 512 文件实测为 512×512；未新增依赖，也未改变 manifest 元数据、身份、策略、Worker 或公开契约。
- 定向门禁两例通过；examples 包 typecheck 与根 lint 通过；完整浏览器套件在 Chromium `153.0.8010.50` 下为 **35 passed / 2 skipped**。跳过项仍是未取得真实 `beforeinstallprompt`，不是通过；完成原生安装与独立窗口启动仍留给真机人工核对。

### 任务 13：Android N-1 原生安装核验

**说明：** 在真实 Android 设备上核验 T12 的图标修复能够取得浏览器安装资格、完成原生安装，并从启动器以独立窗口打开。此项只记录已实际执行的示例与浏览器档位，不外推到 React 或 Chrome N。

**验收标准：**

- 真机加载由当前构建产物提供的示例，Service Worker 已注册，且浏览器实际请求 manifest 与 512 maskable 图标。
- 用户从示例界面的 `Install` 按钮触发原生安装确认；启动器出现应用图标。
- 从该图标启动后，前台为 WebAPK 活动而非 Chrome 标签页，无地址栏，且页面显示预期应用壳与版本。

**依赖：** 任务 12。

**预计范围：** XS。

#### T13 实施记录（2026-09-19）

- 设备：Xiaomi 23127PN0CC，Android 16，Chrome `152.0.7977.82`（Android N-1）。通过临时 localhost `4301` 与 ADB reverse 提供当前构建的 Vue `v1`；选择新端口以隔离旧 `4173` 的等待 Worker 状态。
- 现场先确认页面显示 `PWA Platform · Vue example`、`v1` 与 `registered`；本机服务器日志确认 manifest、512 maskable 图标与 Worker 均由该设备请求。页面出现 `Install` 按钮，用户完成浏览器原生安装确认，启动器出现独立的 `Example` 图标。
- 用户从 `Example` 图标启动后，前台活动为 `org.chromium.chrome.browser.webapps.SameTaskWebApkActivity`；无障碍树没有 Chrome URL 栏或菜单，页面仍显示 Vue `v1` 与 `registered`。因此 Vue 的原生安装与独立窗口启动通过。
- **不外推：** Chrome 153（Android N）与 React 原生安装均未执行；本模块的完整浏览器矩阵仍未通过。

### 任务 14：React Android N-1 原生安装事件诊断

**说明：** 在与 Vue 独立的 Android N-1 origin 上，验证 React 示例是否能取得浏览器原始安装事件；若未取得，区分 Chrome 的安装资格／参与度判定与 React 绑定接线缺陷，且不以合成事件充当原生安装证据。

**验收标准：**

- 真机页面显示 React `v1` 与 `registered`，并完成一次用户交互与刷新。
- 仅当 Chrome 实际派发 `beforeinstallprompt`、界面出现 `Install` 时，才能继续原生安装与独立窗口核验；事件未取得必须如实登记。
- 在隔离 Chrome 配置中，现有 React 安装接线用例通过，证明合格浏览器派发事件后按钮可达；该用例不得被误写成真机原生安装通过。

**依赖：** 任务 13。

**预计范围：** XS。

#### T14 实施记录（2026-09-19）

- 使用临时 localhost `4302`（ADB reverse）提供 React `v1`，与 Vue 的 `4301` origin 隔离。设备显示 React 应用壳、`v1`、`registered`；用户刷新并两次点击 `Bump`，计数显示为 2。
- 经过刷新、等待与交互后仍未出现 `Install`。原始 `beforeinstallprompt` 未被记录，因此按规格记为**未取得**，未进入原生安装或 WebAPK 独立窗口核验；不能据此断言事件一定未派发，或断言不存在真机时序问题。
- 以隔离临时 Chrome 配置运行 React 的既有“合成 `beforeinstallprompt` 到达界面”用例，Chromium `153.0.8010.50` 下通过。该结果只证明已接收事件的 facade → React binding → 页面接线正确，不替代真实浏览器事件或真机安装证据。
- 不修改平台代码、PWA 身份、策略、Worker、公开契约或验收矩阵；不新增 ADR。若继续，需要能积累真实访问历史并记录原始事件的 HTTPS 测试环境，而不是猜测性修改 React 实现。

### 任务 15：完整更新提示参考实现

**说明：** 按规格“修订：完整更新提示参考实现”，把 React 与 Vue 示例的更新提示改为横幅交互（Update／Later、确认中、接管后 Reload、同 scope 页 Reload、失败 Retry），并启用 30 分钟定时检查。只改两个示例与本包 E2E。

**验收标准：**

- 两个示例元素 id、文案与行为一致；既有更新、恢复 E2E 不改语义且通过。
- 新增 E2E：确认页出现 `#update-reload`；同 scope 另一页出现 `#update-reload`；点击 Reload 后 `#version` 为 v2；Later 隐藏横幅且注册仍有 waiting worker。每项配一次变异检查并记录。
- `pnpm lint`、示例包 typecheck、`pnpm test`、本包 `test:browser` 通过。

**依赖：** 任务 14（顺序）。

**预计范围：** S。

#### T15 实施记录（2026-09-21）

- **改动范围：** 只动 `packages/examples-browser-e2e/`。`apps/react/src/app.tsx`、`apps/vue/src/app.ts` 把单个 `#apply-update` 按钮换成横幅状态机（`idle` → `updating` → `reload` / `error`，另有独立的 `dismissed` 标志给 Later），新增 `#update-banner`、`#update-later`、`#update-reload`、`#update-error`、`#update-retry`，保留 `#apply-update` 的 id（`prompt` 与 `updating` 两态复用它）。两个框架各自的 `main.tsx` / `main.ts` 加上 `updateCheck: { intervalMs: 1_800_000 }`（30 分钟）。`browser-tests/update.spec.ts` 新增与扩展断言，未改动其他任何包，未新增依赖。
- **状态机依据：** `updateWaiting` 只有 `update-applied` 事件能清为假（`packages/react/src/store.ts`、`packages/vue/src/store.ts`），且该事件在每个受控同 scope 页面各自的 `controllerchange` 上触发——不区分是本页点击确认还是另一个标签页确认。因此“确认页显示 Reload”与“同 scope 另一页显示 Reload”复用同一段 `true → false` 转换逻辑（React 用 `useEffect` + `useRef` 记录前值，Vue 用 `watch` 的 `wasWaiting` 参数），符合规格里“按状态机它只可能来自 update-applied”的判断。
- **测试新增：** 在 `update.spec.ts` 里，2 处扩展既有测试（“confirming hands over control…”加 `#update-reload`／`#version`／文档标记断言；“one confirmation clears the prompt…”加双页 `#update-reload` 断言），2 个新测试（“clicking Reload reloads the confirming page onto the new version”“Later hides the banner without touching the waiting worker”）。均按 `EXAMPLES` 参数化，Vue 与 React 各跑一遍。
- **验证结果：**
  - `pnpm lint`：通过（`eslint .` 无输出即通过）。
  - `pnpm --filter @pwa-platform/examples-browser-e2e typecheck`：通过。
  - `pnpm test`：全仓 15 个声明了 `test` 脚本的包全部通过，含 `examples-browser-e2e` 自身的 5 项单元测试（`ssr-tests/`）；未改动的包测试数与改动前一致。
  - `pnpm test:browser --filter @pwa-platform/examples-browser-e2e`：Chrome `153.0.8010.50`（`channel: "chrome"`，本机已安装的 Google Chrome stable），**41 通过 / 2 跳过**。跳过项是既有的两套示例真实 `beforeinstallprompt` 用例（自动化环境的参与度启发式未触发，规格已知限制，与本任务无关）。`update.spec.ts` 与 `recovery.spec.ts` 中所有既有断言未被削弱，均保留并通过。
- **4 项变异检查**（临时改动示例源码 → 跑对应测试确认报红 → 用备份文件精确还原，`git status`/`git diff` 复核无残留）：
  1. **确认页出现 `#update-reload`：** 把 React/Vue 的 Reload 按钮 id 由 `update-reload` 改成 `update-reload-mutated`（保留状态机与点击行为不变）。跑 `--grep "confirming hands over control|one confirmation clears the prompt|clicking Reload"`：6 个用例（Vue/React 各 3 个）全部因 `#update-reload` 定位不到而报红。还原后确认恢复绿。
  2. **同 scope 另一页出现 `#update-reload`：** 同一处 id 变异同时覆盖了这一断言——上一条的 6 个报红里包含“one confirmation clears the prompt in every controlled same-scope tab”的 Vue、React 两个用例，其失败点正是新增的 sibling `#update-reload` 断言（primary 页断言先失败挡住了后续行，故记录中一并列出，不单独重复变异）。
  3. **点击 Reload 后 `#version` 变为 v2：** 把 Reload 按钮的 `onClick` 换成空操作（不调用 `location.reload()`）。先在 React 单独变异跑 `--grep "clicking Reload"`：React 报红（`#version` 停留在 `v1`），Vue 未动保持绿，证明断言确实在检验该框架自身的行为而非误报；还原 React 后在 Vue 上做同样变异，Vue 报红、React 保持绿。两次都已还原。
  4. **Later 隐藏横幅且注册仍有 waiting worker：** 把 Later 按钮的 `onClick` 换成空操作（不设置 `dismissed`）。跑 `--grep "Later hides the banner"`：Vue、React 两个用例均因 `#update-banner` 仍存在（`toHaveCount(0)` 收到 1）而报红。还原后恢复绿。
- **未取得范围：** `Update failed` / Retry 路径（`applyUpdate()` 10 秒超时未接管）只经代码审阅，未做浏览器变异或断言——真实浏览器里无法稳定制造该超时（规格“已知限制”原文如此，本次实施未改变这一点）。React/Vue 两侧的 `confirmUpdate` 均在 `.catch` 里把 `updatePhase` 置为 `error`，渲染 `#update-error`（文案 `Update failed`）与 `#update-retry`（复用同一 `confirmUpdate` 函数），逻辑与成功路径对称，但没有自动化证据。
- 未新增依赖；未改动 client-runtime / react / vue / vite 等已交付包；未新增或修改 ADR（本任务没有产生难以逆转的架构决定，改动全部在示例应用与其 E2E 内）。

### 任务 16：更新提示接入指南

**说明：** 新增 `docs/guides/update-prompt.md`：状态流程、推荐交互、React／Vue 片段（与示例一致）、`updateCheck` 建议值与边界；同步 README 与文档基线。

**验收标准：** 片段与示例代码一致；相对链接检查通过；不承诺平台提供界面。

**依赖：** 任务 15。

**预计范围：** XS。

#### T16 实施记录（2026-09-21）

- 新增 `docs/guides/update-prompt.md`：触发条件、检查时机、状态流程、推荐交互、React／Vue 片段（与示例同一状态机，含 `applyUpdate()` 返回 `false` 的处理）及已知边界；明确平台不提供界面。README 的示例段落链接该指南，文档基线 `examples-browser-e2e` 行登记其为权威文档之一。相对链接检查通过。

### 任务 17：区分“页面已是新代码”的更新提示

**说明：** 按规格“补充修订：区分‘页面已是新代码’”，在两个示例中比较当前入口脚本与最新应用壳的入口脚本，已是新代码时使用离线更新文案且接管后不提示刷新；补 E2E 与变异检查，修正接入指南。

**验收标准：** 两示例行为一致；新增 E2E 通过并配变异检查；既有更新与恢复 E2E 不改语义且通过；lint、typecheck、`pnpm test`、本包 `test:browser` 通过；指南与示例一致。

**依赖：** 任务 16。

**预计范围：** S。

#### T17 实施记录（2026-09-22）

- **改动范围：** 只动 `packages/examples-browser-e2e/`。React（`apps/react/src/app.tsx`）与 Vue（`apps/vue/src/app.ts`）各自新增一份 `detectPageCurrency`：`document.querySelector('script[type="module"][src]')` 读出本文档自己的入口脚本绝对 URL，`fetch(SHELL_URL, { cache: "no-store" })` 取最新应用壳、用 `DOMParser` 解析出其入口脚本 `src` 并解析为绝对 URL，两者相等即“当前”，其余（含失败、非 2xx、找不到入口脚本）一律“陈旧”，与规格的保守默认一致。函数不放进 `apps/shared/`：该目录被 `tsconfig.json`（Node 侧配置）纳入检查而不带 DOM lib，`document`/`fetch`/`DOMParser` 在那份配置下无法通过 typecheck，只有各示例自己的 `tsconfig.app.json` 带 DOM lib，因此两侧各自持有一份同逻辑的函数（`SHELL_URL` 本身经 `../../shared/identity.js` 正常导入，不受影响）。`SHELL_URL`、`updateWaiting` 的判定与状态机维持规格既有形状，不改动任何已交付包。
- **状态机改动：** 两侧新增 `pageCurrency: "current" | "stale" | null` 状态，`null` 表示未解析（含检查尚未开始与检查进行中），此时横幅保持隐藏（`bannerMode` 的 `prompt` 分支新增 `pageCurrency !== null` 前提）以避免文案闪烁。`updateWaiting` 由假变真时把 `pageCurrency` 重置为 `null`（新一轮等待需要自己的判定）；由真变假时，若 `pageCurrency === "current"` 则直接回到 `idle`（横幅整体消失，不出现 `#update-reload`），否则维持原有的 `reload` 分支。`prompt` 阶段的文案随 `pageCurrency` 二选一（`An update is ready for offline use` / `A new version is available`），`#apply-update`、`#update-later` 的 id、文案与点击行为不变。
- **踩坑与修正（主会话复核前的两轮）：** 第一版实现在 `updateWaiting` 变真时立即同步发起 `fetch`，`pnpm test:browser` 全量回归时把 `recovery.spec.ts` 的“the recovery worker serves nothing, online or offline”跑出间歇性失败（`--repeat-each` 反复验证：改动前 6/6 稳定通过，改动后单测隔离下 4/6 失败）。根因：恢复 worker 在 `install` 事件内调用 `skipWaiting()`，浏览器仍会短暂把它的状态置为 `installed`，`client-runtime` 的 `announceWaiting` 因此照常发出 `update-waiting`，`updateWaiting` 在毫秒级窗口内真变又假变——这是 ADR-0026 附录已经记录过的既有现象，本任务的新代码第一次让它触发一次真实网络请求，与恢复 worker 几乎同时的接管竞争，导致 `waitForControllerChange` 在 10 秒内等不到事件。单纯给 `fetch` 加 `AbortController` 只缓解了 React 侧（React 的 4 次重复回归转绿），Vue 侧仍 4/4 复现失败，说明问题不只是“不取消”，而是请求已经发出。最终修正：两侧的检查改为 `setTimeout` 防抖 100 ms 后才真正发起 `fetch`，窗口内 `updateWaiting` 提前变假就直接 `clearTimeout`，从不发出请求；仍保留 `AbortController` 处理防抖后才结束的窗口。修正后 `recovery.spec.ts` 单测隔离 `--repeat-each 5`（10 次）与整份文件 `--repeat-each 3`（18 次）全部转绿，全量 `test:browser` 43 通过 / 2 跳过保持不变。
- **测试新增：** `browser-tests/update.spec.ts` 按 `EXAMPLES` 参数化新增一个用例：`installAndControl` → `deployAndOffer(page, fixtureServer, "v2")` → 点击 `#update-later` → `page.reload()`（应用壳导航是 network-first，在线刷新即取得 v2 的 HTML 与入口脚本，等待中的 worker 未受影响）→ 断言 `#version` 为 `v2` 且 `#update-banner` 出现、文案含 `An update is ready for offline use` → `waitForControllerChange` 包裹点击 `#apply-update` → 断言 `#update-banner`、`#update-reload` 均计数为 0，`readRegistration(...).waiting` 为 `null`。既有的“confirming hands over control…”（陈旧路径，断言 `#update-reload` 仍出现）等用例未改动语义，逐条复跑保持通过。
- **变异检查：** 把两侧 `detectPageCurrency` 结尾的比较从 `... === ownUrl ? "current" : "stale"` 改成 `... === ownUrl && false ? "current" : "stale"`（恒真陈旧），跑新增用例：Vue、React 两个用例均按预期报红（横幅文案停在 `A new version is available`，`toContainText("An update is ready for offline use")` 超时失败）。随后用改动前的文件备份还原，`diff` 逐字节核对两个文件均与还原前完全一致，`git status --short` 仅剩本任务实际改动的三个文件；复跑 `pnpm lint`、示例包 typecheck、`pnpm test`（15 个包、1597 个用例全绿）、`pnpm test:browser --filter @pwa-platform/examples-browser-e2e`（43 通过 / 2 跳过）确认变异前后行为都符合预期。
- **未取得范围：** fetch 失败、响应非 2xx、解析不到入口脚本这三条“陈旧”兜底路径仅代码审阅，未做浏览器变异——真实浏览器里稳定制造 `fetch` 失败或返回损坏 HTML 需要额外的 fixture-server 故障注入，超出本任务范围，规格原文对失败路径的处理标准本就是“保守，维持原行为”，代码路径与成功路径结构对称。
- 未改动 `docs/guides/update-prompt.md`（按任务分工留给主会话处理）；未变更 `scope`、Service Worker URL、manifest ID 或缓存命名空间行为；未新增依赖；未修改任何已交付包；未新增 ADR（没有产生难以逆转的架构决定，100 ms 防抖常量与 `AbortController` 用法都是示例内部实现细节，随时可调）。
- 主会话验收：独立复跑 lint、全量 typecheck、`pnpm test`（130 个文件、1602 项）、本包 `test:browser`（43 passed、2 skipped）与 `recovery.spec.ts` 连续 3 次（均 6/6）。100 ms 防抖是为避开恢复 worker 自行激活时 `updateWaiting` 的瞬时翻转，属时间窗口规避，已在代码注释与指南中说明。`docs/guides/update-prompt.md` 同步：新增“在线刷新与‘页面已是新代码’”一节，状态表、Later 与多标签页要点、React／Vue 片段与已知边界按示例更新；相对链接检查通过。
- 超时补充（2026-09-22，项目所有者确认）：drill 演示后为页面新旧判断加入 5 秒超时（调用方中止与超时共用一个 `AbortController`，超时按旧代码处理）。新增 E2E 以 `context.route` 拦住页面对应用壳的 `fetch`（`resourceType() === "fetch"`）不作应答，断言横幅约 5 秒后以旧代码文案出现且拦截命中；首版按 `sec-fetch-dest` 过滤未命中（该请求无此头），改为按资源类型后通过。变异检查：两示例超时改为 60 秒后两个用例均失败，恢复后逐字节一致。复跑 lint、示例包 typecheck、本包 `test:browser`（45 passed、2 skipped）与 `recovery.spec.ts` 两次（均 6/6）。

## Task List

> Tasks tracked in this plan using local ids (T1–T17). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword——写一个不存在的 issue 号比不写更糟。
>
> 另有一处历史待办随账号恢复一并处理：能力图 `vue-react-adapters` 行的职责描述已于 2026-09-17 修订，issue #8 的正文摘要尚未刷新，需走 `/spec-guard:sync-map`。

### Phase 1：示例应用

- T1 包骨架与 Vue 示例
- T2 React 示例（blocked by T1）

### 检查点：两个示例都能构建（T1、T2 之后）

### Phase 2：浏览器证据

- T3 站点版本与 E2E 骨架（blocked by T2）
- T4 安装与离线 E2E（blocked by T3）
- T5 更新与恢复 E2E（blocked by T4）
- T6 build-verifier 三类校验（blocked by T3）
- T7 上游移交缺口的验证（blocked by T5）

### 检查点：证据齐备（T4–T7 之后）

### Phase 3：交付

- T8 文档同步（blocked by T7）

### 检查点：交付前（T8 之后）

- T9 模块质量门禁（blocked by T8）
- T10 React 测试探针可见性修订（blocked by T9）
- T11 恢复 E2E 稳定性审计（blocked by T10）
- T12 安装图标真实性修复（blocked by T11）
- T13 Android N-1 原生安装核验（blocked by T12）
- T14 React Android N-1 原生安装事件诊断（blocked by T13）
- T15 完整更新提示参考实现（blocked by T14）
- T16 更新提示接入指南（blocked by T15）
- T17 区分“页面已是新代码”的更新提示（blocked by T16）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **端到端测试空过** | 高：站点没构建好、断言恒真，测试照样绿，而本模块的产出就是"证据" | 每一项 E2E 配一次变异（T3–T7 各自列出），证明它会报红；T3 的冒烟测试先确认链路本身通 |
| **两个示例悄悄分叉** | 高：差异会被误读成框架绑定的差异 | 共享同一份身份、策略与界面契约（T2 验收标准），E2E 以站点参数化跑同一批断言 |
| **"未取得"被写成"通过"** | 高：V1 验收矩阵那一行是发布门禁的依据 | 安装项与浏览器范围都明确要求按"未执行"登记；T9 的独立评审把这一点列为审查重点 |
| **恢复演练的缓存对照写错** | 中：删除集合判断失真，而这正是该演练唯一要证明的事 | 缓存名一律用 contracts 的 `appCachePrefix`／`cacheName` 计算；`expectDeletedExactlyUnderPrefix` 同时要求无新增缓存，比对必须在重新预缓存之前完成 |
| **`beforeinstallprompt` 不触发** | 中：安装项取不到证据 | 规格已预先允许按"未取得"登记；不为此降低标准，也不伪造触发 |
| **reload 后观察不到任何事件** | 中：离线与更新场景都要 reload，绑定会随新 window 重建 | T3 的页面辅助函数在 reload 后重新建立绑定，沿用 vite-adapter 踩坑后的做法 |
| **本包 E2E 显著拉长 CI browser job** | 中：两个示例 × 三版本构建 + 四项验证，远超现有任何一个包 | T9 记录实际耗时；若超出可接受范围，由项目所有者决定是否拆分或降低频次，本模块不擅自削减覆盖 |
| **验收标准本身不完整** | 高：Android 与桌面 N-1 拿不到 | 规格已把它写进验收标准第 6 条与已知限制；T8 不修订治理文档，缺口留给项目所有者在 V1 发布前裁决 |

## 执行顺序

任务 1 → 任务 2 → 检查点"两个示例都能构建" → 任务 3 → 任务 4 → 任务 5 → 任务 6（可与 T4、T5 并行，仅依赖 T3）→ 任务 7 → 检查点"证据齐备" → 任务 8 → 检查点"交付前" → 任务 9 → 任务 10 → 任务 11 → 任务 12 → 任务 13 → 任务 14。

每个任务一个提交，提交信息带 `Task: T<n>`（账号不可用期间不写 closing keyword）。

## ADR-0026 更正附录（2026-09-20）

T5/T7/T9 中“确认后提示仍在”与“事件表没有更新已应用事件”的记录是当时实现的准确快照，原文保留以维持审计链。该上游缺口现已由 [ADR-0026](../../docs/adr/0026-update-applied-page-lifecycle-event.md) 接受并落实：页面曾发出 `update-waiting` 后观察到 `controllerchange`，即发出 `update-applied`；Vue 与 React 将其映射为 `updateWaiting = false`。它不引入页面间消息或 Worker 消息协议，也不刷新页面。

随该 ADR 的 A4 证据，两个示例各自通过单标签页确认与两个同 scope 标签页的确认场景；后者由浏览器在两页各自触发 `controllerchange`，测试没有建立 BroadcastChannel、`postMessage` 或测试侧转发。恢复演练仍以 waiting 槽位和 worker 状态为等待条件，不把提示可见性当作 worker 就绪证据。

## 修订：示例接入入口恢复与类生产演练

规格见[模块规格](../../spec/examples-browser-e2e.md)的"修订：示例接入入口恢复"，被演练的模块见 [pwa-entry-resilience](../../spec/pwa-entry-resilience.md) 与 [ADR-0033](../../docs/adr/0033-entry-manifest-supplied-by-the-application.md)。分支 `claude/examples-entry-drill`，基于 `main` 的 `e36b6a2`。每个任务一个提交，提交信息带 `Task: XD<n>`。

### 架构决定

- **代码对称、部署不对称。** 两个示例同时接入插件，保持"两站配置除根目录外逐项相同"这条既有原则；只重新部署 React 的 `drill`。Vue 的 `drill` 站是上一次构建的产物，不含本模块，只作为备用入口的目标 Origin——它不需要接入。
- **清单来源写成业务方该有的样子。** 启动时 `fetch` 同源静态文件，失败即静默跳过；页面钩子只是演练的加速器，不是接入方式。文档与示例注释都要说清这一点，避免接入方照抄钩子。
- **演练脚本放仓库外。** 与恢复演练、原生安装复测一致：驱动脚本与证据存 `pwa-release-records/`，脚本记哈希；仓库内只留结论与引用。
- **执行分工。** XD2 的实现派给 `executor` 子代理；XD3（真实部署与演练）留在主会话，因为它涉及 Cloudflare 写操作与逐项判断。

#### XD1：规格修订与本计划

**验收：** 规格修订节（`bcaa9f6`）与本节一次提交；项目所有者确认后开始 XD2。

#### XD2：示例接入入口恢复（TDD，完成：e885a9b，测试加固 005f298；主会话验收：单元 199 项连续两次通过、既有浏览器场景 47 项无回归、typecheck 与 lint 干净；`packages/entry-resilience/` 零改动；三处变异中两处直接转红（不再吞掉失败、恢复页策略规则被改名），第三处"去掉非 200 短路"最初存活——404 测试桩让 `json()` 直接失败，导致断言在有无该检查时都成立；已把桩改为返回可解析的 JSON 错误体，变异随即转红）

**已知限制（XD3 处理）：** 初始 `entry-manifest.json` 的 `expiresAt` 是写死的 `2026-10-20`，之后会因过期被拒。演练本身按文档直接交入新清单，不依赖这份种子，但 XD3 部署前须把它刷新到当时起算约 30 天。

**范围：** 两个示例的 `vite.config.ts` 并列 `pwaEntryResilience({ identity, maxValidityDays: 30 })`；共用 `POLICY` 增加 `/pwa-entry.html` 资源规则；两个示例的入口代码增加"启动时 fetch 同源 `entry-manifest.json` 并交入"与常驻页面钩子；页面增加结果状态显示；示例的 `public/` 增加一份初始 `entry-manifest.json`（`status: "normal"`、`entries` 为空、序号 1）。

**验收：**
- 两站构建产物都含 `pwa-entry.html` 与其指纹脚本；计划中含 `/pwa-entry.html` 规则；两站配置除根目录外仍逐项相同。
- `entry-manifest.json` 返回 404、返回非 JSON、返回形状非法时，应用都能正常启动并完成 worker 注册，不抛出、不白屏；对应测试各一条。
- `window.__entryUpdate` 与 `window.__entryCheck` 可用，行为与直接调用两个公开函数一致。
- 页面状态显示只显示 `kind` 与 `status`，不出现任何备用 Origin 地址。
- 既有示例测试与浏览器测试全部保持通过，断言不改。

**验证：** 包内 `test`、`typecheck`、`pnpm lint`、`git diff --check`；`pnpm --dir packages/examples-browser-e2e test:browser` 既有场景不回归。

**范围估计：** 中，6–8 个文件。依赖：XD1。

### 检查点（XD2 之后）

- 与项目所有者确认真实运行：构建 React 的 `drill` 候选并部署（Cloudflare 写操作，只写 `drill`），随后执行演练。

#### XD3：类生产演练与收口（完成：部署 `901c061f-6d02-400e-8b92-22f620caf576`；两个浏览器各 17 项检查通过；演练过程中发现并修复两个缺陷——示例种子清单的时间戳格式（`0b0a897`）与演练文档第 5 步本身的错误（`dde9a23`）；上传白名单四处执行点补齐（`322fc92`、`5201e2c`）；记录见 [pwa-entry-resilience 验证记录](../pwa-entry-resilience/verification.md)）

**范围：** 经项目所有者同意：构建 React `drill` 候选并按现有流程部署（打包、R2 制品、`deploy --mode=deploy`，后置步骤自动索引与归档）；编写演练驱动脚本（Playwright，Chrome N 与 N-1，客户端级拦截模拟当前 Origin 不可达）；按[入口恢复演练](../../docs/operations/entry-recovery-drill.md)执行第 1–6 步；证据写入仓库外 `pwa-release-records/`；演练记录写入 [pwa-entry-resilience 验证记录](../pwa-entry-resilience/verification.md)，本模块[验证记录](verification.md)交叉引用；[入口恢复的后续事项](../pwa-entry-resilience/plan.md)第 1 项标记完成。

**验收：**
- 演练第 1–6 步在 Chrome N 与 N-1 下全部通过；任一步出现"未点击即导航""展示形状非法或已过期的入口""更小序号覆盖已存记录""离线时展示入口"即记为失败并如实记录。
- 记录标注"当前 Origin 不可达为客户端级模拟"，不声称真实域名故障。
- `main` 槽位与生产站在演练期间无任何写操作（以部署前后的部署列表与当前部署 ID 佐证）。

**验证：** 相对链接检查；`git diff --check`；Spec Guard 只读核验与 main 对照。

**范围估计：** 中，脚本 1 个（仓库外）、文档 3 个。依赖：XD2 与项目所有者同意。

#### XD4：质量门禁（完成：全仓 lint、typecheck、build 退出 0，`pnpm -r --no-bail test` 16 个包全部通过；Spec Guard 与 main 相同）

**范围：** 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；结果写入本模块验证记录。

**验收：** 全部通过；Spec Guard 与 main 相同。

**范围估计：** 小。依赖：XD3。

### Task List（修订）

- XD1 规格修订与本计划
- XD2 示例接入入口恢复（blocked by XD1 与确认）
- 检查点：项目所有者同意部署 React `drill` 并执行演练
- XD3 类生产演练与收口（blocked by 检查点）
- XD4 质量门禁（blocked by XD3）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 误部署到 `main` 或生产 | 高：影响现有测试站与已安装用户 | 部署命令只用 `--slot=drill`；部署前后记录两站 `main` 的当前部署 ID 作为未改动的佐证 |
| 接入方照抄常驻钩子 | 中：生产站暴露可交入清单的接口 | 示例注释与规格的安全边界一节都写明"生产应用不应暴露"；演练记录复述一次 |
| `entry-manifest.json` 取不到导致示例白屏 | 中：既有浏览器场景全部受影响 | 三种失败形态各一条测试；失败时静默跳过，不影响注册流程 |
| 客户端级拦截不等于真实域名故障 | 中：高估恢复能力 | 记录与演练文档均标注为模拟；真实故障形态仍列为未取得 |
| 两站配置漂移 | 低 | 验收要求"除根目录外逐项相同"，由既有对比测试守住 |

### 执行顺序（修订）

XD1 → 确认 → XD2 → 检查点 → XD3 → XD4。

## 修订：示例接入离线页、manifest 扩展字段与网络超时

规格见[模块规格](../../spec/examples-browser-e2e.md)的同名修订节（2026-09-24 已评审通过）。分支 `claude/examples-new-capabilities`，基于 `main` 的 `41b3d5e`。每个任务一个提交，提交信息带 `Task: XC<n>`。

### 架构决定

- **两站配置保持逐项相同。** 三项都写在共用的 `apps/shared/identity.ts` 或两边相同的插件选项里；截图是唯一按站点区分的内容（各截各的首页）。
- **先离线页与超时，再 manifest。** 两者都改 `identity.ts`，串行执行避免冲突；前者改动面小、先建立"示例改配置后既有场景不回归"的基线。
- **执行分工。** XC2、XC3 的实现派给 `executor`（sonnet）；变异检查、验收与门禁留在主会话。不部署 Cloudflare。

#### XC1：规格修订与本计划

**验收：** 规格修订节（`17cfd85`）与本节提交；项目所有者确认后开始 XC2。

#### XC2：离线页与网络超时（TDD，完成：`4abd8ec`；主会话验收：示例单元 245 项、浏览器全量 49 项、超时场景 `--repeat-each 5` 10/10，耗时 5.4–5.6 秒；TDD 红灯为未开启超时时场景挂到 Playwright 30 秒超时；变异"去掉 `networkTimeoutSeconds`"两站超时场景均转红）

**范围：** 两站 `vite.config.ts` 增加 `offlinePage: { locale: "en" }`；删除两个 `public/offline.html`；共用 `POLICY` 增加 `networkTimeoutSeconds: 5`；`offline.spec.ts` 的离线页断言改为生成页（标题 "You're offline"、显示 `install.name`、不出现应用壳）；同文件新增网络超时场景（两站各一）。其他引用旧离线页文案的测试（若有）同步改为生成页。

**验收：**
- 两站构建通过，`/app/offline.html` 由插件生成并进入预缓存。
- 超时场景：`context.route` 挂起未缓存路由的导航不放行，显示离线页，耗时 ≥ 4.5 秒且 ≤ 15 秒。
- 其余既有浏览器场景与单元测试不改、全部通过。

**验证：** 包内 `test`、`typecheck`；`pnpm lint`；`git diff --check`；`test:browser` 全量；超时场景 `--repeat-each 5`。主会话变异：去掉 `networkTimeoutSeconds` 后超时场景转红。

**范围估计：** 中，约 6 个文件。依赖：XC1。

#### XC3：manifest 扩展字段、截图与 Cloudflare 白名单（TDD，完成：`654025c`，注释措辞 `b9e1c28`；主会话验收：示例单元 247 项、浏览器全量 51 项；两站构建无 `install.*` 警告；四张截图为真实截取，IHDR 与声明一致；变异"删除一张截图"构建以 `verify.manifest-asset-missing` 失败，"去掉部署脚本的截图规则"脚本测试转红；build、package、restore 三个脚本没有既有测试工具，同一正则未经测试覆盖，登记为已知缺口）

**范围：** 共用 `INSTALL` 增加 `description`、一个指向 `/app/` 的快捷方式（复用 192 图标）、`wide`（1280x800）与 `narrow`（750x1334）两张截图；用 Playwright 分别截取两站首页，存入各自 `public/screenshots/`；`install.spec.ts` 补新字段与截图的 PNG 头尺寸断言；四个 Cloudflare 脚本（build、package、deploy、restore）的白名单允许 `app/screenshots/(wide|narrow).png`，并在既有脚本安全测试中补"允许截图""白名单外新文件仍被拒绝"两例。

**验收：**
- manifest 字段与声明一致；每张截图可从构建站点取得，PNG 头尺寸与 `sizes` 一致。
- Cloudflare 构建脚本对截图不报错，对白名单外新文件仍报错。
- 其余既有测试不改、全部通过。

**验证：** 同 XC2；截取方法记入验证记录。主会话变异：删除一张截图后构建以 `verify.manifest-asset-missing` 失败；去掉白名单的截图规则后脚本测试转红。

**范围估计：** 中，约 10 个文件（其中 4 个 PNG）。依赖：XC2。

#### XC4：质量门禁、独立评审与收口（完成：门禁在 `17a00db` 全部通过；独立评审无阻断项，修复 `9206636`；记录见[验证记录](verification.md)"修订：示例接入离线页、manifest 扩展字段与网络超时"）

**范围：** 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 与示例浏览器全量；新上下文独立评审；结果写入本模块[验证记录](verification.md)；本节任务标记完成。

**验收：** 全部通过；评审阻断项修复；Spec Guard 与 main 相同。

**范围估计：** 小。依赖：XC3。

### Task List（XC 修订）

- XC1 规格修订与本计划
- XC2 离线页与网络超时（blocked by XC1 与确认）
- XC3 manifest 扩展字段、截图与 Cloudflare 白名单（blocked by XC2）
- XC4 质量门禁、独立评审与收口（blocked by XC3）

### 风险与缓解（XC 修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 超时场景受机器负载影响而不稳定 | 中：门禁偶发失败 | 上限留到 15 秒；`--repeat-each 5` 验证 |
| 其他场景依赖旧离线页文案 | 低：既有测试转红 | XC2 先全仓搜索 `You are offline` 与 `#offline` |
| Cloudflare 白名单漏改一处 | 中：下次部署或恢复失败 | 四个执行点逐一改并有测试；XC4 评审专门核对 |
| 截图与源码日后不一致 | 低：安装对话框展示旧界面 | 规格已写明截图是静态记录；验证记录给出重新截取方法 |

### 执行顺序（XC 修订）

XC1 → 确认 → XC2 → XC3 → XC4。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| developer-entry | `README.md` | 指向示例与接入指南。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 登记示例模块及其依赖。 |
| v1-acceptance | `docs/architecture/v1-acceptance-matrix.md` | 示例与 E2E 为矩阵中的浏览器场景提供证据。 |
| examples-browser-e2e | `docs/guides/update-prompt.md` | 交付更新提示的接入写法。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| developer-entry | delivered | `README.md` | README 指向包导览与示例。 |
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块与依赖已登记。 |
| v1-acceptance | delivered | `docs/architecture/v1-acceptance-matrix.md` | 矩阵中的浏览器场景由本模块的真实浏览器测试提供证据。 |
| examples-browser-e2e | delivered | `docs/guides/update-prompt.md` | 更新提示接入指南已交付，2026-09-22 随补充修订更新。 |
