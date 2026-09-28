# 01Δ · 行业对标增量

上一轮：[01-industry-benchmark.md](../2026-09-27/01-industry-benchmark.md)（8 个对标对象，基线 `eb5836e`）。

## 范围

距上一轮只有一天，**本轮没有重新调研外部项目**，对标对象的格子沿用上一轮（当时查不到的仍记 ❓）。只更新本平台一侧因代码和证据变化而改变的格子。

## 本平台一侧的变化

| 维度 | 上一轮写法 | 现在 | 依据 |
|---|---|---|---|
| UI 多语言 | 🔧 更新提示只有中文默认文案，通过 `messages` 覆盖 | ✅ 更新提示内置 zh-CN 与 en，用 `locale` 选择（默认 `zh-CN`），`messages` 可在其上逐条覆盖；离线页、恢复页与之前一样内置两种语言 · L3 | `packages/react/src/ui.ts`、`packages/vue/src/ui.ts`；`update-notice.spec.ts` 的 `locale "en"` 用例；ADR-0039 增补 |
| UI 主题 | 🔧 | 不变：更新提示仍无内置主题切换，靠 `colors` 与 CSS 变量 | — |
| 兼容性声明 | 自动化只覆盖 Chrome 桌面 | Chrome 桌面仍是唯一**阻断**的自动化浏览器；新增 WebKit 引擎与 Firefox（Playwright 固定版本）的**不阻断**冒烟，只覆盖 sw-runtime，120 通过 / 10 跳过 | ADR-0042；GitHub Actions run 36417040999；本轮本机重跑一致 |
| 移动端证据 | 一台 Android、一台 iPhone，集中在两天 | 两台 Android（小米、三星，均为 Chrome N）、iPhone 16 Pro（React、Vue 各一轮，另有 R9 复核与入口恢复的部分演练）；**Android N-1 仍缺** | [03 证据增量](03-evidence-delta.md) (c) |
| 身份不可变 | 门禁默认可跳过（R4）· L2 | 比上一轮判断的好：参考发布门禁本来就检查覆盖率并要求 baseline；直接调用 `verifyRelease` 时空报告仍为 `ok`（API 注释写明的设计）· L2 | [06 风险增量](06-risks-delta.md) R4 |
| 更新机制 | 只有提示更新 · L4 | 不变。回访时的注册状态修复（R9）与其后续 N1 都**尚未发布** | 同上 R9、N1 |

## 结论变化

- 上一轮建议 #9“更新提示的 locale 切换与内置英文”已落地，对应缺口（对照 Progressier 托管 UI）关闭。
- 其余优势、缺口与有意取舍的判断不变。浏览器覆盖面仍是与成熟项目相比最明显的证据短板：Edge、Firefox 稳定版、iOS 上的非 Safari 浏览器都没有任何记录。
