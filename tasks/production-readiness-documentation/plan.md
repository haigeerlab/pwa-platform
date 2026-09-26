# 实现计划：production-readiness-documentation

依据：[模块规格](../../spec/production-readiness-documentation.md)。

## 概览

先冻结事实与证据口径，再产出生产就绪审核和首页矩阵；随后按包职责补齐十个正式包 README，并按开发者功能目标重组接入指南；最后通过静态、构建、最小消费和真实浏览器视觉检查验证。文档只能消费现有契约和证据，发现运行时缺陷时停止对应结论并回到所属模块处理。

## 关键决策

- 公开状态由“代码实现、自动化、真机观察、发布门禁”四层证据决定；不以主观完成度替代记录。
- 首页承载用户要求的完整矩阵，详细证据放在独立页面并逐项互链，避免首页正文膨胀成测试日志。
- 成熟应用项目矩阵与工具定位矩阵分开：前者比较产品能力覆盖，后者比较接入工具职责。
- 十个 README 使用统一信息架构，但按“业务直接使用”与“上层自动安装”写出不同受众和边界。
- 接入指南按用户目标形成纵向路径；配置参考仍保留为单一完整字段来源，避免多个页面复制默认值。

## 依赖顺序

~~~text
证据冻结与生产审核
  ├─> 首页多端测试矩阵
  ├─> 成熟项目能力对比
  ├─> 十包 README
  └─> 功能接入指南
          └─> 交叉链接、构建、消费与视觉验证
~~~

## 任务清单

### 阶段一：事实与审核

- [x] T1 冻结当前提交、npm 十包版本、公开导出、浏览器记录和文档声明，建立证据索引。
- [x] T2 完成生产就绪审核报告，按通过、限制、阻断和证据缺口给出结论。

### 检查点：证据口径

- [x] 每项结论能定位到记录或来源。
- [x] 移动端未满足门禁的场景没有被写成完整通过。

### 阶段二：首页与能力对比

- [x] T3 在首页加入 PC／Android／iPhone 多功能测试矩阵并链接证据页。
- [x] T4 依据带日期的官方来源重做成熟项目能力对比，并同步修订旧对比规格与页面。
- [x] T5 验证首页两张矩阵在桌面与窄屏下可读，不产生整页溢出。

### 检查点：首页

- [x] 表格状态、图例、版本和核查日期完整。
- [x] 外部项目没有无来源的“没有”或“已实现”判断。
- [x] `pnpm docs:build` 通过。

### 阶段三：十个正式包 README

- [x] T6 补齐契约与基础实现包 README：contracts、core、engine-workbox、build-verifier、sw-runtime。
- [x] T7 补齐页面运行时与构建入口 README：client-runtime、vite、entry-resilience。
- [x] T8 补齐 Vue 与 React README，包含安装、注册、状态、方法、可选更新 UI 与 CSS。

### 检查点：包文档

- [x] 十包职责、受众、安装建议与安全边界清楚。
- [x] README 中列出的入口和符号与 `package.json` exports、类型声明一致。
- [x] `pnpm check:publish` 与适用的最小消费验证通过。

### 阶段四：按功能重组接入文档

- [x] T9 建立原生壳与安装路径，明确无公共运行时缓存的最小配置。
- [x] T10 重写更新提示、主动检查、多语言与主题接入路径。
- [x] T11 重写离线页、公共读取缓存与弱网超时接入路径。
- [x] T12 重写恢复 worker 与入口恢复接入路径，区分清理和迁移用途。
- [x] T13 对齐配置参考、包选择、兼容范围、导航与跨页链接，删除由本次改写产生的重复说明。

### 检查点：开发者路径

- [x] 六类功能都有最小配置、依赖、默认行为、验证方法和限制。
- [x] 示例不突破身份、缓存准入与 scope 的既有 ADR。
- [x] 新读者无需阅读内部包拓扑即可完成公开接入。

### 阶段五：总验证与交付

- [x] T14 运行文档构建、链接、发布包检查、README 示例和相关最小消费验证。
- [x] T15 在桌面与 375px 视口检查首页和关键指南，记录截图或 DOM 尺寸证据。
- [x] T16 复核 diff、文档基线与 Spec Guard 交付状态，生成最终验证记录和剩余限制。

### 完成检查点

- [x] 所有阻断级审核发现已修复或明确阻止“生产级通过”结论。
- [x] 所有文档与当前 npm `latest`、当前提交和记录证据一致。
- [x] 全部验收标准通过，变更可独立评审。

## 任务规格

每项任务的验收条件、验证命令、依赖和预计文件范围记录在 [todo.md](todo.md)。任务按顺序执行；T6、T7、T8 只有在 T1 公开导出索引冻结后才可分别推进。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 用户记忆中的移动端完成度高于仓库记录 | 首页产生过度承诺 | 按证据层级标注；新证据单独补录后再升级状态。 |
| 外部项目版本快速变化 | 对比表很快失真 | 使用官方来源、记录核查日期和版本，无法确认写“未确认”。 |
| 十份 README 与接入站点复制配置 | 后续文档漂移 | README 保留最小示例和职责，完整字段统一链接配置参考。 |
| 首页大表影响手机阅读 | 文档站不可用 | 表格容器横向滚动并做 375px 视觉检查。 |
| 审核发现运行时缺陷 | 文档无法诚实写成通过 | 将缺陷归属原模块，本模块保留阻断项，不顺带改安全敏感代码。 |

## 开放问题

- Android 和 iPhone 的缺失门禁证据只能在取得新的可追溯真机记录后升级；当前实施按“部分通过／未验证”发布文档。
- 外部项目若无法从官方资料确认某项能力，使用“未确认”，不以仓库搜索不到代码替代产品结论。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| production-readiness-documentation | `spec/production-readiness-documentation.md`、`docs/product/production-readiness-audit.md`、`tasks/production-readiness-documentation/plan.md`、`tasks/production-readiness-documentation/verification.md` | 记录审核结论和证据链；首页、详细证据页、十包 README 与功能接入指南作为实施交付。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 登记新模块与依赖。 |
| capability-comparison | `spec/capability-comparison.md`、`website/introduction/tooling-comparison.md`、`website/introduction/application-comparison.md`、`tasks/capability-comparison/verification.md` | 更新既有对比事实源；首页消费该权威交付。 |
| developer-entry | `README.md` | 更新仓库入口；十个包 README、功能接入指南、包与兼容参考由入口链接。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| production-readiness-documentation | delivered | `tasks/production-readiness-documentation/verification.md` | 审核、首页矩阵、十包 README、功能接入指南及其验证记录已交付。 |
| capability-map | delivered | `spec/CAPABILITY-MAP.md` | 已登记本模块边界与依赖。 |
| capability-comparison | delivered | `tasks/capability-comparison/verification.md` | 工具对照与固定提交的成熟应用矩阵已交付并完成响应式核验。 |
| developer-entry | delivered | `README.md`、`website/index.md`、`website/guide/integration-by-capability.md` | 仓库入口、文档站首页与按能力接入路径已更新。 |
