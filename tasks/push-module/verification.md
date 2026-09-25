# 验证记录：push-module

> 模块质量门禁（T9）的可复现结果。本模块的任务以本地编号 T1–T9 记录在 [plan.md](plan.md)；没有使用远端 tracker。本文汇总门禁证据，逐次实现和变异细节见计划中的实施记录。

## 环境与对象

- 日期：2026-09-19
- 分支：`feat/push-module`，已从基点 `54a6ab7` rebase 到本地 `main` `5fe9b0a`
- 环境：Node v24.18.0、pnpm 11.18.0、macOS arm64、Google Chrome 153.0.8010.50（本机安装，`channel: "chrome"`）、Playwright 1.63.0
- 被验证的代码提交：文档后基线 `bf2ead3`；评审 P1 修复 `e80fa5e`。本文件随后 amend 到同一个 T9 提交，未产生额外提交。

| 提交 | 标记 | 内容 |
|---|---|---|
| `4ecd56a` | T1 | ADR-0021 提议稿与浏览器探路 |
| `2559b10` | T1 | 接受 ADR-0021 |
| `50c7498` | T2 | sw-runtime 的零依赖 Push 格式 |
| `d6e5354` | T3 | 平台 worker 的 Push 与通知点击 |
| `d4937c7` | T4 | 恢复 worker 取消订阅 |
| `09bee86` | T5 | `@pwa-platform/push` 后端入口 |
| `97d0bbc` | T6 | 页面订阅入口 |
| `facab5a` | T7 | 真实浏览器证据 |
| `bf2ead3` | T8 | 文档同步 |
| `e80fa5e` | T9 | 评审发现的浏览器 API 错误清洗与本验证记录 |

## 干净 worktree 门禁

在会话临时目录新建两个 detached worktree。第一个从 `bf2ead3` 检出，取得评审前基线；第二个从 `e80fa5e` 检出，取得 P1 修复后的最终结果。离线安装起初因本机 store 缺少已锁定的 `@eslint/js@10.0.1` tarball 失败；经项目所有者授权完成一次不改 lockfile 的冻结安装后，第二个 worktree 的 `--offline` 安装通过。

| 命令 | `bf2ead3` | `e80fa5e` |
|---|---|---|
| `pnpm install --frozen-lockfile --offline` | store 缺 tarball；授权后冻结安装通过 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0 | 退出 0 |
| `pnpm test` | 退出 0 | 退出 0；`sw-runtime` 185、`push` 121 条通过 |
| `pnpm typecheck` | 退出 0 | 退出 0 |
| `pnpm test:browser` | 退出 0 | 退出 0 |
| `sw-runtime` `push.spec.ts --repeat-each=10` | 30/30 通过，单 worker 串行 | P1 不触及 worker 或浏览器路径，保留此独立基线证据 |
| `push` 浏览器场景 `--repeat-each=10` | 80/80 通过，单 worker 串行 | P1 只清洗单元测试中构造的 Promise rejection，保留此独立基线证据 |

最初未提升权限运行 `pnpm test` 时，browser-test-harness 绑定 `127.0.0.1` 被沙箱拒绝为 `EPERM`；同一干净 worktree 在允许本机 loopback 后全绿，故该错误是执行环境限制而非断言失败。

## 浏览器矩阵

| 字段 | 值 |
|---|---|
| 必测范围 | Chrome 桌面端 N；Chrome Android N 与 N-1 |
| 本次执行 | Chrome 桌面端 153.0.8010.50 |
| 未执行 | Chrome 桌面端 N-1；Chrome Android N 与 N-1 |
| 结论 | **按矩阵计为未通过**：Android 两档未执行；桌面端 N 的全部可执行场景通过。 |

## 场景、变异与恢复演练

