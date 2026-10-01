# 0.3.0 npm 与文档站发布计划

## 范围与成功标准

- 从已合入可移植部署与 `worker-mime` 检查的 `main` 提交准备候选，十个公开 `@pwa-platform/*` 包统一升至 `0.3.0`，`latest` 逐包指向新版本；Nuxt、Push、离线写入等私有包不发布。
- Cloudflare Pages `pwa-platform-docs` 最终生产站点说明 `0.3.0` 已支持上述能力，安装命令使用 `0.3.0`。React/Vue 演示站不在本轮部署范围。
- 记录候选提交、门禁、十个 tarball、npm 读回、文档部署 ID 与线上检查。业务应用的生产验收仍独立进行。

## 执行顺序

1. **候选源码**：核对远端 `main`、已发布 `0.2.5` 与版本可用性。十包版本、`vite` 随包 skill 版本、`check:publish`、README 和 CHANGELOG 升至 `0.3.0`；保留文档站对 npm `0.2.5` 的真实“待发布”标记。核对锁文件和 `git diff --check`。
2. **本地候选门禁**：冻结安装、lint、build、typecheck、单测、浏览器、onboarding、文档构建与公开 API 状态检查、发布检查、依赖审计；逐包 pack，检查文件、公开入口、内部依赖版本和 SHA-256；从独立项目安装候选 tarball。浏览器引擎与联网测试按操作手册记录。
3. **源码交付与远端门禁**：审阅候选 diff，经 PR 合入 `main`；对最终发布提交手动运行 CI，确认必需任务通过、SHA 一致。打 `v0.3.0` 标签并读回指向。若发布提交的 `website/` 另有变更，重新执行相应检查。
4. **文档先行**：从发布提交建立首个唯一 `docs/v…` 分支。核对 Pages 自动部署关闭、Free 额度与静态产物边界；手动部署含新能力说明但仍声明 npm `0.2.5` 未支持的站点。核对线上页面、skill 链接及部署 SHA。
5. **npm 发布**：从审核过的干净提交按 `contracts` → `core`/`engine-workbox`/`build-verifier` → `sw-runtime` → `client-runtime` → `vite` → `entry-resilience`/`vue`/`react` 发布。若 npm 暂存待批准，每次只批准一层，确认该层 tarball 为 200 后进入下一层；不重发已暂存版本。全部公开后核对十包 `latest`、tarball 文件和独立安装。
6. **最终文档**：将站点的版本、安装命令、portable 与 worker MIME 状态改为已发布 `0.3.0`；运行 `docs:check-public-api`、文档构建及本地预览。经 PR 合入后从该提交建立第二个唯一文档版本分支，重复 Pages 前置核对并手动部署；核对线上页面、搜索、404、部署 ID 与 SHA。
7. **收口**：写 `release-0.3.0.md` 和文档站发布记录，核对 Git、npm、Pages 三处最终状态以及未完成或非阻塞门禁。

## 停止与恢复

- 任一必需测试、tarball 校验、npm 包版本可用性、CI 或 Pages 额度检查失败时，停止对应发布步骤并修复后重验。
- npm `publish` 输出不确定时先按包名与版本只读查询暂存、公开状态；确认后才继续，绝不盲目重发。已公开的版本不可覆盖，按发布记录说明局部结果。
- 文档站可切回前一生产部署；npm 不能用覆盖或 `unpublish` 回滚，需准备修复版本。业务应用升级由其自身发布门禁控制。
