# 弱网导航与离线恢复验证记录

最新状态（2026-10-06）：PR #136 已合并、main 七项正式 CI 通过；十包 npm 0.4.0 公开读回与全新消费通过，R0 完成，PRE 未升级，OE5／R1 保留。详见末尾发布检查点与[发布记录](../package-distribution/release-0.4.0.md)。以下按日期保留历史证据。

2026-10-05：本地开发实现和候选消费已验证；后续补齐 Chrome 桌面 N-1 自动化与 Safari／Firefox 核心边界。线上 PRE 未升级；本记录不是正式 CI 或 V1 发布证据。原生安装及其他发布环境证据仍缺，**V1 发布证据：未通过**，不能据此直接发布或宣称可合并。

## 范围与产物

- Git 基线：`e19c540a91132458c421e949ac9e80e937ce467f`；分支 `codex/offline-experience-resilience`，实现提交 `657fc44`、`cb4e2dd`；本记录覆盖基线至该分支实现差异及配套交付文档。
- 模块已按确认预览追加能力图末尾并激活。Cloudflare 原有 41/46 项、stable-release-qualification 原待办未修改。
- 直接修改 contracts/core/sw-runtime/vite 和测试 harness；身份、scope、缓存命名空间、更新确认接管及运行时缓存规则不变。
- Chrome `154.0.8037.98`，macOS `15.7.3`；Playwright 运行真实安装的 Chrome，使用隔离 origin 的生产构建，不是 DOM 模拟。
- 全仓开发检查使用既有依赖与 Node 24.18.0；隔离消费者使用 Node 22.22.0。未执行两个全新 Node 环境的完整 CI/发布替代门禁。
- 原始日志、候选 tarball 与 SHA256 清单存于仓库外的本地证据目录；完整日志、原生截图与浏览器配置不提交到 Git。

## 实际行为

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 900 ms 文档连接失败窗口，1 s 重试宽限、5 s 总预算 | Chrome 约 1.3 s 正常返回；隔离 tarball 宿主 1,059 ms 正常返回，无整页提示 | `offline-resilience.spec.ts`、`pwa-candidate-browser.log` |
| 4 s 文档、5 s 预算 | 网络文档正常返回 | Chrome 实际延迟测试 |
| 6 s 文档、5 s 预算 | 约 5 s 提供“暂时无法连接”，不称作设备断网 | Chrome 实际延迟测试 |
| 6 s 文档、10 s 预算 | 正常返回；仍只有一个请求 | worker fake-clock 回归，尚非十秒剖面的实机浏览器测试 |
| 请求持续失败 / 首次挂起 | 最多一次额外串行请求；挂起时不并发重试；重试不重新计时 | worker 回归 |
| 总预算已过，随后系统时间回拨和请求失败 | 不再重试 | 新回归先失败（调用两次），补上已超时状态后通过 |
| 响应头已到、正文挂起 | 导航超时仅约束响应头；恢复探测的首个正文块另受三秒预算约束 | worker 导航与 probe 回归 |
| worker HEAD 200，业务文档持续失败 | 60 s 内零次自动刷新 | 源码 Chrome 与 tarball Chrome 各一轮 |
| 文档探测成功，真实导航仍失败 | 60 s 内只自动刷新一次；再次收到默认页仍保留预算；可手动重试 | 源码 Chrome 与 tarball Chrome 各一轮 |
| 仅一次偶发探测成功、随后失败 | 不自动刷新，必须重新取得两次连续成功 | 默认页实际脚本 VM / fake-clock 回归 |
| HTTP 404/500、非 HTML、空正文、非 basic、跳转/跨源结果、正文挂起 | 不确认恢复；挂起请求受三秒限制 | probe 回归 |
| 隐藏页、密集 online 事件、存储拒绝、旧协议不回复、连续手动点击 | 不绕过冷却或形成自动循环，手动点击合并 | 默认页脚本回归；Chrome 恢复及 CSP 套件 |
| 严格 CSP、中英文、主题、自定义消息/样式、更新等待和确认接管 | 既有契约通过 | Vite 与 Vue/React 示例浏览器套件 |

