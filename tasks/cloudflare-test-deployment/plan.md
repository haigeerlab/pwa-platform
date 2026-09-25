# 实现计划：cloudflare-test-deployment

## 阶段与目标

本计划依据[模块规格](../../spec/cloudflare-test-deployment.md)与[ADR-0029](../../docs/adr/0029-cloudflare-host-demo-isolation.md)。先完成目标登记和本地可核验构建，再逐个上线 React、Vue；Nuxt 先做 Workers 可行性验证。规划文档已形成；T1–T4 已完成本地隔离构建与 React/Vue 首次上线，T5 预览更新／恢复演练、私有 R2 四槽基础归档及十七个部署 ID 索引已通过；React/Vue main 均完成 v2→v1→v2 原生回滚，两站 main 后续部署均实测上传后自动索引／资产归档／保留审计，React drill 也实测自动索引／归档；完整七日存活证据和独立机器事故恢复仍未完成；T6 Nuxt Workers 可行性门禁已执行，启动失败，未部署。T7 手册、基线、验证记录与 Spec Guard 只读核验已收口；模块文档交付仍为 `pending`。

依赖顺序：T1 → T2 → T3 → T4 → T5；T2 → T6；T5、T6 → T7。每个宿主独立项目，PC/H5 同站不同测试证据。现有 `pwa-t15-mobile-smoke` 不迁移、不删除。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| capability-map | `spec/CAPABILITY-MAP.md` | 登记测试部署模块与依赖。 |
| decisions | `docs/adr/0029-cloudflare-host-demo-isolation.md` | 固定宿主隔离决策。 |
| cloudflare-test-deployment | `docs/operations/cloudflare-test-deployment.md` | 后续交付目标登记、部署操作和验证记录。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 模块行、依赖和构建顺序已写入。 |
| decisions | delivered | `docs/adr/0029-cloudflare-host-demo-isolation.md` | 部署拓扑已记录。 |
| cloudflare-test-deployment | pending | `docs/operations/cloudflare-test-deployment.md` | 两站主站与预览槽位的桌面更新／恢复证据见 `tasks/cloudflare-test-deployment/verification.md`；私有 R2 四槽基础归档及十七个部署 ID 索引已验证；两站 Pages 原生生产回滚／恢复、main 自动后置索引／归档与滚动保留审计、React drill 自动索引／归档已实测；两站桌面 Chrome 原生安装、Vue 已安装窗口离线重载、唯一显示名更新和冷启动通过；独立机器事故恢复和完整七日时间跨度证据仍缺。 |

## T1：确定目标登记和命名

**内容：** 在 `docs/operations/cloudflare-test-deployment.md` 建立 React、Vue、既有冒烟站及 Nuxt 候选的映射；拟名分别为 `pwa-platform-react-demo`、`pwa-platform-vue-demo`、`pwa-platform-nuxt-ssr`，实际可用性以创建前的账户检查为准。每项写明资源类型、源码、构建命令、staging 根、origin、`/app/` 或 SSR mount、分支、槽位、身份基线和回滚负责人。

**验收：** 一个项目名只指向一个宿主；`main` 与安装型预览使用不同身份；项目创建前核对账号、名称可用性及实际 URL 的步骤写清；没有 PC/H5 重复项目。

**验证：** 人工逐项对照现有示例与部署脚本；文档链接检查。

**范围：** 文档 1–2 个文件；依赖：无。

## T2：隔离构建与上传前校验

**内容：** 将脚本改为显式目标选择，建立 `build/cloudflare/<host>/<slot>/site/` 临时 staging；每次从新构建的工作区包与示例源码生成产物，校验 `/app/` 路径、身份 origin、manifest、worker、离线页、`_headers`、资产清单和上传文件白名单。保留现有冒烟命令作为兼容入口。构建、校验和部署动作分离，默认先只生成本地产物。

**验收：** 未登记目标、实际 URL 与身份不符、缺失旧资产归档、错误 staging 根或混入源码／密钥时部署命令失败；只读 dry-run 显示将上传的项目与目录而不输出凭据；同一次构建的产物可追溯。

**验证：** 本地正反例构建与 tar/文件清单检查；脚本聚焦测试；`git diff --check`。

**范围：** 脚本、package script、聚焦测试 3–5 个文件；依赖：T1。

### 检查点 A

确认 React/Vue 的候选项目名及实际分配 URL 后，才冻结各自测试身份和创建云端资源。若 Pages 名称被占用，先更新登记表，不让 Cloudflare 自动后缀悄然变成身份迁移。

## T3：React 独立 Pages 站

**内容：** 以实际 origin 构建 React 的独立身份和预缓存产物，部署至专属 Direct Upload 项目的 `main`，保存部署 ID。与既有 `pwa-t15-mobile-smoke` 的测试身份、站点和历史部署并存。

**验收：** `/app/`、manifest、worker、离线页、带指纹资源均在 React 项目响应；线上 manifest 与计划身份一致；静态响应头和 HTML 跳转目标符合规格；没有 Vue 文件。

**验证：** 线上 `curl`/浏览器请求清单、桌面 Chrome 在线与离线冒烟、部署记录。

**范围：** React 构建配置／目标登记／发布记录 2–4 个文件；依赖：T2 与实际项目名确认。

## T4：Vue 独立 Pages 站

**内容：** 复用已验证的目标选择和 staging 约定，为 Vue 生成独立身份并部署专属项目。

**验收：** 与 T3 相同的路径、身份和响应头验证；React 与 Vue 的 origin、`appId`、缓存前缀和部署 ID 互不相同；共享的本地 E2E 对照配置不被破坏。

**验证：** 线上请求清单、桌面 Chrome 在线与离线冒烟、两个项目资产清单对比。

