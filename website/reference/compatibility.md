# 兼容范围与发布状态

## 技术栈

| 接入面 | 当前范围 |
| --- | --- |
| 构建环境 | 已发布的包声明 `engines.node` 为 `>=22.0.0`；Vite 8 自身要求 Node.js `^20.19.0 \|\| >=22.12.0`，所以与 Vite 8 搭配时实际需要 22.12 及以上 |
| Vite | 5.x、8.x（peer 范围 `^5.0.0 \|\| ^8.0.0`） |
| Vue | 3.4 及以上、低于 4（peer 范围 `^3.4.0`） |
| React | 19.2 及以上、低于 20（peer 范围 `^19.2.0`） |
| Nuxt | 4.5.x；适配器尚未对外发布 |
| TanStack Start | 未通过可行性门槛，推迟 |
| Next.js | 尚未承诺适配 |

“支持”表示相应范围有依赖校验、构建样例和浏览器行为验证，不代表所有历史版本均已逐一测试。项目构建工具与框架本身的兼容性还应由业务项目单独确认。

## 浏览器

V1 计划先按桌面端通道发布，**Chrome 桌面端当前版与上一个稳定版是发布验收的必测目标**；这不表示当前正式包或任一业务应用已经完成生产发布验收。移动端、Safari 和 Firefox 按渐进增强处理，不能将安装、Push 或后台能力作为网页基本可用性的前提。Chrome Android 尚未取得完整发布证据，不应对外宣称已经支持。

| 浏览器 | 档位 | 证据与门禁 |
| --- | --- | --- |
| Chrome 桌面端，当前版（N）与上一个稳定版（N-1） | 必测 | 发布门禁要求；N-1 需在发布验收中单独取得，不由平台仓库的 CI 覆盖 |
| Microsoft Edge 桌面端稳定版 | 非阻塞参考 | 仓库 CI 的 `edge` 任务用 runner 预装的 Edge 跑同一套 Chrome 浏览器测试，只在合并后、每晚和手动触发时运行，失败不阻塞发布（ADR-0044） |
| Playwright 的 WebKit 与 Firefox | 非阻塞引擎冒烟 | 只证明 Playwright 自带的引擎构建能跑通冒烟用例，**不等于**真实 Safari、iOS 或 Firefox 稳定版的兼容证据（ADR-0042） |
| 移动端（Chrome Android、iOS Safari） | 渐进 | 按渐进增强处理；需业务用真机自行验收 |

## 不支持 Service Worker 的环境

Vue 与 React 入门示例假设浏览器提供 <code>navigator.serviceWorker</code>。当前绑定在创建客户端时会读取此 API；若浏览器或 WebView 不提供它，直接挂载绑定会报错。当前包没有无 Service Worker 的空绑定；安装提示不可用与整个 API 缺失是两种情况。

服务端渲染是另一种情况：在服务器上，绑定的所有方法（`register()`、`promptInstall()`、`applyUpdate()`、`logout()`、`checkForUpdate()`）都会立即拒绝，需要在水合后的浏览器里调用。

需要在这些环境继续提供普通网页时，业务入口应先用 <code>typeof navigator !== "undefined" &amp;&amp; navigator.serviceWorker !== undefined</code> 检测支持，仅在支持时挂载 PWA 绑定和使用 <code>usePwa()</code> 的组件。Vue 示例需将 <code>App.vue</code> 中的 PWA 操作移到独立组件后条件渲染；React 示例需把 <code>Registrar</code> 和 <code>PwaActions</code> 留在受支持时才挂载的 <code>PwaProvider</code> 分支，普通页面分支不渲染它们。

## 包发布与生产部署是两道门

十个 npm 包当前统一为 <code>0.2.3</code>，发布在 `latest` 标签。包可安装、示例在浏览器中运行，并不等于某个业务应用已完成自己的 HTTPS 部署、响应头、回滚、旧资产保留及真实浏览器验收。上线应按[部署与发布](/operations/release)执行。
