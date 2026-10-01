# npm 发布记录：0.3.0

> 状态：十个 npm 包已公开，最终 0.3.0 文档站待部署。执行顺序见 [本次计划](release-0.3.0-plan.md)。

## 范围

十个公开包统一升级 `0.3.0`。相对 `0.2.5`，用户可见变化为显式可移植部署模式（ADR-0050）和独立的 worker 主脚本 MIME 发布检查（ADR-0051）；固定域名配置与旧计划仍有效。Nuxt、Push、离线写入继续保持私有。业务应用的生产发布门禁仍须单独执行。

## 候选门禁

环境：macOS arm64、Node 24.18.0、pnpm 11.18.0、Google Chrome 154.0.8037.59。发布源码为 [PR #124](https://github.com/haigeerlab/pwa-platform/pull/124) 合并提交 `d5b9f79cd6bb2c923d39ffb44384487e1db54fc8`，文件树与已审核候选提交 `b9ab72cee4c9e50c63bb20885a9c6e0c0cb09dec` 完全一致；标签 `v0.3.0` 指向该合并提交。[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36891746377) 的 Node 22、Node 24、Chrome、Edge、WebKit／Firefox 引擎冒烟及真实 FCM 六项全部通过。

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过；878 个锁文件条目通过供应链策略 |
| `pnpm lint`、`pnpm build`、`pnpm typecheck` | 通过 |
| `pnpm docs:build`、`pnpm docs:check-evidence` | 通过 |
| `pnpm docs:check-public-api` | 通过；在线状态声明与 npm `0.2.5` 一致，新能力仍标为待发布 |
| `pnpm check:publish` | 通过；十个公开包 |
| `pnpm test` | 16 个套件中 15 个通过；`entry-resilience` 唯一失败为版本断言仍写 `0.2.5`，已改为 `0.3.0` 并单独复跑该套件 274 项通过。默认沙箱内回环端口受限；有效运行使用本机回环权限 |
| `pnpm test:browser` | 通过；Chrome 全套，含可移植双 origin、同源根/子路径及 worker MIME 正反例；1 个仅限 iPhone 的场景跳过 |
| `pnpm test:browser:engines` | 通过；WebKit／Firefox 合计 122 项通过、50 项按配置跳过；同一提交的 CI 引擎冒烟通过 |
| `pnpm test:browser:network` | 未单独运行；需联网，属不阻塞检查；最终 CI 的真实 FCM 网络任务通过 |
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

## 文档先行

从发布提交创建固定分支 `docs/v2026.10.02-pre0.3.0`，在已确认的 Cloudflare Pages Free 套餐、`$0.00` 当期费用和静态产物限额内，以 Wrangler 4.144.0 手动部署到 `pwa-platform-docs`。生产部署 ID `3a1fac90-d4cc-4e1c-9ad6-989c9385a11f`，提交 SHA 与发布提交相同；生产、预览和总自动部署开关保持关闭。上线后关键页面为 200、未知路径 404、随包 skill 的 12 个文档链接均为 200，包选择页含 `ai-onboarding` 锚点。此阶段网站仍如实声明 npm `0.2.5` 的能力边界；完整记录见[文档站部署记录](../../docs/operations/documentation-site.md)。

## npm 发布与读回

账号 `jianian`、scope `@pwa-platform`。用户在发布期间要求先批量提交再统一验证，因此实际批准顺序与计划中的逐层等待不同：`contracts` 从已审核的干净版本分支用 `pnpm publish --access public --tag latest` 直接提交，其余九包从同一提交经 `pnpm pack` 形成的已审核 tarball 用 `npm stage publish --access public --tag latest` 集中暂存；npm 自动验证结束后在账户网页中批准。首次 `contracts` CLI 返回成功但公共 tarball 暂时 404；只读查询无暂存项，一次受控重试在授权等待中停止，随后 npm 暂存试运行确认版本已被占用，未再提交。九包暂存列表最终为空。

2026-10-01 16:59 UTC 后统一读回：十个 npm `dist-tags.latest` 均为 `0.3.0`，十个公开 tarball 均为 200。九个暂存 tarball 与候选归档逐字节一致；直接发布的 `contracts` tarball 压缩字节不同，但解包后的所有文件及 `package.json` 内容完全一致。全新临时消费项目从公共 registry 安装十包，`node_modules` 中版本全部为 `0.3.0`，十个公开根入口均可导入。`pnpm docs:check-public-api` 对已发布 tarball 的类型声明核对通过：`portable` 和 `workerMime` 均为 `true`。

registry 记录的公开时间：`contracts` 16:47:38、`core` 16:53:45、`engine-workbox` 16:56:31、`react` 16:58:11、`vue` 16:58:25、`entry-resilience` 16:58:37、`vite` 16:58:47、`client-runtime` 16:58:58、`sw-runtime` 16:59:08、`build-verifier` 16:59:21（UTC）。**从这些时间推断**，16:58:11 至 16:59:21 间若安装了已经更新 `latest` 的上层包，可能因下层 `0.3.0` 尚未公开而失败；16:59:21 后统一安装已通过。这是约 70 秒的发布窗口，不表示有业务应用实际安装失败。

包内文案遗留：`sw-runtime@0.3.0` 的 README 有一处“当前正式版（0.2.5）”，只用于说明 Push 尚未公开，功能说明本身正确。npm 版本不可覆盖，仓库 README 已在发布后的文档 PR 中改为 `0.3.0`；已发布 tarball 保留原文字节。

## 待完成

- 将网站与仓库入口改为已发布 `0.3.0`，经 PR、最终 `main` CI 后以 Wrangler 手动部署最终文档并读回生产部署 ID、页面和配置。