**范围：** Vue 构建配置／登记／记录 2–4 个文件；依赖：T3。

### 检查点 B

React、Vue 两站分别运行桌面 Chrome N/N-1 的现有场景，并在本期 PC 优先范围补充真实安装确认、独立窗口 origin 和离线重载。若某站失败，停止该站后续版本，先修复身份、构建或响应头。

## T5：发布保留与恢复演练

**内容：** 在隔离的预览身份或专用演练槽位验证 v1→v2 更新提示、恢复 worker、再次正常发布和离线启动；再验证 Pages 部署回滚。每次部署把仍需保留的指纹资源放入新上传并核验线上可访问。

**验收：** 两类恢复路径分别记录部署 ID、旧资产可访问性、worker 接管和缓存清理结果；任何缺失都不写成通过；演练不会改变既有冒烟站的身份。

**验证：** 桌面真实浏览器、线上资产请求、发布记录与浏览器证据模板。

**范围：** 演练脚本／记录／手册 2–4 个文件；依赖：T4。

### T5 当前证据与剩余顺序

1. 私有 R2 Standard 桶、单桶最小权限凭据和四槽基础制品均已上传并读回；截至 2026-09-22，十七个实际部署 ID 有客户端条件写入保护的制品索引。React main 已验证移走本地副本后从 R2 重建。
2. React/Vue `main` 的 v2 候选均在 Pages 上传前通过当前部署索引和候选 R2 制品预检；上传后分别记录完整部署 ID、线上文件 SHA-256 与索引，并归档 v1/v2 指纹资源。两站均已完成原生 v2→v1→v2 回滚；每次切换都核对页面版本、目标线上文件以及新旧指纹资源。`canonical_deployment` 才是当前生产部署依据，按创建时间排序的列表第一条在回滚后仍是新版本。
3. `main` 的上传后自动 R2 索引、本地资产归档和保留审计已由 React/Vue 部署实测；React `drill` 的上传前预检与上传后自动索引、归档已实测，按规格不做保留审计。缺失对象 404 与损坏本地副本拒绝反例已通过。后置步骤失败时保留现场并按已归档的目标部署恢复；独立机器下载和事故恢复仍待演练。滚动七天选择已自动核验，完整七日存活证据须待自然时间经过后重跑。
4. 稳定测试站可按当前门禁继续受控迭代；正式 V1 仍受移动端以及其他全局发布门禁约束。主站 v2 已在桌面 Chrome Offline 预设下经受控更新后重载；唯一查询导航由 Service Worker 返回，Vue 的网络失败明确回退到静态离线页，React 返回缓存应用壳；两站桌面原生安装 identity 和独立窗口已现场核验，Vue 安装窗口离线重载通过。Cloudflare 构建的 React/Vue 唯一显示名已部署，既有安装接受名称更新后的冷启动通过。

## T6：Nuxt Workers 可行性门禁

**内容：** 在本地和短期隔离环境验证现有 Nuxt fixture 与 Cloudflare Workers/Nitro 的兼容性；核对请求时 SSR、静态资源、`/app/` 路由、worker 注册、离线页、动态 HTML 缓存头和恢复路径。需要新的 Worker 凭据时按最小权限单独配置。

**验收：** 有可重复的构建命令和逐项现场证据后才登记正式 Worker 项目；失败时记录具体阻塞，不宣称 Nuxt 已部署或已可发布。Next/Start 不由本任务代建。

**验证：** Cloudflare 官方配置对照、本地构建、真实 HTTPS 桌面 Chrome 场景与响应头检查。

**范围：** spike 配置与记录 2–4 个文件；依赖：T2。

## T7：手册、基线与审查收口

**内容：** 补齐目标登记、Direct Upload 和 Workers 差异、凭据注入、构建归档、发布与回滚命令、证据目录；更新文档基线并留下验证记录。明确 PC 试点完成与正式 V1 发布门禁的区别。

**验收：** 新维护者能按登记表选择一个宿主、只上传其 staging 根、找到部署 ID 与回滚路径；Android、移动端原生安装、GitHub CI 缺口如实列出；Spec Guard 文档与产物只读校验通过。

**验证：** 手册逐步复现、相对链接检查、`git diff --check`、Spec Guard 只读检查。

**范围：** 手册、基线、验证记录 2–3 个文件；依赖：T5、T6（若 Nuxt 未通过则记录阻塞并保留候选状态）。

## 风险与处理

| 风险 | 处理 |
|---|---|
| Direct Upload 不能原地转换为 Git 集成 | 明确该限制；将来需 Git 集成时新建项目并按身份迁移流程处理。 |
| Pages 旧部署资产不保证一直可访问 | 每次新上传打包保留窗口中的旧指纹资源，现场核验；缺归档即停止稳定槽位发布。 |
| 分支预览 origin 与 `main` 不同 | 安装型预览单独构建身份和基线；普通内容预览关闭 PWA 注册。 |
| Nuxt 现有 Node/Nitro 证据不等于 Workers 证据 | 独立可行性门禁，未通过不创建正式项目。 |
| 桌面测试被误解为正式 V1 验收 | 记录 Android、移动端原生安装和远端 CI 的未取得状态，不改浏览器矩阵。 |

## 规划阶段完成条件

模块 spec、ADR、计划和 todo 可供审阅，且无云端写入。实施阶段按 T1 开始，项目创建与身份冻结须以具体目标登记和账户事实复核。

## 修订：线上发布事实采集与机器发布门禁

规格见[模块规格](../../spec/cloudflare-test-deployment.md)的同名修订。分支 `claude/cloudflare-release-verifier`，基于 `main` 的 `11c6f22`。每个任务一个提交，提交信息带 `Task: M<n>`。

