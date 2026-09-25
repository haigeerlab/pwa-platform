# 本地门禁记录

GitHub 仓库或 Actions 不可用期间，发布门禁的 CI 一项可以用本记录代替 CI 运行链接（[ADR-0031](../adr/0031-local-gate-substitute-for-ci.md)）。GitHub 恢复可用后，此后的发布只接受真实 CI 运行链接；以本记录发布过的提交必须补跑真实 CI，结果追加到对应的[生产发布浏览器证据](browser-release-evidence.md)。

## 执行规则

- 用 [`@pwa-platform/release-tools`](../../packages/release-tools/README.md) 的命令行入口执行：先 `pnpm build`，再运行
  `pnpm gate:local --commit <sha> --out <仓库外目录> --signer "<姓名>" --availability-check "<命令>" [--node 22=<path> --node 24=<path>]`
  （`pnpm gate:local -- --commit ...` 那个前导 `--` 也容忍，写不写都可以）。
  未传 `--node` 时，工具会通过 nvm 自动查找 Node 22 与 24；本机没有 nvm 或缺少某个大版本时会报错，需要显式传入 `--node`；声明的
  `--node` 集合必须覆盖 ADR-0031 要求的每个大版本，缺一即拒绝执行。`--commit` 会先解析并校验成完整提交 SHA 再检出，解析失败
  （如打错的提交、不存在的引用）同样拒绝执行、不写任何文件。
  工具在 `--out` 目录下写出 `record.md`（按本文件模板渲染）、`results.json`（机器可读结论）与每条命令的日志；退出码与日志哈希直接来自运行结果，不再允许手工从结果表誊抄进本记录。
- 使用前先确认：发布提交还没有任何 CI 运行结果；并记录可用性检查的命令、完整输出与 UTC 时间。
- 每个 Node 版本各新建一个分离的 worktree（`git worktree add --detach <path> <commit>`），不复用任何已有目录、`node_modules` 或被 git 忽略的构建产物。
- 每份日志开头先打印 `git rev-parse HEAD`、`node -v`、`pnpm -v`、UTC 时间与 Chrome 版本，再接命令输出。
- 在 Node 22 与 Node 24 下分别执行下表的全部命令；`test:browser` 在 Chrome 桌面端 N 上运行。
- 除依赖审计外，每项退出码都必须为 0；任一项非 0，本记录结论为"未通过"，不得重跑后只记录成功的那次，所有尝试都要保留。
- 日志文件由发布系统保存，不提交到仓库；日志与本记录都不得包含令牌、凭据或私有数据。
- 本记录不能证明"由独立环境执行"。签署人必须是有名有姓的人类发布负责人，对记录的真实性负责。
- 日志缺失、哈希不符，或保存期未满即被删除时，记录作废，必须重跑。

## 记录模板

以下是一份待填写的记录，不是已取得的通过证据。

```md
# 本地门禁记录：<record-id>

| 字段 | 值 |
| --- | --- |
| 发布提交 | <full commit SHA> |
| 替代原因 | <GitHub 不可用的事实与日期> |
| 可用性检查 | <命令、完整输出、UTC 时间> |
| 签署人 | <人类发布负责人姓名> |
| 操作系统 | <name and version> |
| Chrome 桌面端（N） | <full version> |
| pnpm | <version> |
| 执行者 | <operator> |
| 开始 / 结束（UTC） | <start> / <end> |

## 执行结果

| Node | 命令 | 退出码 | 日志 SHA-256 | 日志位置 |
| --- | --- | --- | --- | --- |
| <22.x.y> | `pnpm install --frozen-lockfile` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm lint` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm build` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm test` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm typecheck` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm test:browser` | <code> | <sha256> | <path> |
| <22.x.y> | `pnpm audit --ignore-registry-errors`（不阻塞） | <code> | <sha256> | <path> |
| <24.x.y> | 同上七项，各一行 | | | |

## 结论

| 检查 | 结论 |
| --- | --- |
| 除审计外全部退出码为 0 | <通过/未通过> |
| 证据形式 | 本地替代（ADR-0031），不是 CI 运行 |
| GitHub 恢复后的补跑 | <未到期 / 已补跑：CI 运行链接与结果> |
```
