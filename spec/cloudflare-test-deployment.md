# 规格：cloudflare-test-deployment

## 目标

为 PWA Platform 的宿主示例建立可重复的 Cloudflare 测试部署约定，在真实 HTTPS origin 上取得桌面浏览器证据，同时保持各宿主的 PWA 身份、构建产物、发布记录和恢复演练相互隔离。本模块是测试基础设施，不是新的公开 npm 包，也不代表业务生产发布门禁通过。

## 部署拓扑

| 对象 | 目标形态 | 本期状态 |
|---|---|---|
| React Vite 示例 | 独立 Cloudflare Pages Direct Upload 项目 | 首批实施 |
| Vue Vite 示例 | 独立 Cloudflare Pages Direct Upload 项目 | 首批实施 |
| 现有 `pwa-t15-mobile-smoke` | 保留为既有 React 冒烟／生命周期站 | 不改名、不复用为其他宿主 |
| Nuxt SSR 示例 | 独立 Cloudflare Worker + 静态资源；先做兼容性验证 | 可行性门禁后实施 |
| Next 与 TanStack Start | 尚无合格的平台宿主接入契约 | 不创建项目、不计入本期验收 |
| 同源多 PWA | 独立的后续拓扑实验 | 不与常规宿主示例混装 |

每个宿主应用在一个部署项目内同时服务 PC 和 H5；设备类别仅用于测试矩阵和证据记录，不增加项目或改变 PWA 身份。本期优先验证桌面 Chrome，包括原生安装独立窗口和离线重载；移动端浏览器与移动端原生安装延后，不据此宣称 V1 发布合格。

## 部署契约

1. 维护一份显式目标登记：宿主、源目录、构建命令、产物目录、Cloudflare 资源类型与项目名、部署槽位、预期 origin、mount path、scope、发布分支、证据目录。创建项目后以实际分配的 URL 冻结身份；如果 Cloudflare 因重名分配带后缀的域名，不能继续使用推测的 URL。部署命令只能选择登记目标，不接受任意项目名或目录。
2. Pages 每次上传仅使用该目标的隔离 staging 根目录，例如 `build/cloudflare/<host>/<slot>/site/`；`/app/` 身份须对应 `site/app/`，`_headers` 放在 `site/`。从真实依赖与示例源码重新构建，不能复用不明来源的被忽略 `dist`。不得上传源码、环境文件、令牌、测试截图或其他宿主产物。
3. React 与 Vue 使用各自 origin、`appId`、缓存命名空间和发布槽位。现有共享 `.invalid` 示例身份只适用于本地对照测试；正式测试站需在构建时提供与实际站点相符的身份配置，保持本地 E2E 的可比性。身份首次上线后按既有身份基线规则冻结。
4. Pages `main` 为稳定测试槽位；预览分支若用于可安装、恢复或更新演练，须按其实际分支别名 origin 单独构建身份和基线。只预览页面内容时可禁用 PWA 注册并明确记录。不能把 `main` 身份原样上传到另一个 origin 后声称安装验收通过。
5. 静态 HTML、离线页、worker、恢复 worker 与 manifest 使用可再验证的 `no-cache` 响应；带指纹资源使用长缓存。Pages 对 `.html` 的重定向结果、状态码、内容类型、缓存头及 manifest 路径都要在部署后逐项核验。SSR 响应头由 Worker 自行设置与核验，不能依赖 Pages `_headers`。
6. 每次发布保存候选计划、构建摘要、资产清单、部署 ID、实际 URL、响应头与浏览器测试证据。R、R-1、R-2 及七天窗口内应保留的指纹资源要随新上传继续可访问；Pages 的历史部署或边缘缓存不自动构成保留证据。缺少旧资产归档或线上可用性核验时停止稳定槽位发布。
7. 恢复演练须在隔离槽位先验证正常版本、提示更新、恢复 worker 接管、缓存清理、再次正常发布和离线启动。Pages 回滚与 PWA 恢复 worker 是两种不同操作，均记录部署 ID 和结果；不在稳定站直接用未经验证的恢复演练替代发布。
8. 本地 Direct Upload 不依赖 GitHub；最小权限 Cloudflare 凭据由密钥管理提供，不写入仓库、上传目录或日志。正式发布所需 CI、Android 和原生安装证据依原门禁记录缺口，不因本模块完成而豁免。

## 验收标准

- React 与 Vue 各有独立 HTTPS 测试 origin；目标登记、实际 Cloudflare 项目、身份、构建输入、上传根目录和现场响应逐项一致，且项目间无文件或 Service Worker scope 串用。
- 两站桌面浏览器均通过在线访问、注册与接管、静态离线兜底页、提示更新和恢复演练；记录完整浏览器版本、日期、部署 ID 和失败／跳过项。业务 API 不进入运行时缓存。
- 新发布后抽样核验当前与保留窗口中的指纹资源仍可访问；真实响应头由线上请求取得，而非只检查 `_headers` 文件。
- Nuxt 仅在 Workers 兼容性、SSR 请求时渲染、静态产物路径、PWA 注册、离线回退和响应头均验证后列入部署目标；否则明确记录为未验证。
- 桌面试点证据与正式 V1 门禁分开；手机、原生安装、远端 CI 缺失时仍标记未取得。

## 非目标

不实现业务运行时缓存、私密数据缓存、离线写入／自动重放、Push、Next 或 TanStack Start 宿主适配；不以一个 Pages 项目多子目录合并独立 PWA；不创建新的公开运行时包；不修改现有发布门禁和浏览器矩阵。

