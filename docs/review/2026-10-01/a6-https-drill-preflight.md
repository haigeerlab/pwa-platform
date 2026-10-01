# A6 双真实 HTTPS Origin 演练预检（2026-10-01）

状态：**执行前预检记录；后续双真实 HTTPS 结果见[演练结果](a6-https-drill-result.md)**。以下文字保留当时的待执行判据，不把本地 HTTP、Wrangler 模拟或 Cloudflare 账户只读查询升级为线上通过。

## 隔离目标与授权边界

现有[目标登记](../../operations/cloudflare-test-deployment.md#目标登记)只允许固定身份的 React/Vue `main` 和 `drill`；`candidate` 预览按现行手册不能做安装或浏览器验收。因此 A6 不向这四个槽位上传可移植夹具，也不绕过当前脚本的目标白名单。建议在同一 Cloudflare 账户新建两个**专用 Direct Upload Pages 测试项目**，拟名 `pwa-platform-portable-a6-a`、`pwa-platform-portable-a6-b`，各自 `main` 对应一个独立 HTTPS origin。2026-10-01 对 Pages 项目列表的只读 API 查询返回 4 个项目：既有 React/Vue 项目存在，两拟名在该账户中尚不存在；这不证明全局域名可用，创建后须读取 Cloudflare 实际分配的项目名和 URL。

首次发布前需把两个新目标、实际 origin、上传根、槽位、身份基线与证据目录写进经评审的测试部署约定；现有 `deploy-cloudflare-site.mjs` 不接受新目标，不能拿它的旧站预检结论替代 A6。**预检时**项目创建、四次 v1/v2 上传及浏览器公开访问尚未执行；后续执行事实见[结果](a6-https-drill-result.md)。Direct Upload 以后不能原地改成 Git 集成；预览地址默认公开，专用项目也须按公开测试内容审查。依据：[Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[预览部署](https://developers.cloudflare.com/pages/configuration/preview-deployments/)。

## 待上传制品

当前源码 `9662e6d16d560ab4e95f993456c295ef25e6879b`（工作区还有未提交变更）重新生成 portable v1/v2。`pnpm --filter @pwa-platform/vite exec playwright test browser-tests/portable-deployment.spec.ts` 在允许启动本机 Chrome 的环境里 **2/2 通过**：根路径文档配置的离线页，以及一份 v1 dist 在两个本地 HTTP origin 的逐字节相等、注册/缓存隔离、离线与 v2 更新。默认沙箱的第一次运行在 Chrome 启动时中止，未进入产品断言；随后同命令重跑通过。

构建输出按同一源配置再次生成，并与刚通过浏览器测试的 `site-portable-v1/v2` 中各 11 个应用文件逐字节比较。v1 上传根另加相同的 `_headers` 和 `_redirects`，共 13 个文件；v2 再携带 v1 的两个指纹资源，共 15 个文件，供旧页面与保留门禁使用。两版均不足 1 MiB；计划 `plan.json` 与哈希清单 `files.json` 在上传根之外。暂存根为本工作区被 Git 忽略的 `packages/vite/browser-build/a6-portable/<version>/site/`；上传前必须再次核对文件列表、哈希与工作区状态，不能把忽略目录当作长期归档。

| 版本 | 上传根树 SHA-256¹ | 计划文件 SHA-256 | 计划语义 |
| --- | --- | --- | --- |
| v1 | `912af69463f719bb24173afbc4cd67d9d0a4218be8002e9695e18dcdded1c5ac` | `fbd76f58765e2dc97dc75a58b844508e62016525a0ed9f771263ef08c58b0bef` | v4、`vitefixture`、无 origin、scope `/app/`、4 个预缓存项 |
| v2 | `bf65617a4dfe7ccfb9eca6e543885c94a3f3a7227522d5f01f828699e22e542d` | `64b0052961e74c415ce660086c10a54fe8f58a5be67fd14870a556fc09c06cc9` | 同一身份与路径，新增指纹资源/worker，保留 v1 两个指纹资源 |

¹ 按相对路径排序，对每个文件取 SHA-256，连接 `路径 + NUL + 文件摘要 + 换行` 后再取 SHA-256；逐文件列表见各版 `files.json`。这两个树摘要只证明本地封存，必须从**两个线上 origin 分别**读回每个文件并核对。

用 v1 计划作 v2 的同源历史输入、v2 上传根文件作可用路径输入，本地 `verifyReleaseRetention` 返回通过；从可用路径中删掉 v1 的 `index-C9LxKNc3.js` 后返回 `verify.retention-missing`。这只检查计划与文件清单的一致性，线上可用性还需逐源请求证明。

## Pages HTML 路径与发布门禁

Cloudflare Pages 默认把 `*.html` 请求重定向到无扩展名路径；现有[测试站现场记录](../../operations/cloudflare-test-deployment.md#机器发布门禁上线后核验仅用于演练)已观察到 `/app/index.html` → `/app/`、`/app/offline.html` → `/app/offline`。而[portable 路径门禁](../../../packages/build-verifier/src/deployment.ts)要求每个计划路径的最终 URL **仍是该路径**。用本次 v1 计划按上述两个最终路径调用 `verifyDeploymentOrigin`，得到 `ok:false`、两项 `verify.deployment-response-mismatch`。直接把默认 Pages 行为当作合格托管会使 A6 无法放行。依据：[Cloudflare Pages HTML 路由](https://developers.cloudflare.com/pages/configuration/serving-pages/)。

候选上传根加入两条 Pages 200 proxy rewrite：

```text
/app/index.html /app/ 200
/app/offline.html /app/offline 200
```

`wrangler 4.144.0 pages dev` 在本机读取同一 v1 上传根，解析出 2 条 rewrite 和 9 条 header 规则；逐项 GET `/app/`、`/app/index.html`、`/app/offline.html`、`/app/sw.js`、`/app/manifest.webmanifest` 均为 200、无重定向，最终路径与请求相同，均返回 `Cache-Control: no-cache`；worker MIME 为 `application/javascript`。`/app/` 与 `/app/index.html` 响应体哈希相同。本机模拟服务已停止。**Pages 线上是否以完全相同顺序处理 rewrite、header 和默认 HTML 规范化仍未验证**；首次隔离上传后先运行逐路径门禁，任一路径改变或缓存头缺失即停止 v2/浏览器扩大实验。依据：[Pages `_redirects` 的 200 proxy](https://developers.cloudflare.com/pages/configuration/redirects/)。

在该本机 Pages 模拟服务上，v1 对 12 条必需/可用应用路径、v2 对 14 条（含两条 v1 旧指纹资源）逐条 GET，并与各自上传根比较响应体：两版均为 **0 字节差异**。用实收最终 URL/状态/响应头组装 `verifyRelease`，v1 使用空历史、v2 使用同源 v1 历史，`report.ok` 与 `verifyReleaseGateCoverage(...requiredReleaseChecks(plan)).ok` 均为 `true`。这是本机 HTTP 和测试基线的闭环，**不构成两处真实 HTTPS 发布报告或云端历史完整性证明**。

## 线上验收顺序

1. 复核 Cloudflare 账户方案/用量、目标项目名和创建权限；把两个专用目标纳入经评审的登记与隔离发布流程，读取实际 URL 后分别建立 `appId + origin + environment + slot` 基线。首次发布缺基线须显式批准，旧 React/Vue 身份与历史不得借用。
2. 冻结 v1 的 13 文件清单，向 A/B 两个新目标上传**同一份** `v1/site/`。记录项目实际 URL、部署 ID、上传命令、时间、哈希。两源分别读回 11 个应用文件并与 v1 清单比对；`_headers`/`_redirects` 是平台配置文件，按其实际响应行为验收，不要求它们作为公开静态 URL 可下载。
3. 两源分别采集 `requiredDeploymentPaths(v1 plan)` 的最终 URL、HTTP 200、响应头和实际字节；独立运行 `verifyRelease`、`requiredReleaseChecks` 与 `verifyReleaseGateCoverage`，保存逐源 `report.ok`、覆盖、身份基线、首次发布批准和完整历史。特别核对 HTML 原路径、worker MIME、`no-cache`、旧指纹资源；A 的响应不能借给 B。
4. 两源各用独立浏览器配置验证注册与 scope、安装清单、离线未访问导航、缓存隔离。完成 v1 证据后才将**同一份**含 v1 旧资产的 v2 上传 A/B，按各自历史检查旧资产，再验证 waiting、用户接管、旧页面保持和显式刷新；保存浏览器完整版本、截图/日志、部署 ID 和失败/跳过项。
5. 负向检查：缺响应、错误 MIME、跨源证据、错误路径和固定身份向 portable 的迁移请求必须阻断。新建的独立 origin 没有既有固定安装状态；固定→portable 迁移只能在另行批准的隔离样本上验证，不能从新源成功推断迁移通过。

真实 HTTPS、线上逐源报告或浏览器结果为空时，双源部署演练仍标“未验证”；固定→portable 迁移若没有旧安装样本，则只把迁移子项保留“未验证”，不把双源夹具的通过推及迁移。
