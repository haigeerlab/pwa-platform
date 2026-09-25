# 验证记录：build-verifier

> 模块质量门禁（#87）的可复现结果。任务事实源仍是 GitHub Issues #5。

## 环境与对象

- 日期：2026-09-16
- 分支：`feat/build-verifier`，基线 `origin/main`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64
- 被验证的提交：第一次门禁在 `4889002`（#81–#86）上执行；独立评审之后的修复见"评审修复后的重新执行"
- 本模块没有浏览器测试（全是纯函数与一处读盘），但全工作区的浏览器自测必须不受影响，故一并执行

## 干净 worktree 门禁（`4889002`）

从 `4889002` 新建独立的 git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test` | 退出 0；contracts 139、harness 61、core 94、engine-workbox 37、build-verifier 92、sw-runtime 87、client-runtime 80，合计 590，全部通过 |
| `pnpm test:browser` | 退出 0；harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12 全部通过 |

执行结束后 worktree 没有任何改动（忽略的构建与测试输出除外），随后删除。

## 独立评审

由新上下文的评审代理只读审阅本分支相对 `main` 的全部改动。它自行跑了 lint / build / test / typecheck，对 `src/` 施加 26 项变异（23 项被捕获、3 项存活），并用已构建的 `dist` 做行为探针。结论为 **REQUEST CHANGES**：1 个阻断项、4 个应修项、6 个可选项。计划指定的六个重点里，只有"读盘失败路径"一项存在实证缺陷；生产代码的判断逻辑没有发现错误。

**每一条发现我都自己复现过**，不照单接受。

| 编号 | 发现 | 属实 | 处置 |
|---|---|---|---|
| B1 | 产物比较的"逐字相等 vs 包含"无测试钉死：把 `available.has(entry.url)` 换成 `published.some((p) => p.includes(entry.url))`，92 个测试全部照常通过。大小写与百分号编码两例的替换串都**不包含**原串，所以它们只证明了"没做归一化"，没有证明"不是子串匹配" | 是（我复现：变异存活，92 项全绿） | 已修：新增"发布了 `<entry>.map` 而没有 `<entry>` 本身"的用例，断言仍报 `verify.artifact-missing` |
| F1 | `readIdentityBaseline` 的 `catch {}` 把所有 IO 失败都当成"没有基线"。EACCES、EISDIR 与 ENOENT 产出同一条消息 | 是（我复现：三种错误消息逐字相同） | 已修：先判存在再读，不存在才说"没有基线"，其余抛"could not be read" |
| F2 | `BASELINE_FIELDS` 的"覆盖全部字段"断言读的是 JSON fixture 的键，不是 `PwaIdentity` 类型；contracts 新增**可选**字段时整套测试保持绿色 | 是（我复现：断言确为 `Object.keys(identity)`，identity 来自 fixture） | 已修：补一条类型层面的穷尽性守卫，`tsc` 阶段即失败 |
| F3 | 带指纹资源接受 `max-age=0`：`max-age=*` 匹配任意值或无值，而 runbook 要求的是"`immutable` 加**长** `max-age`" | 是（我复现：`immutable, max-age=0` 判为 PASS） | 已修（经项目所有者批准收紧）：新增 `max-age=+` 期望形态，要求正整数；规格"已知限制"同步改写 |
| F4 | `verifyRelease({ plan })` 类型合法，返回 `{ok: true, checks: [], diagnostics: []}` | 是 | **本期维持**（项目所有者决定）：ADR-0014 已记录该默认与其风险，代码注释、规格、ADR 三处都要求调用方确认 `checks` 覆盖了它要求的项，`release.test.ts` 也钉住了这个行为。等 vite-adapter 真正接入、知道调用方形态后再决定收紧方式，避免现在凭空设计一个联合类型 |
| O1 | 导入闭包守卫只看模块说明符，`process.getBuiltinModule("fs")` 可绕过 | 是 | 已修：新增一条源码检查，禁止 `process.getBuiltinModule`／`process.binding`／`createRequire`／`Module._load`，无文件豁免，并加进自证伪探针 |
| O2 | `parseCacheControl` 的"无值畸形指令"分支无测试：六个畸形样本**全部含 `=`** | 是（我复现：确为六个带值样本） | 已修：补 `"no cache"` 与 `"no-cache;no-store"` 两个不含 `=` 的样本 |
| O3 | 同一资源可能产出两条完全相同的诊断（既无 `immutable` 又无 `max-age`） | 是 | **不改**：`headers.test.ts` 正把这个行为钉住，去重会改变已被测试确认的输出；诊断是逐条判据的结果，合并会让"缺哪几条"变得不可数。留作已知限制 |
| O4 | 追加 `verify.*` 后，把 `verify.baseline-missing` 当 warning 的计划现在能通过 `validatePlan` | 是（我复现：`ok=true`；伪造码仍被拒） | **不改**：评审自己也不建议改动。这与当初追加 `compile.*` 是同一情况，属于向后兼容的放宽；编译器不会产出这种计划 |
| O5 | 能力图 build order 把 build-verifier 排在 client-runtime 之后，而它只依赖 contracts，顺序不再反映依赖偏序 | 事实属实，但**不是缺陷** | **不改**：这个顺序是项目所有者在本模块开工前明确拍板的，评审不掌握这段决策史 |
| O6 | 规格写"入口的导入闭包只含 contracts；不含 Node 内建模块"，而 `index.ts` 再导出 `readIdentityBaseline`，入口闭包实际**包含** `node:fs` | 是 | 已修：措辞改为"包内每个源文件"，并写明守卫按文件扫描而非按入口闭包 |

评审确认无发现的四项，我保留其判断依据：诊断消息全部取自 `DIAGNOSTIC_MESSAGES` 原文、无拼接无插值；`compareIdentityBaseline` 比较的是 `validateIdentity` 返回的 `value`，而 contracts 不做任何改写（百分号编码与 Unicode 分解形式逐字保留，大写 host 直接被拒而非归一）；报告的 `ok`／`checks`／`diagnostics` 由构造保证一致；contracts 改动为纯追加，既有码的位置与文本一行未动。

### F1 的修复被 lint 挡了一次，挡得对

第一版用 `catch (error)` 读 `error.code` 分流，`preserve-caught-error`（ESLint 10 内置，经 `eslint.configs.recommended` 启用）报错，要求抛新错误时附 `cause`。**附上 `cause` 恰好会抵消这处设计的目的**：被捕获的原始错误 message 含完整路径，而 `console.error` 会展开 cause，路径就这样回到了日志里——这几条常量消息存在的理由正是不让目录布局进日志。

因此改为先 `existsSync` 判存在、再读，两条分支都不需要 catch 参数：规则不再触发，路径也不进错误链，语义不变。两次调用之间文件被删会落到"could not be read"，方向是安全的——真实故障不会被误报成"从未发布"。

全程**没有添加任何 `eslint-disable`**。

另补一条断言钉死这个决定：`readIdentityBaseline` 抛出的错误 `cause` 必须为 `undefined`。只断言 message 不含路径是挡不住的——后人加一句 `cause: error` 就能悄悄把路径放回日志，而那些断言照样全绿。

## 评审修复后的重新执行

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 139、harness 61、core 94、engine-workbox 37、build-verifier **100**、sw-runtime 87、client-runtime 80，合计 **597**，全部通过 |

build-verifier 单元测试由 92 增至 100，新增 8 条：产物真超串、`max-age` 正整数（`hasDirective` 与 `verifyResponseHeaders` 各一）、不可读与不存在的区分、不可读时不回显路径、不附 `cause`、类型层面的字段覆盖、两个无值畸形指令样本（并入既有用例）、绕过导入图的源码检查。

### 修复后的行为复验（用重新构建的 `dist`）

| 输入 | 修复前 | 修复后 |
|---|---|---|
| 带指纹资源 `immutable, max-age=0` | `ok=true`，0 条诊断 | `ok=false`，1 条诊断 |
| 带指纹资源 `immutable, max-age=31536000` | `ok=true` | `ok=true`（未变） |
| 基线文件不存在（ENOENT） | "No release baseline is stored for this deployment slot" | 同左（未变） |
| 槽位名处是个目录（EISDIR） | "No release baseline is stored..." | "The release baseline could not be read" |
| 文件不可读（EACCES） | "No release baseline is stored..." | "The release baseline could not be read" |

## 变异检查

### 评审修复的守护（本次门禁）

每项注入前确认锚点在源码中唯一命中、注入后确认文件确已改变，随后运行测试、逐字节还原（md5 比对）。

| 变异 | 结果 |
|---|---|
| 产物比较改为包含语义（B1 的原变异） | 被抓到（1 failed） |
| 带指纹资源的正数要求退回 `max-age=*` | 被抓到（1 failed） |
| 正数判据放行 `0`（去掉 `> 0`） | 被抓到（2 failed） |
| 不可读与不存在两类错误重新合并 | 被抓到（1 failed） |
| 去掉存在性判断（回到单一失败路径） | 被抓到（2 failed） |
| 绕过导入图的检查正则改为永不命中 | 被抓到（1 failed） |
| 去掉无值分支的 TOKEN 校验 | 被抓到（1 failed） |
| 从 `BASELINE_FIELDS` 删掉 `environment` | **typecheck** 被抓到：`baseline.test.ts(35,11): error TS2322: Type 'true' is not assignable to type 'never'` |

七项运行时变异全部被抓到，还原后字节一致，基线复跑 100 项通过。

**类型守卫这一项值得单独说明**：同一变异下 vitest 也红了 3 项，但红在 `compareIdentityBaseline` 的行为断言上，**不是**红在那条"覆盖全部字段"的断言上——正是评审 F2 指出的"排障时容易误判"。补上类型守卫后，失败点直接指向清单本身。

### 一次失效的变异脚本（记录在案）

本轮第一次跑变异时，脚本把注入与还原写进 shell 函数，函数体内 PATH 丢失，`cp`／`md5`／`python3` 全部 `command not found`，**一个变异都没有真正注入**，而基线复跑 100 项通过。

这是本模块第四次遇到同类陷阱（前三次：两次改了 contracts 的 `src` 没重建 `dist`，一次 perl 内联替换的嵌套反引号经两层转义后插值失效）。四次的共同点是：**验证手段本身失灵时，现象与"测试不合格"或"测试全都没问题"一模一样**。这一次没有被读成"守卫都没问题"，因为脚本对每一项都要求打印"锚点命中数 + 文件确已改变"，缺这两行就不算数。

### 各任务累计（#81–#86）

| 任务 | 变异 | 结果 |
|---|---|---|
| #81 包骨架与诊断码 | 把 `node:fs` 挪进 `baseline.ts` | 被抓到 |
| #82 产物一致性 | 8 项（含缺失判反、多余文件误报、去掉绝对路径校验） | 全部被抓到 |
| #83 响应头基线 | 5 项（含"不得包含"判反、静默跳过缺失观测、不检查 `max-age`、解析器引号处理、`Object.hasOwn` 换属性访问） | 全部被抓到 |
| #84 身份基线比较与读取 | 7 项（含去掉候选校验、槽位名校验、回显路径） | 全部被抓到（其中 3 项经历过"变异失效被误读"，详见上文） |
| #85 报告汇总 | 4 项（`ok` 恒真、诊断顺序反转、`hasOwn` 换 `undefined` 判断、检查顺序对调） | 全部被抓到 |
| #86 ADR 与文档同步 | 纯文档，无变异 | — |

## 依赖与供应链

- 本分支相对 `main` **新增第三方包解析条目 0 个**；lockfile 只增加 workspace importer（contracts 为运行时依赖，harness 与 `@types/node` 为开发依赖，均已在 lockfile 中）。
- `pnpm-workspace.yaml`、`.github/workflows/ci.yml`、根 `package.json`、`eslint.config.js`、`tsconfig.base.json` 均未改动。
- 本模块不发网络请求、不写盘；`baseline-file.ts` 是唯一读盘的模块，由按文件扫描的导入守卫加一条绕过检查共同钉死。

## contracts 的契约改动

唯一被改动的已交付包。改动为**纯追加**：

- `DIAGNOSTIC_CODES` 由 29 个增至 37 个，`DIAGNOSTIC_MESSAGES` 相应追加 8 条；删除行数 **0**，既有码的顺序与文本一行未动。
- 声明快照 `packages/contracts/test/__snapshots__/public-api.d.ts.snap` 相对 `main` 只有 2 行变化（`DIAGNOSTIC_CODES` 那一行的增删），且变化只涉及该行。
- `public-api.test.ts` 的运行时导出清单未变且仍然成立；contracts 139 项测试通过。
- 副作用一项：把 `verify.*` 当 warning 的计划现在能通过 `validatePlan`（`plan.diagnostics[].code` 用 `z.enum(DIAGNOSTIC_CODES)` 校验）。属向后兼容的放宽，与当初追加 `compile.*` 同理，不改动——见上表 O4。

`core`、`engine-workbox`、`sw-runtime`、`client-runtime`、`browser-test-harness` **零改动**。

## 与 spec、ADR 和能力图的边界核对

- 能力图 `build-verifier`：校验构建产物与发布基线。一致。
- **能力图已修订**：`build-verifier` 的依赖由 `policy-compiler` 改为 `contracts-foundation`（本模块只调用 `validatePlan`，不依赖 `core`），build order 相应调整。两处均经项目所有者批准。
- ADR-0004：不判断"是否首次发布"，只报告事实。一致，且在契约、规格、ADR、运维文档四处一致重申。
- ADR-0008：比较字段以显式清单写死，不从候选身份的键推导。一致，并由类型守卫与运行时断言双重守护。
- ADR-0009：迁移要求由人工评审执行，工具只产出差异。一致。
- ADR-0014：记录本模块的五项决定。ADR 的每条断言均已对照实现核验。
- 规格的"已知限制"随 F3 的收紧同步改写；`max-age` 的**时长**仍不校验，只要求为正整数。

## 文档一致性

- `README.md` 第 5、27 行仍写着"`sw-runtime` 正在交付"，而 client-runtime 早已随 PR #79 合并——这是 #86 的文档同步只更新了第 48 行包清单留下的遗漏，本次一并修正。
- 全仓扫描"正在交付／尚未交付／交付之前"等表述共 9 处，逐条判定后只改上述 2 处现状句。其余 7 处保留：`spec/platform-governance.md`、`release-and-incident-runbook.md` 的"交付之前人工、之后强制"是两阶段完整表述，两阶段都仍然成立；两份历史 plan 记录的是当时的待办；`recovery-drill.md` 讲的是 sw-runtime；`spec/client-runtime.md:168` 的"本模块尚未交付"位于"已决定事项（项目所有者，2026-09-16）"一节，记的是做决定那一刻的依据，改成现在时反而会把"当时没有下游"篡改成"现在没有下游"——后者已不属实。

## CI 实跑证据：**未取得**

本模块的质量门禁**没有完成**。#87 的验收标准要求：

> 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让本模块单元测试失败的提交使 quality job 报红，撤销后恢复为绿，证据在合并前取得。

2026-09-16，项目所有者的 GitHub 账号不可用：`gh auth status` 显示活跃账号 `haigeermail` 的 token 已失效，另一个仍有效的账号 `yizhongkaimail-collab` 对本仓库没有写权限。因此推送、开 PR、取红绿证据三项均未执行，**一次都没有尝试**。

本分支 `feat/build-verifier` 至 `a04a403` 共 7 条带 closing keyword 的提交，全部留在本地，未推送。

账号恢复后需要补做，顺序不变：推送分支 → 开 PR（`Closes #5`）→ quality 与 browser job 转绿 → 临时提交制造 quality 报红 → `git revert` 恢复为绿 → 把 run 链接与结论写回本节 → 把 `docs/DOCUMENTATION-BASELINE.md` 的 build-verifier 行由 `target` 翻 `verified`。

