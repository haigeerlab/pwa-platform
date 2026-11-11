# 0.4.2 npm 发布计划

## 范围与成功标准

- 十个公开 `@pwa-platform/*` 包统一为 `0.4.2`，npm `latest` 最终逐包指向该版本；私有包不发布。
- 修复范围限于 [PR #143](https://github.com/haigeerlab/pwa-platform/pull/143)：`@pwa-platform/vue`、`@pwa-platform/react` 的 `update-notice.css` 在不支持逻辑定位的浏览器（Chrome/Edge 87、Safari 14.1、iOS 14.5 以下）补物理定位回退。0.4.1 在这些浏览器上，默认更新提示条停在页面末尾，页面高于视口时完全不可见。支持逻辑定位的浏览器沿用原规则；公开 API、PWA 身份、scope、worker 与缓存行为不变。
- 修复前已由接入方在 Chromium 80 真内核上复测通过：四种位置与窄屏共 8 组都在视口内；新版 Chrome 对照组与 0.4.1 完全一致。
- 其余八个包内容不变，只升版本号以保持十包统一。

## 执行顺序

沿用 [0.4.1 发布计划](release-0.4.1-plan.md)：

1. 准备 PR 合入 `main`，核对完整 CI。
2. 在合并提交上打 `v0.4.2` 标签、建 `release/npm-0.4.2` 分支，打包候选并做全新 React／Vue 消费验证。
3. 项目所有者在交互式终端完成网页身份验证，按依赖顺序批量提交并批准。npm 必须直接连接终端，不经管道。
4. 集中读回十包版本、`latest`、tarball 与 SHA-256、内部依赖，再从公共 registry 全新安装构建。
5. 更新文档站当前版本、写 `release-0.4.2.md` 并部署文档站。

## 停止与恢复

同 0.4.1：门禁或 CI 失败先修复；409／403 表示已提交，跳过；不 `unpublish`。
