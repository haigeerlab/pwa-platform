---
pageClass: application-comparison
---

# 成熟应用 PWA 能力对比

本页按用户关心的 PWA 能力，比较 PWA Platform 与九个开源应用的**官方仓库源码快照**。核查日期：**2026-09-27**。它回答“在核查提交中能确认什么”，不评价产品整体质量，也不保证公开部署与仓库主分支完全一致。

## 判定规则

- **● 已确认**：官方源码或文档直接展示该能力。
- **◐ 部分／限定**：只覆盖部分场景、依赖平台，或本平台能力尚未随公开包交付。
- **○ 未确认／未提供**：reviewed sources 不能确认；对本平台则表示当前公开能力未提供。
- **— 不适用**：当前仓库明确使用自注销 worker，没有活动 Service Worker 能力。

“未确认”不等于项目一定没有。manifest 可安装、Service Worker 缓存、操作系统入口和产品 UI 是不同层次，表中不会互相推导。

## 对比矩阵

| 能力 | 本平台 | Elk | HA | Proton Pass | Mastodon | Excalidraw | Squoosh | Pinafore | Immich | tldraw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 显式且稳定的 manifest `id` | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| 可安装 + 自定义安装引导 | ◐ | ● | ◐ | ○ | ◐ | ● | ◐ | ◐ | ◐ | ◐ |
| 预缓存 + 离线兜底 | ● | ● | ● | ◐ | ◐ | ● | ● | ● | ○ | — |
| 运行时缓存（按路由选策略） | ● | ● | ● | ◐ | ● | ● | ● | ● | ○ | — |
| 未分类请求默认不缓存 | ● | ◐ | ○ | ◐ | ◐ | ◐ | ○ | ○ | ● | — |
| 用户确认后才更新 | ● | ● | ◐ | ○ | ○ | ○ | ◐ | ○ | ○ | — |
| 关停／迁移／恢复 worker | ● | ○ | ◐ | ○ | ○ | ◐ | ◐ | ○ | ○ | ● |
| Web Push 通知 | ◐ | ● | ● | ○ | ● | ○ | ○ | ● | ○ | — |
| Background Sync 标准 API | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | — |
| 周期／主动检查更新 | ◐ | ◐ | ○ | ◐ | ○ | ◐ | ○ | ○ | ○ | — |
| Web Share Target | ○ | ● | ○ | ○ | ○ | ● | ● | ◐ | ○ | ○ |
| 文件关联 File Handlers | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| 快捷方式／Launch Handler | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ |
| Service Worker 专项自动化 | ● | ○ | ◐ | ○ | ● | ○ | ○ | ○ | ○ | — |

## 关键判定说明

- **本平台**：`0.2.4` 正式包提供稳定 manifest ID、预缓存、离线回退、显式公共读取缓存、默认拒绝、用户确认更新、恢复 worker、快捷方式和浏览器自动化。Push 仍是工作区实现；主动检查是页面 API，不是 Periodic Sync；没有 Share Target、File Handlers 或 Launch Handler。
- **Elk**：使用 `injectManifest`、Workbox 预缓存和按路由缓存，包含自定义安装提示、等待更新、每小时页面定时 `registration.update()`、Push 与 Share Target。该定时器不是 Periodic Sync 标准 API；动态 manifest 的稳定 `id` 未从 reviewed sources 确认。
- **Home Assistant**：构建生成 Service Worker，预缓存壳并缓存静态资源、品牌图和地图瓦片，API／auth 走网络，支持 Push。其最后一条同源路由使用 Stale-While-Revalidate，因此不满足本表“未分类请求默认不缓存”的严格定义。
- **Proton Pass**：网页应用有独立 Service Worker、离线模式、fetch controller 和 polling 代码，但 reviewed sources 没有确认 web manifest、安装引导、标准后台同步或由用户确认的更新 UI。浏览器扩展的 Manifest V3 worker 不计入网页 PWA。
- **Mastodon**：当前 worker 缓存根响应、语言包、字体和图片并处理 Push；仓库含缓存专项测试。reviewed sources 没有确认离线导航兜底、用户确认更新或系统入口能力。
- **Excalidraw**：当前 Vite 配置明确给出 manifest `id`、预缓存、字体／语言包／代码块运行时缓存、Share Target 与 `.excalidraw` 文件关联；`registerType: "autoUpdate"` 因此不计作“用户确认后才更新”。旧 CRA worker 的自销毁脚本只算迁移能力。
- **Squoosh**：官方仓库和应用行为确认 PWA、离线处理与 Share Target；更新弹窗和旧 worker bridge 有历史证据。reviewed sources 没有确认稳定 manifest ID、默认拒绝和当前 SW 专项自动化，因此保守标记。
- **Pinafore**：官方 README 明确声明只读离线和 PWA，仓库包含 manifest、Service Worker、Push／缓存实现；项目已标记为不再维护。无法从 reviewed sources 证明的更新、默认拒绝和测试门禁保持“未确认”。
- **Immich**：manifest 提供 standalone 与三个快捷方式；当前 web worker 只拦截同源缩略图 GET 做请求合并，没有把它们写入 Cache Storage，也没有应用壳预缓存，因此不把它算成离线或运行时缓存。
- **tldraw**：当前 dotcom manifest 可安装，但 `sw.js` 会在 activate 时注销自身并刷新客户端。因此 manifest 能力仍可比较，所有依赖活动 worker 的项目标为“不适用”。

## 官方来源快照