在此之前，基线行保持 `target`。本地门禁全绿**不能**代替 CI 证据：CI 跑的是 Node 22 与 24 两个版本、冻结 lockfile、以及 runner 预装的 Chrome，本机三者都不同。

### 合并前的本地完整门禁（`642c482`，2026-09-16）

CI 取不到，因此在合并进 `main` 之前补跑了一次本地完整门禁，作为可追溯的记录——**它不替代上面那份缺失的 CI 证据**，理由见本节末尾。

从 `642c482` 新建独立的 detached worktree（不占用分支名），依次执行：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | 0 | lockfile 通过供应链策略 |
| `pnpm lint` | 0 | — |
| `pnpm build` | 0 | 7 个包全部构建完成 |
| `pnpm typecheck` | 0 | TS 错误 0 |
| `pnpm test` | 0 | contracts 139、harness 61、core 94、**build-verifier 100**、engine-workbox 37、sw-runtime 87、client-runtime 80，合计 **597** |
| `pnpm test:browser` | 0 | harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12，合计 **53**；日志打印 `chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动，随后删除。

**为什么这不能替代 CI 证据**：

- **版本矩阵不同**。CI 在 Node 22.23.2 与 24.21.0 两个版本上跑 quality job，本机只有 Node v24.18.0 一个版本。跨版本差异正是双版本矩阵要防的。
- **浏览器不同**。CI 用 runner 预装的 Google Chrome 152.0.7977.82，本机是 152.0.7977.84，差一个补丁号。
- **缺红绿对照**。验收标准要求"临时让本模块单元测试失败的提交使 quality job 报红，撤销后恢复为绿"——这一项证明的是**门禁本身有效**，而不是代码正确。本地全绿完全不触及这一点：一个从未报过红的门禁，绿色是没有意义的。

因此 `docs/DOCUMENTATION-BASELINE.md` 的 build-verifier 行**保持 `target`**，不因本地门禁全绿而翻 `verified`。

### 合并方式

账号不可用期间，本模块以**本地 merge commit**（`git merge --no-ff`）合入 `main`，不经 PR。由此产生两处与正常交付流程的差异，需要在账号恢复后补齐：

- **模块 issue #5 不会自动关闭**：它按工作流靠 PR 正文的 `Closes #5` 关闭，而本地合并没有 PR。
- **7 个 task issue（#81–#87）的 closing keyword 仍在提交信息里**，预期在 `main` 被推送到 GitHub 时触发关闭；此项在账号恢复前无法验证。

