# 实现计划：build-verifier

## 概览

按 [spec/build-verifier.md](../../spec/build-verifier.md) 交付私有包 `@pwa-platform/build-verifier`，它回答编译器回答不了的三个问题：

- **产物一致性**：计划里的预缓存条目、worker 与 manifest，是否真的出现在发布产物中。
- **响应头基线**：部署返回的 `Cache-Control` 是否符合发布门禁的要求。
- **身份基线**：本次身份与该槽位上一次生产发布是否逐字相同。

三项都是纯函数（唯一的例外是读取基线文件），结果汇成一份复用 contracts 诊断的结构化报告。本模块没有浏览器行为，因此不含浏览器自测——这是它与 sw-runtime、client-runtime 最大的不同。

## 架构决定

- **不重算 `compile.*`**：计划合法性只调 `validatePlan`。core 已经做掉的判断（`allow-under-deny`、`offline-fallback-not-built` 等）一律不在本模块重新实现，否则平台会有两份真相源。
- **零网络、零写盘**：响应头由调用方采集后传入；基线只读不写。`readIdentityBaseline` 是包内唯一触碰文件系统的函数，由依赖边界测试钉死为唯一允许 `node:fs` 的模块。
- **自带 `Cache-Control` 解析**：[包边界](../../docs/architecture/package-boundaries.md)规定生产代码不得导入测试包，所以不能用 harness 的 `parseCacheControl`。本包自己实现一份，并用 harness 那份作对照做一致性测试——与 sw-runtime 用 core 的 `compilePlan` 守护路径匹配是同一手法。
- **诊断码追加到 contracts**：8 个 `verify.*` 码进 `DIAGNOSTIC_CODES`，报告因而能与平台其余诊断统一消费。这是对已交付包公开契约的修改，需同步更新声明快照与既有断言。
- **比较不做归一化**：身份字段与产物路径都按字符串逐字比较。大小写、结尾斜杠、百分号编码的差异都是真实差异，归一化会掩盖身份迁移。

## 任务定义

### 任务 1：包骨架与 contracts 的 verify.* 诊断码

**说明：** 建立包结构与单一入口，并把 8 个诊断码追加到 contracts。

**验收标准：**

- `package.json` 声明单一导出 `.`，包为私有，`files` 只含 `dist`；运行时依赖只有 `@pwa-platform/contracts`（`workspace:*`）。
- contracts 的 `DIAGNOSTIC_CODES` 追加 8 个 `verify.*` 码，顺序与规格一致；`DIAGNOSTIC_MESSAGES` 为每个码提供非空平台消息。
- contracts 的声明快照 `test/__snapshots__/public-api.d.ts.snap` 已更新；`serialization.test.ts` 新增一条按规格顺序断言 `verify.*` 的用例（照 `compile.*` 的既有写法）。
- contracts 的公开导出名单未变（`public-api.test.ts` 的清单断言不需要修改）。
- 依赖边界测试：入口的导入闭包只含 contracts，不含 Node 内建模块。

**验证：**

- `pnpm --filter @pwa-platform/contracts test` 与 `pnpm --filter @pwa-platform/build-verifier test`、`typecheck` 通过；`pnpm install` 不新增 lockfile 第三方包条目。
- 变异检查：漏掉一个码的消息；把码的顺序打乱。

**依赖：** 无。

**预计范围：** M（包配置、诊断码、contracts 快照与断言）。

### 任务 2：产物一致性

**说明：** 实现 `verifyArtifacts`。

**验收标准：**

- `plan.precache` 的每个 `url` 都必须出现在传入的产物清单中，缺失时逐条报 `verify.artifact-missing`，`path` 指向该条目在计划中的位置。
- `identity.serviceWorkerUrl` 与 `identity.manifestUrl` 缺失时报 `verify.artifact-path-mismatch`。
- 产物清单中多出的文件不报告。
- 比较逐字进行：大小写或百分号编码不同即判为缺失。
- 诊断不回显输入路径原文。

**验证：**

- 单元测试覆盖全部命中、缺一条、缺多条、worker/manifest 缺失、多余文件、大小写与编码差异。
- 变异检查：改用"包含"而非逐字相等；忽略 worker/manifest 检查；把多余文件也报成错误。

**依赖：** 任务 1。

**预计范围：** S（一个纯函数与测试）。

### 任务 3：响应头基线

**说明：** 实现 `Cache-Control` 解析与 `verifyResponseHeaders`。

**验收标准：**

