# update-notice-ui 验证记录（2026-09-26）

## 交付范围

- `@pwa-platform/vue/ui` 与 `@pwa-platform/react/ui` 各导出显式挂载的 `PwaUpdateNotice`；各自的 `./update-notice.css` 是独立导出。原根入口未导入 UI 或 CSS。
- 非模态、默认右下角；四个位置、中文文案覆盖、CSS 变量换肤和 `reloadPage` 替换入口已实现。稍后 30 分钟重提醒；接管与刷新是两个用户动作。
- 未修改 facade、Service Worker、Identity、scope、缓存规则或策略。默认离线页、恢复页维持原有实现。

## 本地证据

| 验证 | 结果 |
|---|---|
| Vue/React 包 build、typecheck、单元测试 | 通过；Vue 47/47、React 76/76。根入口的导入闭包仍不含 UI，显式刷新只在 `./ui` 中。 |
| 独立本地 tarball | 两包均包含 `dist/ui.js`、`dist/ui.d.ts`、`dist/update-notice.css`，不含源码。`pnpm check:publish` 验证九包全部构建导出存在。 |
| 首个项目版本组合 | 本地 Vue tarball 在 Node 22.22.0、pnpm 8.6.5、Vue 3.4.0、Vite 5.0.0、TypeScript 5.2.2 的独立消费方中通过类型检查与生产构建；输出 JS/CSS。复现入口见 [`compatibility/vue34-vite5-update-notice`](../../packages/vue/compatibility/vue34-vite5-update-notice/README.md)。 |
| UI Chrome 测试 | Chrome 153.0.8010.53，Vue 与 React 各自只导入本包 CSS：等待、稍后、失败重试、更新中禁用重复按钮、接管后显式刷新、30 分钟重提醒、位置、文案、CSS 变量、320px 键盘操作和桌面暗色布局，10/10 通过。 |
| 既有真实更新套件 | Vue/React 原示例的注册、离线、更新、多标签页、恢复与发布检查 51/51 通过，说明根入口更新语义未回归。 |
| 全仓门禁 | `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm docs:build`、`pnpm check:publish`、`git diff --check` 均通过。 |

## 色值配置补验（2026-09-26）

- Vue／React 的 `PwaUpdateNotice` 均增加可选 `colors` 属性：`primaryButtonBackground`、`primaryButtonText`、`surface`、`text`、`mutedText`、`border`。仅在组件根元素设置对应 CSS 变量，未配置值继续继承宿主变量或默认主题。
- Chrome UI 套件新增两项，对两侧分别验证主按钮背景／文字色、卡片背景／正文／次要文字／边框色，以及 `colors` 优先于祖先变量且祖先变量保持不变。原有窄屏、暗色和显式刷新场景一并通过，合计 12/12。
- Node 22.22.0、pnpm 8.6.5、Vue 3.4.0、Vite 5.0.0 的本地 tarball 消费方使用 `colors` 后，类型检查和生产构建通过。全仓 `pnpm typecheck`、`pnpm lint`、`pnpm docs:build`、`pnpm check:publish` 均通过。

浏览器 UI 夹具使用可控的 facade 事件来覆盖 UI 状态；真实 worker 接管由原示例的浏览器套件覆盖。桌面暗色和 320px 样式截图已目视检查；一次窄屏居中卡片被挤窄的问题已通过提高移动端覆盖规则的选择器特异性修正。

## 发布候选复核：短暂等待信号（2026-09-26）

恢复 worker 曾被观察到让 `updateWaiting` 在极短时间内先真后假。新增 Vue/React 真实浏览器回归：等待 20 ms 后消失，再过 150 ms 不应出现“更新已完成”。改动前两侧均失败，卡片会永久留下；改动后等待状态须稳定 100 ms 才展示，短暂信号不进入完成态，完整 UI 套件 **14/14** 通过。既有稳定等待、稍后、失败重试、接管后显式刷新、色值、窄屏与暗色场景继续通过。

## 发布前尚需

- 在真正的 `example-vite-app` 源码中移除旧 PWA、接入新包并核对 `rollup-plugin-purgecss`。宿主当前只扫描 `./src/**/*.vue`，必须 safelist `/^pwa-update-notice/`；模拟构建曾出现 PurgeCSS 无效 CSS，需要在真实项目中定位。业务仓库路径尚未提供。
- 在真实业务域名与响应头下确认更新、离线和多标签页；移动端与 CI 证据尚未取得。本源码未发布 npm 新版；网站仍将默认 UI 标注为“尚未发布”。