## 已知限制（移交后续模块）

- **空报告 `ok: true`**：三项检查全部省略时 `checks` 为空、`ok` 为真。`ok` 单独一项不能证明发布被验证过，调用方必须确认 `checks` 覆盖了它要求的项。收紧方式留待 vite-adapter 接入时决定（ADR-0014，评审 F4）。
- **公开/私有 HTML 的响应头未判定**：`PwaPlan` 不记录哪些路由是 HTML、哪些属于私有数据，判定所需信息不在计划里。这两类继续按发布门禁人工核对。
- **`max-age` 的时长不判断**：只要求正整数，多长才算"长"由基础设施团队在部署配置中确定。
- **同一资源的重复诊断**：一个既无 `immutable` 又无 `max-age` 的指纹资源会产出两条内容相同的诊断（每条对应一项判据）。报告消费方如需展示，可按 `(code, path)` 自行去重（评审 O3）。
- **不校验产物内容**：只比较路径是否存在，不比较文件内容或哈希。

---

## 修订 Task D：发布保留窗口校验（2026-09-19）

> 本节记录 [ADR-0024](../../docs/adr/0024-release-retention-verification.md) 接受后的本地实现证据。它不替代上文已明确未取得的 CI 双版本与 PR 门禁证据。

### 对象与范围

