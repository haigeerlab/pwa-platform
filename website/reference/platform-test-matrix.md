---
pageClass: platform-test-matrix
---

# 跨平台测试证据

本页按功能列出每个平台、每个浏览器做过什么验证。核查日期 **2026-09-30**。PC Chrome 的发布门禁基线为十个公开包 **0.2.5**；PC Edge／Safari／Firefox 的本机真实浏览器运行基于 0.2.4 发布后的 `main`（产品代码未改动）。每一格只依据仓库中的测试记录；没有记录一律标 ○，不按"代码支持"推断。

## 符号与证据等级

| 符号 | 等级 | 含义 | 能否写成生产保证 |
| --- | --- | --- | --- |
| ● | E4 发布门禁 | 进入 0.2.5 候选门禁：`release/0.2.5` @ `6fc9553` 全新克隆，Chrome 154 全量 295 项浏览器用例通过（0.2.4 为 289 项；0.2.3 为 Chrome 153 的 281 项；0.1.0 另在 Chrome 154 与 153 各跑 228 项） | 仅限桌面 Chrome 的 `desktop` 发布通道 |
| ▲ | E2 自动化 | 真实浏览器自动化但不阻塞发布：Edge 为 CI 不阻塞任务与本机 Edge 154 全量运行；Safari／Firefox 为本机系统浏览器经 WebDriver 运行（[ADR-0047](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0047-local-real-safari-and-firefox-webdriver-runs.md)）；Android 为实体设备上的 Chrome 经 USB 调试端口运行（[ADR-0048](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0048-android-real-device-chrome-automation.md)）；iPhone 为实体设备上的 Safari 经 USB WebDriver 与局域网 HTTPS 运行（[ADR-0049](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0049-iphone-real-device-safari-automation.md)）。Playwright 自带 WebKit／Firefox 的引擎冒烟不是真实浏览器，不计入格子 | 不能 |
| ◐ | E3 人工观察 | 在记录的真实浏览器或实体设备上操作并观察结果；设备、版本或场景不完整 | 只能声明该设备、版本和场景的结果 |
| ○ | — | 没有记录 | 不能 |
| — | — | 不适用：该浏览器不提供此能力 | — |

同一格既有人工观察又有自动化时写作"◐ ▲"。**表内 ●、◐、▲ 都表示在所记录的环境中测试通过**，差别只在证据强度；若出现失败，以 ✕ 单独标出并在说明中写明（当前没有）。○ 只表示没有记录，不等于不能用。"未发布"行的用例虽在自动化里运行，但对应包没有公开，不构成发布证据。

## 测试环境

| 列 | 已记录环境 | 证据定位 |
| --- | --- | --- |
| PC Chrome | macOS；Chrome 154.0.8037.59（0.2.5 候选门禁）；Chrome 154.0.8037.58（0.2.4 候选门禁）；Chrome 153.0.8010.53（0.2.3 候选门禁）；Chrome 154.0.8037.57 与 153.0.8010.53（0.1.0 门禁） | E4，`desktop` 发布通道 |
| PC Edge | CI `edge` 任务，Edge 153.0.4234.48，281/281；本机 macOS 15.7.3 + Edge 154.0.4258.37 全量 `test:browser`，另有 Vue／React 原生安装、独立窗口与离线冷启动人工观察 | E2 + E3，不阻塞 |
| PC Safari | macOS 15.7.3 + Safari 18.6：人工记录，以及经 `safaridriver` 的本机真实浏览器自动化（亮／暗主题分别在系统浅色、深色外观下运行）；另有 Playwright WebKit 引擎冒烟 | E3 + E2 |
| PC Firefox | macOS 15.7.3 + Firefox 157.0：经 `geckodriver` 0.37.1 的本机真实浏览器自动化（headless）；另有 Playwright Firefox 引擎冒烟 | E2；无人工记录 |
| Android Chrome | Xiaomi 14（23127PN0CC）与 Samsung Galaxy A24，均为 Android 16 + Chrome 153；Chrome 标签页与已安装 WebAPK 人工观察；另在 Xiaomi 14 上经 USB 调试端口对真机 Chrome 153 运行全部浏览器用例（[ADR-0048](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0048-android-real-device-chrome-automation.md)） | E3 + E2；两台都是 Chrome N，缺 N-1，不满足 `desktop+android` 通道 |
| iPhone Safari | iPhone 16 Pro，iOS 27 / Safari 27（2026-09-26 起，更早记录为 iOS 26.6.2）；Safari 标签页与主屏幕网页 App；另在同一台 iPhone 16 Pro（iOS 27.0.1）上经 USB WebDriver 与局域网 HTTPS 对真实 Safari 运行全部浏览器用例（[ADR-0049](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0049-iphone-real-device-safari-automation.md)） | E3 + E2；按 [ADR-0041](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0041-keep-apple-as-progressive-compatibility.md) 属渐进兼容，不设发布通道 |

