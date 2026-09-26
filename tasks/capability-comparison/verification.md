# 验证记录：capability-comparison

初次记录日期：2026-09-26；应用对比更新日期：2026-09-27。范围：文档站源文件与本地构建；文档站尚未发布。本模块不执行 npm 发布；包发布状态依据独立发布记录核对。

- 外部资料：vite-plugin-pwa 的 [自定义 worker](https://vite-pwa-org.netlify.app/guide/inject-manifest)与[提示更新](https://vite-pwa-org.netlify.app/guide/prompt-for-update)，Chrome 的 [Workbox 模块](https://developer.chrome.com/docs/workbox/modules)及[页面侧生命周期](https://developer.chrome.com/docs/workbox/modules/workbox-window)，[PWABuilder 官方仓库](https://github.com/pwa-builder/PWABuilder)，[Progressier 官方功能页](https://progressier.com/)；2026-09-26 核查。
- 平台资料：`website/index.md`、`website/guide/updates.md`、`packages/vite/package.json`、`packages/vue/package.json`、`packages/react/package.json`、`spec/update-notice-ui.md` 与 `tasks/update-notice-ui/verification.md`。2026-09-27 更新后，十个公开包均按 npm `latest=0.1.0` 表述，工作区能力继续单列。
- `pnpm docs:build`：通过（VitePress 2.0.0-alpha.20，Vite 8.3.0）。
- 本地预览的独立 Chrome 无页面异常：1280px 下三张表完整显示、页面宽度 1280px；375px 下页面宽度仍为 375px，三张表在自身容器内横向滚动（第一张 617px 内容／327px 视口），不产生整页横向溢出。已核对桌面和手机截图；表格的列宽限定只作用于本页。
- 2026-09-27 按用户要求新增应用矩阵，但没有直接转写旧截图：逐个固定九个官方仓库的提交和源文件，状态使用“已确认／部分／未确认／不适用”；工具职责对比与应用产品对比分页维护。
- 更新后的 375px 首页与两份详情页文档宽度均为 375px；大表只在自身容器横向滚动。详细 DOM 尺寸见 `tasks/production-readiness-documentation/verification.md`。
- `spec-guard` 文档交付只读核验：`ready`，两个需交付 concern 均为 `delivered`，无 attention；`git diff --check` 无空白错误。

剩余：文档站部署另按站点发布流程进行。真实业务项目接入由其团队在内部仓库执行。
