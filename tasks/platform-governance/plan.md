# 实现计划：platform-governance

## 概览

把平台的发布与运维约束落成可执行的基线：

- 基线 CI 与根脚本 `typecheck`；
- 写进仓库配置的供应链规则；
- ADR-0009 与身份发布基线规则；
- 浏览器矩阵与 V1 验收基线；
- 发布门禁、回滚、事故处置与恢复演练的 runbook。

本模块不新增运行时包，也不实现恢复 worker、身份比较工具或浏览器 E2E。

> Tasks tracked in GitHub Issues #15

## 架构决定

- **CI 形态**：
  - 单一 workflow，只授予 `contents: read` 权限；
  - 在 `ubuntu-latest` 上跑 Node 22 与 24；
  - 所有 action 固定到完整 commit SHA，并用注释写明版本号；
  - 用 `pnpm/setup` 读取 `packageManager` 字段、以冻结 lockfile 安装依赖并开启缓存；
  - `pnpm audit` 只输出报告，不阻塞 CI。
  
  写入 SHA 和输入参数前，要按各 action 的官方仓库再核实一次。
- **根脚本**：`scripts/run-workspace.mjs` 增加 `typecheck` 操作，行为与 `test` 一致：先构建依赖，带 `--filter` 时包名不存在即失败。
- **供应链设置**：显式写入 `pnpm-workspace.yaml`，包括把 pnpm 11 的默认值也写明，不依赖个人配置。设置名和"未批准构建脚本时是报错还是警告"都以 pnpm 11 官方文档为准，实现前核实。
- **文档组织**：
  - 规则类文档放在 `docs/architecture/`：浏览器矩阵、V1 验收基线；
  - 流程类文档放在 `docs/operations/`：runbook、恢复演练、身份基线、依赖变更流程；
  - 文档之间互相引用，不复制内容；
  - 新文档登记到 `DOCUMENTATION-BASELINE.md`。还没有生产部署的流程标记为 `target`。
- **CI 实跑证据**：需要把分支推到 GitHub 才能获得，包括"有意制造失败时 CI 报红"。所以任务 1 只做本地验证；远端的通过与报红证据在任务 6 获取，推送前先征得项目所有者授权。

## 任务定义

### 任务 1：根脚本 typecheck 与基线 CI

**说明：** 给根脚本加上 `typecheck` 操作，并新增 `.github/workflows/ci.yml`。

**验收标准：**

- `pnpm typecheck` 不带 filter 时，先构建，再对所有工作区包执行 typecheck。带 `--filter` 时，只检查目标包；包名写错时以非零码退出。
- workflow 满足以下条件：
  - 触发：`pull_request`（指向 main）与 main 上的 `push`，同一 ref 上的旧运行会被取消；
  - 权限：只有 `contents: read`，不读取 secret，不使用 `pull_request_target`；
  - 环境：Node 22 与 24 矩阵，action 固定到 SHA，checkout 设置 `persist-credentials: false`；
  - 安装：`pnpm/setup` 读取 `packageManager`，冻结 lockfile，开启缓存；
  - 步骤：依次运行 lint、build、test、typecheck，最后运行不阻塞的 audit 报告。
- workflow 中每个 action 的 SHA 都与其官方仓库对应版本的 tag 一致，并记录核实方式。

**验证：**

- 分别用带 filter、不带 filter、包名写错三种方式运行根脚本，确认执行顺序和退出码。
- 在本地按 workflow 的步骤顺序执行一遍。
- 用 `gh api` 核对每个 action 的 tag 与 SHA 是否对应。

**依赖：** 无。

**预计范围：** S（`scripts/run-workspace.mjs`、根 `package.json`、`.github/workflows/ci.yml`）。

### 任务 2：供应链规则落地与依赖变更流程

**说明：** 在 `pnpm-workspace.yaml` 中写入供应链设置，并编写依赖变更流程文档。

**验收标准：**

- `pnpm-workspace.yaml` 包含以下设置：
  - `minimumReleaseAge: 1440`
  - `minimumReleaseAgeIgnoreMissingTime: false`
  - `blockExoticSubdeps: true`
  - `trustPolicy: no-downgrade`
  
  安装脚本审批使用 `allowBuilds`，默认不允许；仓库中没有 `.npmrc`。
- 冻结安装通过；`pnpm config get` 能读到上述设置；在临时副本中调大 `minimumReleaseAge` 后安装失败，证明设置确实生效。
- 新增 `docs/operations/dependency-changes.md`，写明：
  - 新增或升级依赖时要说明理由；
  - lockfile 的 diff 需要审阅；
  - 豁免必须逐个版本登记，并写明理由；
  - 安装脚本的批准方式；
  - `pnpm audit` 报告由谁确认、如何处理；
  - 审批人。

