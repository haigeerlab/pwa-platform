# 规格：update-notice-ui

## 目标与边界

业务可以直接启用一套简洁、可换肤、可调整位置的更新提示，也可以继续使用 `usePwa()` 完全自行实现。默认 UI 只消费框架绑定的 `updateWaiting` 与 `applyUpdate()`，不改变 worker、策略、身份或缓存。既有 Vue/React 根入口保持无可视元素；可选 UI 从各包的 `./ui` 子路径导出，样式从 `./update-notice.css` 显式导入。这是对 `vue-react-adapters` 原规格“本模块不提供任何界面”的后续独立增量，不改原模块已交付的根入口语义。

## 公开接口

- Vue：`import { PwaUpdateNotice } from "@pwa-platform/vue/ui"`；React：`import { PwaUpdateNotice } from "@pwa-platform/react/ui"`。
- 两侧都接受可选 `position`（`bottom-right`，默认；`bottom-center`、`top-right`、`top-center`）、`messages`（部分覆盖中文默认文案）、`colors`（部分覆盖 `surface`、`text`、`mutedText`、`border`、`primaryButtonBackground`、`primaryButtonText`）和 `reloadPage`（业务自定义刷新动作，便于保护未保存内容）。`colors` 只作用于本组件，优先于宿主继承的同名视觉 CSS 变量；未传的色值继续使用 CSS 变量或默认主题。不传 `reloadPage` 时，只有用户点击“刷新页面”才调用浏览器 reload。
- 组件的挂载就是开关；不挂载不产生 DOM、样式或任何自动刷新。业务可以条件渲染。样式由独立 CSS 入口提供，以 `--pwa-update-*` 变量换肤；不要求任何 UI 框架或图标库。
- CSS 导入属于接入步骤，文档必须给出完整的两行导入和挂载示例。两个包的根入口不导入 CSS，服务端渲染根入口不变。

## 交互

| 情况 | 提示 |
|---|---|
| `updateWaiting` 持续至少 100 ms | 非模态状态卡片；“更新”与“稍后”。文案说明新版离线资源已就绪，不推断当前页面一定是旧代码。短于此时间的信号不显示卡片，也不在信号消失后误报更新完成。 |
| 点击“稍后” | 只隐藏本页卡片，worker 继续等待；30 分钟后本页重新提醒。卸载时清掉定时器。 |
| 点击“更新” | 禁止重复点击，调用 `applyUpdate()`；失败后显示“重试”，返回 `false` 时按当前等待状态恢复。 |
| 接管完成 | 同 scope 的每个已提示页面显示“已更新／刷新页面”状态；只有用户点击刷新才调用 `reloadPage` 或浏览器 reload。 |
| 业务切换或卸载组件 | 不改 worker；撤销本组件计时器，不遗留 DOM。 |

## 视觉与可访问性

- 默认卡片固定在右下角，宽度不超过 24rem，留出安全区；320px 宽视口不横向溢出。位置可调，常用色值可直接通过 `colors` 配置；颜色、字体、圆角、阴影、层级也可通过 CSS 变量由宿主覆盖。
- 使用系统字体、纯色表面和低对比阴影，与默认离线页和恢复页的蓝灰体系一致。正文与按钮的对比度满足 WCAG AA；按钮点击区域至少 44px。
- `role="status"`、礼貌播报；非模态、不抢焦点，原生 button 支持键盘。更新期间可见忙碌状态；错误有文字和重试动作。明暗模式和缩放均可用。

## 验收

1. Vue 3.4、React 19 的独立消费方能从包子路径导入并构建，根入口无新增 DOM/CSS 副作用；完整 tarball 包含 JS、声明与 CSS。
2. 两侧在稳定等待、短暂等待、稍后、更新中、失败、接管后、多标签页、显式刷新等状态下行为一致；刷新只由用户点击触发。
3. 真实浏览器在 320px 与桌面宽度、明暗模式下核对布局与键盘行为；业务 `colors`、CSS 变量和 `position` 生效；主按钮背景与文字色可独立配置。
4. 不改变 `PwaIdentity`、scope、worker、缓存准入与 facade 方法语义；既有浏览器更新验收持续通过。

## Documentation impact

本模块更新能力图、ADR、框架包 README 与网站更新指南；不提前把未发布的 UI 写成 npm `0.1.0-beta.1` 的能力。发布和竞品矩阵在独立门禁后更新。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 可选提示实现既有受控更新目标。 |
| architecture | follow | UI 在框架包的独立子路径，底层分层不变。 |
| developer-entry | follow | 接入说明位于专题指南与包 README。 |
| capability-map | update | 新增 update-notice-ui 模块与依赖。 |
| decisions | update | ADR-0039 记录可选 UI、刷新与根入口边界。 |
| lifecycle-and-recovery | follow | worker 接管语义不变。 |
| ci-baseline | follow | 不修改 CI 定义。 |
| supply-chain | follow | 不新增第三方依赖。 |
| browser-matrix | follow | 复用既有必测分档。 |
| v1-acceptance | follow | 可选 UI 不改原 V1 通过标准。 |
| identity-release-baseline | follow | 不改身份或基线。 |
| release-and-incident | follow | 新 beta 另走发布门禁。 |
| recovery-drill | follow | 不涉及恢复演练。 |
| browser-release-evidence | follow | 不修改证据模板。 |
| package-distribution | follow | 不执行发布；包子路径在发布前核对。 |
| cloudflare-test-deployment | follow | 测试站部署不属于本模块。 |
| browser-test-harness | follow | 不修改 harness。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | 不涉及。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不修改模板。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 复用已完成的 Vite 5 接入。 |
| client-runtime | follow | 只调用既有 facade 方法。 |
| vue-react-adapters | follow | 根入口契约保持原样；新增子路径归本模块。 |
| update-notice-ui | create | 本规格、计划和验证记录是新增能力的事实源。 |
| examples-browser-e2e | follow | 新增独立 UI 夹具，不改原示例矩阵。 |
| pwa-entry-resilience | follow | 独立恢复页保持原样。 |
| ssr-adapters | follow | 服务端根入口保持原样；可选组件无等待状态时为空。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 不涉及。 |