### 架构决定

- **计划从实际构建取出。** 在两个示例的 Vite 配置里加一个共用的小插件，只在 `PWA_PLATFORM_CF_PLAN_OUT` 设置时生效：在 `writeBundle` 中通过 `PWA_PLUGIN_NAME` 找到平台插件，读取 `PwaPluginApi` 的计划，写到这个路径。路径由 `build-cloudflare-site.mjs` 指定在上传目录之外，构建结束后合并进 `build.json`。沿用现有 `PWA_PLATFORM_CF_*` 环境变量的传参方式。
- **代码位置。** 采集与判定代码放在 `packages/examples-browser-e2e/release-verifier/`，单元测试与集成测试放在同目录的 `test/` 下，并把 vitest 的 `include` 扩展到该目录。
- **运行方式。** 入口按现有脚本的做法：先编译 `examples-browser-e2e` 的依赖，再在包内运行。TypeScript 入口优先用 Node 自带的类型剥离运行，不新增依赖；M4 先在 Node 22 与 24 上验证，不可用则改为 `.mjs` 加 JSDoc 类型。
- **执行分工。** M2–M6 的实现派给 `executor` 子代理，主会话在任务边界验收；M1、M7 与所有涉及线上或凭据的步骤留在主会话。

#### M1：规格修订与本计划

**验收：** 规格修订节与本节、todo 一次提交；项目所有者确认后才开始 M2。

#### M2：构建时保存计划

**范围：** 共用插件；两个示例的 Vite 配置接入；`build-cloudflare-site.mjs` 传入输出路径、合并计划、以 `validatePlan` 校验、逐字段比对身份，失败即构建失败。

**验收：**
- 插件在未设置环境变量时不做任何事（本地 E2E 构建不受影响）。
- `build.json` 的 `plan` 通过 `validatePlan`，身份与 `identity` 逐字段一致。
- 计划文件不出现在 `site/` 上传目录中。

**验证：** 插件单元测试（未设置环境变量、平台插件缺失、计划为 `null` 三种情况）；本地对 `react` 与 `vue` 的 `main` 各构建一次（不上传），检查 `build.json` 与上传目录；`pnpm --filter @pwa-platform/examples-browser-e2e test`、`typecheck`；既有 `test:browser` 不回退。

**范围估计：** 中，约 5 个文件。依赖：M1。

#### M3：发布包携带计划

**范围：** `package-cloudflare-site.mjs` 的可移植回执保留 `plan`；解包自检同时比对计划。

**验收：** 新打的发布包解包后能取回与 `build.json` 一致的计划；旧发布包（无计划）仍可解包，读取方据此判为缺计划。

**验证：** 对 M2 的本地构建各打一次包并解包比对；`git diff --check`。

**范围估计：** 小，1–2 个文件。依赖：M2。

### 检查点 A（M2–M3 之后）

- 两站本地构建记录都含经校验的计划，发布包能取回计划；全部既有测试通过。
- 与项目所有者确认后继续。

#### M4：组装与结论（纯函数，TDD）

**范围：** 按拓扑选 `requiredChecks`；由候选、基线、历史组装 `verifyRelease` 输入；判定三个结论分量；输出目录位置校验。先确认运行方式（见架构决定）。

**验收：**
- 基线存在或不存在时，`baseline` 属性都被传入。
- 历史完整时 `previous` 按时间从新到旧；**任一部署缺计划时判失败，且不会以空历史或截短历史调用保留检查**。
- `report.ok`、覆盖结果、历史完整性三者任一为假即不通过，且三者分别输出。
- 输出目录位于仓库或其任何 worktree 内时拒绝。

**验证：** 单元测试覆盖规格"测试策略增量"列出的全部情况，先写测试再实现；`test`、`typecheck`、`pnpm lint`。

**范围估计：** 中，3–4 个文件。依赖：M1（与 M2、M3 无代码依赖，可并行）。

#### M5：采集、输出与入口

**范围：** 读取候选 `build.json` 与基线文件；读取历史文件并按摘要从本地发布包取回计划；对登记的生产 origin 逐个请求并核对线上字节与候选哈希；写出 `facts.json`、`report.json`、`coverage.json` 与记录片段并打印哈希；根目录 `verify:cloudflare:release` 脚本。

**验收：**
- 线上字节与候选不一致时拒绝出报告。
- 事实文件不含响应体与任何令牌；输出目录已存在即拒绝。
- 通过以 0 退出，否则非 0。

**验证：** 集成测试用本地 fixture 服务器与临时发布包目录，覆盖：全部通过、响应头缺 `no-cache`、一个保留资源 404、一个保留资源内容被篡改、历史缺计划、线上与候选不一致；连续运行两次结果一致。

**范围估计：** 中，约 5 个文件。依赖：M4；读取发布包依赖 M3 的格式。

#### M6：带凭据一侧导出历史

**范围：** 在 `audit-cloudflare-retention.mjs` 中增加导出选项：成功生产部署列表（部署 ID、时间）加上 R2 部署索引中的发布包摘要，写到调用方指定的仓库外文件。

**验收：** 导出只用该脚本已有的只读请求，不新增写操作；文件不含令牌；索引中查不到的部署摘要写空。

**验证：** 单元测试覆盖导出格式与"查不到写空"；真实导出由项目所有者或在其同意下运行，文件存档并记录哈希。

**范围估计：** 小，1–2 个文件。依赖：M1。**涉及凭据，真实运行前需项目所有者同意。**

### 检查点 B（M4–M6 之后）

- fixture 上的全部集成场景通过；导出格式与工具读取格式一致。
- 与项目所有者确认真实运行的方式后继续。

#### M7：真实运行与收口

