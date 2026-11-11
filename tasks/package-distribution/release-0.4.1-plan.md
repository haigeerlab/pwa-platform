# 0.4.1 npm 发布计划

## 范围与成功标准

- 十个公开 `@pwa-platform/*` 包统一为 `0.4.1`，npm `latest` 最终逐包指向该版本；私有包不发布。
- 修复范围限于 [PR #138](https://github.com/haigeerlab/pwa-platform/pull/138)：浏览器端代码不再调用 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`，不再使用 `??=`、push 类字段与 CSS `inset`。修复后 Safari 13.1 / Chrome 80 / Firefox 74 及以上能完成页面初始化与 worker 启动。公开 API、PWA 身份、scope、worker URL 与缓存行为不变。
- 正式的最低浏览器版本 ADR 与 CI 兼容检测不在本版范围，另行立项（`browser-compat-baseline`）。
- 文档站在 npm 发布前沿用已上线的 `0.4.0` 内容；包公开后再更新版本说明与安装命令。

## 执行顺序

1. **候选源码**：基于含 #138 的 `main`（`f44b4a6`）。确认十包 `0.4.1` 在 npm 均不存在（2026-11-11 读取：十包 `latest` 均为 `0.4.0`）。统一十包版本、`vite` 随包 skill 版本和 CHANGELOG 日期；发布检查从 `contracts` 读取版本，无需另改断言。
2. **候选门禁**：冻结安装、lint、build、typecheck、`check:publish`、单测已在本地通过。唯一的本地失败是 `export-script-safety` 依赖本机不存在的临时目录，与本版无关，#138 的 CI Quality（Node 22／24）通过。Chrome、Windows 以 PR CI 为准。
3. **源码交付**：本准备 PR 合入 `main` 并核对完整 CI；把 `v0.4.1` 标签固定在合并提交，再从同一提交创建 `release/npm-0.4.1` 分支，打包候选 tarball 并记录 SHA-256。
4. **候选消费**：在全新 Vite 项目中用候选 tarball 安装并构建 React 与 Vue 宿主，生成的 `sw.js`、恢复 worker 与生成页面脚本按 ES2020 解析通过，且不含上述内置方法。
5. **npm 批量提交**：由项目所有者在交互式终端完成身份验证，按依赖顺序先把十包全部提交：contracts → core／engine-workbox／build-verifier → sw-runtime → client-runtime → vite → entry-resilience／vue／react。批准也按同一顺序进行。
6. **集中读回**：十包全部提交后统一核对版本、`latest`、tarball 下载与 SHA-256、依赖闭包为 `0.4.1`；全新项目从公共 registry 安装并构建。
7. **文档与收口**：更新网站与仓库入口的当前版本，写 `release-0.4.1.md`，经 PR 合入。通知接入方升级，并在其旧版本浏览器真机验证后补记结果；不通过则发 `0.4.2`。

## 停止与恢复

- 必需门禁、候选 tarball 或最终 `main` CI 失败时，先修复并重新验收，不发布。
- npm 提交结果未知时，先按精确包名和版本只读核对。409（previously staged）与 403（previously published）都表示已提交，跳过，不重复发布；不用 `unpublish` 回滚。
- npm 已公开的包只能通过后续修复版本处理。