- Chrome 桌面端以 CDP `ServiceWorker.deliverPushMessage` 验证合格 Push 的标题、正文、tag 与 data；非 JSON 和多余字段 Push 不显示平台通知；合成 `notificationclick` 证明处理函数关闭通知。
- 页面入口在真实注册下覆盖无注册、权限状态、无可达 Push 服务时的订阅失败、无效公钥、无订阅取消、兄弟 scope 与宽 scope 误匹配。重复运行分别为 worker 30/30、页面入口 80/80。
- T7 的变异已证明：提前返回 Push 监听、改标题、取消 `notification.close()`、去掉 scope 精确比较、把有注册误报 subscribed，及主会话让不合格 Push 显示固定标题时，各自使目标场景转红。
- T9 独立评审发现 `getRegistration()` / `getSubscription()` 拒绝会原样透出。主会话新增三条带 endpoint 标记的 RED 测试，均先失败；修复后转绿。关键变异把唯一的 `push.registration-failed` 映射改成 `push.unsubscribe-failed`，两条目标断言转红；用补丁还原后 `packages/push/src/client/index.ts` 的 SHA-256 恢复为 `1bb4821d0018454992786a0a4e492d5762ad85f8e73b82347eb36f3932df31b0`。
- 恢复 worker 演练覆盖删除本应用缓存、`getSubscription()` / `unsubscribe()` 拒绝后仍 `clients.claim()`；其已知边界不变：若 `getSubscription()` 永不返回，接管会一直等待。

## 供应链与 lockfile 审阅

相对 `main`，`pnpm-lock.yaml` 只新增 `packages/push` importer：生产依赖 `@pwa-platform/sw-runtime: workspace:*`，以及已有版本的开发依赖 `@playwright/test@1.63.0`、`@pwa-platform/browser-test-harness: workspace:*`、`@types/node@24.13.4`。没有新解析包、第三方生产依赖或供应链豁免。

## 独立评审

新上下文审阅 `main...bf2ead3`，检查隐私泄漏、点击 scope、fetch/缓存、不使用 Push 的应用、恢复接管和测试空过，并复核四项已知边界。

- **阻断项：无。**
- **应修项 1 条，已修：** 浏览器 `getRegistration()` / `getSubscription()` 的拒绝原样透出，无法证明其中不含订阅地址。现已统一映射为 `push.registration-failed` 或 `push.subscription-failed`，不附带 `cause` 或动态值；三条 endpoint-marker 回归测试和主会话变异证明覆盖。
- 点击范围检查未发现绕过：跨源、scope 外、`..`、编码的 `..`、前缀相似和凭据均被测试覆盖。`%2f` 仍按字面保留在 scope 内，依赖服务器不规范化路径。
- Push/点击监听不读写缓存，未改变 fetch router；不用页面入口的应用不加载 Push 代码或请求权限。恢复取消的 rejection 被吞掉并继续接管。
- T7 并行时发生过一次点击场景失败，串行 30/30 通过但根因未查证；保留为未取得证据，而非推断成代码缺陷。

## 未取得的证据

- CI（包括 Node 22/24 与 browser job）未取得；本地门禁不能替代 CI。
- Chrome Android N 与 N-1、Chrome 桌面端 N-1 未测试。
- 真实 Push 服务、真实订阅成功未取得；真实通知点击后的打开或聚焦未取得，合成事件只证明关闭通知。
- 本机 Chrome 中，临时最小 worker 的 360 次投递里，Push 处理函数和 `showNotification()` 都 360/360 成功，但约 20%–65% 的通知登记后 `getNotifications()` 始终查不到；页面直接调用 `showNotification()` 也复现，根因未查证。正向场景按同 tag 最多十次重投等待可见，反向场景重复投递降低漏检率。
- T7 那次并行运行的点击场景失败与另一包的浏览器启动超时没有根因证据；本门禁严格串行，未复现。

## 修订：真实订阅与真实送达（2026-09-24）

规格见[模块规格](../../spec/push-module.md)"修订：真实订阅与真实送达的证据收尾"，任务 XP1–XP9 见[计划](plan.md)。`@pwa-platform/push` 与 sw-runtime 的源码未改动，全部改动在私有的示例包中。

### 环境与对象

- 分支 `claude/pwa-platform-review-cba86f`，基点 `main` `c68925b`
- Node v24.18.0、pnpm 11.18.0、macOS arm64、Google Chrome 153.0.8010.50（探针与 XP2–XP6 期间），153.0.8010.53（XP8 时本机版本）、Playwright 1.63.0

| 提交 | 任务 | 内容 |
|---|---|---|
| `486be69`、`8b89e10` | XP1 | 规格修订与计划 |
| `e6c9203` | XP2 | 测试用发送器（VAPID 与 aes128gcm，只用 `node:crypto`） |
| `78281c9` | XP3 | React 示例的 Push 演示面板 |
| `1281989` | XP5 | `push:keys` 与 `push:send` |
| `6293e19` | XP4 | 联网套件 |

