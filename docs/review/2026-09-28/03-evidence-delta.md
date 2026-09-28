# 功能证据台账增量复核（03-ledger-delta）

- **复核对象**：`docs/operations/feature-evidence-ledger.md`（台账，核查日期栏自称 2026-09-27/28）、`docs/review/2026-09-27/02-feature-support-matrix.md`（矩阵）
- **复核基线**：worktree HEAD `dad5d1e`（`main`，PR #57 合并提交）；另核对 `origin/main` 领先一个纯文档提交 `083c53f`
- **复核环境**：macOS，本机 Google Chrome 153.0.8010.53、Playwright 1.63.0（webkit 26.6、firefox 155.0 均为本机缓存版本，未联网下载）
- **复核方法**：(1) 本机重跑全部测试网关并记录真实输出；(2) 三个只读子代理分别核对台账 30 行中每一行引用的 `文件:行号` 是否仍存在、是否真的断言了"用途"列所称的行为；(3) 对比 `tasks/stable-release-qualification/verification.md`、`docs/operations/browser-release-evidence.md` 与台账，找出应补入的真机证据；(4) 用 `git log` 与源码定位三个候选"缺失功能"提交是否已被台账覆盖。

---

## (a) 测试实跑结果表

全部命令本机实跑，非引用旧记录；除注明外均为本次全新执行。

| 命令 | 结果 | 用时 | 备注 |
|---|---|---|---|
| `pnpm lint` | 通过，exit 0 | — | 无告警 |
| `pnpm typecheck` | 通过，exit 0 | — | 16 个包全部 `tsc --noEmit` 通过 |
| `pnpm test`（vitest） | **通过**，16 个包、186 个测试文件、**2428** 个用例全部通过，0 失败 | 数十秒 | 逐包核对：contracts 273、release-tools 117、browser-test-harness 72、core 178、build-verifier 156、engine-workbox 47、sw-runtime 339、offline-write 4、push 121、client-runtime 145、vue 49、vite 241、react 80、entry-resilience 274、nuxt 85、examples-browser-e2e 247。台账 2026-09-28 记录为 2420，`release-0.2.1.md` 记录候选门禁为 2422；本次 2428，多出的用例与 `1df6d62`（quota 测试去 flaky，轮询 cache 名而非快照）等 0.2.1 之后的提交一致，属正常增长，非回归 |
| `pnpm test:browser`（阻断，系统 Google Chrome 153.0.8010.53） | **通过**，9 个包、共 **277** 个用例全部通过，0 失败、0 跳过 | 约 4 分钟 | 逐包：browser-test-harness 22+14、sw-runtime 65、client-runtime 22、push 8、vite 33、entry-resilience 20、nuxt 12、examples-browser-e2e 63、update-notice UI 18（含 `locale="en"` 两个新用例、messages override 两个新用例）。台账记录 276（release-0.2.1.md），本次 277，多 1 条与 R9 相关新增用例（`registration.spec.ts:79` "return visit while an update check is stalled (R9, ADR-0043)"）一致 |
| `pnpm test:onboarding-smoke`（阻断） | **通过**，1 个用例通过 | 12.5s | 从打包 tarball 离线安装验证最小接入 |
| `pnpm test:browser:engines`（不阻断，Playwright 自带 WebKit 26.6 / Firefox 155.0，**本机已缓存，未联网下载**） | **通过**，sw-runtime 套件 **120 个通过、10 个跳过**（跳过均为 Chromium 专有：push 3 类 × 2 引擎 + R8 准入诊断 × 2 + R12 配额清理 × 2 = 10） | 约 1.3 分钟 | 与协调者提供的 CI 事实（GitHub Actions run 36417040999，job "Engine smoke"，dad5d1e，120 passed / 10 skipped）**完全一致**，互相印证。这是 L3-引擎冒烟（WebKit engine / Firefox，ADR-0042 渐进兼容证据），**不代表 Safari 或 iOS**，也不代表 Firefox 桌面稳定版本身（版本由 Playwright 固定） |
| `pnpm test:browser:network`（真实 FCM，需联网） | **未执行** | — | 本次审计未触碰联网推送套件；`release-0.2.1.md` 记录其候选门禁为 4/4 通过，本次不重复验证，如实标注"未执行" |

**结论**：本机全量重跑（lint/typecheck/build 隐含于 typecheck+test 流程/单元/桌面 Chrome E2E/onboarding smoke/WebKit+Firefox 引擎冒烟）**全部通过，无回归**，台账所称"测试运行证据"部分与代码当前状态一致，且用例数因近期提交小幅增长（2420→2428，276→277）方向正确。