- 自带解析：逗号与换行分隔指令，尊重引号内的转义，丢弃畸形指令；与 harness 的 `parseCacheControl` 对同一组输入结果一致（一致性测试）。
- 按响应头基线判定三类资源：worker 脚本与 manifest 必须含 `no-cache`、不得含 `immutable`；带指纹资源必须含 `immutable` 与 `max-age`、不得含 `no-cache` 与 `no-store`。
- 逐指令比较：必须包含的都在、不得包含的都不在即通过；其他指令不影响结果。
- 缺失指令报 `verify.header-missing-directive`，禁用指令出现报 `verify.header-forbidden-directive`，缺少该路径的观测数据报 `verify.header-unreadable`。
- 诊断不回显响应头原文。

**验证：**

- 单元测试覆盖三类资源的通过与失败、多行头、带引号的指令、畸形指令、缺失路径、额外指令不影响结果。
- 一致性测试对照 harness 的解析结果。
- 变异检查：把"不得包含"判反；忽略缺失的观测路径；`max-age` 不检查。

**依赖：** 任务 1。

**预计范围：** M（解析、判定与两组测试）。

### 任务 4：身份基线比较与读取

**说明：** 实现 `compareIdentityBaseline` 与 `readIdentityBaseline`。

**验收标准：**

- 候选身份与基线都先过 `validateIdentity`；基线不合法报 `verify.baseline-invalid`。
- 逐字段比较 9 个字段（8 个不可变字段加 `environment`），不做任何归一化；任一不同报 `verify.baseline-mismatch`，`path` 指向该字段。
- `readIdentityBaseline` 从 `<directory>/<slot>.json` 读取；文件不存在、JSON 非法、槽位名不合法时抛错，错误消息不回显文件内容。
- 槽位名形态 `^[a-z0-9]+(-[a-z0-9]+)*$`。
- 本模块不判断"是否首次发布"——找不到基线只报告事实。

**验证：**

- 单元测试：9 个字段逐个不同各一例；完全相同则通过；归一化差异（结尾斜杠、大小写、`%2F`）判为不同；基线不合法；候选不合法；读盘的四种失败。
- 变异检查：比较前做归一化；漏比 `environment`；把文件缺失当作通过。

**依赖：** 任务 1。

**预计范围：** M（比较、读盘与测试）。

### 检查点：契约

- 三项检查的判断在单元层都有成立与不成立两类测试，变异检查已完成。
- 向项目所有者汇报诊断码集合与三个函数的契约后，再进入汇总与交付。

### 任务 5：报告汇总

**说明：** 实现 `verifyRelease` 与报告类型。

**验收标准：**

- 按固定顺序执行三项检查；输入中省略某项时跳过它，报告中不出现该项，`ok` 只反映执行过的检查。
- 报告可 JSON 往返，字段顺序确定。
- `diagnostics` 是各项诊断按检查顺序的拼接。

**验证：**

- 单元测试覆盖全部执行、跳过其中一项或两项、全部跳过、`ok` 与各项一致、JSON 往返。
- 变异检查：跳过的检查仍计入 `ok`；打乱诊断拼接顺序。

**依赖：** 任务 2、任务 3、任务 4。

**预计范围：** S（汇总与测试）。

### 任务 6：ADR-0014 与文档同步

**说明：** 记录本模块的决定，并消除身份基线文档里的悬念。

**验收标准：**

- 新增 `docs/adr/0014-build-verification-boundary-and-report.md`，记录：只做编译器看不到的三件事、零网络零写盘、基线存放约定、报告形态与 `verify.*` 码、不判断"是否首次发布"。
- `docs/operations/identity-release-baseline.md` 补上基线路径约定，并更新"build-verifier 交付之前"一节。
- `docs/architecture/package-boundaries.md` 写明本包的依赖边界与唯一读盘模块。
- `README.md` 与 `docs/DOCUMENTATION-BASELINE.md` 同步；能力图的依赖修订（改为 `contracts-foundation`）已随本模块落地。

**验证：**

- 相对链接与锚点能解析；文档中的模块名都来自能力图。
- ADR-0014 与 ADR-0004、ADR-0008、ADR-0009 及规格一致。

**依赖：** 任务 5。

**预计范围：** S（ADR 与四处文档）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0014 的写法之后，再进入模块质量门禁。

### 任务 7：模块质量门禁