### 已取得的证据

- **真实订阅成功**：联网套件经演示页订阅，得到 `https:` 的 FCM endpoint；页面 HTML 中不含 endpoint、`p256dh` 与 `auth`。
- **经真实推送服务送达**：`createPushPayload` 构造的推送经 FCM 返回 `201`，平台 worker 展示的通知标题、正文、tag 与 `data` 与构造值一致。
- **不合格推送不展示平台通知**：带多余字段的推送被 FCM 接受（`201`），随后发送的哨兵通知展示后，平台通知中只有哨兵。FCM 不保证顺序，不合格推送"已到达 worker"是推断而非观测；该断言能够变红由 XP9 补做的变异证明（见下文"XP9"）。
- **取消订阅后的失效响应**：`unsubscribePush` 之后向旧 endpoint 发送，返回 `404` 或 `410`，与接入说明"后端据失效响应清理"的依据一致。
- **重复运行**：`test:browser:network --repeat-each 5` 20/20 通过，本轮没有触发新订阅被拒的重试。
- **默认门禁不受影响**：默认 `test:browser` 的用例清单仍为 7 个文件 47 项，不含联网用例。
- **变异**：发送器中去掉 `0x02` 分隔符（3 项转红）、JWT 的 `aud` 改为完整 endpoint（1 项转红）；平台 worker 的 `push` 监听直接返回、合格负载改为不合格负载（联网场景各自转红）。恢复后重新通过。
- **RFC 8291 附录 A 测试向量**：加密结果逐字节一致；向量中每个值都在 RFC 原文中逐字核对过。
- **本地脚本冒烟**：`push:keys` → 演示页订阅 → `push:send` 输出 `status 201`，通知字段与参数一致；输出中不含 endpoint 与密钥。

### `getNotifications()` 查不到通知（XP6）

限时查证，脚本在会话临时目录，未入库。

| 条件 | 查询方式 | N | 丢失率 |
|---|---|---|---|
| CDP 投递，非持久化 context | 批量投递后统一查询 | 40 | 0–2.5% |
| 页面直接 `showNotification()`，非持久化 | 批量后统一查询 | 40 | 0% |
| CDP 投递，非持久化 | 逐条投递后立即每 100 ms 轮询 | 40 | 97.5% |
| 页面直接 `showNotification()`，非持久化 | 逐条调用后立即每 100 ms 轮询 | 40 | 55% |
| CDP 投递，持久化 context | 逐条投递后立即每 100 ms 轮询 | 10 | 100% |
| CDP 投递，非持久化 | 逐条紧密轮询，结束后再等 10 s 统一复查 | 10 | 100%（复查仍不可见） |
| 真实 FCM，持久化（探针） | 批量后统一查询 | 30 | 0% |

**结论**：触发条件是"通知创建后立即对其紧密轮询 `getNotifications()`"这一查询方式；与投递方式、context 是否持久化无关，丢失是永久的而非延迟。Chromium 内部机制未查明；"真实 FCM + 逐条紧密轮询"这一组合未直接测试，按其余结果推断同样会丢。

**对现有测试的影响**：sw-runtime `push.spec.ts` 中 `waitForTagState` 的查询节奏正是触发方式，因此其"同 tag 重投"的变通仍然必要；要去掉变通，应改查询方式而不是投递方式。按计划，本修订不改该测试，另开任务处理。联网套件从一开始就采用"先等 2 秒、再每 2 秒查询一次"。

### 联网套件中处理的环境现象

- **新订阅偶发被拒**：15 个新订阅的首次发送中有 3 个返回 `410`，1 个约 5 秒后转为 `201`，2 个 30 秒后仍为 `410`。原因未查明，与平台无关（订阅在 Chrome 与 FCM 之间）。套件在测试自己的消息之前先发一条预热推送，被拒时重发最多 8 秒，仍不行则重新订阅，最多 3 次，并在测试注解中记录每次重试。
- **首次订阅耗时**：12 个全新 profile 的订阅耗时多为 5–6 秒，最长 14 秒；首次整套运行中有一次超过 30 秒，订阅等待因此设为 60 秒。

### 证据更新与仍未取得的项目

