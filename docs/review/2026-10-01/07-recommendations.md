# 07 · 改进建议排序

排序依据：严重程度、对接入者/发布安全的影响、已有证据强度、预估投入。编号对应[风险 A1–A9](06-architecture-risks.md)，新增证据应回写[03 台账](03-feature-evidence.md)。

| 顺序 | 建议与验收条件 | 当前状态 | 价值/投入 | 对应 |
| --- | --- | --- | --- | --- |
| 1 | 修[portable 示例](../../../website/guide/portable-deployment.md)：加公共导航规则，说明缺规则时离线页不可达；用示例产物做一次断网未缓存导航断言 | 本地组合完成；A6 真实 HTTPS 是另一份 `/app/` 夹具 | 高/小；直接消除错误接入 | A1 |
| 2 | 给新能力页面标“当前工作区，未随 0.2.5 发布”；用 CI 对 portable/MIME 两项新增 API 核对公开包声明；正式发布后填首个支持版本 | 本地完成两项边界检查；发布后版本待填 | 高/小 | A2 |
| 3 | 发布编排器升级 MIME 必需项：错误 MIME 反例须 `report.ok=false` 或覆盖不通过，且必须保存实收响应头；所有调用方都同时判报告、覆盖、历史完整性 | 仓库示例完成；外部编排器开放 | 高/中；防止错 MIME 上线 | A3 |
| 4 | 把本轮[当前台账](03-feature-evidence.md)设为单一现行入口：旧表保留历史但标注时间；自动检查行数与本地证据链接；发布时逐行核版本和断言 | 本地结构门禁完成；发布复核开放 | 高/小 | A4 |
| 5 | 0.2.5 后代码发布前做双真实 HTTPS origin 的 portable 演练：同一 dist 字节哈希、逐源身份/响应/旧资产、注册/离线/更新、固定→portable 迁移拒绝，记录浏览器和部署 ID | 专用双源夹具的字节、线上门禁、桌面 Chromium 离线/更新已通过；首次基线冻结晚于上传，固定→portable 迁移、实体设备、业务接入与正式发行仍缺 | 高/中到大 | A6 |
| 6 | npm 发布按依赖层批准与可下载性读回，下一次发布记录必须证明不存在“依赖尚未公开时消费者已可见”的窗口 | 历史失序已复核；新门禁未执行 | 中/小 | A7 |
| 7 | Android Chrome N-1、实体设备安装形态、真实 DNS/证书故障、公共缓存弱网补测；每项写设备/版本/提交/操作/结果 | 缺证清单已列；补测未执行 | 高/大；扩大可宣称范围 | A5 |
| 8 | 公共缓存接入清单要求每条规则附服务端响应样本、鉴权/语言/地区维度评审，以及离线读回与拒绝反例；业务批准后才启用 | 审查字段已列；真实业务接口未批准 | 高/中；避免错误缓存分类 | A8 |
| 9 | 对非 Chrome 的跳过项按可观测性分层：能用网络层采集的补旁证，其余保留“未验证”，优先补发布入口与安全准入 | 分层已列；新浏览器证据未取得 | 中/中 | A9 |

## 本轮后续处理（2026-10-01 本地复核）

