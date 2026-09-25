# 规格：browser-release-evidence

## 目标

把 V1 发布所需的真实浏览器、原生安装和恢复演练证据变成可重复记录的操作契约，诚实呈现桌面 N-1、Android N/N-1 或原生安装尚未取得的事实。

## 范围

本模块补充浏览器矩阵、V1 验收矩阵和恢复演练的生产发布记录模板。它复用 `browser-test-harness` 的桌面运行能力，但不声称 Playwright 可以自动完成 Chrome Android 或浏览器原生安装 UI。

必测证据包括：

- Chrome 桌面稳定版 N 与 N-1：同一组 V1 场景、完整版本号、操作系统和日期；
- Chrome Android 稳定版 N 与 N-1：两台关闭自动更新、只经 Google Play 更新的设备轮换；
- 原生安装：完成安装、独立窗口启动和 `display-mode` 结果；
- 类生产环境恢复演练：恢复 worker 接管、不拦截 fetch、仅删除当前应用缓存前缀、修复后离线启动恢复。

未取得的必测证据按浏览器矩阵视为未通过，不得被本机桌面 Chrome N、CI 或单元测试替代。

## 命令

桌面自动化沿用既有命令：

```text
pnpm test:browser --filter <包名>
PWA_HARNESS_CHROME_PATH="/path/to/chrome" pnpm test:browser --filter <包名>
```

Android 与原生安装由受控设备人工执行，记录设备型号、完整浏览器版本、操作系统、日期、逐场景结果和证据引用。

## 测试策略

- 文档链接、记录字段和阻塞规则由静态文档检查核验。
- 桌面 N/N-1 使用 harness；每个自动化测试保留 `browser-version` 注解。
- Android 与原生安装使用发布前人工清单；任何空字段或未执行场景使必测结论失败。
- 恢复演练严格使用现有记录模板，不记录令牌、缓存响应体、Push endpoint 或用户数据。

## 边界

- **始终**：按版本和平台分别记录；未取得如实标注；让基础设施和平台负责人按 RACI 共同复核发布证据。
- **先询问**：下载 N-1 浏览器、接入测试设备、修改矩阵范围或将未执行项降级为非阻塞。
- **禁止**：伪造安装/Android 通过、使用 User-Agent 分支代替特性检测、降低 V1 门禁而不经 ADR。

## 验收标准

1. 每次生产发布的记录可显示每个必测平台、版本和场景是否真的执行。
2. N-1、Android、原生安装或恢复演练缺失时，发布记录不能得出 V1 通过结论。
3. 桌面 N-1 和 Android N/N-1 的取得方式与浏览器矩阵一致。

## 开放问题

- Android 实测的具体自动化辅助方式尚未决定；它必须在取得设备后另立 ADR 或补充本规格，不能预先声称支持。

## 修订：发布通道（ADR-0030，2026-09-22）

[ADR-0030](../docs/adr/0030-desktop-release-channel.md) 把发布门禁拆成 `desktop` 与 `desktop+android` 两个通道。本规格中的必测范围与验收标准按通道解读：

- "范围"中列出的 Chrome Android N 与 N-1，只在 `desktop+android` 通道中是必测证据；`desktop` 通道的必测证据是 Chrome 桌面稳定版 N 与 N-1、原生安装和类生产环境恢复演练。
- "未取得的必测证据……不得被替代"指本次发布通道的必测证据。
- 验收标准 2 改为：本通道内 N-1、原生安装或恢复演练缺失时，发布记录不能得出 V1 通过结论；`desktop+android` 通道另外要求 Android N 与 N-1。
- `desktop` 通道的记录中，Chrome Android 各行填写"不在本通道"，并附已知的 Android 问题清单；该状态不得出现在其他任何位置。
- 桌面 N-1 可以使用 Google 官方的 Chrome for Testing 构建，通过 `PWA_HARNESS_CHROME_PATH` 运行。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。
