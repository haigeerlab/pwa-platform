# 实现计划：package-distribution

## 范围和次序

1. 确定 `@pwa-platform` scope、MIT 许可、首批九包的统一预发布版本与 `next` 标签；其余包保持私有。
2. 为首批九包写入公开发布元数据和包级 README/LICENSE，明确应用入口与内部传递依赖的边界。
3. 提供本地发布检查和操作说明，按依赖拓扑打包，核对 tarball 中的版本、文件与入口。
4. 在临时干净副本跑冻结安装、质量门禁；从独立消费项目安装 tarball 做解析验证。记录未取得的 Android、原生安装、远端 CI 与生产部署证据。
5. 初始配置任务不执行上传；所有者后续明确要求继续后，完成审阅与真实发布前门禁，再以独立发布步骤上传并记录结果。

## 发布顺序

`contracts` → `core` / `engine-workbox` / `build-verifier` → `sw-runtime` → `client-runtime` → `vite` / `vue` / `react`。

## 风险与控制

- `workspace:*` 只有经 `pnpm pack` 或 `pnpm publish` 才会改写；必须检查 tarball 后再上传。
- 九包版本必须一致，不能让业务项目解析到未发布的内部依赖。
- `next` 预发布不代表生产稳定；原生安装和 Android 门禁仍未闭合。
- 不把 npm 凭据、`.npmrc` 或远端状态写入仓库。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| capability-map | `spec/CAPABILITY-MAP.md` | 登记首批分发模块及依赖。 |
| developer-entry | `README.md` | 说明可安装的包、预发布状态与运行手册。 |
| decisions | `docs/adr/0028-npm-prerelease-distribution.md` | 记录首批范围与分发决策。 |
| package-distribution | `spec/package-distribution.md` | 配合本计划和 npm 发布流程定义门禁。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块行与依赖已写入。 |
| developer-entry | delivered | `README.md` | 首批包状态与发布链接已写入。 |
| decisions | delivered | `docs/adr/0028-npm-prerelease-distribution.md` | 分发决定已记录。 |
| package-distribution | delivered | `spec/package-distribution.md` | 本模块的范围、验收和非目标已记录。 |

## 2026-10-02：常规版本发布提速

1. 复盘 0.3.1 的 Git、CI 与 npm 时间戳，区分包公开耗时和文档收口耗时。
2. 让 `release:branch npm --create` 从版本一致且已通过 CI 的 `main` 切分支，并只在分支更新十包及 Vite skill 版本；发布检查与版本断言不再写死上一版。
3. 将 npm 手册收敛为一次构建、分发检查、归档安装冒烟、批量提交和最终集中读回；删除发布分支重复执行全套 CI 的要求。
4. 用分支工具测试、发布检查、受影响包测试和文档自审验证；不为验证此流程实际发布新版本。

复盘时间（2026-10-02，马来西亚时间）：Windows 修复合入 `main` 13:29:06；版本候选 PR 合入 14:03:42；首包公开 14:25:48、末包公开 14:32:41；文档与记录 PR 收口于 15:06:58。代码合入到十包公开为 63 分 35 秒，其中版本候选准备占 34 分 36 秒、候选合入到十包公开占 28 分 59 秒；十包真正公开的窗口为 6 分 53 秒。文档与记录又用了 34 分 17 秒。结论是主要压缩版本候选和重复门禁，而不更换 npm 认证方式。