| 顺序 | 已完成 | 仍需补齐 |
| --- | --- | --- |
| 1 / A1 | [portable 示例](../../../website/guide/portable-deployment.md)增加公共导航规则，并写明离线页由编译器自动预缓存、未分类导航、HTTP 错误和应用壳的边界；新增[组合浏览器断言](../../../packages/vite/browser-tests/portable-deployment.spec.ts)以根路径、`install:null`、宿主 manifest 和生成离线页构建，核对离线页预缓存、断网未访问导航及离线壳；Chrome 154 组合回归 13/13 通过 | 示例配置的本地组合已验证；真实 HTTPS 双源和 registry 发行证据仍见第 5 项 |
| 2 / A2 | portable 页面、[字段入口](../../../website/guide/configuration.md)和[发布入口](../../../website/operations/release.md)均明确 npm 0.2.5 不支持、首个支持版本待发布；新增[CI 校验](../../../scripts/check-doc-public-api.mjs)读取 npm `latest` 的公开 Vite、contracts、build-verifier tarball 类型声明，逐页核对 portable 与 worker MIME 的版本状态 | 发布后仍须改实际版本并核验发布结果；此门禁只覆盖两项新增 API，不证明全部配置字段或运行行为 |
| 3 / A3 | 核实仓库自带[发布验证示例](../../../packages/examples-browser-e2e/release-verifier/assemble.ts)已传 `workerMimeObserved`，结论合并报告、覆盖和历史完整性；[错误 MIME 反例](../../../packages/examples-browser-e2e/release-verifier/test/run.test.ts)已断言发布失败 | 外部业务发布编排器不在仓库内，仍需逐个升级与收集实收响应头；不能把仓库示例结果推广到它们 |
| 4 / A4 | [历史台账](../../operations/feature-evidence-ledger.md)标明现行入口；[33 项现行台账](03-feature-evidence.md)补齐实现与自动化断言引用；[CI 检查](../../../scripts/check-feature-evidence.mjs)核对行数、结构、本地文件链接和历史入口，脚本正反例 5/5 | 文件存在不等于断言充分或真机结果有效；发布时仍须逐行复核版本、浏览器和原始记录 |

## A3 仓库内发布调用点复核

本轮按 `packages/` 与 `scripts/` 的源码调用搜索。生产用途的 `verifyRelease()` 直接调用只有[核验封装](../../../packages/examples-browser-e2e/release-verifier/run-checks.ts)这一处；[Cloudflare 命令入口](../../../scripts/verify-cloudflare-release.mjs)只负责构建依赖并启动该核验器。包级测试和浏览器测试中的直接调用是断言，不构成另一个发布编排器。

| 路径 | 已核实的调用行为 | 证据边界 |
| --- | --- | --- |
| [采集与主流程](../../../packages/examples-browser-e2e/release-verifier/run.ts)、[HTTP 采集](../../../packages/examples-browser-e2e/release-verifier/observe.ts) | 对计划中的主 worker、manifest、指纹资源作直接请求；只记录直接 HTTP 200 的响应头。上线前候选预览和上线后主站共用组装与判定路径 | 这是仓库固定 React/Vue 测试站工具；没有运行 portable v4 或同源子应用发布 |
| [输入组装](../../../packages/examples-browser-e2e/release-verifier/assemble.ts)、[必需集](../../../packages/examples-browser-e2e/release-verifier/required-checks.ts) | 两种模式都用 `workerMimeObserved: observed` 复用实收 worker 头；`requiredReleaseChecks(plan)` 派生必需项。工具拒绝需要线上根计划的同源子应用 | 历史缺计划时不伪造 `release-retention` 输入；覆盖结果会明确报缺项 |
| [检查与结论](../../../packages/examples-browser-e2e/release-verifier/run-checks.ts)、[综合判定](../../../packages/examples-browser-e2e/release-verifier/verdict.ts)、[CLI](../../../packages/examples-browser-e2e/release-verifier/cli.ts) | 同时运行 `verifyRelease` 与覆盖检查；`pass = report.ok && coverage.ok && historyComplete`，CLI 完成但失败时退出 1 | [错误 MIME 的本地 HTTP 反例](../../../packages/examples-browser-e2e/release-verifier/test/run.test.ts)断言 `response-headers` 通过、`worker-mime` 失败、覆盖通过而总结果失败；不是云端故障注入 |
| [网站 0.2.5 自检示例](../../../website/operations/hosting.md) | 明确按已发布 0.2.5 编写，只合取该版本的报告和必需覆盖，并要求人工核对 MIME | 不能把它当成待发布 `worker-mime` API 的调用示例；历史事实真实性仍由业务发布系统负责 |

**仍缺的接入证据**：仓库外业务发布编排器的清单、版本、实际 `verifyRelease` 输入、实收响应头与错误 MIME 反例均未取得；不能从本仓库示例推断它们已升级。[测试站记录](../../../tasks/cloudflare-test-deployment/verification.md)说明 MIME 接线后的验证为本地 HTTP 反例，没有为此重新部署或改变云端响应。下次接入复核应逐个列出编排器仓库/入口、所用 npm 版本、v3 的 `workerMimeObserved` 或 v4 的逐源响应、必需集、历史完整性判定、错误 MIME 反例和发布阻断结果；公开 0.2.5 仍需人工 MIME 核对。

