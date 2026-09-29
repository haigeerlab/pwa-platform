# 运行时生命周期

## 首次访问

用户首次在线打开应用时，业务代码调用 <code>register()</code>。worker 安装期间预缓存策略允许的应用壳和离线回退资源。首次访问未完成安装前，不能承诺立刻离线可用。

平台 worker 不调用 <code>clients.claim()</code>，所以**首次访问的这个页面在本次浏览中不受 worker 控制**，要等下一次导航（刷新或重新打开）才由它接管。这有几个直接后果：首次访问的页面不会因为新装好的 worker 收到 <code>updateWaiting</code>（此时没有旧版本可更新）；此时调用 <code>logout()</code> 返回 <code>false</code>，因为没有控制页面的 worker 可以确认清理。

## 后续离线打开

已安装并受对应 scope worker 控制的页面再次导航时，worker 可用预缓存的应用壳或离线页回退。没有被缓存、被拒绝缓存或属于私有数据的请求仍可能失败；应用应为这些业务请求提供自己的错误状态。

回访时，若浏览器已为同一 scope 和同一 worker 脚本持有已激活的注册，<code>register()</code> 会立即完成并触发 <code>registered</code>，不必等待脚本请求返回；这次后台请求若失败，<code>register()</code> 不会因此拒绝（[ADR-0043](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0043-registered-from-existing-active-registration.md)，随 0.2.3 发布）。

## 更新

预缓存资源或 worker 代码变化会使 worker 脚本字节改变。浏览器下载新 worker，预缓存新版资源，随后让它等待：平台 worker 自己不调用 <code>skipWaiting()</code>，只在页面确认后才接管。页面收到 <code>updateWaiting</code>，用户确认后由 <code>applyUpdate()</code> 完成接管。页面是否刷新由业务决定。

- <code>applyUpdate()</code> 在没有等待中的版本时返回 <code>false</code>；否则向等待中的 worker 发确认消息，并**最多等待 10 秒**让新 worker 接管，超时、消息发不出或绑定已被销毁时 Promise 拒绝。
- 默认没有定时检查。业务可显式开启 <code>updateCheck</code>（每个标签页各自轮询，最小间隔 60 秒），也可随时手动调用 <code>checkForUpdate()</code>；后者只让浏览器重新检查 worker 脚本，不会让新版本接管。
- 更新检查会绕过 HTTP 缓存请求 worker 脚本，因此 worker 脚本必须始终可以重新验证，见[服务器与 CDN 配置](/operations/hosting)。

详见[安装与更新](/guide/updates)。

## 登出

业务先处理自己的登录态和可选 Push 订阅，再调用 <code>logout()</code>。平台请求 worker 清空离线写队列并删除全部运行时缓存及其过期记录，然后注销 registration。**预缓存不会被清除**，它是公共应用壳，不含私有数据。它不会替应用清理自建缓存或后端会话。

返回值必须检查：<code>false</code> 表示**没有完成清理，也没有注销**（例如当前页未受控、worker 在 10 秒内没有确认清理、或启用运行时缓存时缓存删除失败），或者本来就没有可注销的注册；不能把它当作已清理成功。清理范围与失败行为见[缓存安全模型](/architecture/security#登出与激活清理什么)。

## 异常恢复

构建时同时生成恢复 worker，文件名固定为 <code>pwa-recovery-worker.js</code>，位于构建输出根目录（不一定与 <code>sw.js</code> 在同一目录）。发布方在事故流程中将恢复产物替换到原 worker URL。它与平台 worker 相反：

1. 安装时立即 <code>skipWaiting()</code>，不等待页面确认；
2. 激活时删除本应用（同一 appId 与 environment，含历次缓存命名空间修订）的全部缓存、<code>workbox-expiration</code> 中属于这些缓存的过期记录（尽力而为），以及离线写队列的 IndexedDB 数据库；
3. 取消本注册的 Push 订阅（尽力而为，失败不影响接管），让后端开始看到发送失败；
4. 最后 <code>clients.claim()</code>，页面之后请求直接走网络。

一项删除失败不会阻止其他删除继续尝试（激活事件只运行一次，跳过的会一直留到下次部署）。全部尝试完之后，只要有**缓存删除或离线写数据库删除失败**，恢复就会中止并失败（fail closed）：不取消 Push 订阅、不 <code>clients.claim()</code>，避免残留敏感数据的同时让页面被新脚本控制。<code>workbox-expiration</code> 记录的清理和 Push 订阅的取消都只是尽力而为，失败不会中止恢复。离线写数据库被其他连接阻塞时，最多再等 3 秒。恢复 worker 不注册 <code>fetch</code> 监听，也不注销注册。

恢复是发布操作，需要演练和响应头校验，不是业务页面上的“重试”按钮。操作步骤见[服务器与 CDN 配置](/operations/hosting#回滚与紧急下线)。