---

## (b) 台账逐行复核表（1–30 行，"总表"）

复核方式：核对文件是否存在、行号是否准确、断言内容是否与"用途"列相符。除下表列出的问题外，其余行（1–12、14、17、18、20–30，共 24 行）**确认无误**——引用文件存在、行号准确或在台账自述的"链接已映射到 main，正文行号为历史基线"误差范围内、且断言内容与声称的行为一致，未发现过度声称等级的情况。

| 行号 | 功能名 | 台账声明等级 | 复核等级 | 问题 | 依据 |
|---|---|---|---|---|---|
| 13 | 手动/自动更新检查 | L2+L3 | L2+L3（**引用行号失准**） | "每项详情"外的总表单元/构建列引用 `facade.test.ts:687-781`，但该区间实际是 **`logout`** 测试块（`describe("logout", …)` 起于 697 行附近），`checkForUpdate` 的 describe 直到 772 行才开始，且自动轮询（`updateCheck.intervalMs`）用例实际在约 1284-1340、1565 行，完全在引用区间之外。等级本身不算过高（checkForUpdate 确有单测+E2E），但**行号引用已失效**，按台账维护规则应更新为准确区间 | 本会话直接 `sed -n '680,790p' facade.test.ts` 核实：687 行起是 `applyUpdate`/`unregister` 尾部，697 `describe("logout"...)`，789 `describe("checkForUpdate"...)` |
| 15 | 可选默认更新提示 UI | L3 | L3（**"每项详情"小节内容陈旧，与总表矛盾**） | 总表已正确记录 2026-09-28 起 `locale="en"` 与内置英文文案（PR #31），但"每项详情"第 15 节（约文件第 117 行）仍写"`DEFAULT_MESSAGES` 仅内置 zh-CN……无 locale 字段/en 内置表"，与当前代码矛盾：`react/src/ui.ts`/`vue/src/ui.ts` 均已有 `locale` prop（默认 `"zh-CN"`）与 `PWA_UPDATE_NOTICE_MESSAGES`（含 `zh-CN`/`en`）常量表。这是总表已更新、详情小节未同步的陈旧引用 | 子代理复核 + 本会话 `grep -n "locale" packages/react/src/ui.ts packages/vue/src/ui.ts` 确认 `PwaUpdateNoticeLocale`、`locale = "zh-CN"` 默认值、`PWA_UPDATE_NOTICE_MESSAGES[locale]` 均已存在；`update-notice.spec.ts:127` 确有 `locale "en" renders the built-in English copy` 用例，本次实跑通过 |
| 16 | 恢复 worker | L2+L3 | L2+L3（**细节层面的口径提醒，非错误**） | "删除失败两条（故障注入测试构建，Chrome/WebKit/Firefox，#49）"这一描述属实（`offline-write.spec.ts:189,205` 在 `test:browser` 与 `test:browser:engines` 两条流水线均验证通过，本次实跑复核），但台账未明确提醒：WebKit/Firefox 那部分覆盖来自**不阻断的 engines 任务**（ADR-0042，仅 push 到 main 后/每夜跑，不在 PR 上跑），不是 PR 合并前的强制门禁。建议在"主要缺口"列补一句"三引擎覆盖含非阻断部分"，但不构成过度声称，暂不升级/降级等级 | 子代理复核 + `.github/workflows/ci.yml` 的 `engines` job 条件（`push`/`schedule`/`workflow_dispatch`，非 `pull_request`，`continue-on-error: true`） |
| 19 | 登出 | L2+L3 | L2+L3（**引用行号失准**） | 代码列引用 `facade.ts:449`，但该行实际位于 `promptInstall()` 函数体内；真正的 `logout()` 实现在 **477 行**（`async logout(): Promise<boolean> {`）。测试引用（`facade.test.ts:611-685`、`handover.spec.ts:41`）经核实准确，行为断言无误，仅代码列的行号需要更正 | 本会话 `grep -n "async logout" packages/client-runtime/src/client/facade.ts` → 477；`sed -n '440,460p'` 确认 449 行落在 `promptInstall` 内 |

