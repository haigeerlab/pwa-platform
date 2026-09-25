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