## 依据与待验证项

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)：单个上传目录、预览分支别名；Direct Upload 项目以后不能原地转换为 Git 集成。
- [Cloudflare Pages Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) 与 [Headers](https://developers.cloudflare.com/pages/configuration/headers/)：HTML 路径处理、历史资产可用性和静态响应头边界。
- [Cloudflare Workers Nuxt 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/)：Workers 部署路径是候选，不等于当前仓库的 Nuxt 适配已通过 Cloudflare 验证。
- 具体项目名、Workers 权限和 Nuxt runtime 兼容性需在创建资源前再次验证；不得从文档推断已部署。

## 修订：线上发布事实采集与机器发布门禁（2026-09-22，已评审通过）

### 起因

[发布门禁](../docs/operations/release-and-incident-runbook.md#发布门禁)的"机器发布门禁"一项，要求采集公开产物路径、响应头、完整成功历史与当前可用资产路径，调用 `verifyRelease` 执行 `requiredChecks` 的全部检查，并且 `verifyReleaseGateCoverage(report, requiredChecks).ok` 与 `report.ok` 同时为真。对 React/Vue 测试站盘点（[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 3 项）发现：

| 问题 | 现状 | 后果 |
|---|---|---|
| 没有工具 | 仓库里唯一调用 `verifyRelease` 的是本地 fixture 上的浏览器测试；`deploy-cloudflare-site.mjs --mode=check` 做的是本模块自己的保留与部署 ID 核对，不调用 `verifyRelease` | 测试站无法产出机器发布门禁报告 |
| 构建记录缺计划 | `build/cloudflare/<host>/<slot>/build.json` 只保存身份、文件哈希与保留信息，不保存 `PwaPlan`，违反本规格部署契约第 6 条 | 候选计划与历史计划都无从取得 |
| 历史计划缺失 | 两站 `main` 已各有多次生产部署，均未保存计划 | `release-retention` 无法取得完整历史 |
| 空历史会假通过 | `verifyReleaseRetention` 收到空的 `previous` 时，只要求当前计划的指纹资源可用 | 采集方若传空历史，保留检查会在事实不完整时通过 |

### 已确认的前提（项目所有者，2026-09-22）

- 以修订本模块的方式落地，不挂在 `release-orchestration-protocol` 下：该协议的范围规定实际发布器与 CDN/API 客户端由外部系统实现，本仓库只交付协议与模板；本工具只服务本模块登记的测试站。
- 工具只读，不需要任何凭据：不调用 Cloudflare API 或 R2，不上传，不写身份基线，不改线上。
- 工具产出报告，不代替发布决定；报告、覆盖结果、必需集与采集到的事实写到仓库外目录。
- 组装输入与判定结论的逻辑是带单元测试的纯函数；网络采集有集成测试。
- 候选计划在构建时通过 `@pwa-platform/vite` 的只读计划 API（`PwaPluginApi`）从实际构建取得并保存，不在工具里重新编译。
- 历史不全时如实判失败：工具不得在实际部署多于有计划的记录时传入空的或截短的历史。
- 代码放在 `packages/examples-browser-e2e`：它已经以开发依赖引用 `build-verifier` 与 `contracts`，有 vitest，也已拥有 Cloudflare 身份配置与基线文件。`packages/release-tools` 的边界规定"不依赖任何平台包"，不适用；不新建包。
- 生产部署历史由带凭据的一侧导出，本工具只读该文件；导出文件随报告存档并记录其哈希。本地发布包目录被 Git 忽略，因此目前只能在保存了发布包的机器上得到通过结论，其他机器上如实判为缺计划。
- 本修订只做**上线后核验**（观测已上线的版本），报告标注"上线后核验"，只用于演练。上线前核验（候选部署到与生产同内容的预览地址后再观测）留给之后的修订。

### 不变的部分

- 发布门禁、发布编排协议、身份基线规则与 `build-verifier` 的公开契约。
- 现有部署、归档、打包、R2 与保留审计脚本的行为；本修订只在构建脚本中增加"保存计划"。
- 上传白名单：计划文件不进入上传目录。

### 契约增量

**构建时保存计划**

- Cloudflare 构建在 vite 构建内部，于 `writeBundle` 或之后读取 `PwaPluginApi` 的计划，把它写到上传目录之外，再由 `build-cloudflare-site.mjs` 合并进 `build.json` 的 `plan` 字段。
- 保存前以 contracts 的 `validatePlan` 校验；计划的身份必须与 `build.json` 的 `identity` 逐字段一致，不一致即构建失败。
- 发布包（`package-cloudflare-site.mjs`）随之携带计划，使以后的历史发布都能取回计划。

**采集输入（有副作用，只读网络）**

- 输入：登记目标与槽位；本地候选 `build.json`；仓库中该槽位的基线文件；一份**生产部署历史文件**（见下）。
- 公开产物路径：取自候选 `build.json` 的文件清单，换算成站点绝对路径。
- 响应头：对观测地址上的 worker、manifest、公开 HTML 与带指纹资源逐个发起 HTTPS 请求（保持证书校验），只记录响应头，不保存响应体。
- 当前可用资产路径：对当前计划与历史计划中的全部带指纹资源逐个请求，HTTP 200 且内容与记录的哈希一致才算可用。
- 生产部署历史：由带凭据的一侧导出一份成功生产部署列表，每项含部署 ID、部署时间，以及从 R2 部署索引查到的发布包 SHA-256（查不到则写空）。本工具只读取这个文件，不访问 Cloudflare API 或 R2；它按摘要读取本地 `build/cloudflare/release-bundles/<host>/<slot>/` 中的发布包，从中取回计划。摘要为空、本地找不到发布包、发布包摘要不符或发布包中没有计划，都按"该部署缺计划"处理。
- 观测地址固定为目标登记中该槽位的生产 origin，不接受任意地址；候选 `build.json` 的文件哈希必须与线上字节一致，否则说明线上不是这个候选，工具拒绝出报告。

**组装与结论（纯函数）**

- 按拓扑确定 `requiredChecks`（独立源为 `artifacts`、`response-headers`、`identity-baseline`、`release-retention`），为每项检查提供输入；某项输入取不到时**如实传入取到的事实**，交给检查去报诊断，不省略该属性。
- 基线：找到基线文件就传入其内容；找不到则传入 `undefined`，由检查报告 `verify.baseline-missing`，不省略 `baseline` 属性。
- 历史：历史文件中的每个部署都必须取回计划。**任一部署缺计划时，不传入截短的历史**，而是把保留检查判为失败，并在报告旁的事实文件中列出缺计划的部署 ID。
- 结论：只有 `report.ok` 与 `verifyReleaseGateCoverage(report, requiredChecks).ok` 同时为真，且历史完整，才判通过；三者分别写出，不合并成一个布尔值。

**输出与入口**

- 输出目录必须位于仓库及其所有 worktree 之外，已存在即拒绝运行。
- 产出 `facts.json`（采集到的事实，不含令牌与响应体）、`report.json`（`verifyRelease` 报告）、`coverage.json`（覆盖结果与必需集）和一份按[发布记录模板](../docs/operations/release-record-template.md)"机器检查"相关字段渲染的 Markdown 片段；终端打印各文件的 SHA-256。
- 通过时以 0 退出，否则非 0。
- 根目录新增脚本 `verify:cloudflare:release`，参数至少包含 `--target`、`--slot`、`--history <文件>`、`--out <仓库外目录>`。

### 本修订不做的事

- 不部署、不回滚、不写基线、不推进发布记录的状态。
- 不访问 Cloudflare API、R2 或任何需要凭据的接口；不读取或输出令牌。
- 不重建历史提交来还原计划；不在历史不全时降级为只检查当前计划。
- 不服务测试站以外的应用；不改变 `build-verifier`。

### 交付物增量

- `packages/examples-browser-e2e` 中的采集与判定代码及其测试。
- `scripts/build-cloudflare-site.mjs` 与示例的 Cloudflare 构建配置：保存计划；`package-cloudflare-site.mjs`：发布包携带计划。
- 带凭据一侧的历史导出：在保留审计脚本中增加一个选项，导出成功生产部署列表并附上 R2 部署索引中的发布包摘要。
- 根 `package.json` 的 `verify:cloudflare:release` 脚本；[Cloudflare 测试站目标登记](../docs/operations/cloudflare-test-deployment.md)补充命令说明；[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 3 项更新状态。

### 测试策略增量

- **单元测试**：`requiredChecks` 按拓扑选择；基线存在、不存在两种情况下 `baseline` 属性都被传入；历史完整时组装出按时间从新到旧的 `previous`；**历史中任一部署缺计划时判失败，并且不会以空历史或截短历史调用保留检查**；三个结论分量任一为假即不通过；输出目录位于仓库内时拒绝运行。
- **构建测试**：构建记录中的计划通过 `validatePlan`，身份与 `build.json` 一致；计划文件不出现在上传目录中。
- **集成测试**：用本地 fixture 服务器模拟站点与本地发布包目录，覆盖：全部通过；响应头缺 `no-cache`；一个保留资源 404；一个保留资源内容被篡改；历史缺计划。
- **真实运行**：对 React 与 Vue 的 `main` 各跑一次上线后核验，结果写入本模块验证记录；预期在历史补齐前因"历史缺计划"判失败，这一失败本身就是要记录的结论。

### 验收标准增量

- 两站构建记录都含经过校验的计划，且计划不在上传目录中。
- 工具对两站各产出一套报告文件，事实文件不含令牌与响应体。
- 历史缺计划时，报告判失败并列出缺计划的部署 ID；不存在以空历史通过保留检查的路径（由单元测试钉住）。
- 历史补齐后（后续发布均携带计划且保留窗口内不再有缺计划的部署），同一工具能在不修改代码的情况下判通过。

## 修订：上线前核验（2026-09-22，已评审通过）

### 起因

上一修订只做**上线后核验**：观测已上线的版本。发布门禁要求在发布**之前**就得到机器门禁结论，而候选尚未上线时，生产地址上观测不到它。[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 3 项把"上线前核验"列为未完成。

### 已确认的前提（项目所有者，2026-09-22）

- **观测对象是一次预览部署。** 把候选的暂存目录原样 Direct Upload 到 Pages 项目的预览分支 `candidate`，在这次预览部署上运行机器门禁；通过评审后，再把**同一份暂存目录**上传到 `main`，并以上一修订的上线后核验确认线上与候选逐字节一致。
- **部署契约第 4 条的例外。** 契约第 4 条要求安装、恢复或更新演练用的预览按分支别名单独构建身份。本修订需要把 `main` 的候选原样上传到预览地址，否则字节比对失去意义。例外仅限于此：`candidate` 分支只用于机器检查；不在其地址上做安装、浏览器或恢复验收，不以它声称任何安装验收通过；每次上传都记录部署 ID。
- **本修订不在部署脚本中强制上线前核验。** 保留检查要等历史补齐才能执行，现在强制会阻塞所有部署。发布记录引用上线前核验的报告即可；历史补齐后再以单独的修订改为强制。
- **每次上传到 `candidate` 都是一次 Cloudflare 写操作**，只写预览环境，需要凭据并经项目所有者同意。
- 仍然只服务本模块登记的测试站的 `main` 槽位；`drill` 有自己的身份与流程，不在范围内。业务项目的上线前核验归后续"业务项目的发布门禁接入"。
- **空的生产历史判为不完整。** 上线前核验无法区分"真正的首次发布"与"历史导出缺失"，因此历史为空时不执行保留检查。两个测试站都已有生产历史，目前不会遇到；真正的首次发布本就需要平台负责人批准，届时以单独的修订配合批准记录处理。

### 不变的部分

- 上一修订的上线后核验行为、历史文件格式与报告格式（在其上增加字段时保持向后兼容）。
- 部署脚本现有的 `check`、`preflight`、`deploy` 模式与 `main`、`drill` 槽位的行为。
- 发布门禁、发布编排协议、身份基线规则与 `build-verifier` 的公开契约。

### 契约增量

**上传候选到预览分支（有凭据的写操作）**

- `deploy-cloudflare-site.mjs` 增加 `--mode=preview-candidate`，只接受 `--slot=main`：复用现有对暂存目录的白名单、哈希、身份与计划校验，然后以 `--branch=candidate` 上传同一份 `build/cloudflare/<host>/main/site/`。
- 该模式**绝不**以生产分支上传；上传后以 Pages API 读回这次部署，确认其环境为 `preview`（`environment`）、分支为 `candidate`（`deployment_trigger.metadata.branch`），并确认 API 返回的部署地址等于按部署 ID 推算的唯一地址（见下），任一不符即报错；然后输出部署 ID、唯一部署地址与暂存回执的 SHA-256。不写 R2 索引，不打发布包，不改基线。
- "唯一地址 = 部署 ID 前 8 位加项目域名"目前只有生产部署的实例（React `4e5f259f-c985-4c2d-9c76-853c5b33a107` 对应 `https://4e5f259f.pwa-platform-react-demo.pages.dev`，见[验证记录](../tasks/cloudflare-test-deployment/verification.md)）；上一条的读回比对就是为了在预览部署上验证这条规律，规律不成立时立即暴露，而不是让核验工具观测错误的地址。

**上线前核验模式（无凭据）**

- `verify:cloudflare:release` 增加参数 `--pre-deploy=<预览部署 ID>`。观测地址由部署 ID 推算为唯一部署地址 `https://<部署 ID 前 8 位>.<项目>.pages.dev`，仍不接受任意地址；分支别名会随后续部署移动，不用于观测。
- 线上字节比对、响应头观测与可用性检查都在这个地址上进行，规则与上线后核验相同（不跟随跨域重定向，观测响应头不经过重定向，请求有超时）。字节与候选不一致即拒绝出报告。
- **历史：** 候选尚未进入生产历史，因此历史文件中的**全部**成功生产部署都是"之前的版本"。任一部署缺计划、时间戳不可排序或 ID 重复，仍判历史不完整，且不调用保留检查。这需要在纯函数层增加上线前的组装变体；上线后变体的行为不变。
- **两个前提由工具强制：** 暂存目录中的 `_headers` 只能包含以 `/` 开头的路径规则，出现按主机名的规则即拒绝运行，否则预览上的响应头不能代表生产；预览部署额外附加的 `X-Robots-Tag: noindex` 不参与判断，但如实记入事实文件。
- 事实文件的 `mode` 为 `"pre-deploy"`，并记录预览部署 ID 与观测地址；记录片段注明"上线前核验：观测对象为预览部署"。

**与上线后核验衔接**

- 上线前核验报告中的候选暂存回执 SHA-256，必须与之后上线后核验报告中的一致；两份报告与两次部署 ID 一起写入发布记录。本修订只要求记录，不做自动校验。

### 本修订不做的事

- 不在部署脚本中强制"必须先通过上线前核验"。
- 不在 `candidate` 预览地址上做任何浏览器、安装或恢复验收。
- 不删除或清理预览部署；不改变 `main` 与 `drill` 的上传流程。
- 不服务业务项目。

### 交付物增量

- `scripts/deploy-cloudflare-site.mjs` 的 `preview-candidate` 模式。
- `packages/examples-browser-e2e/release-verifier/` 中的上线前组装变体、`--pre-deploy` 参数、`_headers` 规则检查及测试。
- [Cloudflare 测试站手册](../docs/operations/cloudflare-test-deployment.md)补充上线前核验的步骤；[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 3 项更新状态。

### 测试策略增量

- **单元测试：** 上线前组装把全部生产部署作为之前的版本，按时间从新到旧；缺计划、时间戳不可排序、ID 重复时判不完整且没有 `retention` 属性；上线后变体的既有测试全部保持通过。部署 ID 推算地址：合法 UUID 得到唯一地址，其他输入拒绝。`_headers` 规则检查：只有路径规则时通过，出现 `https://` 或 `:project` 形式的主机规则时拒绝。
- **集成测试：** 用本地 fixture 服务器模拟预览部署，覆盖：全部通过（保留检查被执行）；预览字节与候选不一致时拒绝；`X-Robots-Tag` 存在时不影响结论并被记入事实；`_headers` 含主机规则时拒绝。
- **部署脚本：** `preview-candidate` 模式在参数层面拒绝 `main` 以外的槽位；无法在无凭据下验证的上传与读回部分，在真实运行时核对部署的环境与分支。
- **真实运行：** 经项目所有者同意后，对 React 与 Vue 各做一次"上传到 `candidate` → 上线前核验"。按目前历史仍缺计划，预期保留检查未执行、结论未通过；这一结论如实记入验证记录。本修订的真实运行不包含随后上传到 `main`。

### 验收标准增量

- 两站各有一次 `candidate` 预览部署，部署 ID、环境 `preview` 与分支 `candidate` 已记录；预览地址上未做任何浏览器或安装验收。
- 上线前核验对两站各产出一套报告，`mode` 为 `"pre-deploy"`，观测地址是由部署 ID 推算的唯一部署地址。
- 不存在以截短历史通过保留检查的路径，上线前与上线后两个变体都由单元测试钉住。
- 部署脚本在没有 `--mode=preview-candidate` 时的行为不变。

## 修订：`drill` 上传前预检与上传后自动步骤（2026-09-22，已评审通过）

### 起因

`main` 的重复上传已经自动化：上传前核对候选 R2 制品与当前部署索引，上传后取得新部署的完整 ID，写 R2 部署索引、归档带指纹资源、运行保留审计（T5）。`drill` 仍全部人工：部署前后都要自己查部署列表、手动归档，也不写 R2 索引。T5 把"`drill` 后置步骤自动化"列为剩余项；2026-09-22 的恢复演练中，这些人工步骤被重复执行了十余次。

打包、R2 制品上传与校验、R2 部署索引（`record`／`check`）、归档四个脚本**都已支持 `drill` 槽位**，其中索引脚本对 `drill` 要求部署是该分支最新的预览部署，归档脚本也以最新的 `drill` 部署为当前部署。缺的只是在部署脚本中把它们串起来。

### 已确认的前提（项目所有者，2026-09-22）

- 以修订本模块的方式落地，只改 `deploy-cloudflare-site.mjs` 的 `drill` 路径；`main`、`preview-candidate` 与 `check` 模式的行为不变。
- **上传前预检**：`drill` 的非 `check` 模式要求 `--artifact-sha256`，并以 R2 制品校验（`r2:cloudflare:bundle --mode=verify`）确认候选制品已上传且与暂存回执一致。**不要求**当前部署的 R2 索引：此前的 `drill` 部署大多没有索引。
- **上传后自动步骤**：取得新部署的完整 ID（比较上传前后的 `drill` 预览部署列表，必须恰好多出一个），然后依次写 R2 部署索引（`record`）、归档该部署的带指纹资源。
- **不做保留审计**：审计脚本只读生产历史；`drill` 是演练槽位，不承载真实用户。
- **不为已有 `drill` 部署补写索引**：自动化从下一次 `drill` 部署开始生效。
- 后置步骤失败时与 `main` 一致：保留现场，报错说明"部署已上线，但某一步失败"，并提示先处理再重新上传。

### 不变的部分

- `main` 的预检与后置步骤；`preview-candidate` 模式；`check` 模式的只读行为。
- 打包、R2、归档、审计各脚本的行为与接口。
- `drill` 的首次引导逻辑（尚无基线时的中性页上传）。

### 契约增量

- **生效条件**：只在 `drill` 已有基线文件时生效，对应 `main` 以"已有部署"为条件的做法；尚无基线的首次引导上传照旧，不要求制品，也不写索引。
- **预检**：`--slot=drill` 且模式为 `preflight` 或 `deploy` 时，在读取凭据之前校验 `--artifact-sha256` 为 64 位十六进制，缺失即拒绝；读取凭据后，解开本地发布包比对回执，并运行 `r2:cloudflare:bundle --mode=verify`，失败即拒绝上传。
- **识别新部署**：上传前记录 `drill` 分支预览部署的 ID 集合，上传后再取一次，新增集合必须恰好一个，否则报错并说明上传可能已发生。
- **后置步骤**：依次运行 `r2:cloudflare:index --slot=drill --sha256=<候选> --deployment-id=<新 ID> --mode=record` 与 `archive:cloudflare:site --slot=drill --deployment-id=<新 ID>`。任一步失败即停止，报错写明部署 ID 与失败的步骤。
- **输出**：成功时输出一行 JSON，含 `target`、`slot: "drill"`、`deploymentId`、`postDeployIndexedAndArchived: true`。

### 本修订不做的事

- 不为 `drill` 做保留审计；不补写历史索引；不自动打包或上传 R2 制品（与 `main` 一致，由操作者先运行打包与 `r2:cloudflare:bundle`）。
- 不改变 `main`、`preview-candidate` 与首次引导的流程。

### 交付物增量

- `scripts/deploy-cloudflare-site.mjs` 的 `drill` 预检与后置步骤。
- 安全测试：参数层的拒绝（缺少或格式错误的 `--artifact-sha256`）在读取凭据之前发生，以空临时根目录运行脚本副本验证；静态检查 `drill` 路径不调用保留审计、不改动 `main` 路径。
- [Cloudflare 测试站手册](../docs/operations/cloudflare-test-deployment.md)"隔离预览槽位的重复部署与恢复"一节改为新流程；待办 T5 更新。

### 测试策略增量

- **参数层**：`drill` 的 `deploy`／`preflight` 缺少 `--artifact-sha256` 或格式错误时，在读取凭据之前拒绝；`check` 模式不受影响。
- **静态检查**：`drill` 后置步骤只调用 `r2:cloudflare:index`（`record`）与 `archive:cloudflare:site`，不调用 `audit:cloudflare:retention`；`main` 的预检与后置步骤文本不变。
- **真实运行**：经项目所有者同意，对一个 `drill` 做一次完整的"打包 → 上传 R2 制品 → 部署"，确认新部署 ID 被自动识别，R2 索引读回（`--mode=check`）一致，本地归档包含该部署的带指纹资源。

### 验收标准增量

- `drill` 部署不再需要人工查询部署 ID、人工归档；R2 中有该部署的索引，并可用 `--mode=check` 读回核对。
- 缺少候选制品时，`drill` 上传在读取凭据之前被拒绝。
- `main`、`preview-candidate` 与 `check` 模式的行为不变（既有安全测试全部通过）。

## 修订：从 R2 恢复运营状态（2026-09-22，已评审通过）

### 起因

`drill` 与 `main` 的发布依赖主目录中被 Git 忽略的运营状态：`build/cloudflare/<host>/<slot>/` 的暂存目录与构建回执、`retained/<slot>/` 的旧资源归档、`release-bundles/` 的发布包。机器损坏或更换时，这些状态只能从 R2 取回。目前只在同一台机器上演练过"临时移走本地归档后从 R2 重建"（[验证记录](../tasks/cloudflare-test-deployment/verification.md)），操作手册把"独立机器下载、校验与事故恢复"列为 pending，T5 也把它列为剩余项。

恢复所需的零件都已存在：保留审计脚本的 `--export-history` 能从 R2 部署索引查出当前生产部署对应的发布包摘要；`r2:cloudflare:bundle --mode=download` 下载并校验发布包；`restore:cloudflare:site --mode=restore` 从发布包重建暂存目录与构建回执；`archive:cloudflare:site` 可在暂存目录与线上字节一致时重建旧资源归档。缺的是按顺序把它们串成一条命令，并在一个没有本地运营状态的环境中证明结果可以直接用于下一次发布。

### 已确认的前提（项目所有者，2026-09-22）

- **本机隔离模拟，不是独立机器。** 在临时目录全新克隆仓库，执行前确认其中没有 `build/`，只用 R2 与凭据恢复。记录中如实标注"同机隔离模拟，不等于独立机器"：它能证明恢复不依赖本地 `build/`，但不能证明换机器后凭据配置、Node 版本等环境差异不会出问题。
- **写一条命令的恢复脚本**，只串联现有脚本，不重写它们的逻辑。
- **只恢复 `main`**；`drill` 按原流程重新部署即可恢复，不在本修订范围。
- **不做生产写操作**：只恢复状态并做只读核对，不重新部署 `main`。
- **2026-09-22 修改（项目所有者确认）：区分"恢复出当前状态"与"可以继续发布"。** 首次隔离模拟中，前四步准确恢复了暂存目录、构建回执与归档（与主目录一致），但第五步 `deploy --mode=check` 必然失败：它检查的是**新候选**是否基于当前部署的归档构建（回执的 `retention.sourceDeploymentId` 须为当前部署），而恢复出的是**当前部署自身**，其回执指向上一次部署。因此脚本最后一步改为只读的 `r2:cloudflare:index --mode=check`，证明恢复的发布包、线上字节与 R2 索引一致；"可以继续发布"改由恢复后照常构建新候选再运行 `deploy --mode=check` 来证明，在隔离模拟中执行。
- 以修订本模块的方式落地。

### 不变的部分

- 各现有脚本（审计与导出、R2 制品、恢复、归档、部署）的行为与接口。
- `main` 与 `drill` 的发布流程。

### 契约增量

**恢复脚本 `scripts/recover-cloudflare-site.mjs`**（根脚本 `recover:cloudflare:site`，参数 `--target=<react|vue>`，槽位固定为 `main`）：

1. **拒绝覆盖运营状态**：`build/cloudflare/<host>/main/`、`build/cloudflare/<host>/retained/main/` 任一已存在即拒绝运行，并提示把现有状态移开后再试。`restore --mode=restore` 会不加提示地删除并重建暂存目录，这一步防止在运营中的目录里误用。检查在读取凭据之前完成。
2. **查当前部署与发布包**：以 `audit-cloudflare-retention.mjs --export-history` 导出到临时文件（仓库之外），取 `canonicalDeploymentId` 与其 `bundleSha256`；摘要为空即拒绝（该部署没有 R2 索引，无法恢复）。
3. **下载并恢复**：`r2:cloudflare:bundle --mode=download` 下载并校验发布包，`restore:cloudflare:site --mode=restore` 重建暂存目录与构建回执。
4. **重建旧资源归档**：`archive:cloudflare:site --deployment-id=<当前部署>`，该脚本会核对暂存目录与线上字节。
5. **核对恢复结果**：`r2:cloudflare:index --deployment-id=<当前部署> --sha256=<发布包摘要> --mode=check`，只读地确认发布包、线上文件字节与 R2 部署索引三者一致。
6. 任一步失败即停止，报错写明失败的步骤；已恢复的文件保留在原处供检查，不自动清理。成功时输出一行 JSON：`target`、`deploymentId`、`bundleSha256`、`retainedAssets`、`indexVerified: true`，并提示下一次发布照常先构建新候选，再运行 `deploy --mode=check`。
7. 不上传、不部署、不写 R2 索引；只发 GET 请求（Pages API、R2、线上站点）。

### 本修订不做的事

- 不在真正的第二台机器上验证；不恢复 `drill`；不重新部署 `main`。
- 不恢复历史发布包（上线前后核验所需的历史计划）：只恢复当前部署的发布包，历史发布包仍可按需用 `--mode=download` 逐个取回。

### 交付物增量

- `scripts/recover-cloudflare-site.mjs`、根 `package.json` 的 `recover:cloudflare:site` 脚本。
- 安全测试：以空临时根目录运行脚本副本，验证状态已存在时在读取凭据之前拒绝；静态检查脚本中不出现上传、部署（`--mode=deploy`）、`--mode=upload` 或 `--mode=record`。
- [Cloudflare 测试站手册](../docs/operations/cloudflare-test-deployment.md)增加"从 R2 恢复运营状态"一节；待办 T5 与状态表更新。

### 测试策略增量

- **参数与安全**：未知参数、非 `react`／`vue` 目标被拒绝；暂存目录或归档已存在时在读取凭据之前拒绝；静态检查只读性。
- **真实运行（隔离模拟）**：经项目所有者同意，在临时目录全新克隆主仓库当前 `main`，安装依赖并构建工作区包，执行前断言克隆中没有 `build/`；对 React 与 Vue 各运行一次恢复脚本。随后在克隆中以 `--release=v2` 本地构建新候选并运行 `deploy --mode=check`，证明恢复后可以继续发布（只在本地构建，不上传）。与主目录只读比对：恢复出的暂存目录文件、构建回执中的文件哈希与计划，须与主目录逐字节一致；旧资源归档中重建出的每个资源，哈希须与主目录归档中的同名资源相同。归档是逐次发布累积的，主目录归档可能还含有已不在当前暂存目录中的资源，因此两边的资源集合允许不同，但每一项差异都要列出并说明原因。完成后删除临时克隆。

### 验收标准增量

- 在没有本地 `build/` 的全新克隆中，一条命令为两站 `main` 恢复出暂存目录、构建回执与旧资源归档，并通过 R2 索引的只读核对；随后在克隆中构建的新候选通过 `deploy --mode=check`。
- 恢复出的暂存目录与构建回执与主目录逐字节一致；重建的归档资源哈希与主目录一致，集合差异逐项说明。
- 脚本在已有运营状态的目录中拒绝运行；全程没有写操作。
- 记录标注"同机隔离模拟，不等于独立机器"。

## 修订：核验工具采集公开 HTML 响应头（2026-09-22，已评审通过）

### 起因

`build-verifier` 新增了 `html-headers` 检查（[ADR-0032](../docs/adr/0032-html-response-header-check.md)），由可选输入 `htmlObserved` 驱动；[发布与事故处置手册](../docs/operations/release-and-incident-runbook.md#发布门禁)已把它加入所有拓扑的必需集。本模块的核验工具（`packages/examples-browser-e2e/release-verifier/`）仍只采集 worker、manifest 与带指纹资源的响应头，必需集写死为四项，所以它既不执行 `html-headers`，也不会因缺少该检查而判不通过。M7 与 P5 的验证记录都把"公开 HTML 需人工核对"列为已知限制。

2026-09-22 对 `drill` 站的只读观测：`/app/` 直接返回 200；`/app/index.html` 以 308 重定向到 `/app/`，`/app/offline.html` 以 308 重定向到 `/app/offline`（Cloudflare Pages 去掉 `.html` 扩展名的规则）；重定向响应与最终 200 响应都带 `Cache-Control: no-cache`。按计划推导的三个公开 HTML 路径中有两个不能直接取得 200。

### 已确认的前提（项目所有者，2026-09-22）

- **跟随同源重定向，判定最终响应。** HTML 路径按 ADR-0032 的采集规则，只跟随同源、同协议的重定向，取最终 200 响应的头，以计划中的原路径为键写入 `htmlObserved`。重定向链逐跳记入事实文件，但重定向响应本身的头不参与判定。worker、manifest 与带指纹资源仍然不跟随重定向，行为不变。
- **路径集合与 `verifyHtmlHeaders` 一致**：`identity.mountPath`、`install.startUrl`、启用时的 `offlineFallback.path`、预缓存中带 revision 的 `.html` 条目，去重。工具自行推导（与 `requiredHeaderPaths` 的做法相同），并由测试钉住与 `build-verifier` 实际检查的路径集合相同。
- **必需集**：独立源与共享源根应用改为 `artifacts`、`response-headers`、`identity-baseline`、`release-retention`、`html-headers`；共享源子应用仍然拒绝。
- 上线后与上线前两种模式共用同一套采集；不改 `build-verifier`、部署脚本、`_headers` 或任何 Cloudflare 配置，不做任何写操作。

### 不变的部分

- 现有三类资源的响应头采集（不跟随重定向）、线上字节比对、可用性检查、历史组装与保留检查的全部行为。
- 事实文件已有字段的名称与含义；报告、覆盖与结论的文件格式。
- 历史文件格式、`--pre-deploy` 参数与 `_headers` 规则检查。

### 契约增量

**采集（只读网络）**

- 新增 HTML 路径推导，并对每个路径以现有的 `fetchFollowingRedirects` 发起 GET：只跟随同源、同协议的重定向，跳数上限与超时沿用现有值，响应体只做哈希、不保存。
- 最终响应为 HTTP 200 时，其响应头以原路径为键记入 `htmlObserved`；跨源或换协议的重定向、缺少 `Location`、跳数超限、最终状态非 200、超时或网络错误，都把该路径记为未采集，并写明原因，交由 `html-headers` 报告 `verify.header-unreadable`，不以其他路径的响应顶替。

**组装与结论**

- `verifyRelease` 的输入总是带 `htmlObserved` 属性（即使为空对象），与 `observed` 相同：取不到的事实如实传入，由检查报诊断，不省略属性。上线后与上线前两个组装变体都如此。
- 必需集按上述前提改为五项；结论仍由 `report.ok`、覆盖结果与历史完整三者合取。

**事实文件与记录片段**

- `facts.json` 新增 `htmlObservedHeaders`（路径 → 最终响应头）与 `htmlHeaderObservations`（路径 → 最终地址、重定向链；未采集时为原因、状态码与 `Location`）。已有字段不变。
- 上线前模式下，`previewRobotsTag` 同时记录 HTML 路径最终响应上的 `X-Robots-Tag`，仍不参与判断。
- 记录片段中的必需集与已执行检查随报告列出 `html-headers`。

### 本修订不做的事

- 不判定重定向响应本身的响应头；不检查私有 HTML。
- 不改 `build-verifier`、部署脚本与 `_headers`；不上传、不部署、不清理预览部署。
- 不改变保留检查因历史缺计划而不执行的现状：结论仍会因 `release-retention` 未执行而不通过。

### 交付物增量

- `release-verifier/` 中的 HTML 路径推导与采集、两个组装变体的 `htmlObserved`、必需集、事实文件字段，以及对应测试。
- [Cloudflare 测试站手册](../docs/operations/cloudflare-test-deployment.md)的"已知限制"改为说明 HTML 已纳入机器检查；[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 5 项的"响应头"一行更新状态；本模块验证记录。

### 测试策略增量

- **单元测试**：HTML 路径推导覆盖入口、启动地址、离线页（启用与停用）、带 revision 的 `.html` 预缓存条目与不带 revision 的 `.html`（不纳入），以及去重；把推导结果钉在 `verifyHtmlHeaders` 对空观测报告的路径集合上，两者必须相同。必需集为五项，子应用仍拒绝。两个组装变体都传入 `htmlObserved`（观测为空时也传）。
- **集成测试**（本地 fixture 服务器）：同源 308 重定向到 `no-cache` 的 200 时 `html-headers` 通过，重定向链记入事实；最终响应缺 `no-cache` 或带 `immutable` 时判不通过；跨源重定向与 404 记为未采集并报 `verify.header-unreadable`；上线前模式下 HTML 路径的 `X-Robots-Tag` 被记录且不影响结论。既有集成测试全部保持通过（fixture 需要为 HTML 路径提供响应）。
- **真实运行**（只读）：与 M7、P5 相同，在 worktree 以 `--release=v2` 重建两站候选并确认与主目录暂存回执逐字节一致，历史发布包与保留归档从主目录只读复制。经项目所有者同意，以本机凭据运行 `--export-history`（只发 GET）取得最新生产历史。然后对两站各跑一次上线后核验（生产 `main`），以及对 P5 留下的 `candidate` 预览部署（React `70a40c96-…`、Vue `e51571e7-…`）各跑一次上线前核验，不做新的上传。预期 `html-headers` 执行且通过，覆盖结果只缺 `release-retention`，结论仍为 `pass: false`；如实记入验证记录。

### 验收标准增量

- 两站上线后与上线前核验的报告中都有 `html-headers` 检查，且无诊断；事实文件列出三个 HTML 路径的最终响应头与重定向链。
- 覆盖结果中的必需集为五项，缺失的只有 `release-retention`（历史缺计划，原因不变）。
- 现有三类资源的采集与既有测试结果不变。

## 增补：站点文件白名单的登记（2026-09-24）

构建、打包、部署与恢复四个脚本只接受已知的站点文件，其余文件一律报错。白名单随示例的接入扩展：

- `app/icons/(192|512)(-maskable)?.png`：安装图标，四个脚本都是**允许但不强制**。
- `app/pwa-entry.html`、`app/entry-manifest.json`（页面的指纹脚本归 `app/assets/` 规则）：示例接入入口恢复（[examples-browser-e2e](examples-browser-e2e.md) 2026-09-23 修订）。**构建脚本要求必须存在**，示例漏接插件时在构建处失败；打包、部署与恢复脚本只允许不强制，接入之前构建的制品仍可部署与恢复。此前只记在脚本注释中，本增补补登。
- `app/screenshots/(wide|narrow).png`：manifest 截图（examples-browser-e2e 2026-09-24 修订），四个脚本都是**允许但不强制**。

以上文件使用 Cloudflare 的默认响应头，不写入 `_headers`。白名单之外的新文件仍然报错。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| architecture | follow | 不更改平台运行时分层。 |
| capability-map | update | 增加测试部署模块和依赖。 |
| decisions | create | 记录宿主隔离和云端资源类型选择。 |
| examples-browser-e2e | follow | 复用既有示例与浏览器场景，部署证据另存。 |
| identity-release-baseline | follow | 遵守原有不可变身份和槽位规则。 |
| local-ci-record | follow | 不改变该基线的权威文档或验收结论。 |
| release-and-incident | follow | 保持正式发布门禁和资产保留要求。 |
| browser-matrix | follow | PC 优先仅是当前试点执行顺序，不降低 V1 必测范围。 |
| ssr-adapters | follow | Nuxt Cloudflare 兼容性另做门禁，不改变包的公开承诺。 |
| product-direction | follow | 本模块不改变该事实源或既有验收结论。 |
| developer-entry | follow | 本模块不改变该事实源或既有验收结论。 |
| lifecycle-and-recovery | follow | 本模块不改变该事实源或既有验收结论。 |
| ci-baseline | follow | 本模块不改变该事实源或既有验收结论。 |
| supply-chain | follow | 本模块不改变该事实源或既有验收结论。 |
| v1-acceptance | follow | 本模块不改变该事实源或既有验收结论。 |
| recovery-drill | follow | 本模块不改变该事实源或既有验收结论。 |
| browser-release-evidence | follow | 本模块不改变该事实源或既有验收结论。 |
| package-distribution | follow | 本模块不改变该事实源或既有验收结论。 |
| browser-test-harness | follow | 本模块不改变该事实源或既有验收结论。 |
| workbox-engine | follow | 本模块不改变该事实源或既有验收结论。 |
| sw-runtime | follow | 本模块不改变该事实源或既有验收结论。 |
| offline-write-extension | follow | 本模块不改变该事实源或既有验收结论。 |
| build-verifier | follow | 本模块不改变该事实源或既有验收结论。 |
| release-gate-contract | follow | 本模块不改变该事实源或既有验收结论。 |
| release-orchestration-protocol | follow | 本模块不改变该事实源或既有验收结论。 |
| vite-adapter | follow | 本模块不改变该事实源或既有验收结论。 |
| client-runtime | follow | 本模块不改变该事实源或既有验收结论。 |
| vue-react-adapters | follow | 本模块不改变该事实源或既有验收结论。 |
| pwa-entry-resilience | follow | 本模块不改变该事实源或既有验收结论。 |
| shared-origin-topology | follow | 本模块不改变该事实源或既有验收结论。 |
| push-module | follow | 本模块不改变该事实源或既有验收结论。 |
| cloudflare-test-deployment | create | 新增目标登记、操作手册与验证记录。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
