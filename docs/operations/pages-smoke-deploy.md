# Pages 冒烟部署

本流程只用于 `@pwa-platform/examples-browser-e2e` 的 React `v1` 示例在真实 HTTPS 上做 PWA 冒烟验收；当前先验证桌面 Chrome，手机浏览器测试延后。它不是生产发布流程，不替代 [生产发布浏览器证据](browser-release-evidence.md) 或其 N/N-1、Vue、恢复演练要求。

## 一次性准备

Wrangler 是仓库根目录的开发依赖。创建一个仅用于这个测试站的 Cloudflare API Token：资源范围选择目标账户，权限只选择 **Account → Cloudflare Pages → Edit**。Cloudflare 的 Pages API 将 API Token 列为首选认证方式，并将该权限作为创建部署所需权限。

将 Token 保存在操作系统钥匙串或其他密钥管理系统，并在运行命令的环境中提供为 `CLOUDFLARE_API_TOKEN`；同时提供该账户的 `CLOUDFLARE_ACCOUNT_ID`，使 Wrangler 不会误用机器上残留登录状态的账户。不得把 API Token、Cookie 或账户标识写入仓库、`.env` 或命令行记录。自动化环境同样由其密钥管理系统注入这两个变量。

在 macOS 上，`pnpm deploy:pages:react` 会在两个环境变量均未设置时，读取本机钥匙串中名为 `PWA Platform Cloudflare Pages`（Token）和 `PWA Platform Cloudflare Pages Account ID`（账户 ID）的条目；这两个值不会由脚本输出。Windows 与 CI 则由各自的凭据管理系统注入同名环境变量。

本流程刻意不使用 `wrangler login`：该 OAuth 授权会请求与单一 Pages 部署无关的广泛账户写权限，不符合本测试站的最小权限要求。

## 发布 React v1 测试站

```bash
pnpm deploy:pages:react
```

这个脚本先确认 Token 与账户 ID 均已由环境变量或 macOS 钥匙串提供，避免回退到机器上残留的 Wrangler OAuth 登录状态；然后按示例自身的 Vite 配置生成 `packages/examples-browser-e2e/browser-build/react/v1/app/`，再将其父目录发布到既有的 `pwa-t15-mobile-smoke` Direct Upload 项目的 `main` 分支。父目录必须保留，因为示例身份固定在 `/app/`：发布 `app/` 自身会让 `/app/assets/...` 不存在，从而导致模块以 HTML 回退响应。脚本还会在上传目录根部生成 Pages `_headers`：HTML、worker、manifest 使用 `no-cache`，带指纹的 `/app/assets/*` 使用一年 `max-age` 与 `immutable`。Pages 会把 `/app/offline.html` 重定向到 `/app/offline`，因此脚本同时为源路径和最终 HTML 路径配置 `no-cache`。这是静态测试站的部署配置；真实业务宿主须在自身部署环境配置并验证缓存头。

验收地址是：

```text
https://pwa-t15-mobile-smoke.pages.dev/app/
```

Cloudflare 将 Direct Upload 描述为预构建静态资源的推荐上传方式；Wrangler 只接受单一目录而不接受 ZIP，并支持使用 `--branch` 创建预览部署。需要预览时，先运行 `pnpm build:pages:react`，再显式执行：

```bash
pnpm exec wrangler pages deploy packages/examples-browser-e2e/browser-build/react/v1 --project-name=pwa-t15-mobile-smoke --branch=<branch-name>
```

来源：[Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Cloudflare Pages API 认证](https://developers.cloudflare.com/pages/configuration/api/)。

## 验收边界

- 使用 `/app/`，而不是站点根路径；Service Worker 的 scope 与 manifest start URL 均在该路径下。
- 先确认页面渲染、`registered`、正常刷新后的 Service Worker 接管、离线刷新和安装后的 `display-mode: standalone`。
- 该临时测试站是公开 HTTPS 地址；只上传已构建的静态产物，不上传源码、`.env`、令牌或设备数据。
- 站点不再需要时，删除 Cloudflare 项目是不可逆的云端删除，必须在操作时取得项目所有者确认。
