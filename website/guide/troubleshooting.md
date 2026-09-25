# 常见问题

先看构建日志中的诊断码及字段路径，再确认身份、策略和最终构建产物是否一致。浏览器问题可先用生产构建的 <code>vite preview</code> 在本机排查，再到实际 HTTPS 部署地址复核。

## Worker 注册失败

<code>register()</code> 会把浏览器注册错误作为 Promise 拒绝返回。先在浏览器控制台查看错误，再核对 worker URL 是否返回本次构建的脚本、响应类型是否正确，以及 URL 和 scope 是否与身份配置及实际部署路径一致。修复后可在同一页面再次调用 <code>register()</code>；失败的注册不会被平台记作成功。不要只依靠安装或更新按钮是否出现来判断注册状态，另见[浏览器核验](/start/checklist#首次接入的浏览器核验)。

如果在调用 <code>register()</code> 之前就报缺少 <code>navigator.serviceWorker</code>，这是当前环境不提供该 API，不能靠重试注册解决。按[兼容范围](/reference/compatibility#不支持-service-worker-的环境)在业务入口检测支持，再决定是否挂载绑定。

## 构建报告 manifest 链接冲突

检查 <code>index.html</code> 和其他 HTML 入口：每页只能有一个 manifest 链接，地址须与 <code>IDENTITY.manifestUrl</code> 一致，或是同一 <code>IDENTITY.origin</code> 下该路径的完整 URL。相对地址和旧插件留下的重复链接应删除或改正；若无需保留自定义链接，全部移除后由平台在构建时注入。当前插件不接受 <code>&lt;base&gt;</code>；若业务依赖它，应先调整页面的路径与路由配置，再移除该标签。详见[配置规则](/guide/configuration)。

## 构建提示离线页不存在

<code>compile.offline-fallback-not-built</code> 表示策略声明的回退文件没有进入构建产物。若用平台默认离线页，检查策略已开启 <code>offlineFallback</code>、有对应 <code>asset</code> 规则，并在 Vite 插件上写了 <code>offlinePage: {}</code>。若用自定义页，检查文件是否位于 <code>public/</code> 且输出路径正确。子路径部署时不要把 <code>mountPath</code> 在策略路径里重复写一遍。

## 默认离线页与已有文件冲突

<code>vite.offline-page-conflict</code> 表示同一路径同时有应用文件和平台生成页。保留其中一种：要么删除自带文件，要么移除 <code>offlinePage</code> 选项。

## 构建成功，但断网仍然白屏

确认 worker 已注册并控制页面；首次安装完成前不能离线验收。再核查入口 HTML、脚本、样式和启动所需的运行时配置是否都被 <code>asset</code> 规则覆盖。若有根目录下文件名每次构建都变化的启动脚本，按[自定义产物目录](/guide/migration#核对自定义构建产物)调整宿主输出与规则。测试时清除或禁用浏览器 HTTP 缓存，避免它掩盖 Service Worker 预缓存缺口。

## 有新部署，但没有更新提示

浏览器比较的是 worker 脚本字节；只改业务 API 数据或未预缓存文件，不一定产生新 worker。长时间停留在页面上可显式设置 <code>updateCheck</code>，或由用户调用 <code>checkForUpdate()</code>。提示仍以 <code>updateWaiting</code> 状态为准。

## 安装按钮没有出现

先检查 HTTPS、manifest 的启动 URL 与图标、worker 注册及浏览器特性。<code>installEligible</code> 是渐进能力，不保证每次访问都会出现；不要把它作为应用正常使用的前提。

## 页面能打开，但 API 离线失败

这是默认安全行为。私有、写入和未分类请求不进入缓存。只有确认为同源公共读取、且满足响应准入条件时，才评估[公共读取缓存](/guide/public-read-cache)；不要把会话接口改标为公共类别来消除错误。