浏览器可在一次 fetch 内自行重试 TCP 连接，服务端收到的 GET 总数不能直接当作平台重试次数。平台至多两次串行 fetch 由 worker 单元断言证明；真实浏览器验证用户看到的结果、故障窗口、等待时间和重载数。连接重置模拟不等同真实丢包。

## 追加：桌面浏览器与历史／标签页边界

2026-10-05 后续先调整浏览器测试和私有测试 harness，随后补修 worker 探测冷却到期判定。先检查初始离线页确实出现，再观察恢复，防止故障未触发而得到假通过。第一批候选保留；冷却修复另打包为 `0.4.0-next.20261005.2`，不覆盖旧 tarball。

Firefox 最初的失败来自两处测试限制：WebDriver 适配器不提供 Playwright 的 `toHaveText`、请求 HEAD 和 frame 事件接口；Firefox 经 worker 转发的导航请求在本机带 `Sec-Fetch-Mode: same-origin`、`Sec-Fetch-Dest: empty`，原来的 `navigate` 故障规则没有触发。保留诊断日志后，用真实观察到的导航 Accept 头补充私有夹具；专门的服务器回归在修复前收到 200 而失败，修复后同时证明导航失败、`Accept: text/html` 的恢复探测成功。没有为测试修改产品恢复规则。

WebDriver 恢复测试最终使用仅属于当前 Window 的文档标记观察替换，Chrome 仍用 frame 导航计数。Safari 复核发现同一文档 `performance.timeOrigin` 可变化约 1 ms：零重载检查误报变化，一次重载检查也过早认定刷新。改为复用既有离线页的 `markDocument`，等待旧标记消失后标记新文档，随后确认标记持续保留；没有增加容差或放宽次数限制。对应失败日志为 `pwa-resilience-safari-cooldown-final.log`／JSON。

自动化窗口报告 hidden 时沿用既有可见性辅助函数，记录 `simulated-document-visibility` 注解；自动重载后的页面也重新检查可见性。**这种恢复脚本验证不证明原生前台窗口、安装窗口或后台调度体验。** 后退和独立标签页专项只在 Playwright Chrome 运行，Safari／Firefox 明确跳过，不填为通过；独立页由 `context.newPage()` 创建，不覆盖有 opener 时浏览器复制 sessionStorage 的情形。

| 环境／命令 | 本轮结果 | 边界 |
| --- | --- | --- |
| Chrome for Testing 153.0.8010.12 / macOS 15.7.3，全仓 `test:browser` | 冷却修复后完整一轮：九包 327 项通过、1 项既有 Push 跳过、退出码 0；其中 Vite 43 项 | 使用本机既有官方 CfT，未下载；此前失败日志仍保留；非正式发布门禁 |
| Chrome 154.0.8037.98，历史专项三次重复 | 冷却修复后 3 通过、退出码 0 | 移除诊断注入；原生安装窗口未验；核心恢复的最终候选消费结果另记 |
| Firefox 157.0 / geckodriver，`offline-resilience.spec.ts` | 首轮 4 通过、1 跳过；冷却修复、文档标记观测后两个 60 秒恢复专项再次通过 | 导航两项沿用未改动路径的首轮结果；历史／标签页未执行 |
| Safari 18.6 / safaridriver，`offline-resilience.spec.ts` | 首轮 4 通过、1 跳过；冷却修复、文档标记观测后两个 60 秒恢复专项再次通过 | timeOrigin 观测失败保留；历史／标签页未执行 |
| 私有 browser-test-harness 单元 | 11 文件、143 项通过 | 导航故障修复的失败前置日志保留 |
| harness / worker / Vite typecheck、本轮七个源码／测试文件 ESLint | 通过 | 未新增生产依赖或锁文件；运行时代码增量仅探测冷却到期修复 |