- 分支：`codex/release-retention`；实现提交 `72aa890`（纯检查与诊断）与 `2533d9d`（报告接入与真实 Vite 计划兼容性）。
- 新增 `release-retention`：调用方显式提供当前可用路径、评估时刻和完整历史发布记录；校验 R/R-1/R-2 的带指纹条目及更早版本在其后继发布满七天前的条目。
- `@pwa-platform/vite` 的生产构建路径未改；真实 Vite 构建测试只证明实际 `PwaPlan` 能作为显式输入，不能把单次构建误称为线上保留已验证。
- contracts 只追加 `verify.retention-history-invalid` 与 `verify.retention-missing`，没有新增依赖、锁文件变更、网络调用或文件写入。

### 本地质量门禁

| 命令 | 结果 |
|---|---|
| `pnpm build` | 退出 0 |
| `pnpm lint` | 退出 0 |
| `pnpm test` | 退出 0；build-verifier 122 项、Vite 148 项通过 |
| `pnpm typecheck` | 无 TypeScript 错误 |
| `pnpm test:browser` | 退出 0；在配置的 Chrome 153.0.8010.50 下执行 |
| `pnpm --dir packages/vite exec vitest run test/release-order-real.test.ts` | 3 项通过，含真实 Vite 计划的 retention 输入 |

