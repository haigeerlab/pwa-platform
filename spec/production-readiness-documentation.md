# 规格：production-readiness-documentation

## 目标

以当前主分支、npm 正式包、自动化结果与可追溯真机记录为事实源，对 PWA Platform 做一次面向生产使用的整体审核，并把审核结论转化为开发者可执行的公开文档。开发者应能从首页判断平台覆盖范围和多端验证状态，从包级 README 理解每个正式包的职责，从按功能组织的接入指南完成所需能力配置。

本模块只审计和整理现有能力，不修改 `PwaIdentity`、缓存准入、Service Worker scope、缓存命名空间或公开运行时契约。审核发现的运行时缺陷回到所属模块处理，不在文档变更中顺带修复。

## 事实与证据模型

公开结论必须区分以下层级，不能用较低层级替代较高层级：

1. **代码实现**：当前源码和公开导出中存在对应能力。
2. **自动化通过**：对应提交、浏览器或构建环境的测试有可追溯结果。
3. **真机观察**：记录了设备、系统、浏览器、日期、入口形态与实际行为。
4. **发布门禁通过**：满足既定发布通道的版本、设备数量和必测场景要求。

页面状态统一使用“通过”“部分通过”“未验证”“不适用”“未提供”“计划中”。“部分通过”必须注明缺失场景；没有可追溯记录的测试即使曾人工执行，也不得写成发布门禁通过。每张公开矩阵注明所对应的平台版本、源码提交或 npm 版本、核查日期和证据入口。

事实优先级如下：冻结发布记录与 registry 读回结果高于移动分支描述；当前源码与自动化结果只证明当前工作区；真机记录只证明已记录的设备和场景；产品定位或计划不能当作实现证据。平台包生产就绪与具体业务宿主生产就绪分别判定。

## 生产就绪审核

审核至少覆盖以下维度：

- 正确性与公开契约：包导出、类型、构建产物、版本和依赖闭包一致。
- PWA 身份与安全：稳定 manifest ID、scope、worker URL、缓存命名空间及默认拒绝缓存边界不被文档弱化。
- 安装、更新、离线和恢复：浏览器标签页与独立安装窗口分别记录，更新接管与页面刷新分别说明。
- 多端兼容：桌面、Android 与 iPhone 按实际证据披露，不把渐进兼容观察写成完整发布通道承诺。
- 发布与恢复：构建校验、旧资源保留、回滚、恢复 worker、入口恢复和事故演练边界明确。
- 性能、可访问性与可观测性：记录现有门禁、已知缺口及业务应用仍需承担的验证。
- 供应链与维护：npm 完整性、许可证、依赖审计、版本策略、支持矩阵和文档复核日期明确。

审核报告按“通过”“非阻断限制”“阻断项”“证据缺口”给出结论，不使用没有判定条件的“生产级”表述。

## 文档站首页

首页直接提供两张可在窄屏横向阅读的表：

1. **PC／Android／iPhone 多功能测试矩阵**：覆盖安装与独立窗口、更新提示与接管、离线壳、默认离线页、公共读取缓存、恢复 worker、入口恢复、多语言、多主题和框架示例。每格使用统一状态并链接详细证据。
2. **成熟项目能力对比矩阵**：沿用用户提供截图的能力维度，比较本平台与 Elk、Home Assistant、Proton Pass、Mastodon、Excalidraw、Squoosh、Pinafore、Immich、tldraw；应用项目与接入平台的职责差异在表前明确说明。

外部项目只采用官方文档、官方仓库或可复现公开行为，逐项注明核查日期和来源。无法确认时写“未确认”，不得根据截图或搜索摘要推断“没有”。现有工具对比页继续保留，用于比较 PWA Platform、vite-plugin-pwa、Workbox 与 PWABuilder 的接入层职责。

## 十个正式包 README

范围固定为 `0.1.0` 已发布的十个包：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`entry-resilience`、`vue`、`react`。

每份 README 根据包职责至少包含：定位、目标读者、是否建议业务直接安装、安装方式、最小用例、公开入口与核心 API、配置或输入输出、生命周期或构建阶段、安全边界、兼容性、验证方式、常见误用、相关包与详细指南。内部基础包不得伪装成业务接入入口；README 中的导出和示例必须与 package exports 和类型声明一致。

## 按功能组织的接入指南

接入文档以开发者目标为主线，而不是要求读者理解内部包拓扑：

1. **原生壳**：安装、独立窗口和应用身份；说明不启用公共运行时缓存也能成立。
2. **更新体验**：自绘提示与默认提示 UI、主动检查、用户确认接管、刷新时机和未保存数据保护。
3. **多语言与主题**：平台默认文案、宿主覆盖、亮暗主题和不同构建语言的边界。
4. **离线页面**：应用壳、默认或自定义离线页、首次在线要求和恢复联网。
5. **公共读取缓存**：仅显式声明的同源公共 GET，配置上限、响应准入、超时与清理。
6. **恢复能力**：恢复 worker 与入口恢复分别解决什么问题、如何配置、部署和演练。

