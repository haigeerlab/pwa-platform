# 依赖变更流程

本流程约束本仓库的依赖新增、升级与豁免，以及依赖安装脚本的批准方式。规则写在 [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) 中，由 pnpm 在每次安装时强制执行；CI 以冻结 lockfile 安装（见 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)），因此规则对所有贡献者和 CI 同样生效，不依赖个人机器上的配置。

唯一的例外是 `blockExoticSubdeps`：pnpm 只在解析依赖时检查它，从已有 lockfile 安装时不会重新检查，所以非 registry 来源的传递依赖要靠 lockfile 审阅拦截（见下文）。

## 仓库强制的规则

| 设置 | 值 | 含义 | 来源 |
|---|---|---|---|
| `minimumReleaseAge` | `1440` | 版本发布满 1 天（1440 分钟）后才允许安装，传递依赖同样适用 | pnpm 11 默认值，显式写出 |
| `minimumReleaseAgeStrict` | `true` | 解析到未满 1 天的版本时不自动豁免：非交互环境（包括 CI）直接失败，交互终端中先询问 | 显式设置 `minimumReleaseAge` 时 pnpm 会自动启用；仍然写出，防止删掉上一行后静默退回宽松模式。宽松模式会自动把这些版本写入豁免并继续安装 |
| `minimumReleaseAgeIgnoreMissingTime` | `false` | registry 元数据缺少发布时间时直接失败，不跳过检查 | 本仓库收紧（pnpm 默认跳过） |
| `blockExoticSubdeps` | `true` | 解析依赖时，禁止传递依赖来自 registry 以外的来源（如 git、tarball URL）；从已有 lockfile 安装时不会重新检查 | pnpm 11 默认值，显式写出 |
| `trustPolicy` | `no-downgrade` | 某版本的信任证据（如 provenance、trusted publisher）比更早发布的版本弱时，拒绝安装；按发布时间而非 semver 比较 | 本仓库新开启 |
| `trustLockfile` | `false` | 每次安装都用 `minimumReleaseAge` 与 `trustPolicy` 重新校验 lockfile 中的每个条目，不把 lockfile 当作已可信 | pnpm 11 默认值，显式写出 |
| `strictDepBuilds` | `true` | 依赖带有未批准的构建脚本（preinstall、install、postinstall）时，安装以 `ERR_PNPM_IGNORED_BUILDS` 失败，脚本不会执行 | pnpm 11 默认值，显式写出 |

显式写出这些设置，是为了让规则在升级 pnpm 或个人配置不同的情况下保持不变。放宽或删除任何一项，都需要先按 [ADR 流程](../adr/) 记录决定。

## 新增或升级依赖

依赖变更的 PR 必须写明：

1. **为什么需要**：解决什么问题，是否已有依赖或平台能力可以复用。
2. **影响范围**：是运行时依赖还是开发依赖，进入哪个工作区包；运行时依赖会随包分发，门槛更高。
3. **lockfile diff 已审阅**：
   - 新增了哪些传递依赖；
   - 是否有依赖声明了安装脚本；
   - 是否有传递依赖的 `resolution` 不是普通的 registry 条目，例如 `type: git`、`directory`，或指向非 registry 地址的 `tarball`。pnpm 从 lockfile 安装时不会再检查这一项，只能在审阅中拦截。
4. **本地冻结安装通过**：`pnpm install --frozen-lockfile` 在干净环境中通过，并附上 lint、测试、构建和 typecheck 的结果。

新发布不满 1 天的版本会被拒绝：非交互环境（包括 CI）直接失败；交互终端中，pnpm 会询问是否把这些版本加入 `minimumReleaseAgeExclude` 并继续安装。**确认后写入的条目同样是豁免**，必须按下一节登记理由。优先等待满 1 天后再升级，而不是申请豁免。

## 豁免

只有在确有必要时才登记豁免（例如必须立即引入的安全修复），并且：

- 只能针对**具体版本**登记，不能按包名或版本范围整体放开；
- 同一个包的多个版本写成一个条目，用 `||` 连接。这是 pnpm 的规范格式，`pnpm audit --fix` 和安装时的确认也会合并成这种形式；
- `minimumReleaseAgeExclude` 与 `trustPolicyExclude` 中的每一项，都要在同一个 PR 中写明理由，以及计划何时移除；
- 版本升级后，旧版本的豁免必须随之删除。

示例（仅示意格式）：

```yaml
minimumReleaseAgeExclude:
  - some-package@1.2.3 || 1.2.4
trustPolicyExclude:
  - some-package@1.2.3
```

## 构建脚本

依赖的安装脚本默认不允许执行。遇到带脚本的依赖时，安装会失败并列出被忽略的依赖，例如 `Ignored build scripts: <依赖>`。

- **批准**：只有在确认脚本必要且可信时，才在 `allowBuilds` 中批准。批准键必须与 pnpm 报告的写法一致，可以运行 `pnpm approve-builds <包名>` 由 pnpm 写入；本仓库实测，`file:` 依赖只写包名不会生效，必须使用报告中的完整写法（复现步骤见 [platform-governance 验证记录](../../tasks/platform-governance/verification.md)）。优先按具体版本批准。
- **拒绝**：确认不需要脚本时，把对应键设为 `false`，安装会继续而不执行脚本。
- **占位值**：安装失败时，pnpm 会把待决定的依赖写入 `pnpm-workspace.yaml`，值为 `set this to true or false`。**提交前必须改成 `true` 或 `false`**，不得提交占位值。
- 每一项批准或拒绝都要在 PR 中写明理由。不得使用 `dangerouslyAllowAllBuilds`。

## `.npmrc`

仓库不提交 `.npmrc`。pnpm 11 的 `.npmrc` 只用于认证与 registry 配置；其他设置一律写在 `pnpm-workspace.yaml` 中并经过评审。个人的 `.npmrc` 不得覆盖本仓库的供应链规则。

## 依赖审计

CI 在每次运行的最后执行 `pnpm audit --ignore-registry-errors`，结果只作报告，不阻塞 CI。这样上游公告暂时没有修复版本时，不会卡住与该依赖无关的改动。

- **负责人**：平台团队（与 [职责与 RACI](../product/ownership-and-raci.md) 中平台团队对 core runtime 与适配器负责一致）。
- **处理方式**：对报告中的漏洞逐条给出结论并记录在 GitHub Issue 中：升级、覆盖版本、确认不受影响（写明理由），或登记为已知风险并注明复查时间。
- **发布前**：报告中 high 及以上级别的漏洞都必须已有处理结论。*（本条为本流程新增的约束，未在模块规格中列出，评审时请确认。）*

## 审批

依赖变更、豁免和构建脚本批准，都需要平台团队维护者在 PR 中批准。安全漏洞的私下报告方式见 [SECURITY.md](../../SECURITY.md)。
