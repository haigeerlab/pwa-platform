# 常见问题

先看构建日志中的诊断码及字段路径，再确认身份、策略和最终构建产物是否一致。浏览器问题可先用生产构建的 <code>vite preview</code> 在本机排查，再到实际 HTTPS 部署地址复核。

构建日志里的诊断码（如 <code>identity.invalid-origin</code>）及其含义、修法，见[诊断码索引](/reference/diagnostics)；没有诊断码的构建失败（<code>base</code> 不合法、manifest 链接冲突、产物被后续插件改写、输出路径重复）也在该页最后一节。

## Worker 注册失败

<code>register()</code> 会把浏览器注册错误作为 Promise 拒绝返回。先在浏览器控制台查看错误，再核对 worker URL 是否返回本次构建的脚本、响应类型是否正确，以及 URL 和 scope 是否与身份配置及实际部署路径一致。修复后可在同一页面再次调用 <code>register()</code>；失败的注册不会被平台记作成功。不要只依靠安装或更新按钮是否出现来判断注册状态，另见[浏览器核验](/start/checklist#首次接入的浏览器核验)。

如果在调用 <code>register()</code> 之前就报缺少 <code>navigator.serviceWorker</code>，这是当前环境不提供该 API，不能靠重试注册解决。该错误在创建绑定时抛出（Vue 的 <code>app.use(createPwa(...))</code>、React 的 <code>PwaProvider</code> 挂载时），信息为 <code>This environment has no navigator.serviceWorker; pass options.container explicitly</code>，因此发生在 <code>register()</code> 之前。按[兼容范围](/reference/compatibility#不支持-service-worker-的环境)在业务入口检测支持，再决定是否挂载绑定。

## 构建报告 manifest 链接冲突

检查 <code>index.html</code> 和其他 HTML 入口：每页只能有一个 manifest 链接，地址须与 <code>IDENTITY.manifestUrl</code> 一致，或是同一 <code>IDENTITY.origin</code> 下该路径的完整 URL。相对地址和旧插件留下的重复链接应删除或改正；若无需保留自定义链接，全部移除后由平台在构建时注入。当前插件不接受 <code>&lt;base&gt;</code>；若业务依赖它，应先调整页面的路径与路由配置，再移除该标签。详见[配置规则](/guide/configuration)。

## 构建提示离线页不存在

<code>compile.offline-fallback-not-built</code> 表示策略声明的回退文件没有进入构建产物。若用平台默认离线页，检查策略已开启 <code>offlineFallback</code>、有对应 <code>asset</code> 规则，并在 Vite 插件上写了 <code>offlinePage: {}</code>。若用自定义页，检查文件是否位于 <code>public/</code> 且输出路径正确。子路径部署时不要把 <code>mountPath</code> 在策略路径里重复写一遍。

## 默认离线页与已有文件冲突

<code>vite.offline-page-conflict</code> 表示同一路径同时有应用文件和平台生成页。保留其中一种：要么删除自带文件，要么移除 <code>offlinePage</code> 选项。

## 构建成功，但断网仍然白屏

确认 worker 已注册并控制页面；首次安装完成前不能离线验收。再核查入口 HTML、脚本、样式和启动所需的运行时配置是否都被 <code>asset</code> 规则覆盖。若有根目录下文件名每次构建都变化的启动脚本，按[自定义产物目录](/guide/migration#核对自定义构建产物)调整宿主输出与规则。测试时清除或禁用浏览器 HTTP 缓存，避免它掩盖 Service Worker 预缓存缺口。

首次访问的页面不受 worker 控制：平台 worker 从不调用 <code>clients.claim()</code>，页面要等到下一次导航或刷新才被控制，所以首次访问的页面不能验收离线。页面未受控时，<code>logout()</code> 返回 <code>false</code>，也不会宣告 <code>update-waiting</code>。

## 有新部署，但没有更新提示

浏览器比较的是 worker 脚本字节；只改业务 API 数据或未预缓存文件，不一定产生新 worker。长时间停留在页面上可显式设置 <code>updateCheck</code>，或由用户调用 <code>checkForUpdate()</code>。提示仍以 <code>updateWaiting</code> 状态为准。

定时检查没有触发提示时，逐项排查：

- 标签页在后台：到点的检查被推迟，页面重新可见时才补查。
- 未满一个完整间隔：<code>register()</code> 成功后，第一次检查在一个间隔之后，不会立即发生。
- 没有其他触发：网络恢复（<code>online</code>）或页面获得焦点都不会引起检查。
- 页面未受控：首次访问的页面没有 worker 控制，不会宣告 <code>update-waiting</code>，刷新一次即可。
- 自动检查的失败是静默的；用手动 <code>checkForUpdate()</code> 可以看到原始错误。

控制台里对 <code>getRegistration()</code> 拿到的对象调用原生 <code>update()</code> 时，如果报 <code>InvalidStateError</code>，说明这个注册对象上已经没有任何 worker（installing、waiting、active 都为空），通常是它已被注销，例如登出清理之后，页面还拿着旧对象。这是浏览器按 Service Worker 规范拒绝，不是平台故障。检查更新请改用 <code>checkForUpdate()</code>：它每次重新查找当前注册，找不到时返回 <code>"unavailable"</code>，并与定时检查共用同一次请求；浏览器检查本身失败（例如 worker 脚本请求出错）时，它会把原始错误抛给调用方。

## `checkForUpdate()` 一直不返回

浏览器的更新检查卡在一个挂起的 worker 脚本请求上时（常见于手机刚恢复联网，连接还没真正可用），<code>checkForUpdate()</code> 会一直等待，定时检查也排在它后面。这是浏览器按 Service Worker 规范把同一 scope 的更新任务排队执行的结果，平台没有给它加超时：超时解除不了浏览器那边卡住的任务（见 [ADR-0043](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0043-registered-from-existing-active-registration.md) 增补）。连接恢复或重新打开页面后即恢复正常。界面需要限时时，可以自己用 <code>Promise.race</code> 包一层，但超时只表示“这次没有结果”，不能当作“没有新版本”。已激活的注册不受影响：离线使用、<code>registered</code> 状态和已在等待的更新提示都照常工作。

## 安装按钮没有出现

先检查 HTTPS、manifest 的启动 URL 与图标、worker 注册及浏览器特性。<code>installEligible</code> 是渐进能力，不保证每次访问都会出现；不要把它作为应用正常使用的前提。另外几种常见原因：

- 构建计划没有安装元数据：此时平台既不监听 <code>beforeinstallprompt</code>，<code>installEligible</code> 也永远不会为 <code>true</code>，<code>promptInstall()</code> 只返回 <code>unavailable</code>。
- iOS Safari 从不触发 <code>beforeinstallprompt</code>：需要自行提供“添加到主屏幕”的手动引导。
- 提示已被使用：保存的提示只能用一次，用过后不会自动重新准备，在浏览器再次提供新提示前 <code>promptInstall()</code> 返回 <code>unavailable</code>；详见[安装提示的限制](/guide/updates#安装提示的限制)。

## 页面能打开，但 API 离线失败

这是默认安全行为。私有、写入和未分类请求不进入缓存。只有确认为同源公共读取、且满足响应准入条件时，才评估[公共读取缓存](/guide/public-read-cache)；不要把会话接口改标为公共类别来消除错误。

## 线上 worker 异常，需要紧急下线

构建会在输出目录根部同时生成固定文件名的 <code>pwa-recovery-worker.js</code>，它不是 <code>serviceWorkerUrl</code>，所以普通发布不会覆盖它。需要下线时，把它部署到原来的 <code>serviceWorkerUrl</code> 上（不改身份、scope 或 worker 地址）；浏览器发现该地址内容变化后，会安装并接管它。它的行为：

- 安装时立即 <code>skipWaiting</code>，不等页面确认。
- 激活时删除带有本应用缓存前缀的全部缓存，以及 <code>workbox-expiration</code> 留下的记录（这一项尽力而为，失败不阻止后续步骤），并删除离线写队列数据库（数据库被占用时最多再等 3 秒）；随后取消本注册下的推送订阅（同样尽力而为），最后 <code>clients.claim()</code>。
- 没有 <code>fetch</code> 处理器，接管后页面请求直接走网络。
- 缓存或离线写队列数据库的删除只要有一项失败，激活就会失败、不会 <code>claim</code>，需要重新部署；其余删除仍会尝试完成。
- 它不会自行注销；需要注销时由页面用[<code>logout()</code>](/guide/updates)或后续发布处理。

不要更改 <code>identity</code>、scope 或 worker 地址来“绕开”问题，那会让旧 worker 继续控制已有用户。部署顺序、服务器与 CDN 的响应头和恢复步骤见[服务器与 CDN 配置](/operations/hosting)，回滚流程见[部署与发布](/operations/release#回滚与恢复)。
