# 规格：platform-governance

## 目标

把平台发布与运维的约束落成可审阅、可执行的基线，内容包括：浏览器矩阵、V1 验收基线、发布门禁与回滚、恢复 worker 演练、身份发布基线规则、供应链规则和事故处置。同时引入基线 CI，让仓库门禁不再只靠本地执行。

成功标准：

- 每个 PR，以及 main 上的每次推送，都在 CI 中以冻结 lockfile 通过 lint、构建、测试和 typecheck。
- 供应链规则写在仓库配置里，不依赖个人机器的默认值或用户级配置。
- 后续模块的质量门禁可以直接引用本模块的浏览器矩阵和验收基线，不需要重新约定。

## 范围

本模块交付治理基线和少量自动化，不新增运行时包。

**交付物：**

- `.github/workflows/ci.yml`：基线 CI
- `pnpm-workspace.yaml`：显式声明供应链设置
- 根脚本新增 `typecheck` 操作
- `docs/adr/0009-identity-migration-bumps-cache-namespace-seed.md`：修订 ADR-0008 中关于身份迁移的表述
- 治理文档（中文，放在 `docs/architecture/` 与 `docs/operations/`）：浏览器矩阵、V1 验收基线、发布门禁与回滚、事故处置、恢复演练、身份发布基线规则、依赖变更流程
- 同步更新 `DOCUMENTATION-BASELINE.md`、`README.md`、`CONTRIBUTING.md`

**不做的事：**

- 恢复 worker 本身（归 sw-runtime）
- 身份基线比较工具（归 build-verifier）
- 真实浏览器 E2E（归 browser-test-harness、examples-browser-e2e）
- 部署自动化或 CD、npm 发布
- 监控与告警的实现
- 修改 GitHub 仓库设置，例如分支保护

## 交付物规格

### 基线 CI

**触发与权限**

- 在指向 `main` 的 `pull_request` 和 `main` 上的 `push` 时触发，不使用 `pull_request_target`。
- workflow 只有 `contents: read` 权限，不读取任何 secret。
- 同一个 ref 上有新的运行开始时，取消仍在进行中的旧运行。

**运行环境**

- 单个 job，运行在 `ubuntu-latest`。Node 版本矩阵为 22 和 24，对应 `engines` 的 `>=22`，两者都是 LTS。
- `actions/checkout`、`pnpm/setup` 等 action 一律固定到完整的 commit SHA，并在注释里写明对应版本。
- checkout 设置 `persist-credentials: false`。
- `pnpm/setup` 从 `packageManager` 字段读取 pnpm 版本，要求使用冻结的 lockfile 安装，并开启依赖缓存。

**步骤**

1. 依次执行 `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck`，任一失败即判定 CI 失败。
2. 最后执行 `pnpm audit`，只输出报告，不影响 CI 结果；发现的问题按依赖变更流程处理。

**验证方式**：本模块的 PR 上 CI 必须通过；有意制造一次失败时，CI 必须报红。

### 供应链规则

在 `pnpm-workspace.yaml` 中写明以下设置：

| 设置 | 值 | 说明 |
|---|---|---|
| `minimumReleaseAge` | `1440` | 把 pnpm 11 的默认值显式写出 |
| `minimumReleaseAgeIgnoreMissingTime` | `false` | 元数据缺少发布时间时直接失败，不跳过检查 |
| `blockExoticSubdeps` | `true` | 把 pnpm 11 的默认值显式写出 |
| `trustPolicy` | `no-downgrade` | 新开启 |
| `minimumReleaseAgeStrict` | `true` | 显式设置 `minimumReleaseAge` 时 pnpm 会自动启用；显式写出，防止退回自动豁免的宽松模式（独立评审后补充） |
| `trustLockfile` | `false` | 把 pnpm 11 的默认值显式写出：每次安装都重新校验 lockfile 条目（独立评审后补充） |
| `strictDepBuilds` | `true` | 把 pnpm 11 的默认值显式写出（实现时补充） |

**豁免与审批**

- 豁免（`minimumReleaseAgeExclude`、`trustPolicyExclude`）只能逐个版本添加，并在 PR 中写明理由。
- 依赖的安装脚本只能通过 `allowBuilds` 逐项批准，默认不允许；新增批准也要在 PR 中写明理由。实现前要按 pnpm 11 官方文档确认：遇到未批准的构建脚本时，安装会失败，而不是只给出警告。
- 仓库不提交 `.npmrc`。pnpm 11 的 `.npmrc` 只允许存放认证和 registry 配置。

