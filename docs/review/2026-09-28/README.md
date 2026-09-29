# PWA Platform 增量架构复审（2026-09-28）

对 [2026-09-27 审查](../2026-09-27/README.md)的增量复审。上一轮基线 `eb5836e`（npm 0.1.0），本轮基线 `ee85279`（`main`，npm 0.2.1 之后又合入 R9 修复与若干真机记录），共 101 个提交（含合并提交）。本轮**不从零重做**：只核对变化，并对上一轮给出的“已修复”状态逐条重新取证。

## 产物

| # | 产物 | 与上一轮的关系 |
|---|---|---|
| 1 | [行业对标增量](01-industry-benchmark-delta.md) | 只更新本平台一侧的格子；外部项目未重新调研 |
| 2 | [功能支持矩阵增量](02-feature-support-delta.md) | 无新增功能；列出行为细节、发布状态与证据等级的变化 |
| 3 | [测试与证据增量](03-evidence-delta.md)，以及更新后的[功能证据台账](../../operations/feature-evidence-ledger.md) | 本机全量实跑结果、台账逐行复核、应补入的真机记录、浏览器与设备覆盖总表 |
| 4 | [PC 端接入复核](04-pc-onboarding-delta.md) | 用 npm 0.2.1 从零接入一次；上一轮 10 个卡点逐条复核；配置项文档完整性表 |
| 5 | [场景语义复核](05-scenario-delta.md) | 8 个场景按当前代码重新推导，列出网站文档仍缺的 4 处（G1–G4） |
| 6 | [风险增量](06-risks-delta.md) | R1–R15 重新取证；新发现 N1–N7 |
| 7 | [改进建议增量](07-recommendations-delta.md) | 16 条，分三批 |

## 核心结论

