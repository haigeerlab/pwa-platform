# Todo：production-readiness-documentation

## T1：冻结事实与证据索引

**描述：** 固定当前提交、十个 npm 正式包、package exports、现有自动化与真机记录，形成后续文档唯一可引用的证据索引。

**验收标准：**
- [x] 十包名称、版本、公开入口和直接使用建议完整。
- [x] PC、Android、iPhone 记录按自动化、真机观察、发布门禁分层。
- [x] 冲突声明有明确取舍依据，不静默选择更乐观的结论。

**验证：**
- [x] 对照 `package.json`、发布记录与浏览器验证记录逐项复核。
- [x] `git rev-parse HEAD` 与 npm 核查日期写入索引。

**依赖：** 无。

**可能涉及：** `docs/product/production-readiness-audit.md`、`tasks/production-readiness-documentation/evidence.md`。

**规模：** S。

## T2：完成生产就绪审核

**描述：** 从正确性、架构、安全、性能、兼容、发布恢复、供应链、可访问性、可观测性和维护性评估平台。

**验收标准：**
- [x] 每个审核维度有判定、证据和剩余风险。
- [x] 区分平台包就绪与业务宿主上线就绪。
- [x] 阻断项不会被总评掩盖。

**验证：**
- [x] 复核架构、ADR、测试、发布与运维记录。
- [x] 对所有“通过”结论执行反向证据抽查。

**依赖：** T1。

**可能涉及：** `docs/product/production-readiness-audit.md`。

**规模：** S。

## T3：首页多端测试矩阵

**描述：** 在首页呈现 PC、Android、iPhone 的功能验证状态，并链接详细证据与限制。

**验收标准：**
- [x] 覆盖安装、更新、离线、缓存、恢复、多语言、多主题和 Vue/React。
- [x] 状态图例区分通过、部分通过、未验证、不适用。
- [x] 每个平台结论与 T1 证据一致。

**验证：**
- [x] `pnpm docs:build`。
- [x] 手工抽查每个链接与状态。

**依赖：** T1、T2。

**可能涉及：** `website/index.md`、一个详细证据页、站点导航配置。

**规模：** M。

## T4：成熟项目能力对比

**描述：** 依据官方资料和带日期的公开行为，按截图维度比较本平台与九个成熟项目。

**验收标准：**
- [x] 每个外部项目有直接官方来源与核查日期。
- [x] 无法证明的格子标记“未确认”。
- [x] 工具职责对比与应用能力对比分开说明。

**验证：**
- [x] 来源链接逐项打开核验。
- [x] 与当前平台 exports、策略和发布状态交叉核对。

**依赖：** T1。

**可能涉及：** `spec/capability-comparison.md`、`website/index.md`、`website/introduction/tooling-comparison.md`、一个应用对比明细页。

**规模：** M。

## T5：首页响应式验证

**描述：** 验证两张大表在桌面与窄屏可读，必要时只增加局部样式。

**验收标准：**
- [x] 1280px 下表格与图例完整。
- [x] 375px 下仅表格容器横向滚动，整页无横向溢出。
- [x] 键盘与触摸均可访问表格内容和链接。

**验证：**
- [x] 文档预览的桌面与 375px DOM 尺寸检查。
- [x] 记录截图或等价浏览器证据。

**依赖：** T3、T4。

**可能涉及：** `website/index.md`、`website/.vitepress/theme/custom.css`。

**规模：** S。

## T6：基础包 README

**描述：** 补齐 contracts、core、engine-workbox、build-verifier、sw-runtime 的职责、入口、API、边界与验证说明。

**验收标准：**
- [x] 五包均说明是否供业务直接安装。
- [x] 导出和示例与包元数据及类型一致。
- [x] 缓存和 worker 安全边界没有被简化为危险示例。

**验证：**
- [x] 对照五个 `package.json` exports 和生成类型声明。
- [x] `pnpm check:publish`。

**依赖：** T1。

**可能涉及：** 五个对应的 `packages/*/README.md`。

**规模：** M。

## T7：运行时与构建入口 README

**描述：** 补齐 client-runtime、vite、entry-resilience 的生命周期、配置、API、边界和最小示例。

**验收标准：**
- [x] `client-runtime` 明确通常由框架绑定间接使用。
- [x] `vite` 包含最小插件配置和产物说明。
- [x] `entry-resilience` 区分入口清单、恢复页和业务身份验证责任。

**验证：**
- [x] 对照三个包的 exports、类型和既有接入测试。
- [x] 适用的最小消费项目类型检查与构建通过。

**依赖：** T1。

**可能涉及：** 三个对应的 `packages/*/README.md`。

**规模：** M。

## T8：Vue 与 React README

**描述：** 以框架开发者视角说明安装、注册、状态、方法和可选更新提示 UI。

**验收标准：**
- [x] Vue 与 React 示例遵循各自框架惯例。
- [x] 状态与方法完整，接管和刷新语义分开。
- [x] CSS 导入、文案、位置和主题定制说明完整。

**验证：**
- [x] 对照公开类型和一致性测试。
- [x] Vue 3.4/Vite 5 与 React 消费夹具构建通过。

**依赖：** T1。

**可能涉及：** `packages/vue/README.md`、`packages/react/README.md`。

