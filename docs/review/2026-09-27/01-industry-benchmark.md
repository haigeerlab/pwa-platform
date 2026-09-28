# 01 · 行业功能对标矩阵

核查日期：2026-09-27。本平台列以 npm 正式包 `0.1.0` 为准，工作区里尚未发布的能力单独标注。外部项目只采用其官方文档或官方仓库作为来源，来源列在文末；查不到来源的格子写 ❓，不把“没搜到”当作“不支持”。

本文是在已有对照材料上的补充：[website/introduction/tooling-comparison.md](../../../website/introduction/tooling-comparison.md) 已对比 vite-plugin-pwa、Workbox、PWABuilder、Progressier（核查日期 2026-09-26），本次新增 Serwist、Angular Service Worker、Next.js 官方指南及 next-pwa 现状、Ionic/Capacitor。

图例：✅ 内置 / 🔧 需要配置或自行编写 / ❌ 不提供 / ❓ 未确认。本平台列另外标注证据等级（L1 代码 / L2 自动化断言 / L3 真实桌面浏览器 / L4 真实手机，定义见[证据台账](../../operations/feature-evidence-ledger.md)）。

## 1. 能力矩阵

| 维度 | 本平台 0.1.0 | vite-plugin-pwa | Workbox | Serwist | Angular SW | Next.js 官方指南 | PWABuilder | Progressier |
|---|---|---|---|---|---|---|---|---|
| manifest 与安装 | ✅ 由身份和安装配置生成，`id` 稳定；构建期图标校验只在工作区（ADR-0040）· L4 | ✅ 插件生成 | ❌ | 🔧 需自行提供 | 🔧 `ng add @angular/pwa` 起步 | ✅ `app/manifest.ts` | ✅ 编辑器 | ✅ 托管 |
| 预缓存 / 应用壳 | ✅ 编译期生成清单并注入 · L4 | ✅ | 🔧 模块自行组装 | ✅ | ✅ `assetGroups` | ❌ 指南推荐 Serwist | 🔧 生成器模板 | 🔧 |
| 运行时缓存策略 | 🔧 需显式开启 v3 `runtimeCache`，仅限公共同源 GET，可选 `network-first`、`stale-while-revalidate` · L3 | ✅ 透传 Workbox | ✅ 全套策略 | ✅ `defaultCache` | 🔧 `dataGroups` | ❌ | 🔧 | 🔧 可视化配置 |
| **默认缓存是否安全** | ✅ **默认拒绝**：非 GET、跨源、`deny` 规则和未分类请求都不进缓存 · L3（导航）/ L2（其余类别） | ❓ 取决于宿主配置 | ❓ 由开发者组合 | 🔧 模板对静态资源用 SWR，导航走网络优先，没有“未分类即拒绝” | 🔧 `assetGroups` 默认全量预取 | ❌ 不涉及 | ❓ | ❓ |
| 离线回退页 | ✅ 平台默认离线页（中英文，适配窄屏）或自定义页 · L4 | 🔧 需配置 | 🔧 自行组合 | ✅ `fallbacks` | 🔧 | ❌（`useOffline` 只做连通性感知重试） | 🔧 | ✅ 厂商自述 |
| 导航网络超时 | ✅ `networkTimeoutSeconds`（1–30 秒）· L4 | 🔧 透传 Workbox | ✅ `NetworkFirst` 超时 | ✅ | ✅ `dataGroups` 超时 | ❌ | ❓ | ❓ |
| 离线写入 / 后台同步 | 🔧 显式、按会话绑定的队列，手动 `flush`，不用 Background Sync；**未发布** · L3 | 🔧 | ✅ `workbox-background-sync` | ✅ `BackgroundSyncQueue` | ❓ | ❌ | ❓ | ❓ |
| Web Push | 🔧 客户端订阅加 worker 端处理；**未发布** · L3（合成事件） | 🔧 | 🔧 | ❓ | ✅ `SwPush` | ✅ 指南附 web-push 示例 | ❓ | ✅ 付费核心功能 |
| 更新机制 | ✅ **只有提示更新**（`UPDATE_MODES = ["prompt"]`），不会自行 `skipWaiting`，也不 `clients.claim` · L4 | ✅ 默认 `prompt`，可选 `autoUpdate` | 🔧 只派发生命周期事件 | 🔧 模板默认 `skipWaiting` 加 `clientsClaim` | 🔧 `SwUpdate` | ❌ | ❓ | ❓ |
| 默认更新 UI | ✅ `PwaUpdateNotice`（React/Vue），可选开启 · L4 | 🔧 只给示例代码 | ❌ 官方明言由开发者负责 | ❓ | ❓ | 🔧 示例组件 | ✅ `<pwa-install>`（安装 UI，不是更新 UI） | ✅ 托管 |
| 故障恢复 / kill switch | ✅ 恢复 worker 发布到**同一个** `serviceWorkerUrl`，只清本应用前缀的缓存、不拦截 fetch · L3 + 演练记录 | ✅ `selfDestroying`（0.17.2 起清空 Cache Storage） | ❌ | ❓ | ✅ `safety-worker.js`；`ngsw.json` 返回 404 时自行注销 | ❌ | ❓ | ❓ |
| 入口迁移 / 备用源恢复页 | ✅ entry-resilience：由业务下发的入口清单驱动 · L4 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❓ |
| 多标签页协调 | ✅ 不做页面间通信：每个标签页各自观察浏览器的 `controllerchange`；一处确认，所有同 scope 标签页的提示都会清除 · L3 | ❓ | ✅ `isExternal` / `wasWaitingBeforeRegister` | ❓ | ❓ | ❌ | ❓ | ❓ |
| UI 多语言 | 🔧 离线页与恢复页内置 zh-CN 和 en；更新提示只有中文默认文案，通过 `messages` 覆盖 · L3 | 🔧 自绘 | ❌ | ❓ | ❓ | 🔧 | ❓ | ✅ 托管 |
| UI 主题 | 🔧 更新提示用 `colors` 和 CSS 变量；恢复页用 `setPwaTheme()`；离线页只跟随系统深浅色 · L3 | 🔧 自绘 | ❌ | ❓ | ❓ | 🔧 | ❓ | ❓ |
| 同源多应用拓扑 | ✅ 注册表加 `exclude` 规则，构建期校验冲突 · L3 | ❓ | ❌ | ❓ | ❓ | ❌ | ❓ | ❓ |
| 构建期产物校验 | ✅ build-verifier：产物、响应头、身份基线、发布保留期 · L2 为主 | ❌ | ❌ | ❌ | 🔧 CLI 生成 `ngsw.json` | ❌ | ❓ | ❓ |
| 身份不可变（scope / SW URL / manifest id） | ✅ 契约加发布门禁；门禁默认可跳过（见风险 R4）· L2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 兼容性声明 | ✅ 有浏览器矩阵文档；**自动化只覆盖 Chrome 桌面** | ❓ 未见矩阵 | ❓ | ❓ | ❓ | ✅ 列出 Push 的兼容范围 | ❓ | ❓ |
| 框架覆盖 | Vite 5/8 加 Vue 3.4+ / React 19；Nuxt 绑定**未发布** | Vite 生态，另有 Nuxt 版本 | 与框架无关 | Next.js 为主 | Angular | Next.js | 与框架无关 | 与框架无关 |
| 接入复杂度 | 中：身份、安装、策略三份配置加插件加 Provider（实测第一次构建即成功，见[接入报告](04-pc-onboarding-review.md)） | 低：官方称约 4 行配置 | 高：需要自行组装 | 中 | 中：需理解 `ngsw-config` | 高：官方列出 8 步手工流程 | 低：网页向导 | 最低：嵌入脚本 |