**说明：** 完成模块级验证、独立评审与 CI 实跑证据。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过（本模块无浏览器测试，但全工作区的浏览器自测必须不受影响）。
- 由新上下文的独立评审代理审阅，重点包括：诊断是否可能回显输入原文、比较是否在某处偷偷做了归一化、读盘函数的失败路径、报告的 `ok` 与各项是否可能不一致、contracts 改动是否破坏既有契约、文档一致性。阻断项与应修项已处理。
- 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让本模块单元测试失败的提交使 quality job 报红，撤销后恢复为绿，证据在合并前取得。
- 结果写入 `tasks/build-verifier/verification.md`。

**验证：**

- 干净 worktree 的命令输出；
- spec-guard 产物校验；
- CI 运行链接、结论、Node 版本。

**依赖：** 任务 6。

**预计范围：** M（验证记录与评审修复）。

## Task List

> Tasks tracked in GitHub Issues #5

### Phase 1：契约与核心判断

- #81 包骨架与 contracts 的 verify.* 诊断码
- #82 产物一致性（blocked by #81）
- #83 响应头基线（blocked by #81）
- #84 身份基线比较与读取（blocked by #81）

### Phase 2：汇总与交付

- #85 报告汇总（blocked by #82、#83、#84）
- #86 ADR-0014 与文档同步（blocked by #85）
- #87 模块质量门禁（blocked by #86）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 修改 contracts 的公开诊断码枚举影响已交付模块 | 高：contracts 是所有包的基础 | 只追加、不改动既有码；声明快照与既有断言同步更新；任务 1 就跑通全工作区测试，不留到最后 |
| 自带的 `Cache-Control` 解析与 harness 的实现产生分歧 | 中：响应头判定可能与浏览器测试不一致 | 一致性测试以 harness 的解析为对照；分歧出现即失败 |
| 响应头基线中"带指纹资源"的识别 | 中：计划里 `precache[].revision === null` 表示带指纹，但这是隐含约定 | 在规格与 ADR 中写明该判据；单元测试覆盖两类条目 |
| 产物清单的路径形态与计划不一致（相对 vs 绝对） | 中：可能整体误判为缺失 | 契约明确要求绝对路径；形态不符时报错而非静默通过；测试覆盖 |
| 公开/私有 HTML 的响应头无法判定 | 中：发布门禁仍有人工项 | 列为已知限制，写明原因是 `PwaPlan` 不记录该信息，而非实现遗漏 |
| "是否首次发布"被误解为工具可判定 | 中：可能绕过人工评审 | 契约与 ADR 明确本模块只报告事实；`readIdentityBaseline` 文件缺失时抛错交由调用方决定 |

## 执行顺序

任务 1 → 任务 2、任务 3、任务 4（可并行）→ 检查点"契约" → 任务 5 → 任务 6 → 检查点"交付前" → 任务 7。每个任务一个提交，提交信息带 `Closes #<task>`。

---

## 修订计划：发布保留窗口校验（Task D，已接受）

### 目标与边界

把运行手册中“R、R-1、R-2 或替代后七天”的带指纹资源保留规则，交给 `@pwa-platform/build-verifier` 的纯函数验证。发布系统负责提供完整发布记录与当前可用路径；本模块不联网、不写盘、不维护记录、不删除资产。Vite 不在构建时自动声称这一门禁已通过。

### D1：决定与契约冻结（完成）

**说明：** 新增 ADR-0024，并在模块规格中定义 `PwaReleaseRetentionInput`、时钟边界、历史可信前提、诊断和报告顺序。

**验收标准：**

- ADR-0024 明确拒绝“单次 Vite 构建即可证明线上历史资产可用”的错误保证。
- 规格明确：前一/前二历史快照无条件保留；更早快照以直接后继发布时间加七天判断；到期边界为 `asOfMs >= successor + 604_800_000` 时可不再要求。
- 规格列出完整历史记录是发布系统责任，且不把调用方输入缺失误称为验证器可以自动侦测。
- 项目所有者已于 2026-09-19 明确接受 ADR-0024；可进入 D2。

**验证：** ADR、规格与运行手册交叉阅读；相对链接与术语一致。

### D2：最小公开类型与纯检查（TDD，完成）

**说明：** 在 contracts 追加两条诊断码和消息；在 build-verifier 实现 `verifyReleaseRetention` 及输入历史验证。

**验收标准：**

