# 验证记录：package-distribution

日期：2026-09-20。对象：首批九包的 `0.1.0-beta.0` 候选质量门禁；实际上传与远端核验见[独立发布记录](release-2026-09-20.md)。本记录不批准业务生产部署。

## 本地候选证据

在排除 `.git`、`node_modules` 与构建产物的临时干净副本中执行：

| 检查 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过；锁文件不需更改。 |
| `pnpm lint`、`pnpm build`、`pnpm typecheck` | 通过。 |
| `pnpm test` | 15 个工作区包全部通过。首轮发现旧测试断言要求九包仍为 `private: true`，更新这九处断言后全量重跑通过；延后包的私有断言保留。 |
| `pnpm test:browser` | 本机 Chrome 153 全量通过；Vue 与 React 的真实 `beforeinstallprompt` 测试共 2 项跳过，不计作原生安装验收。 |
| `pnpm audit --ignore-registry-errors --json` | exit 0；info/low/moderate/high/critical 均为 0。 |
| `pnpm check:publish` | 通过；核对九包版本、依赖闭包、发布顺序、许可证、README 和已构建导出。 |
| 九包 `pnpm pack` | 通过；每个 tarball 含 README、MIT LICENSE、完整导出，内部生产依赖转成 `0.1.0-beta.0`，未发现测试夹具或源码泄露。 |
| 独立临时项目 `npm install` 全部九个本地 tarball | 通过；全部九个主入口可由 Node ESM 导入。 |
| Spec Guard 文档验证 | `documentation_impact` 为 valid，`documentation_verification` 为 ready；两者只核对文档声明，不替代代码和部署验证。 |

上述全量验证在项目真实工作目录之外执行，避免工具改动工作区依赖或锁文件。写入后逐一比对 50 个改动文件与临时副本，内容一致；实际目录的 `node scripts/check-package-distribution.mjs` 与 `git diff --check` 通过。实际目录直接运行 `pnpm` 触发沙箱外写入而报 `EPERM`，属环境权限限制，不计为产品测试失败。

## 未取得的证据和发布边界

- 发布前重新打包、版本可用性、registry 查询与实际 tarball 哈希已在独立发布步骤完成，详见[发布记录](release-2026-09-20.md)；npm 还自动设置了 `latest` 指向 beta。
- GitHub 当前不可用，未取得本次候选的远端 CI 证据；本地全量验证不能替代它。
- Android、浏览器 N/N-1、原生安装提示、真实域名响应头、CDN 回滚和恢复演练仍未完成，不能宣布业务应用可直接生产上线。
- 首批包只覆盖在线业务、安装集成、静态预缓存、离线兜底与受控更新；业务 API 运行时缓存、私密数据缓存、离线写入/自动重放与 Push 不在首批分发承诺内。
