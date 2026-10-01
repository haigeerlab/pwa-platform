# PWA Platform 一体化架构审查（2026-10-01）

基线：工作区 `9662e6d`；公开 npm 包 `0.2.5`（发布树 `5a2ee76`）。**工作区能力、已发布能力、浏览器测试和业务站点生产验收分别判断。**本轮承接 [9 月 27 日完整审查](../2026-09-27/README.md)与 [9 月 28 日增量复审](../2026-09-28/README.md)，其中的版本、浏览器和风险状态不得直接套用于当前提交。

| 产物 | 回答的问题 |
| --- | --- |
| [01 行业对标](01-industry-benchmark.md) | 同类工具有什么，差异是缺口还是取舍？ |
| [02 功能支持矩阵](02-feature-support.md) | 当前公开版本有什么、默认怎样、如何开启？ |
| [03 功能—配置—测试—浏览器—证据台账](03-feature-evidence.md) | 哪条声明被哪种测试证明，哪些环境仍空白？ |
| [04 PC 接入体验](04-pc-onboarding.md) | 新接入者按文档会在哪里停住？ |
| [05 场景配置](05-scenario-recipes.md) | 八类常见目标的最小配置及实际行为是什么？ |
| [06 架构与代码风险](06-architecture-risks.md) | 当前真正开放的风险和约束是什么？ |
| [07 建议排序](07-recommendations.md) | 下一步应以什么顺序补文档、代码或证据？ |
| [A6 双真实 HTTPS 演练结果](a6-https-drill-result.md) | 同一 portable 制品在两个真实源的发布、离线与更新证据是什么？ |

## 结论

平台在身份、默认拒绝缓存、显式公共读取、用户确认更新、两类恢复和发布门禁上有清晰边界。`0.2.5` 已发布十个包；Nuxt、Push、离线写仍为私有工作区能力。`portable` 部署和 `worker-mime` 门禁在当前工作区，**不属于 `0.2.5` 的发布承诺**。本轮本机 `pnpm test` 在允许本地监听的环境中 16 包、2575/2575 通过；Chrome 响应头因果实验 23/23、portable 双源/共享源与离线页 13/13、工作区打包接入冒烟 4/4 通过。后者从当前工作区打包，**不能当作 registry `0.2.5` 复测**。既有 0.2.5 门禁为 2511 个单元用例、295 个桌面 Chrome 用例、4 个新人接入用例通过，详情见[发布记录](../../../tasks/package-distribution/release-0.2.5.md)。

真实桌面 Edge、Safari、Firefox 与实体 Android Chrome、iPhone Safari 已有分项记录；它们并不等于完整发布通道。同一发布尝试的 Android Chrome N-1 全场景、真实 DNS/证书故障、安装形态下的部分场景以及实际业务宿主的发布门禁仍缺证据。[跨平台矩阵](../../../website/reference/platform-test-matrix.md)列出具体版本和跳过项。**旧功能台账的 30 行是历史快照**；当前结论以[03](03-feature-evidence.md)为准。