首次在受限沙箱运行 `pnpm test` 时，browser-test-harness 监听 `127.0.0.1` 被拒绝为 `EPERM`，25 个失败均由同一环境限制造成。允许本机回环监听后，完整工作区测试通过；这不是产品断言失败。

### 变异检查

每项先用 `apply_patch` 注入，再运行目标测试并确认报红，随后用补丁逐字恢复：

| 变异 | 被抓到的测试 |
|---|---|
| 将 R-2 从无条件保留缩为仅 R-1 | `release-retention.test.ts` 的 R/R-1/R-2 场景 |
| 将七天到期比较从 `<` 改为 `<=` | 到期恰好一毫秒边界场景 |
| 移除历史发布时间严格递减校验 | 历史乱序失败关闭场景 |
| 将 `Object.hasOwn(input, "retention")` 改为值非空判断 | 显式 `retention: undefined` 场景 |
| 破坏按资源路径去重 | 重复带指纹路径仅报一次的场景 |

五项均转红；恢复后聚焦 build-verifier 测试 122 项与真实 Vite 测试 3 项通过。

### 审阅与未取得证据

- 核心开发者按正确性、边界、安全（不回显宿主路径/时间/历史值）、依赖与性能审阅了新纯函数和测试；没有发现阻断项。
- 项目所有者授权后，独立新上下文审阅完成，发现 1 项 P1 与 1 项 P2，无 P0：
  - P1：`Number.isInteger` 会接受无法精确表示的巨大毫秒数，可能让加法式的七天窗口发生精度折叠。已改为只接受非负安全整数，并使用 `asOfMs - successor.releasedAtMs < 7 days` 比较，避免安全整数边界上的加法失真。新增 `1e30` 时钟回归测试先在旧实现报红，修复后通过；到期后 1 ms 的规格边界也已覆盖。
  - P2：文档基线曾把 build-verifier 的 CI 证据表述为已取得，和本记录相矛盾。已改为明确标注远端 CI 证据仍待取得。
