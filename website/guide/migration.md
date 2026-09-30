# 从 vite-plugin-pwa 迁移

适用于已使用 <code>vite-plugin-pwa</code> 的 Vite + Vue 3 或 Vite + React 19 应用。迁移前先确认 Vite 5／8、框架版本和部署路径符合[兼容范围](/reference/compatibility)，并盘点线上已有的 worker URL、scope、manifest ID 和注册用户；已投产的 worker 切换需要单独的迁移与回滚方案。

## 先确认能不能迁

| 条件 | 要求 |
| --- | --- |
| Vite | <code>^5.0.0</code> 或 <code>^8.0.0</code> |
| 框架 | Vue <code>^3.4.0</code> 或 React <code>^19.2.0</code>；其他框架没有绑定，只能直接用 <code>@pwa-platform/client-runtime</code> |
| Vite <code>base</code> | 同源绝对路径，以 <code>/</code> 开头、以 <code>/</code> 结尾（例如 <code>/</code> 或 <code>/admin/</code>）；相对路径 <code>./</code> 或完整 URL 会在构建时报错 |
| 部署形态 | 一个源上只有这一个 PWA，或按共享 origin 登记表声明的根应用与子路径应用 |
| Vite <code>base</code> 与挂载路径 | <code>base</code> 必须与 <code>identity.mountPath</code> 完全相同；使用入口恢复（<code>pwaEntryResilience</code>）时不一致会报 <code>entry.base-mismatch</code> |
| scope 与 worker 目录 | <code>scope</code> 不能比 worker 脚本所在目录更宽，否则报 <code>identity.scope-outside-worker-directory</code>；平台不会用 <code>Service-Worker-Allowed</code> 放宽它 |

## 配置对应关系

| 原有做法 | PWA Platform 做法 |
| --- | --- |
| <code>VitePWA({ manifest })</code> | <code>pwa({ identity, install, policy, topology })</code> |
| <code>workbox.globPatterns</code> | <code>PwaPolicy.resources</code> 中的 <code>asset</code> 规则 |
| <code>workbox.runtimeCaching</code> | 只对明确的公共读取使用 v3 运行时缓存；私有接口不能直接照搬 |
| <code>navigateFallback</code> | <code>offlineFallback</code> 与导航资源规则；**没有**通配符式的应用壳兜底——未被精确预缓存的 history 路由深链接断网时得到的是网络错误页，不是应用壳，见[按功能接入](/guide/integration-by-capability)路径三的提示 |
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

<code>vite dev</code> 可加载 <code>virtual:pwa-config</code>，但不生成平台 worker；开发入口只应在生产构建注册。离线和更新请使用 <code>vite build</code> + <code>vite preview</code>，并在目标部署环境复核。

::: warning 有构建后混淆的项目
把 <code>pwa()</code> 放在混淆插件**之后**。如果混淆插件在 Vite 生成指纹文件名后改写代码，还必须给混淆插件设置固定的随机种子，并在相同源码上连续构建两次，比对所有同名 JS/CSS 文件的 SHA-256 是否一致。隔离环境中的实测：混淆步骤未设置固定随机种子时，同名 JS 文件内容在两次构建之间不同，而 worker 内容不变；设置固定种子后两次构建才稳定一致。不能用关闭文件指纹或只刷新页面来掩盖这个问题，因为旧页面仍可能请求同名但内容已改变的资源。
:::

## 核对自定义构建产物

迁移前查看生产产物：除了 <code>index.html</code> 和 <code>assets/</code>，应用启动是否还依赖其他脚本、样式或配置文件？策略按路径段匹配，不支持通配符；例如每次文件名都变化的根目录文件 <code>/_app-config-版本-哈希.js</code> 不会被 <code>/assets</code> 覆盖。真实接入试验中，遗漏该文件会使离线页面停在启动动画。

若宿主构建允许，将这类文件输出到固定子目录，例如把文件及 HTML 中引用它的地址一起改为 <code>/config/_app-config-版本-哈希.js</code>，再在 <code>POLICY.resources</code> 中增加：

~~~ts
{ pathPrefix: "/config", resourceClass: "asset", cache: "cache-first" },
~~~

子路径部署时，策略里仍写相对挂载点的 <code>/config</code>，而浏览器请求地址应带实际部署前缀。构建后在浏览器的 Cache Storage 检查启动必需文件是否入库，禁用 HTTP 缓存并断网重新打开页面。<code>compile.asset-rule-unmatched</code> 表示某条资产规则没有匹配到任何产物；没有这个警告也不代表所有启动文件已被覆盖。

