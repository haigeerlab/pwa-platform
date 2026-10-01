# 01 · 行业功能对标

核查日期 2026-10-01。本平台列以公开 `0.2.5` 为准；工作区新能力另注。✅ 文档明确提供；🔧 需用户配置/编写；— 不属于该工具的职责；? 官方资料未核实。对方产品功能按**官方声明**记载，不把文档没有提到的能力写成“不支持”。

| 维度 | 本平台 0.2.5 | vite-plugin-pwa | Workbox | Serwist / Next | Angular SW | Next.js 官方指南 | PWABuilder | Progressier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| manifest/安装 | ✅ 生成、图标校验 | ✅ | 🔧 | 🔧 | ✅ `ng add` | ✅ `manifest.ts` | ✅ 向导 | ✅ 托管 |
| 应用壳/预缓存 | 🔧 显式资源规则 | ✅ | 🔧 | ✅ | ✅ `assetGroups` | 🔧 自建 SW | 🔧 模板 | ? |
| 公共读取缓存 | 🔧 v3、同源 GET、准入门禁 | 🔧 Workbox 配置 | ✅ 多策略 | ✅ `runtimeCaching` | ✅ `dataGroups` | 🔧 自建 | ? | ? |
| 未分类/私有请求 | ✅ 默认不缓存 | 由配置决定 | 由使用者决定 | 由配置决定 | 由规则决定 | 由使用者决定 | ? | ? |
| 离线页 | 🔧 默认页或自备页 | 🔧 | 🔧 | ✅ fallback 配置 | 🔧 | 🔧 | ? | ? |
| 更新 | ✅ 用户确认；UI 可选 | ✅ 提示或自动重载 | 🔧 生命周期 API | 🔧 示例默认立即接管 | ✅ `SwUpdate` | 🔧 示例 | ? | ? |
| 恢复/下线 worker | ✅ 同 URL 恢复 worker | ✅ `selfDestroying` | 🔧 自建 | ? | ✅ safety worker | 🔧 自建 | ? | ? |
| Origin 迁移入口 | 🔧 独立恢复页与业务清单 | ? | — | ? | ? | ? | ? | ? |
| 多标签页 | ✅ 各页监听 `controllerchange` | ? | ✅ `workbox-window` 生命周期信息 | ? | ? | ? | ? | ? |
| 多语言/主题 | 🔧 更新、离线、恢复页分别配置 | UI 自建 | UI 自建 | UI 自建 | UI 自建 | UI 自建 | ? | ? |
| Push/离线写 | 工作区私有，未发布 | 🔧 | ✅ Background Sync 模块 | 🔧 | ✅ Push | 🔧 Push 示例 | ? | ✅ Push（厂商声明） |
| 发布身份/响应头门禁 | ✅ 纯函数验证；编排器调用 | ? | — | ? | ? | ? | ? | ? |
| 宿主/接入负担 | Vite Vue/React；身份+策略+插件+绑定，中 | Vite 插件，低 | 需组装，较高 | Next 插件，中 | Angular CLI+配置，中 | 手工步骤，较高 | 向导，低 | 脚本/托管，低 |

**维护与证据**：这些项目的官方文档及仓库今天可访问；本轮没有重新统计 stars、issue、发布频率或对方真实设备测试，因此不据此排成熟度名次。当前项目十包 `0.2.5` 有可追溯候选门禁和 registry 读回；非 Chrome 与手机矩阵仍不阻断发布。外部资料不等于同等强度的测试证据。

