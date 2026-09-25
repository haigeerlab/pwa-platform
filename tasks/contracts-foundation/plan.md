# 实现计划：contracts-foundation

## 概览

交付一个可由所有后续模块消费、但不依赖浏览器、UI 框架、Workbox 或 Node 请求对象的
`@pwa-platform/contracts` 工作区包。该包只定义并校验稳定的序列化边界；策略归一化、平台
基线合并、路径规则优先级和 `PwaPlan` 编译仍属于后续 `policy-compiler`。

> Tasks tracked in GitHub Issues #2

## 架构决定

- 包以私有工作区包 `@pwa-platform/contracts` 开发；这只是发布前占位名，不触发 npm 发布。
- 公开校验入口返回可辨识的成功/失败结果；失败统一返回稳定诊断 code、严重度、契约路径与非敏感消息，而不泄漏底层 schema 库的错误对象。
- 所有公开值均为 JSON 可序列化的 v1 结构。未知安全字段拒绝；未来可选字段只能出现于带命名空间的 `extensions`，未知事件类型可被安全忽略。
- `PwaIdentity`、安装元数据、策略、已编译计划和事件各自校验；contracts 只能验证结构与不变量，绝不执行策略合并、路由匹配、缓存决策或 Service Worker 注册。
- 测试完全在 Node 中运行，并额外证明包导入时未读取任何浏览器全局对象。
- 运行时结构校验使用完整版 `zod` 作为内部实现，校验主要运行在 Node 构建期：schema 不导出、不进入公开声明；每个 schema 与手写公开类型之间有编译期严格相等断言以防漂移；zod 之前先执行手写的纯 JSON 检查（zod 不拒绝类实例、getter、symbol 键和显式 `undefined`）；zod issue 只映射为平台诊断 code、清洗后的路径与平台自有消息，不透出其原文。三条约束：
  1. 包声明 `"sideEffects": false`，模块无顶层副作用，使只引用类型或常量的浏览器/Service Worker 产物可摇掉 zod（实测未声明时整个 zod 约 453KB 被打入）。
  2. schema 在首次校验时惰性创建，不在模块顶层创建；禁止调用会修改 `globalThis` 共享配置的 `z.config()`（实测完整版在创建 schema 时探测 `new Function`，导入本身不触发）。
  3. 若浏览器或 Service Worker 需要运行时校验，该部分不使用 zod，改为手写的小型校验并重新评估。

## 任务定义

### 任务 1：建立最小工作区与 contracts 包骨架

**说明：** 建立仅为第一个模块所需的 pnpm、TypeScript、测试与构建骨架，以及 private 的 ESM contracts 包；不提前创建 core、runtime 或适配器空包。

**验收标准：**

- 根目录声明 Node/pnpm 兼容范围、统一 lint/test/build 脚本和 `packages/contracts` 工作区。
- contracts 包提供受 `exports` 控制的 ESM 类型入口，发布配置保持 private，且没有框架、浏览器或 Workbox 依赖。
- `pnpm lint`、`pnpm test --filter @pwa-platform/contracts` 与 `pnpm build --filter @pwa-platform/contracts` 可在干净安装后运行。

**验证：** 在干净依赖目录执行三条公开命令；检查构建产物与包导出不包含未声明入口。

**依赖：** 无。

**预计范围：** M（根配置与 `packages/contracts` 骨架）。

### 任务 2：定义 v1 序列化模型、诊断和公开类型

**说明：** 将 spec 中的 Identity、安装元数据、Policy、Plan、资源分类、诊断和生命周期 envelope 具体化为可序列化的 TypeScript 模型；不在此任务中编译 Plan。

**验收标准：**

- 每个公开模型都有显式 v1 形状，`PwaPlan` 仅含规格列出的 15 个顶层字段，且不提供覆盖 identity 或基线拒绝规则的字段。
- 诊断具有受控 code 枚举、`error`/`warning` 严重度、JSON Pointer 风格路径及不含敏感信息的消息；校验结果使用单一可辨识 union。
- Policy 资源规则只能表达相对 `mountPath` 的整路径段前缀及分类意图；不存在 callback、glob、正则、浏览器对象或原始 Workbox 配置类型。

**验证：** TypeScript 类型测试覆盖合法消费、禁止字段和错误结果的穷尽分支；JSON 序列化测试覆盖所有模型。

**依赖：** 任务 1。

**预计范围：** M（contracts 源码、类型测试和 fixture）。

### 任务 3：实现边界校验与稳定失败语义

**说明：** 为每类公开输入实现运行时 schema 校验与诊断映射，严格执行 Identity 路径不变量、安装元数据、可序列化性和 Policy 安全结构限制。

