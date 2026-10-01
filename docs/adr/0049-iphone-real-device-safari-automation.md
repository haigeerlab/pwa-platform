# ADR-0049：真机 iPhone Safari 的本机自动化运行

## 状态

已接受（2026-10-01，项目所有者决定）。补充 [ADR-0047](0047-local-real-safari-and-firefox-webdriver-runs.md) 与 [ADR-0048](0048-android-real-device-chrome-automation.md)；不修改 [ADR-0041](0041-keep-apple-as-progressive-compatibility.md)：iPhone 仍属渐进兼容，不设发布通道。

## 背景

到 2026-10-01，[跨平台测试证据](../../website/reference/platform-test-matrix.md)中 iPhone Safari 一列只有人工观察（◐）与手动探针，登出清理、同源多应用隔离、定时检查更新、`served-from-cache` 事件、页面已是新代码判定、运行时缓存超时与可访问性等仍为 ○。项目规则不接受模拟器替代真机证据。

2026-10-01 试跑：macOS 自带的 `safaridriver` 以 `platformName: "iOS"` 与 `safari:deviceUDID` 可驱动经 USB 连接、开启“远程自动化”的 iPhone 16 Pro（iOS 27.0.1）上的真实 Safari。难点是安全上下文：iPhone 访问 Mac 上的 fixture 服务器只能经局域网 IP，而 `http://<IP>` 不是安全上下文，Service Worker 无法注册；也没有 Android `adb reverse` 那样把手机 `localhost` 映射到 Mac 的办法。

经试跑验证的做法：Mac 生成一份只用于测试、有效期一天的根证书，项目所有者在 iPhone 上安装并开启“完全信任”；Mac 上为局域网 IP 签发服务器证书，在 fixture 服务器前加一层**只监听局域网 IP** 的 HTTPS 转发（改写 `Host` 以通过 fixture 的主机检查）。页面为安全上下文，Service Worker 注册并接管；fixture 服务器断网时转发层直接断开客户端连接，iPhone 得到真正的网络错误。

被否决的做法：Cloudflare 临时隧道。它把本机服务暴露到公网（需要单独授权），且源站断开时隧道返回 HTTP 502 而不是网络错误（[公共读取缓存验证](../../tasks/public-read-cache/verification.md)已记录），服务器端断网用例无法取证。

## 决定

- **在 `@pwa-platform/browser-test-harness` 中新增真机 iPhone 模式。** 设置 `PWA_IOS_UDID=<UDID>`、`PWA_IOS_LAN_IP=<Mac 局域网 IP>`、`PWA_IOS_TLS_DIR=<含 server.key/server.crt 的目录>` 时，复用 ADR-0047 的 WebDriver 适配层，以 `platformName: "iOS"` 连接该设备的 Safari；每个 fixture 服务器启动时附带一个只监听局域网 IP 的 HTTPS 转发（随机端口），`fixtureServer.url()` 返回 `https://<IP>:<端口>`，关闭时一并关闭。与其他真实浏览器模式互斥。
- **不新增 npm 依赖**；证书与私钥只存在于维护者本机的临时目录，不进仓库。根证书的安装、信任与测试后的删除由项目所有者在 iPhone 上完成。
- **会话必须正常结束。** 先删除 WebDriver 会话再停止 `safaridriver`；异常中断会让 iOS 自动关闭“远程自动化”。每个测试结束前注销该来源的 Service Worker、清空其缓存与存储，避免在项目所有者的 Safari 中留下数据。
- **只在维护者本机运行，不进 CI、不阻塞。** 新增 `test:browser:ios` 脚本，串行运行。
- **能力边界与 macOS Safari 相同**：WebDriver 拿不到响应头与导航状态、不能模拟配色、不能在页面脚本之前注入代码，这些检查沿用 ADR-0047 的跳过或“无法验证”标注；主屏幕网页 App 等系统界面形态仍依赖人工观察。
- **证据口径**：结果记为“iPhone 型号 + iOS／Safari 版本（USB WebDriver，局域网 HTTPS）”的真机自动化证据（▲），不改变 ADR-0041 的渐进兼容结论。

## 影响

- 运行前须：iPhone 经 USB 连接并解锁、保持亮屏；开启“网页检查器”与“远程自动化”；与 Mac 处于同一 Wi‑Fi；测试根证书已安装且开启完全信任。macOS 首次运行可能询问是否允许 node 接受传入连接。
- 测试根证书有效期一天，过期需重新生成并重新安装；测试结束后由项目所有者在“VPN 与设备管理”中删除。
- 转发层只监听局域网 IP，同一网络中的其他设备在测试期间可以访问测试页（内容只有 fixture 假页面）。