迁移时以本站的[当前包状态](/reference/packages)与[公共读取规则](/guide/public-read-cache)为准。已有 worker 的 URL、scope 和 manifest ID 涉及浏览器身份，必须在目标业务项目制定迁移与回滚方案，不能直接照搬新项目的配置示例。

## 存量用户（旧 vite-plugin-pwa worker）

已投产的用户浏览器里仍带着旧 worker 及其注册。下面标注“浏览器行为”的部分由浏览器的 Service Worker 规范决定，不是平台可以改变的。

- 平台 worker 不会自行 <code>skipWaiting</code>，也从不调用 <code>clients.claim()</code>；接管只发生在用户确认（<code>applyUpdate()</code>）之后，或该应用所有标签页关闭之后。
- **新 worker 使用与旧 worker 相同的脚本地址时**（浏览器行为）：浏览器把它当作旧 worker 的一次更新，新 worker 安装后处于等待，直到调用 <code>applyUpdate()</code> 或所有标签页关闭。但用户手里已打开、仍在运行旧代码的页面没有 <code>applyUpdate()</code> 界面，只能等标签页全部关闭。
- **旧 worker 预缓存了 HTML 时**（浏览器行为）：在新 worker 接管前，用户看到的仍是旧应用壳，新 JS 不会被加载；需要等接管完成。
- **旧 worker 脚本地址被删除或返回 404 时**（浏览器行为）：旧注册可能继续保留并继续控制页面；而调用 <code>register()</code> 的新 JS 若因旧 worker 仍在提供旧壳而加载不到，新 worker 就没有机会注册，用户会停留在旧版本。