## 完整验证矩阵

| 功能 | PC Chrome | PC Edge | PC Safari | PC Firefox | Android Chrome | iPhone Safari | 限制与说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1 接入构建与注册** | ● | ◐ ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | 手机只验证公开示例站；首次访问的页面不受控，重载后受控 |
| **2 安装与独立窗口** | ● | ◐ ▲ | ◐ | — | ◐ | ◐ | Mac Safari 为"添加到程序坞"；Edge 为"将此站点作为应用安装"；Android 两台 WebAPK；iPhone 为"添加到主屏幕"；Firefox 桌面无原生安装 |
| 2a 自定义安装按钮 `promptInstall()` | ● | ▲ | — | — | ◐ | — | Safari／Firefox 不触发 `beforeinstallprompt` |
| 2b manifest 快捷方式 | ● | ▲ | ▲ | ▲ | ▲ | — | 真实 Safari／Firefox 只比对页面拿到的 manifest 字段与图标，看不到浏览器的解析结果；各平台都没有在系统里实际点击快捷方式的记录 |
| **3 应用壳离线冷启动** | ● | ◐ ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | 手机与 Edge 安装窗口为物理断网后冷启动 |
| **4 离线页（未缓存导航回退）** | ● | ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | 桌面自动化的断网由测试服务器制造 |
| 4a 联网自动恢复 | ● | ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | Safari 断网时 `navigator.onLine` 仍可能为 `true`，恢复依赖 `HEAD` 探针；真实 Safari／Firefox 自动化以"不发 online 事件时由探针恢复"为主证据 |
| 4b 导航超时 `networkTimeoutSeconds` | ● | ▲ | ▲ | ▲ | ▲ | ◐ ▲ | iPhone：不设时物理断网冷启动约 60 秒才回退，设 5 秒后约 5 秒 |
| 4c 离线页中英文 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | |
| 4d 离线页亮／暗主题 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | Safari 在系统浅色、深色外观下各跑一次；手机只有深色截图，没有亮暗对照 |
| **5 用户确认更新** | ● | ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | 已验证"等待 → 用户接管 → 旧页面保持 → 显式刷新" |
| 5a 主动／定时检查更新 | ● | ▲ | ▲ | ▲ | ▲ | ▲ | 真实 Safari／Firefox 以 60 秒真实间隔验证定时检查；手机上只手动调用过浏览器的 `registration.update()` |
| 5b 默认更新提示 UI | ● | ▲ | ◐ ▲ | ▲ | ◐ ▲ | ◐ ▲ | 真实浏览器上 30 分钟再提醒只验证机制，不验证间隔值；Android 发现：页面已是新代码时仍显示"有可用更新"，待裁决 |
| 5c 更新提示中英文 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | |
| 5d 更新提示主题／配色 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | 手机只覆盖自定义绿色主按钮与默认暗色 |
| 5e 多标签页同步 | ● | ▲ | ◐ ▲ | ▲ | ▲ | ◐ ▲ | iPhone 只在 Safari 标签页验证，主屏幕网页 App 不提供双窗口；Android 为 Chrome 标签页自动化，WebAPK 未验证 |
| 5f 页面已是新代码判定（[ADR-0046](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0046-update-notice-detects-current-page.md)） | ● | ▲ | ▲ | ▲ | ▲ | ▲ | 页面已是新代码时默认提示换用 `currentTitle`／`currentBody` 文案、接管后不再提示刷新；检查失败回退普通提示。Android、iPhone 均为修复后的真机自动化 |
| **6 公共读取运行时缓存** | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | 手机为标签页手动探针：Android 19/19（断网由服务器重置连接模拟），iPhone 29/29（真实飞行模式）；未覆盖安装形态与弱网 |
| 6a 缓存命中通知 `served-from-cache` 事件 | ● | ▲ | ▲ | ▲ | ▲ | ▲ | `reason` 的三个取值（断网 `network-failed`、超时 `network-timeout`、SWR `stale-while-revalidate`）各有用例，每次缓存应答恰好一个事件；页面晚订阅时导航命中经查询补发。Android、iPhone 均为真机自动化 |
| 6b 运行时缓存网络超时 | ● | ▲ | ▲ | ▲ | ▲ | ▲ | `network-first` 的数据与动态页面在 `networkTimeoutSeconds` 后回退缓存（导航回退见 4b）；Android、iPhone 均为真机自动化（服务器挂起请求）；真实弱网未测 |
| **7 缓存安全拒绝** | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | 真实 Safari／Firefox 上带 `Authorization` 的导航与配额用例跳过（WebDriver 不能加请求头；配额需 CDP）；手机探针使用模拟响应头 |
| **8 登出清理 `logout()`** | ● | ▲ | ▲ | ▲ | ▲ | ▲ | |
| **9 恢复 worker（紧急下线）** | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | Android 两台 × Vue／React 四种组合通过；iPhone 只有 Vue |
| **10 入口恢复页（域名迁移／故障）** | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | 桌面为双 Origin 测试服务器故障；手机做过单 Origin 故障；都没有真实 DNS 或证书故障演练 |
| 10a 入口恢复页中英文 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | iPhone 只有英文 |
| 10b 入口恢复页主题 | ● | ▲ | ▲ | ▲ | ◐ ▲ | ◐ ▲ | 手机只有深色截图 |
| **11 同源多应用隔离** | ● | ▲ | ▲ | ▲ | ▲ | ▲ | |
| **12 可访问性** | ◐ | ▲ | ▲ | ▲ | ▲ | ▲ | 只检查对比度、键盘焦点和 320px 无横向溢出；Safari 默认 Tab 不聚焦按钮，以 Option+Tab 验证；Firefox 窗口最窄 500px，320px 未验证；没有 axe、完整 WCAG 2.1 AA 或读屏测试 |
| 13 Web Push（未发布） | ▲ | ▲ | ○ | ○ | ▲ | ○ | 另有真实 FCM 网络套件，仅 Chrome、不阻塞；iPhone 自动化确认 Safari 标签页不提供 <code>PushManager</code>（<code>getPushState</code> 为 <code>unsupported</code>），主屏幕网页 App 未测 |
| 14 离线写队列（未发布） | ▲ | ▲ | ▲ | ▲ | ▲ | ▲ | |
| 15 Nuxt 适配（未发布） | ▲ | ▲ | ○ | ○ | ▲ | ▲ | |

