# 离线体验

平台的基础目标是：用户在线访问过应用后，离线时仍能打开已缓存的应用壳。它不会自动把所有路由、API 或用户数据变成离线可用。

## 静态资源与导航

策略里的 <code>asset</code> 规则控制哪些构建资源进入预缓存；<code>navigation-public-static</code> 规则控制公共导航。两者需要配合：仅写导航规则，不会让 HTML 或 JS 自动进入预缓存。最小规则见[身份与策略配置](/guide/configuration)。

**预缓存内容**：只有被 <code>asset</code> 规则匹配到的构建文件，加上开启回退时的离线页，才会进入预缓存；worker 自身、manifest 和 <code>.map</code> 文件不会进入。安装是整体的：只要有一个预缓存 URL 取回失败，整个新 worker 就安装失败，旧版本继续服务。某条 <code>asset</code> 规则没有匹配到任何构建文件时，构建给出 <code>compile.asset-rule-unmatched</code> 警告（不阻断），通常是路径写错或产物路径变了。带 <code>Range</code> 头的请求不走预缓存，直接交给网络，因为预缓存保存的是完整响应。

配置示例中的 <code>pathPrefix: "/"</code> 会匹配该 scope 内的所有导航。未开启 v3 公共动态页面缓存时，worker 会原样返回在线响应，**不会把网络返回的页面写入运行时缓存**；断网时的候选只有：该 URL 本身、去掉查询参数的同一路径、该路径下的 <code>index.html</code>（仅限已预缓存的文件），最后是离线页。平台**没有**应用壳通配回退，不会退回根 <code>index.html</code>，所以未单独预缓存的 history 路由断网直接打开会落到离线页（或没开离线页时的浏览器网络错误页）。服务器返回的 4xx／5xx 响应原样交给页面，不进入这条回退。因此私有路由也可能显示离线页，但不会从运行时缓存取出先前的个性化响应。若要用 v3 缓存动态 HTML，只能为经过评审的公共页面写明确的 <code>navigation-public-dynamic</code> 路径规则，不能将带登录态或权限差异的页面纳入其中。

## 默认离线页

在策略中开启回退，然后在 Vite 插件上写 <code>offlinePage: {}</code>。为离线页单独写一条 <code>asset</code> 规则是可选的：编译器会自动把离线页加入预缓存，真正的要求是该路径的文件存在于构建产物中，且没有被拒绝规则覆盖（否则分别以 <code>compile.offline-fallback-not-built</code>、<code>compile.offline-fallback-denied</code> 失败）：

~~~ts
offlineFallback: { enabled: true, path: "/offline.html" },
resources: [
  // 其他资源规则……
  // 离线页无需单独的 asset 规则
],
~~~

~~~ts
import { pwa } from "@pwa-platform/vite";

// 在 vite.config.ts 中；IDENTITY、INSTALL、POLICY 见配置指南中的完整配置
pwa({
  identity: IDENTITY,
  policy: POLICY,
  install: INSTALL,
  topology: { kind: "standalone-origin" },
  offlinePage: { locale: "zh-CN" },
})
~~~