- 修复后重新通过 `pnpm --dir packages/build-verifier test`（122 项）、该包 typecheck、真实 Vite 计划测试（3 项）、`pnpm lint`、`pnpm build` 与完整 `pnpm test`；完整测试仍须允许 browser-test-harness 监听本机回环地址。
- CI/PR 双 Node 版本、远端 browser job 与红绿门禁对照仍未取得，故 `docs/DOCUMENTATION-BASELINE.md` 继续保持 `target`，本地结果不替代远端质量证据。

## 修订 Task H：公开 HTML 响应头检查（2026-09-22）

### 对象与范围

新增独立检查 `html-headers`（`verifyHtmlHeaders`，可选输入 `htmlObserved`），规格见 [spec/build-verifier.md](../../spec/build-verifier.md) 的"修订：公开 HTML 响应头检查"，决定见 [ADR-0032](../../docs/adr/0032-html-response-header-check.md)。实现提交 `dbbfd08`，文档同步 `359c57a`。

### 兼容性差分（H2 主会话验收）

用修订前的 dist（不含 `html-headers.js`）与修订后的 dist 分别调用 `verifyRelease`：11 组不含 `htmlObserved` 的输入（空输入、仅产物、响应头通过/不通过/为空、基线一致/缺失/漂移、保留窗口首发/历史乱序、全部组合）输出逐字节相同；`verifyResponseHeaders` 在不通过输入上的输出相同。`VERIFICATION_CHECKS` 的前五个元素不变，末尾新增 `html-headers`。

