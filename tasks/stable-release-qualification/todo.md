# Todo：stable-release-qualification

- [x] T1 冻结十包候选与浏览器/设备/测试槽现状，建立验收矩阵
- [ ] T2 完成 Chrome 桌面 N/N-1、Mac Safari、Android Chrome、iPhone Safari 的 Vue/React 安装与运行验证
  - [x] Chrome 154／153 全仓浏览器回归和 Vue／React 原生安装窗口
  - [x] Mac Safari 18.6 Vue／React 添加到程序坞和基础运行
  - [x] Android 16 + Chrome 153 单机 Vue／React 安装、独立窗口和基础运行
  - [ ] Android Firefox 156 已完成浏览器页、Service Worker、离线回退和自动恢复，安装入口可见但最终固定未确认；小米浏览器 20.16 已完成添加桌面、独立窗口、断网冷启动、离线回退和自动恢复；夸克 10.16 已完成补充离线冒烟但未发现安装入口
  - [x] iPhone 16 Pro + iOS 27 Vue／React 主屏幕安装、独立窗口和基础运行
  - [ ] 取得第二台 Android，并按 Google Play 两机轮换完成 N/N-1（2026-09-28：第二台已取得，两机 Chrome 153 全部场景通过；两台同为 N，N-1 待下一稳定版轮换，见 verification.md；2026-09-29 项目所有者决定：保留一台 Android 关闭 Chrome 自动更新，待下一稳定版发布后它即为 N-1，再按既有真机清单补测）
  - [x] 接受 ADR-0041：`0.1.x` 暂不新增 Apple 发布通道，iPhone 继续标为渐进兼容
- [x] T3 完成浏览器页和安装窗口的真实 v1→v2、稍后再提醒、双标签与离线更新验证
  - [x] 桌面 Chrome React 真实 30 分钟重提醒、双标签、确认接管和显式刷新
  - [x] Android Vue 安装窗口分步更新与离线刷新；Android React 更新接管和显式刷新
  - [x] Mac Safari 18.6 Vue／React 安装窗口完成真实 v1→v2、双窗口协调、确认接管和逐窗口显式刷新
  - [x] iPhone Vue／React 安装窗口以真实 v1→v2 部署完成提示、旧 DOM 保持、确认接管和显式刷新
  - [x] Android React 以旧 v1 DOM 保持到显式刷新重新取证
  - [x] iPhone Vue／React 安装窗口完成 v2 已下载后的断网接管与离线显式刷新
  - [x] iPhone Vue／React Safari 完成同 scope 双标签协调；iPhone 主屏幕网页 App 不提供同应用双窗口 UI，按平台不适用记录
- [x] T4 完成中英文默认离线页的真机、桌面、视觉和恢复联网验证
  - [x] Android、iPhone 的 Vue／React 英文离线页、断网冷启动与最终自动联网探针
  - [x] Chrome 154 Vue／React 安装窗口完成 DevTools 离线回退／自动恢复，并由用户完成物理断网冷启动
  - [x] Mac Safari 18.6 React 安装窗口完成真实断网导航、默认离线页和联网自动恢复
  - [x] Mac Safari 18.6 Vue 安装窗口通过精确单域名阻断取得默认离线页可见证据，并在撤销阻断后无人工刷新自动恢复至线上 JSON
  - [x] Mac Safari 18.6 Vue／React 网页 App 在联网预热、完成最新 worker 接管并退出后，由用户手工关闭 Wi-Fi 冷启动；两站离线与联网表现一致，均正常显示 v2
  - [x] Chrome 153 本地真实浏览器验证中文默认离线页、亮／暗主题、键盘焦点、窄屏与 WCAG AA 文本对比度
  - [x] 中文构建在 Chrome 154 桌面安装窗口完成原生安装、离线页与手动恢复实测
  - [x] 中文构建在 Android 安装窗口完成 WebAPK 安装、离线页与自动恢复实测
  - [x] 中文构建在 iPhone 安装窗口完成主屏幕安装、离线页、5 秒超时回退与自动恢复实测
  - [x] 补齐桌面亮／暗主题、键盘、文本对比度和窄屏记录；完整 WCAG 门禁另立 proposal
  - [x] 接受并记录 iPhone 恢复联网后短暂 `not registered` 的渐进兼容限制；不计作 Apple 通道通过
- [ ] T5 完成入口恢复的双 Origin、清单状态、离线区别、跳转安全和中英文/UI 验证
  - [x] Chrome 154／153 当前 Origin 单独失效、备用 Origin 可达的自动化场景
  - [x] Android／iPhone 迁移清单、点击前不跳转、跨 Origin 返回路径和撤回
  - [x] Android 整机断网与入口故障不混淆
  - [x] Android 当前 Origin 单独失效、备用 Origin 仍可达的真机场景（Chrome 按 URL 延迟注入）
  - [x] iPhone 当前 Origin 单独失效、备用 Origin 仍可达的真机场景（2026-09-29，路由器按设备屏蔽单域名）
  - [ ] 真实 DNS／证书故障、非法／过期清单和中文 UI 的移动端矩阵