原始记录：`pwa-resilience-firefox.log`、`pwa-resilience-firefox-rerun.log`、`pwa-resilience-firefox-visible.log`、`pwa-resilience-firefox-diagnostic.log`、`pwa-resilience-firefox-final.log`、`pwa-resilience-safari.log`、`pwa-resilience-harness-red.log` 和 `pwa-resilience-harness-green.log`。失败尝试均不计为产品边界通过；最终成功记录与初始失败同时保留。

Chrome N-1 原始记录为 `pwa-resilience-chrome153.log` 和 `pwa-resilience-chrome153-history.log`。首轮历史专项在自动刷新瞬间 `page.evaluate` 遇到已销毁的执行上下文；改为等待主 frame 导航和新文档 DOMContentLoaded 后再读取预算。修复后证明后退、前进仍保留预算 `1`；无 opener 的独立页初始预算 `0`，首次自动刷新后为 `1`，原标签页保持原文档和预算。没有修改产品预算或放宽测试时限。

### 冷却期到期与清理回调延迟

Chrome 154 历史专项最初超时，诊断重复三轮中两轮通过、一轮失败。失败轮记录：页面保持 visible、预算为 `0`；第一轮探测成功，约十秒后返回 `reachable: false`，该轮没有新的文档网络请求。另用单元回归精确证明：十秒已过而清理回调未执行时，旧 Set 仍拒绝新探测。浏览器现象与该到期漏洞一致；不能只凭两次 200 网络响应认定已经达到连续成功阈值。

修复用 `performance.now()` 保存客户端冷却截止时间，定时器只回收对应旧记录，不能删除后续创建的新冷却期。回归同时证明到期后探测成功、迟到旧回调执行后新冷却仍生效。更新后的 worker 单元 19 文件、372 项通过；移除全部 MessageChannel／诊断注入后，Chrome 154 历史专项连续三轮通过（47.1／47.2／47.3 秒），保留每轮 30 秒的自动恢复等待上限。

Worker 定时器允许比指定时间更晚执行，见 [MDN WorkerGlobalScope.setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/setTimeout)。测试延迟清理回调只证明代码边界，不声称已经复现特定系统的 worker 挂起机制。原始日志：`pwa-resilience-chrome154-history.log`、`pwa-resilience-chrome154-history-diagnostic.log`、`pwa-resilience-chrome154-history-repeat.log`、`pwa-resilience-probe-cooldown-red.log`、`pwa-resilience-probe-monotonic-red.log`、`pwa-resilience-worker-cooldown-green.log` 和 `pwa-resilience-chrome154-cooldown-repeat.log`；失败 trace 也存于仓库外。

最终复核日志为 `pwa-resilience-chrome153-cooldown-final.log`、`pwa-resilience-safari-marker-final.log`／JSON 和 `pwa-resilience-firefox-marker-final.log`／JSON。Safari／Firefox JSON 各为 2 expected、0 unexpected、0 skipped。Safari 两项均记录 `simulated-document-visibility`，一次自动重载后再次覆盖，共三次注解；Firefox 没有该注解，未覆盖可见性。Safari 结果只能证明模拟可见条件下的恢复脚本；两者均不能代替原生安装窗口、手工前台或后台调度验收。文档标记和共享 helper 最后调整只影响 WebDriver 观测；Chrome 分支和既有离线页标记函数体未改变，未重复整仓 N-1。

## 检查结果

以下命令统一使用 `pnpm_config_verify_deps_before_run=false` 防止工具自动安装依赖，测试另设临时 npm cache。需要服务器端口与 Chrome 进程的命令在批准的本机执行环境运行。

