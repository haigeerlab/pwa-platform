# 常见问题

先看构建日志中的诊断码及字段路径，再确认身份、策略和最终构建产物是否一致。浏览器问题请在生产构建部署后的 HTTPS 地址复现。

## 构建提示离线页不存在

<code>compile.offline-fallback-not-built</code> 表示策略声明的回退文件没有进入构建产物。若用平台默认离线页，检查策略已开启 <code>offlineFallback</code>、有对应 <code>asset</code> 规则，并在 Vite 插件上写了 <code>offlinePage: {}</code>。若用自定义页，检查文件是否位于 <code>public/</code> 且输出路径正确。子路径部署时不要把 <code>mountPath</code> 在策略路径里重复写一遍。

## 默认离线页与已有文件冲突

<code>vite.offline-page-conflict</code> 表示同一路径同时有应用文件和平台生成页。保留其中一种：要么删除自带文件，要么移除 <code>offlinePage</code> 选项。

## 构建成功，但断网仍然白屏

确认 worker 已注册并控制页面；首次安装完成前不能离线验收。再核查入口 HTML、脚本、样式和启动所需的运行时配置是否都被 <code>asset</code> 规则覆盖。测试时清除或禁用浏览器 HTTP 缓存，避免它掩盖 Service Worker 预缓存缺口。

## 有新部署，但没有更新提示

浏览器比较的是 worker 脚本字节；只改业务 API 数据或未预缓存文件，不一定产生新 worker。长时间停留在页面上可显式设置 <code>updateCheck</code>，或由用户调用 <code>checkForUpdate()</code>。提示仍以 <code>updateWaiting</code> 状态为准。

## 安装按钮没有出现

先检查 HTTPS、manifest 的启动 URL 与图标、worker 注册及浏览器特性。<code>installEligible</code> 是渐进能力，不保证每次访问都会出现；不要把它作为应用正常使用的前提。

## 页面能打开，但 API 离线失败

这是默认安全行为。私有、写入和未分类请求不进入缓存。只有确认为同源公共读取、且满足响应准入条件时，才评估[公共读取缓存](/guide/public-read-cache)；不要把会话接口改标为公共类别来消除错误。