**验收标准：**

- Identity 校验强制同源绝对路径、`scope` 包含 `mountPath`、worker/manifest 位于 scope 内及必需的缓存命名空间输入；安装元数据校验 start URL/scope 关系、展示模式和 192/512 的 any、maskable 图标变体。
- Policy 与 Plan 校验拒绝非 JSON 值、未知安全字段、非法 extensions 命名空间、身份覆盖企图及不安全资源分类；不会替 compiler 推断规则优先级或缓存策略。
- 对相同非法输入始终产生相同的诊断 code 与路径；错误对象、令牌、订阅、响应体和任意输入原文不进入诊断。

**验证：** Node 单元测试覆盖有效样例与每类拒绝路径；同一输入重复校验的诊断深相等；测试环境中显式移除 `window`、`navigator` 与 `self` 后仍可导入和校验。

**依赖：** 任务 2。

**预计范围：** M（schema、诊断映射与负向测试）。

### 任务 4：锁定公开导出与 v1 契约回归面

**说明：** 收敛 public barrel、类型导出和版本化 schema 入口，并建立防止意外破坏消费者的契约回归测试。

**验收标准：**

- 包只导出已记录的 v1 类型、资源分类、解析/校验入口和诊断类型；内部 schema 实现与依赖不成为公开 API。
- 公共 TypeScript 声明与 JSON fixture 有可审阅的快照/类型断言；增加字段只能通过兼容的可选字段或命名空间 extension。
- 生命周期 envelope 支持当前已知事件，同时消费者 helper 对未知事件类型返回安全的 `unknown` 分支而不是抛错。

**验证：** 运行类型声明回归、序列化 fixture 快照和 import-safety 测试；人工核对 package export map 与 `spec/contracts-foundation.md` 一致。

**依赖：** 任务 3。

**预计范围：** S（公开入口、fixture 与契约测试）。

### 任务 5：执行 contracts 基线质量门禁

**说明：** 在不扩展业务功能的前提下，完成模块级完整校验，记录可复现的结果，并核对没有跨越模块边界。

**验收标准：**

- lint、contracts 定向测试、contracts 构建和类型/序列化回归全部通过。
- 代码评审确认 contracts 不引入 UI 框架、Workbox、Service Worker 注册、缓存实现或策略编译逻辑。
- 实现、Spec、ADR-0007/0008 与 Capability Map 的职责边界一致；若发现公开契约变化，停止并先取得架构决策。

**验证：** 执行仓库命令并保存输出摘要；运行 diff 检查和模块级审阅清单。

**依赖：** 任务 4。

**预计范围：** S（验证、必要的文档对齐与审阅）。

### 任务 6：按 ADR-0008 补充缓存命名空间命名函数（follow-up）

**说明：** 任务 5 的质量门禁发现，ADR-0008 要求 contracts 提供缓存命名规则，但它不在原 spec 与任务中。本任务先把规则补进 spec，再实现浏览器安全的纯函数，并在计划校验中强制一致。

**验收标准：**

- spec 写明命名格式、分段编码、两级前缀、`cacheKind`（v1 只有 `precache`），以及 `cacheNamespaceSeed` 即 identity-revision。
- 导出 `CACHE_KINDS`、`appCachePrefix`、`cacheNamespacePrefix`、`cacheName`，手写实现、不触达 zod。
- 不同应用或不同环境的前缀互不包含，完整前缀不会互相嵌套。
- `validateIdentity` 拒绝含孤立代理项的 `appId` 与 `cacheNamespaceSeed`。
- `validatePlan` 要求 `cacheNamespace.prefix` 与 identity 一致。

**验证：**

- 格式与转义单元测试。
- 前缀互不包含的性质测试。
- 类型测试。
- 导出列表、声明快照与依赖边界回归。
- `pnpm lint`、contracts 定向测试与构建通过。

**依赖：** 任务 5。

**预计范围：** S（新模块、校验接入与测试）。

## Task List

### Phase 1：基础与模型

- #17 建立最小工作区与 contracts 包骨架
- #18 定义 v1 序列化模型、诊断和公开类型（blocked by #17）
- #19 实现边界校验与稳定失败语义（blocked by #18）
- #20 锁定公开导出与 v1 契约回归面（blocked by #19）
- #21 执行 contracts 基线质量门禁（blocked by #20）

### Follow-up

- #22 按 ADR-0008 补充缓存命名空间命名函数（#21 质量门禁发现，模块 PR 之后实现）

## 风险与缓解