## A6 双真实 HTTPS Origin 演练前提

**已有证据**：[portable 浏览器用例](../../../packages/vite/browser-tests/portable-deployment.spec.ts)把一份 `dist` 的每个文件与两个本地 HTTP origin 的响应逐字节比较，并分别验证注册、离线、更新及隔离；[逐源门禁测试](../../../packages/build-verifier/test/portable-deployment.test.ts)拒绝用 A 的响应冒充 B，也覆盖错误 worker MIME、缺路径和状态码。[A6 预检](a6-https-drill-preflight.md)封存 v1/v2 并在本机模拟验证 200 rewrite；后续[双真实 HTTPS 结果](a6-https-drill-result.md)逐源验收通过。当前工作区能力尚未随 npm `0.2.5` 发布，[版本说明](../../../website/guide/portable-deployment.md)不得被读成公开消费者验收。

| 前提/验收项 | 现有可复用事实 | 演练仍须取得的证据 |
| --- | --- | --- |
| 两个 HTTPS 目标 | [Cloudflare 登记](../../operations/cloudflare-test-deployment.md)已有 React/Vue 独立主站和各自 `drill`；2026-10-01 14:10 UTC 对两个主站 `/app/` 作只读 `curl -sS -D - -o /dev/null`，均返回 HTTP/2 200、`Content-Type: text/html; charset=utf-8`、`Cache-Control: no-cache` | 选定**隔离**的两个实际 HTTPS origin，并以部署回执确认最终地址、项目/槽位及持续可访问性；这次 HTTP 读数没有核验 portable 产物、worker 或浏览器行为 |
| 身份与部署工具 | 现有 React/Vue [冻结基线](../../../packages/examples-browser-e2e/apps/shared/release-baseline/react-main.json)分别写入不同 `appId`/`origin`；[Cloudflare 构建脚本](../../../scripts/build-cloudflare-site.mjs)和[身份函数](../../../packages/examples-browser-e2e/apps/shared/cloudflare-identity.ts)强制固定源与目标 | 不把旧主站或 `drill` 原地改成 portable。准备一份无 `origin` 的 v4 身份/策略与独立上传、采集流程；明确 `appId + 实际 origin + environment + slot` 的两份基线、完整历史和首次发布批准 |
| 同一份字节 | 本地双源测试证明夹具可复用 `dist`；现有 Cloudflare React/Vue 各自构建且代码和身份不同 | 一次构建封存单一 `dist` 清单及逐文件 SHA-256；向两源上传**同一封存制品**，从两源逐文件读回并比较，不以“两次相似构建”代替 |
| 每源发布门禁 | v4 [发布契约](../../../website/guide/portable-deployment.md#每个域名的发布验收)要求 `deployment.responses`、`deployment-origin`、`worker-mime` 和覆盖检查 | 两源各自采集最终 URL、HTTP 200、响应头、旧指纹资源与完整历史；分别保存 `report.ok`、`verifyReleaseGateCoverage(...requiredReleaseChecks(plan)).ok`、历史完整性、部署 ID 和失败反例。现有[测试站核验器](../../../packages/examples-browser-e2e/release-verifier/targets.ts)只登记固定 React/Vue 目标，不能直接当作 portable 编排器 |
| 浏览器与迁移 | 本地 Chrome 已分别验证两个源的受控、离线与更新；现有固定主站有独立安装/回滚历史 | 在两真实源各用独立浏览器配置验证注册、scope、离线、更新、缓存隔离；固定→portable 的拒绝/迁移审批在隔离样本上证明，不借旧主站的安装状态宣称通过。记录浏览器版本、时间、部署 ID 和原始结果 |

**执行结果**：v4 计划、同一制品哈希、两源身份/成功部署历史、逐源线上门禁和桌面 Chromium 注册/离线/更新均见[结果及原始 JSON](a6-https-drill-result.md)。上表保留执行前判据；固定→portable 迁移负向检查尚未在真实旧安装上执行。首次发布例外与既有固定身份迁移须分别处理；旧站的只读 `curl` 不提升其证据等级。

## A7 npm 批准顺序与可下载性

| 发布 | 记录中的失序与影响 | 完成后的证据 |
| --- | --- | --- |
| [0.2.3](../../../tasks/package-distribution/release-0.2.3.md#事件) | 首三包逐包等待，后七包批量暂存并失序批准；`vite`、`vue`、`react` 等先于 `sw-runtime` 公开，后者 tarball 延至 16:39:45 UTC 才可下载，约 9 分钟安装失败窗口 | 十包 `latest`、tarball/integrity 和 Vue/React registry 消费读回通过；只证明窗口结束 |
| [0.2.4](../../../tasks/package-distribution/release-0.2.4.md#事件) | 十包暂存后，`build-verifier`、`sw-runtime`、`vue`、`vite` 先于 `contracts`/`core` 公开，约 4 分钟窗口 | 16:20:39 UTC 十包均可下载，registry 消费读回通过 |
| [0.2.5](../../../tasks/package-distribution/release-0.2.5.md#事件批准顺序与依赖顺序不一致约-2-分钟) | 维护流程准备按层批准，实际一次批准；`sw-runtime` 03:19:54 UTC 公开时其直接依赖 `engine-workbox` 要到 03:21:01 才公开，`vite` 03:20:38 公开时直接依赖 `core` 要到 03:22:01 才公开，约 2 分钟窗口 | 03:41 UTC 起的读回确认十包可下载、完整性和两种消费者构建；不消除先前窗口 |

按当前十个公开包的 `package.json` 生产依赖计算，最早可批准层为 `contracts` → `core/engine-workbox/build-verifier` → `sw-runtime` → `client-runtime` → `vite/vue/react` → `entry-resilience`。现行[发布流程](../../operations/npm-package-release.md#顺序)把 `vue/react` 放在最后一层，是更保守但有效的顺序。0.2.5 记录中“`sw-runtime` 等依赖 `core`”是概括性表述；按[该包声明](../../../packages/sw-runtime/package.json)，其直接内部依赖是 `contracts` 与 `engine-workbox`，而[`vite` 的声明](../../../packages/vite/package.json)才直接依赖 `core`。三次窗口的共同原因是**批准阶段没有用 registry 可下载事实约束下一层**，并非本地拓扑未知。

现有 `pnpm check:publish` 只检查本地版本、发布元数据、导出文件和 `workspace:*` 依赖在预设顺序中出现；它不访问 registry，也不约束 npm 网页上的人工批准。下一版的可执行放行条件：

1. 从候选 tarball 的 `package.json` 冻结目标版本与内部依赖图，拒绝仍含 `workspace:` 的包或不一致版本；保存审核摘要和六层名单。
2. 一次只批准当前层。**下一层批准前**，对本层每包按精确版本查询 registry 的 `dist.integrity` 和 `dist-tags.latest`，下载正式 tarball，核对 HTTP 200 与摘要；任一包未公开、未可下载或版本/摘要不符就停在当前层。`publish` 输出和 `time[version]` 均不能替代下载读回。
3. 最后一层也完成相同读回后，从空目录直接以 registry 安装 Vue 与 React 消费者，核对整个 `@pwa-platform/*` 依赖树的版本、类型检查和构建；记录每层批准/读回时间与首次可安装时间。若中途失败，保留已公开项和失败点，按流程处理暂存状态，不重发同版本。

这里给出的是下一次发布的门禁条件；本轮没有执行 npm 发布或验证未来版本。当前文档有分层指令，但尚无会在人工批准前强制等待每层可下载的工具或记录，因此 A7 仍开放。

## A5 多端证据缺口与补测判据

以下按**场景与构建**保留原始证据等级。真机自动化、人工安装演练和发布门禁是不同记录；旧版设备上的部分通过不能与新版另一台设备的结果拼成同一发布尝试。生产发布的记录格式与阻断规则见[浏览器证据模板](../../operations/browser-release-evidence.md)及[浏览器矩阵](../../architecture/browser-matrix.md)。

| 场景 | 已取得的原始证据 | 未取得及下一次通过判据 |
| --- | --- | --- |
| Android Chrome N/N-1 | 2026-09-19 单台 Xiaomi 14 的 Chrome 152 曾完成 Vue 原生安装/独立窗口，React 的离线及更新只有部分现场结果，[当时明确判为不完整](../../../tasks/examples-browser-e2e/verification.md#浏览器矩阵记录)。其后 Xiaomi 14 与 Samsung A24 在 Chrome 153 上完成 Vue/React WebAPK 安装、离线冷启动、更新与恢复演练；Xiaomi 14 的 Chrome 153 还完成[真机浏览器全套](../../../tasks/stable-release-qualification/verification.md#r8-真机-android-chrome-自动化2026-09-30)。 | 对目标**同一次发布尝试**，两台经 Google Play 轮换的实体设备分别保留验证当日稳定版 N 与 N-1；各记录完整 Chrome/Android 版本、候选构建和日期，逐行完成[模板中的 V1 场景、Vue/React 原生安装及恢复子记录](../../operations/browser-release-evidence.md#发布证据记录模板)。Chrome 152 的旧轮次不能补当前 N-1；未取得前 `desktop+android` 不通过。 |
| 安装形态下的功能 | [Android 0.2.1 两机演练](../../../tasks/stable-release-qualification/verification.md#android两台实体设备均为-chrome-n)已有四组 WebAPK 的离线冷启动、更新、恢复；[iPhone 记录](../../../tasks/stable-release-qualification/verification.md#2026-09-28-补充iphone-vue021安装离线与恢复演练)已有主屏幕网页 App 安装、离线与部分更新/恢复。矩阵中的大部分自动化在 Chrome/Safari **标签页的新会话**运行。 | 对将要宣称的功能逐项在已安装 WebAPK/主屏幕 App 内运行，而不是把标签页结果搬过去：至少补公共读取缓存的在线写入、物理断网读回、恢复联网读新值与拒绝缓存反例；Android 更新还须分别覆盖旧页面与已是新代码的分支。记录启动入口、实际 `display-mode`、受控状态、构建及每步结果；iPhone 主屏幕 App 的双窗口按平台不适用，不计失败。 |
| 单 Origin DNS/证书故障 | [iPhone React drill](../../../tasks/stable-release-qualification/verification.md#2026-09-29-补测iphone-react-入口恢复第-4b56-步r3-iphone-部分通过)经路由器黑名单使主入口探针**挂起**，备用入口可达，5 秒后得到 `unconfirmed-outage`，整机离线不误报。此前 HTTP 代理可被 QUIC 绕过，测试 CA 未受信只导致站点证书错误。 | 在隔离的真实 HTTPS drill 上分别制造**已确认的 DNS 解析失败**与**主 Origin 证书校验失败**，保持备用 Origin 可达；从已受控安装形态冷启动，记录设备侧网络错误类型、主/备探测、恢复页与用户确认跳转，以及解除故障后的恢复。不能把路由器挂起、测试 CA 配置错误或本地路由拦截称为 DNS/证书演练；不得影响现有主站。 |
| 公共缓存与真实弱网 | [Android Chrome 153 单阶段探针 19/19](../../../tasks/public-read-cache/verification.md#手机端补充验证2026-09-29提交-8840133-之后)用服务器重置连接模拟断网；[iPhone Safari 27 两阶段探针 29/29](../../../tasks/public-read-cache/verification.md#手机端补充验证2026-09-29提交-8840133-之后)用真实飞行模式。两者均为标签页、模拟公共响应头；手机浏览器自动化另以服务器挂起验证 `networkTimeoutSeconds`（[矩阵 6b](../../../website/reference/platform-test-matrix.md#完整验证矩阵)），不是实际弱网链路。 | 在安装形态和受控真实弱网下分别测 `network-first` 数据及动态导航：先在线预热，测请求挂起/高延迟时配置超时后的缓存回退、`served-from-cache` 原因、晚到响应与恢复联网读回，再测无缓存时行为；保留网络条件、计时、响应头/正文与缓存前后快照。真实业务接口还须按 A8 另行审查公共性，探针模拟头不能代替。 |

每条新记录至少写测试日期、目标提交与 npm 包版本、部署 ID/构建、设备与浏览器完整版本、标签页或安装形态、故障/网络注入方法、逐步预期与实际结果、原始日志/截图位置及恢复环境的结果。先核对该版本是否与待宣称的发布相同；不同版本的补测可缩小风险，但不能回填旧发布的门禁。当前 A5 仍开放，本轮仅整理已有证据与补测判据，没有在手机或生产网络上执行新实验。

## A8 公共缓存逐规则审查清单

**代码已证明的边界**：[编译器](../../../packages/core/src/runtime-cache.ts)只在 v3 且 `runtimeCache.enabled: true` 时执行 `public-data` 的 `network-first`/SWR、`navigation-public-dynamic` 的 `network-first`；[请求决策](../../../packages/sw-runtime/src/worker/decide.ts)先排除非 GET、跨源、拒绝/排除路径；`public-data` 的非导航 `Range` 透传，带 `Authorization` 的公共数据请求透传、动态导航退回无运行时缓存的导航路径。[响应准入](../../../packages/sw-runtime/src/worker/admit.ts)仅写入未重定向 `basic` 200、类别匹配 MIME、合格 `Vary` 且未超大小上限的响应；`private`/`no-store` 被拒，SWR 还拒绝强制重验证或零时效响应。[单元测试](../../../packages/sw-runtime/test/worker/admit.test.ts)覆盖准入分支，[真实浏览器夹具](../../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)覆盖在线写入、离线读回、拒绝反例与 `Set-Cookie` 盲区。

**代码不能证明的公共性**：缺少 `Cache-Control` 时准入仍会通过；同源请求即使带 Cookie，只要没有显式 `Authorization` 头也可能进入运行时缓存；worker 无法读取响应的 `Set-Cookie`，浏览器测试甚至证明“带 `Set-Cookie`、不带 `private`”的 JSON 会入缓存。`pathPrefix` 匹配的是路径，缓存键则含查询串；平台不能知道接口是否因用户、租户、权限、语言、地区或实验分组返回不同正文，也不能识别查询参数中的一次性凭据。仓库搜索到的 `/api/catalog`、`/api/reviews`、`/dashboard` 等均为文档示例或[测试夹具](../../../packages/sw-runtime/browser-tests/fixture-site.ts)，未找到某个真实业务接口的服务端响应样本或负责人批准记录。

在每一条拟启用的 `resources` 规则上填写下表；任一行缺证时维持 `cache: "none"` 或不加入公共规则，不能用夹具通过替代业务批准。

| 核对项 | 每条规则必须保存的证据与放行条件 |
| --- | --- |
| 路径与键 | 写出 `mountPath`、完整 `pathPrefix`、策略、实际覆盖的所有路由及查询参数；确认前缀不会覆盖登录态、个人页、租户页、回调、令牌或共享 Origin 子应用路径。查询串参与缓存键；一次性 `token`/`code` 路径不批准。记录规则变更后的 `configDigest` 与旧缓存清理影响。 |
| 业务内容 | 由接口负责人列出匿名、至少两个账户/权限、租户、语言、地区及实验分组的响应差异；相同缓存键与允许的 `Vary` 条件下，正文必须对所有请求者同样可公开。若差异由 Cookie、会话、隐藏请求头或服务器状态决定，移出公共规则；语言/地区差异需明确编码在 URL 中并实测缓存读回。若用 `Accept` 内容协商，须验证 `Vary: Accept` 下的读回隔离；`Vary: Accept-Language` 不准入。 |
| 线上响应 | 从最终部署地址保存每个代表 URL 的**实收**状态、最终 URL/重定向链、`Content-Type`、`Cache-Control`、`Vary`、`Content-Length`/正文字节数及正文摘要，覆盖匿名和登录态请求。确认 `basic` 200、未重定向、MIME 与体积合格；服务端显式给出符合公共语义的缓存头，不能把“未写 `private`”当作公共性证明。核对服务端是否设置 `Set-Cookie`；若会设置则不纳入公共规则，至少须有 `private` 使平台拒绝。 |
| 正向与拒绝反例 | 在受控浏览器中在线访问并确认写入、断网后按同 URL 读回；另对 `private`、`no-store`、`Vary: Cookie`、错误 MIME、超限、带 `Authorization`、带 `Range` 和私有同前缀路径分别断言不写入/不读回。响应 4xx/5xx 应原样给页面，不能误称自动回退旧缓存。保存缓存键和可脱敏日志；不要把令牌写入证据。 |
| 策略与时效 | `network-first` 验证网络失败时命中、无缓存时的错误/导航离线页；弱网挂起要单独配置并验证 `networkTimeoutSeconds`，默认不设则可能一直等待。SWR 只准公共数据，记录旧值可见的最长业务容忍期和后台更新；核验 `maxAgeSeconds`、`maxEntries`、`maxEntryBytes` 与容量/淘汰结果，不能把服务端 `max-age` 当平台存活期。 |
| 生命周期与共享设备 | 改规则/上限后验证旧摘要数据不再读；新 worker 激活时动态 HTML 缓存被清；登出检查 `logout()` 返回、运行时缓存清理和业务 Cookie/存储清理；用第二账户在同一设备离线访问，确认没有第一账户的专属内容。记录回滚残留与进行中写入竞态的处置，不把清理当作错误分类的补救。 |

推荐的最小证据行：`规则 ID/负责人｜策略与版本/部署｜覆盖 URL 和查询｜用户/语言/地区矩阵｜实收响应头与摘要｜在线/离线及拒绝结果｜浏览器/设备｜证据路径｜批准结论`。一条前缀若包含多种业务接口，应按接口拆行审查并优先缩小前缀。当前 A8 是**接入批准缺口**，不是已证实的平台代码绕过；本轮没有接入真实业务服务，也没有取得其响应样本。

## A9 非 Chrome 观测缺口

现有[跨平台矩阵](../../../website/reference/platform-test-matrix.md)不能简化成“非 Chrome 未测”：Edge 154 本机全套曾有一次 `browser.newContext` 启动超时、用例体未执行，随后单包连续三次 20/20 通过；Safari 18.6、Firefox 157 和 iPhone Safari 27.0.1 均有真实浏览器自动化，[原始轮次](../../../tasks/stable-release-qualification/verification.md)逐项记录通过、跳过与限制。非 Chrome 不阻断 `desktop` 发布是[既定通道取舍](../../adr/0030-desktop-release-channel.md)，不改变下列子断言的证据状态。[harness](../../../packages/browser-test-harness/src/navigation.ts)使用 `unverifiable-on-real-browser` 注解，不能将它统计成通过。

| 优先 | 子断言/场景 | 现有证据与不可观测点 | 可补的证据；仍须保留的边界 |
| --- | --- | --- | --- |
| 1 发布入口/安全 | Safari 导航 HTTP 状态、离线页/恢复页**导航响应**的 CSP 头，以及加载期 CSP 零违规 | Safari Navigation Timing 不给 `responseStatus`；WebDriver 不能读取导航头或在页面脚本前安装违规监听。[离线页](../../../packages/vite/browser-tests/offline-page.spec.ts)与[恢复页](../../../packages/entry-resilience/browser-tests/scenarios.spec.ts)用例读取**同一预缓存 URL 的另一次 fetch** 的 CSP 头，并证明页面样式和按钮工作，均明确注记无法取证；Chrome 的零违规断言通过。 | 在隔离的 HTTPS 夹具/发布预览端记录最终网络响应状态与头，必要时增加 CSP 上报收集并核对页面行为；把源响应与预缓存制品摘要对应起来。服务端日志、另一次 fetch 和“未收到违规报告”都不能单独证明该次离线导航的头或零违规，拿不到浏览器侧原始观测时继续标“未验证”。 |
| 2 隔离/准入 | Safari/Firefox 的 `fromServiceWorker: true`，特别是被拒绝导航的网络转发与排除路径的直通；带 `Authorization` 的导航 | [harness](../../../packages/browser-test-harness/src/real-browser.ts)对纯离线响应可判 worker，但 Safari 转发网络响应与直连不可区分；真实 WebDriver 无法给导航加 `Authorization`，对应[公共缓存用例](../../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)跳过。普通数据请求拒绝、缓存快照和离线回退仍有独立用例。 | 受控服务器记录请求路径、请求头、状态与唯一响应标记，并与客户端缓存快照/正文相互核对；鉴权导航只有在客户端确实发出该头且服务端捕获到时才计入。可证明网络/缓存结果与安全拒绝，不能仅由服务器日志断言 WebDriver 无法观察的精确 `fromServiceWorker` 位；原注解保留。 |
| 3 安装元数据 | Safari/Firefox 的 manifest 快捷方式解析、Android/iPhone 系统安装入口 | 页面读取 manifest 字段、图标 200 的断言已通过，但非 Chromium 缺 `Page.getAppManifest`；所有平台都未实际点击系统快捷方式。[真实安装形态的已得/缺失项](07-recommendations.md#a5-多端证据缺口与补测判据)另列。 | 服务端采集 manifest、图标状态/MIME/尺寸/摘要，能补资源交付证据；在确实提供快捷方式 UI 的系统上另作人工点击与目标 URL 记录。若浏览器不提供该 UI，记“不适用”，不把字段存在当作浏览器已解析。 |
| 4 存储/诊断 | Safari/Firefox/iPhone 的配额故障与 worker 控制台拒绝警告 | 配额测试依赖 Chromium CDP 的 `Storage.overrideQuotaForOrigin`，worker 控制台捕获也只在 Chromium 路径；已测的正常写入/拒绝与登出不等于配额清理或警告输出。[跳过原因](../../../tasks/stable-release-qualification/verification.md#r72-真实-safarifirefoxsw-runtimeclient-runtimeexamples-browser-e2e2026-09-30)已记录。 | 可在隔离 profile 上用真实存储压力及 Cache Storage 前后快照补配额行为，或以该浏览器可用的原生调试日志补警告；必须记录故障确实是 `QuotaExceededError`。若不能可靠触发/采集，继续记“未验证”，不能以 Chrome 的 CDP 结果代填。 |
| 5 UI/时间 | Firefox 320px 视口、iPhone 系统深色、真实 30 分钟再提醒；Chromium 专有安装事件 | Firefox WebDriver 最窄约 500px；macOS Safari 的浅/深外观已[分次实跑](../../../tasks/stable-release-qualification/verification.md#r77-safari-深色浅色外观分次运行2026-09-30)，iPhone 自动化只在浅色外观；30 分钟仅验证机制，非实际等待。`beforeinstallprompt` 在 Safari/Firefox 不提供，属于平台能力差异。 | 视口和外观可用人工系统设置及截图/计算样式补证；长时提醒需真实计时的独立记录。Safari/Firefox 的 Chromium 专有事件记“不适用”，Android WebAPK 与 iPhone 主屏幕 App 按各自原生流程验证；不要为追求全绿而删除跳过。 |

**执行顺序**：先补第 1、2 行中影响发布入口、安全拒绝的观测，再补安装资源交付；配额与诊断依可重复故障注入能力推进，UI/时间按具体兼容声明补。Web Push、Nuxt 等工作区未发布能力的非 Chrome 跳过仍留在私有能力记录，不能提升公开包支持矩阵。每次补测同时保存浏览器完整版本、提交/包版本、站点构建、注入和采集方法、逐项结果与原始日志；只有采集到了**同一个断言所需的事实**才删除对应跳过或 `unverifiable-on-real-browser` 注解。本轮未改 harness，也未新增非 Chrome 测试。

## 维护节奏

一次功能修改同时核对[02 功能语义](02-feature-support.md)、[03 证据](03-feature-evidence.md)、[05 配方](05-scenario-recipes.md)；一次新浏览器/手机测试只更新对应环境格与原始证据。发布时先冻结 npm 版本和提交，再允许网站标注“已发布”；证据必须指出测试所在版本，不能用当前源码给旧 npm 包背书。