- **真实点击后的打开或聚焦（XP7）**：2026-09-25 已在“中凯”和原日常“嘉年”Chrome 资料中分别取得两项人工点击证据；“嘉年”资料初次未显示通知、重订阅后通过的过程见下文。
- **断网时联网套件明确失败**：未执行（需要断开本机网络，由项目所有者配合）。按构造，订阅失败时 `#push-result` 显示诊断码而非 `subscribed`，断言失败，不会跳过；但这只是推理，没有实测。
- Chrome Android N 与 N-1：未执行。Chrome 桌面端 N-1 的真实 FCM 联网四场景已于 2026-09-25 补测通过；N-1 人工点击与其余矩阵场景仍未取得，见文末后续记录。
- CI：未取得（GitHub 不可用，ADR-0031）。联网套件本就不进入 CI。

### XP9：质量门禁与独立评审（2026-09-24）

**干净 worktree 门禁**（会话临时目录中新建 detached worktree，检出 `08302d0`）：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --offline` | 退出 0 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；全仓单元测试共 2125 项通过 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test:browser` | 退出 0；9 个包共 204 项通过（其中 examples-browser-e2e 47、sw-runtime 44、push 8） |
| `test:browser:network`（examples-browser-e2e） | 退出 0；4 项通过 |
| 运行后 `git status` | 无改动 |

`git diff --stat c68925b..28faba3 -- packages/push packages/sw-runtime` 为空。lockfile 相对 `main` 只多一个 workspace importer（`@pwa-platform/push: link:../push`），没有新解析的第三方包。

**独立评审**（新上下文，审阅 `c68925b..08302d0`）：阻断项 0，应修项 3，均已在 `28faba3` 处理：

1. 预热重试原先对所有非 201 状态生效，失败时一律归为环境问题；现在只对 404/410 重试，其他状态（如 VAPID 不匹配的 403）直接以原状态码失败。
2. 场景 3 原先只能推断不合格推送已到达 worker，且没有变异证明负向断言能变红；测试名与文档改为"被 FCM 接受（201）"，并补做变异：让 sw-runtime 的格式校验放过未知字段，场景 3 转红（平台通知多出一条），恢复并重建后通过。
3. 场景 1 的 `not.toContain` 失败时会把 endpoint 与密钥打进报告；改为布尔断言。

同时采纳的建议：`vapid.json` 创建时即为 `0600`，并新增一项真实文件系统测试（目录预先为 `0755`、`--force` 覆盖 `0644` 的旧文件）；变异"去掉写入后的 chmod"使 2 项转红。演示面板丢弃乱序返回的状态读取。接入说明补上前置 `pnpm build`，订阅文件改存到被 git 忽略、只有本人可读的 `.push-demo/`。

未采纳、如实记录的建议：`sendTestPush` 对超长明文没有提前拒绝（`createPushPayload` 已限制 3072 字节，走不到）；`send.ts` 的若干体验问题（以 `--` 开头的值被拒、不传 `--subscription` 时等待 stdin）；直接运行 `.ts` 需要 Node 22.18 及以上的类型剥离，与 release-verifier 相同，未单独写入 `engines`。

**修复后复跑**（`28faba3`）：示例包单元测试 245 项、既有浏览器场景 47 项、联网套件 4 项全部通过。

## XP6 后续：sw-runtime 通知查询改为稀疏轮询（2026-09-24）

计划见[计划](plan.md)"后续：sw-runtime 通知查询改为稀疏轮询（XP6 后续）"。只改 `packages/sw-runtime/browser-tests/push.spec.ts`；`git diff 08302d0 -- packages/sw-runtime/src` 为空。

### 环境与对象

- 分支 `claude/gifted-jackson-393ce1`，基于 `08302d0`，之后合入 `main` 的 `66f4131`
- Google Chrome 153.0.8010.53、Playwright 1.63.0、macOS arm64；sw-runtime 的 Playwright 配置为单 worker

| 提交 | 任务 | 内容 |
|---|---|---|
| `afd279d` | — | 计划 |
| `cb14652` | PQ1 | `waitForTagState` 改为先等 2 秒、再每 2 秒查询一次（等出现与等消失都用这个节奏）；暂时保留重投 |
| `3fc37ca` | PQ2 | 去掉 `deliverPushUntilShown`，每个推送只投递一次；去掉为重投放宽的 60 秒用例超时 |

### 测量

