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
2. 在 Vite 配置中移除 <code>VitePWA()</code>，删除 <code>virtual:pwa-register</code> 引用；两个插件不应同时生成 worker 和 manifest。检查原有 HTML：平台会注入 manifest 链接，旧链接若是相对地址、重复或指向不同 URL，需删除或改为与新身份一致；页面含 <code>&lt;base&gt;</code> 也会使构建失败，详见[配置规则](/guide/configuration)。
3. 按[身份与策略配置](/guide/configuration)写平台配置。策略路径相对 <code>mountPath</code>，不是直接复制原插件的 glob。
4. 接入[Vite + Vue](/start/vue)或[Vite + React](/start/react)绑定，并显式调用 <code>register()</code>。
5. 用[安装与更新](/guide/updates)替代原来的自动接管或自建版本轮询提示。
6. 用生产构建及预览验证，再在目标环境完成[上线前检查](/start/checklist)和 worker 切换演练。

当前插件只在生产构建中提供 <code>virtual:pwa-config</code> 和平台 worker；按接入示例替换页面入口后，<code>vite dev</code> 无法加载该虚拟模块。本地验证请使用 <code>vite build</code> + <code>vite preview</code>，离线和更新行为还需在目标部署环境复核。

## 核对自定义构建产物

迁移前查看生产产物：除了 <code>index.html</code> 和 <code>assets/</code>，应用启动是否还依赖其他脚本、样式或配置文件？策略按路径段匹配，不支持通配符；例如每次文件名都变化的根目录文件 <code>/_app-config-版本-哈希.js</code> 不会被 <code>/assets</code> 覆盖。真实接入试验中，遗漏该文件会使离线页面停在启动动画。

若宿主构建允许，将这类文件输出到固定子目录，例如把文件及 HTML 中引用它的地址一起改为 <code>/config/_app-config-版本-哈希.js</code>，再在 <code>POLICY.resources</code> 中增加：

~~~ts
{ pathPrefix: "/config", resourceClass: "asset", cache: "cache-first" },
~~~

子路径部署时，策略里仍写相对挂载点的 <code>/config</code>，而浏览器请求地址应带实际部署前缀。构建后在浏览器的 Cache Storage 检查启动必需文件是否入库，禁用 HTTP 缓存并断网重新打开页面。<code>compile.asset-rule-unmatched</code> 表示某条资产规则没有匹配到任何产物；没有这个警告也不代表所有启动文件已被覆盖。

迁移时以本站的[当前包状态](/reference/packages)与[公共读取规则](/guide/public-read-cache)为准。已有 worker 的 URL、scope 和 manifest ID 涉及浏览器身份，必须在目标业务项目制定迁移与回滚方案，不能直接照搬新项目的配置示例。