**范围：** 取得一个带计划、且与线上字节一致的候选；对 React、Vue 的 `main` 各跑一次上线后核验；结果写入本模块验证记录；更新目标登记手册的命令说明、[桌面发布演练清单](../platform-governance/desktop-release-rehearsal.md)第 3 项与 todo。

**候选的取得方式（按顺序尝试）：**
1. 在当前线上版本的构建提交上重新构建，由工具的线上字节比对确认与线上一致。
2. 若构建不可逐字节复现，则需要一次新的 `main` 部署；这会改动线上测试站，**必须先取得项目所有者同意**。

**验收：** 两站各产出一套报告；按规格预期，在历史补齐前因"历史缺计划"判失败，报告列出缺计划的部署 ID；这一结论如实记入验证记录。

**验证：** 报告文件哈希与终端输出一致；相对链接检查；`git diff --check`；Spec Guard 只读核验。

**范围估计：** 小到中，文档 3–4 个文件。依赖：M5、M6。

### Task List（修订）

- M1 规格修订与本计划
- M2 构建时保存计划（blocked by M1 与确认）
- M3 发布包携带计划（blocked by M2）
- 检查点 A
- M4 组装与结论（blocked by M1；可与 M2、M3 并行）
- M5 采集、输出与入口（blocked by M4、M3）
- M6 带凭据一侧导出历史（blocked by M1）
- 检查点 B
- M7 真实运行与收口（blocked by M5、M6）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| Node 22 的类型剥离不可用或行为不同 | 中：入口在 CI 的 Node 22 上跑不起来 | M4 开始前先在 Node 22 与 24 验证；不可用即改为 `.mjs` 加 JSDoc |
| 插件改动影响本地 E2E 构建 | 高：既有浏览器测试回退 | 插件只在环境变量设置时生效；M2 验证包含 `test:browser` 不回退 |
| 构建不可逐字节复现 | 中：M7 需要一次新的线上部署 | 先尝试重建；不行再请项目所有者批准新部署 |
| 历史导出依赖凭据 | 中：导出不完整会让判定失真 | 导出与报告一起存档并记录哈希；查不到的摘要写空，由工具判缺计划 |
| 工具在历史不全时误判通过 | 高：门禁失真 | 单元测试钉住"不以空历史或截短历史调用保留检查"；M7 预期结论是失败 |

### 执行顺序（修订）

M1 → 确认 → M2 → M3 → 检查点 A；M4 可在 M1 确认后与 M2、M3 并行；M4 → M5；M6 在 M1 确认后任意时间；M5、M6 → 检查点 B → M7。

### 后续事项（M 系列完成后开始，项目所有者 2026-09-22 决定）

**业务项目的发布门禁接入。** 归 `vite-adapter`，需先写规格，涉及公开接口时补 ADR；不在本修订内实现。

- **起因：** 业务项目常见的做法是全量构建、整体替换部署，上一版带指纹的资源随之消失，仍运行旧版本的页面按需加载时会 404。`@pwa-platform/vite` 目前只输出 manifest、平台 worker 与恢复 worker，不输出计划；计划只能在构建过程中经 `PwaPluginApi` 读取（本修订 M2 就是为测试站这样做的）。业务发布系统因此无法保存每次发布的计划，也就无法执行 `release-retention`。
- **方向：**
  1. `@pwa-platform/vite` 正式提供把计划输出为构建产物的选项，写在上传目录之外。
  2. 编写业务发布系统接入指南：保存每次发布的计划与发布时间；保留旧的带指纹资源（只增不删并定期清理超出窗口的资源，或部署前合并上一版资源）；调用 `verifyRelease` 与 `verifyReleaseGateCoverage` 作为门禁。

## 修订：上线前核验

规格见[模块规格](../../spec/cloudflare-test-deployment.md)的同名修订。分支 `claude/predeploy-verification`，基于 `main` 的 `5125312`。每个任务一个提交，提交信息带 `Task: P<n>`。

### 架构决定

- **纯函数层增加上线前变体，不改上线后变体。** 在 `release-verifier/` 新增上线前的历史组装（全部生产部署都是之前的版本），与现有 `assembleReleaseInput` 共用同一套"历史不可排序或缺计划即不完整、不调用保留检查"的规则；现有函数与测试不改。
- **观测地址只由部署 ID 推算。** 纯函数 `uniqueDeploymentOrigin(project, deploymentId)`：合法 UUID 得到 `https://<前 8 位>.<项目>.pages.dev`，其他输入拒绝；命令行只接受部署 ID，不接受地址。
- **`_headers` 规则检查是纯函数。** 读取候选暂存目录中的 `_headers`，只允许以 `/` 开头的路径规则。
- **部署脚本的新模式与既有模式隔离。** `preview-candidate` 是一个独立分支：复用既有的暂存校验，但不进入 `main` 的重复发布预检、R2 与保留审计流程；上传只以 `--branch=candidate` 进行，读回确认环境、分支与地址。
- **执行分工。** P2–P4 的实现派给 `executor` 子代理，主会话在任务边界验收并做对抗性检查；P1、P5 与所有涉及凭据或线上的步骤留在主会话。

#### P1：规格修订与本计划

**验收：** 规格修订节与本节、todo 一次提交；项目所有者确认后开始 P2。

#### P2：上线前的纯函数（TDD）

**范围：** 上线前历史组装；`uniqueDeploymentOrigin`；`_headers` 规则检查。

**验收：**
- 上线前组装把历史中的全部成功生产部署作为之前的版本，按时间从新到旧；任一部署缺计划、时间戳不可排序或 ID 重复时判不完整，输入中没有 `retention` 属性。
- `uniqueDeploymentOrigin` 对合法 UUID 给出唯一地址，对大写、缺段、带路径或其他字符的输入拒绝。
- `_headers` 只有路径规则时通过；出现 `https://`、`http://` 或 `:project` 等主机规则时拒绝，并指出行号。
- 上线后变体的全部既有测试保持通过。

