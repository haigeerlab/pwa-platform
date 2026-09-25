# ADR-0030：桌面端发布通道

## 状态

已接受（2026-09-22）。同日经独立评审后，由项目所有者补充了通道锁定、状态限制与 Android 措辞三条规则（见决策末三条）。修订 [ADR-0025](0025-release-gate-completeness-and-external-orchestration.md) 中"真实浏览器证据齐全"的范围，以及[浏览器矩阵](../architecture/browser-matrix.md)中必测档阻塞发布的方式。不改变 [ADR-0010](0010-real-browser-verification-with-playwright.md) 的运行方式。

## 背景

浏览器矩阵把 Chrome 桌面端和 Chrome Android 的 N 与 N-1 都列为必测档，任何一项失败或未执行都会阻塞发布。截至 2026-09-22，桌面端的代码与自动化测试已经齐全，示例套件也已在 Chrome 152（N-1）下跑过一次（`tasks/cloudflare-test-deployment/verification.md` 的"2026-09-21：桌面 Chrome N-1 门禁"）。Android 方面，项目只有一台实体设备（Chrome 152）：Vue 示例的原生安装已在上面通过，React 示例没有取得安装事件，Chrome Android N 从未取得（`tasks/examples-browser-e2e/verification.md` 的 T13、T14）。按规则，Android 的 N 与 N-1 需要两台关闭自动更新、只从 Google Play 更新的设备轮换取得，一台设备满足不了。结果是整个 v1 被一个与桌面端无关的条件挡住。

项目所有者决定优先打通 PC 链路，先按桌面端发布。

## 决策

- **发布门禁分为两个通道：`desktop` 与 `desktop+android`。** 每次生产发布必须在发布证据中声明通道。
- **`desktop` 通道的必测范围是 Chrome 桌面端的 N 与 N-1。** 包括 V1 验收矩阵的全部场景、Vue 与 React 示例的原生安装记录，以及恢复演练。桌面端的要求一项都不降低。
- **Android 在 `desktop` 通道中填写"不在本通道"。** 这不是"通过"，也不算"未执行"；证据模板必须区分这三种状态。
- **`desktop` 通道发布后，Android 未经验证，不做任何保证。** Web 应用无法阻止 Android 用户访问，但 `desktop` 通道不在 Android 上做任何检查，所以不能承诺任何行为，包括基础网页体验。对外说明与 README 必须写明"未验证、不保证"，不得声称支持 Android。
- **`desktop+android` 通道就是原来的完整门禁。** 首次以该通道发布之前，平台不得声称 Android 已受支持。
- **通道在发布尝试创建时确定，之后不可更改。** 通道由发布负责人决定，写入该发布尝试的记录。要改通道，就要作废当前尝试、另建一个新的发布尝试，已取得的结果不能沿用为新尝试的"通过"。首次以 `desktop+android` 通道发布之后，再退回 `desktop` 通道需要新的 ADR，并同时撤回 README 与对外说明中的 Android 支持声明。
- **`desktop` 通道的证据必须附已知的 Android 问题清单。** 例如 React 示例在 Android 上未取得安装事件（`tasks/examples-browser-e2e/verification.md` 的 T14）。每一项附 Issue 或记录链接；清单为空时写"无已知问题"。
- **"不在本通道"只允许出现在 `desktop` 通道的 Chrome Android 行。** 桌面行、`desktop+android` 通道的任何行，以及原生安装与恢复演练，出现该状态时结论一律为未通过。

## 备选方案

- **维持原门禁，等 Android 设备到位。** 不采用：桌面端已经就绪，却因为一个与它无关的条件无限期阻塞。
- **把 Android 降为参考档。** 不采用：这会永久降低要求。拆分通道只是改变发布顺序，Android 的要求保持不变。
- **用 Android 模拟器代替实体设备。** 不采用：ADR-0010 已经说明，Playwright 的 Android 支持会忽略离线等上下文选项，可能误报通过；而且 N-1 的获得方式与设备轮换规则冲突。

## 影响

- **Android 用户在 `desktop` 通道期间没有任何保证。** 安装、离线、推送乃至基础网页体验在 Android 上都未经验证；业务方需要知道这一点。README 与对外说明必须写明支持范围。
- **证据模板与运行手册要能区分通道。** "浏览器证据闭合"按通道判定。
- **机器发布门禁不变。** `requiredChecks` 与浏览器通道无关，build-verifier 不需要修改。
- **改变任一通道的必测范围、允许在没有 Android 证据时声称支持 Android、或新增其他通道，都需要新的 ADR。**
- 规格见 [spec/platform-governance.md](../../spec/platform-governance.md) 的"修订：桌面端发布通道与本地门禁替代 CI"，实现计划见 [tasks/platform-governance/plan.md](../../tasks/platform-governance/plan.md) 的 D1–D6。
