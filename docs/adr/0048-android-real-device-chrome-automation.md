# ADR-0048：真机 Android Chrome 的本机自动化运行

## 状态

已接受（2026-09-30，项目所有者决定）。补充 [ADR-0047](0047-local-real-safari-and-firefox-webdriver-runs.md)；不修改 [ADR-0030](0030-desktop-release-channel.md) 的发布通道定义，`desktop+android` 通道的 N/N-1 两机要求不变。

## 背景

到 2026-09-30，[跨平台测试证据](../../website/reference/platform-test-matrix.md)中 Android Chrome 一列只有人工观察（◐）与手动探针，没有任何自动化证据；登出清理、同源多应用隔离、多标签页同步、定时检查更新、导航与运行时缓存超时、`served-from-cache` 事件、页面已是新代码判定和可访问性都没有记录。[浏览器发布证据](../operations/browser-release-evidence.md)规定模拟器不能替代真机观察。

2026-09-30 的试跑表明：手机开启 USB 调试后，Android Chrome 本身在抽象套接字 `chrome_devtools_remote` 上提供 DevTools 协议（`chrome://inspect` 使用的同一端口）。经 `adb forward` 转发后，Playwright 的 `chromium.connectOverCDP` 可直接连接实体设备上的 Chrome 153，并能创建独立的浏览器上下文（须 `viewport: null`，Android 不允许改窗口尺寸），`setOffline`、`route` 与 CDP 会话都可用；fixture 服务器端口经 `adb reverse` 映射后以 `http://localhost:<port>` 访问，为安全上下文，Service Worker 注册、接管与服务器端断网均正常。

Playwright 自带的 `android.launchBrowser()` 需要在 Chrome 的 `chrome://flags` 中开启“Enable command line on non-rooted devices”，该开关允许任何能写 `/data/local/tmp` 的程序向 Chrome 注入启动参数，不采用。

## 决定

- **在 `@pwa-platform/browser-test-harness` 中新增真机 Android 模式。** 设置 `PWA_ANDROID_SERIAL=<adb 序列号>` 时，harness 以 `adb forward` 连接该设备 Chrome 的 `chrome_devtools_remote`，经 `connectOverCDP` 接管 Playwright 的 `browser` fixture；每个测试在新建的独立浏览器上下文（`viewport: null`）中运行，结束时关闭该上下文；每个 fixture 服务器端口在启动时 `adb reverse`、关闭时撤销。不修改手机上的 Chrome 设置，不读写日常浏览上下文。
- **不新增 npm 依赖。** 只使用仓库已锁定的 Playwright 与本机 `adb`。
- **只在维护者本机运行，不进 CI、不阻塞。** 新增 `test:browser:android` 脚本，串行运行（一台设备一次一个会话），失败只记录。Chrome 桌面端仍是唯一阻塞的真实浏览器。
- **Chromium 用例原样复用。** 依赖桌面专有能力的用例（窗口尺寸、原生安装提示 `beforeinstallprompt` 的 CDP 可安装性检查等）在 Android 模式下以 `test.skip` 写明原因跳过或改写，不放宽断言；改写后的用例必须在阻塞的 Chrome 门禁中继续通过。
- **证据口径。** 结果记为“Android x + Chrome x.y（设备型号，USB CDP）”的真机自动化证据（▲），写入 verification.md 并在跨平台矩阵中注明。它只证明该设备与 Chrome 版本上的行为；安装为 WebAPK、从桌面图标启动等系统界面操作仍依赖人工观察（◐）。单台设备、单一 Chrome 版本的结果不能填作 `desktop+android` 通道的 N/N-1 通过证据。

## 备选方案

- **`android.launchBrowser()`。** 不采用：需要在用户手机上开启允许注入 Chrome 启动参数的开关。
- **继续只做人工观察与手动探针。** 不采用：覆盖面窄、不可重复，矩阵中大量 ○ 无法关闭。
- **Android 模拟器。** 不采用：项目规则不接受模拟器替代真机证据。

## 影响

- 维护者运行前需以 USB 连接手机并开启 USB 调试，运行期间保持屏幕常亮、解锁；Chrome 会在前台自行开关标签。
- 测试只访问 `localhost` 上的临时端口，并在独立上下文中运行；手机日常浏览数据不受影响。
- Chrome Android 自动更新后，记录中的版本随之变化；N-1 仍按 ADR-0030 与两机轮换规则取得。
