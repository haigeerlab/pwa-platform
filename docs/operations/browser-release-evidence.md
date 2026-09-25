# 生产发布浏览器证据

本模板用于记录每次生产发布的真实浏览器、原生安装和恢复演练证据。它不替代自动化测试，也不以桌面、CI 或单元测试替代 Android、N-1 或原生安装实证。

适用范围与发布阻断规则由[浏览器矩阵](../architecture/browser-matrix.md)、[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)、[恢复演练](recovery-drill.md)和[发布与事故运行手册](release-and-incident-runbook.md)共同定义。

## 判定规则

- 每条记录必须先声明发布通道：`desktop` 或 `desktop+android`（[ADR-0030](../adr/0030-desktop-release-channel.md)）。
- 每个必测平台、版本和场景都必须记录为“通过”“失败”或“未执行”；不得留空。`desktop` 通道中 Chrome Android 的各行一律填写“不在本通道”，它既不是“通过”，也不是“未执行”。“不在本通道”只允许出现在 `desktop` 通道的 Chrome Android 行；出现在桌面行、`desktop+android` 通道的任何行、原生安装或恢复演练时，结论一律为未通过。
- 通道在发布尝试创建时确定，之后不可更改；`desktop` 通道的记录必须附已知的 Android 问题清单（ADR-0030）。
- 必测范围：`desktop` 通道为 Chrome 桌面版的 N 与 N-1；`desktop+android` 通道为 Chrome 桌面版与 Chrome Android 稳定版，各自的 N 与 N-1。
- `desktop+android` 通道中，Android N-1 使用两台关闭自动更新的实体设备轮换保留，只能经 Google Play 更新；不可用的 N-1 视为失败，不存在例外。
- 原生安装与恢复演练均为每次生产发布的必测项。
- 本通道内任一必测项为“失败”或“未执行”，或缺少完整版本、系统、日期、执行者或证据引用时，结论必须为“V1 发布证据：未通过”。
- `desktop` 通道通过时，结论写为“V1 发布证据（desktop 通道）：通过”，不得省略通道。
- “桌面 Chrome N 通过”“CI 通过”或“单元测试通过”均不能补足 Android、N-1 或原生安装的缺失记录。

## 桌面 N-1 执行方式

桌面浏览器证据通过 `browser-test-harness` 取得。使用受控 N-1 Chrome 二进制时，执行：

```sh
PWA_HARNESS_CHROME_PATH="/path/to/chrome" pnpm test:browser --filter <package>
```

命令成功不等于证据完整：记录中仍必须填写实际观察到的完整 Chrome 版本、操作系统、日期、执行者、场景结果和证据位置。

## Android 设备轮换

为保留 Android N-1，维护两台关闭自动更新的实体设备。每个新的稳定版发布后，只将原 N-1 设备经 Google Play 更新为新 N；另一台继续保留为 N-1。不得使用 APK 侧载替代此流程。记录设备型号即可，不记录设备序列号、账户或其他个人数据。

## 发布证据记录模板

以下模板是一份待填写的生产记录，不是已取得的通过证据。

```md
# 浏览器发布证据：<release-attempt-id>

## 发布上下文

| 字段 | 值 |
| --- | --- |
| 发布尝试 ID | <id> |
| 发布通道 | <desktop / desktop+android>（创建时确定，不可更改） |
| 已知 Android 问题（`desktop` 通道必填） | <问题与 Issue/记录链接；没有则写“无已知问题”> |
| CI 证据形式 | <CI 运行链接 / 本地替代（ADR-0031）：本地门禁记录引用> |
| 应用与稳定槽位 | <app / stable-slot> |
| 候选构建 | <build identity> |
| 受保护环境 | <environment> |
| 执行日期（UTC） | <YYYY-MM-DD> |
| 执行者 | <operator> |
| Platform 审阅者 | <reviewer> |
| Product fixture 确认 | <reviewer / record> |
| Infrastructure 环境确认 | <reviewer / record> |

## 必测浏览器环境

| 平台 | 层级 | 完整 Chrome 版本 | 操作系统及版本 | 设备/主机型号 | Android 自动更新状态与 Google Play 轮换记录 | 日期（UTC） | 执行者 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop | N | <version> | <os> | <model> | 不适用 | <date> | <operator> | <link/path> |
| Chrome Desktop | N-1 | <version> | <os> | <model> | 不适用 | <date> | <operator> | <link/path> |
| Chrome Android | N | <version> | <os> | <physical model> | <auto-update off; Play rotation> | <date> | <operator> | <link/path> |
| Chrome Android | N-1 | <version> | <os> | <physical model> | <auto-update off; Play rotation> | <date> | <operator> | <link/path> |

## V1 场景结果

每个环境均填写所有行；状态只能为“通过”“失败”或“未执行”。`desktop` 通道中 Chrome Android 的行填写“不在本通道”。

| 平台 | 层级 | 首次在线访问 | 后续离线访问 | 未缓存/隐私/流式响应 | 更新检测 | 异常恢复 worker | Vue 示例安装 | React 示例安装 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome Desktop | N | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <link/path> |
| Chrome Desktop | N-1 | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <link/path> |
| Chrome Android | N | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <link/path> |
| Chrome Android | N-1 | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <状态> | <link/path> |

## 原生安装记录

为每个必测浏览器环境中的 Vue 示例和 React 示例分别增加一行；不得以一个示例或一个平台的安装结果代表其他必测行。

| 平台 | 层级 | 应用 | 安装资格事件 | 安装完成 | 独立窗口启动 | 起始 URL | 期望/观察到的 display-mode | 事件顺序 | 状态 | 证据引用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <platform> | <N/N-1> | <Vue/React sample> | <observed> | <observed> | <observed> | <observed> | <expected / observed> | <eligible -> installed> | <状态> | <link/path> |

“原生安装”不是浏览器内页面仍可访问：必须记录安装完成、独立窗口启动，以及实际 `display-mode` 与期望值的对照。状态为“未执行”即不通过。

## 恢复演练

| 演练子记录 | 控制权已获得 | 无 fetch 拦截 | 仅删除当前应用缓存前缀 | 修复 worker 后恢复离线启动 | 状态 | 证据引用 |
| --- | --- | --- | --- | --- | --- |
| <recovery-drill record id/path> | <状态> | <状态> | <状态> | <状态> | <状态> | <link/path> |

恢复演练步骤与缓存明细记录在 [恢复演练](recovery-drill.md) 的“恢复演练子记录模板”中；此处引用同一份子记录，不重复或弱化其检查项。

## 最终结论

| 检查 | 结论 | 说明 |
| --- | --- | --- |
| 发布通道 | <desktop / desktop+android> | <本通道的必测平台> |
| 必测平台与 N/N-1 完整记录 | <通过/失败/未执行> | <missing items> |
| 全部 V1 场景 | <通过/失败/未执行> | <missing items> |
| 原生安装 | <通过/失败/未执行> | <missing items> |
| 恢复演练 | <通过/失败/未执行> | <missing items> |
| V1 发布证据 | <通过/未通过> | <only pass when every required item passes> |
```

该记录应与发布尝试和机器可读发布门禁报告一同归档。若记录未完成，保持其真实状态为“未通过”；不得在后续说明中将其写成已验证或已发布通过。
