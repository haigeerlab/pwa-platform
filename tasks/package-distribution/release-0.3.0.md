# npm 发布记录：0.3.0

> 状态：候选验证中；npm 和最终文档站尚未发布。执行顺序见 [本次计划](release-0.3.0-plan.md)。

## 范围

十个公开包统一升级 `0.3.0`。相对 `0.2.5`，用户可见变化为显式可移植部署模式（ADR-0050）和独立的 worker 主脚本 MIME 发布检查（ADR-0051）；固定域名配置与旧计划仍有效。Nuxt、Push、离线写入继续保持私有。业务应用的生产发布门禁仍须单独执行。

## 候选门禁

环境：macOS arm64、Node 24.18.0、pnpm 11.18.0、Google Chrome 154.0.8037.59。候选提交 SHA、最终 `main` CI 和发布结果在发生后补记。

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过；878 个锁文件条目通过供应链策略 |
| `pnpm lint`、`pnpm build`、`pnpm typecheck` | 通过 |
| `pnpm docs:build`、`pnpm docs:check-evidence` | 通过 |
| `pnpm docs:check-public-api` | 通过；在线状态声明与 npm `0.2.5` 一致，新能力仍标为待发布 |
| `pnpm check:publish` | 通过；十个公开包 |
| `pnpm test` | 16 个套件中 15 个通过；`entry-resilience` 唯一失败为版本断言仍写 `0.2.5`，已改为 `0.3.0` 并单独复跑该套件 274 项通过。默认沙箱内回环端口受限；有效运行使用本机回环权限 |
| `pnpm test:browser` | 通过；Chrome 全套，含可移植双 origin、同源根/子路径及 worker MIME 正反例；1 个仅限 iPhone 的场景跳过 |
| `pnpm test:onboarding-smoke` | 通过；4 项，使用候选 tarball 安装的宿主 |
| `pnpm audit --ignore-registry-errors` | 无已知漏洞 |

十个候选 tarball 均为 `0.3.0`，含 README 和 MIT LICENSE，`exports` 目标存在，无 `workspace:*` 依赖、测试目录或环境文件。独立消费项目用 `npm install --ignore-scripts` 安装全部 tarball，`npm ls` 显示十包统一 `0.3.0`，无嵌套旧包；安装审计为零漏洞。

| 包 | 候选 tarball SHA-256 |
| --- | --- |
| contracts | `3342669fbabf8ddae53b56e54c58bdc40c32cc7db234ce56f4780964369dac17` |
| core | `db170f143c09e8238f499e61375daf5fc0374ffad3540e27f9b5c5a564dd062b` |
| engine-workbox | `80947e9990f4c953f09a6f43205694542738c131756b1bcb287451586b4e0862` |
| build-verifier | `da70458e0fd607752fa44cdb5d6bc12936c361520e4e53f98b9e5da684670584` |
| sw-runtime | `074c2f4cdf87276bb138c034b9fd015c01ab06214c0b29079efb2acfce4e62b6` |
| client-runtime | `651115074875e6c2e2389106d3c1ba9e47ed1476475433e76e349487bb358f6a` |
| vite | `7e8179e54483930c879357fff419be71106880a6bdc10383820f80f1468f770b` |
| entry-resilience | `bb0b710523214a5cd13092d25d0bb1141b8bd3ad3b70b8a1266a3c9f2ee4921e` |
| vue | `5bfc1d31252e78b55b19c3e190445a9af56bd5e16b5aa4dce7779d` |
| react | `fa308bdea1baacde1ce8d2e6e66b54d005e0ca36332a89a7286051a2ed3e03a4` |

## 待完成

- 完成 PR 与最终 `main` 手动 CI，核对发布提交与候选 tarball 内容。
- 从同一提交先部署仍标明 `0.2.5` 待发布状态的文档站，核对 Pages 门禁、线上页面及链接。
- 逐层发布并批准 npm 十包，每层确认 tarball 可下载后再进入下一层；读回 `latest` 与内容。
- 把网站和仓库入口改为已发布 `0.3.0`，经 CI 后部署最终文档并读回。
