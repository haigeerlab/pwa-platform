# ADR-0047：本机真实 Safari 与 Firefox 的 WebDriver 运行

## 状态

已接受（2026-09-30，项目所有者决定）。补充 [ADR-0042](0042-non-blocking-webkit-and-firefox-engine-smoke.md) 与 [ADR-0044](0044-non-blocking-edge-smoke.md)；不修改 [ADR-0030](0030-desktop-release-channel.md) 的发布通道定义，也不修改 [ADR-0041](0041-keep-apple-as-progressive-compatibility.md) 的渐进兼容口径。

## 背景

到 2026-09-29，[跨平台测试证据](../../website/reference/platform-test-matrix.md)中 PC Safari 与 PC Firefox 两列的自动化证据全部来自 Playwright 自带的 WebKit／Firefox 专用构建（ADR-0042），它们不等于系统安装的 Safari 或 Firefox 稳定版；vite、entry-resilience 与更新提示 UI 套件从未在非 Chromium 浏览器上运行，入口恢复页、同源多应用隔离、离线页与更新提示的语言和主题等格子没有任何记录。

Playwright 不能驱动系统安装的 Safari 与 Firefox。两者都提供 W3C WebDriver：macOS 自带 `safaridriver`，Firefox 由 Mozilla 的 `geckodriver` 提供。现有用例的断言几乎都经 `page.evaluate` 读取 `navigator.serviceWorker` 与 `caches`，网络故障由 fixture 服务器在进程内制造，与浏览器驱动方式无关。

## 决定

- **在 `@pwa-platform/browser-test-harness` 中新增一个薄的 W3C WebDriver 适配层。** 设置 `PWA_REAL_BROWSER=safari|firefox` 时，harness 以 WebDriver 会话替换 Playwright 的 `browser` 与 `page` fixture，只实现用例实际使用的操作子集（导航、执行脚本、重载、轮询等待、同会话新标签页、读取文本）；调用未实现的 Playwright 能力时立即报出明确错误，不静默降级。
- **不新增 npm 依赖。** 客户端直接用 Node 内置 `fetch` 实现 W3C WebDriver HTTP 协议；`safaridriver` 随 macOS 提供，`geckodriver` 由维护者本机安装（Homebrew），二者都不进入仓库或 CI。
- **只在 macOS 本机运行，不阻塞，不进 CI。** 新增 `test:browser:real` 脚本，失败只记录。Chrome 仍是唯一阻塞的真实浏览器。Safari 同一时间只允许一个自动化会话，因此串行运行。
- **不可移植的用例改写或显式跳过，不放宽断言。** 浏览器侧 `context.setOffline` 改为 fixture 服务器的 `goOffline`；`page.route` 改为 fixture 服务器的响应规则；假时钟改为真实短间隔。颜色方案模拟：Firefox 用配置项强制，Safari 由维护者手动切换系统外观后分次运行；做不到的用例以 `test.skip` 跳过并写明原因。改写后的用例必须在阻塞的 Chrome 门禁中继续通过。
- **证据口径。** 结果记为“macOS Safari x.y（safaridriver）”“Firefox x.y（geckodriver）”的本机真实浏览器自动化证据，写入对应模块的 verification.md，并在跨平台矩阵中注明来源；它不是发布门禁，不能写成 Safari 或 Firefox 的生产支持承诺。

## 备选方案

- **一次性脚本取证。** 不采用：结果无法在下个版本复跑，证据会很快过期。
- **引入 WebdriverIO 或 selenium-webdriver。** 不采用：用例只需要协议中很小的子集，一个依赖会带来大量传递依赖与审阅成本。
- **继续只用 Playwright 引擎冒烟。** 不采用：无法回答“真实 Safari、Firefox 上是否可用”，而这正是矩阵中剩余的缺口。

## 影响

- 维护者运行前需安装 `geckodriver`，并在 Safari 中允许远程自动化（`safaridriver --enable`，一次性）。
- 运行期间 Safari 窗口会出现在屏幕上，不能同时手动使用 Safari。
- 接入新包前，先把浏览器侧网络模拟改为服务器端故障（与 ADR-0042 相同的前提）。
- 是否把真实浏览器运行提升为阻塞，或在 macOS CI runner 上运行，需要新的 ADR。