| 本轮命令（macOS，Node 24.18，pnpm 11.18，Chrome 154） | 结果 | 解释 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile`、`pnpm test` | 安装成功；16 包 2575/2575 | 默认沙箱中监听端口受限，测试在授权环境重跑全绿 |
| `pnpm --filter @pwa-platform/examples-browser-e2e exec playwright test browser-tests/header-causality.spec.ts` | 23/23 | worker MIME、缓存头、HTML/manifest/指纹资源因果实验 |
| `pnpm --filter @pwa-platform/vite exec playwright test browser-tests/portable-deployment.spec.ts browser-tests/portable-shared-origin.spec.ts browser-tests/offline-page.spec.ts` | 13/13 | 两个本地 Origin、共享源隔离、离线页；不等于真实 HTTPS 多域发布 |
| `pnpm test:onboarding-smoke` | 4/4 | 当前工作区打包接入；不是 registry 0.2.5 字节 |
| `pnpm lint`、`pnpm docs:build`、`git diff --check`、本地链接/尾随空格检查 | 通过 | 文档站构建不包含本审查目录，后两项单独核了新报告 |
| `node --test scripts/check-feature-evidence.test.mjs`、`pnpm docs:check-evidence` | 5/5、通过 | 对 33 行台账的编号、证据引用和本地文件链接加入 CI 检查；只检查结构与文件存在 |

**PR 前本地复核：** `pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm docs:build`、`pnpm docs:check-evidence`、`pnpm docs:check-public-api`、新增脚本测试 12/12、打包接入冒烟 4/4 与暂存差异检查通过。首次完整 `pnpm test:browser` 在示例包第 32 项的浏览器 context 创建阶段超时，产品断言尚未开始；同一真实安装事件用例单独重跑 2/2 通过，受影响示例包随后完整重跑 86/86 浏览器用例及 28/28 UI 用例通过。首次超时不计作通过，也没有因此修改或跳过该断言。远端 CI 结果以 PR 运行记录为准。

最终证据复核把[接入卡点](04-pc-onboarding.md)、[风险](06-architecture-risks.md)和[建议进度](07-recommendations.md)中的 A1/A2/A4 明确标为“基线发现、本地已修复”，避免把已改的文档继续当作当前故障；[离线页配方](05-scenario-recipes.md#2-加离线页)补成可独立替换的完整 `POLICY`。[台账第 27 项](03-feature-evidence.md)补上 Cloudflare F2 原始记录，并明确本地门禁集成测试不覆盖云端编排全流程。入口恢复配方的 `recoveryPageUrl` 已对照公开返回类型；自动台账门禁不检查这些语义，仍以各项源码、断言和原始记录为准。

[A3 发布调用点清单](07-recommendations.md#a3-仓库内发布调用点复核)已核对仓库生产用途的唯一直接 `verifyRelease()` 调用、上线前后采集与组装、错误 MIME 本地 HTTP 反例及 CLI 退出码。该清单只覆盖本仓库；外部业务编排器是否升级仍无输入或运行证据。

[A6 演练前提清单](07-recommendations.md#a6-双真实-https-origin-演练前提)对照了现有固定身份 Cloudflare 站、本地 portable 双源测试和逐源门禁。2026-10-01 对 React/Vue 主站的只读 HTTPS 请求均得到 200、`no-cache`；这些旧站读数仍只证明当时入口可达。另在两个专用 Pages 项目上传同一份 portable v1/v2 制品，[双真实 HTTPS 演练](a6-https-drill-result.md)的逐源字节、完整门禁与桌面 Chromium 离线/更新已通过。

[A6 执行前预检](a6-https-drill-preflight.md)封存 v1/v2 本地候选及哈希，核对 Cloudflare 隔离目标，并发现 Pages 默认 HTML 重定向与 portable 最终路径门禁冲突；本机与后续真实 Pages 的 200 rewrite 均逐源通过。[演练结果](a6-https-drill-result.md)保留版本、部署 ID、逐路径报告及浏览器记录。

[A7 发布失序复核](07-recommendations.md#a7-npm-批准顺序与可下载性)对照 0.2.3–0.2.5 的公开/下载时间和当前包依赖图，形成逐层批准前的 tarball 可下载与完整性检查条件。三版最终读回通过，但各自先前的安装失败窗口仍是历史事实；本轮没有发布新版本。

[A5 多端缺证清单](07-recommendations.md#a5-多端证据缺口与补测判据)按 Android N/N-1、安装形态、真实 DNS/证书故障、公共缓存弱网逐项区分旧记录与下一次通过判据；本轮没有新增真机或网络实验。

[A8 公共缓存逐规则清单](07-recommendations.md#a8-公共缓存逐规则审查清单)区分平台可验证的请求/响应准入与业务必须证明的内容公共性，给出真实响应、跨账户、离线读回和拒绝反例的逐接口放行字段；仓库夹具结果不代表业务接口获批。

[A9 非 Chrome 观测清单](07-recommendations.md#a9-非-chrome-观测缺口)将真实浏览器用例中的跳过和 `unverifiable-on-real-browser` 分层，优先处理导航响应、CSP 和安全准入；另一次 fetch、服务端日志与 Chromium 结果均不自动替代缺失断言。

## 交付与开放项

| 产物 | 本轮交付状态 | 后续证据边界 |
| --- | --- | --- |
| [01 行业对标](01-industry-benchmark.md) | 已形成来源可追溯的能力与取舍对比 | 对方文档只证明其公开声明，不证明本平台与对方的生产可靠性相同 |
| [02 功能支持矩阵](02-feature-support.md) | 已按公开 `0.2.5`、工作区未发布能力、默认值与条件区分 | 新版本发布后须重核公开包契约 |
| [03 功能证据台账](03-feature-evidence.md) | 已列 33 项功能、实现/自动化/真实桌面/实体手机证据和空白；结构检查已接入 CI | 自动检查只保证编号、结构和文件存在；业务宿主及缺测环境仍须补原始记录 |
| [04 PC 接入体验](04-pc-onboarding.md) | 已复核入口、最小流程、配置、构建部署更新和具体卡点；本地修复与历史发现分开 | 工作区打包接入不能代替 registry 发布版或实际业务项目验收 |
| [05 场景配置](05-scenario-recipes.md) | 八类最小配方已写明默认行为、开启条件和失败边界 | 示例的真实 HTTPS、私有业务响应与安装形态仍按对应场景验收 |
| [06 架构风险](06-architecture-risks.md) | 已按 A1–A9 关联源码、测试及风险等级 | 外部发布编排器、portable 业务/迁移、移动 N-1 和非 Chrome 跳过项仍开放 |
| [07 建议排序](07-recommendations.md) | 已按严重度和投入产出排序，并记录 A1/A2/A4 的本地修复与 A3/A5–A9 的边界 | 每项只有达到该节的验收条件才能关闭，不能以清单已写代替实验通过 |

交叉核对时修正了入口恢复的条件语义、非导航 Range 准入、公共缓存示例未设超时却暗示超时回退、手机更新检查的人工/自动化阶段、Android 更新提示历史问题与修复状态，以及网站证据日期。审查目录的本地文件链接与章节锚点已单独核对。**当前审查材料可供接入与维护决策使用；A2 发布后版本回填、A3 外部编排器、A4 发布时逐行复核、A5 真机缺测、A6 的正式发行/业务接入/迁移、A7 下一次 npm 发布、A8 真实业务公共缓存、A9 非 Chrome 观测仍为开放项。**

## 方法与限制

内部事实按“源码与公开包 → 具体断言 → 浏览器/手机原始记录”核对。L1 只证明实现存在，L2 是自动化断言，L3 是真实桌面浏览器，L4 是实体手机；等级不代表所有浏览器或发布通过。官方项目文档仅能证明对方宣称的能力，不能推断其质量或默认安全性。未找到来源写“未核实”。默认沙箱内 `pnpm test` 的本地监听用例失败，授权环境重跑全绿，因此不计产品失败。本轮没有访问私有业务宿主或实施生产故障注入；仅按专项授权对两处专用 Pages 测试项目做了四次公共夹具部署和原生回滚复测。PC 从零接入的现场结论需与 `0.2.5` 的[公开 registry 消费者读回](../../../tasks/package-distribution/release-0.2.5.md#读回)一起读。