**验证：** 先写测试；包内 `test`、`typecheck`；`pnpm lint`。

**范围估计：** 中，3–4 个文件。依赖：P1。

#### P3：`--pre-deploy` 模式的采集与入口

**范围：** 命令行参数 `--pre-deploy=<部署 ID>`；运行时按模式选择观测地址与历史组装；读取暂存目录的 `_headers` 做规则检查；事实文件记录 `mode: "pre-deploy"`、预览部署 ID、观测地址与观测到的 `X-Robots-Tag`；记录片段注明"上线前核验：观测对象为预览部署"。

**验收：**
- 不带 `--pre-deploy` 时行为与上一修订完全相同（既有集成测试全部通过）。
- 预览字节与候选不一致、`_headers` 含主机规则、部署 ID 不合法时拒绝，不写报告。
- `X-Robots-Tag` 存在时不影响结论，并记入事实文件。

**验证：** 集成测试（本地 fixture 服务器模拟预览部署）覆盖：全部通过且保留检查被执行；字节不一致拒绝；`_headers` 主机规则拒绝；`X-Robots-Tag` 记录；缺计划时保留检查不执行。连续运行两次结果一致。

**范围估计：** 中，约 5 个文件。依赖：P2。

### 检查点 A（P2–P3 之后）

- fixture 上的上线前场景全部通过；上线后的既有测试全部通过。
- 与项目所有者确认后继续。

#### P4：部署脚本的 `preview-candidate` 模式

**范围：** `deploy-cloudflare-site.mjs --mode=preview-candidate`：只接受 `--slot=main`；复用暂存校验；以 `--branch=candidate` 上传；以 Pages API 读回这次部署，确认环境为 `preview`、分支为 `candidate`、返回地址等于 `uniqueDeploymentOrigin` 推算的地址；输出部署 ID、唯一地址与暂存回执 SHA-256。

**验收：**
- 非 `main` 槽位在读取凭据之前即被拒绝。
- 该模式的代码路径中不存在以生产分支上传的调用；不写 R2 索引、不打发布包、不改基线。
- 不带该模式时，脚本行为不变。

**验证：** 无凭据可做的检查：参数拒绝（用非空的无效凭据运行，保证回退时既不读钥匙串也不联网）；静态检查该模式分支只出现 `--branch=candidate`。上传与读回在 P5 真实运行时核对。`pnpm lint`、`git diff --check`。

**范围估计：** 小到中，1–2 个文件。依赖：P2（地址推算）。

### 检查点 B（P4 之后）

- 与项目所有者确认真实运行：两站各上传一次到 `candidate`（Cloudflare 写操作，只写预览环境）。

#### P5：真实运行与收口

**范围：** 经项目所有者同意，两站各构建候选、以 `preview-candidate` 上传、导出生产历史、运行 `--pre-deploy` 核验；结果写入验证记录；更新 Cloudflare 测试站手册与桌面发布演练清单第 3 项。不上传到 `main`。

**验收：** 两站各有一次 `candidate` 预览部署并记录部署 ID、环境与分支，读回地址与推算地址一致；各产出一套 `mode: "pre-deploy"` 的报告。按目前历史仍缺计划，预期保留检查未执行、结论未通过，如实记录。预览地址上不做任何浏览器或安装验收。

**验证：** 报告文件哈希与终端输出一致；相对链接检查；`git diff --check`；Spec Guard 只读核验。

**范围估计：** 小到中，文档 3–4 个文件。依赖：P3、P4。

### Task List（修订）

- P1 规格修订与本计划
- P2 上线前的纯函数（blocked by P1 与确认）
- P3 `--pre-deploy` 模式的采集与入口（blocked by P2）
- 检查点 A
- P4 部署脚本的 `preview-candidate` 模式（blocked by P2）
- 检查点 B
- P5 真实运行与收口（blocked by P3、P4 与项目所有者同意）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 唯一地址规律对预览部署不成立 | 高：工具观测错误的地址 | P4 读回时比对 API 返回地址与推算地址，不一致即报错 |
| 预览环境的响应头与生产不同 | 高：上线前结论不能代表生产 | `_headers` 只允许路径规则；预览额外的 `X-Robots-Tag` 单独记录；上线后核验再比对一次 |
| `preview-candidate` 误上传到生产 | 高：改动线上测试站 | 该模式只接受 `main` 槽位并固定 `--branch=candidate`；读回确认环境为 `preview`；静态检查钉住 |
| 预览部署上的 `main` 身份被当作安装证据 | 中：违反契约第 4 条的例外边界 | 规格明确禁止；验证记录注明未做浏览器与安装验收 |
| 上线前与上线后变体逻辑分叉 | 中：两种模式对历史的判断不一致 | 两个变体共用同一套不可排序与缺计划规则，各自有测试 |

### 执行顺序（修订）

P1 → 确认 → P2 → P3 → 检查点 A；P4 在 P2 之后，可排在 P3 之后顺序执行（同一 worktree，避免并行提交）→ 检查点 B → P5。

## 修订：`drill` 上传前预检与上传后自动步骤

规格见[模块规格](../../spec/cloudflare-test-deployment.md)的同名修订。分支 `claude/drill-post-steps`，基于 `main` 的 `d18baf0`。每个任务一个提交，提交信息带 `Task: DR<n>`。

### 架构决定

