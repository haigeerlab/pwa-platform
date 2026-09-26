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
- 随后执行**手机真实断网**：测试前 Wi-Fi 为开、移动数据为关；临时关闭 Wi-Fi 后确认两者均为关，Chrome 中 `navigator.onLine` 为 `false`。React 和 Vue 已缓存的 `/app/` 均可重新加载，显示 `v2`、`registered`，由各自 `/app/sw.js` 控制。两站访问未预缓存的 `/app/never-precached` 均显示 `You are offline` 静态兜底页，且继续由各自 worker 控制。测试脚本退出时恢复 Wi-Fi，复查 Wi-Fi 为开、移动数据仍为关。
- React 站点的 Chrome 菜单显示“安装并创建快捷方式”；进入后，对话框显示“创建快捷方式”和“添加”，未点击该快捷方式入口。两站页面自身的 `Install` 按钮分别触发 Chrome 原生“安装应用”对话框，名称为 `PWA Platform React Demo` 和 `PWA Platform Vue Demo`。首次确认 React 安装后未立即看到新包，不能据此判定已安装；再次按同一流程确认后，React 和 Vue 均出现新增 WebAPK，安装包 manifest 分别含对应公开主站域名。从启动器分别打开，前台为 Chrome `SameTaskWebApkActivity` 独立任务、无普通 Chrome 地址栏，均显示 `v2`、`registered`。未直接读取两个独立窗口内的 `matchMedia('(display-mode: standalone)')` 结果或适配器 `install-eligible`→`installed` 事件顺序，因此这两项字段仍待补证。
- 对两个**已安装 WebAPK**分别进行手机真实断网冷启动：关闭 Wi-Fi（移动数据本来关闭）、结束各自旧进程、从启动器重新打开；Vue 和 React 均显示各自标题、`v2`、`registered`。每次脚本退出后复查 Wi-Fi 已恢复为开、移动数据仍为关。此前用户打开的另一个同名 React 窗口经安装包核对属于旧公开冒烟站，未将其版本或更新提示计入这两个主站的结果。
- 另经 USB 回环映射，在手机 Chrome 打开当前仓库的更新 UI 测试页面（模拟客户端，不注册真实 worker）：400×773 CSS 像素视口下，React 默认配色和 Vue 自定义浅色背景／绿色主按钮均保持业务内容可见、无横向溢出，两个操作按钮高度均为 44 CSS 像素。两框架实际点击“稍后”后提示消失且 `applyCalls=0`；重新触发后点击“更新”，`applyCalls=1`、`reloadCalls=0`，显示“更新已完成”；再点击“刷新页面”，`reloadCalls=1`。Vue 的 `top-center` 位置也能显示，但在此测试页面覆盖了标题，业务需按页面布局选位置。本项只验证手机上的 UI 排版与交互，**不证明真实 worker 更新链路**。
- Android 本次未执行新版本部署后的真实更新提示／用户确认或恢复 worker 演练；iPhone Safari 探索性检查另见下节。两个公开站均为较早的 `v2` 示例；本机 UI 测试页面使用模拟客户端，尚不能证明 npm `0.1.0-beta.2` UI 与真实 worker 更新链路的手机端联动。
- 仅一台 Android，未形成经 Google Play 轮换保留的 Chrome Android N/N-1 两机证据；本记录不填作 `desktop+android` 通道通过，也不改变上文历史模块验收结论。

## 2026-09-26：单台 iPhone 探索性检查

- 实体 iPhone 16 Pro 运行 iOS 27.0，经 USB 配对并被 macOS Safari 识别。用户确认已在手机 Safari 打开公开 Vue 测试站 <https://pwa-platform-vue-demo.pages.dev/app/>。
- Mac Safari 起初在“App 和设备检查”中显示“无可检查内容”；用户启用手机侧连接后，公开 Vue 页出现在可检查列表。通过 iPhone Safari 的远程控制台直接读取：页面 URL 为 `/app/`，可见 `v2`、`registered`，`navigator.onLine=true`，Safari 标签页的 `display-mode: standalone` 为 `false`；当前 controller 为该站 `/app/sw.js`，注册 scope 为 `/app/`、活动 worker 状态为 `activated`，缓存键为 `pwa:pwavuedemo:test:r1:precache`。
- iPhone 镜像仍显示无法连接，设备截图服务无法启动；Safari 网页检查器只能读取与调试网页，尚不能代替手机操作系统里的“添加到主屏幕”及网络开关。用户手动操作的步骤与远程控制台直接读取的结果应分别记录。
- 用户在 Safari 中执行“共享 → 添加到主屏幕”，启用“作为网页 App 打开”后从图标启动。Mac Safari 的设备检查器出现独立的 `Web` 应用进程；其远程控制台直接读取 `display-mode: standalone=true`，页面显示 `v2`、`registered`。该进程首次加载时 `navigator.serviceWorker.controller` 为 `null`；经在线重载后，由该站 `/app/sw.js` 接管，页面仍显示 `v2`、`registered`，且 `display-mode: standalone=true`。
- 用户关闭 Wi-Fi 和蜂窝数据、结束并从主屏幕图标重新打开 Vue 网页 App 后，远程控制台直接读取 `navigator.onLine=false`、`display-mode: standalone=true`，页面仍显示 `v2`、`registered`，controller 仍为该站 `/app/sw.js`。这是实体 iPhone 的真实断网冷启动，不是开发工具的断网模拟。
- 用户恢复网络后，远程控制台复查 `navigator.onLine=true`。
- 同一 iPhone 的公开 React 测试站 <https://pwa-platform-react-demo.pages.dev/app/> 在 Safari 标签页显示 `v2`、`registered`、`navigator.onLine=true`、`display-mode: standalone=false`。首次打开时尚未受 worker 控制；远程控制台读取注册 scope 为 `/app/`、活动 worker 为该站 `/app/sw.js` 且状态为 `activated`，缓存键为 `pwa:pwareactdemo:test:r1:precache`。在线重载后，页面仍显示 `v2`、`registered`，controller 为该站 `/app/sw.js`。
- 用户同样从 Safari 将 React 站点添加到主屏幕并作为网页 App 打开；设备检查器出现独立 `Web` 进程。远程控制台读取 `display-mode: standalone=true`、页面 `v2`、`registered`。首次加载时 controller 为 `null`；在线重载后仍为独立模式，controller 为 React 站 `/app/sw.js`。
- React 首次按用户描述执行断网冷启动时，用户观察到短暂白屏；检查器一度只显示该站 worker，上报 `/app/` 资源加载超时。随后用户观察到页面恢复，检查器读取页面 `v2`、`registered`、`standalone=true`、controller 为该站 `/app/sw.js`，但当时 `navigator.onLine=true`。尚未确认恢复时 Wi-Fi 与蜂窝数据是否都保持关闭，因此**不能将此次 React 冷启动计为离线通过**；需在明确网络状态后复测。