**其余 26 行**（1–12、14、17、18、20–30）：三个子代理逐行打开引用文件核实，均确认文件存在、行号准确（或在台账自述的历史基线偏移范围内）、且测试断言内容与"用途"列描述的具体行为一致；R12 配额清理（第 21 行）、R9（第 13/14 行相关的 `registration.spec.ts:79`，虽未单独成行但已被行 13/14 间接覆盖）、deny-classes 五类请求（第 8 行）、多标签协调（第 14 行）、`locale="en"` 更新提示（第 15 行主表）、恢复 worker 删除失败故障注入（第 16 行）等 2026-09-28 之后新增的断言均已如实体现在台账中，**没有发现等级虚高（over-claim）的情况**。第 22/25/26/27/29/30 行台账自陈"未逐条列出/未完整读取"等保守说法准确，不构成问题。

---

## (c) 应补入台账的真机证据

台账当前"手机"列的证据截至 2026-09-28 的 R9 复核和 iPhone Vue 0.2.1 演练（即 `verification.md` 到第 331 行为止）。以下真机记录存在于仓库但**尚未反映在台账**中：

| 记录 | 来源 | 应补入的行 | 内容摘要 |
|---|---|---|---|
| **0.2.1 两机 Android 真机轮次**（Xiaomi 14 + Samsung Galaxy A24，均 Android 16 / Chrome N） | `verification.md:264-306`（"2026-09-28：0.2.1 两机 Android 真机轮次与 iPhone R9 复核"） | 第 4 行（SW 注册）、第 5 行（预缓存/应用外壳）、第 7 行（离线页）、第 14 行（更新提示+多标签）、第 16 行（恢复 worker）、第 20 行（安装提示处理） | 首次在线访问、原生安装、断网冷启动、断网访问未缓存路径、更新检测+接管+刷新、恢复 worker（含"只删本应用前缀、预置 `images-v1` 保留"）、修复 worker 后恢复离线启动，两台设备四个场景全部"通过"；**明确记录 N-1 仍未取得**（两台均为 Chrome 153/N），不得判为 `desktop+android` 通道通过 |
| **iPhone R9 复核**（iPhone 16 Pro / iOS 27.0，React Drill） | `verification.md:307-317` | 第 13/14 行（更新检测/更新提示，ADR-0043 相关） | 断网时请求挂起而非失败、排队机制在真机确认、界面层 `not registered` 现象本轮未复现（继续观察）、修复构建回归通过（在线+断网均 registered/受控）——这是 ADR-0043 修复效果的**真机确认**，台账"已知未验证清单"第 4 条虽提到修复但未给出这条具体真机记录的引用行号 |
| **iPhone Vue（0.2.1）安装、离线与恢复演练** | `verification.md:319-331` | 第 4/5/7/14/16/20 行 | 首次访问、主屏幕安装、断网冷启动、未缓存导航离线页（英文）、恢复 worker（含删除 `pwa:pwavuedrill:...precache`、断网请求 5 秒后中止而非应答）、修复 worker 后恢复，全部"通过" |
| **iPhone React 入口恢复单 Origin 故障演练（R3，部分完成）** | `origin/main` 领先提交 `083c53f`（`verification.md:333-354`，尚未合入本 worktree 所在分支，**worktree HEAD 落后 origin/main 一个提交**） | 第 17 行（入口韧性恢复页） | iPhone 16 Pro、React Drill：基线、`migrating` 计划迁移展示与跳转、序号/形状校验、当前 Origin 不可达+已存 `migrating`→展示入口按钮 四步"通过"；`unconfirmed-outage`、离线不误报、过期三步**明确标注"未执行"**（故障注入方法本身受阻：HTTP 代理/PAC 拦不住 iOS HTTP/3、Cloudflare WARP 转发破坏 TLS、同机无法为 iPhone 提供自建 DNS，详见提交内正文）；同时 `docs/operations/entry-recovery-drill.md` 新增一条 iOS 网络层限制的操作提示，`todo.md` 对应勾选状态更新。**这是尚未合入的文档改动，仅在 `origin/main` 存在，建议随下次同步一并补入台账**，不要在本次审计中当作已在 HEAD 生效 |
| **CI 引擎冒烟：GitHub Actions run 36417040999**（dad5d1e，"Engine smoke" job） | 协调者提供的 CI 事实，已用本机重跑交叉验证 | 台账"测试运行证据"章节、第 8/16 行 | 120 passed / 10 skipped，sw-runtime 套件，webkit+firefox，仅在 push to main + 每夜触发，非 PR 门禁；应作为**独立于本机复核**的第二来源写入"测试运行证据"表，加强"WebKit 引擎/Firefox 渐进兼容"证据的可信度，但不升级任何功能等级（与台账第 27 行既有原则一致） |