**验证：**

- 冻结安装与读取配置；
- 负向检查（调大 `minimumReleaseAge`）；
- 按 pnpm 11 官方文档核实未批准构建脚本时的行为，并记录出处。

**依赖：** 任务 1。

**预计范围：** S（`pnpm-workspace.yaml`、依赖变更文档，必要时包括 lockfile）。

### 任务 3：ADR-0009 与身份发布基线规则

**说明：** 修订 ADR-0008 中关于身份迁移的表述，并据此编写身份发布基线规则。

**验收标准：**

- 新增 `docs/adr/0009-identity-migration-bumps-cache-namespace-seed.md`，写明：
  - 身份迁移提升的是 `cacheNamespaceSeed`；
  - `schemaVersion` 只用于区分序列化形状，身份迁移不改变它；
  - ADR-0008 的其余决定保持不变。
- ADR-0008 中对应的那句话标注为"已被 ADR-0009 取代"，原文保留。
- 新增 `docs/operations/identity-release-baseline.md`，定义：
  - 基线内容：每个环境一份、能通过 `validateIdentity` 的规范 JSON；
  - 比较规则：8 个不可变字段逐字相等；
  - 有名称的迁移记录应包含的字段：原因、新旧身份、seed 提升、清理步骤、回滚步骤、审批人；
  - build-verifier 交付之前，由人工核对。

**验证：**

- ADR-0009 的内容与 contracts spec 中的缓存命名空间一节逐项一致；
- 相对链接都能解析；
- 8 个不可变字段与 ADR-0008 的列表一致。

**依赖：** 任务 2。

**预计范围：** S（新增 ADR、给 ADR-0008 加标注、身份基线文档）。

### 检查点：基础

- CI 定义与根脚本在本地验证通过；供应链设置经负向检查确认生效。
- ADR-0009 与 contracts spec 一致。

### 任务 4：浏览器矩阵与 V1 验收基线

**说明：** 新增浏览器矩阵文档，并扩展 V1 验收矩阵。

**验收标准：**

- 新增 `docs/architecture/browser-matrix.md`：
  - 必测：Chrome 桌面端与 Chrome Android 的 N 与 N-1；
  - 参考：Edge；
  - 渐进兼容：Safari 与 Firefox，并说明兼容性说明的记录方式；
  - 文档中不写具体版本号，实测版本号写进验证记录；
  - 引用 `compatibility.md` 中的特性检测原则。
- `docs/architecture/v1-acceptance-matrix.md` 为 6 个场景各补齐负责模块、证据类型和通过标准，并引用浏览器矩阵中的必测范围。所有模块名都来自能力图。

**验证：**

- 模块名与能力图逐一核对；
- 相对链接能解析；
- 场景描述与 `lifecycle.md`、`security-model.md` 保持一致。

**依赖：** 任务 3。

**预计范围：** S（新增浏览器矩阵文档，扩展验收矩阵）。

### 任务 5：发布门禁、回滚、事故处置与恢复演练

**说明：** 扩展发布与事故处置手册，并新增恢复演练文档。

**验收标准：**

- `docs/operations/release-and-incident-runbook.md` 包含：
  - 发布门禁清单：CI 通过、有验证记录、身份基线比较、类生产环境核对项、恢复演练；
  - 响应头基线；
  - 兼容窗口：至少保留前两次发布，且不少于 7 天；
  - 四步回滚流程；
  - 事故分级与响应动作、对外沟通模板、复盘模板；
  - 职责与 `ownership-and-raci.md` 一致。
- 新增 `docs/operations/recovery-drill.md`，写明：
  - 演练步骤；
  - 必须验证的行为：接管客户端、不拦截 fetch、只删除 `appCachePrefix` 匹配的缓存、其他应用和环境的缓存保持不变；
  - 通过标准与记录模板；
  - 触发时机：运行时模块的质量门禁中，以及每次生产发布前。

**验证：**

- 逐条对照 RACI 与 `lifecycle.md`；
- 恢复验证项与 ADR-0005、ADR-0008、ADR-0009 以及 contracts 的 `appCachePrefix` 保持一致；
- 相对链接能解析。

**依赖：** 任务 4。

**预计范围：** M（扩展 runbook、新增恢复演练文档）。

### 检查点：治理文档

- 所有治理文档都能互相引用，且与 ADR、RACI、能力图一致。
- 与项目所有者确认 runbook 与演练流程之后，再进入模块质量门禁。