**依赖变更流程**需要写成文档，内容包括：新增或升级依赖时说明理由、审阅 lockfile 的 diff、豁免如何登记、审批人是谁，以及 `pnpm audit` 报告的处理方式（由谁确认、何时升级或登记豁免）。

**验证方式**：

- 冻结安装通过；
- `pnpm config get` 能读到上述设置；
- 在临时副本中调大 `minimumReleaseAge`，确认安装失败，证明设置生效。

### 浏览器矩阵

新增 `docs/architecture/browser-matrix.md`，把 V1 验收矩阵里"当前 Chromium 桌面端和 Android"这句话展开成可执行的规则：

- **必测，阻塞发布**：Chrome 桌面端和 Chrome Android 的最新稳定版（N）与上一个稳定版（N-1）。
- **参考，不阻塞**：Edge 稳定版。
- **渐进兼容说明**：Safari（macOS / iOS）和 Firefox 桌面端。安装与 Push 不做保证；离线与更新行为如有已知差异，需要记录。
- **版本号**：文档只写规则，不写具体版本号；每次验证时，把实测的版本号记在验证记录里。
- **检测原则**：沿用 `compatibility.md` 的特性检测原则。

### V1 验收基线

扩展 `docs/architecture/v1-acceptance-matrix.md`：为每个场景写明负责模块、证据类型和通过标准，并引用浏览器矩阵的必测范围。

| 场景 | 负责模块 | 证据 |
|---|---|---|
| 首次在线访问 | sw-runtime、client-runtime、vite-adapter | 真实浏览器 E2E；build-verifier 校验计划与产物 |
| 后续离线启动 | sw-runtime | 真实浏览器 E2E |
| 未缓存、私有或流式请求 | policy-compiler（规则与 golden）、sw-runtime | 单元测试与 golden 测试；E2E 断言平台缓存中不出现对应条目 |
| 发现更新 | client-runtime、sw-runtime | 真实浏览器 E2E |
| 异常 worker 恢复 | sw-runtime | 恢复演练记录与 E2E |
| Vue 与 React 示例 | examples-browser-e2e | 按浏览器矩阵执行的 E2E |

### 发布门禁、回滚与事故处置

扩展 `docs/operations/release-and-incident-runbook.md`。

**发布门禁清单**

- CI 通过，并附有验证记录；
- 身份基线比较通过（build-verifier 交付之前靠人工核对，交付之后强制执行）；
- 在类生产环境中逐项核对：计划、产物路径、响应头基线、安装、离线应用壳、等待更新，并完成恢复演练。

**响应头基线**：沿用 `lifecycle.md` 的要求。`sw.js`、manifest 和 HTML 使用 `no-cache`；带指纹的资源不可变、长期缓存；私有内容不可缓存。

**带指纹资源的兼容窗口**：至少保留前两次发布的带指纹资源，并且保留时间不少于 7 天，两者取更长者。缩短窗口需要新增 ADR，并由发布负责人批准。

**回滚流程**

1. 只回滚 HTML 是不够的：已安装的 worker 仍会继续生效。
2. worker 出现故障时，先发布已批准的恢复 worker。
3. 确认恢复 worker 已激活，并且只清理了本应用的缓存命名空间。
4. 再发布修复后的 worker。

**事故处置**：写明事故分级和每一级的响应动作；职责沿用 `ownership-and-raci.md`，不做调整；附对外沟通模板和复盘记录模板。

### 恢复演练

新增 `docs/operations/recovery-drill.md`。

**演练步骤**

1. 安装当前的 worker，并填充缓存。
2. 部署恢复 worker。
3. 验证以下几点：
   - 恢复 worker 已激活，并接管了客户端；
   - 不再拦截 fetch 请求；
   - 只删除匹配 contracts `appCachePrefix` 的缓存；
   - 其他应用或其他环境的缓存保持不动。
4. 部署修复后的 worker，验证应用恢复正常。

**触发时机**：以下两种情况各做一次。

- sw-runtime 及相关运行时模块提交 PR 时的质量门禁中；
- 每次生产发布之前，在类生产环境中。

文档还要写明通过标准和演练记录模板。

### 身份发布基线规则

新增 ADR-0009，并以它为依据新增 `docs/operations/identity-release-baseline.md`。

**ADR-0009**