## 已知限制

### 桌面 Edge、Safari、Firefox

- 三者都不阻塞发布，`desktop` 通道仍只以 Chrome 为准（[ADR-0030](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0030-desktop-release-channel.md)）。Safari／Firefox 的真实浏览器运行只在维护者本机执行，不进 CI。
- WebDriver 拿不到导航的响应头与 HTTP 状态，也无法在页面脚本之前注入代码；依赖这些的检查在真实 Safari／Firefox 上标注为"无法验证"，不计为通过，其中包括严格 CSP 的"零违规"事件与 Safari 的导航状态码。
- Safari 与 Firefox 都分不清"worker 转发的网络响应"和"直接网络响应"，因此只有完全不经网络的响应能证明来自 Service Worker。
- Safari 18.6 默认设置下 Tab 键跳过按钮（系统"按 Tab 键高亮每个项目"未开启），这是浏览器默认行为，不是平台缺陷。
- Safari 离线页"过早 online 事件等待真实联网"用例在约 13 次运行中偶发超时 1 次，重复 8 次均通过。


### Android

- 2026-09-30 起，Xiaomi 14（Android 16，Chrome 153.0.8010.53）经 USB 调试端口运行全部浏览器用例（ADR-0048），每个测试在独立浏览器上下文中进行，不接触手机日常浏览数据；只跳过依赖桌面浏览器配置文件的真实 `beforeinstallprompt` 两项。安装为 WebAPK、从桌面图标启动仍只有人工观察。自动化的视口尺寸与配色由 CDP 仿真，不等于系统设置切换。
- 手机与电脑的时钟相差约 0.5 秒，比较时间的用例改用浏览器自己的时钟。运行期间手机必须解锁且 Chrome 在前台，锁屏后系统会结束 Chrome、断开调试端口。
- 两台实体设备都是 Chrome 153，没有 N-1 设备，因此不满足 `desktop+android` 通道的 N/N-1 要求，不能宣称 Android 正式支持。
- 小米从启动器冷启动 WebAPK 时，系统每次询问"想要打开 Chrome"，需选"本次允许"。
- Android 会把同源 HTTPS 链接直接交给已安装的 WebAPK；测试"旧页面保持"时要注意不要被它切换窗口。
- 同一台小米上的 Firefox、夸克没有完成 PWA 安装；小米浏览器能"添加到桌面"并以独立窗口打开。这些只是补充观察。