每组都是 `push.spec.ts --repeat-each 10`，也就是 3 个用例各跑 10 次。临时改动在提交之后施加，跑完即恢复。

| 组 | 查询方式 | 投递 | 结果 |
|---|---|---|---|
| PQ1 基线（`cb14652`） | 稀疏 | 最多重投 10 次 | 30/30 通过 |
| 对照 | 紧密（50 ms，恢复原写法） | 1 次 | 16/30 失败（合格 4、不合格 4、点击 8），失败都是等待超时 |
| 实验，第 1 轮 | 稀疏 | 1 次 | 30/30 通过 |
| 实验，第 2 轮 | 稀疏 | 1 次 | 30/30 通过 |
| 最终版（`3fc37ca`） | 稀疏 | 1 次 | 30/30 通过 |

**结论**：在本套件里，丢失同样由查询方式触发，与 XP6 一致；改为稀疏查询后，只投递一次的 90 个用例（实验两轮与最终版）全部通过，重投因此去掉。0/90 只能说明单次丢失率大概率低于 3.3%（95% 置信上界），不能证明丢失率为零。T7 记录与 XP6 小节中"重投仍然必要"的说法由本节取代，原文作为历史保留。

不合格推送用例的语义不变：每种不合格推送仍投递 8 次，哨兵最后投递，判据仍为 `isPlatformShown`。只更正了注释：T7 测得的"约一半不可见"来自当时的紧密轮询。

### 变异

变异施加在 sw-runtime 源码上，不提交；浏览器测试的全局 setup 直接从 `src` 打包，所以变异会生效。

| 变异 | 预期转红的用例 | 结果 |
|---|---|---|
| 不合格推送也展示带 `data.url` 的通知 | 不合格推送 | `--repeat-each 3`：3/3 转红，其余用例通过 |
| `notificationclick` 不再关闭通知 | 点击 | 最终版：整套 `--repeat-each 3` 中 2/3 转红、1/3 **空过**；随后单跑点击用例 10/10 转红，整套 `--repeat-each 10` 10/10 转红。合计 23 次中空过 1 次 |

空过那次耗时 12.6 秒，与转红的用例一样，是在"消失"等待快到时限时才发现通知不见了。也就是说，没有任何代码关闭它，通知却在约 10 秒后自行消失，机制未查明。对比：改动前的旧写法（`08302d0` 的 `push.spec.ts`）在同一变异下单跑 10 次、整套 10 次，共 20 次全部转红。1/23 与 0/20 的样本太小，不足以判断是否为本次改动引入的差别。按现有数据，点击用例对"不关闭通知"这类回归单次运行的检出率约为 96%。

### 其他检查

- `pnpm --filter @pwa-platform/sw-runtime typecheck`、`eslint`（该文件）、`git diff --check`：通过。
- sw-runtime 全部浏览器场景（`pnpm --filter @pwa-platform/sw-runtime test:browser`，合入 main 之后）：44/44 通过。

## 点击场景偶发失败的根因调查（2026-09-24）

针对上文"T7 并行时发生过一次点击场景失败……根因未查证"与"未取得的证据"中的同一条。调查由 sonnet 子代理在隔离工作区执行（基于 `main` 的 `ca24caa`，不改代码），主会话核对了它引用的记录与运行日志。环境：macOS arm64、Google Chrome 153.0.8010.53、Playwright 1.63.0。

| 代码 | 同时运行的负载 | 点击场景 `--repeat-each 20` |
|---|---|---|
| 现行（稀疏查询、单次投递） | 无 | 20/20 通过 |
| 现行 | `push` 包浏览器全量 `--repeat-each 10` | 20/20 通过 |
| 现行 | `client-runtime` 与 `vite` 两包浏览器全量 `--repeat-each 15`，全程重叠 | 16/20 通过；3 次为 `click-target` 10 秒内未出现，1 次为 `browser.newContext: Test ended.` |
| 旧写法（`cb14652^`，50 ms 紧密轮询） | 无（紧接重负载一轮之后运行，可能残留负载） | 19/20 通过；1 次浏览器启动超时 |

**结论：**