### 本地质量门禁

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test` | 首次退出 1：`release-tools` 的 `run-gate.integration.test.ts` 中一项集成测试在 5000ms 超时（本修订未改动该包）。单独重跑该包 116 项通过；随后 `pnpm -r --no-bail test` 退出 0，16 个包全部通过，其中 build-verifier 146 项、Vite 149 项、examples-browser-e2e 172 项 |
| `pnpm check:publish` | 退出 0；9 个包的元数据与导出通过 |
| `pnpm pack --dry-run`（build-verifier） | 包含 `dist/html-headers.js` 及其类型声明 |
| Spec Guard 只读核验 | 与 main 相同：6 通过 / 4 失败，4 项均为 main 上已有的失败（未落成 issue、能力图摘要过期、todo.md 与外部 tracker 并存），无新增 |

### 调用方影响与未取得证据

- 直接拿 `VERIFICATION_CHECKS` 当必需集的调用方，升级后会要求 `html-headers`；已写入[发布与事故处置手册](../../docs/operations/release-and-incident-runbook.md#发布门禁)。
- Cloudflare 测试站核验工具（`packages/examples-browser-e2e/release-verifier/required-checks.ts`）尚未采集 `htmlObserved`，必需集也未包含 `html-headers`，需另行修订 cloudflare-test-deployment。
- 未发布新的 npm 版本；CI/PR 双 Node 版本与远端证据仍未取得。

## 修订：manifest 截图与快捷方式图标的存在性检查（2026-09-24）

规格见[模块规格](../../spec/build-verifier.md)同名修订，任务 MX3 见 [contracts-foundation 的计划](../contracts-foundation/plan.md)，汇总证据见 [contracts-foundation 的验证记录](../contracts-foundation/verification.md)。

- 提交 `e725e3c`：`verifyArtifacts` 对缺失的截图与快捷方式图标报 `verify.manifest-asset-missing`，路径指向字段、不含路径值；`install` 为 `null` 或未写这些字段时结果不变。
- build-verifier 152 项通过。变异：跳过截图检查、跳过快捷方式图标检查，各 2 项转红。
- Vite 与 Nuxt 的真实构建中，缺失截图都以该诊断失败（vite-adapter 验证记录）。
- 已知限制：既有 `icons` 不做存在性检查（ADR-0037）。
