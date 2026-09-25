# 文档站构建与部署

`website/` 是面向业务开发者的 VitePress 文档站。它是独立的静态站点，不接入本仓库的 PWA worker，也不复用 React、Vue 演示站的 Cloudflare Pages 项目。

公开站点：[pwa-platform-docs.pages.dev](https://pwa-platform-docs.pages.dev/)；源仓库为 [`haigeerlab/pwa-platform`](https://github.com/haigeerlab/pwa-platform)。Cloudflare Pages 项目名为 `pwa-platform-docs`，连接本仓库；日常合并到 `main` 不会自动部署文档。首次部署记录：提交 `16c715cfdfa3279cdd3e663b39c7a7f792c4a6ba`，部署 ID `1e9cbb2d-1661-4f89-b3f7-695272038cb8`。2026-09-25 集中发布记录：版本分支 `docs/v2026.09.25`，提交 `6659becac3c4d5bee46225f189c25ab9aa63522c`，生产部署 ID `2ebacb42-abff-4f59-b2bd-5f697c0a792c`；首页、包选择、Vue／React 接入页、搜索和 404 页面已在线核验。

同日第二次集中发布：版本分支 `docs/v2026.09.25-2`，提交 `e0367bde2ce0224785494f8e40d09dfa4b24a08f`，[手动 CI #16](https://github.com/haigeerlab/pwa-platform/actions/runs/36112513408) 三项通过，生产部署 ID `69f08e16-03d4-4cdf-a9e1-427ca8a7fc79`。发布前账户仍为 Free，四个 Pages 项目累计 88 条部署记录；本次产物有 86 个文件、共 1,865,933 字节，最大文件 141,024 字节，未含 Functions 或 `_worker.js`。一次手动上传后，首页、包选择、Vue／React 接入、搜索、代码复制和 404 已在线核验，生产与预览自动部署仍关闭。

## 本地检查

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm docs:build
pnpm docs:preview
```

构建产物位于 `website/.vitepress/dist/`。Ready PR 的 CI 在 Node 22、24 上执行 `pnpm docs:build`；发布前还要对最终 `main` 提交手动运行同一完整工作流。默认 `base` 为 `/`；只有站点部署到域名子路径时，才设置 `PWA_DOCS_BASE=/子路径/` 后重新构建。`base` 必须与实际访问路径一致。

## 免费额度与集中发布

本站按 **Cloudflare Pages Free** 使用。Cloudflare 当前公布的 Free 限额为每月 500 次 Pages 部署、同一时间 1 次构建、单站最多 20,000 个文件及单文件最多 25 MiB；纯静态资源请求免费且不限次数。2026-09-25 的本地构建有 86 个文件、总计 1,863,932 字节，最大文件 141,024 字节；产物中没有 Pages Functions 或 `_worker.js`。这些数字只说明当前产物符合静态站条件，不代表账户余量。文档站不使用 R2、Workers、Pages Functions 或付费附加功能；若以后引入，须先重新核对计费边界。来源：[Pages 限额](https://developers.cloudflare.com/pages/platform/limits/)、[Pages 静态资源计费](https://developers.cloudflare.com/pages/functions/pricing/)。

为减少部署次数，文档与功能改动通过 Ready PR 合并到 `main`；日常工作分支推送、`main` 推送和文档版本分支推送都不自动运行 CI。只有决定发布文档时，才对最终 `main` 提交手动运行 CI，并从验证过的同一提交建立版本分支，例如 `docs/v2026.09.25`。每个版本分支固定指向一次发布候选；后续修改先进入 `main`，再建立新的版本分支。发布顺序如下：

1. 在本地运行 `pnpm docs:build`、`pnpm docs:preview`，检查首页、接入页、搜索、代码复制和 404；Ready PR 的三个 CI job 通过后再合入 `main`。
2. 对最终 `main` 提交手动运行 GitHub Actions `CI`，确认 Node 22／24、浏览器任务全部通过且运行 SHA 与目标提交相同。确认 Pages 项目的 **Enable automatic production branch deployments** 为关闭、**Preview branch** 为 **None**；再从该提交创建并推送唯一的 `docs/v...` 版本分支。推送 `main` 与版本分支均不应触发 CI 或 Pages 部署。
3. 发布前核对账户仍使用 Pages Free、当月部署余量、静态产物文件数与单文件大小，确认没有 Functions、`_worker.js` 或新的付费绑定。无法确认时停止上传，先保留已验证的版本分支。
4. 在 Pages 项目设置中把 **Production branch** 切换为该版本分支，保持生产和预览自动部署关闭；重新读取设置并确认线上部署 ID 未变化。在版本分支检出目录重新构建，然后用 Wrangler 指定同一个 `--branch=docs/v...` 手动上传一次 `website/.vitepress/dist/`。上线后核验公开站点并记录版本分支、提交 SHA 和部署 ID。

```bash
# 示例：从已验证的 main 建立发布分支；实际版本名应唯一
git switch main
git pull --ff-only origin main
git switch -c docs/v2026.09.25
git push -u origin HEAD
pnpm docs:build
# 完成免费额度及 Pages 分支设置核验后，凭据由系统钥匙串或密钥管理器注入
pnpm exec wrangler pages deploy website/.vitepress/dist \
  --project-name=pwa-platform-docs --branch=docs/v2026.09.25
```

本项目在 2026-09-25 已通过 Pages API 关闭生产分支自动部署，并把预览分支设为 `none`；项目仍连接 `haigeerlab/pwa-platform`，设置变更没有创建部署。Pages 的 `Production branch` 当前指向 `docs/v2026.09.25-2`，上线后生产和预览自动部署仍保持关闭。每次推送或发布前重新核对这些控制项；Build watch paths 仍为 include `*`、exclude 空，它不是此流程的部署门禁。来源：[Git 集成与手动部署](https://developers.cloudflare.com/pages/configuration/git-integration/)、[分支部署控制](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)与[Wrangler 生产分支参数](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。

## Cloudflare Pages 配置

为文档站新建**独立**的 Pages 项目并连接本仓库。不要选择已有的 `pwa-platform-react-demo`、`pwa-platform-vue-demo` 或移动端冒烟项目。Pages 的生产分支初始为 `main`；采用版本分支发布后，生产分支指向最近一次发布的 `docs/v...`。生产和预览自动部署都保持关闭。构建设置如下：

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