**规模：** S。

## T9：原生壳与安装接入路径

**描述：** 提供只启用安装与独立窗口、不启用公共运行时缓存的最小接入路径。

**验收标准：**
- [x] 明确必要身份、安装元数据、插件与页面注册步骤。
- [x] 明确 `vite dev` 与生产构建差异。
- [x] 给出安装资格和独立窗口的验证步骤。

**验证：**
- [x] 最小配置通过类型检查和生产构建。

**依赖：** T6、T7、T8。

**可能涉及：** `website/start/choose.md`、`website/start/vue.md`、`website/start/react.md`、`website/guide/configuration.md`。

**规模：** M。

## T10：更新、多语言与主题接入路径

**描述：** 整理自绘更新提示、默认 UI、主动检查、文案覆盖与主题定制。

**验收标准：**
- [x] 接管和页面刷新分别说明。
- [x] 默认 UI 与自绘 UI 的选择清楚。
- [x] 多语言、亮暗主题和宿主 CSS 的配置边界清楚。

**验证：**
- [x] 对照 Vue/React 类型、CSS exports 与浏览器记录。
- [x] `pnpm docs:build`。

**依赖：** T8、T9。

**可能涉及：** `website/guide/updates.md`、`website/guide/configuration.md`、Vue/React 接入页。

**规模：** M。

## T11：离线、缓存与弱网接入路径

**描述：** 将应用壳、离线页、显式公共读取缓存和网络超时组织为递进能力。

**验收标准：**
- [x] 不启用公共运行时缓存时的行为明确。
- [x] 公共 GET 准入、容量、时效、响应头和清理责任完整。
- [x] 首次离线、未缓存导航与弱网超时限制明确。

**验证：**
- [x] 示例与 `PwaPolicy` v3 类型和 ADR 一致。
- [x] `pnpm docs:build`。

**依赖：** T9。

**可能涉及：** `website/guide/offline.md`、`website/guide/public-read-cache.md`、`website/guide/configuration.md`。

**规模：** M。

## T12：恢复能力接入路径

**描述：** 区分恢复 worker 的本应用清理与入口恢复的迁移/故障引导，给出配置和演练方法。

**验收标准：**
- [x] 两类恢复能力的触发条件、数据边界和部署责任不混淆。
- [x] 入口清单验证不被表述为平台身份认证。
- [x] 包含中英文、主题、返回路径和用户确认说明。

**验证：**
- [x] 对照入口恢复 README、ADR 和演练记录。
- [x] 现有入口恢复消费示例构建通过。

**依赖：** T7、T9。

**可能涉及：** `website/guide/optional.md`、`website/guide/troubleshooting.md`、入口恢复指南链接。

**规模：** M。

## T13：参考页与导航对齐

**描述：** 对齐配置参考、包选择、兼容范围和跨页链接，移除本次改写产生的重复或冲突文案。

**验收标准：**
- [x] 一个配置项只有一个权威完整定义。
- [x] 包状态、版本和支持范围在所有入口一致。
- [x] 不删除与本次无关的历史或运维文档。

**验证：**
- [x] 全站搜索旧版本、旧状态和冲突表述。
- [x] 文档链接检查与 `pnpm docs:build`。

**依赖：** T9、T10、T11、T12。

**可能涉及：** `website/reference/packages.md`、`website/reference/compatibility.md`、`website/.vitepress/config.ts`、相关指南。

**规模：** M。

## T14：静态、构建与消费验证

**描述：** 对全部文档和 README 执行构建、链接、发布包与最小消费验证。

**验收标准：**
- [x] 文档站构建和内部链接通过。
- [x] 发布包检查通过，README 与 exports 一致。
- [x] 最小接入示例类型检查与构建通过。

**验证：**
- [x] `pnpm docs:build`。
- [x] `pnpm check:publish`。
- [x] 执行适用的 Vite 5/Vue 3.4 与 React 消费验证。

**依赖：** T3–T13。

**可能涉及：** 验证记录，不改运行时代码。

**规模：** S。

## T15：真实浏览器文档视觉验证

**描述：** 在桌面和 375px 视口核对首页、矩阵与关键功能指南。

**验收标准：**
- [x] 两张矩阵、代码块、导航和提示框在两种视口可用。
- [x] 页面无控制台错误和整页横向溢出。
- [x] 结果有截图或 DOM 尺寸记录。

**验证：**
- [x] 本地文档预览的浏览器检查。

**依赖：** T5、T13、T14。

**可能涉及：** `tasks/production-readiness-documentation/verification.md`。

**规模：** S。

## T16：最终复核与交付

**描述：** 按五轴审查文档事实、diff、基线声明和全部验收结果，记录剩余限制。

**验收标准：**
- [x] 没有未经证据支持的生产承诺。
- [x] 变更只覆盖本模块范围。
- [x] Spec Guard 文档验证没有未解释的 attention。

**验证：**
- [x] `git diff --check`。
- [x] Spec Guard `verify-artifacts` 与 documentation verification。
- [x] 完成 `tasks/production-readiness-documentation/verification.md`。

**依赖：** T1–T15。

**可能涉及：** 本模块 verification、文档基线和必要的状态更新。

**规模：** S。
