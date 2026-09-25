# 验证记录：platform-governance

> 模块质量门禁（#38）的可复现结果。任务事实源仍是 GitHub Issues #15。

## 环境与对象

- 日期：2026-09-15
- 分支：`feat/platform-governance`，基线 `origin/main` = `315f148`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64
- 方式：从被验证的提交新建独立的 git worktree，`pnpm install --frozen-lockfile` 后依次执行下表命令；执行结束后 worktree 没有任何改动
- 被验证的提交：`b184cd1`（#33–#37 的全部改动）。#38 根据独立评审又在 `pnpm-workspace.yaml` 中增加了两项设置，在 #38 提交上重新执行的结果见"#38 提交上的重新执行"

## 仓库命令

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 退出 0；pnpm 报告 lockfile 通过供应链策略，无需解析 |
| `pnpm lint` | 退出 0，没有告警 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 8 个文件、138 条测试通过，类型测试 0 错误；core 7 个文件、94 条测试通过 |
| `pnpm typecheck` | 退出 0 |
| `pnpm typecheck --filter @pwa-platform/core`（删除全部 `dist` 之后） | 退出 0；根脚本先构建依赖的 contracts，再只对 core 执行 typecheck |
| `pnpm typecheck --filter @pwa-platform/coer`（包名拼错） | 退出 1，No projects matched |
| `git diff --check` | 没有空白错误 |

## #38 提交上的重新执行

从 `b59996c`（#38，包含评审后新增的两项供应链设置）新建独立 worktree，执行结果：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略，无需解析 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 8 个文件、138 条测试通过，类型测试 0 错误；core 7 个文件、94 条测试通过 |
| `pnpm typecheck` | 退出 0 |

执行结束后 worktree 没有任何改动。此后的提交只包含验证记录。

## 供应链配置

`pnpm config get` 读出的值与 `pnpm-workspace.yaml` 一致（#38 修改后在主检出中读取，冻结安装退出 0）：

| 设置 | 值 |
|---|---|
| `minimumReleaseAge` | `1440` |
| `minimumReleaseAgeStrict` | `true` |
| `minimumReleaseAgeIgnoreMissingTime` | `false` |
| `blockExoticSubdeps` | `true` |
| `trustPolicy` | `no-downgrade` |
| `trustLockfile` | `false` |
| `strictDepBuilds` | `true` |

**负向检查（#34）**：在临时副本中把 `minimumReleaseAge` 调大到约 10 年，无论使用现有 store 还是全新 store，安装都以 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 失败，证明设置确实由 pnpm 执行，而不是被忽略。独立评审在另一个临时 worktree 中独立复现了这一结果。

**pnpm 11.18.0 行为核实**（本地安装包的 `dist/pnpm.mjs` 与 `CHANGELOG.md`）：

- 显式设置 `minimumReleaseAge` 时，若没有设置 `minimumReleaseAgeStrict`，pnpm 会把它设为 `true`（源码中的 `explicitlySetKeys.has("minimumReleaseAge")` 分支；CHANGELOG 同样说明）。严格模式下，非交互环境遇到未满期版本直接失败（`NO_MATURE_MATCHING_VERSION`），交互终端询问后把版本写入 `minimumReleaseAgeExclude`。
- `minimumReleaseAgeIgnoreMissingTime` 的默认值为 `true`（源码默认值表中 `"minimum-release-age-ignore-missing-time": true`），本仓库设为 `false` 属于收紧。
- `blockExoticSubdeps` 的检查带有注释 "This is already coming from the lockfile, we skip the check in this case for now"：从已有 lockfile 安装时不重新检查。
- `trustLockfile` 默认 `false`；为 `true` 时跳过对 lockfile 条目的 `minimumReleaseAge` / `trustPolicy` 校验。
- 豁免条目的规范格式是 `pkg@1.2.3 || 1.2.4`，`pnpm audit --fix` 和确认安装都会合并成这种形式。

**`allowBuilds` 批准键复现**：在临时目录中建一个 `file:./dep` 依赖，其 `postinstall` 写入一个文件，用 `CI=true pnpm install` 安装：

| `allowBuilds` | 结果 |
|---|---|
| 不设置 | 退出 1，`ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: dep@file:dep`；pnpm 写入占位值 `dep@file:dep: set this to true or false` |
| `"dep": true`（只写包名） | 退出 1，同样报 `dep@file:dep` 被忽略，脚本没有执行 |
| `"dep@file:dep": true`（报告中的写法） | 退出 0，脚本执行 |

## CI 定义

