# ADR-0041：Apple 平台暂维持渐进兼容

## 状态

已接受（2026-09-27）。项目所有者确认 `0.1.x` 暂不新增 Apple 生产发布通道；本裁决不修改[浏览器矩阵](../architecture/browser-matrix.md)、[生产发布浏览器证据](../operations/browser-release-evidence.md)、首页或 README 现有的渐进兼容公开口径。

## 背景

[ADR-0030](0030-desktop-release-channel.md)目前只定义 `desktop` 与 `desktop+android` 两个生产发布通道；macOS Safari 与 iPhone Safari 都属于渐进兼容档。正式版验收已经在 Safari 18.6 与 iPhone 16 Pro / iOS 27.0 上取得了大量实证：Vue、React 的安装、独立窗口启动、真实 v1→v2、用户确认接管、显式刷新、离线更新、离线壳、默认离线页和联网恢复均有通过记录。

这些证据仍不足以建立 Apple 生产发布承诺：

- macOS Safari 与 iPhone Safari 是不同的运行环境、安装模型和窗口模型，一个平台的结果不能替代另一个平台。
- iPhone 从离线页恢复到线上内容后，页面曾显示 `not registered`；此时仍有同源 active worker 和 controller，但 `register()` / `registration.update()` 长时间不返回，退出主屏幕网页 App 后重开才恢复。
- iPhone 的“当前 Origin 单独失效、备用 Origin 可达”入口恢复分支尚未执行；真实 DNS／证书故障及移动端非法、过期清单矩阵也未闭合。
- 当前只有一组 iPhone 设备与系统版本证据，尚未定义 Apple 发布通道应采用的版本保留规则。

## 决定

- **0.1.x 暂不新增 Apple 生产发布通道。** 保留现有 `desktop` 与 `desktop+android` 通道；Safari（macOS、iOS）继续属于渐进兼容档，结果不阻塞这两个通道。
- **macOS Safari 与 iPhone Safari 分开记录。** 两者不是一个可互相替代的“Apple 通道”。每次兼容性观察分别记录浏览器／系统完整版本、设备、浏览器页与安装窗口，以及安装、更新、离线、入口恢复四类结果。
- **当前稳定版是观察范围，不是发布保证。** 在没有新通道前，两个 Safari 平台都只对验证当天的当前稳定版本给出逐场景事实，不从单一版本外推 N/N-1 或未来版本支持。
- **四类能力独立判定。** 安装与启动、更新生命周期、离线降级与联网恢复、入口恢复分别标为“通过”“部分通过”“失败”或“未执行”。渐进兼容结果不阻塞现有通道，但任何差异都必须进入兼容性说明；一个场景通过不能覆盖另一个场景的缺口。
- **`not registered` 差异不抹去已完成的离线恢复，也不算注册就绪通过。** 页面已从离线页自动回到线上内容，可以把“离线页联网恢复”记为通过；但 active worker/controller 存在而 SDK 仍显示 `not registered`、注册或更新调用挂起，应把“恢复后的注册与更新就绪”记为部分通过，并公开“退出后重开”的临时恢复方式。该差异在定性或修复并复测前，阻止 iPhone 晋级为生产发布通道。
- **公开文案继续维持“渐进兼容／部分通过”。** 首页、README、生产就绪审核和发布模板不得写成 Apple、Safari 或 iPhone 全功能生产门禁通过。

## 未来晋级条件

如后续要新增 Apple 发布通道，必须另写 ADR 接受具体通道，而不是直接把本提议改写成“通过”。新 ADR 至少要满足：

1. 为 macOS Safari 与 iPhone Safari 分别定义阻塞行；二者是否放在同一发布名称下，不影响逐平台独立通过。
2. 明确稳定版与上一版本的获取、设备／系统组合及保留策略；单一当前版本实测不能自动成为 N/N-1 保证。
3. Vue 与 React 在浏览器页和平台支持的安装窗口形态中完成安装、真实更新、物理断网冷启动、未缓存导航离线页、联网自动恢复和单 Origin 入口恢复。
4. iPhone 恢复联网后，SDK 注册状态和标准注册／更新调用在约定超时内稳定收敛；若决定接受 WebKit 差异，必须给出可检测条件、用户影响、降级行为和产品所有者明确签署。
5. 生产证据模板、浏览器矩阵、运行手册、首页与 README 同步更新，并对一次新的发布尝试取得完整证据。

## 备选方案

- **现在新增统一的 `desktop+apple` 通道。** 不采用：名字会掩盖 macOS 与 iPhone 的不同能力和未闭合项，也容易让一个平台的证据替代另一个平台。
- **现在分别新增 macOS Safari 与 iPhone Safari 通道。** 不采用：Mac 证据较完整，但 iPhone 注册就绪差异、入口恢复和版本策略仍未闭合；此时新增通道只会制造无法通过的公开承诺。
- **把现有单机结果直接视为 Apple 生产通过。** 不采用：真实观察证明特定设备可用，但不能代替版本矩阵、恢复边界和发布治理。

## 影响

- 已发布的十个 `0.1.0` 包与 `desktop` 通道结论不变，不需要运行时代码或公开 API 变更。
- Mac Safari 与 iPhone 的已通过场景继续作为有价值的兼容性证据；它们不会被删除，也不会被升级为发布门禁。
- iPhone 单 Origin 入口恢复、真实 DNS／证书故障和恢复后注册就绪仍是明确缺口。
- 本 ADR 的接受只表示“不新增 Apple 通道”的治理裁决完成，不表示 Apple 平台全功能通过。

## 证据

- 规格与计划：[stable-release-qualification](../../spec/stable-release-qualification.md)、[R5](../../tasks/stable-release-qualification/plan.md)
- 真机与浏览器记录：[正式版验收记录](../../tasks/stable-release-qualification/verification.md)
- 当前公开结论：[生产就绪审核](../product/production-readiness-audit.md)
- 既有通道规则：[ADR-0030](0030-desktop-release-channel.md)、[浏览器矩阵](../architecture/browser-matrix.md)