### 任务 6：文档同步与 platform-governance 模块质量门禁

**说明：** 同步项目入口文档，完成模块级验证与独立评审，并获取 CI 的实跑证据。

**验收标准：**

- 文档同步：
  - `DOCUMENTATION-BASELINE.md` 登记全部新文档，并标明状态；
  - `README.md` 更新开发状态与 `pnpm typecheck` 命令；
  - `CONTRIBUTING.md` 链接依赖变更流程、发布门禁，并写明"建议管理员把 CI 设为必需检查"。
- 独立评审：由新上下文的评审代理审阅 CI 权限与供应链配置，确认没有写权限、没有使用 secret、没有 `pull_request_target`，并检查文档的一致性；阻断项与应修项已处理。
- CI 实跑证据（经项目所有者授权推送后获取）：
  - 模块 PR 上 CI 在 Node 22 与 24 上均通过；
  - 临时制造的 lint 失败提交使 CI 报红，随后撤销，CI 恢复为绿。
- 结果写入 `tasks/platform-governance/verification.md`。

**验证：**

- 在干净 worktree 中冻结安装，然后执行 lint、build、test、typecheck；
- 用 spec-guard 做产物校验与文档核验；
- CI 运行结果：链接、结论、Node 版本。

**依赖：** 任务 5。

**预计范围：** M（入口文档、验证记录、CI 证据）。

## Task List

### Phase 1：基础

- #33 根脚本 typecheck 与基线 CI
- #34 供应链规则落地与依赖变更流程（blocked by #33）
- #35 ADR-0009 与身份发布基线规则（blocked by #34）

### Phase 2：治理文档

- #36 浏览器矩阵与 V1 验收基线（blocked by #35）
- #37 发布门禁、回滚、事故处置与恢复演练（blocked by #36）

### Phase 3：交付

- #38 文档同步与 platform-governance 模块质量门禁（blocked by #37）

## 风险与缓解

| 风险 | 影响 | 缓解方式 |
|---|---|---|
| `trustPolicy: no-downgrade` 或 `minimumReleaseAgeIgnoreMissingTime: false` 让现有 lockfile 安装失败 | 中 | 任务 2 先在干净副本中冻结安装验证；需要豁免的依赖逐个版本登记，而不是整体放宽 |
| CI 上 pnpm 的缓存或安装行为与本地不同 | 中 | 严格按 `pnpm/setup` 官方输入配置；以任务 6 中模块 PR 的实跑结果为最终证据 |
| action 固定的 SHA 与声明的版本不符 | 高 | 用 `gh api` 核对每个 tag 对应的 commit，并写入验证记录 |
| 治理文档与 ADR、RACI 不一致，或复制内容后日后分叉 | 中 | 只引用不复制；每个文档任务都逐条对照事实源 |
| 推送制造失败的提交会污染分支历史 | 低 | 失败提交只用于 CI 证据，随后撤销；合并方式保留回滚点 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6，每个任务单独提交。全部完成后开一条模块 PR，正文写 `Closes #15`。

## 完成条件

- 模块 #15 下的所有任务按顺序完成，并在模块 PR 合并后关闭。
- spec 的全部验收标准均满足，包括 CI 在远端通过、报红、再恢复的实跑证据。
- 本模块没有实现运行时、恢复 worker 或身份比较工具。

## 修订：桌面端发布通道与本地门禁替代 CI

规格见 [spec/platform-governance.md](../../spec/platform-governance.md) 的同名修订，决定见 [ADR-0030](../../docs/adr/0030-desktop-release-channel.md) 与 [ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md)。分支 `feat/desktop-release-channel`，基于 `main` 的 `092e803`。每个任务一个提交，提交信息带 `Task: D<n>`，不写 closing keyword。

#### D1：规格修订、ADR-0030 与 ADR-0031（提议）以及本计划

**验收：** 规格修订、两份 ADR（状态为"提议"）与本节一次提交。

#### D2：接受 ADR 与治理文档更新

**范围：** 项目所有者接受后，两份 ADR 各自改为"已接受"，与文档更新分开提交。按规格"交付物增量"更新浏览器矩阵、验收矩阵、运行手册与证据模板，新增本地门禁记录模板，同步 README 的支持范围和文档基线。
**验证：** 四处关于通道的表述一致；所有链接有效。
**依赖：** D1；项目所有者接受两份 ADR。

#### D3：让 `beforeinstallprompt` 在桌面 Chrome 上可稳定取得