### iPhone

- 2026-10-01 起，iPhone 16 Pro（iOS 27.0.1，Safari 27.0.1）经 USB WebDriver 与只监听局域网 IP 的 HTTPS 转发运行全部浏览器用例（ADR-0049），测试根证书由项目所有者安装并信任，测试后删除；每个测试新开会话并清理该来源的 worker、缓存与存储。跳过与“无法验证”与 macOS Safari 相同（响应头、导航状态、配色模拟、CDP），另有：亮／暗主题只在浅色外观下运行；视口不可调整（<code>setWindowRect</code> 不支持），320px 未验证；Safari 标签页不提供 Web Push。安装为主屏幕网页 App 仍只有人工观察。
- 自动化中观察到：导航失败时 iOS 错误页地址为 <code>data:text/html,</code>；受控页面的 worker 以关闭方式拒绝导航时，iOS 保留上一页面、不显示错误；同一 Safari 进程连续新建约 150–250 个会话后 IndexedDB 与 Cache Storage 写入失败，需重启 Safari（自动化在每个包开始前重启 Safari 规避）。
- 未发布的 Nuxt 适配中，断网后导航到预渲染子页 <code>/app/about</code> 在 iPhone 上不提交导航、请求不到达服务器（Chrome 正常），原因未查明，该用例在 iPhone 上跳过并记录。
- 不设 `networkTimeoutSeconds` 时，物理断网冷启动约 60 秒才回退；生产接入不能依赖 Safari 自行超时。
- 断网恢复后页面曾短暂显示 `not registered`。平台侧根因（`register()` 排在挂起的更新检查之后）已在 0.2.3 由 [ADR-0043](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0043-registered-from-existing-active-registration.md) 修复，修复版在真机上在线、离线都正常；界面层现象本轮未能复现，仍需后续观察。
- Safari 真实断网时 `navigator.onLine` 可能仍为 `true`，请求会挂起而不是立即失败，因此离线页使用真实网络探针。
- 主屏幕网页 App 首次启动时页面不受控，在线重载后才受控。

### 两端共有

- 没有真实 DNS 或证书故障演练。
- 弱网（请求挂起）场景在公共读取缓存的手机探针里没有覆盖。
- 浏览器自动化里的"断网"由测试服务器制造，与真实网络中断的表现可能不同。

## 对接入项目的意义

本页回答的是"这套库在记录的环境里做过什么测试"，不是"你的业务站点已经通过"。接入方仍须验证自己的生产身份、Origin、挂载路径、scope、响应头、公共响应分类、旧资源保留、v1→v2 更新、回滚、离线和事故恢复。执行顺序见[上线前检查](/start/checklist)，服务端配置见[服务器与 CDN 配置](/operations/hosting)。

## 原始记录

- [0.2.5 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/package-distribution/release-0.2.5.md)
- [0.2.4 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/package-distribution/release-0.2.4.md)
- [0.2.3 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/package-distribution/release-0.2.3.md)
- [0.1.0 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/release-0.1.0.md)
- [正式版验收与真机记录（含 R7 桌面 Edge／Safari／Firefox）](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/verification.md)
- [本机真实 Safari 与 Firefox 的 WebDriver 运行 ADR](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0047-local-real-safari-and-firefox-webdriver-runs.md)
- [公共读取缓存验证（含手机探针）](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/public-read-cache/verification.md)
- [更新提示 UI 验证](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/update-notice-ui/verification.md)
- [功能证据台账](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/feature-evidence-ledger.md)
- [浏览器矩阵规则](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/browser-matrix.md)
- [桌面发布通道 ADR](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0030-desktop-release-channel.md)