- 身份迁移提升的是 `cacheNamespaceSeed`，也就是 ADR-0008 所说的 identity-revision。
- `schemaVersion` 只用于区分契约的序列化形状，身份迁移不改变它。
- ADR-0008 中"身份迁移必须提升 `schemaVersion`"这句话，标注为已被 ADR-0009 取代。
- ADR-0008 的其余决定保持不变。

**基线规则**

- **基线内容**：上一次生产发布所用的、能通过 `validateIdentity` 的 `PwaIdentity` 规范 JSON，每个环境各一份。
- **比较规则**：ADR-0008 列出的 8 个不可变字段必须逐字相等；不同环境视为不同的身份。
- **迁移流程**：必须是一次有名称的迁移，记录内容包括原因、新旧身份、`cacheNamespaceSeed` 的提升、清理步骤、回滚步骤和审批人。
- **比较工具**：由 build-verifier 实现；在它交付之前，发布门禁中这一项靠人工核对。

## 命令

```text
pnpm lint
pnpm build
pnpm test
pnpm typecheck
```

`pnpm typecheck` 是根脚本新增的操作，行为如下：

- 不带 `--filter` 时：先构建，再对所有工作区包执行；
- 带 `--filter` 时：先构建目标包的依赖，再只检查目标包；
- 包名不存在时：以失败退出。

## 测试策略

- **CI**：以本模块 PR 上的实际运行结果为证据；另外在分支上临时制造一次 lint 失败，确认 CI 报红，再撤销。
- **供应链配置**：冻结安装通过；能读出配置值；做一次负向检查（在临时副本中调大 `minimumReleaseAge`，确认安装失败）。
- **根脚本 `typecheck`**：分别验证带 filter、不带 filter、包名写错三种情况，确认执行顺序和退出码都符合预期。
- **文档**：
  - 相对链接都能解析；
  - 验收基线中的模块名都来自能力图；
  - 职责描述与 RACI 一致；
  - ADR-0009 与 contracts spec 一致；
  - 用 spec-guard 的文档核验确认交付状态。

## 边界

- **始终**：规则写成可检验的标准；引用 ADR、规格和 RACI，而不是复制它们的内容；CI 使用最小权限；action 固定到 SHA；文档中不编造实测数据。
- **先询问**：改变 ADR 的结论；放宽安全规则或供应链规则；引入新工具（actionlint、Dependabot、Renovate 等）；修改仓库设置；引入 CD 或发布自动化。
- **禁止**：CI 读取密钥或申请写权限；使用 `pull_request_target`；实现运行时、恢复 worker 或身份比较工具。

## 验收标准

1. 基线 CI 在 PR 和 main 推送时，以冻结 lockfile 在 Node 22 与 24 上运行 lint、构建、测试和 typecheck，并附带不阻塞的 audit 报告；权限最小，action 固定到 SHA；本模块 PR 上 CI 通过，有意制造失败时 CI 报红。
2. `pnpm-workspace.yaml` 显式声明了供应链设置，冻结安装通过，负向检查证明设置确实生效。
3. 浏览器矩阵定义了必测、参考和渐进兼容三档，以及 N / N-1 规则。
4. V1 验收基线为每个场景写明了负责模块、证据类型和通过标准，并引用浏览器矩阵。
5. 发布门禁、回滚、事故处置和恢复演练文档都给出了步骤、通过标准和记录模板；兼容窗口与演练触发时机按本规格执行；职责与 RACI 一致。
6. ADR-0009 修订了 ADR-0008 中关于身份迁移的表述；身份发布基线规则按 ADR-0009 定义了基线内容、比较规则和迁移审批，并写明比较工具由 build-verifier 实现。
7. 文档基线、README 和 CONTRIBUTING 已同步，新文档已登记到文档基线。

## 已决定事项（项目所有者，2026-09-15）

