# ADR-0032：公开 HTML 的响应头纳入机器发布门禁

## 状态

已接受（2026-09-22）。扩展 [ADR-0014](0014-build-verification-boundary-and-report.md) 的检查集合，并修订[发布与事故处置手册](../operations/release-and-incident-runbook.md#发布门禁)中各拓扑的 `requiredChecks`（[ADR-0025](0025-release-gate-completeness-and-external-orchestration.md) 规定必需集由外部发布协议决定）。

## 背景

响应头基线要求公开 HTML 的 `Cache-Control` 包含 `no-cache`、不含 `immutable`。HTML 被长期缓存时，用户会停留在引用旧指纹资源的旧应用壳上，更新迟迟不生效，严重时白屏；页面新旧判断也依赖取到最新的应用壳。

`build-verifier` 的 `response-headers` 检查只判断 worker、manifest 与带指纹资源，公开 HTML 一直只能人工核对。Cloudflare 测试站的上线后与上线前核验、桌面发布演练都把它记为缺口。

`@pwa-platform/build-verifier` 已发布到 npm，业务发布系统通过 `verifyRelease` 使用它。任何检查范围的扩大都会影响所有调用方。

## 决策

- **新增独立检查 `html-headers`**，由新的可选输入 `htmlObserved` 驱动：省略即不执行，与 `baseline`、`retention` 的约定相同。`response-headers` 的行为不变。
- **公开 HTML 路径由计划推导**：`identity.mountPath`、`install.startUrl`、启用时的 `offlineFallback.path`，以及预缓存中带 revision 的 `.html` 条目。
- **所有拓扑的 `requiredChecks` 加入 `html-headers`。** 调用方升级 `build-verifier` 本身不会改变结果；只有按新协议声明必需集时，缺少 HTML 观测才会因覆盖不完整而不通过。
- **不检查私有 HTML。** 平台资源分类中没有"私有 HTML"，计划无法判断；该行继续由人工核对。
- 调用方采集 HTML 响应头时应跟随同源重定向，记录最终响应的头；这属于调用方的采集规则，`build-verifier` 仍零网络。

## 备选方案

- **扩展 `response-headers` 覆盖 HTML。** 不采用：尚未采集 HTML 的调用方升级后会立即出现 `verify.header-unreadable`，门禁被静默收紧。
- **只在手册中要求人工核对。** 不采用：这正是当前的缺口，人工核对不可审计、容易遗漏。
- **只检查应用入口。** 不采用：离线页与启动地址同样会被浏览器与 CDN 缓存，且都能从计划中确定地推导出来。

## 影响

- 发布系统要为公开 HTML 路径采集响应头，并在 `requiredChecks` 中加入 `html-headers`；未采集时覆盖判定会指出缺少该检查。
- Cloudflare 测试站的核验工具需要另行修订以提供 `htmlObserved`。
- 私有 HTML 的 `private, no-store` 仍无机器检查；若将来资源分类引入私有页面，再以新的 ADR 扩展。
- 规格见 [spec/build-verifier.md](../../spec/build-verifier.md) 的"修订：公开 HTML 响应头检查"。
