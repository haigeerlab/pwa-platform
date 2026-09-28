# ADR-0042：不阻塞门禁的 WebKit 与 Firefox 引擎冒烟

## 状态

已接受（2026-09-28，项目所有者决定）。部分修订 [ADR-0010](0010-real-browser-verification-with-playwright.md) 中“不执行 `playwright install`，不下载浏览器”一条；其余决定不变。

## 背景

[ADR-0010](0010-real-browser-verification-with-playwright.md) 让真实浏览器验证只使用 runner 预装的 Google Chrome，不引入新的下载源。因此到 2026-09-27 为止，所有 L3 证据都只来自 Chrome 桌面端；[浏览器矩阵](../architecture/browser-matrix.md)渐进兼容档中的 Safari 与 Firefox，只能靠人工与真机记录发现差异（架构审查风险 R6）。

2026-09-28 的试跑表明，只要把网络故障改由 fixture 服务器制造（[spec/browser-test-harness.md](../../spec/browser-test-harness.md)“增补：服务器端断网与网络故障”），sw-runtime 套件在 Playwright 自带的 WebKit 与 Firefox 上即可覆盖离线、恢复、运行时缓存与网络超时场景：51 个用例中，每个引擎各有 4 个依赖 Chromium 专有能力（CDP 推送、worker 控制台转发），其余全部通过。

Playwright 驱动的 WebKit 与 Firefox 都是打过补丁的专用构建，系统安装的 Safari、Firefox 不能替代，只能从 Playwright 的官方 CDN（`cdn.playwright.dev`）下载。

## 决定

- **批准一个新下载源**：Playwright 官方 CDN 上、与仓库锁定的 `@playwright/test` 版本配套的 WebKit 与 Firefox 构建。浏览器版本随 Playwright 版本一起变更，升级按[依赖变更流程](../operations/dependency-changes.md)审阅；不接受其他来源的浏览器二进制。
- **新增门禁命令 `pnpm test:browser:engines`，不阻塞。** 它在两个引擎上运行已接入的包（起步只有 sw-runtime），失败只记录、不改变门禁结论，与依赖审计同一档（[ADR-0031](0031-local-gate-substitute-for-ci.md) 的 `blocking: false`）。CI 以单独的 job 运行，失败不影响必需检查。
- **Chrome 仍是唯一阻塞的真实浏览器。** `pnpm test:browser` 与 ADR-0010 的 Chrome 渠道规则不变。
- **结果只记为引擎冒烟。** 证据写作“WebKit 引擎（Playwright x.y）”与“Firefox（Playwright x.y）”，归入浏览器矩阵的渐进兼容档，不能写成 Safari、iOS 或 Firefox 稳定版的兼容证据（与 [ADR-0041](0041-keep-apple-as-progressive-compatibility.md) 一致）。
- **Chromium 专有的用例显式跳过。** 依赖 CDP 或 worker 控制台转发的用例在非 Chromium 项目中以 `test.skip` 跳过并写明原因，不得静默删除或放宽断言。

## 备选方案

- **只在维护者本机手动运行。** 不采用：不进门禁的检查很快会停止运行，本次审查已发现两个无人调用的测试套件。
- **纳入并阻塞门禁。** 不采用：Playwright 的 WebKit 不等于 Safari，把它设为阻塞会让一个非目标浏览器的差异挡住发布；需要先积累稳定性数据。
- **维持只测 Chrome。** 不采用：试跑证明低成本即可取得有意义的跨引擎信号。

## 影响

- CI 新增一个不阻塞的 job，会下载约 200 MB 浏览器（Linux 另装系统依赖）；本地首次运行同样需要下载。
- 升级 Playwright 时，需同时确认两个引擎的冒烟结果，并在依赖变更 PR 中写明。
- 其他包按需接入：接入前先把浏览器侧的网络模拟改为服务器端故障。
- 两个引擎连续稳定后，是否提升为阻塞，需新的 ADR 决定。

## 增补：CI 中的触发时机（2026-09-28，项目所有者决定）

为减少每个 PR 的 CI 耗时，引擎冒烟 job 不再在 pull request 上运行，改为在推送到 `main`（即每次合并后）、每晚定时（UTC 18:17）和手动触发时运行。本地门禁中的 `pnpm test:browser:engines` 不变。
