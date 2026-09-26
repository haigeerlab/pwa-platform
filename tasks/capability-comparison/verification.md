# 验证记录：capability-comparison

日期：2026-09-26。范围：文档站源文件与本地构建；未发布文档站或 npm 包。

- 外部资料：vite-plugin-pwa 的 [自定义 worker](https://vite-pwa-org.netlify.app/guide/inject-manifest)与[提示更新](https://vite-pwa-org.netlify.app/guide/prompt-for-update)，Chrome 的 [Workbox 模块](https://developer.chrome.com/docs/workbox/modules)及[页面侧生命周期](https://developer.chrome.com/docs/workbox/modules/workbox-window)，[PWABuilder 官方仓库](https://github.com/pwa-builder/PWABuilder)，[Progressier 官方功能页](https://progressier.com/)；2026-09-26 核查。
- 平台资料：`website/index.md`、`website/guide/updates.md`、`packages/vite/package.json`、`packages/vue/package.json`、`packages/react/package.json`、`spec/update-notice-ui.md` 与 `tasks/update-notice-ui/verification.md`。npm 已发布 `0.1.0-beta.1` 与工作区增量分别表述。
- `pnpm docs:build`：通过（VitePress 2.0.0-alpha.20，Vite 8.3.0）。
- 本地预览的独立 Chrome 无页面异常：1280px 下三张表完整显示、页面宽度 1280px；375px 下页面宽度仍为 375px，三张表在自身容器内横向滚动（第一张 617px 内容／327px 视口），不产生整页横向溢出。已核对桌面和手机截图；表格的列宽限定只作用于本页。
- 原应用截图中的圆点没有可追溯版本与核验条件，未转写为产品事实。
- `spec-guard` 文档交付只读核验：`ready`，两个需交付 concern 均为 `delivered`，无 attention；`git diff --check` 无空白错误。

剩余：候选包发布后复核版本列与接入入口；文档站部署另按站点发布流程进行。真实业务项目接入由其团队在内部仓库执行。