- 引入基线 CI；供应链规则写入仓库配置强制执行；身份基线规则由本模块定义，比较工具由 build-verifier 实现。
- 浏览器矩阵必测 Chrome 桌面端和 Chrome Android 的 N 与 N-1。
- 新增 ADR-0009 修订 ADR-0008：身份迁移提升 `cacheNamespaceSeed`，而不是 `schemaVersion`。
- 带指纹资源的兼容窗口：至少保留前两次发布，且不少于 7 天。
- CI 运行 `pnpm audit`，但不阻塞。
- 恢复演练在运行时模块的质量门禁中和每次生产发布前各做一次。
- 身份发布基线按部署槽位保存：槽位是应用配置中登记的稳定名称，不属于身份字段；同一槽位内任何身份字段（包括 `environment`）的变化都是身份迁移；首次发布评审要确认 `origin` + `scope` 与 `serviceWorkerUrl` 没有被已有基线占用。
- 恢复 worker 总是立即激活并接管客户端，安全事故与 worker 故障都适用；每次在生产发布恢复 worker 都需要平台负责人批准，并记入事故时间线。
- Chrome Android 的 N-1 通过两台关闭自动更新、只从 Google Play 更新的设备轮换获得；拿不到 N-1 时该项按未通过处理。

## 建议（不属于代码变更）

- 如果要把 CI 设为合并前的必需检查，需要仓库管理员在 GitHub 的分支保护设置中开启。本模块只在文档中写明这项建议。

## 修订：桌面端发布通道与本地门禁替代 CI（2026-09-22，已评审通过）

### 起因

2026-09-22 的复审显示：v1 的代码与本地测试已基本齐全（单元测试 1602 条、真实浏览器测试 170 条全部通过），但发布门禁仍被两类证据挡住：

- 浏览器矩阵要求 Chrome 桌面端和 Chrome Android 的 N 与 N-1 全部通过。Android 只有一台实体设备（Chrome 152），只取得了 Vue 示例的 N-1 原生安装，React 未取得安装事件，Android N 从未取得；桌面端 N-1 只用一次性配置跑过示例套件，全仓库没有跑过；
- 发布门禁要求 CI 运行链接，但 GitHub 账号不可用，所有模块都没有 CI 证据。

项目所有者决定优先打通 PC 链路。

### 已确认的前提（项目所有者，2026-09-22）

- v1 先按桌面端发布。发布门禁拆成桌面端通道和 Android 通道，Android 作为后续的独立门禁。
- 桌面端 N-1 使用 Google 官方的 Chrome for Testing 构建，通过 ADR-0010 已有的 `PWA_HARNESS_CHROME_PATH` 运行。允许下载。
- GitHub 恢复之前，用"在干净 worktree 中完整跑一遍门禁"的本地记录代替 CI 运行链接。这是临时措施，恢复后补跑真实 CI。
- 以修订已交付模块的方式落地，能力图不变。

### 不变的部分

- 浏览器矩阵的三档划分与 N / N-1 规则；Chrome Android N-1 的设备轮换规则。
- 机器发布门禁（`verifyRelease` 与 `verifyReleaseGateCoverage`）、身份基线比较、响应头基线、兼容窗口、恢复演练与回滚流程。
- build-verifier 与各运行时包的代码。本修订只改治理文档，以及 examples-browser-e2e 的测试代码（D3、D6）。
- "未执行不等于通过"的判定规则。

### 契约增量

**发布通道（ADR-0030）**

- 每次生产发布必须声明本次发布的通道：`desktop` 或 `desktop+android`。
- `desktop` 通道的必测范围是 Chrome 桌面端的 N 与 N-1，包括 Vue 与 React 示例的原生安装记录，以及恢复演练。
- `desktop` 通道的发布证据中，Chrome Android 各行填写"不在本通道"，不得填写"通过"，也不算作"未执行"。
- 以 `desktop` 通道发布时，Android 未经验证、不做任何保证，包括基础网页体验。对外说明与 README 中不得声称支持 Android。
- 通道在发布尝试创建时由发布负责人确定，之后不可更改；"不在本通道"只允许用于 `desktop` 通道的 Chrome Android 行；`desktop` 通道的证据必须附已知的 Android 问题清单（2026-09-22 评审后补充）。
- `desktop+android` 通道即原来的完整门禁，规则不变。首次以 `desktop+android` 发布之前，平台不得声称 Android 已受支持。

**CI 证据的本地替代（ADR-0031）**