| 检查 | 结果 |
| --- | --- |
| `node scripts/run-workspace.mjs test` | 16 包、2,620 项通过；随后仅增加六项边界用例，受影响 worker 两文件 83 项及 contracts 单文件 10 项通过；运行时源码未再改变 |
| 全仓 `typecheck` | 通过；新增最后六项测试后再检查 worker/contracts |
| 全仓构建 | 上述全仓操作的递归前置 build 通过，后续候选 dist 与工作区逐文件字节一致 |
| `eslint . --ignore-pattern '**/test-results/**'` | 通过，仅排除 Playwright 生成的 trace 脚本；第一次 `eslint .` 被这些生成文件触发 no-undef，未修改源码质量规则 |
| 完整逐包串行 `test:browser` | 八包通过；示例包四项旧文案断言失败，实际行为为新提示。同步文案后，仅重跑该包，86 项主套件 + 28 项 UI 通过。最终已覆盖九包 326 项；不是声称第一次整仓运行全绿 |
| `docs:build` | 通过 |
| `check-package-distribution.mjs` | 十包元数据与构建导出检查通过 |
| Spec Guard phase / artifacts | BUILDING；30 模块；能力图和 spec 结构零失败；15 个历史模块没有 todo 的既有警告保留 |
| 预算条件反转实验 | 故意允许已耗尽预算后重载，回归失败；源码原样恢复。证明预算测试能发现循环回归 |

完整浏览器原始失败日志与成功重跑日志均保存。早期沙箱运行的本地端口/Chrome EPERM 属于执行环境限制；获准后在相同源码运行成功，不计为行为通过。未使用安装浏览器、降低超时目标、删除反向用例或关闭 CSP 来换取通过。

## 候选包消费与升级演练

- 首批十个公开包按既有分发约定在临时 staging 使用统一 `0.4.0-next.20261005.1`；冷却补修后的第二批为 `.2`，分开保存。工作区 package.json 仍为 0.3.1，未发布、未改 npm 标签，正式版本待定。
- `npm pack --ignore-scripts` 生成 tarball；内部依赖改写为同一候选号，Vite 随包 skill 版本同步，dist 全部字节与本工作区匹配。目录及哈希见仓库外清单。
- 独立消费者用 `pnpm install --offline --ignore-scripts` 安装十个 tarball；通过消费者 overrides 将未发布内部依赖指向本批 tarball。原有缓存缺少部分自动选出的第三方版本，最终固定仓库现有 Vue/React，并把 42 个已安装第三方包本地打包供 overrides 消费，没有新增互联网下载。pnpm 的 downloaded 42 指本地 file tarball。候选本身的生产依赖声明未改成 file 路径。
- 消费者实际 Vite 导出来自其 `.pnpm/@pwa-platform+vite@file+...tarballs.../dist/index.js`，未引用工作区 src/dist；构建日志记录新脚本 CSP hash `sha256-RhW8iO1Jcqo+faqiWKoib7OuV/G+dmOZvwbsi4OqEzg=`。
- 旧 worker 和旧默认页从 Git 基线原始源文件重建；旧 worker 不含新 probe 协议。旧版本计划/应用构建使用候选工具的兼容路径，不能称为从 npm 下载旧版本的演练。相同身份与 worker URL 下，新 worker 等待，经 client 的确认操作接管；随后重新加载并验证新行为。
- tarball Chrome 实际验证：旧 worker 兜底、明确确认更新接管、短暂故障，以及两个 60 s 恢复边界，全部通过。
- 这证明本地打包内容和混合版本兼容路径，不能代替发布后从 npm registry 安装的读回验收，也未演练事故回滚。

隔离消费者、构建脚本、baseline 构建脚本、浏览器 probe 和锁文件保存在仓库外证据目录；首批与第二批独立安装目录分别为 `consumer`、`consumer-v2`。旧 worker 重建以本记录的 Git 基线为来源。

