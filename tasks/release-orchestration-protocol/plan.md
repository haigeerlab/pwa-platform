# 实现计划：release-orchestration-protocol

## 概览

把发布系统与 PWA 平台之间的边界落成中文运维协议和可复制记录模板。该模块不实现部署器、CDN 客户端、凭据或生产状态；它使外部基础设施实现能够可靠调用 build-verifier 并保存 ADR-0024 所需的完整发布线。

## 任务 1：发布记录与状态机协议

**文件：**

- `docs/operations/release-orchestration-protocol.md`（新增）

**内容：**

- 定义槽位互斥键、`prepared` → `verified` → `deployed` → `recorded` 状态和失败状态。
- 列出候选计划、产物、响应头、历史、可用路径、报告、人工证据与审批引用的最小记录字段；记录中不得含令牌、响应体或用户数据。
- 明确生产成功后才写 identity baseline 与发布历史；首次发布需保留 `verify.baseline-missing` 与批准记录。

**验收：** 可由一份记录重放 build-verifier 输入；不能把失败候选或并发发布写成成功历史。

## 任务 2：发布门禁接线

**文件：**

- `docs/operations/release-and-incident-runbook.md`
- `docs/operations/identity-release-baseline.md`

**内容：**

- 正常发布要求 `report.ok` 与 `verifyReleaseGateCoverage(...).ok` 同时为真，外加既有人工门禁。
- 共享源子应用列出 `release-order`；独立源列出四项机器检查。
- 首次生产发布例外的输入、审批与记录顺序不可省略。

**验收：** 各文档的职责与 RACI、ADR-0014、ADR-0024、ADR-0025 一致，无暗示 Vite 已进行生产检查的说法。

## 任务 3：模板、文档基线与核验

**文件：**

- `docs/operations/release-record-template.md`（新增）
- `docs/DOCUMENTATION-BASELINE.md`
- `tasks/release-orchestration-protocol/verification.md`

**验收：** 模板覆盖每项强制事实及脱敏要求；所有相对链接和锚点有效；文档基线登记为 `target`，不编造外部系统实测。

## 验证顺序

1. 相对链接、锚点和 Markdown 表格结构扫描。
2. 按模板手工构造“普通发布”“首次发布”“子应用发布”“失败发布”四份纸面记录，逐项确认状态转换与必需事实。
3. 运行 Spec Guard 的只读文档影响与产物核验。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 协议变成假想部署产品的 API | 只约定平台输入、输出与安全状态顺序；不命名云厂商、数据库或凭据。 |
| 首次发布绕过机器检查 | 固定保存 baseline-missing 报告与审批引用；不允许通过省略检查隐藏该事实。 |

## Task List

- [x] T1 发布记录与状态机协议
- [x] T2 发布门禁接线（依赖 T1）
- [x] T3 模板、文档基线与核验（依赖 T2）
