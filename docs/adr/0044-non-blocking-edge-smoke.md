# ADR-0044：不阻塞门禁的 Microsoft Edge 冒烟

## 状态

已接受（2026-09-29，项目所有者决定；2026-09-28 增量复审建议 #15）。部分修订 [ADR-0010](0010-real-browser-verification-with-playwright.md)“只使用 runner 预装的 Google Chrome”一条；其余决定不变。

## 背景

到 2026-09-29 为止，桌面浏览器中只有 Chrome 有阻塞门禁的真实浏览器证据；WebKit 与 Firefox 只有 Playwright 自带引擎的不阻塞冒烟（[ADR-0042](0042-non-blocking-webkit-and-firefox-engine-smoke.md)），桌面 Edge 完全没有记录（[2026-09-28 增量复审](../review/2026-09-28/03-evidence-delta.md)“浏览器/设备覆盖总表”）。

GitHub Actions 的 Ubuntu 24.04 runner 镜像预装 Microsoft Edge 稳定版（镜像 20260920 为 Edge 153，与 Chrome 153 同代），Playwright 可以用 `channel: "msedge"` 直接驱动它，不需要任何新的下载源。Edge 与 Chrome 同属 Chromium，现有 Chrome 套件（包括依赖 CDP 的用例）不经改写即可在 Edge 上运行。

## 决定

- **所有 `test:browser` 使用的 Playwright 配置支持 `PWA_BROWSER_CHANNEL` 覆盖浏览器通道**，未设置时仍为 `chrome`，本地与阻塞门禁的行为不变。
- **CI 新增不阻塞的 `edge` job**：以 `PWA_BROWSER_CHANNEL=msedge` 运行完整的 `pnpm test:browser`，与 `engines` 相同，只在推送到 `main`、每晚定时和手动触发时运行，不在 pull request 上运行；失败时上传 trace。
- **不加入本地门禁命令**：维护者本机通常没有安装 Edge，加入后会在本地恒定失败，没有信息量。需要时可在装有 Edge 的机器上手动设置该变量运行。
- **证据口径**：与 ADR-0042 的引擎冒烟不同，这里运行的是 Edge 稳定版本身，结果可记为“桌面 Edge 稳定版（runner 版本）”的自动化证据；但它不阻塞发布，也不改变 [ADR-0030](0030-desktop-release-channel.md) 中 `desktop` 通道以 Chrome 为准的门禁定义。
- **Chrome 仍是唯一阻塞的真实浏览器。**

## 备选方案

- **纳入并阻塞门禁。** 不采用：Edge 不是 V1 发布通道的目标浏览器，先积累稳定性数据；是否提升为阻塞需新的 ADR。
- **只挑部分包运行。** 不采用：Edge 与 Chrome 同内核，完整套件无需改写，额外成本只是一次约 5 分钟的 job。
- **在本机安装 Edge 后手动运行。** 不采用：不进门禁的检查很快会停止运行（ADR-0042 的同一理由）。

## 影响

- `main` 的每次合并和每晚定时多一个约 5 分钟的不阻塞 job，不下载浏览器。
- runner 镜像升级 Edge 时版本随之变化；证据记录写明当次 job 打印的 Edge 版本。
- 若 Edge 与 Chrome 出现差异，按 ADR-0042 的规则处理：不静默删除或放宽断言，差异写入证据台账。