- **只改 `drill` 路径。** 在部署脚本中以 `slot === "drill"` 且存在基线文件为条件，增加预检与后置步骤；与 `main` 的对应代码并列，不合并、不改动 `main` 的分支。
- **复用既有脚本。** 预检调用 `r2:cloudflare:bundle --mode=verify`，后置步骤调用 `r2:cloudflare:index --mode=record` 与 `archive:cloudflare:site`；不在部署脚本中重写它们的逻辑。
- **识别新部署沿用 `preview-candidate` 的做法**：上传前后各列一次 `drill` 分支的预览部署，新增集合必须恰好一个。
- **执行分工。** DR2 的实现派给 `executor` 子代理，主会话验收并做对抗性检查；DR1 与 DR3（真实运行）留在主会话。

#### DR1：规格修订与本计划

**验收：** 规格修订节与本节、todo 一次提交；项目所有者确认后开始 DR2。

#### DR2：`drill` 预检与后置步骤

**范围：** 参数层对 `--artifact-sha256` 的校验（在读取凭据之前）；读取凭据后解开本地发布包比对回执、运行 R2 制品校验；上传前后比较部署列表取得新 ID；依次写 R2 索引与归档；失败时报错写明部署 ID 与失败步骤；成功时输出一行 JSON。

**验收：**
- `drill` 有基线时，`preflight`／`deploy` 缺少或传入格式错误的 `--artifact-sha256`，在读取凭据之前拒绝；无基线的首次引导与 `check` 模式不受影响。
- 后置步骤只调用 `r2:cloudflare:index`（`record`）与 `archive:cloudflare:site`，不调用保留审计。
- `main`、`preview-candidate` 与 `check` 的既有行为不变，既有安全测试全部通过。

**验证：** 安全测试以空临时根目录运行脚本副本，用非空的假凭据，确认参数层拒绝发生在读取文件与凭据之前；静态检查 `drill` 后置步骤调用的命令集合与 `main` 路径未变；包内 `test`、`pnpm lint`、`git diff --check`。

**范围估计：** 小到中，2 个文件。依赖：DR1。

### 检查点（DR2 之后）

- 与项目所有者确认真实运行：对一个站点的 `drill` 做一次"打包 → 上传 R2 制品 → 部署"，其中上传 R2 制品与 Pages 部署是写操作，只写 R2 与 `drill` 预览环境。

#### DR3：真实运行与收口

**范围：** 经项目所有者同意，对 React 的 `drill`：构建 v2 → 打包 → 上传 R2 制品 → `--mode=deploy --artifact-sha256=<摘要>`；确认新部署 ID 被自动识别，`r2:cloudflare:index --mode=check` 读回一致，本地归档包含该部署的带指纹资源。更新 Cloudflare 测试站手册"隔离预览槽位的重复部署与恢复"一节、验证记录与 todo 的 T5。

**验收：** 上述三项核对通过；部署结束后 `drill` 为正常 v2。

**验证：** 相对链接检查；`git diff --check`；Spec Guard 只读核验。

**范围估计：** 小，文档 3 个文件。依赖：DR2 与项目所有者同意。

### Task List（修订）

- DR1 规格修订与本计划
- DR2 `drill` 预检与后置步骤（blocked by DR1 与确认）
- 检查点
- DR3 真实运行与收口（blocked by DR2 与项目所有者同意）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 预检误用于首次引导 | 中：无法再引导新的 `drill` | 以存在基线文件为生效条件，并在测试中覆盖 |
| 上传成功但后置步骤失败 | 中：`drill` 已上线却没有索引或归档 | 报错写明部署 ID 与失败步骤；按规格先处理再重新上传 |
| 部署列表更新有延迟，识别不到唯一新部署 | 低 | 报错并说明上传可能已发生，提示人工核对 |
| 改动误伤 `main` 路径 | 高 | `drill` 代码与 `main` 并列；静态检查钉住 `main` 路径不变 |

### 执行顺序（修订）

DR1 → 确认 → DR2 → 检查点 → DR3。

## 修订：从 R2 恢复运营状态

规格见[模块规格](../../spec/cloudflare-test-deployment.md)的同名修订。分支 `claude/machine-recovery`，基于 `main` 的 `b4fffda`。每个任务一个提交，提交信息带 `Task: RC<n>`。

### 架构决定

- **只串联现有脚本。** 恢复脚本依次调用保留审计的 `--export-history`、`r2:cloudflare:bundle --mode=download`、`restore:cloudflare:site --mode=restore`、`archive:cloudflare:site`、`r2:cloudflare:index --mode=check`，不重写它们的逻辑（最后一步原为 `deploy:cloudflare:site --mode=check`，2026-09-22 按规格修改）。
- **状态保护在读取凭据之前。** 暂存目录或归档已存在即拒绝，防止 `restore --mode=restore` 在运营中的目录里静默覆盖。
- **导出文件写在仓库之外**（系统临时目录），满足导出模式对输出路径的限制；用后删除。
- **执行分工。** RC2 的实现派给 `executor` 子代理，主会话验收并做对抗性检查；RC1 与 RC3（真实运行）留在主会话。

#### RC1：规格修订与本计划

**验收：** 规格修订节与本节、todo 一次提交；项目所有者确认后开始 RC2。

#### RC2：恢复脚本与安全测试

**范围：** `scripts/recover-cloudflare-site.mjs` 与根 `package.json` 的 `recover:cloudflare:site`；安全测试追加到 `packages/examples-browser-e2e/release-verifier/test/` 下。

**验收：**
- 参数只接受 `--target=react|vue`，其他参数与目标被拒绝。
- 暂存目录或归档已存在时，在读取凭据之前拒绝，并提示先移开现有状态。
- 按规格顺序串联五步，任一步失败即停止并写明失败的步骤，已恢复的文件不自动清理；成功时输出规格要求的一行 JSON。
- 脚本不含上传、部署或写索引：不出现 `--mode=deploy`、`--mode=upload`、`--mode=record`、`wrangler pages deploy`。

