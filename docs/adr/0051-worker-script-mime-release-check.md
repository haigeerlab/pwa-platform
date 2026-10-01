# ADR-0051：worker 主脚本 MIME 纳入独立发布门禁

## 状态

已接受（项目所有者，2026-10-01）。扩展 [ADR-0014](0014-build-verification-boundary-and-report.md) 的检查集合与[发布门禁](../operations/release-and-incident-runbook.md#发布门禁)。

## 背景

[本地对照实验](../../tasks/examples-browser-e2e/header-causality-verification.md)中，同一 worker 的 `Content-Type: application/javascript` 可以注册并离线启动，`text/plain` 则被 Chrome 拒绝；现有 `response-headers` 只判断 `Cache-Control`，两者都通过。[Service Workers 规范](https://www.w3.org/TR/service-workers/#update-algorithm)要求 worker 脚本为 JavaScript MIME。

## 决策

- 新增 `worker-mime` 独立检查：只判断身份指定的 worker 主脚本实收 `Content-Type`。按 [MIME Sniffing 标准](https://mimesniff.spec.whatwg.org/#javascript-mime-type)的 JavaScript MIME 集合比较 essence，允许合法参数。
- `verifyRelease` 使用新的可选 `workerMimeObserved` 输入。省略时不执行，已有调用方报告不变；发布协议把新检查加入所有拓扑的必需集，缺失时覆盖判定不通过。
- 未观测到 worker 头复用 `verify.header-unreadable`；已观测但类型缺失或不合法，使用新的 `verify.worker-script-mime-invalid`，固定消息不回显实收值。
- 固定域名计划的调用方复用已有 worker 头观测；可移植计划复用该目标域名的 `deployment.responses`，不接受脱离目标域名的独立头输入。无需新增网络请求。`build-verifier` 保持纯函数。
- `Cache-Control: no-cache` 的发布规则保持不变。本次 Chrome 对 `max-age=0, must-revalidate` 的功能观察不足以证明跨共享缓存的等价语义；见 [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)。

## 备选方案

- 扩展 `response-headers`：会使已有调用方升级后直接出现新失败，静默收紧门禁，因此采用独立检查。
- 仅靠人工核对 MIME：已复现功能失败而机器门禁通过，人工步骤难以保证每次发布都覆盖。
- 只接受 `application/javascript`：会拒绝标准允许的 `text/javascript` 等类型，故按浏览器规范判断。

## 影响

contracts 增加一个 `verify.*` 诊断码；build-verifier 的检查名集合和可选输入增加；发布编排协议及 Cloudflare 核验工具须纳入新必需项。主脚本之外的导入脚本、manifest MIME 不在本检查覆盖范围。实现与验收见[模块规格](../../spec/build-verifier.md)和[计划](../../tasks/build-verifier/plan.md)。