- 替代条件：GitHub 仓库或 Actions 不可用，且发布提交还没有任何 CI 运行结果。可用之后立即失效，此后的发布只接受真实 CI 运行链接。每次使用都记录可用性检查的原文；签署人必须是人类发布负责人；日志缺失或哈希不符时记录作废（2026-09-22 评审后补充）。
- 执行方式：每个 Node 版本各新建一个分离的 worktree，在 Node 22 与 Node 24 下分别执行 `pnpm install --frozen-lockfile`、lint、build、test、typecheck，以及 Chrome 桌面端 N 的 `test:browser`；另外执行不阻塞的依赖审计。每项的退出码都必须为 0（审计除外）。
- 记录内容：发布提交、Node / pnpm / 操作系统 / Chrome 版本、执行的命令、每项的退出码、每份日志的 SHA-256、开始与结束时间、执行者。记录写入 `docs/operations/local-ci-record-template.md` 规定的格式，日志文件由发布系统保存，不提交到仓库。
- 补跑义务：GitHub 恢复后，对每个以本地记录发布的提交补跑真实 CI，结果追加到对应的发布证据。补跑失败按事故处理。

### 交付物增量

- `docs/architecture/browser-matrix.md`、`docs/architecture/v1-acceptance-matrix.md`：写入发布通道与每个通道的必测范围。
- `docs/operations/release-and-incident-runbook.md`：CI 门禁项增加本地替代条款；"浏览器证据闭合"按通道判定。
- `docs/operations/browser-release-evidence.md`：记录模板增加"发布通道"字段和"不在本通道"状态。
- 新增 `docs/operations/local-ci-record-template.md`。
- ADR-0030、ADR-0031；README 的支持范围说明；文档基线登记新文档。
- 与通道或本地替代冲突的其他文档（2026-09-22 独立评审发现）：`docs/operations/release-orchestration-protocol.md`、`docs/operations/release-record-template.md`、`spec/browser-release-evidence.md`、ADR-0025 的状态行、`docs/operations/npm-package-release.md`、`spec/package-distribution.md`。

### 本修订不做的事

- 不改变 Android 通道的任何规则，不降低桌面端的必测要求。
- 不修改 build-verifier 或任何运行时包的代码；只改 examples-browser-e2e 的测试代码。不新增 CI 平台。本地门禁脚本纳入仓库另立任务。
- 不用自动化结果代替原生安装记录。原生安装确认框只能由人操作。

### 测试策略增量

- 文档一致性：每个链接都指向实际存在的文件或锚点；`desktop` 通道的规则在浏览器矩阵、验收矩阵、运行手册和证据模板四处表述一致。
- 首次演练：以本分支上的候选提交，按本修订完整走一次桌面端通道。包括：本地门禁记录（Node 22 与 24）；Chrome 153（N）与 Chrome for Testing 152（N-1）的全仓库 `test:browser`；Vue 与 React 示例的原生安装记录（由项目所有者操作）；恢复演练。结果写入验证记录。演练中任何一项不通过，都登记为修订的发现，不修改规则去迁就结果。

### 验收标准增量

1. ADR-0030 与 ADR-0031 被接受；上述文档按"交付物增量"更新，且四处关于通道的表述一致。
2. 首次演练完成，所有必测项都有"通过"或"失败"的记录，没有空项；失败项附原因与后续任务。
3. 修订门禁在干净 worktree 中执行，结果写入 `tasks/platform-governance/verification.md` 的"修订门禁：桌面端发布通道"一节，并附独立评审结论。

### 开放问题

- **类生产环境用哪一个**：本地预览，还是 Cloudflare 测试站。Cloudflare 测试站是从示例构建的，部署需要项目所有者的凭据。项目所有者于 2026-09-22 决定首次演练使用本地预览；正式发布证据用哪一个，届时再定。
- **Edge 参考档**：本机没有安装 Edge。安装需要下载，届时先询问项目所有者；在此之前记录为"未执行"（不阻塞）。

## 修订：本地门禁工具入仓（2026-09-22，已评审通过）

### 起因

ADR-0031 规定了 GitHub 不可用期间"本地干净门禁"的执行方式，但执行它的是一个放在仓库外、没有测试的 zsh 脚本。2026-09-22 的两次运行暴露了四个问题：

| 问题 | 实际发生 | 后果 |
|---|---|---|
| 脚本算错结论 | 结果表的制表符被写成字面 `\t`，全部通过却报告"14 项失败" | 结论只能人工核算 |
| 环境不干净 | zsh 通配符没有匹配时整条清理命令被跳过，Node 24 那一轮复用了 Node 22 的产物 | 违反 ADR-0031，直到独立评审才发现 |
| 脚本不在仓库里 | 放在临时目录，靠手工存档 | 无法评审，不同执行者可能用不同脚本，记录之间不可比 |
| 记录靠手抄 | 退出码与哈希从结果表手工搬进 Markdown | 容易抄错，无法校验 |