第二批十包 dist 逐文件字节与冷却修复后的工作区一致；独立消费者在 Node 22.22.0 离线安装、构建通过，实际 Vite 路径含 `tarballs-v2` 与 `0.4.0-next.20261005.2`。新临时 store 缺少既有 Zod 的缓存，将工作区已安装的 Zod 4.6.5 也本地打包后，消费者使用 43 项第三方 file overrides；没有下载新依赖，候选包生产依赖声明仍为正常版本。第一次离线安装失败及缺依赖时的 baseline 构建失败日志均保留。

第二批 Chrome 154 升级消费重新通过：Git 基线旧 worker 经显式确认升级到候选 worker；900 ms 故障后 1,050 ms 返回正常文档；业务文档失败时 60 秒零自动刷新；探测成功但导航失败时 60 秒一次自动刷新，手动按钮仍可再试。原始日志为 `pwa-resilience-candidate-v2-browser.log`。第二批 baseline 的依赖解析也独立指向 `consumer-v2`，不通过首批消费者解析新包。

## 差异自审

按正确性、可读性、架构、安全和性能复核本模块的所有差异。已解决一个必改发现：wall-clock 回拨后不能重开已结束的导航预算；同时完善 harness 清理新故障和延迟计时器。没有确认的剩余本地代码阻断项。

公开字段在 contracts、compiler、plan 和 worker 双层校验间一致，缺省不增加配置键；新协议从真实受控客户端派生 URL，不信任页面目标，不记录正文/参数；不放宽缓存准入。探测单飞、有超时和退避，预算跨重载，存储故障关闭自动恢复。实现没有新增包、业务缓存或未经规格确认的宿主选项。审查结论仅覆盖本地差异，不等于独立人工/远端 CI 审查。

后续浏览器补测差异另作五维自审：只涉及私有故障夹具、浏览器观测接口、复用带注解的可见性 helper 和历史／独立标签页测试。已确认并解决 Firefox 导航故障未触发的问题；保留初始离线页前置断言，没有将 API 缺口或跳过记为通过。私有导航 Accept 识别只用于指定夹具路径，不进入产品请求分类、缓存或恢复协议。当前差异没有确认的剩余本地必改项；发布环境缺口仍保留。

冷却补修另审：单调时间不因系统时钟调整而缩短最小间隔；pending 检查仍阻止重叠请求；旧清理回调比较保存的截止值后才删记录，不移除新预算。Map 的条目仍定时回收，无公开契约、目标准入、请求缓存模式或响应校验变化；未加入宿主调参字段。

## 尚未验证与下一检查点

OE5 保留未完成：新能力没有 Edge、实体 Android/iPhone、原生安装窗口、真实丢包/DNS/证书测试；Safari／Firefox 没有历史／标签页专项，其恢复脚本验证不覆盖原生窗口可见性。Chrome 后退／前进和无 opener 独立标签页已补测，有 opener 时的 sessionStorage 复制尚未验证；同刻阈值竞争仅按事件顺序定义，未逐项实机注入。历史平台测试不能填为本次新能力通过。

R0/R1 保留：正式 CI 和发布矩阵、实际 npm 分发读回、PRE 宿主升级部署及现场路由/CSP/恢复复测未完成。后续先补缺失的必测环境和正式 CI，满足发布条件再办理发布授权；不恢复已暂缓的 Cloudflare/稳定资格工作。宿主具体操作见 [升级说明](upgrade.md)。

## 2026-10-05：干净检出 Node 22／24 门禁与安装准备

运行时代码固定于 `2863ef4a9206517929b5ad99ed2ae7726a15cf5b`。分别新建两个独立本地 clone，未复用 node_modules 或忽略的构建产物；在 Node 22.22.0／24.18.0 下使用 pnpm 11.18.0 和冻结锁文件安装。日志头包含提交、实际 Node／pnpm／Chrome 版本和时间，各命令退出码及 SHA-256 由执行脚本保存。

