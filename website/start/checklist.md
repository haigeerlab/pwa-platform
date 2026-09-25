# 业务应用上线前检查

接入完成后，以下检查应在**最终部署地址**执行。开发服务器里看到按钮或一次成功构建，不足以说明离线与更新在线上可用。

## 1. 构建与产物

- [ ] 生产构建成功，平台校验没有报告缺失的 manifest、worker、离线页或预缓存资产。
- [ ] manifest 的名称、图标、启动 URL 和 scope 与实际站点一致。
- [ ] worker URL 与应用 scope 保持同源且通过 HTTPS 提供。
- [ ] 首次生产注册后的身份字段已有版本化基线。

## 2. 浏览器行为

### 首次接入的浏览器核验

先运行生产构建，用 `vite preview` 本地排查，再到与配置一致的最终 HTTPS 地址重复以下步骤。不要用 `vite dev` 验收平台 worker。

1. 在线打开应用入口。在 Chrome DevTools 的 **Application → Manifest** 检查 `id`、`start_url`、图标和 scope；在 **Application → Service workers** 等待 worker 变为 `activated`，核对脚本 URL 和注册 scope 与配置一致。
2. **保持在线刷新一次页面**，在 DevTools Console 执行 `navigator.serviceWorker.controller?.scriptURL`，应得到配置的 worker URL。首次打开时即使注册成功、worker 已激活，当前页面仍可能显示 `undefined`：平台 worker 不会主动接管已打开的页面。
3. 在 DevTools 的 **Network → Offline** 模拟断网，重新打开已访问的应用入口，确认应用壳可用；再访问未缓存路由，确认显示预期离线回退。测试时禁用浏览器 HTTP 缓存，避免它掩盖预缓存缺口。完成后恢复在线。

- [ ] 按以上步骤确认注册、在线刷新后受控，以及离线重新打开已访问的应用壳。
- [ ] 未缓存路由显示预期离线回退；私有 API、写请求和未分类请求不返回旧缓存。
- [ ] 部署变更预缓存资源的新版，确认新 worker 等待、页面出现更新提示、用户确认后才接管。
- [ ] 旧页面有未保存内容时，不会被平台或应用强制刷新。
- [ ] 异常 worker 的恢复流程在目标环境演练过。

## 3. 发布环境

- [ ] HTML、worker、manifest 和指纹资源的响应头符合发布基线。
- [ ] 旧版本指纹资源按发布窗口保留，回滚时仍可获取。
- [ ] 按实际发布通道取得要求的 Chrome N/N-1 与原生安装证据。
- [ ] 若同源有多个 PWA，已核对登记表、根应用排除规则和先根后子的发布顺序。

响应头基线、发布门禁与历史资源保留要求见本站的[部署与发布](/operations/release)。拥有源仓库访问权限的发布团队还应按内部[发布运维手册](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/release-and-incident-runbook.md)记录完整证据。