- 历史计划逐一 `validatePlan`；同一发布线、时间形态和顺序全部失败关闭，并用 `verify.retention-history-invalid` 报告，不继续从不可信记录挑路径。
- `available` 的错误形态抛出不含输入内容的 `TypeError`；正常缺失只报 `verify.retention-missing`。
- 只从 `revision === null` 的预缓存条目建集合，R、R-1、R-2 无条件保留，旧项严格按 604_800_000 ms 边界判断；重复路径不重复诊断。
- 除 contracts 与相对模块外不新增生产依赖，不引入 Node、网络或文件系统。

**验证：** 先写失败单测，再做最小实现；覆盖通过/失败、时间三边界、非法历史、重复路径、非指纹条目与输入错误；contracts 与包级 build/test/typecheck 通过。

### D3：报告集成与 Vite 真实计划兼容性（完成）

**说明：** 将可选 `retention` 以 `Object.hasOwn` 的省略语义接入 `verifyRelease`，并让报告契约新增固定名称；添加基于真实 Vite 构建计划的跨包测试。

**验收标准：**

- `retention` 缺失时检查完全不出现；属性存在时一定执行，不因空历史而被跳过。
- `release-retention` 固定排在现有检查之后，`ok` 与扁平诊断顺序正确，JSON 往返不变。
- Vite 测试只证明其计划可以作为检查输入；生产 `assertPwaArtifacts` 和构建流程不新增网络、历史存储或自动保留断言。

**验证：** 报告组合矩阵、声明快照、真实 Vite 计划集成测试；全工作区 typecheck。

### D4：文档同步与模块质量门禁（本地与独立审阅完成；CI 证据仍待远端）

**说明：** 更新 ADR-0014 的“仅三项”表述和必要的公开文档，完成测试、变异、独立审阅与验证记录。

**验收标准：**

- ADR-0014 与 ADR-0024 的边界不冲突：仍保持零网络零写盘，第四项来自调用方事实；运行手册不被改写为缩短保留窗口。
- 变异检查至少杀死：把 R-2 当成可删除、七天比较符号反转、漏掉历史排序校验、用值检查代替 `hasOwn`、重复路径产生多条诊断。
- 在干净 worktree 中完成 lint、build、test、typecheck、test:browser；独立审阅聚焦保留窗口、宿主输入、诊断泄漏、报告顺序与 Vite 边界。
- 结果写入 `tasks/build-verifier/verification.md`，其中只记录可复现命令和事实证据。

**验证：** 完整质量命令、spec-guard 产物校验、独立审阅结论和变异测试记录。

### 执行顺序

D1（已接受 ADR-0024）→ D2 → D3 → D4。D2/D3/D4 均由核心开发者顺序完成；若未来需要新任务或独立 worktree，先向项目所有者请求授权。

---

## 修订计划：公开 HTML 响应头检查（Task H）

### 目标与边界

规格见[模块规格](../../spec/build-verifier.md)"修订：公开 HTML 响应头检查"，决定见 [ADR-0032](../../docs/adr/0032-html-response-header-check.md)。新增独立检查 `html-headers`，由可选输入 `htmlObserved` 驱动；`response-headers` 与既有调用方的输出不变。分支 `claude/html-headers-check`，基于 `main` 的 `d49379c`。每个任务一个提交，提交信息带 `Task: H<n>`。本模块不使用 `todo.md`，任务清单只记在本节。

### H1：决定与契约冻结（完成，项目所有者 2026-09-22 确认）

**说明：** 规格修订节、ADR-0032 与本节一次提交。

**验收：** 项目所有者确认规格与 ADR；ADR 状态为已接受。

### H2：纯检查与报告集成（TDD，完成：dbbfd08；主会话验收：改动前后 dist 的 `verifyRelease` 在 11 组不含 `htmlObserved` 的输入上输出逐字节相同，`verifyResponseHeaders` 不变；内部规则与共享判断函数未进入包入口；本包 146、vite 149、examples-browser-e2e 172 项测试通过。须在 H3 写明：导出常量 `VERIFICATION_CHECKS` 末尾新增 `html-headers`，直接拿它当必需集的调用方升级后会要求该检查）

**说明：** 在 `packages/build-verifier/src/` 新增 `verifyHtmlHeaders`（路径推导、去重、规则判断、无观测即报错）；`VERIFICATION_CHECKS` 末尾追加 `html-headers`；`PwaVerifyReleaseInput` 增加 `htmlObserved`，`verifyRelease` 在其余检查之后执行；从包入口导出。实现派给 `executor` 子代理，主会话验收并做对抗性检查。

**验收标准：**