**范围：** 查明 `examples-browser-e2e/browser-tests/install.spec.ts` 中两条用例被跳过的原因，让桌面 Chrome N 与 N-1 能稳定取得安装资格事件。如果需要修改示例应用，保持 Vue 与 React 两个示例的元素 id 和行为一致，不去掉更新检查的 100 ms 防抖，并跑通 `update.spec.ts` 与 `recovery.spec.ts`。自动化只证明"安装资格事件"，不代替原生安装记录。
**验证：** 两条用例在 N 与 N-1 下都不再跳过，并且连续运行两次结果一致；examples-browser-e2e 的其余测试全部通过。
**依赖：** D1。可与 D2 并行。

#### D4：首次本地门禁记录（ADR-0031）

**范围：** 以候选提交按 ADR-0031 执行一次，Node 22 与 24 各一遍，产出第一份本地门禁记录。
**依赖：** D2、D3 合入候选之后。

#### D5：桌面端通道首次演练

**范围：** Chrome 153（N）与 Chrome for Testing 152（N-1）下的全仓库 `test:browser`；Vue 与 React 示例在 N 与 N-1 下的原生安装记录（共 4 次，由项目所有者点击安装确认框）；恢复演练。填写一份 `desktop` 通道的浏览器发布证据（演练用，不对应真实生产发布）。
**依赖：** D4。

#### D6：修订质量门禁

**范围：** 在干净 worktree 中复核文档一致性、链接与各项测试；做独立评审；结果写入 `tasks/platform-governance/verification.md` 的"修订门禁：桌面端发布通道"一节。
**依赖：** D5。

### Task List（修订）

- D1 规格修订、ADR-0030 与 ADR-0031（提议）以及本计划
- D2 接受 ADR 与治理文档更新（blocked by D1 与项目所有者接受）
- D3 桌面 Chrome 的 `beforeinstallprompt`（blocked by D1；可与 D2 并行）
- D4 首次本地门禁记录（blocked by D2、D3）
- D5 桌面端通道首次演练（blocked by D4）
- D6 修订质量门禁（blocked by D5）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 以 `desktop` 通道发布后被误读为已支持 Android | 高：业务方在 Android 上依赖安装或离线 | ADR-0030 要求 README 与对外说明写明支持范围；证据模板区分"不在本通道" |
| 本地门禁记录被当作永久方案 | 中 | ADR-0031 规定 GitHub 恢复后自动失效，并有补跑义务 |
| 桌面 Chrome 在自动化环境中不发出 `beforeinstallprompt` | 中：D3 无法完成 | 先查明原因；确实无法取得时如实登记，不放宽判定 |
| 修改示例应用影响 Cloudflare 测试站 | 中 | 不改示例应用就能解决时优先不改；必须改时通知 Cloudflare 部署会话 |
| 原生安装需要项目所有者亲自操作 | 低：进度依赖人 | D5 提前准备好环境与记录表，把人工操作压缩到 4 次点击 |

### 执行顺序（修订）

D1 → D2 与 D3 并行 → D4 → D5 → D6。D3 的实现派给 `executor` 子代理，主会话在任务边界验收。

## 修订：本地门禁工具入仓

规格见 [spec/platform-governance.md](../../spec/platform-governance.md) 的同名修订。分支 `feat/local-gate-tool`，基于 `main` 的 `024e6d4`。每个任务一个提交，提交信息带 `Task: G<n>`。

#### G1：规格修订与本计划

**验收：** 规格修订节与本节一次提交；项目所有者确认"前提"后才开始 G2。

#### G2：包骨架与纯函数（TDD）

**范围：** 新建 `packages/release-tools`（私有，只用仓库已有的依赖）；命令列表、结论计算、日志头、记录渲染、参数校验，全部是纯函数并先写测试；CI 一致性测试；在包边界文档、各包说明与 `check-package-distribution.mjs` 中登记。
**验证：** 本包的 `test`、`typecheck`、`build` 通过；`pnpm check:publish` 通过；`pnpm lint` 通过。
**依赖：** G1 与项目所有者确认。

#### G3：执行器与集成测试（TDD）

**范围：** 按 Node 版本各建 worktree、切换 `PATH`、写日志头、计算哈希、执行可用性检查、输出 `results.json` 与 Markdown 记录、清理 worktree；临时 git 仓库上的集成测试。
**验证：** 集成测试覆盖规格列出的全部情况，并连续运行两次结果一致。
**依赖：** G2。

#### G4：命令行入口、根脚本与真实运行

**范围：** 命令行入口与根目录的 `gate:local`；更新本地门禁记录模板的说明；用本工具对候选提交完整跑一次，并与 `local-gate-v2.sh` 对照；结果写入验证记录。
**依赖：** G3。