| 检查 | Node 22 | Node 24 |
| --- | --- | --- |
| 冻结安装、lint、全仓 build、typecheck、分发导出检查 | 通过 | 通过 |
| 全仓单元测试 | 16 包、2,627 项通过 | 16 包、2,627 项通过 |
| 文档构建、文档 API checker 单测、证据 checker 单测与台账 | 通过 | 通过 |
| 发布分支规则、A6 上传隔离测试 | 通过 | 通过 |
| Chrome 154.0.8037.98 全仓浏览器 | 本轮未执行，按当前 CI 仅在 Node 24 运行 | 327 项通过、1 项既有 Push 跳过，退出码 0 |
| 打包消费新手接入冒烟 | 本轮未执行 | 4 项通过，退出码 0 |

最初两轮 `docs:check-public-api` 均退出 1：网站声明 latest 为 0.3.1，但注册表实际是 0.3.2。只读核对远端 main 仍为 Git 基线 e19c540；十个公开包的 latest 全部为 0.3.2，Vite 0.3.2 发布时间为 2026-10-02T10:01:22.612Z，已发布 contracts 不含 navigationRetry。没有把本次新能力当成已发布。

文档修正提交 `c81bce5a913287479bff1dbadce234e582a14dac` 同步网站当前版本与固定安装命令；历史 0.3.1 CI／发布证据保留原版本。两份独立检出随后固定到该提交，分别重跑公开 API 检查和文档构建通过。原始 `results.json` 的失败结论保留，另附增量复验记录，不改写原始日志。该提交相对受测代码只有网站版本文字和原生验收准备文档；packages、scripts、根配置及锁文件零差异，故未重跑未改变的运行时套件。

候选 `.2` 的十包 dist 共 483 文件分别与 Node 22 和 Node 24 干净构建逐文件哈希一致（共二十组包比较，零差异）。工作区包版本仍为 0.3.1；临时候选版本及已发布 latest 的状态分别记录，不修改 npm 标签。

全仓 audit 两轮均报告 8 项（5 high、2 moderate、1 low），退出 1，按项目规则不阻塞测试。路径全部在私有 Nuxt 开发依赖链（devalue、node-forge、braces）；当前生产依赖审计报告 0 项。锁文件未改变，不执行 audit --fix。此范围判断不表示公告已修复；发布前还须按依赖流程核对 high 项的处理结论／事项记录。

准备了隔离 Vue／React 原生验收示例：各有 v1／v2、5 s 预算和 1 s 重试、独立测试身份、默认离线页，以及未预缓存的 detail.html。四份构建通过，十个 HTTP 入口检查通过；构建使用独立检出的 workspace dist，其字节与候选一致。没有把这些准备检查记成原生安装通过。初次临时夹具构建缺少 type: module 导致 ESM 配置加载失败，补齐临时 package.json 后重建通过；未修改平台实现。控制脚本只在本机模拟断连、延迟、导航失败和版本切换，未部署。

原生安装需要所有者配合真实提示点击和图标启动，四个必测组合均仍未执行，具体步骤见 [原生验收准备](native-acceptance.md)。PRE 仓库路径尚待提供。临时服务已关闭，脚本和构建保留供验收时启动。

仓库外原始记录保存在既有 offline-resilience-evidence 的 fresh-gate 子目录，含初始失败、文档增量复验、审计、候选字节比较和原生准备。**本轮是本地干净环境验证，不是真实 GitHub CI，也不是 ADR-0031 的替代签署记录**；未验证 Windows CI、原生安装和类生产恢复演练，V1 发布资格保持未通过。没有推送、创建 PR、发布包或部署 PRE。

本轮文档增量自审：版本声明由注册表读回和实际类型核对支持；保留历史 CI 证据，没有推广手机或原生兼容等级；候选行为仍显式标为未发布。没有发现新增本地代码阻断项。下一步是所有者配合原生验收，随后按实际授权取得正式 CI／发布条件并办理 PRE 升级。