**验证：** 以空临时根目录运行脚本副本（非空的假凭据），验证参数拒绝与状态保护发生在读取凭据之前；静态检查只读性；包内 `test` 连续两次、`pnpm lint`、`git diff --check`。

**范围估计：** 小到中，3 个文件。依赖：RC1。

### 检查点（RC2 之后）

- 与项目所有者确认真实运行：在临时目录全新克隆仓库，读取本机凭据，只发 GET 请求，对两站各运行一次恢复。

#### RC3：隔离模拟与收口

**范围：** 经项目所有者同意：在系统临时目录 `git clone` 主仓库当前 `main`，`pnpm install --frozen-lockfile` 并构建工作区包；执行前断言克隆中没有 `build/`；对 React、Vue 各运行 `pnpm recover:cloudflare:site`；与主目录只读比对（暂存目录与构建回执逐字节一致，归档资源哈希一致，集合差异逐项说明）；删除临时克隆。更新 Cloudflare 测试站手册（新增"从 R2 恢复运营状态"一节、状态表）、验证记录与 todo 的 T5。

**验收：** 两站恢复成功并通过 R2 索引核对；克隆中构建的新候选通过 `deploy --mode=check`；比对结果符合规格；记录标注"同机隔离模拟，不等于独立机器"；全程无写操作。

**验证：** 相对链接检查；`git diff --check`；Spec Guard 只读核验。

**范围估计：** 小，文档 3 个文件。依赖：RC2 与项目所有者同意。

### Task List（修订）

- RC1 规格修订与本计划
- RC2 恢复脚本与安全测试（blocked by RC1 与确认）
- 检查点
- RC3 隔离模拟与收口（blocked by RC2 与项目所有者同意）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 在运营中的主目录误运行，覆盖暂存目录 | 高：丢失当前运营状态 | 状态已存在即拒绝，并在读取凭据前完成；安全测试钉住 |
| 当前部署没有 R2 索引 | 中：无法定位发布包 | 摘要为空即拒绝并说明；两站 `main` 当前部署均已有索引（M7 导出已确认） |
| 隔离模拟被误当成独立机器证据 | 中：高估恢复能力 | 记录与手册明确标注，状态表中"独立机器"仍保持待办 |
| 克隆中的构建产物与主目录不同，导致比对失败 | 低 | 比对对象是从 R2 恢复的文件，不依赖克隆的构建；工作区包只用于运行脚本 |

### 执行顺序（修订）

RC1 → 确认 → RC2 → 检查点 → RC3。

## 修订：核验工具采集公开 HTML 响应头

规格见[模块规格](../../spec/cloudflare-test-deployment.md)的同名修订。分支 `claude/cloudflare-html-headers`，基于 `main` 的 `8c57bed`。每个任务一个提交，提交信息带 `Task: HC<n>`。

### 架构决定

- **HTML 采集与现有采集并列，不改现有三类资源。** `observe.ts` 新增 HTML 路径推导与采集函数，改用现有的 `fetchFollowingRedirects`；`observeHeaders` 与 `fetchWithoutFollowingRedirects` 一行不动。
- **路径集合由测试对齐 `build-verifier`。** 推导函数写在工具内（`build-verifier` 未导出推导），另以 `verifyHtmlHeaders(plan, {})` 的诊断路径集合为准做对照测试，任何一侧改了规则都会报红。
- **失败原因要带状态码与 `Location`。** `fetchFollowingRedirects` 的失败结果目前只有 `reason`；若需补充状态码与 `Location`，只做向后兼容的可选字段追加，已有调用方（字节比对、可用性检查）的行为不变。
- **fixture 同步。** 集成测试的 fixture 站点要为 HTML 路径提供响应（含一个 308），否则既有"全部通过"场景会因 `html-headers` 报 `header-unreadable` 而失败；既有断言只改与必需集、报告检查列表直接相关的部分，每处在提交说明中列出。
- **执行分工。** HC2、HC3 的实现派给 `executor` 子代理，主会话验收并做对抗性检查；HC1 与 HC4（真实运行）留在主会话。

#### HC1：规格修订与本计划

**验收：** 规格修订节与本节、todo 一次提交；项目所有者确认后开始 HC2。

#### HC2：纯函数层（路径推导、必需集、组装）

**范围：** `observe.ts` 的 HTML 路径推导；`required-checks.ts` 改为五项；`assemble.ts` 上线后与上线前两个变体都接收并传入 `htmlObserved`；对应单元测试。

**验收：**
- 路径推导覆盖入口、启动地址、离线页启用与停用、带 revision 的 `.html`（纳入）与不带 revision 的 `.html`（不纳入）、去重；与 `verifyHtmlHeaders(plan, {})` 报告的路径集合相同（对照测试）。
- 独立源与根应用的必需集为五项，子应用仍拒绝。
- 两个组装变体的输入总带 `htmlObserved` 属性，观测为空时也传；其余字段与既有测试结果不变。

**验证：** 包内 `test`、`typecheck`、`pnpm lint`、`git diff --check`。

**范围估计：** 小到中，3 个源文件与对应测试。依赖：HC1。

#### HC3：采集、事实文件与集成测试

**范围：** `observe.ts` 的 HTML 采集；`run.ts` 调用采集、把结果传给组装、写入 `htmlObservedHeaders` 与 `htmlHeaderObservations`，上线前模式的 `previewRobotsTag` 纳入 HTML 路径；必要时 `fetch-utils.ts` 的失败结果追加可选字段；fixture 与集成测试。

