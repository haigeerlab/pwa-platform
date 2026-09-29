---
pageClass: platform-test-matrix
---

# 跨平台测试证据

本页按功能列出每个平台、每个浏览器做过什么验证。核查日期 **2026-09-29**，版本基线为十个公开包 **0.2.3**。每一格只依据仓库中的测试记录；没有记录一律标 ○，不按"代码支持"推断。

## 符号与证据等级

| 符号 | 等级 | 含义 | 能否写成生产保证 |
| --- | --- | --- | --- |
| ● | E4 发布门禁 | 进入 0.2.3 候选门禁：`main` @ `87e40a9` 全新克隆，Chrome 153 全量 281 项浏览器用例通过。0.1.0 发布时另在 Chrome 154 与 153 各跑 228 项 | 仅限桌面 Chrome 的 `desktop` 发布通道 |
| ▲ | E2 自动化 | 真实浏览器自动化但不阻塞发布：Edge 为 CI 的不阻塞任务；Safari／Firefox 列为 Playwright WebKit／Firefox **引擎冒烟**，不等于真实 Safari 或 Firefox | 不能 |
| ◐ | E3 人工观察 | 在记录的真实浏览器或实体设备上操作并观察结果；设备、版本或场景不完整 | 只能声明该设备、版本和场景的结果 |
| ○ | — | 没有记录 | 不能 |
| — | — | 不适用：该浏览器不提供此能力 | — |

同一格既有人工观察又有引擎冒烟时写作"◐ ▲"。"未发布"行的用例虽在自动化里运行，但对应包没有公开，不构成发布证据。

## 测试环境

| 列 | 已记录环境 | 证据定位 |
| --- | --- | --- |
| PC Chrome | macOS；Chrome 153.0.8010.53（0.2.3 候选门禁）；Chrome 154.0.8037.57 与 153.0.8010.53（0.1.0 门禁） | E4，`desktop` 发布通道 |
| PC Edge | CI `edge` 任务，Edge 153.0.4234.48，281/281 | E2，不阻塞；无原生安装人工记录 |
| PC Safari | 真实 macOS Safari 18.6 人工记录；另有 Playwright WebKit 引擎冒烟（0.2.3：126 通过、12 跳过，跳过项均为 Chromium 专有） | E3 + E2 |
| PC Firefox | 仅 Playwright Firefox 引擎冒烟 | E2；无真实 Firefox 记录 |
| Android Chrome | Xiaomi 14（23127PN0CC）与 Samsung Galaxy A24，均为 Android 16 + Chrome 153；Chrome 标签页与已安装 WebAPK | E3；两台都是 Chrome N，缺 N-1，不满足 `desktop+android` 通道 |
| iPhone Safari | iPhone 16 Pro，iOS 27 / Safari 27（2026-09-26 起，更早记录为 iOS 26.6.2）；Safari 标签页与主屏幕网页 App | E3；按 [ADR-0041](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0041-keep-apple-as-progressive-compatibility.md) 属渐进兼容，不设发布通道 |

## 完整验证矩阵