## 2026-10-05：实际原生安装与独立窗口补测

所有者明确授权由 Codex 完成安装，并授权创建未登录的专用 Chrome 154 配置。四个组合（Chrome 154／153 × Vue／React）均已实际安装、从 Finder 图标启动、观察独立窗口 4 s 导航正常、6 s 中性兜底、联网恢复和真实更新确认。Chrome 153 两个恢复反向场景各在 Vue／React 原生窗口观察超过 60 s，分别零次和一次自动导航，手动重试仍有效；无可见性覆盖。

Chrome 154 Vue 还取得实际 standalone、预算及文档标识读数，持续失败约 83 s 文档标识不变、预算 0；React 持续失败超过 65 s 没有新的导航网络请求。其精确一次自动重载计数仍缺，不能用服务器 GET 总数替代。完整范围、构建来源、原生输入／窗口选择限制及未验证项见 [原生验收记录](native-acceptance.md)。此前“原生未执行”的段落为当时的准备检查点，以本节和该表为当前状态。

原生 900 ms、真实隐藏窗口、Chrome 154 React 显示模式数值及 active worker 二进制读回等缺口仍保留。Chrome 防粘贴保护未绕过；错误窗口记录已剔除，未归档日常标签页和个人资料。此次只改验收文档，不改变平台代码、公开契约或候选 tarball；OE5／R0／R1 保持未完成，V1 发布资格仍未通过。

交付前将当前代码自审结论与新文档范围对账；正式 CI／远端 PR 和 npm 发布仍须按实际授权分别处理，PRE 仓库目录仍待提供。

本次文档增量已与原始事件、文档标识和服务器请求记录逐项自审：明确区分网络请求计数与文档导航计数、服务器模拟与真实丢包、应用构建更新与 npm 升级。去除个人目录路径，原生截图、测试配置和现场记录保存在本地。运行时、公开契约及测试脚本相对受测代码零差异；未发现本轮新增的必改代码问题。

## 2026-10-06：合并 CI 与实际 npm 分发

[PR #136](https://github.com/haigeerlab/pwa-platform/pull/136) 已合并，main 基点为 `650a3076fc43cd1b5a22f395b7321bca7cbb7bb6`，与已审功能树一致。[完整 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/37350037805) 七项成功：Node 22／24 各 2,627 项单测、Windows、Chrome、Edge、WebKit／Firefox 引擎冒烟和真实 FCM。Chrome／Edge 各 327 项通过、1 项既有跳过；引擎跳过仍保留，不能记为全部环境覆盖。

纯版本发布提交 `1f22ede82a7df8d2adfb7649e57d7938f7a1aec8` 仅含十包与随包 skill 的 11 处版本字段。发布候选的冻结安装、构建、分发检查、React 归档接入冒烟和隔离十包消费均通过；483 个 dist 文件与已验证临时候选一致。

所有者授权十包 0.4.0／latest，并明确允许原生 npm CLI 打开网页身份验证。此前非交互发布返回 EOTP、取消的首次网页验证以及传播初期不可见的记录均保留，没有把它们算通过。新一轮原生 npm publish 完成验证后十包全部受理；待处理完成后集中核对版本、latest、tarball HTTP 200、SHA-256 和依赖闭包，全新项目从公共注册表安装十包、导入十个 ESM 根入口和构建含新重试／默认页恢复的 Vite 宿主均通过。详见[实际发布记录](../package-distribution/release-0.4.0.md)。

文档产物已在发包前按固定 main 提交用 CLI 部署，十三个随包链接 200、新离线说明及未知路径 404 通过；当前版本标识的更新待本次收口 PR 合入及文档部署。R0 完成，OE5、R1、V1 业务验收和 PRE 升级仍未完成；原生瞬断、真实隐藏窗口及其他现场环境缺口不因包发布而消失。