每个功能页都提供“适用场景、最小配置、完整配置、默认值、依赖、验证步骤、平台限制、常见错误”。现有页面优先重组和互链，避免复制互相漂移的配置片段。

## 不在范围内

- 不发布新 npm 版本，不修改 npm tag 或 registry 内容。
- 不替业务应用声明其生产上线已通过。
- 不补造缺失的移动设备证据，也不把模拟器或桌面自动化替代为真机结论。
- 不新增 Push、Background Sync、Periodic Sync、Share Target、File Handlers 或 Launch Handler 实现。
- 不为对比而修改平台功能；发现缺陷另立所属模块工作。

## 验收标准

1. 审核报告中的每个结论可追溯到仓库、发布记录、测试记录或带日期的官方外部来源。
2. 首页两张矩阵完整呈现，在桌面和 375px 窄屏下可用，不产生整页横向溢出。
3. 十个正式包 README 全部覆盖规定结构，公开导出与包元数据核对无误，示例可通过适用的类型或构建检查。
4. 开发者能分别按原生壳、更新、多语言/主题、离线页、公共缓存和恢复能力完成最小接入，不需要从内部架构反推配置。
5. `pnpm docs:build`、文档链接检查、`pnpm check:publish` 和与 README 示例相关的最小消费验证通过。
6. 文档明确披露 desktop 发布门禁与移动端证据边界；没有证据不足却标为完整通过的格子。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| capability-map | update | 登记生产审核与文档重构模块及其依赖。 |
| production-readiness-documentation | create | 新增审核报告、证据模型、首页矩阵和实施记录。 |
| capability-comparison | update | 用户要求增加成熟应用项目矩阵并放到首页，取代旧规格中“不评分、首页只放入口”的限制。 |
| browser-release-evidence | follow | 汇总既有 PC、Android、iPhone 证据，但不改写原始记录或发布通道判定。 |
| developer-entry | update | 首页、功能接入路径和十包 README 全面调整。 |
| browser-matrix | follow | 沿用既有 N/N-1 与渐进兼容要求，不降低门禁。 |
| package-distribution | follow | 沿用十个 `0.1.0` 正式包及 registry 读回事实。 |
| architecture | follow | 不改变架构和依赖方向。 |
| identity-release-baseline | follow | 不修改生产身份和缓存命名空间。 |
| release-and-incident | follow | 复用发布、恢复和事故演练流程。 |
| product-direction | follow | 不改变平台定位、目标用户或产品范围。 |
| decisions | follow | 不产生新的难以逆转架构决策。 |
| lifecycle-and-recovery | follow | 只解释既有生命周期与恢复行为。 |
| ci-baseline | follow | 不改变 CI 门禁或分支保护。 |
| supply-chain | follow | 只引用现有依赖审计与发布完整性事实。 |
| v1-acceptance | follow | 不修改 V1 场景通过标准。 |
| recovery-drill | follow | 复用既有恢复演练步骤和证据要求。 |
| cloudflare-test-deployment | follow | 只引用已记录的公开测试部署证据。 |
| browser-test-harness | follow | 不修改真实浏览器测试工具。 |
| workbox-engine | follow | 不修改 Workbox 引擎或其边界。 |
| sw-runtime | follow | 不修改 worker 行为或消息契约。 |
| offline-write-extension | follow | 只披露其当前私有包状态。 |
| build-verifier | follow | 不改变产物与发布事实校验逻辑。 |
| release-gate-contract | follow | 不改变门禁覆盖判定。 |
| local-ci-record | follow | 不新建或重写本地 CI 记录。 |
| release-orchestration-protocol | follow | 不修改外部发布编排协议。 |
| vite-adapter | follow | README 和接入说明只记录既有公开配置。 |
| client-runtime | follow | README 和接入说明只记录既有页面 facade。 |
| vue-react-adapters | follow | 不改变框架绑定行为。 |
| update-notice-ui | follow | 只重组现有默认提示 UI 接入说明。 |
| examples-browser-e2e | follow | 只引用现有示例和浏览器证据。 |
| pwa-entry-resilience | follow | 只重组现有入口恢复接入与证据。 |
| ssr-adapters | follow | 只披露 Nuxt 包仍未公开的状态。 |
| shared-origin-topology | follow | 不改变 scope 排除或发布顺序规则。 |
| push-module | follow | 只披露工作区实现和未公开状态。 |
| public-read-cache | follow | 只重组既有显式公共读取缓存配置。 |