门禁结论的可信度取决于这个脚本，而它是整个流程里唯一没有测试的一环。

### 已确认的前提（项目所有者，2026-09-22）

- 新建私有工作区包 `@pwa-platform/release-tools`（`private: true`，不发布到 npm），自带单元测试，由现有的 `pnpm test` 覆盖。项目所有者已于 2026-09-22 选定这一位置。
- 用 TypeScript 编写并编译到 `dist/`，与其他包一致；不再使用 zsh。
- Node 版本由调用方显式传入可执行文件路径（例如 `--node 22=<path> --node 24=<path>`）；没有传入时，若本机装有 nvm 则自动查找。工具本身不依赖 nvm。
- 日志与记录输出到调用方指定的仓库外目录，不提交。
- 签署人姓名与可用性检查命令必须由调用方传入，缺一则拒绝运行。工具执行该命令并原样记录输出，自身不判断 GitHub 是否可用。
- 以修订已交付模块的方式落地，能力图不变；规则已由 ADR-0031 决定，工具只负责执行，不需要新 ADR。

### 不变的部分

- ADR-0031 的全部规则；基线 CI 配置；本地门禁记录模板的字段。
- 其他包的代码与公开契约。

### 契约增量

**命令与结论（纯函数）**

- 固定的命令顺序：`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm test:browser`、`pnpm audit --ignore-registry-errors`。单元测试读取 `.github/workflows/ci.yml`，断言除安装外的每条命令都在 CI 中以相同写法出现，防止两者走样。
- 结论：除依赖审计外，每条命令的退出码都为 0 才算通过；任何一条缺失（没有执行）也算未通过。
- 日志头：每份日志开头依次写 `# commit`、`# node`、`# pnpm`、`# utc`、`# chrome`、`# command` 六行，格式固定。其后紧接三行环境诊断：`# path-head`（实际 `PATH` 首项）、`# pnpm-which`（`pnpm` 的位置）与 `# pnpm-node`（pnpm 的运行时），然后才是命令输出。
- 记录渲染：按 `docs/operations/local-ci-record-template.md` 的字段生成 Markdown 记录，退出码与哈希直接取自运行结果，不经人工转写。

**执行（有副作用）**

- 每个 Node 版本各新建一个分离的 worktree，跑完即删；删除失败时在记录中写明，结论为未通过。
- 切换 Node 版本的方式：把对应 Node 可执行文件所在目录放在 `PATH` 最前，`pnpm` 及其子进程随之使用该版本；日志头中的 `node -v` 在同一环境下取得，用来证明确实切换了。
- 输出目录已存在时拒绝运行，避免覆盖旧记录。
- 所有命令都执行完才给结论，不因某一条失败而提前停止。
- 产出 `results.json`（机器可读）、每条命令一份日志，以及渲染好的 Markdown 记录。

**入口**

- 根目录新增脚本 `pnpm gate:local --commit <提交> --out <仓库外目录> --signer "<姓名>" --availability-check "<命令>"`，调用本包编译后的入口 `dist/bin.js`；参数开头多出的 `--` 会被忽略。

**独立评审后补充的约束（2026-09-22）**

- 请求的提交先解析为 40 位 SHA，解析失败即拒绝运行；每一轮都检出这个 SHA，并逐轮核对日志头中的提交，不一致即判未通过。记录同时写出请求值与解析值。
- 必须覆盖 CI 矩阵中的全部 Node 主版本（目前是 22 与 24）；缺少任何一个即拒绝运行，结论也判未通过。
- 每条命令在最小化的环境中运行：去掉 `NODE`、`NODE_OPTIONS`、`INIT_CWD` 与全部 `npm_*`、`PNPM_SCRIPT_*` 变量，去掉 `PATH` 中所有 `node_modules/.bin` 与 `node-gyp-bin`，设置 `CI=true`；每轮记录实际 `PATH` 首项、`PATH` 上的 node、`pnpm` 的位置与 pnpm 的运行时：pnpm 是 `#!/usr/bin/env node` 脚本时，记录其 shebang 并按同一 `PATH` 解析出的 node；是原生二进制时如实标明。
- 输出目录不得位于仓库或它的任何 worktree 之内。
- 每条命令有超时（默认 30 分钟），超时判未通过；任何一轮中途出错都记为失败项，worktree 照常删除，结果与记录照常写出。
- 工具在构建时把自身所在仓库的提交与工作区状态写入 `dist/build-info.json`；运行时若构建信息缺失、与工具仓库当前 HEAD 不一致，或构建时、运行时工作区不干净，结论判未通过（`tool-stale`），避免签署的记录声称一个并未实际运行的工具版本（第二轮独立评审 N1）。
- 记录列出全部失败项、逐轮的观测值、可用性检查的退出码，以及生成记录的工具自身的提交与工作区是否干净；代码块与表格单元格按内容转义，任何输出都无法伪造记录结构。