建议在身份中沿用旧 worker 的地址和 scope，让新平台 worker 以“更新”的形式替换旧 worker；或者在旧地址上部署恢复 worker：它安装即接管，没有 <code>fetch</code> 处理器，页面请求直接走网络；它只删除本应用平台命名空间下的缓存，不会删除 <code>vite-plugin-pwa</code> 留下的旧 Workbox 缓存。恢复 worker 的部署步骤见[服务器与 CDN 配置](/operations/hosting)，回滚与恢复流程见[部署与发布](/operations/release#回滚与恢复)。不要更换 scope、worker 地址或 manifest ID 而不制定迁移方案。

### 先弄清线上现状：旧 worker 的地址与 scope {#find-legacy-worker}

**平台不会猜测旧值。** 不要默认旧 worker 就是 <code>vite-plugin-pwa</code> 的默认文件名或默认 scope；身份里的 <code>serviceWorkerUrl</code> 与 <code>scope</code> 必须以线上实际为准。任选一种方式核对：

- **DevTools**：在生产站点打开 Application（应用）面板的 Service Workers，读取 Source（脚本地址）和 Scope；Cache Storage 里可以看到旧缓存的名字。
- **控制台**：在生产站点的控制台执行：

~~~js
const regs = await navigator.serviceWorker.getRegistrations();
regs.map((r) => ({
  scope: r.scope,
  script: (r.active ?? r.waiting ?? r.installing)?.scriptURL,
}));
~~~

  它只列出当前浏览器里、本 origin 下的注册；同一 origin 上若还有别的应用，会一并列出，只取属于你这个应用的那一条。<code>scope</code> 与 <code>script</code> 返回的是完整 URL，写进身份时改成路径（例如 <code>/sw.js</code>）。
- **读旧版构建产物**：查看当前生产 <code>dist</code>（或已部署的文件）里 worker 文件的实际名称，以及注册它的那段代码传入的 <code>scope</code>。

核对后，把新身份的 <code>serviceWorkerUrl</code> 和 <code>scope</code> 与线上旧值对齐（原则见上面的建议），并保证 <code>manifestId</code> 与已安装的应用一致；拿不准时先不要发布。

### 清理旧缓存（由业务自己负责） {#cleanup-legacy-caches}

平台 worker 与恢复 worker 都只处理自己命名空间下的缓存，即名字以 <code>pwa:&lt;appId&gt;:&lt;environment&gt;:</code> 开头的缓存。恢复 worker 遍历全部缓存名，但只删除以该前缀开头的；它有意不碰其他缓存，因为同一 origin 上可能还有别的应用，无法判断哪些是“旧的”。所以 <code>workbox-</code> 开头的旧缓存不会被自动删除，要业务自己清。

下面是一份可放进业务代码的参考写法，需要按你的旧构建核对名字规则：

~~~ts
// 只在平台 worker 已经控制本页之后执行，并且只执行一次（例如登录后空闲时）
async function cleanupLegacyCaches(): Promise<void> {
  if (!("caches" in globalThis) || navigator.serviceWorker.controller === null) return;
  // 平台缓存一律以 "pwa:" 开头，永远不删
  const isLegacy = (name: string) => !name.startsWith("pwa:") && name.startsWith("workbox-");
  for (const name of await caches.keys()) {
    if (isLegacy(name)) await caches.delete(name);
  }
}
~~~

使用前请核对：

- **名字规则只匹配你旧构建的产物。** <code>vite-plugin-pwa</code>（Workbox）的预缓存与运行时缓存名默认以 <code>workbox-</code> 开头，但如果旧配置里给 <code>runtimeCaching</code> 设了自己的 <code>cacheName</code>，需要在 <code>isLegacy</code> 里把这些具体名字列出来。先在 DevTools 的 Cache Storage 里确认真实名字，再写规则。
- **永远不要删“不以 <code>pwa:</code> 开头的全部缓存”。** 同一 origin 上其他应用的缓存、你自己业务代码建的缓存都在其中；务必保留 <code>!name.startsWith("pwa:")</code> 这一条，并且只删除能明确认定属于旧工具的名字。
- **等平台 worker 接管后再执行。** 接管之前旧 worker 可能还在用这些缓存回答请求，提前删除会让旧页面在断网时失去应用壳。
- Workbox 还会在浏览器的 IndexedDB 里留下名为 <code>workbox-expiration</code> 的过期记录库；它很小，通常可以忽略，是否删除由业务自己评估。平台的恢复 worker 只清理它为自己缓存留下的那部分记录。

### 仍在运行旧代码的页面

平台 worker 不会自行接管，所以发布后会有一段时间，一部分用户的页面还是旧代码：

- **已经打开、运行旧 JS 的页面**没有 <code>applyUpdate()</code> 界面，因为旧代码里没有调用平台 facade。用户看到的仍是旧界面，直到他们刷新或重新打开：重新打开时，是否已加载新版取决于此前那个 worker 是否已换成平台 worker，以及旧 worker 是否预缓存了 HTML（见上面几种情形）。
- **平台 worker 装好后进入等待**，在所有受控标签页关闭之前不会接管。用户关掉全部标签页（或完全退出已安装的应用）再打开，才由新 worker 接管并提供新应用壳；这一过程不需要用户做别的操作，但也没有提示。
- 平台**无法**向仍在运行的旧代码推送提示。业务可以做的：在新代码里接入[更新提示](/guide/updates)，让接管之后的每次发布都走用户确认流程；在运营上通过公告、登录后横幅等业务自己的渠道提示用户“关闭所有标签页后重新打开”；如果这部分用户的旧 worker 确实有问题，再走恢复 worker 流程。

如果旧 worker 用了 <code>skipWaiting</code> 与 <code>clientsClaim</code> 之类的自动更新设置，用户手里页面的行为与上面不完全一致；它取决于你线上实际部署过的那份旧构建，请在真实的旧版浏览器状态下（先装旧版、再升级到新构建）试一遍，不要凭推断。

## 迁移后暂时得不到的能力

- 任意运行时缓存：只支持显式允许的同源公共 GET；私有、写入、流媒体和未分类请求不缓存。
- 推送通知与显式离线写队列：相关包目前仍是工作区私有包，尚未公开发布；后台自动同步也未提供。
- manifest 的 <code>share_target</code>、自动更新模式（<code>autoUpdate</code>）、周期性后台同步、角标：不提供。

## 其他注意事项

- **旧缓存不会被平台自动清理。** 平台 worker 只管理自己命名空间下的缓存；<code>vite-plugin-pwa</code> 留下的 Workbox 缓存会一直留在已访问过的用户浏览器里，需要自行评估存储占用或提供清理方案，见上面的[清理旧缓存](#cleanup-legacy-caches)。
- **同一 scope 只有一个注册。** 用新的 worker 脚本地址重新注册会替换原注册；原 worker 在所有受控标签页关闭前，仍会继续控制已打开的页面。
- 构建报错只给诊断码和契约路径，不会回显配置的值。
- 若你使用的框架脚手架会在产物根目录生成文件名随构建变化的运行时配置脚本（例如某些后台管理框架模板），记得按上面"核对自定义构建产物"一节把它移入固定子目录并补一条 <code>asset</code> 规则，否则断网时应用会停在启动画面。
