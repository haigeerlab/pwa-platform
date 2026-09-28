# 离线体验

平台的基础目标是：用户在线访问过应用后，离线时仍能打开已缓存的应用壳。它不会自动把所有路由、API 或用户数据变成离线可用。

## 静态资源与导航

策略里的 <code>asset</code> 规则控制哪些构建资源进入预缓存；<code>navigation-public-static</code> 规则控制公共导航。两者需要配合：仅写导航规则，不会让 HTML 或 JS 自动进入预缓存。最小规则见[身份与策略配置](/guide/configuration)。

配置示例中的 <code>pathPrefix: "/"</code> 会匹配该 scope 内的所有导航。未开启 v3 公共动态页面缓存时，worker 会原样返回在线响应，**不会把网络返回的页面写入运行时缓存**；断网时依次尝试该 URL、去掉查询参数的路径及该路径的 <code>index.html</code>（仅限已预缓存的文件），最后显示通用离线页。因此私有路由也可能显示离线页，但不会从运行时缓存取出先前的个性化响应。若要用 v3 缓存动态 HTML，只能为经过评审的公共页面写明确的 <code>navigation-public-dynamic</code> 路径规则，不能将带登录态或权限差异的页面纳入其中。

## 默认离线页

在策略中开启回退，声明离线页的资产规则，然后在 Vite 插件上写 <code>offlinePage: {}</code>：

~~~ts
offlineFallback: { enabled: true, path: "/offline.html" },
resources: [
  // 其他资源规则……
  { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
],
~~~

~~~ts
pwa({
  identity: IDENTITY,
  policy: POLICY,
  install: INSTALL,
  topology: { kind: "standalone-origin" },
  offlinePage: { locale: "zh-CN" },
})
~~~

生成页会显示应用名，支持亮暗主题。也可以由应用自行提供 <code>public/offline.html</code>，此时不要同时开启生成选项，否则构建会报告路径冲突。

离线页只在导航请求失败（网络错误）或超时时展示；只要服务器确实返回了响应，无论状态码是 200 还是 4xx／5xx，worker 都会原样返回该响应，不会替换成离线页。不要把离线页当作“服务器故障页”。

## 弱网超时

可在 v1、v2 或 v3 策略中设置 <code>networkTimeoutSeconds</code>，取值为 1–30 秒，默认关闭。导航超时且有可用回退时，worker 会先返回回退；没有回退时继续等待网络。此设置不会给业务代码直接发出的 API 请求加超时。

生产应用只要使用 <code>network-first</code> 导航，就应显式决定这个值。iPhone 真机物理断网对照中，未配置时约 60 秒才从白屏回退，配置 5 秒后约 5 秒显示缓存或离线页；这不是所有 Safari 版本的固定时长，但证明不能依赖浏览器自行超时。建议从 5 秒开始，再按真实用户网络和首屏目标调整，并在支持的手机上做物理断网冷启动。

~~~ts
networkTimeoutSeconds: 5,
~~~

## 公共读取的运行时缓存

<code>PwaPolicy v3</code> 可显式开启公共读取缓存。它只适用于明确允许的同源 GET 公共响应，并要求数量、单项大小与最长存活时间上限。<code>public-data</code> 支持 network-first 或 stale-while-revalidate；<code>navigation-public-dynamic</code> 仅支持 network-first。v1、v2 或 v3 且未开启时，这些未预缓存请求照旧透传。

**先确认数据绝对不按用户、Cookie 或权限变化。** 平台 worker 读不到响应的 <code>Set-Cookie</code>，也不靠请求的凭据模式判断数据是否公开；会设置 Cookie 的路径不应进入缓存规则，私有响应必须带 <code>Cache-Control: private</code>。配置示例、响应准入与验证步骤见[公共读取缓存](/guide/public-read-cache)。

## 断网与恢复

无需任何配置。平台**不提供**在线／离线状态 API：客户端 facade、Vue 和 React 绑定都没有暴露 <code>online</code>／<code>offline</code> 事件或状态。网络恢复后，只有平台生成的默认离线页会自动探测并 <code>location.reload()</code> 自己——这段脚本只存在于离线页本身，不是给业务路由页面用的能力。业务页面停留在断网状态下发出的请求，需要自己实现重试；平台不会在网络恢复时通知应用或自动重放任何请求。