- **T7 那次失败**大概率来自旧测试的紧密轮询：症状是页面刚确认通知存在、worker 随即读不到，与 XP6 查明的 Chrome 153 行为一致（紧接创建后紧密查询 `getNotifications()` 会使通知永久查不到）；上文"XP6 后续"一节的对照组也在无负载下以旧写法让点击场景失败 8/30。该机理已由 `cb14652`、`3fc37ca` 消除。这是推断：旧写法叠加重负载的组合未在受控条件下复现。
- **剩余风险**：现行写法在重负载下仍会失败，机理不同（等待超时与浏览器资源争用，而非通知丢失），属测试环境问题，不是产品缺陷。项目所有者决定全仓 `pnpm test:browser` 改为逐包串行（`e292ba0`，[browser-test-harness 增补](../../spec/browser-test-harness.md)），门禁不再同时启动多个包的浏览器。改动后以假 `pnpm` 核对参数：只有不带 `--filter` 的 `test:browser` 带 `--workspace-concurrency=1`，`build`、`test`、`typecheck` 与带 `--filter` 的调用不变；随后全仓 `pnpm test:browser` 逐包运行，9 个包共 223 项全部通过，含构建共 206 秒。

运行日志为会话本地文件，未入库。上文两处"根因未查证"的原文作为历史保留，由本节取代。

## XP7：原“嘉年”Chrome 资料的人工取证（2026-09-25）

**环境与证据性质：** macOS 15.7.3（arm64）、Google Chrome 153.0.8010.53，桌面日常资料“嘉年”、`http://localhost:4173/app/`。项目所有者亲自观察并点击系统通知、回报结果；助手操作演示页、发送推送和清点浏览器标签。点击结果属于人工证据，没有用自动化测试代替。

| 情况 | 本次结果 | 证据状态 |
|---|---|---|
| 已有 `/app/` 窗口，点击通知后聚焦 | 初次发送和其后一次复测均返回 `201`，但项目所有者确认通知中心没有对应通知。再次取消订阅并重订阅后，发送“XP7 嘉年重订阅复测 09-25”返回 `201`；项目所有者在通知中心看到并亲自点击，已有 `/app/` 窗口被聚焦。 | **通过：聚焦已有窗口** |
| 没有 `/app/` 窗口，点击通知后新开 | 保存新订阅后关闭“嘉年”资料唯一的 `/app/` 标签，清单确认只剩空白标签。发送“XP7 嘉年无窗口新开验证 09-25”返回 `201`；项目所有者亲自点击后确认新开 `/app/`，浏览器清单随后出现该新标签。 | **通过：新开 `/app/` 页面** |

**排查记录：** 旧订阅连续五次发送均返回 `201`，日常资料无通知，`chrome://gcm-internals` 的 Receive Message Log 当时为空。相同时间、相同 Chrome 版本、相同 Cloudflare WARP 网络路径下，XP4 联网套件 4/4 通过，真实 FCM 推送能送达并展示系统通知，因此现有证据不支持把本机网络路径认作通用故障。项目所有者在演示页取消订阅再重新订阅：向旧订阅于 23:29:01 发送返回 `410`；向新订阅于 23:31:36 发送返回 `201`，但项目所有者确认没有弹出通知。`201` 只证明推送服务接受请求，不证明日常资料已收到或展示。Connection、Receive Message Log、Decryption Failure 的复查结果待补记。

**后续复测：** macOS 的 `Google Chrome` 和 `Google Chrome Helper (Alerts)` 通知均已开启，也已允许镜像或共享屏幕时显示通知。在“嘉年”资料的既有订阅上发送“XP7 嘉年资料复测 09-25”，返回 `201`，项目所有者确认通知中心没有该消息。演示页仍显示 `subscribed`，页面错误日志为空。随后助手在该资料中取消订阅、重新订阅，并将页面复制的新订阅经结构校验后仅保存到 Git 忽略的 `0600` 临时文件。重订阅后的两种人工点击结果见上表。由于系统通知设置也在此前发生过变化，且没有这两次发送的 Chrome 接收日志，现有证据只能说明重订阅后链路可用，不能确定初次未显示的唯一原因。

**该资料的结论：** 两种真实通知点击均取得人工证据。没有把订阅地址、订阅密钥或 VAPID 私钥写入仓库。另一资料的较早人工结果见下文。

### 后续诊断：当前 Chrome 资料与 macOS 通知设置（2026-09-25）

