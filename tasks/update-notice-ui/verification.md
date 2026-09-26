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
| 隔离版本组合 | 本地 Vue tarball 在 Node 22.22.0、pnpm 8.6.5、Vue 3.4.0、Vite 5.0.0、TypeScript 5.2.2 的独立消费方中通过类型检查与生产构建；输出 JS/CSS。复现入口见 [`compatibility/vue34-vite5-update-notice`](../../packages/vue/compatibility/vue34-vite5-update-notice/README.md)。 |
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

- 在真实业务源码中移除旧 PWA、接入新包，并核对宿主 CSS 清理插件。如果清理规则只扫描业务组件，需要保留 `/^pwa-update-notice/` 类名；隔离构建曾出现 CSS 产物无效的情况，须在宿主构建链中定位。
- 在真实业务域名与响应头下确认更新、离线和多标签页；移动端与真实业务验收尚未取得。默认 UI 已随 `0.1.0-beta.2` 发布至 npm `next`，`latest` 仍为 beta.1；网站源文档已更新，文档站部署另按独立流程执行。PR 的 CI 结果须另行核对，不能以本地测试代替。

## 隔离测试槽真实更新（2026-09-26）

- `drill` 构建显式挂载已发布的可选更新组件；React 使用默认主题，Vue 示例配置绿色主按钮及白色按钮文字。`main` 和本地浏览器示例仍使用原有更新横幅。改动后 Chrome 153 浏览器回归 **51/51** 通过；最初沙箱内的 Chrome 启动失败是运行环境限制，改在允许浏览器启动的环境重跑后全绿。
- 发布前在 Cloudflare 控制台核对当前账户 Pages Free、Billable Usage 为 $0.00、R2 Standard 存储 0 GB-months、Class A 88、Class B 1.14k；React 两个候选包分别约 1.36 MB 和 1.49 MB，静态文件分别 30、31 个，公开目录敏感字符串扫描无命中，且没有 `_worker.js` 或 Pages Functions。用量会滞后，此读数只用于本次小规模演练预检，不是费用上限。
- React `drill` 原 v2 部署 `f822a276-9272-40f7-8bc0-aea9cd126002` 的制品从私有 R2 下载并验证，恢复本地 staging 后重建指纹资源归档。依次发布 v1 `c2f7862f-affe-4c46-bfe2-df1e64f78c2b` 和 v2 `f7523ab2-a599-48c4-a4dc-7d42d1107b42`；两次候选包均经 R2 上传读回，部署后的索引和旧资源归档均成功。
- 桌面 Chrome 在 v1 页面加载并注册 worker 后，v2 发布。在线重载显示 v2，同时出现可选组件的“有可用更新”卡片；“稍后”使卡片消失，页面保持 v2；再重载后卡片重新出现，点击“更新”显示“更新已完成／刷新页面”，点击“刷新页面”后仍为 v2、`registered`，提示消失。此项验证了真实 Pages 与 worker 的等待、用户确认、接管和显式刷新链路，但因触发检查时先重载了页面，**未观察到仍停留在 v1 页面时弹窗**。不能将它写成手机真实更新或完整旧页状态验收。
- Vue `drill` 线上现有部署的 R2 制品／索引未找到，无法按测试站手册重建当前部署的保留归档。本轮没有覆盖 Vue 线上槽位；须先恢复其回滚材料，再做 v1→v2 演练。React `drill` 已恢复正常 v2；两站 `main` 未改动。

### Android 实体设备补验

- 设备 `23127PN0CC`（Android 16，Chrome 152.0.7977.82；版本沿用同日设备记录）。`drill` 再发布 v1 `a9f013dd-5472-4f32-917c-f83566bfea8a` 后，在手机 Chrome 打开页面并在线重载；直接读取 `v1`、`registered`、controller 为该站 `/app/sw.js`，没有更新卡片。
- 发布 v2 `878f36bb-ad20-4d52-8f3e-cbaecb5d662c` 后，**不刷新旧页面**，在该页调用标准 `registration.update()`。手机页面仍显示 `v1`，注册的 `waiting` worker 为 `installed`，可选 UI 显示“有可用更新”及“更新／稍后”。点击“更新”后显示“更新已完成／刷新页面”，此时旧页面仍为 `v1`、`waiting` 为空；待 active worker 为 `activated` 后点击“刷新页面”，页面成为 `v2`、`registered`，由该站 worker 控制，提示消失。
- 当时手机 Wi-Fi 为开、移动数据为关。临时关闭 Wi-Fi 后确认 `navigator.onLine=false`，断网重载仍显示 `v2`、`registered` 且有自己的 worker controller；结束后 Wi-Fi 已恢复为开。此项是实体手机实际断网，不是 DevTools 网络模拟。
- 本次未在 Android 旧页面点击“稍后”（桌面真实 worker 链路和手机模拟客户端 UI 已覆盖该按钮），也未执行 Android `drill` 安装窗口的更新。单台手机的结果不能充当 Chrome Android N/N-1 双机发布矩阵。
- iPhone 已可用于测试，但下一轮云端写入前的 Cloudflare 用量复核被自动审批拒绝：账单页快照包含与用量无关的私人账单资料。依测试站手册暂停新的 R2／Pages 写入；iPhone 真实更新未执行，React `drill` 保持正常 v2。此限制不影响前述已完成并记录的 Android 结果。