### 本修订不做的事

- 不判断 GitHub 是否可用，不访问网络（依赖审计与安装命令自身的网络访问除外）。
- 不提交记录、不上传日志、不修改 CI、不签署。
- 不代替真实 CI：GitHub 恢复后，ADR-0031 的补跑义务照旧。

### 交付物增量

- `packages/release-tools`：源码、单元测试与集成测试。
- 根 `package.json` 的 `gate:local` 脚本；`scripts/check-package-distribution.mjs` 的私有包名单加入 `release-tools`。
- `docs/architecture/package-boundaries.md` 与 `docs/guides/packages-overview.md` 登记新包；`docs/operations/local-ci-record-template.md` 写明用本工具生成记录；文档基线同步。
- 修复 571300f 带入的文档核验回退：`1d72439` 在文档基线新增了关注项 `local-ci-record`，但 `spec/cloudflare-test-deployment.md`、`spec/offline-write-extension.md`、`spec/package-distribution.md` 的 Documentation impact 表没有对它表态，三个模块的核验因此为 `invalid`。本修订为三份规格补上 `follow` 行。之后如果再新增基线关注项，必须同步这三份规格。

### 测试策略增量

- **单元测试**：命令列表与 CI 的双向一致性（CI 新增的步骤若未纳入门禁，必须显式列入排除名单）；结论计算，包括全部通过、非审计项失败、只有审计失败、缺少某条命令；日志头格式；记录渲染的字段完整性；参数校验，包括缺少签署人、缺少可用性检查、输出目录已存在、Node 路径无效。
- **集成测试**：在临时目录里建一个最小 git 仓库，把命令列表替换为几条可控的 `node -e` 命令，其中一条故意失败。验证：每个 Node 版本各建一个 worktree，且两轮之间互不可见（第一轮写入的文件第二轮看不到）；worktree 跑完后被删除；日志头的提交号与 `node -v` 正确；结论与退出码一致。测试中两个"Node 版本"都用当前进程的 Node，只验证机制，不验证版本差异。
- **真实运行**：用本工具对本分支的候选提交完整跑一次（Node 22 与 24），并与 `local-gate-v2.sh` 在同一提交上的结果对照：退出码一致，测试条数一致。

### 验收标准增量

1. 上述单元测试与集成测试通过，并由 `pnpm test` 覆盖；`pnpm check:publish` 确认本包为私有。
2. 真实运行产出的 Markdown 记录无需手工修改即可使用，结论与人工核算一致。
3. 修订门禁在干净 worktree 中执行，结果写入 `tasks/platform-governance/verification.md` 的"修订门禁：本地门禁工具"一节，并附独立评审结论。

## Documentation impact

本表按 Spec Guard 的要求，对文档基线中的每一个关注项给出本模块最近一次修订（"本地门禁工具入仓"）的决定。