| 交付成熟度维度 | 本平台 | 外部项目可由本轮官方资料确认的范围 | 尚不能比较的部分 |
| --- | --- | --- | --- |
| 桌面/手机兼容 | Chrome 0.2.5 发布门禁；Edge、Safari、Firefox、Android、iPhone 有分项自动化/人工记录 | Angular、Next、Vite PWA、Serwist 的文档描述接入和浏览器能力，Workbox 文档解释 API | 对方未在本轮给出与本平台同口径的逐功能实体设备结果；不能填“对方无测试” |
| 功能完成度 | 十个公开包与三项私有工作区能力分开；portable/MIME 待发布 | Vite PWA、Workbox、Serwist、Angular 的文档有可执行配置/API；Next 指南是手工 PWA 构建步骤；PWABuilder/Progressier 是不同产品层 | 不执行外部项目同一业务 fixture，无法给百分比或统一成熟度分数 |
| 测试与维护 | 本仓库发布记录、跨平台矩阵、ADR/规格、持续台账可追溯 | 官方文档与开源仓库当前可访问；Progressier 功能是厂商自述 | 本轮未重新统计外部 CI、测试数量、issue 解决时长、最新发布；状态为“未核实” |
| 文档/接入 | 身份与发布约束较多，有按功能指南和 0.2.5 registry 接入读回 | Vite PWA/Angular/Serwist/Next 均有官方入门；PWABuilder 提供向导 | 不同产品目标不同；没有同条件限时新人实验，不能简单排“谁最快” |

## 优势、缺口、取舍

| 差异 | 本轮判断 | 行动 |
| --- | --- | --- |
| 默认拒绝未分类和非公共数据，身份/发布事实建模 | 平台优势，已由代码及分项测试支持；不宣称其他工具“没有安全性” | 保持契约和跨端回归 |
| Workbox/Serwist 更广的策略与 Background Sync 自动重放 | **有意收窄**：平台只开放审查过的公共 GET；离线写要求显式 flush 与服务端幂等 | 在接入文档解释取舍，不直接外露 Workbox |
| `vite-plugin-pwa` 自动重载与通配 `navigateFallback` | **有意取舍**：用户确认接管；离线导航只查同一路径/离线页 | 提醒 SPA 深链可能失败或白屏，提供离线页 |
| Angular safety worker | 平台已有同 URL 恢复 worker；实现细节不同 | 保留真实恢复演练 |
| 现成跨框架、低步骤接入 | 真实体验差距；平台身份/发布约束带来额外步骤 | 加最小配方、接入自检 |
| 产品化多端发布保证 | **证据缺口**：当前多端测试存在，但不构成 Android N/N-1 与业务生产验收 | 补 N-1、真实故障与安装形态 |
| 可移植多域名构建 | 当前工作区具备，`0.2.5` 尚无此契约 | 发布前做双真实 HTTPS origin 演练 |

可借鉴而不改变安全取舍的做法：参考 [vite-plugin-pwa 的提示/自动更新分章](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)把“检测、接管、刷新”分别教给接入者；参考 [Angular safety worker 运维说明](https://angular.dev/ecosystem/service-workers/devops)在恢复手册写清旧客户端可能长期保留旧脚本、事故脚本需在原 URL 保留多久；参考 [Workbox window 生命周期说明](https://developer.chrome.com/docs/workbox/modules/workbox-window)补充标签页之间的更新时序图。借鉴的是说明和测试场景，不引入自动刷新或自动离线写重放。

## 官方来源

- [vite-plugin-pwa 更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)、[自动重载](https://vite-pwa-org.netlify.app/guide/auto-update.html)、[Workbox 配置](https://vite-pwa-org.netlify.app/workbox/generate-sw.html)
- [Workbox 策略](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)、[后台同步](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)、[workbox-window](https://developer.chrome.com/docs/workbox/modules/workbox-window)
- [Serwist Next 入门](https://serwist.pages.dev/docs/next/getting-started)、[运行时缓存](https://serwist.pages.dev/docs/serwist/runtime-caching)
- [Angular SW 配置](https://angular.dev/ecosystem/service-workers/config)、[恢复与 safety worker](https://angular.dev/ecosystem/service-workers/devops)
- [Next.js PWA 指南](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [PWABuilder 官方仓库](https://github.com/pwa-builder/PWABuilder)、[Progressier Push（厂商资料）](https://progressier.com/features/push-notifications)

项目内部实现与证据见[02](02-feature-support.md)和[03](03-feature-evidence.md)。
