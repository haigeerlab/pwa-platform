# 从 vite-plugin-pwa 迁移

适用于已使用 <code>vite-plugin-pwa</code> 的 Vite + Vue 3 或 Vite + React 19 应用。迁移前先确认 Vite 8、框架版本和部署路径符合[兼容范围](/reference/compatibility)，并盘点线上已有的 worker URL、scope、manifest ID 和注册用户；已投产的 worker 切换需要单独的迁移与回滚方案。

## 配置对应关系

| 原有做法 | PWA Platform 做法 |
| --- | --- |
| <code>VitePWA({ manifest })</code> | <code>pwa({ identity, install, policy, topology })</code> |
| <code>workbox.globPatterns</code> | <code>PwaPolicy.resources</code> 中的 <code>asset</code> 规则 |
| <code>workbox.runtimeCaching</code> | 只对明确的公共读取使用 v3 运行时缓存；私有接口不能直接照搬 |
| <code>navigateFallback</code> | <code>offlineFallback</code> 与导航资源规则 |
| <code>registerType: "prompt"</code> | <code>updateWaiting</code> + <code>applyUpdate()</code> |
| <code>registerType: "autoUpdate"</code> | 无直接对应；平台要求用户确认接管 |
| <code>virtual:pwa-register</code> | 框架绑定提供 <code>register()</code>，由应用主动调用 |

## 迁移步骤

1. 记录现有线上注册和资源缓存行为，特别是已有运行时缓存、离线页和更新提示。
2. 在 Vite 配置中移除 <code>VitePWA()</code>，删除 <code>virtual:pwa-register</code> 引用；两个插件不应同时生成 worker 和 manifest。
3. 按[身份与策略配置](/guide/configuration)写平台配置。策略路径相对 <code>mountPath</code>，不是直接复制原插件的 glob。
4. 接入[Vite + Vue](/start/vue)或[Vite + React](/start/react)绑定，并显式调用 <code>register()</code>。
5. 用[安装与更新](/guide/updates)替代原来的自动接管或自建版本轮询提示。
6. 用生产构建及预览验证，再在目标环境完成[上线前检查](/start/checklist)和 worker 切换演练。

开发服务器不提供平台 worker；离线和更新行为要在生产构建及部署环境验证。旧项目若把带指纹的运行时配置文件放在产物根目录，需要先调整产物路径，让可预缓存的文件落入明确的路径前缀，再写相应的 <code>asset</code> 规则。

迁移时以本站的[当前包状态](/reference/packages)与[公共读取规则](/guide/public-read-cache)为准。已有 worker 的 URL、scope 和 manifest ID 涉及浏览器身份，必须在目标业务项目制定迁移与回滚方案，不能直接照搬新项目的配置示例。
