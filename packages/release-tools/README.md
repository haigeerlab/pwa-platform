# @pwa-platform/release-tools

本地门禁工具（[ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md)）：GitHub 不可用期间，用于在干净 worktree 中按 Node 版本跑一遍基线 CI 命令，并生成[本地门禁记录](../../docs/operations/local-ci-record-template.md)。私有工作区包，不发布到 npm，只供发布操作者使用，不得被产品代码引入。规格见 [spec/platform-governance.md](../../spec/platform-governance.md) 的"修订：本地门禁工具入仓"。

## 用法

```sh
pnpm build
pnpm gate:local --commit <sha> \
  --out <仓库外目录> \
  --signer "<姓名>" \
  --availability-check "<命令>" \
  [--repo <repo path, 默认当前仓库>] \
  [--node 22=<path> --node 24=<path>]
```

- `--commit`、`--out`、`--signer`、`--availability-check` 必填；缺一即以退出码 2 拒绝并打印用法。
- pnpm 11 会把 `pnpm gate:local -- --commit ...` 里那个 `--` 原样透传给脚本的 argv；解析器容忍一个前导 `--`，写不写都可以。
- `--commit` 先按 `git rev-parse --verify --end-of-options "<commit>^{commit}"` 解析并校验成 40 位 SHA，再据此检出每一轮的 worktree；解析失败（如打错的提交、不存在的引用）以退出码 2 拒绝，不写任何文件。`record.md` 与 `results.json` 同时记录请求值与解析后的完整 SHA。
- `--repo` 默认取当前工作目录所在仓库的 `git rev-parse --show-toplevel`。
- 不传 `--node` 时，通过 nvm（`$NVM_DIR` 或 `~/.nvm`）自动查找 Node 22 与 24 各自安装的最高版本；找不到 nvm 或某个大版本缺失时报错并提示改用 `--node <major>=<path>`。声明的 `--node` 集合必须覆盖 ADR-0031 要求的每个大版本（默认 22、24），否则以退出码 2 拒绝，不写任何文件。
- `--out` 必须落在仓库与其所有 worktree 之外（按 realpath 比较）；落在仓库内部会被拒绝。
- 每条命令都有超时（本工具自身的默认值，30 分钟，非 ADR-0031 规定），超时会杀掉该命令自己的整个进程组（含它派生的孙进程），记为失败并计入结论。
- `pnpm build` 会额外写出 `dist/build-info.json`（工具自身仓库当时的 HEAD 与是否有未提交改动）。运行时会将其与工具仓库*此刻*的 HEAD／dirty 状态比对：`dist/build-info.json` 缺失、提交不一致、构建时或运行时工作区不干净，都会以 `tool-stale` 计入结论失败——避免已签署的记录声称了一个工具版本、但实际跑的并不是那个构建。改完代码务必先 `pnpm build` 再跑门禁。
- 退出码：`0` 全部通过；`1` 有阻塞项未通过（结论见输出、`record.md` 的"失败项"与"结论"与 `results.json`）；`2` 用法错误或执行前的拒绝（如 `--out` 已存在或在仓库内、Node 路径无效、提交无法解析、声明的 Node 版本不全）。
- 输出目录下产出 `record.md`、`results.json` 与每条命令的日志；日志与记录不提交到仓库；日志包含完整命令输出且环境变量不做脱敏处理，不要在有密钥的环境下运行。

## 边界

- 不依赖任何平台包。
- `src/` 下命令列表、结论计算、日志头、记录渲染、参数校验与 CLI 参数解析是纯函数；子进程、git 与文件系统写入集中在 `run-gate.ts`（执行器）与 `cli.ts`（命令行入口的纯函数部分，`main`/`defaultDeps`，完全可单测）。`bin.ts` 是唯一真正执行的入口：其中 `run(argv, deps, setExitCode)` 是可单测的部分（调用 `main` 并把结果交给 `setExitCode`），文件末尾无条件调用 `run(process.argv.slice(2), defaultDeps(), (code) => { process.exitCode = code; })`——这一行是唯一未被单测覆盖的一行。`package.json` 的 `bin` 字段与根 `gate:local` 脚本都指向编译后的 `dist/bin.js`。