#### G5：修订质量门禁

**范围：** 干净 worktree 中的全仓库门禁（使用本工具本身）；独立评审；写入验证记录"修订门禁：本地门禁工具"一节。
**依赖：** G4。

### Task List（修订）

- G1 规格修订与本计划
- G2 包骨架与纯函数（blocked by G1 与确认）
- G3 执行器与集成测试（blocked by G2）
- G4 命令行入口、根脚本与真实运行（blocked by G3）
- G5 修订质量门禁（blocked by G4）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新包改动 `pnpm-lock.yaml`，与其他会话冲突 | 中 | 只用已有依赖；合入前向其他会话确认 |
| 通过 `PATH` 切换 Node 在某些 pnpm 安装方式下无效 | 高：两轮实际用了同一个 Node | 日志头记录 `node -v`，集成测试断言它来自传入的可执行文件；真实运行时人工核对两轮的版本不同 |
| 集成测试依赖真实 git 与文件系统，可能不稳定 | 中 | 使用独立临时目录，结束后删除；连续运行两次 |
| 工具本身出错导致门禁结论错误 | 高 | 结论计算是纯函数并有单元测试；真实运行与旧脚本的结果对照 |

### 执行顺序（修订）

G1 → 确认 → G2 → G3 → G4 → G5。G2 与 G3 的实现派给 `executor` 子代理，主会话在任务边界验收。

## Documentation delivery

本表与 `spec/platform-governance.md` 末尾的 Documentation impact 表对应，列出本模块最近一次修订（"本地门禁工具入仓"）需要更新的文档。

| Concern | Planned artifact | Rationale |
|---|---|---|
| local-ci-record | `docs/operations/local-ci-record-template.md`、`docs/adr/0031-local-gate-substitute-for-ci.md` | 执行规则改为使用 `pnpm gate:local` 生成记录，禁止手工转写退出码与哈希；ADR-0031 本身不变。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| local-ci-record | delivered | `docs/operations/local-ci-record-template.md`（`950fe3d`） | G4 写入了工具的调用方式与"不得手工转写"的规则；评审后的调用方式随 G4 修复同步。 |

## 修订：高频开发下的 CI 触发策略（2026-09-25）

本修订执行 [platform-governance 规格](../../spec/platform-governance.md) 的同名章节。工作分支为 codex/ci-trigger-control，基于 main 的 cc8b8b6。目标是在保持完整质量门禁和发布提交证据的同时，避免每次 AI 辅助开发提交都启动三项 GitHub job。

### C1：规格与计划

在模块规格中替换旧的 main push 触发要求，记录 PR、手动发布验证、分支规则与文档影响；建立本地 todo。验收：旧要求与修订关系明确，任务均有验证标准。

### C2：工作流触发

修改 .github/workflows/ci.yml：目标为 main 的 PR 仅在指定事件触发；Draft PR job 跳过；增加 workflow_dispatch，移除 push；PR 旧运行可取消，手动发布运行保持独立；质量步骤和权限不变。验收：工作流语法可解析，静态检查证实触发、权限与 job 内容符合规格；PR 真实运行三项 job 通过。

### C3：流程文档

更新 CONTRIBUTING.md、docs/operations/documentation-site.md、docs/operations/release-and-incident-runbook.md 与 docs/DOCUMENTATION-BASELINE.md。验收：日常分支、Ready PR、最终 main SHA 的手动 CI、docs/v* 的手动发布顺序一致；相对链接有效。

### C4：远端验证与 main 规则

本地检查后推送工作分支、创建 PR，确认 Ready PR 的全部 job 通过。随后在 GitHub 为 main 启用要求 PR 与三个 CI job 的规则，并要求分支保持最新；确认规则指向正确仓库和分支后合并 PR。验收：main push 不再创建 CI，分支规则存在且无付费 runner 或部署行为；最终 main 的工作区和远端一致。

### 风险与控制

- 移除 main push 后，直接推送可能绕过验证：先建立分支规则，再合并工作流变更。
- Draft PR 的跳过 job 在 GitHub 可显示成功：Draft 不可合并；ready_for_review 与后续 synchronize 必须重新运行，规则以 Ready PR 的真实结果为准。
- PR 检查通过与合并提交 SHA 不同：任何正式发布前通过 workflow_dispatch 对最终 main SHA 再跑完整矩阵；运行 SHA 不符时不得发布。
- GitHub Actions 用量与 Cloudflare 发布无直接关系；本任务不调用 Cloudflare 部署或 R2 写入。