完整的 <code>IDENTITY</code>／<code>INSTALL</code>／<code>POLICY</code> 与 <code>vite.config.ts</code> 见[配置指南](/guide/configuration#在-vite-config-ts-中接入)。

生成页会显示应用名，支持亮暗主题。也可以由应用自行提供 <code>public/offline.html</code>，此时不要同时开启生成选项，否则构建会报告路径冲突。以下情况构建会直接失败：

| 诊断码 | 原因 |
| --- | --- |
| <code>vite.offline-page-without-fallback</code> | 设置了 <code>offlinePage</code>，但策略没有开启 <code>offlineFallback</code> |
| <code>vite.offline-page-conflict</code> | 该路径上已有文件（例如自带的 <code>public/offline.html</code>）；二选一 |
| <code>vite.offline-page-locale-invalid</code> | <code>locale</code> 不是 <code>zh-CN</code> 或 <code>en</code> |
| <code>vite.offline-page-message-invalid</code> | <code>messages</code> 有未知键、空串、非字符串，或超过 200 个字符 |
| <code>vite.offline-page-css-invalid</code> | <code>css</code> 不是字符串，或含 <code>&lt;/style</code>（不区分大小写） |
| <code>compile.offline-fallback-not-built</code> | 开启了 <code>offlineFallback</code>，但构建产物里没有该路径的文件：写 <code>offlinePage</code> 或提供 <code>public/offline.html</code> |
| <code>compile.offline-fallback-denied</code> | 离线页路径被某条拒绝规则覆盖 |

离线页只在导航请求失败（网络错误）或超时时展示；只要服务器确实返回了响应，无论状态码是 200 还是 4xx／5xx，worker 都会原样返回该响应，不会替换成离线页。不要把离线页当作“服务器故障页”。

语言在**构建时固定**，默认 <code>zh-CN</code>，不会按浏览器语言切换；<code>messages</code> 可逐项覆盖内置的 <code>documentTitle</code>、<code>heading</code>、<code>body</code>、<code>retry</code> 四个键，应用名称取自 <code>install.name</code>。<code>css</code> 只能**追加**为第二个 `<style>`，不能替换默认样式；可覆盖的变量为 <code>--pwa-offline-bg</code>、<code>-fg</code>、<code>-muted</code>、<code>-accent</code>、<code>-accent-fg</code>、<code>-radius</code>、<code>-max-width</code>、<code>-font</code>，class 为 <code>pwa-offline</code>、<code>pwa-offline__app</code>、<code>pwa-offline__heading</code>、<code>pwa-offline__body</code>、<code>pwa-offline__retry</code>；表上没有的都不是契约。离线页是独立静态文档，CSS 支持 <code>[data-theme]</code> 选择器写法，但没有任何脚本会去设置它，实际只跟随系统的亮暗偏好。

本工作区下一候选版本的默认提示为“暂时无法连接”，覆盖网络失败和服务慢响应。新恢复脚本通过控制它的 worker 从网络读取当前文档，不再以 HEAD worker 成功判断业务恢复。worker 校验受控客户端、同源和 scope；探测采用 GET、`no-store`、禁止跳转，要求 200 HTML 和非空首个正文块，三秒超时，不写入平台缓存。这仅证明文档入口可达，不证明全部 API、脚本或渲染已恢复，也不保证绕过 CDN。

可见页至少等待十秒后检查，两次相隔至少十秒的连续成功才自动刷新；失败按十、二十、四十、六十秒退避。隐藏页不刷新，online 事件不绕过冷却。每标签页、每 worker 脚本路径最多自动刷新一次，预算通过 sessionStorage 跨重载保存；时间经过和探测成功不重置它，用户点击“重试”才开启新周期。一次自动恢复成功后，再次发生故障也可能需要手动重试。这是防止循环刷新所采用的保守边界。

旧 worker 不支持协议、没有 controller、存储不可用或回复不可信时，只保留手动重试。探测慢于三秒时可能无法自动恢复，但手动导航仍可以在宿主的五／十秒预算内成功。脚本被 CSP 阻断时文案和按钮仍可见，按钮刷新及自动恢复均需要脚本获准执行。严格 CSP 下，把构建日志打印的默认样式、宿主 `css`、脚本哈希分别放行 `style-src`／`script-src`；升级后重新取值，并确保 worker 的 CSP 允许同源连接。

以上变更须升级包、重新构建并部署后才生效；不能视为当前 NPM 0.3.2 或现有线上产物已经具有此行为。

## 弱网超时

可在 v1、v2 或 v3 策略中设置 <code>networkTimeoutSeconds</code>，取值为 1–30 秒，默认关闭。导航超时且有可用回退时，worker 会先返回回退；没有回退时继续等待网络。此设置不会给业务代码直接发出的 API 请求加超时。

写成 0、31 或小数等非法整数秒时，构建失败并给出诊断码 `schema.invalid-value`，路径 `/policy/networkTimeoutSeconds`；写成字符串等错误类型时为 `schema.invalid-type`。

生产应用只要使用 <code>network-first</code> 导航，就应显式决定这个值。iPhone 真机物理断网对照中，未配置时约 60 秒才从白屏回退，配置 5 秒后约 5 秒显示缓存或离线页；这不是所有 Safari 版本的固定时长，但证明不能依赖浏览器自行超时。建议从 5 秒开始，再按真实用户网络和首屏目标调整，并在支持的手机上做物理断网冷启动。

~~~ts
// 写在 POLICY 中，与 resources 同级
networkTimeoutSeconds: 5,
~~~

超时生效后的导航行为：

| 情况 | 结果 |
| --- | --- |
| N 秒内网络有响应（包括 4xx、5xx） | 返回网络响应，与未开启时相同 |
| N 秒内网络失败 | 使用回退（应用壳或离线页），与未开启时相同 |
| N 秒到了还没响应，且有可用回退 | 立即返回回退；之后到达的网络结果被丢弃 |
| N 秒到了还没响应，但没有任何可用回退 | 继续等网络，按上面两行处理 |

超时不会把一个本来能成功的请求变成错误，也不会中止背后的网络请求（弱网下仍会消耗流量）。对运行时缓存（下一节）而言，超时命中缓存时页面收到的 <code>served-from-cache</code> 事件 <code>reason</code> 为 <code>network-timeout</code>，与网络直接失败的 <code>network-failed</code>、SWR 的 <code>stale-while-revalidate</code> 是三个不同取值；按 <code>reason</code> 分支处理的业务代码需要接住这个新值。

## 短暂导航失败的重试

下一候选版本可在 v1、v2、v3 策略中显式添加：

~~~ts
networkTimeoutSeconds: 5,
navigationRetry: { delayMilliseconds: 1000 },
~~~

`delayMilliseconds` 必须为 100–3,000 的整数，并小于显式设置的总超时。第一次网络读取明确失败后等待该宽限，最多再发送一次串行文档请求；两次请求共享首次开始的五秒总预算。正在等待的请求、及时返回的 4xx／5xx、API、图片、写入和运行时缓存不加入这项重试。未填写 `navigationRetry` 时保持旧导航行为；六秒响应在五秒预算下仍会展示暂时不可用提示，不能承诺“只要设备联网就不兜底”。等待限制针对响应头，不覆盖整个正文和业务 loading。

## 公共读取的运行时缓存

<code>PwaPolicy v3</code> 可显式开启公共读取缓存。它只适用于明确允许的同源 GET 公共响应，并要求数量、单项大小与最长存活时间上限。<code>public-data</code> 支持 network-first 或 stale-while-revalidate；<code>navigation-public-dynamic</code> 仅支持 network-first。v1、v2 或 v3 且未开启时，这些未预缓存请求照旧透传。

**先确认数据绝对不按用户、Cookie 或权限变化。** 平台 worker 读不到响应的 <code>Set-Cookie</code>，也不靠请求的凭据模式判断数据是否公开；会设置 Cookie 的路径不应进入缓存规则，私有响应必须带 <code>Cache-Control: private</code>。配置示例、响应准入与验证步骤见[公共读取缓存](/guide/public-read-cache)。

## 断网与恢复

无需任何配置。平台**不提供**在线／离线状态 API：客户端 facade、Vue 和 React 绑定都没有暴露 <code>online</code>／<code>offline</code> 事件或状态。网络恢复后，只有平台生成的默认离线页会按上述有界规则探测，并在满足条件时 <code>location.reload()</code> 自己——这段脚本只存在于离线页本身，不是给业务路由页面用的能力。业务页面停留在断网状态下发出的请求，需要自己实现重试；平台不会在网络恢复时通知应用或自动重放任何请求。