## 2. 维护状况

以下数据来自 GitHub API，查询于 2026-09-27。

| 项目 | Stars | 最新版本 | 最近提交 | Open issues | 判断 |
|---|---|---|---|---|---|
| vite-pwa/vite-plugin-pwa | 4,275 | v1.3.0（2026-05-05） | 2026-05-05 | 191 | 活跃 |
| vite-pwa/nuxt | 581 | v1.1.1（2026-02-06） | 2026-05-07 | 78 | 活跃，规模小 |
| GoogleChrome/workbox | 13,023 | v7.4.1（2026-05-05） | 2026-09-02 | 71 | 仍在维护 |
| serwist/serwist | 1,487 | 9.5.12（2026-07-22） | 2026-07-22 | 10 | 活跃 |
| angular/angular | 101,033 | v22.2.0（2026-09-23） | 2026-09-25 | 1,185 | 母仓库活跃，不能直接代表 SW 子模块 |
| pwa-builder/PWABuilder | 3,775 | GitHub Release 停在 2024-02 | 2026-09-24 | 65 | 仓库活跃，Release 记录滞后 |
| shadowwalker/next-pwa | 4,091 | — | 2024-07-27 | 138 | **事实上已停更** |
| DuCanhGH/next-pwa | 682 | 10.2.9（2024-09-18） | 2024-09-18 | 0 | **已停滞** |
| ionic-team/capacitor | 16,740 | 8.5.2（2026-09-11） | 2026-09-25 | 135 | 活跃，但 PWA 不是其核心 |
| **本平台** | — | 0.1.0（2026-09-26） | 2026-09-27 | — | 40 份 ADR、27 份模块规格；本次实测 2388 个单元用例、232 个 Chrome E2E 用例全部通过 |

