# 实现计划：browser-release-evidence

## 概览

为生产发布补充浏览器和恢复演练的记录模板及操作清单。该模块不会伪造缺失的 Android、桌面 N-1 或原生安装证据，也不在没有设备和新 ADR 的前提下声称 Android 自动化已支持。

## 任务 1：生产浏览器证据模板

**文件：**

- `docs/operations/browser-release-evidence.md`（新增）

**内容：**

- 逐场景记录 Chrome 桌面 N/N-1、Chrome Android N/N-1、完整版本、OS、设备、日期、执行人和证据引用。
- 原生安装记录完成安装、独立窗口启动和 `display-mode`；未执行即必测失败。
- 桌面 N-1 使用 `PWA_HARNESS_CHROME_PATH`；Android 设备按浏览器矩阵的两机 Google Play 轮换规则维护。

**验收：** 模板任何一项必测未执行时不能填写“V1 通过”。

## 任务 2：运行手册与现有矩阵交叉引用

**文件：**

- `docs/architecture/browser-matrix.md`
- `docs/architecture/v1-acceptance-matrix.md`
- `docs/operations/recovery-drill.md`
- `docs/operations/release-and-incident-runbook.md`

**内容：**

- 将生产发布记录、原生安装和恢复演练证据链接到同一份证据模板。
- 保持现有阻塞规则、特性检测原则和“不修改矩阵范围需 ADR”的约束。

**验收：** 没有与现有矩阵相矛盾的“CI 或桌面 N 可代替 Android”表述。

## 任务 3：文档基线与核验记录

**文件：**

- `docs/DOCUMENTATION-BASELINE.md`
- `tasks/browser-release-evidence/verification.md`

**验收：** 文档基线为 `target`；验证记录只证明模板与链接正确，明确真实设备证据尚未取得。

## 验证顺序

1. 相对链接、锚点和表格结构扫描。
2. 用模拟的“桌面 N 通过、Android N-1 未执行”记录核验结论必须为未通过。
3. 运行 Spec Guard 的只读文档影响与产物核验。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 模板被误读成已有浏览器证据 | 基线与验证记录明确标为 `target`，不填写实际版本或通过结论。 |
| Android 设备流程被简化为 APK 旁加载 | 文档直接复用矩阵的 Google Play 两机规则，禁止以其他来源替代。 |

## Task List

- [x] T1 生产浏览器证据模板
- [x] T2 运行手册与现有矩阵交叉引用（依赖 T1）
- [x] T3 文档基线与核验记录（依赖 T2）