**验收：**
- 同源 308 → 200（`no-cache`）时 `html-headers` 通过，重定向链记入事实。
- 最终响应缺 `no-cache` 或带 `immutable` 时判不通过；跨源重定向与 404 记为未采集，报告中为 `verify.header-unreadable`。
- 上线前模式下 HTML 路径的 `X-Robots-Tag` 被记录且不影响结论。
- 现有三类资源的采集结果、事实文件已有字段与既有测试（除必需集与检查列表的直接相关断言外）不变；"两次运行结果一致"测试仍通过。

**验证：** 包内 `test` 连续两次、`typecheck`、`pnpm lint`、`git diff --check`。

**范围估计：** 中，3–4 个源文件与测试。依赖：HC2。

### 检查点（HC3 之后）

- 与项目所有者确认真实运行：以本机凭据运行 `--export-history`（只发 Pages API 与 R2 的 GET）；其余步骤不用凭据、只读。

#### HC4：真实运行与收口

**范围：** 经项目所有者同意：在本 worktree 以 `--release=v2` 重建两站 `main` 候选，确认与主目录暂存回执逐字节一致；从主目录只读复制历史发布包与保留归档；导出两站最新生产历史；对两站各跑一次上线后核验与一次上线前核验（观测 P5 的 `candidate` 预览部署，不新上传）。证据写到仓库外 `pwa-release-records/`。更新验证记录、Cloudflare 测试站手册的"已知限制"、桌面发布演练清单第 5 项与 todo。

**验收：** 四份报告都含 `html-headers` 且无诊断；事实文件列出三个 HTML 路径的最终响应头与重定向链；覆盖结果只缺 `release-retention`；全程无 Cloudflare 或 R2 写操作。

**验证：** 相对链接检查；`git diff --check`；Spec Guard 只读核验与 main 对照。

**范围估计：** 小，文档 3–4 个文件。依赖：HC3 与项目所有者同意。

### Task List（修订）

- HC1 规格修订与本计划
- HC2 纯函数层（blocked by HC1 与确认）
- HC3 采集、事实文件与集成测试（blocked by HC2）
- 检查点
- HC4 真实运行与收口（blocked by HC3 与项目所有者同意）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 工具推导的路径与 `build-verifier` 实际检查的路径不一致 | 中：漏采集或多采集，报告失真 | 对照测试以 `verifyHtmlHeaders` 的诊断路径为准 |
| 跟随重定向被误用于现有三类资源 | 高：worker 经重定向的情况被当作已观测 | 现有采集函数不改；测试钉住 worker 重定向仍记为未采集 |
| fixture 调整掩盖既有行为变化 | 中 | 既有断言只改与必需集、检查列表直接相关的部分，逐处列出 |
| P5 的预览部署已被替换或内容不同 | 低：上线前核验拒绝出报告 | 工具本身做字节比对，拒绝即如实记录；不为此新上传，另行征求同意 |
| 历史发布包仍缺计划 | 已知：结论仍为 `pass: false` | 规格已把它列为预期结论，如实记录 |

### 执行顺序（修订）

HC1 → 确认 → HC2 → HC3 → 检查点 → HC4。

## 修订：免费额度优先的 T5 收口（2026-09-25）

### 发布约束

React/Vue 测试网页由 Pages Direct Upload 提供，私有 R2 Standard 桶存放发布制品与部署索引；两者按各自账户额度核算，文档站的版本分支发布节奏单独管理。`main` 与 `drill` 是 Pages 槽位，保持各自已冻结的 PWA 身份。本轮收口先使用现有部署证据，不为重复取证创建 Pages 部署或 R2 对象。

每次准备 R2 上传或 Pages 部署前，按[测试站手册的免费额度门禁](../../docs/operations/cloudflare-test-deployment.md#免费额度与云端写入)核对账户方案、当月 Pages 余量、R2 Standard 存储与 Class A/B 用量、本次产物及预计读写。任何一项无法确认仍在免费额度内，就停在本地构建与检查；预算提醒不能充当硬性费用上限。只读审计和恢复也会产生 R2 读取操作，执行前同样查看用量。仅在有代码变更或明确演练目标时集中安排下一次云端发布，不为刷新时间跨度证据重复上传；不启用未评估的付费产品。若项目要求严格保证零超额费用，应先更换有硬性限额的归档方案，再恢复依赖 R2 的发布。

### 剩余验收顺序

1. **对齐记录（本地，零云端写入）：** 将计划、todo 与操作手册对齐到已记录的十七个部署索引和 `drill` 自动后置步骤；保留 T5 的 `pending` 状态。验证相对链接、`git diff --check` 和 Spec Guard 只读检查。
2. **七日留存（只读云端请求）：** 以相关部署的实际创建时间为准，满七个自然日后分别运行 `pnpm audit:cloudflare:retention --target=react` 和 `--target=vue`；记录执行时间、所选部署 ID、R2 制品与线上指纹资源的核验结果。没有跨满七日的证据时继续标记 `pending`；审计失败先调查，不通过新部署掩盖缺口。
3. **独立机器恢复（云端只读、本机写入）：** 在第二台机器上全新克隆并安装依赖，确认没有旧 `build/` 状态，按手册以最小权限凭据分别运行 `pnpm recover:cloudflare:site --target=react` 和 `--target=vue`；保存恢复命令输出、当前 canonical 部署 ID、发布包 SHA-256、归档资源核对和失败项。该演练不执行 Pages 部署、R2 上传或索引写入；同机隔离模拟不计作此项通过。

两项真实验收都有证据后再评估 T5 与文档交付状态。H5、Android、iOS 和正式 V1 门禁仍按现有矩阵独立处理；Nuxt Worker 可行性失败不触发云端创建。
