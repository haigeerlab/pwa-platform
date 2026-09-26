# 实现计划：update-notice-ui

依据：[模块规格](../../spec/update-notice-ui.md)。项目所有者在讨论业务可用默认 UI、位置和个性化后要求继续。旧版 `vue-react-adapters` 的根入口保持无 UI；本计划仅增加显式导入的子路径。

1. **接口与决定**：记录 ADR-0039，定义 Vue/React 同名组件的 props、状态、样式入口和根入口隔离。验收：两侧类型公开且 `@pwa-platform/vue` 在 Vue 3.4 中可用。
2. **可选组件与样式**：两包分别实现组件，状态只来自既有绑定；提供独立 CSS、四个位置、可覆盖文案与视觉变量。验收：构建产物与 tarball 都含组件和样式，根入口不加载 UI。
3. **交互与浏览器验证**：验证稍后重提醒、失败重试、多标签页接管、显式刷新、键盘与窄屏布局。验收：刷新仅在点击后，worker 在“稍后”时保持等待；原浏览器套件持续通过。
4. **接入文档与门禁**：更新 Vue/React README 和网站更新指南，明确 beta.1 尚未交付；运行 lint、build、typecheck、相关单元与浏览器测试，审查完整包和差异。
5. **业务色值配置**：为两侧同名组件增加可选 `colors` 属性，映射到现有 CSS 变量，优先覆盖继承色值而不影响其他组件。验收：Vue/React 类型、真实浏览器主按钮背景／文字色与正文色均生效，未配置时既有明暗主题不变。
6. **短暂等待信号**：恢复 worker 的短暂 `updateWaiting` 可能先真后假；提示只在状态稳定 100 ms 后显示，未稳定的信号消失时不进入“更新已完成”。验收：Vue/React 的真实浏览器回归先红后绿，原交互套件继续通过。

真实业务应用接入仍需在其仓库核对构建、样式处理和部署；本模块的隔离验证不能替代宿主验收。新 beta 发布另走 `package-distribution` 门禁。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| capability-map | `spec/CAPABILITY-MAP.md` | 登记新模块及其依赖。 |
| decisions | `docs/adr/` | ADR-0039 解释业务可选 UI 与根入口边界。 |
| update-notice-ui | `spec/update-notice-ui.md`、`docs/adr/0039-optional-update-notice-ui.md`、`tasks/update-notice-ui/verification.md` | 记录接口、实现和浏览器证据。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 已登记 update-notice-ui。 |
| decisions | delivered | `docs/adr/0039-optional-update-notice-ui.md` | 已记录可选展示与显式刷新。 |
| update-notice-ui | delivered | `tasks/update-notice-ui/verification.md` | 本地浏览器与包消费方证据已记录；真实业务项目、移动端和 CI 仍为发布门禁。 |