| 检查 | 结果 |
|---|---|
| 触发 | 只有 `pull_request` 与 `push`，均限定 `main`；没有 `pull_request_target` |
| 权限 | 顶层 `permissions: contents: read`，job 级别没有提升 |
| secret | 工作流中没有任何 `${{ secrets.* }}` 引用 |
| 检出 | `persist-credentials: false` |
| action 固定 | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`（v7.0.1，轻量 tag）；`pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b`（v2.1.0，注释型 tag 已解引用到 commit）。实现时和独立评审时各用 `gh api` 核对一次 |
| 输入 | `pnpm/setup` 该 commit 的 `action.yml` 中存在 `runtime`、`cache`、`require-lockfile`；不传 `version` 时读取 `packageManager` |
| 矩阵 | Node 22 与 24，`fail-fast: false` |
| 并发 | 同一 ref 上新运行开始时取消旧运行（规格要求）。因此发布门禁要求发布提交的 CI 运行已完成并通过，被取消时先重新运行 |
| 步骤 | 冻结 lockfile 安装 → lint → build → test → typecheck → `pnpm audit --ignore-registry-errors`（`continue-on-error`，只报告） |

## 独立评审

由一个全新上下文的只读评审代理审阅了 `origin/main...HEAD`（#33–#37）。结论：没有阻断项，6 条应修，8 条小问题。评审确认 CI 没有写权限、不读取 secret、不使用 `pull_request_target`，action SHA 与 tag 一致。

**应修（全部已处理）：**

| # | 问题 | 处理 |
|---|---|---|
| 1 | 身份基线没有定义查找键，修改 `appId` 或 `environment` 会被当成首次发布，从而绕过迁移 | 项目所有者决定按部署槽位保存基线；同一槽位内任何身份字段（包括 `environment`）的变化都是迁移；首次发布评审增加 `origin` + `scope` 与 `serviceWorkerUrl` 占用检查 |
| 2 | 显式设置 `minimumReleaseAge` 会启用严格模式，文档却写成"只是默认值"；交互确认会自动写入豁免 | 核实属实。显式加入 `minimumReleaseAgeStrict: true`；文档写明确认后写入的条目同样是豁免 |
| 3 | `blockExoticSubdeps` 在从 lockfile 安装时不检查 | 核实属实。文档写明这一例外，并把 lockfile 审阅项具体化；显式加入 `trustLockfile: false` |
| 4 | "安装"没有通过标准 | V1 验收矩阵增加安装判定（`beforeinstallprompt`、`startUrl` 与 `display-mode`、`install-eligible` / `installed` 事件），runbook 引用它 |
| 5 | 生产回滚无法使用演练中的对照缓存与前后快照 | 回滚第 2、3 步改为：发布前用受控浏览器配置记录故障状态，发布后比对；恢复 worker 的同一构建必须先通过恢复演练 |
| 6 | 恢复 worker 是否立即激活、需要谁批准没有写清 | 项目所有者决定：总是立即激活并接管客户端，安全事故与 worker 故障都适用；每次在生产发布都需要平台负责人批准并记入时间线。ADR-0005 的结论不变 |

**小问题：**

| 问题 | 处理 |
|---|---|
| "不得返回其他路由的缓存内容"与离线降级页冲突 | 改为"除 `offlineFallback.path` 指向的降级页外" |
| 响应头判定不精确，私有 HTML 同时命中两行 | 改为"必须包含 / 不得包含"的逐指令判定；私有内容要求 `private` 与 `no-store`，并优先于公开 HTML 一行 |
| 断网检查无法区分"没有拦截"和"拦截了但缓存已删" | 恢复演练增加一项：sw-runtime 单元测试证明恢复 worker 产物不注册 `fetch` 监听 |
| Chrome Android 的 N-1 无法从应用商店获得 | 项目所有者决定：两台关闭自动更新的设备轮换，只通过 Google Play 更新；拿不到 N-1 按未通过处理 |
| main 推送也会取消进行中的 CI，与"发布提交的 CI 通过"冲突 | 规格要求同一 ref 取消旧运行，CI 不改；runbook 的 CI 门禁要求发布提交的运行已完成并通过，被取消时先重跑 |
| "`file:` 依赖只写包名不会生效"的实测没有记录 | 重新复现并记入本文件（见上文 `allowBuilds` 批准键复现） |
| 豁免示例不是 pnpm 的规范格式 | 示例改为 `some-package@1.2.3 || 1.2.4`，并写明多个版本合并为一个条目 |
| 不带 filter 的 test 与 typecheck 会重复构建 | 只影响耗时，行为正确，本模块不改 |

## 文档核验

| 核验项 | 结果 |
|---|---|
| 相对链接与标题锚点 | 本模块新增或修改的全部文档，以及 README、CONTRIBUTING、文档基线中的链接都能解析 |
| 模块名 | V1 验收矩阵、runbook、恢复演练中的模块名都来自能力图 |
| 不可变字段 | 身份发布基线规则列出的 8 个字段与 ADR-0008 一致；再加 `environment` 正好是 `PwaIdentity` 的全部字段 |
| ADR-0009 | 与 contracts spec 一致：`cacheNamespaceSeed` 是 identity-revision 段，`schemaVersion` 版本化序列化形状；ADR-0008 只改动状态行与被取代的一句 |
| RACI | 事故职责表引用的三行在 `ownership-and-raci.md` 中存在，负责方一致；没有 RACI 依据的一行已注明 |
| 生命周期与安全模型 | 响应头基线、更新等待、离线降级、恢复 worker 行为与 `lifecycle.md`、`security-model.md` 一致 |
| 恢复验证项 | 与 ADR-0005、ADR-0008、ADR-0009 及 contracts 的 `appCachePrefix` 一致：删除集合正好是名称以 `appCachePrefix` 开头的缓存 |
| 供应链设置 | `pnpm-workspace.yaml` 中的 7 项设置在依赖变更流程与模块规格中都有说明 |
| 文档基线 | 新文档全部登记并标明状态 |
| spec-guard 产物校验 | 15 通过 / 0 警告 / 0 失败 |

## 项目所有者确认

- **检查点"治理文档"**：确认发布门禁、回滚、事故处置与恢复演练文档，包括补充的事故分级、对外沟通职责、`max-age` 由基础设施团队确定、演练在必测范围内执行，以及"不拦截 fetch"的判定方式。
- **独立评审后的三项决定**：身份基线按部署槽位保存；恢复 worker 总是立即激活、每次生产发布需平台负责人批准；Chrome Android 的 N-1 通过两台设备轮换获得。三项已写入模块规格的"已决定事项"。

## CI 实跑证据

项目所有者授权推送后，在模块 PR [#39](https://github.com/haigeer-labs/pwa-platform/pull/39) 上取得（均为 `pull_request` 事件）：

| 提交 | 目的 | 运行 | 结论 |
|---|---|---|---|
| `b59996c` | 模块全部改动 | [34963905189](https://github.com/haigeer-labs/pwa-platform/actions/runs/34963905189) | 成功：Node 22 与 24 两个 job 的全部步骤通过 |
| `321801c` | 临时加入一个未使用变量，制造 lint 失败 | [34964127363](https://github.com/haigeer-labs/pwa-platform/actions/runs/34964127363) | 失败：两个 job 都在 Lint 步骤报 `'ciLintProbe' is assigned a value but never used`（`@typescript-eslint/no-unused-vars`） |
| `66d0e81` | 撤销 `321801c`；撤销后 `scripts/run-workspace.mjs` 与 `b59996c` 逐字节一致 | [34964252769](https://github.com/haigeer-labs/pwa-platform/actions/runs/34964252769) | 成功：两个 job 恢复为绿 |

两次成功运行的日志中：

- **Node 版本**：`runtime: node@22` 安装 Node 22.23.2，`runtime: node@24` 安装 Node 24.21.0；pnpm 为 11.18.0，由 `packageManager` 决定。
- **冻结安装**：两个 job 都执行 `pnpm install --frozen-lockfile`，并输出"Lockfile passes supply-chain policies (155 entries …)"，即对 lockfile 的 155 个条目做了供应链校验并通过。
- **测试**：contracts 8 个、core 7 个测试文件全部通过。
- **依赖审计**：`pnpm audit --ignore-registry-errors` 报告 "No known vulnerabilities found"。

## 与 spec 和能力图的边界核对

- 没有实现运行时、恢复 worker 或身份比较工具；恢复 worker 归 sw-runtime，比较工具归 build-verifier。
- 没有修改 GitHub 仓库设置；把 CI 设为必需检查只写成了 CONTRIBUTING 中的建议。
- 没有引入新工具（actionlint、Dependabot、Renovate 等）。

## 待项目所有者确认

- 依赖变更流程中"发布前 high 及以上漏洞必须已有处理结论"一条，文中已标注为新增约束。

## 修订演练 D4：第一份本地门禁记录（ADR-0031）

本节是按[本地门禁记录模板](../../docs/operations/local-ci-record-template.md)执行的第一次演练。候选是 `feat/desktop-release-channel` 分支上的提交，不是一次真实的生产发布，因此不对应任何发布证据。

| 字段 | 值 |
| --- | --- |
| 记录 ID | `local-ci-2026-09-22-d2a15a9` |
| 候选提交 | `d2a15a91b75c1684bad1a1f88d48246985b40f62` |
| 替代原因 | GitHub 账号自 2026-09-18 起不可用（`gh` 返回 `HTTP 403: account suspended`） |
| 操作系统 | macOS 15.7.3 |
| Chrome 桌面端（N） | 153.0.8010.53 |
| pnpm | 11.18.0 |
| 执行者 | Claude（主会话），项目所有者授权 |
| 开始 / 结束（UTC） | 2026-09-22T03:52:16Z / 2026-09-22T03:59:09Z |
| 日志位置 | 仓库外 `~/Documents/haigeer-labs/pwa-release-records/local-ci-2026-09-22-d2a15a9/`，未提交；每行对应的文件名为 `node<主版本>-<命令，空格换成下划线、冒号换成连字符>.log`，例如 `node24-pnpm_test-browser.log` |
| 签署人 | 无：本记录是演练，由 Claude 执行，没有人类发布负责人签署。按 2026-09-22 收紧后的 ADR-0031，这样的记录不能用于真实发布 |

### 执行结果

| Node | 命令 | 退出码 | 日志 SHA-256 |
| --- | --- | --- | --- |
| v22.22.0 | `pnpm install --frozen-lockfile` | 0 | `e5c4f25e69291a37ce7f4336af04e0c55e1e75e2760cea26042153300f721b48` |
| v22.22.0 | `pnpm lint` | 0 | `050c69da23536758722729aeda55a8d0fb9d557495ef6d33d70873a3b64a71c1` |
| v22.22.0 | `pnpm build` | 0 | `e64adc6a473a26104b085239832b513656c888e5356ad31ebd4e10d4a81a3a76` |
| v22.22.0 | `pnpm test` | 0 | `0fc0f0bca75d7f55e88f71ce32fa72da39a087278feb74d918f10da99af9b620` |
| v22.22.0 | `pnpm typecheck` | 0 | `8d3733e8ed263af02704e1a36d4e1d0f3561b61172d7a7a73ab20f08532812f5` |
| v22.22.0 | `pnpm test:browser` | 0 | `6811dc0f11148600c737a3b4af95413cc6369d2a0af2f0ecc6acab8dcb80f688` |
| v22.22.0 | `pnpm audit` | 0 | `15950a68a7ed99c59779717acefdceb3f69cfd31bde67d2c954f2a3cea4d7955` |
| v24.18.0 | `pnpm install --frozen-lockfile` | 0 | `fbd92fe0e7dcb4e6de1836e4f125d08acbf824716f3b86c09dac53e16b0dc3ec` |
| v24.18.0 | `pnpm lint` | 0 | `050c69da23536758722729aeda55a8d0fb9d557495ef6d33d70873a3b64a71c1` |
| v24.18.0 | `pnpm build` | 0 | `d6b77c26fdbb280a7e24d6cb098964df4c55a70cd2dc3407c2281870f980d1f0` |
| v24.18.0 | `pnpm test` | 0 | `7e056cd03df3f81d1a04380237f50a9dd7021fa3da5e95625c089524d0fcb018` |
| v24.18.0 | `pnpm typecheck` | 0 | `cda6073c5fc07d74db1e6cace650fc7164d35339845fc251b321df82223c2b14` |
| v24.18.0 | `pnpm test:browser` | 0 | `f6bbd3fd3f0241414dbc401fc37f7fafbb076e44cd58b6a76e5bf486dc5b3d6e` |
| v24.18.0 | `pnpm audit` | 0 | `15950a68a7ed99c59779717acefdceb3f69cfd31bde67d2c954f2a3cea4d7955` |

- 单元测试：两个 Node 版本各 15 个包、1602 条，全部通过。
- 真实浏览器测试：两个 Node 版本各 9 个包、172 条，全部通过，没有跳过。examples-browser-e2e 从 45 条通过加 2 条跳过变为 47 条通过，多出的 2 条是 D3 取得的真实 `beforeinstallprompt`。
- 依赖审计：没有已知漏洞。

### 结论

| 检查 | 结论 |
| --- | --- |
| 除审计外全部退出码为 0 | 通过（14 项中非审计的 12 项全部为 0，审计 2 项也为 0） |
| 证据形式 | 本地替代（ADR-0031），不是 CI 运行 |
| GitHub 恢复后的补跑 | 未到期 |

### 演练中的发现

- **Node 24 那一轮不是干净环境（独立评审发现）。** 脚本在两轮之间用 `rm -rf "$WT"/packages/*/node_modules ...` 清理，但 zsh 在通配符没有匹配时会报错并跳过整条命令（运行日志第一行是 `no matches found`）；而且两轮共用同一个 worktree，从不清理 `browser-build/` 等被 git 忽略的构建产物。Node 22 那一轮是空树，不受影响；Node 24 那一轮复用了 Node 22 的产物，与 ADR-0031"不复用任何已有目录"不符。ADR-0031 已改为"每个 Node 版本各新建一个 worktree"。本记录的 Node 24 结果因此只能作为参考；D6 在 Node 24 下另用一个新 worktree 重跑了全部命令（见"修订门禁"）。
- **日志哈希没有绑定运行环境（独立评审发现）。** 两个 Node 版本的 lint 日志哈希相同（`050c69da…`），审计日志也相同，因为日志内容里没有 Node 版本。ADR-0031 与记录模板已改为每份日志开头先打印提交、Node、pnpm、时间与 Chrome 版本。
- **执行脚本自己算出的结论是错的。** 脚本用 zsh 的 `print -r` 写结果表，制表符被写成了字面的 `\t`，末尾按制表符分列统计时，把全部 14 行都算成了失败（"non-audit failures: 14"）。上表的结论是按原始记录人工核算的，退出码与日志哈希本身不受影响。脚本目前只在执行者本机，不在仓库里；下一次执行前需要修正，并建议把脚本纳入仓库，由单元测试守护结论的计算方式。

## 修订演练 D5：桌面端通道首次演练（本地预览）

演练环境是本地预览（项目所有者 2026-09-22 决定），不是类生产环境，因此本节不能作为正式的生产发布浏览器证据。

### 自动化部分

| 层级 | 浏览器（harness 在每个包打印的实际版本） | 候选提交 | Node | 结果 | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- |
| N | Chrome 153.0.8010.53（9 个包均为该版本） | `d2a15a9` | 22.22.0 与 24.18.0 | 两轮各 172 条通过，0 失败，0 跳过（D4） | 见 D4 记录的 `test:browser` 两行 |
| N-1 | Chrome for Testing 152.0.7977.82（9 个包均为该版本，经 `PWA_HARNESS_CHROME_PATH`） | `b5297e0` | 24.18.0 | 172 条通过，0 失败，0 跳过 | `5364dd0bda312540e2e95c0902ea19b38e4ce3b45a248bdba1d6cd68ba3b3886` |

- `b5297e0` 与 `d2a15a9` 之间只有文档改动，代码相同。N-1 这一轮在干净 worktree 中执行：`pnpm install --frozen-lockfile`、`pnpm build` 与 `test:browser` 的退出码均为 0，UTC 2026-09-22T04:02:31Z 至 04:05:13Z。日志保存在仓库外的 `~/Documents/haigeer-labs/pwa-release-records/desktop-n1-2026-09-22-b5297e0/`。
- 为了确认 N-1 这一轮没有在某个包里悄悄使用已安装的 Chrome 153，逐包检查了 harness 打印的浏览器版本：9 个包全部是 152.0.7977.82。

### V1 场景（自动化覆盖）

| 场景 | N | N-1 | 覆盖用例 |
| --- | --- | --- | --- |
| 首次在线访问 | 通过 | 通过 | sw-runtime、client-runtime、vite、examples 的注册与预缓存用例 |
| 后续离线访问 | 通过 | 通过 | sw-runtime、examples 的 offline 用例 |
| 未缓存 / 隐私 / 流式响应 | 通过 | 通过 | sw-runtime 的拒绝请求用例与 `range-request.spec.ts` |
| 更新检测 | 通过 | 通过 | client-runtime、examples 的 `update.spec.ts` |
| 异常恢复 worker | 通过 | 通过 | sw-runtime `lifecycle.spec.ts` 的 recovery drill（演练步骤 1 至 4）、nuxt 与 examples 的 `recovery.spec.ts` |
| 安装资格事件（自动化） | 通过 | 通过 | examples `install.spec.ts` 的真实 `beforeinstallprompt`（D3） |
| Vue 示例原生安装 | 通过 | 通过 | 见下文"原生安装" |
| React 示例原生安装 | 通过 | 通过 | 见下文"原生安装" |

### 原生安装

2026-09-22，本地预览，候选代码同 `b5297e0`。示例站点由 browser-test-harness 的 fixture 服务器提供，响应头按运行手册的基线设置：Vue 在 `http://localhost:60432/app/`，React 在 `http://localhost:60433/app/`。每次安装都使用一个全新的临时浏览器配置。安装确认框由项目所有者点击；观察脚本经 DevTools 协议记录页面状态与窗口的 `display-mode`。

| 平台 | 层级 | 应用 | 安装资格事件 | 安装完成 | 独立窗口启动 | 起始 URL | 期望 / 观察到的 display-mode | 事件顺序 | 状态 | 证据引用（SHA-256 前 12 位） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop 153.0.8010.53 | N | Vue 示例 | 观察到（页面出现 Install） | 观察到（页面显示 installed；生成应用快捷方式） | 是：安装后点击"打开" | `/app/` | standalone / standalone | eligible → installed | 通过 | `install-vue-N.json`（`2f463671c79e`） |
| Chrome Desktop 153.0.8010.53 | N | React 示例 | 观察到 | 观察到 | 是：安装后点击"打开" | `/app/` | standalone / standalone | eligible → installed | 通过 | `install-react-N.json`（`2a37e6da84ca`） |
| Chrome for Testing 152.0.7977.82 | N-1 | Vue 示例 | 观察到 | 观察到 | 是：安装后点击"打开" | `/app/` | standalone / standalone | eligible → installed | 通过 | `install-vue-N-1.json`（`d6cc0a6caa34`） |
| Chrome for Testing 152.0.7977.82 | N-1 | React 示例 | 观察到 | 观察到 | 是：安装后未点击"打开"，改从生成的应用快捷方式启动 | `/app/` | standalone / standalone | eligible → installed | 通过 | `install-react-N-1.json`（`c57cd520819b`） |

- Chrome 在安装完成后会询问是否打开应用。前三次项目所有者点击了"打开"，原标签页随即转为独立窗口；第四次没有点击，所以没有打开窗口，之后从应用快捷方式启动，得到独立窗口。两种启动方式都满足"独立窗口启动"。
- React × N 从出现安装按钮到安装完成只用了约 3 秒，观察脚本无法区分人为操作与其他原因，因此向项目所有者确认过：安装由其本人点击。
- 快捷方式的名称是 "PWA Platform Example" 加序号，Vue 与 React 两个示例同名。这是示例 manifest 的名称，不影响判定。
- 演练结束后，关闭了四个测试浏览器实例，停止了本地预览，并把这次生成的四个应用快捷方式移到废纸篓。
- 证据文件保存在仓库外的 `~/Documents/haigeer-labs/pwa-release-records/desktop-install-2026-09-22/`（四份观察结果 JSON、四份观察日志与站点地址记录）。演练用的脚本保存在同目录下的 `tools/`：`watch-install.mjs`（`d88072fe32ad`）、`serve-examples.mjs`（`4a52c5d9de06`）、`local-gate.sh`（`06a4045fd713`）。本地门禁脚本纳入仓库另立任务。
- D3 在 N 与 N-1 下"各连续运行两次结果一致"的证据，最初只写在提交 `d2a15a9` 的提交信息里；主会话随后在两个版本下各复测了一次 `install.spec.ts`，均为 8 条通过。

### 恢复演练

本次引用自动化恢复演练：sw-runtime 的 recovery drill 在 N 与 N-1 下都通过了演练步骤 1 至 4，包括"只删除当前应用前缀下的缓存"的精确集合比对（同应用旧 revision 删除；其他环境、前缀重叠的其他应用、非平台缓存保留）。按[恢复演练](../../docs/operations/recovery-drill.md)的规定，生产发布前必须在类生产环境中再做一次，并按子记录模板逐项记录缓存清单。

### 当前结论

`desktop` 通道演练：**自动化场景与原生安装在本地预览下通过；类生产环境恢复演练未执行。** 恢复演练只引用了自动化测试，没有按[恢复演练](../../docs/operations/recovery-drill.md)的子记录模板在类生产环境中执行（2026-09-22 独立评审更正了本节原先"全部通过"的结论）。因此本演练不构成正式的 V1 发布证据；正式发布时，需要在类生产环境中按同样的步骤重新取得，并完整填写子记录。

### 按证据模板填写的演练记录

以下按[生产发布浏览器证据](../../docs/operations/browser-release-evidence.md)的模板填写，用来演练 `desktop` 通道和"不在本通道"状态。它不对应任何真实的生产发布。

| 字段 | 值 |
| --- | --- |
| 发布尝试 ID | `rehearsal-desktop-2026-09-22`（演练） |
| 发布通道 | `desktop`（创建时确定，未更改） |
| 已知 Android 问题 | React 示例在 Chrome Android 152 上未取得安装事件（`tasks/examples-browser-e2e/verification.md` 的 T14）；Chrome Android N 从未取得 |
| CI 证据形式 | 本地替代（ADR-0031）：`local-ci-2026-09-22-d2a15a9`（演练，未签署） |
| 候选构建 | `d2a15a9` / `b5297e0`（代码相同） |
| 受保护环境 | 本地预览（非类生产环境） |
| 执行者 | Claude（自动化与记录）、项目所有者（原生安装点击） |

| 平台 | 层级 | 首次在线访问 | 后续离线访问 | 未缓存/隐私/流式响应 | 更新检测 | 异常恢复 worker | Vue 示例安装 | React 示例安装 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop | N（153.0.8010.53） | 通过 | 通过 | 通过 | 通过 | 通过（自动化） | 通过 | 通过 |
| Chrome Desktop | N-1（152.0.7977.82） | 通过 | 通过 | 通过 | 通过 | 通过（自动化） | 通过 | 通过 |
| Chrome Android | N | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 |
| Chrome Android | N-1 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 | 不在本通道 |
| Edge 桌面端（参考档，不阻塞） | N | 未执行：本机未安装 Edge | 未执行 | 未执行 | 未执行 | 未执行 | 未执行 | 未执行 |

| 检查 | 结论 | 说明 |
| --- | --- | --- |
| 发布通道 | `desktop` | 必测平台为 Chrome 桌面端 N 与 N-1 |
| 必测平台与 N/N-1 完整记录 | 通过 | 版本、系统（macOS 15.7.3）、日期、执行者与证据引用齐全 |
| 全部 V1 场景 | 通过 | 本地预览 |
| 原生安装 | 通过 | 四项，见上文 |
| 类生产环境恢复演练 | 未执行 | 只有自动化演练 |
| 最终结论 | **V1 发布证据（desktop 通道）：未通过** | 类生产环境恢复演练未执行；CI 证据是未签署的演练记录；环境不是类生产环境 |

## 修订门禁：桌面端发布通道（D6，2026-09-22）

### 门禁

候选为 `2e368aeebb87308b50d5c060897144a953f6c583`（本分支上包含全部代码改动的最后一个提交；其后只有本节的文档提交）。按 2026-09-22 收紧后的 ADR-0031 执行：每个 Node 版本各新建一个 worktree，每份日志开头先打印提交、Node、pnpm、UTC 时间与 Chrome 版本，依赖审计使用与 CI 相同的参数。UTC 2026-09-22T05:14:33Z 至 05:21:35Z。日志在仓库外 `~/Documents/haigeer-labs/pwa-release-records/d6-final-2026-09-22-2e368ae/`；执行脚本是同目录上一级 `tools/local-gate-v2.sh`。

| Node | 命令 | 退出码 | 日志 SHA-256 |
| --- | --- | --- | --- |
| v22.22.0 | `pnpm install --frozen-lockfile` | 0 | `d664ada309c3ebf84c2bf087bdad3c1a2acb5d9ae66f92839963f92305b6d6eb` |
| v22.22.0 | `pnpm lint` | 0 | `d91d5259c9ada591cad371aed4c24dbf118a0f0409761d30173c5c3dae77d99c` |
| v22.22.0 | `pnpm build` | 0 | `14e1ec86e04760fdbf77aa91d8b12f0bec1bf68b0ae766d2d180979d43741117` |
| v22.22.0 | `pnpm test` | 0 | `14d67f52299be4d4c5ead2ab54e2fe0584195ecc0019623800ffb410b5e8031b` |
| v22.22.0 | `pnpm typecheck` | 0 | `75d66b64ebf0c3209db9bed421d25c49328c2421127a434c3abefa16295cfc8a` |
| v22.22.0 | `pnpm test:browser` | 0 | `356e5de3dbb7e280b6673eb56dbb54a2bc12537ecdd8f573c7cf9943703a68b8` |
| v22.22.0 | `pnpm audit --ignore-registry-errors` | 0 | `4f1398290ebec85062d3c880ca37bcc9122f4f823a66feba582db67a2bc690fc` |
| v24.18.0 | `pnpm install --frozen-lockfile` | 0 | `8d4f8b6ee65a20293610b826afdb6fb94623d38fcba3800603bf1351992e89d4` |
| v24.18.0 | `pnpm lint` | 0 | `34691113d11885db318ec442781b10ca56783a34c7d7b9892bfce84a07d46428` |
| v24.18.0 | `pnpm build` | 0 | `9995e4681d3b9d0eb1fcbd24cac1f82ccb6819b5fc2644034e6141cc6faf79c4` |
| v24.18.0 | `pnpm test` | 0 | `2010ab29ce673e4f60dcd7338c411ec80b0f7d68cf7aac25206ce14823ade033` |
| v24.18.0 | `pnpm typecheck` | 0 | `097e693032f547d25fc05cff9f9e62421ca4fe4ca8c2ae5ca13161f4de83d79c` |
| v24.18.0 | `pnpm test:browser` | 0 | `da2b7f6c9b6d5124aeb1251a6ec2aa1429aec106148ccda820cee4cf0285361b` |
| v24.18.0 | `pnpm audit --ignore-registry-errors` | 0 | `0d506b3caf1b1d158f3736fcfae30a78190bc35e35cf8899a81882b338dc71c1` |

- 两个 Node 版本各 15 个包、1602 条单元测试，全部通过；Chrome 153.0.8010.53 下 9 个包、172 条真实浏览器测试，全部通过，没有跳过。
- **桌面 N-1**：另用一个新 worktree（Node 24），在 Chrome for Testing 152.0.7977.82 下跑全仓库 `test:browser`，退出码 0，172 条全部通过，没有跳过。harness 共打印 11 次浏览器版本（9 个包，加上安装用例持久上下文的 2 次），全部是 152.0.7977.82。日志 SHA-256 `e2eebe8cd0dfaa1841e326f579963840952eed8a65919a8a997523ef6d9f5c76`。
- 两份浏览器日志中各有一行含 "failed"，是一条通过的用例，标题里本身带有 `push.subscribe-failed`。
- 文档一致性：本分支改动的 19 份 Markdown 中的相对链接全部有效；仓库中不再有"只保证基础网页体验""Android 通道的发布证据取得之前"等旧措辞。

### 独立评审

评审者：`critic` 子代理（opus），只读，不带本会话上下文，评审范围 `092e803..60c18e5`。结论："修复后可合入"。评审独立重算了 D4 的 14 份日志与 D5 N-1 日志的 SHA-256、单元测试与浏览器测试条数、N-1 的浏览器版本，均与记录一致；四处通道规则彼此一致。

| 编号 | 发现 | 处置 |
| --- | --- | --- |
| B1 | 发布编排协议禁止任何本地结果，与 ADR-0031 冲突 | 已改：本地门禁记录是唯一例外，必须标注"本地替代"；浏览器证据按通道判定（`ecbb2f3`） |
| B2 | 发布记录模板要求填"CI 通过"，也没有通道字段 | 已改：新增"发布通道"一行；CI 一项区分"CI 运行"与"本地替代"（`ecbb2f3`） |
| B3 | 浏览器发布证据规格仍无条件要求 Android | 已追加"修订：发布通道"一节（`ecbb2f3`） |
| B4 | ADR-0025 没有注明已被修订 | 已在状态行注明由 ADR-0030、ADR-0031 修订或补充（`ecbb2f3`） |
| B5 | 修订门禁一节缺失 | 即本节 |
| S1 | 可以中途改通道来回避 Android 失败 | 项目所有者确认收紧：通道在发布尝试创建时确定、不可更改；退回 `desktop` 需新 ADR；`desktop` 证据必须附已知 Android 问题清单（`ecbb2f3`） |
| S2 | "不在本通道"缺少禁止性规则 | 项目所有者确认：只允许用于 `desktop` 通道的 Chrome Android 行，其他位置一律判未通过（`ecbb2f3`） |
| S3 | Android"基础网页体验必须可用"没有验证来源 | 项目所有者选择改措辞：ADR-0030、浏览器矩阵、README 改为"未验证、不做任何保证"（`ecbb2f3`） |
| S4 | 本地替代 CI 的条件太松 | 项目所有者确认收紧：已有任何 CI 结果即不得替代；记录可用性检查原文；签署人须是人类发布负责人；日志缺失或哈希不符即作废（`ecbb2f3`） |
| S5 | 日志哈希没有绑定运行环境 | ADR-0031 与模板要求日志开头打印提交与环境；本节门禁已照此执行（`ecbb2f3`） |
| S6 | D4 的 Node 24 那一轮复用了 Node 22 的工作树 | 已在 D4 记录中披露；ADR-0031 改为每个 Node 版本一个新 worktree；本节门禁照此重跑（`6bc83c3`） |
| S7 | 过程证据放在会被清理的临时目录 | 已移到 `pwa-release-records/` 并记录哈希；原生安装表补上证据引用列（`6bc83c3`）；门禁脚本入仓另立任务 |
| S8 | D5 没有按证据模板填写 | 已补一份按模板填写的 `desktop` 通道演练记录，包括"不在本通道"的 Android 行、已知 Android 问题与 Edge 未执行（`6bc83c3`） |
| S9 | D5 结论写得过头 | 已改为"自动化与原生安装通过；类生产环境恢复演练未执行"，模板记录的最终结论为未通过（`6bc83c3`） |
| S10 | harness 新增的导出是多余的，规格却写"不改包代码" | 已删除多余覆盖，`index.ts` 与 main 完全一致；规格改为"只改 examples-browser-e2e 的测试代码"（`2e368ae`、`ecbb2f3`） |
| S11 | 安装事件缺失时仍然只是跳过 | Chromium 上改为判失败，并附 CDP 错误；反向验证时故意改用无痕上下文，得到 `in-incognito` 失败（`2e368ae`） |
| S12 | 版本注解不来自实际运行的浏览器 | 改为经 CDP 从持久上下文读取，N 为 153、N-1 为 152（`2e368ae`） |
| S13 | 另有四处文档仍写着旧规则 | 浏览器矩阵、证据模板、npm 发布说明、包分发规格已按通道修正（`ecbb2f3`） |
| Nit | 基线措辞、README 两处、首次演练候选措辞、Chrome for Testing 来源、审计参数、ubuntu 与 macOS 的差异、临时目录清理、按行记录日志位置、D3 两次运行的证据、Vben 文档中的旧原因 | 均已处理（`ecbb2f3`、`6bc83c3`、`2e368ae`） |

### 结论

修订门禁通过。已知的剩余事项：

- 本地门禁脚本纳入仓库并用单元测试守护，另立任务。
- 正式的 `desktop` 通道发布，还需要类生产环境、按子记录模板执行的恢复演练，以及人类发布负责人签署的本地门禁记录。
- Edge 参考档未执行（本机未安装）。

## 修订 G4：本地门禁工具与旧脚本的对照（2026-09-22）

同一个提交 `0e7484de5ebe573adfbe9a51efd6b6bedf56f2c6` 上，先用本工具（`packages/release-tools/dist/bin.js`，由该提交构建），再用 `pwa-release-records/tools/local-gate-v2.sh` 各跑一遍 Node 22 与 24 的全部命令。证据在仓库外的 `pwa-release-records/gate-tool-0e7484d/`（`results.json` `e16906298375…`、`record.md` `c025053fcf1f…`）与 `gate-v2-0e7484d/`。

| 对照项 | 本工具 | 旧脚本 |
| --- | --- | --- |
| 14 条命令的退出码 | 全部 0 | 全部 0 |
| 单元测试（每轮） | 1693 条通过 | 1693 条通过 |
| 真实浏览器测试（每轮） | 172 条通过 | 172 条通过 |
| 结论 | PASS | non-audit-failures=0 |
| 提交 | 请求 `0e7484d`，解析为完整 SHA，两轮观测一致 | 日志头打印完整 SHA |
| 实际 Node | v22.22.0 / v24.18.0；`PATH` 首项、`pnpm` 与其运行时都在对应 nvm 版本目录 | v22.22.0 / v24.18.0 |
| worktree | 两轮都已删除，并经 `git worktree list` 精确核对 | 两轮都已删除 |

对照中的两处发现：

- **计数差异是统计方法造成的，不是少跑了测试。** 首次按"包名 + N passed"统计时，本工具每轮只数出 160 条浏览器测试。原因是本工具设置了 `CI=true`，Nuxt 的输出会在每行加上 `[log]` 前缀，统计用的正则没有匹配上；日志中 nuxt 的 12 条用例全部通过。核算后两边一致。
- **可用性检查的输出与"GitHub 不可用"矛盾。** `gh auth status` 显示已登录另一个账号 `yizhongkaimail-collab`（token 已由 gh 打码）。按 ADR-0031，这样的记录不能用于真实发布：只有 GitHub 仓库或 Actions 确实不可用时才能使用本地替代。本次是演练，记录中的签署人写的是"演练，无人签署"。这一情况已报告给项目所有者。
- 第二轮独立评审的 N1 在这次运行中得到印证：工具是从主目录调用的，记录里的"门禁工具提交"写成了主目录的 HEAD，而不是工具实际的版本。N1 的修复见后续提交；G5 的门禁用修复后的最终版工具重跑，以那次的记录为准。

## 修订门禁：本地门禁工具（G5，2026-09-22）

### 门禁（由本工具自身执行）

候选为 `9299eb0ab519ed40b1c4049eff9fdfb9e83941d9`，是本分支最后一个代码提交；其后只有本节的文档提交。工具在执行前按该提交重新构建，`dist/build-info.json` 记录的正是这个提交，状态为干净。工具从主目录调用，覆盖 Node 22 与 24。结果在仓库外的 `pwa-release-records/g5-gate-9299eb0/`：`results.json` `6ad3b7ebe5ad…`，`record.md` `3460cb67665b…`。

| 项目 | 结果 |
| --- | --- |
| 结论 | PASS，失败项为空；命令行退出码 0 |
| 提交 | 请求 `9299eb0`，解析为完整 SHA；两轮观测到的提交都与之相同 |
| Node | v22.22.0 与 v24.18.0；`PATH` 上的 node 与 pnpm 的运行时都位于对应版本的 nvm 目录 |
| 14 条命令 | 退出码全部为 0 |
| 单元测试 | 每轮 1718 条通过（比 G4 对照多出的是 release-tools 新增的测试） |
| 真实浏览器测试 | 每轮 172 条通过 |
| worktree | 两轮都已删除，并经 `git worktree list` 精确核对 |
| 门禁工具自身提交 | `9299eb0…`，与构建快照一致。第二轮评审的 N1 在此得到验证：工具从主目录调用，记录的不再是主目录的 HEAD |
| 可用性检查 | `gh auth status` 显示已登录另一个账号。演练记录，签署人写"演练，无人签署"；按 ADR-0031，这样的记录不能用于真实发布 |

### 独立评审

评审者：`critic` 子代理（opus），只读，共两轮。

**第一轮**（`024e6d4..2cfe5ca`），结论"不可合入"：

| 编号 | 发现 | 处置 |
| --- | --- | --- |
| B1 | `--commit` 不解析、不校验，也不和实际检出的提交比对；`-f` 会在 HEAD 上跑并判通过 | 解析为 40 位 SHA，失败即拒绝运行；每轮都检出该 SHA 并逐轮核对（`commit-mismatch`） |
| B2 | 只传一个 Node 版本也判通过 | 必须覆盖 CI 矩阵中的全部主版本，否则拒绝运行；结论另判 `missing-node` |
| S1 | 入口判断在路径含空格或经符号链接调用时静默失效，退出码 0 | 新增 `bin.ts`，无条件调用 `main` |
| S2 | 文档里的 `pnpm gate:local -- …` 跑不通 | 忽略开头的 `--`；文档改为不带 `--` 的写法 |
| S3 | 继承调用方环境，会回落到主仓库的 `node_modules` | 使用精简后的环境，并设置 `CI=true`；逐轮记录 `PATH` 首项与 pnpm 的位置 |
| S4 | 输出目录可以放在仓库内 | 拒绝仓库及其任何 worktree 内的输出目录 |
| S5 | 中途出错会残留 worktree，也没有记录 | 出错记为 `round-error`；worktree 照常删除，结果照常写出；版本探测输出异常时记为 `probe-failed` |
| S6 | 命令没有超时 | 默认 30 分钟，超时判 `command-timeout` |
| S7 | 删除核验不严谨（子串匹配、忽略退出码） | 按整行精确匹配，检查退出码；失败后运行 `prune` 再核验一次 |
| S8 | 记录可以被伪造，信息也不完整 | 代码块围栏与单元格按内容转义；新增失败项清单、逐轮观测值、可用性检查退出码与工具版本 |
| S9 | 可用性检查的 stderr 可能丢失 | 整条命令包在一个命令组里再重定向 |
| S10 | 部分测试在实现写错时仍会通过 | 按执行出的日志正文断言；CI 一致性改为双向比较 |

**第二轮**（`55d605c..0e7484d`），结论"可以合入"。第一轮的问题全部确认已修复，并提出四项新问题：

| 编号 | 发现 | 处置 |
| --- | --- | --- |
| N1 | 记录里的"工具提交"取自当前目录；`dist` 过期时发现不了 | 构建时写入 `build-info.json`；与工具仓库当前的 HEAD 或工作区状态不一致时判 `tool-stale`。本节门禁验证了效果 |
| N2 | "pnpm 使用的 Node"一栏名不副实 | 按 pnpm 入口脚本的 shebang 解析运行时，原生二进制则如实标明；另设"PATH 上的 node"一栏 |
| N3 | 超时只杀掉外层 shell | 每条命令在独立进程组中运行，超时后整组杀掉 |
| N4 至 N6 | 规格措辞；超时默认值的出处注释；`npm_*` 删得过宽 | 规格与注释已改；`npm_*` 按第一轮的要求保留全部删除，由此导致的安装失败属于安全失败 |

主会话在验收 N3 时另外发现：退出码文件先创建、后写入，等待方可能读到空文件，从而误报失败（不会误报通过）。已改为先写临时文件再改名（`9299eb0`）。主会话还发现 G4 让参数解析不再要求 `--node` 之后，执行器与结论函数会对空的 Node 列表判通过，已在 `2cfe5ca` 修复。

### 结论

修订门禁通过。剩余事项：

- 超时之外，命令正常结束后留在后台的孙进程不会被清理，不影响结论。
- `npm_*` 全部删除，可能影响依赖环境变量配置 registry 或代理的内网环境，属于安全失败。
- GitHub 可用性的判断仍由签署人负责。本次演练中 `gh` 已登录另一个账号，项目所有者决定继续只走本地 git。