---

## (d) 缺失功能条目

对协调者与原始任务指出的三个候选提交逐一核实结论：**三项均已被台账覆盖，不需要新增行**，仅第 15 行"每项详情"小节有一处陈旧描述需要同步（见 (b) 表）。

| 提交 | 内容 | 台账覆盖情况 |
|---|---|---|
| `c22f3f3` feat(react,vue): 内置 zh-CN/en 更新提示文案（locale） | `packages/react/src/ui.ts`、`packages/vue/src/ui.ts` 新增 `locale` prop 与 `PWA_UPDATE_NOTICE_MESSAGES` | **已覆盖**：总表第 15 行明确写"2026-09-28 新增 `locale="en"` 与英文覆盖用例（#31）"；仅"每项详情"第 15 节文字未同步更新（见 (b) 表） |
| `b37c112` feat(sw-runtime): 运行时缓存准入拒绝诊断（runtime admission rejection） | `packages/sw-runtime/src/worker/admit.ts` | **已覆盖**：第 21 行"主要缺口"列写"R8 准入诊断（#27）"；`git log` 确认 b37c112 与 PR #27（"fix-r1-r3-r8"）是同一批次提交，引用准确 |
| `2d282d9` feat(build-verifier): `requiredReleaseChecks` 按拓扑推导发布门禁必需检查集 | `packages/build-verifier/src/release-gate.ts`（`requiredReleaseChecks`，49 行起，本会话已核实存在） | **已覆盖**：第 11 行"主要缺口"列与"已知未验证清单"第 9 条均引用（PR #29）；`git log` 确认 2d282d9 是 `claude/required-release-checks` 分支合并提交的核心变更，引用准确 |

未发现其他明显"代码/网站已有但台账完全未提及"的功能——本次审计范围内抽查的三个候选均已被覆盖，说明台账的"新增功能追加行"维护流程近期执行得比较到位。

---

## (e) 浏览器/设备覆盖总表

汇总自台账总表 + 本次实跑 + `verification.md` 全文 + `browser-release-evidence.md`（模板文件，未见已填写的正式发布记录）。

| 平台 | 覆盖方式 | 说明 |
|---|---|---|
| **桌面 Chrome（Windows/macOS/Linux 均视为同一 channel）** | **自动化（L3，阻断门禁）** | `pnpm test:browser`，9 个包 277 用例，本次实跑全部通过；CI 在 Linux 上用系统 Google Chrome，本机用 macOS 系统 Google Chrome 153.0.8010.53，两者均为真实浏览器而非无头模拟 |
| **桌面 Edge** | **无** | 仓库内所有 `playwright.config.ts` 均固定 `channel: "chrome"`，无 Edge 项目；未见任何 Edge 真机/自动化记录 |
| **桌面 Firefox（稳定版，非 Playwright 内置）** | **无**（仅有 Playwright 固定版本的 Firefox 引擎冒烟，见下） | 真正的"用户机器上装的 Firefox 稳定版"未见任何记录；`test:browser:engines` 用的是 Playwright 自带、随 Playwright 版本固定的 Firefox 155.0，不代表用户实际安装的 Firefox 发行版本 |
| **WebKit 引擎（Playwright 内置，非 Safari 本体）** | **自动化，L3-引擎冒烟，不阻断** | `test:browser:engines`，本次实跑 + CI run 36417040999 双源确认 120/10（webkit+firefox 合计）。ADR-0042 明确这只是"WebKit 引擎"级别的渐进兼容证据，**不代表 Safari 或 iOS** |
| **桌面 Safari（Mac）** | **真机（人工，L3，非自动化）** | `verification.md` "R2 Mac Safari 18.6 Vue／React 真实 v1→v2 更新"章节：Vue/React 双窗口更新协调、离线导航与联网探针恢复均通过；无 Playwright/CDP 自动化（Safari 不支持远程调试协议接入 Playwright），全部为人工检查器读数 |
| **Android Chrome（真机）** | **真机（L4）** | 多轮记录：R2 章节（小米实体机，中文安装+图标缺陷修复+旧 v1 DOM 保持）、R3（单 Origin 故障恢复，Android 通过）、2026-09-28 两机轮次（小米+三星，Chrome N，7 场景全通过）。**N-1 始终未取得**——两台实体机均为 Chrome 153（N），`desktop+android` 通道的 N/N-1 双机要求不满足，台账与 verification.md 均已如实标注 |
| **Android 非 Chrome（Firefox/夸克/小米系统浏览器）** | **真机探索性冒烟（不计入门禁）** | `verification.md` "Android 非 Chrome 浏览器冒烟"：Firefox 156.0.1、夸克 10.16.0.1135、小米系统浏览器 20.16.1020421，均验证了浏览器运行、离线回退、自动恢复；安装能力三者不同（小米系统浏览器唯一完成固定快捷方式+独立窗口），明确标注"不属于既定 Android Chrome 发布门禁，不能用来升级 desktop+android 通道结论" |
| **iOS Safari（iPhone 真机）** | **真机（L3 部分场景，ADR-0041 渐进兼容，非生产发布门禁）** | 覆盖广泛：中文安装窗口+网络超时+自动恢复、Vue/React 真实 v1→v2 更新（含断网已下载后接管）、Safari 双标签协调、R9 排队机制修复确认、0.2.1 Vue 安装+离线+恢复演练。**仍缺**：单 Origin 故障恢复的 `unconfirmed-outage`/离线不误报/过期三项（`083c53f`，尚未合入本 worktree 分支）。ADR-0041 裁决明确 Apple 通道保持"渐进兼容"，不阻塞 `desktop` 门禁，也不升级为生产发布证据 |
| **iOS 非 Safari 浏览器（Chrome for iOS 等）** | **无** | 未见任何记录 |
| **`desktop` 发布门禁通道的正式记录** | **无已填写记录** | `docs/operations/browser-release-evidence.md` 全篇仅为待填写模板（第 43-111 行的 markdown 代码块本身），未见任何已完成的正式生产发布浏览器证据文档实例；上述所有真机记录都在 `tasks/stable-release-qualification/verification.md`（资格评审/演练性质），不是该模板要求的"每次生产发布"记录 |