| 风险 | 影响 | 缓解方式 |
| --- | --- | --- |
| schema 库的错误格式泄漏为公开行为 | 高 | 仅暴露平台自有诊断 union，并以 fixture 固化 code/path。 |
| contracts 越权实现 compiler 语义 | 高 | 负向测试和模块评审明确排除合并、优先级与缓存决策。 |
| 安装与路径校验在不同适配器下含义漂移 | 中 | 以同源绝对路径及 mountPath 相对前缀作为唯一输入形状，并由后续 compiler 负责归一化。 |
| 无意间依赖浏览器全局对象 | 中 | 使用 Node 导入测试，在缺失浏览器全局时执行全部结构校验。 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5。当前没有可安全并行的任务：后续任务均依赖前一任务固定的公开形状。

## 完成条件

- GitHub 中 #2 下的 #17–#21 均完成并按顺序关闭；#22 为质量门禁发现的 follow-up，完成后 #2 才关闭。
- 所有 contracts 验收标准、Node 无浏览器导入验证和公开导出回归通过。
- 模块实现不会阻塞或改写 `policy-compiler`、`workbox-engine`、运行时或适配器的职责。

## 修订计划：安装元数据的扩展字段（2026-09-24）

规格见[模块规格](../../spec/contracts-foundation.md)"修订：安装元数据的扩展字段"，配套修订见 [build-verifier](../../spec/build-verifier.md) 与 [vite-adapter](../../spec/vite-adapter.md) 的同日修订。分支 `claude/pwa-platform-review-cba86f`，基于 `main` 的 `b12b8dd`；规格提交 `51fe324`。每个任务一个提交，提交信息带 `Task: MX<n>`。build-verifier 与 vite-adapter 的计划只放指向本节的索引，任务统一在这里编号。

### 架构决定

- **一处契约，三处消费。** 类型、schema、跨字段规则与诊断码全部在 contracts；build-verifier 只加产物检查；vite 只做字段到 manifest 成员名的映射。Nuxt 复用 vite 的生成器，不改代码。
- **Chrome 偏好是 contracts 的警告，不是 build-verifier 的检查。** 警告沿用既有的 `severity: "warning"` 与编译警告通道（vite 的 `this.warn`），不另开通道。
- **"未写时逐字节不变"用一次性对照证明。** MX4 开工前在干净 worktree 中从 `51fe324` 构建 vite 浏览器夹具并记录全部产物哈希；MX4 完成后同法构建并比对，结果写入验证记录（与离线页修订的做法相同）。常驻测试只断言未写字段时 manifest 不含新键。
- **浏览器验证用独立的构建变体**，带截图与快捷方式图标的 public 目录副本，不改既有夹具的输出。
- **执行分工。** MX2、MX3、MX4 派给 `executor` 子代理（sonnet），MX3 与 MX4 并行；MX5 的浏览器验证、变异与 MX6 文档留在主会话；ADR-0037 由主会话写。

#### MX1：规格、ADR-0037 与本计划

**验收：** 规格已提交（`51fe324`）；ADR-0037 状态"已接受"，列出纳入与不纳入的成员及理由、Chrome 偏好只作警告的理由、`icons` 不做存在性检查的理由；本计划与 Documentation delivery 表提交；项目所有者确认后开始 MX2。

#### MX2：契约类型、schema 与诊断（TDD，完成：`fba1daf`；contracts 236 项；比例判断改为整数运算；三处变异转红）

**范围：** `packages/contracts/src/identity.ts`（新类型与常量）、`validate.ts`（schema 与 `installInvariants` 的新规则）、`diagnostics.ts`（7 个 `install.*` 码与 1 个 `verify.manifest-asset-missing` 的消息），公开导出，以及单元测试。

**验收：**
- 每个新字段的合法与非法样例（含空数组、重复项、大写 category、`sizes` 非 `宽x高`、未知取值）。
- `install.shortcut-url-outside-scope` 为错误；6 个 Chrome 偏好为警告，边界值各有测试（320 与 319、3840 与 3841、2.3 倍恰好与超出、8/9 张 wide、5/6 张 narrow、324/325 字符）。
- 诊断不回显值（带标记值的断言）。
- 未写新字段的既有样例，schema 输出与修订前相同（深比较）。
- 变异：去掉 scope 检查；比例阈值改为 2.4。

**验证：** `pnpm --filter @pwa-platform/contracts test`、`typecheck`、`pnpm lint`；下游包 `pnpm test` 不回归。

**范围估计：** 中，4–5 个文件。依赖：MX1。

#### MX3：build-verifier 的产物检查（TDD，完成：`e725e3c`；152 项；两处变异转红）

**范围：** `packages/build-verifier/src/artifacts.ts` 与测试。

