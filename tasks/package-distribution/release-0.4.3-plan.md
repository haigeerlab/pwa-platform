# 0.4.3 npm 发布计划

## 范围与成功标准

十个公开 `@pwa-platform/*` 包统一为 `0.4.3`，npm `latest` 最终逐包指向该版本；私有包不发布。本版包含：

1. [PR #148](https://github.com/haigeerlab/pwa-platform/pull/148)：Safari 13 上 worker 不接管请求、丢弃更新确认的修复。根因是内部 `canParseUrl` 对显式 `undefined` 基址执行 `new URL`，Safari 13 会抛错。接入方在 BrowserStack 真实 Safari 13.1.2 上用诊断日志确认了这一点。
2. [PR #147](https://github.com/haigeerlab/pwa-platform/pull/147) 中的产物变化：
   - 生成的 worker 显式以最低浏览器版本为构建目标；
   - 更新提示条按钮间距不再依赖 flex `gap`，宽度在 `min()` 前加回退。

公开 API、PWA 身份、scope、worker URL 与缓存行为不变。成功标准是发布后，接入方在 Safari 13.1 上复测通过两项：点“更新”能接管、服务端挂起时出现离线页；同时在 Safari 14.1 上作对照。

## 执行顺序

沿用 [0.4.2 发布计划](release-0.4.2-plan.md)。门禁新增 `pnpm check:browser-floor`。

1. 准备 PR 合入 `main`，核对完整 CI。
2. 在合并提交上打 `v0.4.3` 标签、建 `release/npm-0.4.3` 分支，打包候选包，并做全新 React／Vue 消费验证。
3. 项目所有者在交互式终端完成网页身份验证，按依赖顺序批量提交，并按同一顺序批准。
4. 集中读回核验，然后从公共 registry 全新安装并构建。
5. 更新文档站的当前版本，写 `release-0.4.3.md`，部署文档站；通知接入方复测。

## 停止与恢复

同 0.4.1：门禁或 CI 失败时先修复；npm 返回 409 或 403 表示该包已提交过，跳过即可，不要 `unpublish`。