---

## 总结（10 行）

1. 本机全量重跑：lint/typecheck 通过；vitest 16 包 186 文件 **2428** 用例全绿（台账称 2420，差异为后续正常新增，非回归）。
2. `pnpm test:browser`（系统 Chrome 153）9 包 **277** 用例全绿（台账称 276，同上）；`test:onboarding-smoke` 1/1 通过。
3. `pnpm test:browser:engines`（本机缓存 WebKit 26.6/Firefox 155.0，未联网下载）**120 passed / 10 skipped**，与协调者提供的 GitHub Actions run 36417040999（同一提交 dad5d1e）完全一致，双源互证；这是 L3-引擎冒烟，不代表 Safari/iOS。
4. 台账 30 行中 **26 行确认无误**；4 行发现问题但均为轻微：第 13、19 行引用的 `file:line` 已失准（logout/checkForUpdate 行号错位），第 15 行"每项详情"小节文字与总表矛盾（仍说"无 en 内置表"，实际已有），第 16 行需补充"三引擎覆盖含非阻断 engines job"的口径提醒。**无等级虚高（over-claim）情况**。
5. 应补入台账的真机证据：0.2.1 两机 Android 轮次（Xiaomi+Samsung，N-1 仍未取得）、iPhone R9 修复复核、iPhone Vue 0.2.1 安装/离线/恢复演练，均已存在于 `verification.md` 但台账尚未逐行引用其行号。
6. `origin/main` 领先本 worktree 一个纯文档提交 `083c53f`（iPhone R3 单 Origin 故障演练部分完成 + iOS HTTP/3/WARP 网络层限制记录），尚未合入，建议下次同步后补入第 17 行。
7. 三个候选"缺失功能"（内置更新提示 locale c22f3f3、准入拒绝诊断 b37c112、requiredReleaseChecks 2d282d9）**均已被台账覆盖**，无需新增行。
8. 浏览器/设备覆盖总表：桌面 Chrome 自动化门禁最完整；Edge 完全无覆盖；Firefox 仅有 Playwright 内置版本的非阻断引擎冒烟，无真实 Firefox 发行版证据；Safari 桌面/iOS 均为人工真机、非自动化；Android Chrome 真机较全但 N-1 长期缺失；`browser-release-evidence.md` 模板从未被实际填写过一份正式生产发布记录。
9. 未发现任何测试失败、回归或伪造证据；本次唯一的"问题"类发现都是文档维护滞后（行号漂移、小节未同步、真机记录未逐行登记），不涉及运行时代码或公开契约缺陷。
