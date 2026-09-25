# 兼容范围与发布状态

## 技术栈

| 接入面 | 当前范围 |
| --- | --- |
| 构建环境 | Node.js 22.12 及以上 |
| Vite | 8.x |
| Vue | 3.4 及以上、低于 4 |
| React | 19.2 及以上、低于 20 |
| Nuxt | 4.5.x；适配器尚未对外发布 |
| TanStack Start | 未通过可行性门槛，推迟 |
| Next.js | 尚未承诺适配 |

“支持”表示相应范围有依赖校验、构建样例和浏览器行为验证，不代表所有历史版本均已逐一测试。项目构建工具与框架本身的兼容性还应由业务项目单独确认。

## 浏览器

V1 计划先按桌面端通道发布，**Chrome 桌面端当前版与上一个稳定版是发布验收的必测目标**；这不表示当前 beta 包或任一业务应用已经完成生产发布验收。移动端、Safari 和 Firefox 按渐进增强处理，不能将安装、Push 或后台能力作为网页基本可用性的前提。Chrome Android 尚未取得完整发布证据，不应对外宣称已经支持。

## 不支持 Service Worker 的环境

Vue 与 React 入门示例假设浏览器提供 <code>navigator.serviceWorker</code>。当前绑定在创建客户端时会读取此 API；若浏览器或 WebView 不提供它，直接挂载绑定会报错。当前包没有无 Service Worker 的空绑定；安装提示不可用与整个 API 缺失是两种情况。

需要在这些环境继续提供普通网页时，业务入口应先用 <code>typeof navigator !== "undefined" &amp;&amp; navigator.serviceWorker !== undefined</code> 检测支持，仅在支持时挂载 PWA 绑定和使用 <code>usePwa()</code> 的组件。Vue 示例需将 <code>App.vue</code> 中的 PWA 操作移到独立组件后条件渲染；React 示例需把 <code>Registrar</code> 和 <code>PwaActions</code> 留在受支持时才挂载的 <code>PwaProvider</code> 分支，普通页面分支不渲染它们。

## 包发布与生产部署是两道门

首批九个 npm 包当前统一为 <code>0.1.0-beta.1</code>。包可安装、示例在浏览器中运行，并不等于某个业务应用已完成自己的 HTTPS 部署、响应头、回滚、旧资产保留及真实浏览器验收。上线应按[部署与发布](/operations/release)执行。
