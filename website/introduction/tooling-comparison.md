---
pageClass: tooling-comparison
---

# PWA 工具能力对照

PWA Platform 面向已有业务应用：由应用声明身份、安装信息和允许缓存的资源，平台生成并校验 PWA 产物。选择工具时，先看它位于构建、Service Worker、用户体验还是发布环节。同一个应用可以组合多种工具，表中的描述不表示某工具无法通过额外代码完成其他能力。

**核查日期：2026-09-26。**“本平台”列描述 npm 正式包 `0.1.0`（`latest`）。外部产品依据文末官方资料核对；其功能可能随版本变化。手机上可横向滑动表格。

## 构建与 Service Worker 工具

| 维度 | 本平台 `0.1.0` | vite-plugin-pwa | Workbox |
| --- | --- | --- | --- |
| 接入位置 | Vite 5／8 构建插件 + Vue／React 页面绑定 | Vite 插件，可选生成或自行编写 Service Worker | 可组合的 Service Worker、页面和构建模块；开发者自行组织应用接入 |
| 安装信息 | 通过安装配置生成带稳定 `id` 的 manifest；图标等文件由业务提供 | 插件配置 manifest，可结合资源生成工具 | 提供缓存与 Service Worker 相关模块；应用另行组织 manifest |
| 离线与缓存 | 应用壳预缓存、离线回退；公共同源 GET 须按策略显式开启；私有、写入、流媒体和未分类请求默认拒绝缓存 | 支持预缓存、运行时缓存与自定义 worker；缓存范围取决于宿主配置和 worker 代码 | 提供预缓存、路由与多种运行时缓存策略；缓存范围由开发者组合决定 |
| 更新交互 | 页面绑定暴露等待状态、检查和接管方法；可显式启用默认提示 UI，也可由业务自绘；刷新时机由业务决定 | 注册模块有待更新回调与更新函数；业务在回调里展示提示，也可选择自动更新 | `workbox-window` 提供等待等生命周期事件；业务组织接管与提示 |
| 构建与恢复 | 构建期校验平台产物，另有恢复 worker；真实部署、旧资源保留和恢复演练仍由发布方负责 | 生成或编译 worker 并注入预缓存清单；业务负责其部署与恢复流程 | 提供构建、预缓存和运行时模块；业务负责串成完整交付链路 |

这些差异主要来自封装层级。本平台把身份、缓存准入和产物校验设为统一契约；vite-plugin-pwa 给 Vite 应用更直接的 Service Worker 配置和自定义空间；Workbox 是两者都可以利用的底层模块。详情见 [vite-plugin-pwa 的预缓存与自定义 worker](https://vite-pwa-org.netlify.app/guide/inject-manifest)、[更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)、[Workbox 模块目录](https://developer.chrome.com/docs/workbox/modules)和 [workbox-window 生命周期事件](https://developer.chrome.com/docs/workbox/modules/workbox-window)。本平台的公开契约见[能力与边界](/introduction/capabilities)、[缓存策略](/guide/public-read-cache)及[发布检查](/start/checklist)。

## 与产品化工具的侧重点

| 工具 | 官方资料明确提供的方向 | 与本平台的选择关系 |
| --- | --- | --- |
| [PWABuilder](https://github.com/pwa-builder/PWABuilder) | PWA Starter 模板、PWA Studio 开发工具和应用商店打包 | 适合从模板建新项目或准备商店包；本平台侧重把 PWA 策略接入已有 Vite 业务应用。若有商店分发需求，可另行评估 PWABuilder。 |
| [Progressier](https://progressier.com/)（商业服务） | 安装页与安装组件、可视化 manifest、Push 发送界面和 API、统计 | 适合希望由服务提供安装推广和通知运营界面的团队；本平台正式包不提供这些托管服务。平台工作区的 Push 包也尚未公开发布。 |

上表只描述官方资料明确展示的产品方向，不能据此推断它们没有其他能力。商业服务的功能、套餐和价格会变化，采用前以其当时的官方说明为准。

## 已交付的接入体验

以下能力先在 beta.2 交付，现已纳入 `0.1.0` 正式包：

| 能力 | 用户可感知的结果 | 当前状态 |
| --- | --- | --- |
| Vite 5 兼容与 `vite dev` 虚拟模块 | 可在 Vite 5 + Vue 3.4 项目中进行接入与本地开发 | 0.1.0 已发布；独立消费项目从包归档安装并构建通过 |
| Vue／React 可选更新提示 UI | 业务显式挂载后显示更新卡片；位置、文案、表面与按钮色值可配置 | 0.1.0 已发布；真实业务项目仍需自行验收 |
| 可选入口恢复 | 事先存入合法备用入口清单，域名迁移或故障时向已安装用户显示恢复页 | `@pwa-platform/entry-resilience@0.1.0` 已公开；业务负责清单来源和新地址身份验证 |

更新分为两个动作：新的 Service Worker 先安装并准备资源，用户确认后由它接管；**刷新页面**才会重新运行当前页面的应用代码。默认卡片在接管后提供“刷新页面”按钮，不会自行刷新。若业务有未保存表单，可配置刷新处理并安排刷新时机。详细交互见[安装与更新](/guide/updates)。网页本身没有刷新却继续运行旧 JavaScript 的问题，在未使用 PWA 的单页应用中也可能存在；接入 PWA 后仍需由业务处理页面状态和刷新体验。

## 为什么没有直接复制应用截图的圆点矩阵

Elk、Home Assistant、Excalidraw 等是具体应用，本平台是供应用接入的库。它们的公开仓库、实际部署和用户界面可能对应不同版本。仅凭截图无法可靠判定某项能力“没有”或“部分实现”。如果后续增加应用案例，将逐个核对对应版本的官方源码、公开文档与实际行为，并注明核查日期；不会把这张工具对照表当成应用评分。