- 规格"测试策略增量"列出的单元测试全部先写并通过。
- 不传 `htmlObserved` 时，既有测试的期望值一行不改即全部通过；`VERIFICATION_CHECKS` 前五个元素不变。
- 导入闭包与包边界测试不变：仍只依赖 `contracts`，零网络、零写盘。
- 变异检查：去掉任一推导来源、互换 `include`／`exclude`、省略"无观测即报错"，都有测试失败。

**验证：** `pnpm --filter @pwa-platform/build-verifier test`、`typecheck`、`build`；依赖本包的 `@pwa-platform/vite` 与 `examples-browser-e2e` 的测试不回退；`pnpm lint`。

**范围估计：** 中，约 5 个文件（新检查、报告、`release.ts`、入口、测试）。依赖：H1。

### H3：文档同步（完成：手册必需集与基线表、发布编排协议、发布记录模板、release-gate-contract、包边界、桌面演练清单第 5 项、Cloudflare 测试站文档的已知限制；本包 README 不列举检查名称，未改；DOCUMENTATION-BASELINE 按规格不新增关注项；相对链接 0 断链）

**说明：** [发布与事故处置手册](../../docs/operations/release-and-incident-runbook.md)的必需检查清单（所有拓扑）加入 `html-headers`；响应头基线表注明公开 HTML 由 `html-headers` 机器检查、私有 HTML 仍需人工核对；[发布编排协议](../../docs/operations/release-orchestration-protocol.md)、[包边界](../../docs/architecture/package-boundaries.md)与本包 README 中列举检查名称的地方同步更新；[桌面发布演练清单](../platform-governance/desktop-release-rehearsal.md)第 5 项的"响应头"一行更新状态。

**验收：** 所有列举检查名称的文档一致；相对链接检查通过；`git diff --check`。

**范围估计：** 小到中，4–5 个文档。依赖：H2。

### H4：质量门禁（完成：lint、typecheck、全仓测试、check:publish 通过；Spec Guard 与 main 相同；记录见 verification.md"修订 Task H"）

**说明：** 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm test`；`pnpm check:publish`（本包为公开包，确认打包内容与导出无异常）；Spec Guard 只读核验与 main 对照；在 `verification.md` 写入本修订的验证记录。

**验收：** 以上命令全部通过；Spec Guard 结果与 main 相同（不新增失败）。

**范围估计：** 小，1–2 个文件。依赖：H3。

### 已知的连带影响（不在本修订内）

- **Cloudflare 测试站核验工具的必需检查清单会落后于手册。** `packages/examples-browser-e2e/release-verifier/required-checks.ts` 按拓扑写死了必需检查；手册加入 `html-headers` 后，工具不会要求它，也不会采集 HTML 响应头。需要另行修订 `cloudflare-test-deployment`：采集公开 HTML（跟随同源重定向）、传入 `htmlObserved`、把 `html-headers` 加入必需集。在那之前，工具的报告不满足新协议，这一点在 H3 的文档中注明。
- 新的 npm 版本发布走 `package-distribution` 的流程。

### 执行顺序

H1 → 确认 → H2 → H3 → H4。

## 修订计划：manifest 截图与快捷方式图标的存在性检查（2026-09-24）

任务统一编号在 [contracts-foundation 的计划](../contracts-foundation/plan.md)"修订计划：安装元数据的扩展字段"（MX1–MX7）；本模块对应 MX3（产物检查）。


## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| developer-entry | `README.md` | 包清单与状态一节列出本包。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 登记本模块及其依赖。 |
| decisions | `docs/adr/0032-html-response-header-check.md` | 记录公开 HTML 响应头纳入机器门禁的取舍。 |
| release-and-incident | `docs/operations/release-and-incident-runbook.md` | 交付必需检查清单与响应头基线的更新。 |
| build-verifier | `spec/build-verifier.md` | 交付本模块的检查集与报告契约。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| developer-entry | delivered | `README.md` | 本包在首批发布清单中列出。 |
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块与依赖已登记。 |
| decisions | delivered | `docs/adr/0032-html-response-header-check.md` | ADR-0032 已接受（2026-09-22）。 |
| release-and-incident | delivered | `docs/operations/release-and-incident-runbook.md` | 2026-09-22 起必需集含 `html-headers`，响应头基线注明公开 HTML 由机器检查。 |
| build-verifier | delivered | `spec/build-verifier.md` | 规格含三次修订（保留窗口、覆盖判定、HTML 响应头）与对应验证记录。 |
