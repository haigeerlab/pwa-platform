# 文档站构建与部署

`website/` 是面向业务开发者的 VitePress 文档站。它是独立的静态站点，不接入本仓库的 PWA worker，也不复用 React、Vue 演示站的 Cloudflare Pages 项目。CI 除了构建文档，还运行 `pnpm docs:check-public-api`：读取 npm `latest` 的公开 tarball 类型声明，核对网站声明的正式版本，以及 portable/worker MIME 页面是否标明对应版本的发布状态。该检查需要访问 npm registry；它验证的是这两项新增 API 的版本边界，不替代全部文档行为测试。

公开站点：[pwa-platform-docs.pages.dev](https://pwa-platform-docs.pages.dev/)；源仓库为 [`haigeerlab/pwa-platform`](https://github.com/haigeerlab/pwa-platform)。Cloudflare Pages 项目名为 `pwa-platform-docs`，连接本仓库；日常合并到 `main` 不会自动部署文档。首次部署记录：提交 `16c715cfdfa3279cdd3e663b39c7a7f792c4a6ba`，部署 ID `1e9cbb2d-1661-4f89-b3f7-695272038cb8`。2026-09-25 集中发布记录：版本分支 `docs/v2026.09.25`，提交 `6659becac3c4d5bee46225f189c25ab9aa63522c`，生产部署 ID `2ebacb42-abff-4f59-b2bd-5f697c0a792c`；首页、包选择、Vue／React 接入页、搜索和 404 页面已在线核验。

同日第二次集中发布：版本分支 `docs/v2026.09.25-2`，提交 `e0367bde2ce0224785494f8e40d09dfa4b24a08f`，[手动 CI #16](https://github.com/haigeerlab/pwa-platform/actions/runs/36112513408) 三项通过，生产部署 ID `69f08e16-03d4-4cdf-a9e1-427ca8a7fc79`。发布前账户仍为 Free，四个 Pages 项目累计 88 条部署记录；本次产物有 86 个文件、共 1,865,933 字节，最大文件 141,024 字节，未含 Functions 或 `_worker.js`。一次手动上传后，首页、包选择、Vue／React 接入、搜索、代码复制和 404 已在线核验，生产与预览自动部署仍关闭。

同日第三次集中发布：版本分支 `docs/v2026.09.25-3`，提交 `b40fcd0ecc329d7cf1a07c6544ee3e162ff34ba9`，来自 [PR #6](https://github.com/haigeerlab/pwa-platform/pull/6)；[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36136409863) 三项通过，生产部署 ID `d4478c68-7078-417c-9395-b305451dcc1f`，站点 `https://pwa-platform-docs.pages.dev/`。发布前账户为 Free，四个 Pages 项目当月共有 92 条部署记录；本次产物有 86 个文件、共 1,911,244 字节，最大文件 141,024 字节，未含 Functions 或 `_worker.js`。一次手动上传后，首页能力矩阵、包选择、Vue／React 接入、首次浏览器核验、搜索、代码复制和 404 已在线核验，生产与预览自动部署仍关闭。

同日第四次集中发布：版本分支 `docs/v2026.09.25-4`，提交 `f5f59129c9288c87c3a518320d030dee20d382e5`，来自 [PR #8](https://github.com/haigeerlab/pwa-platform/pull/8)；[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36149953841) 三项通过，生产部署 ID `55edcdcc-bbbc-4813-a9b6-0ce30e0c11fa`。发布前账户为 Free，四个 Pages 项目累计 93 条部署记录；本次产物有 86 个文件、共 1,915,567 字节，最大文件 141,024 字节，未含 Functions 或 `_worker.js`。一次手动上传后，首页能力矩阵、包选择、Vue／React 接入、登出后重注册说明、首次浏览器核验、搜索、代码复制和 404 已在线核验；生产与预览自动部署仍关闭，未写入 R2。

2026-09-26 文档发布：版本分支 `docs/v2026.09.26-2` 固定于 [PR #11](https://github.com/haigeerlab/pwa-platform/pull/11) 合并提交 `228dfd52eca3142430039eb35e7cdf2fce070f82`；[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36226024074) 的 Node 22、Node 24 和 Chrome 三项通过。发布前四个 Pages 项目本月合计 95 条部署记录；产物有 89 个文件、共 2,059,621 字节，最大文件 141,024 字节，没有 Functions 或 `_worker.js`。推送版本分支和切换生产分支均未产生部署，随后一次手动上传生成生产部署 ID `51302de8-3013-41c2-b471-c645526f32bb`。线上核验了首页、工具能力对照、更新提示文档、根路径与 `/m/` 子路径配置、搜索、代码复制及 404；部署 SHA 与版本分支一致，生产、预览和总自动部署开关仍关闭。账户 Free 套餐上次于 2026-09-25 核实；本次 Pages API Token 没有读取账户套餐的权限，未重新确认套餐状态。

2026-09-27 文档发布：版本分支 `docs/v2026.09.27-2` 固定于 [PR #17](https://github.com/haigeerlab/pwa-platform/pull/17) 合并提交 `62dddeace9060fe6b0cb3b5add5fdfa213b63635`；[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36263116466) 的 Node 22、Node 24 和 Chrome 三项通过。发布前在 Cloudflare 控制台重新确认 Workers Free，当前计费周期总费用与预计费用均为 `$0.00`，四个 Pages 项目本月合计 118 条部署记录；产物有 98 个文件、共 2,325,468 字节，最大文件 154,102 字节，没有 Functions 或 `_worker.js`。推送版本分支和切换生产分支均未产生部署，随后一次手动上传生成生产部署 ID `ba3e33e4-e774-4830-b12f-c9443d4a73dd`。线上核验了首页 PC／Android／iPhone 测试清单、成熟应用对比、跨平台测试证据、按功能接入、包选择、Vue／React 接入、搜索、代码复制及 404；部署 SHA 与版本分支一致，生产、预览和总自动部署开关仍关闭。

2026-09-29 文档发布：版本分支 `docs/v2026.09.29` 固定于 [PR #99](https://github.com/haigeerlab/pwa-platform/pull/99) 合并提交 `147fb2761b0a36706fc3ffc591818bdd5995d55a`（0.2.4 发布提交）；该提交的 `main` CI（run 36594306515）Node 22、Node 24 和 Chrome 通过。上传前经 Pages API 核对生产与预览自动部署仍关闭（`false`／`none`，总开关 `false`），四个 Pages 项目当月合计 136 条非跳过部署；产物 110 个文件、约 3.3 MB，最大文件 316,725 字节，没有 Functions 或 `_worker.js`；Pages Token 无权读取账户套餐，本次未重新确认套餐。Production branch 改为 `docs/v2026.09.29`，改后未产生部署；随后一次手动上传生成生产部署 ID `ff750f1b-1abb-432d-b8ee-b9128ed14fdd`。线上核验了发布流程第 11 条三项：`website/` 与发布提交无差异、`SKILL.md` 的 11 个链接均为 200、《选择接入包》含 `id="ai-onboarding"`；《服务器与 CDN 配置》《默认值与时间约定》已上线。

2026-10-01 文档发布（随 0.2.5）：版本分支 `docs/v2026.10.01` 固定于 [PR #114](https://github.com/haigeerlab/pwa-platform/pull/114) 合并提交 `5a2ee76f585560f497750f456cab75a150091786`（0.2.5 发布提交）；该提交的手动 CI（[run 36808744221](https://github.com/haigeerlab/pwa-platform/actions/runs/36808744221)）六项全部通过。上传前经 Pages API 核对生产与预览自动部署仍关闭（`false`／`none`，总开关 `false`），推送版本分支未产生部署；10 月尚无部署记录。产物 116 个文件、3,664,740 字节，最大文件 402,797 字节，没有 Functions 或 `_worker.js`。Production branch 改为 `docs/v2026.10.01` 后线上部署未变；随后以 Wrangler 4.144.0（依赖升级 [#113](https://github.com/haigeerlab/pwa-platform/pull/113) 后，修复 `undici` TLS 校验等公告）一次手动上传，生产部署 ID `2114476f-54a5-40e7-8c0e-0e6b01f58e62`，部署 SHA 与版本分支一致。线上核验：首页、选择接入包（安装命令 0.2.5）、新增的诊断码索引与 PWA 基础页、配置指南字段参考锚点、跨平台测试证据（含 6a 等新子行）均为 200，未知路径 404。本次带上文档评估三批修正（#109–#112）与桌面三浏览器、Android 真机的测试矩阵更新。

2026-10-01 第二次文档发布（矩阵 iPhone 列）：版本分支 `docs/v2026.10.01-2` 固定于 [PR #116](https://github.com/haigeerlab/pwa-platform/pull/116) 合并提交 `a261cfad0f5491f95a4cd4d0b8f2cbb028c69e79`。该提交的手动 CI（[run 36840342589](https://github.com/haigeerlab/pwa-platform/actions/runs/36840342589)）Node 22、Node 24、Chrome 三项必需检查与 Edge、引擎冒烟通过；不阻塞的真实 FCM 推送套件有一项（被拒载荷不显示通知）失败，该用例与推送源码自 0.2.5 起未变，同一提交十五分钟前的 `push` 事件 CI 中该任务通过，判为外部 FCM 顺序造成的偶发。上传前核对生产与预览自动部署仍关闭、10 月仅 1 次部署；产物 116 个文件、3,671,347 字节，最大文件 405,024 字节，没有 Functions 或 `_worker.js`。版本分支第一次推送因临时网络错误失败，Production branch 已先切换为 `docs/v2026.10.01-2`，补推成功后核对未产生部署（线上仍为 `2114476f`），再以 Wrangler 4.144.0 一次手动上传，生产部署 ID `8ba9c4b3-ea84-4222-9575-50ae8d0a7fe2`，部署 SHA 与版本分支一致。线上核验首页（iPhone 真机自动化说明）、跨平台测试证据（引用 ADR-0049）、诊断码索引、选择接入包均为 200，未知路径 404。

2026-10-02 的 0.3.0 发布前文档先行部署：版本分支 `docs/v2026.10.02-pre0.3.0` 固定于 [PR #124](https://github.com/haigeerlab/pwa-platform/pull/124) 合并提交 `d5b9f79cd6bb2c923d39ffb44384487e1db54fc8`；该提交的 [最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36891746377) 六项全部通过。上传前在 Cloudflare 控制台确认 Workers Free、当前计费周期费用 `$0.00`；四个 Pages 项目 10 月已有 6 条非跳过部署，本站产物 122 个文件、3,844,924 字节，最大文件 434,578 字节，没有 Functions、`_worker.js` 或 `_routes.json`。推送版本分支及切换 Production branch 后均未自动部署；Wrangler 4.144.0 手动上传生成生产部署 ID `3a1fac90-d4cc-4e1c-9ad6-989c9385a11f`，部署 SHA 与分支一致，三个自动部署开关仍为 `false`／`none`／`false`。线上首页、包选择、Vue／React 接入、可移植部署、发布流程与包参考返回 200，未知路径返回 404；随包 onboarding skill 中 12 个文档链接均返回 200，包选择页含 `id="ai-onboarding"`。此阶段站点仍按当时 npm `0.2.5` 的实际状态标记新能力待发布；0.3.0 包公开后的最终文档另行部署。

2026-10-02 的 0.3.0 最终文档发布：版本分支 `docs/v2026.10.02-0.3.0` 固定于 [PR #125](https://github.com/haigeerlab/pwa-platform/pull/125) 合并提交 `f70bb9ef2b03ad558fcaf499889b195974685e3b`；[最终 main 手动 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/36898142394) 六项全部成功。产物 122 个文件、3,846,289 字节，最大文件 434,207 字节，没有 Functions、`_worker.js` 或 `_routes.json`。推送固定分支后线上仍为先行部署；切换 Production branch 并独立读回后，三个自动部署开关仍为 `false`／`none`／`false`，也未产生自动部署。随后以 Wrangler 4.144.0 一次手动上传，生产部署 ID `7a914cfa-2bf2-48f2-b021-97018f4d80d0`，部署 SHA 与固定分支一致，状态成功。公开域名上的首页、包选择、Vue／React 接入、可移植部署、发布流程、服务器配置与包参考均返回 200；页面显示 npm `0.3.0`、worker MIME 和可移植部署已发布，未知路径返回 404。随包 onboarding skill 中 12 个文档链接均返回 200，包选择页含 `id="ai-onboarding"`；上线后自动部署开关保持关闭。

## 本地检查

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm docs:build
pnpm docs:preview
```

构建产物位于 `website/.vitepress/dist/`。Ready PR 的 CI 在 Node 22、24 上执行 `pnpm docs:build`；发布前还要对最终 `main` 提交手动运行同一完整工作流。默认 `base` 为 `/`；只有站点部署到域名子路径时，才设置 `PWA_DOCS_BASE=/子路径/` 后重新构建。`base` 必须与实际访问路径一致。

## 免费额度与集中发布

本站按 **Cloudflare Pages Free** 使用。Cloudflare 当前公布的 Free 限额为每月 500 次 Pages 部署、同一时间 1 次构建、单站最多 20,000 个文件及单文件最多 25 MiB；纯静态资源请求免费且不限次数。最近一次本地构建有 122 个文件、总计 3,846,289 字节，最大文件 434,207 字节；产物中没有 Pages Functions 或 `_worker.js`。这些数字只说明当前产物符合静态站条件，不代表账户余量。文档站不使用 R2、Workers、Pages Functions 或付费附加功能；若以后引入，须先重新核对计费边界。来源：[Pages 限额](https://developers.cloudflare.com/pages/platform/limits/)、[Pages 静态资源计费](https://developers.cloudflare.com/pages/functions/pricing/)。

为减少部署次数，文档与功能改动通过 Ready PR 合并到 `main`；合并后若 `website/` 相对当前线上部署有更新，应提醒发布负责人准备文档站发布。决定发布时，先确认最终 `main` 提交的完整 CI 已通过，再从验证过的同一提交建立发布分支。提醒本身不创建分支或部署。每个发布分支固定指向一次发布候选；后续修改先进入 `main`，再建立新的发布分支。

新的文档发布分支统一命名为 `release/docs-<版本号>`；没有独立文档版本号时，以马来西亚当地发布日期命名为 `release/docs-YYYY-MM-DD`。同日首次使用不带后缀的日期名，第二次使用 `release/docs-YYYY-MM-DD-1`，之后依次为 `-2`、`-3`；当天已完成的旧命名发布也计入次数。创建前核对当天发布记录和远端同名分支；若名称已被未完成的候选占用，先核实该候选状态，不能仅靠递增后缀绕过。已有 `docs/v...` 分支是历史发布记录，不改名。发布顺序如下：

用 `pnpm release:branch docs --completed-today <次数>` 预览名称；`--create` 才会获取最新 `origin/main`，核对工作区干净且本地、远端没有同名分支，然后从 `origin/main` 创建本地分支。次数应按当天已完成的 Pages 部署记录人工核对，不能把现存分支数当成已发布次数。有独立文档版本时改用 `pnpm release:branch docs --version <版本号> --create`。

1. 在本地运行 `pnpm docs:build`、`pnpm docs:preview`，检查首页、接入页、搜索、代码复制和 404；Ready PR 的三个 CI job 通过后再合入 `main`。
2. 确认最终 `main` 提交的 GitHub Actions `CI` 中 Node 22／24、浏览器任务全部通过且运行 SHA 与目标提交相同；若该提交没有完整运行，则手动触发。确认 Pages 项目的 **Enable automatic production branch deployments** 为关闭、**Preview branch** 为 **None**；再从该提交创建并推送唯一的 `release/docs-...` 发布分支。分支推送不应触发 Pages 部署。
3. 发布前核对账户仍使用 Pages Free、当月部署余量、静态产物文件数与单文件大小，确认没有 Functions、`_worker.js` 或新的付费绑定。无法确认时停止上传，先保留已验证的版本分支。
4. 在 Pages 项目设置中把 **Production branch** 切换为该发布分支，保持生产和预览自动部署关闭；重新读取设置并确认线上部署 ID 未变化。在发布分支检出目录重新构建，然后用 Wrangler 指定同一个 `--branch=release/docs-...` 手动上传一次 `website/.vitepress/dist/`。上线后核验公开站点并记录发布分支、提交 SHA 和部署 ID。

```bash
# 示例：当天尚未完成文档站发布；先核对部署记录和最终 main 的 CI
pnpm release:branch docs --completed-today 0
pnpm release:branch docs --completed-today 0 --create
git push -u origin HEAD
pnpm docs:build
# 完成免费额度及 Pages 分支设置核验后，凭据由系统钥匙串或密钥管理器注入
pnpm exec wrangler pages deploy website/.vitepress/dist \
  --project-name=pwa-platform-docs --branch="$(git branch --show-current)"
```

本项目在 2026-09-25 已通过 Pages API 关闭生产分支自动部署，并把预览分支设为 `none`；项目仍连接 `haigeerlab/pwa-platform`，设置变更没有创建部署。Pages 的 `Production branch` 当前指向 `docs/v2026.10.02-0.3.0`，上线后生产和预览自动部署仍保持关闭。每次推送或发布前重新核对这些控制项；Build watch paths 仍为 include `*`、exclude 空，它不是此流程的部署门禁。来源：[Git 集成与手动部署](https://developers.cloudflare.com/pages/configuration/git-integration/)、[分支部署控制](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)与[Wrangler 生产分支参数](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。

2026-09-25 后续审计发现：只关闭生产与预览的细分自动部署开关时，GitHub 推送仍留下 `is_skipped=true`、状态为 `idle` 的预览记录；这些记录不是新的成功站点发布，不能直接当作每月构建次数。为减少这种记录，已同时将 Pages Git source 的总开关 `deployments_enabled` 设为 `false`，并经独立 API GET 核对三个开关为 `false`／`false`／`none`；生产部署 ID 保持 `69f08e16-03d4-4cdf-a9e1-427ca8a7fc79`。该总开关在 Cloudflare API 中标记为 deprecated，后续仍应以细分开关和实际部署记录共同核验；审计记录分支 `codex/cloudflare-free-audit-2026-09-25` 的正常推送后，部署记录总数仍为 22、最新记录 ID 未变；合并到 `main` 后再复核一次，不为核验而额外推送。来源：[Pages API 配置字段](https://developers.cloudflare.com/api/resources/pages/)。

## Cloudflare Pages 配置

为文档站新建**独立**的 Pages 项目并连接本仓库。不要选择已有的 `pwa-platform-react-demo`、`pwa-platform-vue-demo` 或移动端冒烟项目。Pages 的生产分支初始为 `main`；采用发布分支后，生产分支指向最近一次发布的分支（历史为 `docs/v...`，新发布为 `release/docs-...`）。生产和预览自动部署都保持关闭。构建设置如下：

| 配置项 | 值 |
| --- | --- |
| Root directory | 仓库根目录 |
| Build command | `pnpm docs:build` |
| Build output directory | `website/.vitepress/dist` |
| `NODE_VERSION` | `24.18.0` |
| `PNPM_VERSION` | `11.18.0` |
| `PWA_DOCS_BASE` | `/`，仅当部署到子路径时调整 |

选择 VitePress 预设后，仍要把构建命令与输出目录改为上表中的仓库实际路径。保持 HTML Auto Minify 关闭；不要为本站额外设置缓存规则，除非已有可验证的需求。Pages 的默认路由会为 `cleanUrls` 生成的 HTML 提供无扩展名地址。首次创建项目后，以 Cloudflare 返回的实际 `pages.dev` 地址为准；自定义域名另行配置。

## 发布前后核验

1. 确认部署的提交包含 `website/`、根 `package.json` 与 `pnpm-lock.yaml`，Pages 构建日志中的 VitePress 版本是 `2.0.0-alpha.20`。
2. 如果站点面向外部开发者公开，逐个确认站内指向源仓库的链接对目标读者可访问；私有仓库中的维护资料不能作为公开接入步骤的唯一说明。
3. 在本地预览地址检查首页、`/start/choose`、Vue／React 接入页、搜索、代码复制和 404 页面；本地确认后再集中发布。
4. 正式部署后，从独立浏览器窗口重新检查相同路径与站点资源。记录 Pages 部署 ID、提交 SHA、站点地址和核验结果。

Pages 的 Git 集成已保留，但本站按上文流程关闭自动构建并从版本分支手动发布。首次连接仓库或改变分支控制前，应先确认项目名称、访问范围与发布节奏。文档站发布不代替业务 PWA 的[生产验收](release-and-incident-runbook.md)。

参考：[Cloudflare Pages VitePress 指南](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vitepress-site/)、[构建镜像版本设置](https://developers.cloudflare.com/pages/configuration/build-image/)、[静态页面路由](https://developers.cloudflare.com/pages/configuration/serving-pages/)与[VitePress 部署指南](https://vitepress.dev/guide/deploy)。
