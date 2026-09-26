# 验证记录：browser-release-evidence

## 范围

本模块只交付生产发布浏览器证据模板，以及浏览器矩阵、V1 验收、恢复演练和发布门禁之间的文档接线。它没有新增浏览器自动化、Android 控制面、原生安装实现、部署代码、CI 配置或运行时代码。

## 静态核验

- [生产发布浏览器证据](../../docs/operations/browser-release-evidence.md) 的相对链接、目标文件、标题、表格和 `git diff --check` 已核对。
- 模板逐一要求 Chrome 桌面端与 Chrome Android 的 N/N-1、完整浏览器版本、操作系统、设备/主机、日期、执行者和证据引用。
- 模板明确 Android 仅按两台关闭自动更新的实体设备、Google Play 轮换取得 N-1；桌面 N-1 使用受控 `PWA_HARNESS_CHROME_PATH` 二进制；两者都不允许以 CI、桌面 N 或 APK 侧载替代。
- 模板要求每个必测浏览器环境中的 Vue 与 React 示例各有一条原生安装行，并记录安装完成、独立窗口启动、起始 URL、期望与观察到的 `display-mode`、事件顺序和证据引用。
- [恢复演练](../../docs/operations/recovery-drill.md)保留缓存清单与逐浏览器检查作为子记录；生产记录只引用它，不能用摘要替代。
- Spec Guard 产物核验结果为 2 通过、0 失败；“检测到历史状态文件”仅说明远端 tracker 映射未被读取或验证。

## 失败闭合的纸面核对

| 模拟记录 | 预期结论 | 模板规则核对 |
| --- | --- | --- |
| Chrome Desktop N 的全部场景为“通过”，Chrome Android N-1 为“未执行” | V1 发布证据：未通过 | 通过：必测范围包含 Android N-1，任何“未执行”均不能通过。 |
| 四个浏览器环境均通过，但 Vue 原生安装为“未执行” | V1 发布证据：未通过 | 通过：原生安装是必测项，“未执行”即不通过。 |
| 恢复 worker 接管、无 fetch 拦截和缓存删除项齐全，但修复后离线启动为“未执行” | V1 发布证据：未通过 | 通过：恢复演练子记录将“未执行”视为生产发布前失败。 |

## 本地模块质量门禁（2026-09-19）

- 已相对 `main` 审查模板、四份权威文档接线、基线和验证记录的正确性、可读性、架构边界、安全性与运行时影响；没有遗留阻断项。
- 最终静态检查确认相对链接目标、Markdown 表格和 `git diff --check` 通过；分支没有未提交修改。
- 本模块只改文档，未触碰包、依赖、运行时代码、浏览器测试配置或 CI；因此未重复执行不会提供新增信息的全工作区构建、测试或类型检查。

## 未取得的证据与状态

- 当前环境没有受控 Chrome DevTools 测试面、Chrome Android N/N-1 两台实体设备、桌面 N-1 二进制或原生安装操作面；本模块没有填入任何实际浏览器版本、安装结果或通过结论。
- 因此本模块不证明 Android、桌面 N-1、原生安装或生产恢复演练已经通过；`browser-release-evidence` 在文档基线中保持 `target`。
- GitHub 当前不可用；未取得远端 CI 实跑证据，也没有将本地文档检查表述为 CI 通过。
- Spec Guard 的 `documentation_impact` 与 `documentation_verification` 仍无法解析项目既有中文基线：当前解析器要求英文表头与每个模块的影响表。为避免扩大为全仓基线迁移，本模块如实记录该工具限制，不宣称其通过。

## 2026-09-26：单台 Android 探索性冒烟

- 2026-09-26（UTC），实体设备型号 `23127PN0CC`，Android 16，Chrome `152.0.7977.82`。仅访问公开 Vue 测试站 <https://pwa-platform-vue-demo.pages.dev/app/>；页面显示 `v2`、`registered`，manifest URL 为 `/app/manifest.webmanifest`，注册 scope 为 `/app/`，活动 worker 为 `activated`，缓存键为 `pwa:pwavuedemo:test:r1:precache`。
- 首次页面读取时尚未受 worker 控制；在线重载后页面仍显示 `v2`、`registered`，且 `navigator.serviceWorker.controller.scriptURL` 为该站 `/app/sw.js`。
- 通过 Chrome DevTools Protocol 仅对该公开页面模拟断网并重载：页面完成加载、仍显示 `v2`、`registered`，继续由 `/app/sw.js` 控制。检查结束已恢复在线网络模拟设置，并再次确认页面与 worker 状态。此项是**浏览器模拟断网**，不是关闭手机网络后的实测。
- 同一设备的公开 React 测试站 <https://pwa-platform-react-demo.pages.dev/app/> 在线重载后显示 `v2`、`registered`，由该站 `/app/sw.js` 控制；注册 scope 为 `/app/`，活动 worker 为 `activated`，缓存键为 `pwa:pwareactdemo:test:r1:precache`。仅对该页面模拟断网并重载后，页面仍显示 `v2`、`registered` 且保持受控；随后已恢复在线网络模拟设置并确认页面状态。
- 本次未执行原生安装、独立窗口、真实断网、未知路径离线兜底、新版本部署后的更新提示／用户确认、恢复 worker 演练或 iPhone Safari。两个公开站均为较早的 `v2` 示例，不能据此证明 npm `0.1.0-beta.2` 更新 UI 的真机效果。
- 仅一台 Android，未形成经 Google Play 轮换保留的 Chrome Android N/N-1 两机证据；本记录不填作 `desktop+android` 通道通过，也不改变上文历史模块验收结论。