**验收：** 截图缺失、快捷方式图标缺失各报 `verify.manifest-asset-missing`，路径指向字段、不含路径值；全部存在时通过；`install` 为 `null` 或未写字段时与修订前相同。变异：跳过快捷方式图标。

**范围估计：** 小，2 个文件。依赖：MX2；与 MX4 并行。

#### MX4：vite 生成与 Nuxt 构建（TDD，完成：`9435b8b`；vite 224、nuxt 85 项；134 个文件逐字节不变；两处变异转红）

**范围：** `packages/vite/src/manifest.ts` 与测试；`packages/nuxt/test/nuxt-build.test.ts` 新增一例。

**验收：**
- 字段映射与键名（`display_override`、`form_factor`、`short_name`），未写字段不输出键，键顺序固定。
- 构建中截图警告经 `this.warn` 输出，只含诊断码与路径。
- 缺失截图时 Vite 构建失败（经 `assertPwaArtifacts`）。
- Nuxt 构建产出的 manifest 含新字段；缺失截图时 Nuxt 构建同样失败。
- 未写字段时 vite 浏览器夹具产物与 `51fe324` 逐字节相同（对照结果写入验证记录）。
- 变异：`formFactor` 映射成 `formFactor` 键（映射测试转红）。

**范围估计：** 中，3–4 个文件。依赖：MX2；与 MX3 并行。

### 检查点 A（MX3、MX4 之后）

- 三个包的单元与构建测试通过；逐字节对照为空。

#### MX5：真实浏览器验证（完成：`07031c8`；0 个解析错误；5/5；vite 浏览器 29 项；变异转红）

**范围：** vite 浏览器测试新增构建变体（带截图与快捷方式图标的 public 目录副本）与一个场景。

**验收：** 通过 CDP `Page.getAppManifest` 读取该变体的 manifest：无解析错误，`screenshots`、`shortcuts`、`display_override`、`description` 被 Chrome 识别；既有 vite 浏览器场景无回归。变异：manifest 中的截图 `sizes` 写坏（Chrome 报解析错误或忽略该项，场景转红）。

**范围估计：** 小到中。依赖：检查点 A。

#### MX6：文档同步（完成：见本任务的提交）

**范围：** ADR-0037 定稿；[契约说明](../../docs/architecture/contracts.md)的安装元数据一段；新增 `docs/guides/manifest-fields.md`（每个字段的写法、错误与警告、Chrome 行为与版本、截图建议尺寸、同批包版本须一致）；[包导览](../../docs/guides/packages-overview.md) 链接；三个模块验证记录的修订一节；文档基线相关行；Documentation outcome。

**验收：** 相对链接检查通过；Spec Guard 文档核验对三个模块为 `ready`。

#### MX7：门禁与独立评审（完成：门禁全绿；评审阻断 0、应修 3，已在 `857e8af` 修复并配变异；见验证记录）

干净 worktree 中全仓 `install --frozen-lockfile --offline`、`lint`、`build`、`test`、`typecheck`、`test:browser`；新上下文评审，重点：新字段的校验是否完备、诊断不回显、未写时逐字节不变、存在性检查与生成的 manifest 是否一致（同一字段集合）、文档中的 Chrome 数值与出处。

### Task List（修订）

- MX1 规格、ADR-0037 与本计划
- MX2 契约类型、schema 与诊断（blocked by MX1）
- MX3 build-verifier 的产物检查（blocked by MX2；与 MX4 并行）
- MX4 vite 生成与 Nuxt 构建（blocked by MX2；与 MX3 并行）
- 检查点 A
- MX5 真实浏览器验证（blocked by 检查点 A）
- MX6 文档同步（blocked by MX5）
- MX7 门禁与独立评审（blocked by MX6）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 未写新字段的应用 manifest 或计划发生变化 | 高：所有已上线应用 | 逐字节对照；常驻测试断言不输出新键；schema 输出深比较 |
| 旧版本包校验带新字段的计划失败 | 中 | 同批包版本一致已是分发约定；接入说明写明 |
| Chrome 偏好数值随版本变化 | 低：只影响警告 | 只作警告；数值与出处写在 ADR 与接入说明，便于更新 |
| 存在性检查误报（路径编码、`base` 前缀） | 中：误伤构建 | 与既有预缓存检查使用同一套已发布路径；测试覆盖带 `mountPath` 的路径 |

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| decisions | `docs/adr/0037-install-metadata-manifest-members.md` | 平台接受与不接受的 manifest 成员及理由。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| decisions | delivered | `docs/adr/0037-install-metadata-manifest-members.md` | ADR-0037 已接受：接受与不接受的 manifest 成员、错误与警告的划分、`icons` 不做存在性检查的理由。 |