用户授权在当前已连接的 Chrome 中复测。该浏览器连接的是“中凯”资料，与上述“嘉年”日常资料不同，因此只能作为对照。新开 `/app/` 演示页，输入与本地 VAPID 文件匹配的公钥；Chrome 显示站点通知授权请求，允许后页面显示 `subscribed`。从页面复制新订阅，经结构校验后只保存到被 Git 忽略的 `0600` 本地文件；向此订阅发送两条不同标题、目标均为 `/app/` 的测试消息，FCM 两次均返回 `201`。页面日志没有与 Push 相关的错误。

随后只读检查 macOS“系统设置 → 通知”：`Google Chrome` 的“允许通知”为 **关闭**，列表中 `Google Chrome Helper (Alerts)` 也标为关闭。Chrome 的站点权限已允许，但操作系统关闭 Chrome 通知，足以解释为何没有 Chrome 的系统通知横幅。此设置尚未修改，等待项目所有者同意。该观察不能证明浏览器是否实际收到上述消息，也不能解释“嘉年”资料先前 Receive Message Log 为空；这两点仍待手动核对。浏览器自动化访问 `chrome://gcm-internals` 被 URL 安全策略拒绝，未尝试绕过。真实点击两种情况仍均未取得。

用户随后自行打开 macOS 的 `Google Chrome` 通知总开关；只读复核显示 **on**，显示方式为横幅。保留“中凯”资料中已有的 `/app/` 标签和原订阅，再发送一条带 `/app/` 目标的测试推送，FCM 返回 `201`。自动截取的 Chrome 窗口没有捕获到系统横幅，尚待项目所有者确认通知中心是否有记录；不能把截图缺席当作未送达。`Google Chrome Helper (Alerts)` 仍为关闭，是否参与此网站通知的显示尚未查明。聚焦与新开窗口的点击结果仍未取得。

再次通过当前演示页的 DevTools 控制台只读调用 `navigator.serviceWorker.getRegistration('/app/').getNotifications()`：注册的 `/app/` Service Worker 处于 active，浏览器通知权限为 `granted`，返回三条仍有效的通知，标题分别对应前两次“中凯资料测试”和开启 Chrome 通知后的测试，三条通知的 `data.url` 均为 `/app/`。这证明三条消息已由该资料的 Service Worker 接收并创建通知；先前“没有收到”的判断仅来自未见横幅，现予更正。此 API 只列当前有效通知，不等同于 macOS 通知中心历史，也不证明系统横幅曾显示。系统设置同时显示 `Google Chrome` 通知为 on、`Google Chrome Helper (Alerts)` 为 off，且“当镜像或共享屏幕时允许通知”为 off；尚不能判定后两项哪一项造成横幅缺席，也不能据此推断“嘉年”资料的接收情况。真实点击结果仍未取得。

按项目所有者建议重启 Chrome 后，于“中凯”资料重新打开已恢复的 `/app/` 演示页，原订阅仍显示为 `subscribed`。重启前的三条通知已不在 `getNotifications()` 当前有效列表中；向原订阅重新发送标题为“XP7 Chrome重启后复测”、目标为 `/app/` 的消息，推送服务返回 `201`，随后 `getNotifications()` 返回该新通知，且 `data.url` 为 `/app/`。因此重启后浏览器接收与 Service Worker 展示仍正常；Chrome 窗口截图未见系统横幅，不能据此确定 macOS 是否显示过横幅。实际点击证据仍未取得。

项目所有者明确授权开启 `Google Chrome Helper (Alerts)` 系统通知。2026-09-25 约 01:02（Asia/Kuala_Lumpur），在“系统设置 → 通知 → 应用程序通知 → Google Chrome Helper (Alerts)”将“允许通知”从 off 改为 **on**，复核通知中心显示和提醒样式均已启用。检查通知总设置时，“当镜像或共享屏幕时允许通知”也已变为 **on**（此前为 off；该变化并非本次操作）。保留“中凯”资料中已有的 `/app/` 标签和订阅，再发送标题为“XP7 辅助通知开启后复测”、目标 `/app/` 的推送，服务返回 `201`。Chrome 窗口截图未包含系统通知横幅；随后由项目所有者从通知中心亲自点击，结果见下节。两项系统设置同时变化，因此不能单独归因于辅助进程开关。

### XP7：当前 Chrome 资料的真实点击人工证据（2026-09-25）

