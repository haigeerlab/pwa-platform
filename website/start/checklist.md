# 业务应用上线前检查

接入完成后，以下检查应在**最终部署地址**执行。开发服务器里看到按钮或一次成功构建，不足以说明离线与更新在线上可用。

## 1. 构建与产物

- [ ] 生产构建成功，平台校验没有报告缺失的 manifest、worker、离线页或预缓存资产。
- [ ] manifest 的名称、图标、启动 URL 和 scope 与实际站点一致。
- [ ] worker URL 与应用 scope 保持同源且通过 HTTPS 提供；<code>sw.js</code> 必须直接位于 scope 目录，平台不使用 <code>Service-Worker-Allowed</code>。
- [ ] 首次生产注册后，<code>appId</code>、<code>manifestId</code>、<code>origin</code>、<code>scope</code>、<code>serviceWorkerUrl</code>、<code>manifestUrl</code>、<code>mountPath</code>、<code>environment</code>、<code>cacheNamespaceSeed</code> 这九个不可变字段已记入版本化基线。

## 2. 浏览器行为

### 首次接入的浏览器核验

先运行生产构建（`vite build && vite preview`），用 `vite preview` 本地排查，再到与配置一致的最终 HTTPS 地址重复以下步骤。不要用 `vite dev` 验收平台 worker。注意 `vite preview` 会给响应加上 `Vary: Origin`，公共读取运行时缓存只接受 `Vary` 仅含 `Accept`、`Accept-Encoding` 的响应，因此预览下这类响应会被拒绝并在控制台输出 `console.warn`；这是预览环境的假象，最终地址上以实际响应头为准。

1. 在线打开应用入口。在 Chrome DevTools 的 **Application → Manifest** 检查 `id`、`start_url`、图标和 scope；在 **Application → Service workers** 等待 worker 变为 `activated`，核对脚本 URL 和注册 scope 与配置一致。
2. **等 Service Workers 面板里的状态变为 `activated` 之后再刷新页面**——过早刷新是最常见的误报来源。平台 worker 从不调用 `clients.claim()`，所以完成本次注册的这个页面本身永远不会被接管；只有等到 worker 确实 `activated` 后发起的全新导航（刷新或重新打开）才可能被接管，紧贴着激活那一刻刷新仍可能因为竞态短暂落空，可以再刷新一次确认。刷新后在 DevTools Console 执行 `navigator.serviceWorker.controller?.scriptURL`，应得到配置的 worker URL；这是有意设计，不是缺陷。
3. 在 DevTools 的 **Network → Offline** 模拟断网，重新打开已访问的应用入口，确认应用壳可用；再访问未缓存路由，确认显示预期离线回退。测试时禁用浏览器 HTTP 缓存，避免它掩盖预缓存缺口。完成后恢复在线。

- [ ] 按以上步骤确认注册、在线刷新后受控，以及离线重新打开已访问的应用壳。
- [ ] 未缓存路由显示预期离线回退；私有 API、写请求和未分类请求不返回旧缓存。
- [ ] `network-first` 已显式设置并实测 `networkTimeoutSeconds`，或已记录保持默认关闭时可接受的最长白屏等待；至少在承诺支持的一部手机上做过物理断网冷启动。
- [ ] 部署变更预缓存资源的新版，确认新 worker 等待（DevTools **Application → Service workers** 显示 “waiting to activate”）、页面出现更新提示、用户确认后才接管。检测新版本需要一次导航或刷新、已启用的 `updateCheck`，或手动调用 `checkForUpdate()`。
- [ ] 旧页面有未保存内容时，不会被平台或应用强制刷新。
- [ ] 异常 worker 的恢复流程在目标环境演练过。

## 3. 发布环境

- [ ] 响应头符合[服务器与 CDN 配置](/operations/hosting)：`sw.js`、manifest、HTML 与离线页为 `no-cache`，不带 `immutable`；带指纹的资源为 `immutable` 且 `max-age` 为正；私有响应的 `private, no-store` 需人工抽查。
- [ ] 部署顺序为先发布带指纹资源和 HTML，最后发布 `sw.js`。
- [ ] CDN 遵守 `no-cache`，或已在发布时清除 `sw.js`、manifest、HTML、离线页这些路径的缓存。
- [ ] SPA 回退改写没有把 `sw.js`、manifest 或离线页改写成 `index.html`。
- [ ] 旧版本指纹资源按 R、R-1、R-2 三个发布保留，被取代后再保留 7 天，回滚时仍可获取。
- [ ] 恢复 worker 文件 `pwa-recovery-worker.js` 已就绪，可按流程部署到 worker 地址。
- [ ] 按实际发布通道取得要求的 Chrome N/N-1 与原生安装证据。
- [ ] 若同源有多个 PWA，已核对登记表、根应用排除规则和先根后子的发布顺序。

响应头基线、发布门禁与历史资源保留要求见本站的[部署与发布](/operations/release)。拥有源仓库访问权限的发布团队还应按内部[发布运维手册](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/release-and-incident-runbook.md)记录完整证据。