1. **测试全绿，门禁可信。** 本机实跑：lint、typecheck 通过；单元测试 16 个包 2428 个用例、Chrome E2E 9 个包 277 个用例、新人接入冒烟 1 个用例全部通过；WebKit/Firefox 引擎冒烟 120 通过、10 跳过，与 CI（run 36417040999）一致。
2. **上一轮有 3 条“已修复”说得太满**：
   - **R4**：新加的必需检查集函数没有调用方（参考发布门禁已经严格检查覆盖，只是自带一份重复的清单，见 [#62](https://github.com/haigeerlab/pwa-platform/pull/62)）；
   - **R9**：修复在 0.2.1 发布之后才合入，npm 用户还拿不到；另外 `checkForUpdate()` 仍可能无限期挂起；
   - **R15**：两套开发者文档仍然并存。
   台账本身没有虚标等级，只有 4 处行号或描述过时，已随本轮更正。
3. **R9 的修复带进了一个 P2 回归（N1），已修复**：回访页面采用已有注册时，会漏掉正在安装的新版本，更新提示不出现。修复见 [#60](https://github.com/haigeerlab/pwa-platform/pull/60)（待合并）。R9 和 N1 都没有发布，用户不受影响。
4. **接入体验明显变好。** 只看文档、从零接入 npm 0.2.1 约 25 分钟，第一次构建即成功（上一轮约 1.5 小时）。上一轮 10 个卡点里 6 个已修复、3 个部分修复、1 个仍存在（C-7）。`vite preview` 默认加 `Vary: Origin` 的行为没有变，但现在文档写明了，控制台也会打印拒绝原因，不再静默失败。
5. **场景文档基本到位。** 上一轮列出的 8 条文档补充已落地 6 条；仍缺的 4 处都属于“少写了细节”，不是“写错了”（G1–G4）。
6. **证据短板仍是浏览器覆盖面**：
   - 桌面 Edge、Firefox 稳定版、iOS 上的非 Safari 浏览器都没有任何记录；
   - Android 两台真机都是 Chrome N，N-1 仍缺；
   - 正式的生产发布浏览器证据模板从未被填写过。

## 方法与可信度

| 环节 | 执行方 | 主会话如何复核 |
|---|---|---|
| 风险复核 | Claude 子代理（Opus，只读） | 亲自复现 R4、R9、R15 与 N1；N4 从“回归”降为文档问题（它是 spec 明文写下的取舍）；补充 N6（注释过时）和 N7（偶发失败） |
| 台账与测试实跑 | Claude 子代理（Sonnet） | 用 CI 记录交叉核对引擎冒烟；台账修改由另一个子代理执行，主会话审阅 diff：接受第 16、17 行升到 L4（第 17 行为部分），驳回第 13 行升 L4（真机只调用了原生 `registration.update()`，没有经过 `checkForUpdate()` 或定时检查） |
| 新人接入 | Claude 子代理（Sonnet，接入阶段只读网站文档） | 复现“仍存在”的 C-7 与 `origin` 字段文档缺口 |
| 场景语义 | Claude 子代理（Sonnet） | 复核 G1（`probes.ts:10` 固定 5 秒）与 G3（导航分支 `decide.ts:125` 与 E2E `runtime-cache.spec.ts:250`） |
| N1 修复 | 主会话 | 先写失败测试，再修复；差分验证；全量单元测试与相关 Chrome E2E |

**本轮局限**：没有重新调研外部项目；没有新增真机测试，L4 全部来自仓库已有记录；N2、N3 以及 R14 的 `onblocked` 路径只有代码推理，没有浏览器探针。

## 本次修改了什么

- 新增本目录；更新 `docs/operations/feature-evidence-ledger.md`。
- 另开 [#60](https://github.com/haigeerlab/pwa-platform/pull/60) 修复 N1（`packages/client-runtime`、ADR-0043 增补、CHANGELOG）。
- 没有改动 `website/` 和上一轮审查文件；上一轮文件中过时的结论，以本目录为准。

## 后续进展（2026-09-29）

[07 改进建议](07-recommendations-delta.md)的第一、二批已全部处理，改动随 npm **`0.2.3`** 发布（[发布记录](../../../tasks/package-distribution/release-0.2.3.md)；0.2.2 已准备但未发布）。上文及 02、06、07 中“待合并”“未发布”的表述指当时状态。

| 批次 | 处理 |
|---|---|
| 第一批 | N1 修复 [#60](https://github.com/haigeerlab/pwa-platform/pull/60)；R4 复核后降为“门禁自带清单与 `requiredReleaseChecks` 重复维护”，改为直接取用 [#62](https://github.com/haigeerlab/pwa-platform/pull/62)；N4、N6 与网站 5 处文档 [#63](https://github.com/haigeerlab/pwa-platform/pull/63) |
| 第二批 | R15 自绘更新提示迁入网站、R9 余项（`checkForUpdate()` 在卡住的更新任务后等待）按所有者决定写入文档 [#65](https://github.com/haigeerlab/pwa-platform/pull/65)；N7 未能复现，改为失败时保留 trace 并由 CI 上传 [#66](https://github.com/haigeerlab/pwa-platform/pull/66)；R14 [#67](https://github.com/haigeerlab/pwa-platform/pull/67)、N3 [#68](https://github.com/haigeerlab/pwa-platform/pull/68)、N2 [#69](https://github.com/haigeerlab/pwa-platform/pull/69) 均先以真实浏览器探针证实再修复 |
| 过程中新发现 | R14 的首版修复把等待上限设为 10 秒，示例应用 E2E 证明永不关闭的连接会让恢复激活等满上限，改为 3 秒；Chrome 自动请求 `/favicon.ico` 的偶发失败 [#70](https://github.com/haigeerlab/pwa-platform/pull/70)；N2 之后两个 flush 用例的引擎与时序假设 [#71](https://github.com/haigeerlab/pwa-platform/pull/71) |

第三批（证据覆盖）：iPhone 入口恢复余下三步已于 2026-09-29 补测通过；引擎冒烟已扩到 client-runtime 与 examples-browser-e2e（ADR-0042 增补）；Edge 冒烟已作为不阻塞的 CI 任务加入（ADR-0044）。Android N-1 与首份正式发布浏览器证据尚未取得。