**环境：** macOS 15.7.3（arm64）、Google Chrome 153.0.8010.53、“中凯”个人资料、`http://localhost:4173/app/`。项目所有者授权在当前已连接的资料中复测，并亲自点击系统通知、回报结果；订阅准备、发送和浏览器标签清点由助手操作。这两项发生时尚不能证明另一“嘉年”资料的接收情况；“嘉年”资料随后另行取得两项结果，见上节。通知设置当时为 `Google Chrome` 和 `Google Chrome Helper (Alerts)` 均允许，且允许镜像或共享屏幕时显示通知。

| 情况 | 真实操作与观察 | 人工证据结果 |
|---|---|---|
| 已有 `/app/` 页面 | 向现有订阅发送“XP7 辅助通知开启后复测”，推送服务返回 `201`；`getNotifications()` 记录该通知，目标为 `/app/`。保留已有页面，将 Chrome 留在后台；项目所有者从系统通知中心亲自点击后确认，已有 `/app/` 窗口被聚焦。 | **通过：聚焦已有窗口** |
| 没有 `/app/` 页面 | 先保存订阅、关闭唯一的 `/app/` 标签，通过浏览器标签清单确认 0 个 `/app/`，保留一个空白标签使“中凯”资料继续运行。首次发送“XP7 无窗口新开验证”返回 `201`，项目所有者未点击，不计入结果；随后重发“XP7 无窗口新开验证 2”，返回 `201`。项目所有者亲自点击后确认新开 `/app/` 页面；浏览器标签清单随后出现新的 `/app/` 标签。 | **通过：新开 `/app/` 页面** |

**范围与结论：** 这两次是真实 FCM 推送、macOS 系统通知和项目所有者亲自点击的人工证据，证明“中凯”资料中的聚焦与新开行为；新开在 Chrome 中呈现为标签页。“嘉年”资料随后独立复测通过，结果见上节。两项系统通知设置都发生了变化，不能单独归因哪项使通知可见。订阅地址、订阅密钥和 VAPID 私钥均未入库。

## 后续：Chrome 桌面 N-1 真实 Push 联网取证（2026-09-25）

**范围与环境：** 在基于本地 `main` `2f83b47` 的隔离分支 `codex/push-n1-network-evidence` 中，只让私有示例包的 `test:browser:network` 使用 ADR-0010 已规定的 `PWA_HARNESS_CHROME_PATH`；未设置时保持 `channel: "chrome"`。环境为 macOS 15.7.3 arm64、Node v22.22.0、pnpm 11.18.0、Playwright 1.63.0。N-1 使用 Google Chrome for Testing 152.0.7977.82（`mac-arm64` 官方固定版本归档，187616945 字节；`unzip -tq` 无错，可执行文件 `--version` 报该完整版本）；默认入口为本机 Google Chrome 153.0.8010.53。两次运行均使用全新临时持久化资料，经真实 FCM 送达；测试完成后资料自动删除。

| 联网场景 | Chrome 152 桌面 N-1 | 默认 Chrome 153 |
|---|---|---|
| 演示页真实订阅，订阅内容不渲染到页面 | 通过 | 通过 |
| 合格负载经 FCM 送达，平台 worker 展示规定的标题、正文、tag 与数据 | 通过 | 通过 |
| 不合格负载获 FCM 接受，但平台不展示该通知；合格哨兵展示 | 通过 | 通过 |
| 取消订阅后，旧地址返回 `404` 或 `410` | 通过 | 通过 |

**执行与核验：** Chrome 152 通过 `PWA_HARNESS_CHROME_PATH=<152 可执行文件> pnpm --filter @pwa-platform/examples-browser-e2e test:browser:network` 运行，结果 **4/4 通过（2.1 分钟）**；不设置该环境变量再运行，Chrome 153 **4/4 通过（2.0 分钟）**。隔离工作树的 `pnpm install --frozen-lockfile --offline`、依赖包构建、示例包类型检查、变更文件 ESLint 与 `git diff --check` 均通过。测试断言只输出阶段和状态码，不回显订阅地址、订阅密钥或 VAPID 私钥；平台运行时与公开契约没有改动。

**证据边界：** 本轮证明桌面 N-1 的原有四个真实联网场景，合格通知由 worker 创建；无头测试没有系统通知人工点击证据。Chrome 桌面 N-1 的点击与其他矩阵场景、Chrome Android N/N-1、CI、断网时联网套件失败行为仍未取得；本轮不把桌面 N-1 全矩阵记为通过。