| 项目 | 核查提交 | 主要来源 |
| --- | --- | --- |
| Elk | [`8a90074`](https://github.com/elk-zone/elk/tree/8a90074fca9f316a0c71f7249b1a31f21829a987) | [PWA 配置](https://github.com/elk-zone/elk/blob/8a90074fca9f316a0c71f7249b1a31f21829a987/config/pwa.ts)、[worker](https://github.com/elk-zone/elk/blob/8a90074fca9f316a0c71f7249b1a31f21829a987/service-worker/elk-sw.ts)、[页面注册与安装](https://github.com/elk-zone/elk/blob/8a90074fca9f316a0c71f7249b1a31f21829a987/modules/pwa/runtime/pwa-plugin.client.ts) |
| Home Assistant frontend | [`5c187a4`](https://github.com/home-assistant/frontend/tree/5c187a4e136616fabfa22ee74908bf751be827c1) | [Service Worker](https://github.com/home-assistant/frontend/blob/5c187a4e136616fabfa22ee74908bf751be827c1/src/entrypoints/service-worker.ts)、[构建说明](https://github.com/home-assistant/frontend/blob/5c187a4e136616fabfa22ee74908bf751be827c1/build-scripts/README.md) |
| Proton WebClients／Pass | [`914d752`](https://github.com/ProtonMail/WebClients/tree/914d7520eff52aafed9a1adfe19859143bdf1dc9) | [页面 worker 注册](https://github.com/ProtonMail/WebClients/blob/914d7520eff52aafed9a1adfe19859143bdf1dc9/applications/pass/src/app/ServiceWorker/client/register.ts)、[worker 服务](https://github.com/ProtonMail/WebClients/blob/914d7520eff52aafed9a1adfe19859143bdf1dc9/applications/pass/src/app/ServiceWorker/worker/service.ts)、[离线实现](https://github.com/ProtonMail/WebClients/blob/914d7520eff52aafed9a1adfe19859143bdf1dc9/applications/pass/src/app/ServiceWorker/worker/offline.ts) |
| Mastodon | [`a4ac5f5`](https://github.com/mastodon/mastodon/tree/a4ac5f5670942265804dbb261713e1ff0109a402) | [worker](https://github.com/mastodon/mastodon/blob/a4ac5f5670942265804dbb261713e1ff0109a402/app/javascript/mastodon/service_worker/sw.ts)、[缓存](https://github.com/mastodon/mastodon/blob/a4ac5f5670942265804dbb261713e1ff0109a402/app/javascript/mastodon/service_worker/caching.ts)、[缓存测试](https://github.com/mastodon/mastodon/blob/a4ac5f5670942265804dbb261713e1ff0109a402/app/javascript/mastodon/service_worker/caching.test.ts) |
| Excalidraw | [`c10499e`](https://github.com/excalidraw/excalidraw/tree/c10499eebb6267f24c056a03c5daf436aada0446) | [Vite PWA 与 manifest](https://github.com/excalidraw/excalidraw/blob/c10499eebb6267f24c056a03c5daf436aada0446/excalidraw-app/vite.config.mts)、[旧 worker 迁移](https://github.com/excalidraw/excalidraw/blob/c10499eebb6267f24c056a03c5daf436aada0446/public/service-worker.js)、[安装事件](https://github.com/excalidraw/excalidraw/blob/c10499eebb6267f24c056a03c5daf436aada0446/excalidraw-app/App.tsx) |
| Squoosh | [`e8d35e0`](https://github.com/GoogleChromeLabs/squoosh/tree/e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3) | [项目说明](https://github.com/GoogleChromeLabs/squoosh/tree/e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3)、[worker](https://github.com/GoogleChromeLabs/squoosh/blob/e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3/src/copy/sw.js) |
| Pinafore | [`eb975d8`](https://github.com/nolanlawson/pinafore/tree/eb975d82258f4e7d45f65b97c146e241c76a432d) | [项目与离线目标](https://github.com/nolanlawson/pinafore/tree/eb975d82258f4e7d45f65b97c146e241c76a432d)、[manifest](https://github.com/nolanlawson/pinafore/blob/eb975d82258f4e7d45f65b97c146e241c76a432d/src/build/manifest.json)、[worker](https://github.com/nolanlawson/pinafore/blob/eb975d82258f4e7d45f65b97c146e241c76a432d/src/service-worker.js) |
| Immich | [`d1faeb8`](https://github.com/immich-app/immich/tree/d1faeb8199f91607b0adafacdf8430b3881ff518) | [manifest](https://github.com/immich-app/immich/blob/d1faeb8199f91607b0adafacdf8430b3881ff518/web/static/manifest.json)、[worker](https://github.com/immich-app/immich/blob/d1faeb8199f91607b0adafacdf8430b3881ff518/web/src/service-worker/index.ts)、[请求合并](https://github.com/immich-app/immich/blob/d1faeb8199f91607b0adafacdf8430b3881ff518/web/src/service-worker/request.ts) |
| tldraw | [`49daf36`](https://github.com/tldraw/tldraw/tree/49daf36a417b91caac9ffd63744f60f812ef5e8f) | [manifest](https://github.com/tldraw/tldraw/blob/49daf36a417b91caac9ffd63744f60f812ef5e8f/apps/dotcom/client/public/manifest.webmanifest)、[自注销 worker](https://github.com/tldraw/tldraw/blob/49daf36a417b91caac9ffd63744f60f812ef5e8f/apps/dotcom/client/public/sw.js) |

## 如何使用这张表

如果你在选择**接入工具**，请看[PWA 工具能力对照](/introduction/tooling-comparison)；如果你在定义自己的产品范围，可把本表当作问题清单：哪些能力必须有，哪些能力需要安全边界，哪些能力必须进入真实设备发布门禁。不要以“别的项目也没做”替代自己的需求判断。