| Concern | Decision | Rationale |
|---|---|---|
| architecture | follow | 权威文档 `docs/architecture/overview.md` 不变；新私有包只登记在其引用的 `docs/architecture/package-boundaries.md` 中。 |
| browser-matrix | follow | 本修订不改变该基线的权威文档或验收结论。 |
| browser-release-evidence | follow | 本修订不改变该基线的权威文档或验收结论。 |
| browser-test-harness | follow | 本修订不改变该基线的权威文档或验收结论。 |
| build-verifier | follow | 本修订不改变该基线的权威文档或验收结论。 |
| capability-map | follow | 本修订不改变该基线的权威文档或验收结论。 |
| ci-baseline | follow | 本修订不改变该基线的权威文档或验收结论。 |
| client-runtime | follow | 本修订不改变该基线的权威文档或验收结论。 |
| cloudflare-test-deployment | follow | 本修订不改变该基线的权威文档或验收结论。 |
| decisions | follow | 本修订不改变该基线的权威文档或验收结论。 |
| developer-entry | follow | 本修订不改变该基线的权威文档或验收结论。 |
| examples-browser-e2e | follow | 本修订不改变该基线的权威文档或验收结论。 |
| identity-release-baseline | follow | 本修订不改变该基线的权威文档或验收结论。 |
| lifecycle-and-recovery | follow | 本修订不改变该基线的权威文档或验收结论。 |
| local-ci-record | update | 本修订把本地门禁记录改为由 `@pwa-platform/release-tools` 生成，模板的执行规则随之更新。 |
| offline-write-extension | follow | 本修订不改变该基线的权威文档或验收结论。 |
| package-distribution | follow | 本修订不改变该基线的权威文档或验收结论。 |
| product-direction | follow | 本修订不改变该基线的权威文档或验收结论。 |
| push-module | follow | 本修订不改变该基线的权威文档或验收结论。 |
| pwa-entry-resilience | follow | 本修订不改变该基线的权威文档或验收结论。 |
| recovery-drill | follow | 本修订不改变该基线的权威文档或验收结论。 |
| release-and-incident | follow | 本修订不改变该基线的权威文档或验收结论。 |
| release-gate-contract | follow | 本修订不改变该基线的权威文档或验收结论。 |
| release-orchestration-protocol | follow | 本修订不改变该基线的权威文档或验收结论。 |
| shared-origin-topology | follow | 本修订不改变该基线的权威文档或验收结论。 |
| ssr-adapters | follow | 本修订不改变该基线的权威文档或验收结论。 |
| supply-chain | follow | 本修订不改变该基线的权威文档或验收结论。 |
| sw-runtime | follow | 本修订不改变该基线的权威文档或验收结论。 |
| v1-acceptance | follow | 本修订不改变该基线的权威文档或验收结论。 |
| vite-adapter | follow | 本修订不改变该基线的权威文档或验收结论。 |
| vue-react-adapters | follow | 本修订不改变该基线的权威文档或验收结论。 |
| workbox-engine | follow | 本修订不改变该基线的权威文档或验收结论。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |

## 修订：高频开发下的 CI 触发策略（2026-09-25）

本节取代上文“每个 PR，以及 main 上的每次推送”与“main push 触发”的要求；质量检查的内容、只读权限、冻结安装及真实浏览器任务不变。

- 日常提交保存在短期工作分支。分支 push 本身不运行 CI；进入 main 必须通过 PR。
- CI 对目标为 main 的 PR 的 opened、reopened、synchronize、ready_for_review、converted_to_draft 事件响应。Draft PR 的耗时 job 跳过；转为 Ready 后立即执行，Ready 状态下每次更新都重新执行。PR 同一编号的新运行取消旧运行；手动发布验证不被 PR 运行取消。
- 不再监听 main 或 docs/v* 的 push，也不设置周期触发。CI 提供 workflow_dispatch；发布负责人在最终 main 提交上手动执行完整矩阵，核对运行 SHA 与拟发布 SHA 相同。若 main 在验证后移动，重新验证新的发布提交。文档版本分支只能从这样验证过的 main 提交创建。
- CI job 继续执行 Node 22、24 质量矩阵与 Chrome 浏览器任务。不得用路径过滤、提交信息跳过或只跑文档构建来让需要的 PR 检查缺失；不能把被跳过的 job 当成完成了质量验证。
- main 的 GitHub 分支规则要求 PR、三个 CI job 均通过，并要求 PR 分支与 main 保持最新；不需要付费功能。规则在 PR 实跑通过后设置，再合入本修订。紧急变更也走 PR 与同样的门禁。
- workflow 继续只有 contents: read，不读取 secret、不使用 pull_request_target、不执行部署。Cloudflare Pages 的文档版本分支手动发布流程独立于本 CI。

验收：工作分支 push 无运行；Draft PR 不占用 runner 执行完整门禁；Ready PR 的三个 job 通过且后续代码更新重新运行；合并后 main push 不产生 CI；手动运行在选定 main SHA 上完整通过；分支规则阻止未通过 CI 的合并。

### Documentation impact（本次修订）

| Concern | Decision | Rationale |
|---|---|---|
| ci-baseline | update | 工作流触发与 main 分支规则改变；更新文档基线和贡献指南。 |
| release-and-incident | update | 发布提交的 CI 改为手动验证最终 main SHA，原有发布门禁继续生效。 |
| documentation-site | update | 文档版本分支发布前手动验证来源 main SHA；Cloudflare 部署控制不变。 |
