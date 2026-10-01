# 06 · 架构与代码风险清单

基线 `9662e6d`。P0=立即阻断，P1=会使目标能力不可用或误导发布，P2=重要接入/证据风险，P3=局部改进。本轮**没有证据支持新增 P0**。下表保留基线发现，并在已修复项上直接标明当前状态；旧审查中的已修复 R1–R15 不重复算作新缺陷。风险链接指向[建议](07-recommendations.md)。

| ID | 级别/性质 | 事实与影响 | 证据；建议动作 |
| --- | --- | --- | --- |
| A1 | P1 基线发现；本地已修复 | 原 portable 示例建了离线页却缺导航规则；未分类导航断网时不能进入离线页。当前示例已补规则，本地 Chrome 根路径组合用例已断言断网未访问导航回退；A6 真实 HTTPS 验证的是另一份 `/app/` 夹具 | [当前示例](../../../website/guide/portable-deployment.md)、[决策表](../../../packages/sw-runtime/src/worker/decide.ts)、[组合 E2E](../../../packages/vite/browser-tests/portable-deployment.spec.ts) |
| A2 | P1 基线发现；本地已修复 | 原文档没有明确 portable/MIME 尚未随 0.2.5 发布。当前页面已注明未发布，并用 npm 公开 tarball 声明做 CI 版本检查；正式发行后仍须更新首个支持版本 | [0.2.5 发布范围](../../../tasks/package-distribution/release-0.2.5.md)、[网站检查](../../../scripts/check-doc-public-api.mjs)、[ADR-0050](../../adr/0050-portable-deployment.md)、[ADR-0051](../../adr/0051-worker-script-mime-release-check.md) |
| A3 | P1 仓库外接入未证实 | 新 MIME 检查作为可选输入保持旧 API 兼容；仓库内 Cloudflare 测试站核验器已传实收头并合取报告、覆盖、历史，错误 MIME 本地反例会阻断。仓库外旧系统若漏传观测或只看 `report.ok`，仍可能放行 | [调用点复核](07-recommendations.md#a3-仓库内发布调用点复核)、[ADR-0051](../../adr/0051-worker-script-mime-release-check.md)、[检查实现](../../../packages/build-verifier/src/worker-mime.ts)；逐个外部编排器收集输入与阻断证据 |
| A4 | P2 基线发现；本地已修复入口 | 旧 30 行仍保留历史事实；当前 33 行已有单一入口、版本标签和 CI 结构/本地链接检查。断言是否支撑每项结论仍须人工复核 | [历史台账](../../operations/feature-evidence-ledger.md)、[现行台账](03-feature-evidence.md)、[台账检查](../../../scripts/check-feature-evidence.mjs) |
| A5 | P2 多端发布证据 | 两台 Android 的后续完整演练均为 Chrome 153，早期单台 Chrome 152 只有部分场景；缺同一发布尝试的 Android N/N-1 完整证据。真实 DNS/证书故障、业务站点生产发布、安装形态下公共缓存与真实弱网仍未证实 | [逐场景缺证与补测判据](07-recommendations.md#a5-多端证据缺口与补测判据)、[跨平台矩阵限制](../../../website/reference/platform-test-matrix.md)；不能把既有 L4 结果升级为完整移动发布保证 |
| A6 | P2 portable 上线成熟度；专用双源夹具已验 | 同一 portable v1/v2 制品已在两个专用 Pages HTTPS origin 逐源核验字节、头、旧资产、发布历史及桌面 Chromium 更新/离线；工作区未发布，业务接入、固定→portable 迁移、实体手机和其他浏览器仍无本次证据 | [A6 线上结果](a6-https-drill-result.md)、[portable E2E](../../../packages/vite/browser-tests/portable-deployment.spec.ts)、[ADR-0050](../../adr/0050-portable-deployment.md) |
| A7 | P2 已知发布操作风险 | 0.2.3、0.2.4、0.2.5 均在批量暂存后的批准阶段出现依赖方先公开、依赖包尚不可下载的窗口（约 9/4/2 分钟）；本地 `check:publish` 不约束 npm 网页批准顺序 | [三版时间线与放行条件](07-recommendations.md#a7-npm-批准顺序与可下载性)；逐层批准，并在批准下一层前下载核验本层每个 tarball |
| A8 | P2 接入误配风险 | 平台拒绝 `private`/`no-store`/`Vary: Cookie` 等，但缺 `Cache-Control` 仍可写缓存；同源 Cookie 请求不自动排除，worker 看不到 `Set-Cookie`，也无法判定业务授权、语言、地区语义。仓库测试只用夹具，缺真实业务接口证据 | [逐规则审查清单](07-recommendations.md#a8-公共缓存逐规则审查清单)、[准入实现](../../../packages/sw-runtime/src/worker/admit.ts)；业务接口逐个批准后才启用 |
| A9 | P3 可观测性/故障诊断 | Edge 已有真实浏览器全套结果；Safari/Firefox/iPhone 的部分导航状态、响应来源、CSP 违规事件及 CDP 专用断言仍跳过或标为无法验证。读取同一预缓存 URL 的头、页面可交互只能提供旁证，不能折算为导航头或零违规 | [逐项分层与补证顺序](07-recommendations.md#a9-非-chrome-观测缺口)、[矩阵限制](../../../website/reference/platform-test-matrix.md)；保留原注解并优先补发布入口和安全准入 |

## 多维度判断

| 维度 | 当前结论与依据 |
| --- | --- |
| 模块边界 | contracts → core → worker/runtime → Vite/框架门面，发布验证是纯函数；[架构总览](../../architecture/overview.md)与[包边界](../../architecture/package-boundaries.md)一致。Nuxt/Push/离线写仍私有，不应借私有测试宣称公开支持。 |
| 公开 API/配置 | `PwaIdentity` 与 portable 身份是显式判别联合；旧固定源不隐式升级，[类型](../../../packages/contracts/src/identity.ts)、[插件验证](../../../packages/vite/src/options.ts)。版本边界见 A2。 |
| 身份、SW scope | 固定模式 origin/scope/SW URL/manifest ID 与缓存种子受基线约束；共享源排除子路径。[ADR-0050](../../adr/0050-portable-deployment.md)指出跨模式迁移需人工批准。 |
| 缓存准入/清理/迁移 | 未分类默认透传；v3 公共 GET 才可写运行时缓存；规则变化换新缓存摘要，激活/登出/恢复路径清理。用户敏感接口误分类仍需宿主评审（A8）。 |
| 更新生命周期 | 仅用户确认，检测与 UI 默认分离；多标签靠浏览器 `controllerchange`。无自动刷新是设计，[更新客户端](../../../packages/client-runtime/src/client/facade.ts)。 |
| 离线与恢复 | 精确同路径回退、离线页、入口恢复、恢复 worker 各解决不同故障。A1 是文档漏了触发前提；真实 DNS/证书尚未演练（A5）。 |
| 安全 | 非 GET/跨源/授权/Range/公共响应头准入有明确边界；恢复清理按应用命名空间。真实业务响应分类与发布观测真实性不由库自动证明。 |
| 浏览器兼容 | Chrome 是正式桌面门禁；Edge/Safari/Firefox/Android/iPhone 有不同深度自动化和人工证据，[矩阵](../../../website/reference/platform-test-matrix.md)。 |
| 可测试性 | 纯决策表、包级单元、真实 Chrome E2E、真实浏览器/手机测试均存在；公网/设备/安装形态缺口见 A5/A6/A9。 |
| 可维护性/扩展性 | 策略编译与引擎分离，Workbox 不暴露给业务；29 个规格/计划与 ADR 使边界可追溯。跨文档事实漂移是当前主要维护成本（A4）。 |

**有意取舍**：不缓存未分类/私有请求、不提供任意 Workbox 配置、不给 SPA 深链通配根壳、只提示更新、离线写不静默后台重放、不自动跨 Origin 迁移会话。这些不作为“未实现缺陷”；只评估它们是否写清、是否让开发者能做出选择。

## 后续状态（2026-10-01 本地复核）

A1 的导航规则和 A2 的显式版本提示已在网站文档修正；离线页由编译器自动预缓存，无须额外资产规则。A1 的根路径、`install:null`、宿主 manifest、生成离线页组合浏览器断言在本地 Chrome 通过；A6 的另一份 `/app/` portable 夹具已在双真实 HTTPS 源通过桌面 Chromium 离线/更新，不能把这两种配置拼成一个未经测试的组合。A2 的版本检查只覆盖 portable/worker MIME，其他配置字段仍靠现有文档和类型测试。A3 在仓库自带发布验证示例中已接入 MIME 观测、必需覆盖和历史完整性判定，也有错误 MIME 反例；开放风险针对仓库外的旧业务编排器。A4 的自动检查只确认结构和文件存在，不能替代逐项证据复核。新增验证范围与结果见[建议处理记录](07-recommendations.md#本轮后续处理2026-10-01-本地复核)。
