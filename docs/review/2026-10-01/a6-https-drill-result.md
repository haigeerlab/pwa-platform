# A6 双真实 HTTPS Origin 演练结果（2026-10-01）

**结论：双源可移植部署行为、v1/v2 线上响应门禁和桌面 Chromium 更新/离线演练通过；首次基线文件冻结晚于 v1 上传，流程验收未全通过。** 工作区构建尚未发布到 npm；实体手机、其他桌面浏览器、独立安装窗口、固定身份→portable 迁移和业务站接入仍未验证。执行前候选与负向本地实验见[预检](a6-https-drill-preflight.md)，逐路径原始结果在[evidence](evidence/)；以下每个“通过”均只指明列出的场景。

## 目标、制品和发布历史

项目所有者授权在当前 Cloudflare 账户建立两个专用 Pages Direct Upload 项目，最多四次公开测试部署。创建前账户内没有这两个项目；创建后经 Pages API 读回域名并写入[目标登记](../../operations/cloudflare-test-deployment.md#目标登记)和两份独立[身份基线](../../operations/portable-a6-baseline-a.json)。A/B 从同一份被忽略的本地 staging 上传，命令在读取凭据前核文件列表、逐文件哈希、树摘要和计划摘要。没有上传业务数据、计划文件、测试报告或凭据。现有 React/Vue 项目没有改动。

| 源 | 实际 HTTPS origin | v1 部署 ID | v2 部署 ID | 当前生产 |
| --- | --- | --- | --- | --- |
| A | `https://pwa-platform-portable-a6-a.pages.dev` | `60b2c9b2-0d63-4184-821c-f12c926c6e6d` | `9607b9c2-2f63-4f01-9964-aa696b2d2d4e` | v2 |
| B | `https://pwa-platform-portable-a6-b.pages.dev` | `331fa378-56d7-4dcb-bf83-1e0b6524c9f9` | `df0c3bd7-95c7-4294-98bb-76c7b95361f4` | v2 |

v1 上传树 SHA-256：`912af69463f719bb24173afbc4cd67d9d0a4218be8002e9695e18dcdded1c5ac`；v2：`bf65617a4dfe7ccfb9eca6e543885c94a3f3a7227522d5f01f828699e22e542d`。A/B 每版摘要完全一致。每个项目的 Pages API 成功生产部署列表经 v2 核验恰为本表 v1/v2 两个 ID；原生回滚没有增加部署次数。[Cloudflare Pages 回滚 API](https://developers.cloudflare.com/api/go/resources/pages/subresources/projects/subresources/deployments/methods/rollback/)被用于重做浏览器更新序列，四次生产指针切换记录在[rollback-events.json](evidence/rollback-events.json)。最后读回两项目 `canonical_deployment` 均指向 v2。

本次公开夹具的上传根、计划和逐文件清单也已归档为[portable-v1.tgz](evidence/portable-v1.tgz)（压缩包 SHA-256 `92bed7bc362c2babf83b2bd07e99f8c26dd233235584b24663ced0331f91fdb7`）和[portable-v2.tgz](evidence/portable-v2.tgz)（`5f35be99c26e240dffc2187d4d72614d3fcefa48e372c5b4e84fa26bfb38acf9`）。它们只含 `site/` 文件、`plan.json`、`files.json`，没有业务数据或 macOS `._*` 元数据；上传前安全字符串扫描无命中。归档内 15/17 个文件均与本地暂存目录逐字节一致。压缩包摘要用于长期复取，判定部署同一字节仍以解包后的逐文件/树摘要和线上读回为准。

## 线上机器门禁

| 版本/源 | HTTPS 逐路径字节 | 最终 URL、HTTP 状态和头 | `verifyRelease` | 必需检查覆盖 | 历史/身份 |
| --- | --- | --- | --- | --- | --- |
| [A v1](evidence/a-v1.json) | 12/12 一致 | 12/12 满足 | 通过，0 诊断 | 通过 | 首次发布空历史；v1 计划随后与 A 冻结基线复核 |
| [B v1](evidence/b-v1.json) | 12/12 一致 | 12/12 满足 | 通过，0 诊断 | 通过 | 首次发布空历史；v1 计划随后与 B 冻结基线复核 |
| [A v2](evidence/a-v2.json) | 14/14 一致，含两项 v1 旧指纹资源 | 14/14 满足 | 通过，0 诊断 | 通过 | 仅 A 的 v1→v2；成功历史恰两项；独立基线通过 |
| [B v2](evidence/b-v2.json) | 14/14 一致，含两项 v1 旧指纹资源 | 14/14 满足 | 通过，0 诊断 | 通过 | 仅 B 的 v1→v2；成功历史恰两项；独立基线通过 |

两源线上 `/app/index.html` 和 `/app/offline.html` 均保持原始最终路径、HTTP 200 与 `no-cache`，证实本次 `_redirects` 200 rewrite 在真实 Pages 上满足 portable 路径契约。worker `Content-Type` 为 JavaScript MIME，manifest、恢复 worker、指纹资源的实际头见各报告。Node 默认信任链不能验证本机 HTTPS 代理证书；逐路径采集用 `NODE_USE_SYSTEM_CA=1` 调用 macOS 系统受信任根证书，未关闭 TLS 验证。**流程偏差：** v1 上传前登记了各自实际 origin，但独立基线文件是在初次核验之后才冻结；初次核验使用与候选相同的基线对象，不构成独立基线证据。v2 门禁随后核对 v1/v2 计划身份与各自独立基线，只能追溯证明内容一致，不能把基线冻结时间倒写成首次上传之前。专用上传脚本现已在读取凭据前强制比对冻结基线，但“先基线、再首次上传”的时序仍需下一次独立首发取证。

## 真实桌面浏览器

[Chromium 原始记录](evidence/browser-desktop-chrome.json)：Playwright 驱动的 **headless Chromium 153.0.8010.12，macOS 桌面**。同一个浏览器上下文中分别打开 A/B 站点；两源的 scope、active worker URL、manifest URL/错误、受控页面和 v1 CSS 均通过。对各自从未访问的 `/app/never-visited` 做浏览器断网导航，两个离线页均出现；Cache Storage 中均无另一源的 URL。保留同一浏览器上下文，生产从 v1 切到 v2 后，两源分别出现 waiting worker；接管前页面仍显示 v1，显式 `applyUpdate()` 后发生 controller change，刷新后均显示 v2。记录末尾有 `completedAt`，没有产品错误。

第一次更新尝试曾被演练脚本对异步 `waitForFunction` 的等待用法提前放行，随后检查到 `waiting:null` 而中止。修正为明确轮询浏览器注册状态后，利用已有成功部署原生回滚至 v1、再恢复 v2，在新的同源浏览器会话完成全部断言。该失败归于测试脚本，不计作平台更新故障；回滚和最终 v2 线上读回均有记录。

## 证据边界和下一步

- 这是专用无业务数据夹具、当前未发布工作区构建的真实 HTTPS 试验；不证明公开 npm `0.2.5` 或现有业务宿主已经支持 portable。
- 浏览器证据是自动化桌面 Chromium 同一隔离上下文中的两个常规标签页；跨源缓存隔离已观察，两个完全独立浏览器配置尚未跑。它不是实体 Android/iPhone、Edge/Safari/Firefox、安装后的独立窗口或人工操作记录。
- 新建 origin 没有固定身份的既有安装状态，因此没有验证固定→portable 的迁移拒绝或审批流程。真实 DNS/证书故障和全球 CDN 多地区读数也未做。
- `_headers`/`_redirects` 是 Pages 配置文件，验证的是线上响应行为；它们没有作为公开文件 URL 逐字节下载。被 Git 忽略的本地 staging 可清理；长期复取使用上述归档并先核摘要。
- 执行前只读核对了账户内项目数和拟名不存在；没有取得当日 Cloudflare Billable Usage 页面或账单读数。本次没有使用 R2，项目与部署计数由 Pages API 读回；不能据此声称当期费用为零。

本次狭义 A6 双源**行为**验收完成；首次基线时点及上述缺口保持在[证据台账](03-feature-evidence.md)和[建议](07-recommendations.md)，不能合并成“完整发布流程/全平台/全设备通过”。