- [x] T6 核对 `/` 与 `/m/`、缓存拒绝、恢复 worker、CSP 与可选 UI 个性化，修复并复测缺陷
  - [x] 桌面 Chrome N/N-1 自动化覆盖 scope 隔离、缓存拒绝和恢复路径
  - [x] 十包 `0.1.0` 分发、独立 Vite 5 消费和最终质量门禁
  - [x] 逐项对账严格 CSP、恢复 worker 和默认更新 UI 个性化的最新候选证据
  - [x] 未发现运行时或公开契约缺陷；严格 CSP 的浏览器证据缺口已补测试并重跑受影响矩阵
- [x] T7 将入口恢复包纳入正式分发并完成十包干净候选、审计、pack、独立消费和文档门禁
- [x] T8 记录发布通道与未取得证据，满足 `desktop` 门禁后发布 npm 正式版并读回验证

## 2026-09-27 生产缺口闭合

- [x] R1 对账现有证据并把 T2–T6 拆成可验证子项
- [x] R2 补齐现有设备可执行的更新、离线、语言和界面场景
  - [x] Android 中文安装失败定位为 manifest 图标实际尺寸不符，修正夹具并完成实机安装／离线／自动恢复
  - [x] 将图标存在性、MIME 与实际尺寸校验加入 Vite 构建，避免业务接入重复踩坑
  - [x] iPhone 中文安装、离线冷启动、离线页与自动恢复实测；记录未配置网络超时的约 60 秒白屏对照
  - [x] iPhone Vue／React 安装窗口完成真实 v1→v2、旧 DOM 保持、用户确认接管与显式刷新
  - [x] iPhone Vue／React 安装窗口完成真实断网下的已下载更新接管与 v2 预缓存启动
  - [x] iPhone Vue／React Safari 完成真实 v1→v2 双标签提示、单点接管与逐标签显式刷新
  - [x] Mac Safari 18.6 Vue／React 安装窗口完成真实 v1→v2 双窗口提示、单点接管与逐窗口显式刷新
  - [x] Android React WebAPK 完成旧 v1 DOM 保持、真实 v2 waiting、确认接管与显式刷新重新取证
- [x] R3 补齐 Android／iPhone 入口恢复的单 Origin 故障分支（iPhone 第 4b、5、6 步按 [iphone-entry-recovery-remaining-drill.md](iphone-entry-recovery-remaining-drill.md) 于 2026-09-29 补测通过）
  - [x] Android React WebAPK 完成当前 Origin 超时、备用 Origin 可达、预缓存恢复页、用户确认跳转与撤回
  - [x] iPhone 完成同等单 Origin 故障分支（2026-09-28 通过第 1、2、3、4a、8 步；2026-09-29 经路由器单域名屏蔽补测 4b `unconfirmed-outage`、5 整机离线不误报、6 过期，均通过，见 verification.md）
- [x] R4 复核交叉边界并关闭仓库内可验证缺口
- [x] R5 形成 Apple 发布通道 Spec／ADR 并经项目所有者评审
  - [x] 形成“0.1.x 暂不新增 Apple 通道、macOS／iPhone 分开记录”的 Spec／ADR-0041 草案
  - [x] 项目所有者接受 ADR-0041；公开文案继续保持“渐进兼容／部分通过”
- [ ] R6 取得第二台 Android 后完成 N/N-1 两机门禁
- [x] 查明 Playwright WebKit 下 React 示例 worker 安装期间页面挂起的根因（2026-09-29：推送面板调用 `PushManager.getSubscription()` 使 Playwright WebKit 的网络进程因不合法 IPC 消息退出；WebKit 上改为替换该方法，19 个用例恢复运行，见 ADR-0042 增补）

## 2026-09-30 桌面三浏览器补证（R7，ADR-0047）

- [x] R7.1 harness：W3C WebDriver 客户端与 `PWA_REAL_BROWSER` fixture、`test:browser:real` 脚本，harness 自身用例在 Safari／Firefox 通过
- [x] R7.2 sw-runtime、client-runtime、examples-browser-e2e 的 `browser-tests` 在真实 Safari／Firefox 运行（行 1、3–9、5a、5e、6–8）
- [x] R7.3 vite `browser-tests`：`setOffline` 改服务器断网后在两款真实浏览器运行（行 2b、4、4a、4c、4d、11、12）
- [x] R7.4 entry-resilience：入口恢复页、中英文、主题在两款真实浏览器运行（行 10、10a、10b、12）
- [x] R7.5 更新提示 UI：`page.route` 改服务器响应规则后在两款真实浏览器运行（行 5b、5c、5d）
- [x] R7.6 本机真实 Edge 完整 `test:browser` 与 Edge 原生安装人工记录（行 2）
- [x] R7.7 Safari 亮／暗主题分次运行（需维护者切换系统外观）
- [ ] R7.8 记录 verification.md、更新跨平台测试证据页，开 PR
