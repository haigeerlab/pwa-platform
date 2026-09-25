# ADR-0029：Cloudflare 测试站按宿主隔离

## 状态

已接受（2026-09-20；项目所有者在部署规划讨论后要求继续）。云端项目名与具体 origin 尚未冻结，须按模块计划 T1 与检查点 A 复核。

## 背景

仓库已有 React/Vue Vite 示例、Nuxt SSR fixture 和一个 React Pages 冒烟站。真实 HTTPS 测试需要验证安装身份、Service Worker scope、静态资源、更新和恢复。把多个独立宿主合并到单个 Pages 项目的不同目录，会让项目级部署、回滚、凭据、资产归档和身份基线相互牵连；而按 PC/H5 分项目会把同一应用的不必要环境复制出来。

## 决策

- 同一 Cloudflare 账户下，每个宿主示例使用独立部署项目和 origin。React/Vue 静态示例各用 Pages Direct Upload；既有 `pwa-t15-mobile-smoke` 保留其冒烟职责，不改名或复用。
- Nuxt SSR 以独立 Worker 为候选，先证明当前 Nuxt 产物在 Cloudflare runtime 可运行，再决定正式项目和身份。Next/TanStack Start 没有当前可验收的平台宿主接入，不预建项目。同源多 PWA 属于另一个专门实验，不改变常规独立源默认值。
- PC 与 H5 是同一应用的测试设备类别，使用同一个站点；本期先取桌面证据，移动端继续列为未验证。
- 每个目标使用独立 staging 根、目标登记、真实 origin 的 `PwaIdentity`、槽位基线和发布记录。Pages `main` 与可安装预览的分支别名是不同 origin，须有各自身份；仅做内容预览时可禁用 PWA 注册。
- 本地 Direct Upload 解决 GitHub 暂不可用期间的测试部署，不放宽正式发布的浏览器、安全或恢复门禁。部署凭据不进入平台运行时包或仓库。

## 依据

[Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)规定单个上传目录、分支别名和不能原地切换到 Git 集成。[Cloudflare Pages 响应头](https://developers.cloudflare.com/pages/configuration/headers/)仅覆盖静态响应；SSR 头须由实际服务端设置。[Cloudflare Nuxt Workers 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/)提供候选托管路径，仓库兼容性仍须现场验证。既有身份与保留规则见 [ADR-0004](0004-identity-is-immutable-after-production-registration.md) 和 [ADR-0024](0024-release-retention-verification.md)。

## 备选方案

- 一个 Pages 项目按 `/react/`、`/vue/`、`/nuxt/` 混装：排除，独立示例需要独立 origin 与发布／回滚记录，且 Nuxt SSR 不是简单静态目录。
- PC、H5 各建一套项目：排除，测试设备维度不需要重复应用身份；只有真实不同业务应用或隔离要求才另立项目。
- 所有宿主都先建项目：排除，Nuxt、Next、Start 的 runtime 与平台接入证据不同，先建空项目会制造未经验证的公开入口。

## 影响

增加少量 Cloudflare 项目与目标登记维护成本，换取清晰的身份隔离和单宿主回滚。云端资源、身份基线、资产保留和上线验收仍按后续计划逐项实施，本 ADR 本身不构成部署成功证据。