| 功能 | PC Chrome | PC Edge | PC Safari | PC Firefox | Android Chrome | iPhone Safari | 限制与说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1 接入构建与注册** | ● | ▲ | ◐ ▲ | ▲ | ◐ | ◐ | 手机只验证公开示例站；首次访问的页面不受控，重载后受控 |
| **2 安装与独立窗口** | ● | ▲ | ◐ | — | ◐ | ◐ | Mac Safari 为"添加到程序坞"；Android 两台 WebAPK；iPhone 为"添加到主屏幕"；Firefox 桌面无原生安装 |
| 2a 自定义安装按钮 `promptInstall()` | ● | ▲ | — | — | ◐ | — | Safari／Firefox 不触发 `beforeinstallprompt` |
| 2b manifest 快捷方式 | ● | ▲ | ▲ | ▲ | ○ | — | 引擎冒烟只比对 manifest 字段；各平台都没有在系统里实际点击快捷方式的记录 |
| **3 应用壳离线冷启动** | ● | ▲ | ◐ ▲ | ▲ | ◐ | ◐ | 手机为物理断网并结束进程后冷启动 |
| **4 离线页（未缓存导航回退）** | ● | ▲ | ◐ ▲ | ▲ | ◐ | ◐ | 引擎冒烟只证明回退发生，不检查离线页内容 |
| 4a 联网自动恢复 | ● | ▲ | ◐ | ○ | ◐ | ◐ | Safari 断网时 `navigator.onLine` 仍可能为 `true`，恢复依赖 `HEAD` 探针 |
| 4b 导航超时 `networkTimeoutSeconds` | ● | ▲ | ▲ | ▲ | ○ | ◐ | iPhone：不设时物理断网冷启动约 60 秒才回退，设 5 秒后约 5 秒 |
| 4c 离线页中英文 | ● | ▲ | ○ | ○ | ◐ | ◐ | Mac Safari 只见过英文默认页 |
| 4d 离线页亮／暗主题 | ● | ▲ | ○ | ○ | ◐ | ◐ | 手机只有深色截图，没有亮暗对照 |
| **5 用户确认更新** | ● | ▲ | ◐ ▲ | ▲ | ◐ | ◐ | 已验证"等待 → 用户接管 → 旧页面保持 → 显式刷新" |
| 5a 主动／定时检查更新 | ● | ▲ | ▲ | ▲ | ○ | ○ | 手机上只手动调用过浏览器的 `registration.update()`，没有走 `checkForUpdate()` 或 `updateCheck` |
| 5b 默认更新提示 UI | ● | ▲ | ◐ | ○ | ◐ | ◐ | Android 发现：页面已是新代码时仍显示"有可用更新"，待裁决 |
| 5c 更新提示中英文 | ● | ▲ | ○ | ○ | ◐ | ◐ | |
| 5d 更新提示主题／配色 | ● | ▲ | ○ | ○ | ◐ | ◐ | 手机只覆盖自定义绿色主按钮与默认暗色 |
| 5e 多标签页同步 | ● | ▲ | ◐ ▲ | ▲ | ○ | ◐ | iPhone 只在 Safari 标签页验证，主屏幕网页 App 不提供双窗口；Android 无记录 |
| **6 公共读取运行时缓存** | ● | ▲ | ▲ | ▲ | ◐ | ◐ | 手机为标签页手动探针：Android 19/19（断网由服务器重置连接模拟），iPhone 29/29（真实飞行模式）；未覆盖安装形态与弱网 |
| **7 缓存安全拒绝** | ● | ▲ | ▲ | ▲ | ◐ | ◐ | 手机探针使用模拟响应头，不是业务真实接口 |
| **8 登出清理 `logout()`** | ● | ▲ | ▲ | ▲ | ○ | ○ | |
| **9 恢复 worker（紧急下线）** | ● | ▲ | ▲ | ▲ | ◐ | ◐ | Android 两台 × Vue／React 四种组合通过；iPhone 只有 Vue |
| **10 入口恢复页（域名迁移／故障）** | ● | ▲ | ○ | ○ | ◐ | ◐ | 手机做过单 Origin 故障；两端都没有真实 DNS 或证书故障演练 |
| 10a 入口恢复页中英文 | ● | ▲ | ○ | ○ | ◐ | ◐ | iPhone 只有英文 |
| 10b 入口恢复页主题 | ● | ▲ | ○ | ○ | ◐ | ◐ | 手机只有深色截图 |
| **11 同源多应用隔离** | ● | ▲ | ○ | ○ | ○ | ○ | |
| **12 可访问性** | ◐ | ▲ | ○ | ○ | ○ | ○ | 只检查对比度、键盘焦点和 320px 无横向溢出；没有 axe、完整 WCAG 2.1 AA 或读屏测试 |
| 13 Web Push（未发布） | ▲ | ▲ | ○ | ○ | ○ | ○ | 另有真实 FCM 网络套件，仅 Chrome、不阻塞 |
| 14 离线写队列（未发布） | ▲ | ▲ | ▲ | ▲ | ○ | ○ | |
| 15 Nuxt 适配（未发布） | ▲ | ▲ | ○ | ○ | ○ | ○ | |

## 已知限制

### Android

- 两台实体设备都是 Chrome 153，没有 N-1 设备，因此不满足 `desktop+android` 通道的 N/N-1 要求，不能宣称 Android 正式支持。
- 小米从启动器冷启动 WebAPK 时，系统每次询问"想要打开 Chrome"，需选"本次允许"。
- Android 会把同源 HTTPS 链接直接交给已安装的 WebAPK；测试"旧页面保持"时要注意不要被它切换窗口。
- 同一台小米上的 Firefox、夸克没有完成 PWA 安装；小米浏览器能"添加到桌面"并以独立窗口打开。这些只是补充观察。

### iPhone

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

- [0.2.3 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/package-distribution/release-0.2.3.md)
- [0.1.0 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/release-0.1.0.md)
- [正式版验收与真机记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/verification.md)
- [公共读取缓存验证（含手机探针）](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/public-read-cache/verification.md)
- [更新提示 UI 验证](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/update-notice-ui/verification.md)
- [功能证据台账](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/feature-evidence-ledger.md)
- [浏览器矩阵规则](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/browser-matrix.md)
- [桌面发布通道 ADR](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0030-desktop-release-channel.md)