## 3. 优势、缺口与有意取舍

### 本平台的优势（对标项目普遍没有）

1. **默认拒绝缓存**：8 个对标对象都没有声明“未分类请求默认不缓存”，本平台把它写进了契约，并有真实浏览器 E2E 证明（[offline.spec.ts:63-78](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/browser-tests/offline.spec.ts#L63)）。
2. **身份契约**：scope、SW URL、manifest id 和缓存命名空间统一建模，并纳入发布门禁。对标项目都把这些交给开发者自己保证。
3. **两层恢复**：恢复 worker 处理同源 SW 清场，entry-resilience 处理整个源不可用时的迁移，对标项目最多只有前者。
4. **构建期验证与发布证据体系**：build-verifier、ADR 和真机证据模板一应俱全。

### 缺口（对标项目有、本平台缺）

| 缺口 | 对标来源 | 判断 |
|---|---|---|
| 非 Chromium 浏览器的自动化验证 | —（对标项目同样不公开跨浏览器矩阵） | **真实缺口**，见建议 #3 |
| 多标签页中区分“本页发起的更新”与“别处早已在等的 worker” | workbox-window 的 `isExternal` | 目前靠浏览器统一的 `controllerchange` 已够用，属于低优先级增强。2026-09-28 评估后不采用，见[建议 #18 评估](07-recommendations.md#18-评估2026-09-28) |
| 声明式离线兜底插件 | Serwist `PrecacheFallbackPlugin` | 平台的回退链是固定的，属于有意取舍 |
| 离线写入走后台同步 | Workbox、Serwist | **有意取舍**（ADR-0027：显式、按会话绑定，不做静默重放） |
| 自动更新模式 | vite-plugin-pwa `autoUpdate`、Serwist | **有意取舍**（ADR-0005：只提示，从不强制刷新） |
| 单页应用的通配导航回退（任意路由回退到 `index.html`） | vite-plugin-pwa `navigateFallback` | **有意取舍**（ADR-0012：除离线页外，不返回其他路由的缓存内容），但文档没有向开发者讲清后果，见[接入报告](04-pc-onboarding-review.md) C-1 |
| 安装引导 Web Component | PWABuilder `<pwa-install>` | 只在需要支持非 Vue/React 宿主时才值得做 |
| 更新提示的 locale 切换与内置英文 | Progressier 托管 UI | 真实缺口，改动成本低，见建议 #9 |

### 被纠正的调研结论

对标调研子代理原本把 Angular 的 `safety-worker.js`（“部署到旧 SW 的同一 URL 即可生效”）列为可借鉴项。核对 [ADR-0012](../../adr/0012-platform-worker-runtime-config-and-recovery-worker.md) 后确认，本平台的恢复 worker 本来就发布到同一个 `serviceWorkerUrl`，这一点**已经具备**，不是缺口。

## 4. 来源

- vite-plugin-pwa：<https://vite-pwa-org.netlify.app/guide/>、<https://vite-pwa-org.netlify.app/guide/prompt-for-update.html>、<https://vite-pwa-org.netlify.app/guide/unregister-service-worker.html>
- Workbox：<https://developer.chrome.com/docs/workbox/modules/workbox-window>
- Serwist：<https://github.com/serwist/serwist>、<https://serwist.pages.dev/docs/next/getting-started>（官网抓取被拦截，依据搜索摘要交叉印证，可信度中）
- Angular：<https://angular.dev/ecosystem/service-workers/config>、<https://angular.dev/ecosystem/service-workers/devops>
- Next.js：<https://nextjs.org/docs/app/guides/progressive-web-apps>（页面标注更新于 2026-07-30）
- PWABuilder：<https://github.com/pwa-builder/PWABuilder>
- Ionic：<https://ionicframework.com/docs/react/pwa>（依据搜索摘要，可信度中）
- Progressier：<https://progressier.com/features/push-notifications>（厂商自述）
