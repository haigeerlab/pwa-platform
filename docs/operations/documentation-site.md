# 文档站构建与部署

`website/` 是面向业务开发者的 VitePress 文档站。它是独立的静态站点，不接入本仓库的 PWA worker，也不复用 React、Vue 演示站的 Cloudflare Pages 项目。

公开站点：[pwa-platform-docs.pages.dev](https://pwa-platform-docs.pages.dev/)；源仓库为 [`haigeerlab/pwa-platform`](https://github.com/haigeerlab/pwa-platform)。Cloudflare Pages 项目名为 `pwa-platform-docs`，连接 `main` 分支并开启自动部署。首次部署记录：提交 `16c715cfdfa3279cdd3e663b39c7a7f792c4a6ba`，部署 ID `1e9cbb2d-1661-4f89-b3f7-695272038cb8`。

## 本地检查

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm docs:build
pnpm docs:preview
```

构建产物位于 `website/.vitepress/dist/`。CI 配置为在 Node 22、24 上执行 `pnpm docs:build`。默认 `base` 为 `/`；只有站点部署到域名子路径时，才设置 `PWA_DOCS_BASE=/子路径/` 后重新构建。`base` 必须与实际访问路径一致。

## Cloudflare Pages 配置

为文档站新建**独立**的 Pages 项目并连接本仓库。不要选择已有的 `pwa-platform-react-demo`、`pwa-platform-vue-demo` 或移动端冒烟项目。Pages 的生产分支设为 `main`，构建设置如下：

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
3. 在 Pages 预览地址检查首页、`/start/choose`、Vue／React 接入页、搜索、代码复制和 404 页面。
4. 正式部署后，从独立浏览器窗口重新检查相同路径与站点资源。记录 Pages 部署 ID、提交 SHA、站点地址和核验结果。

Pages 的 Git 集成会在推送连接的分支后自动构建；首次连接仓库和开启自动部署前，应先确认项目名称、访问范围与发布节奏。文档站发布不代替业务 PWA 的[生产验收](release-and-incident-runbook.md)。

参考：[Cloudflare Pages VitePress 指南](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vitepress-site/)、[构建镜像版本设置](https://developers.cloudflare.com/pages/configuration/build-image/)、[静态页面路由](https://developers.cloudflare.com/pages/configuration/serving-pages/)与[VitePress 部署指南](https://vitepress.dev/guide/deploy)。
