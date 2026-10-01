# 响应头门禁修订设计（已批准并实施）

日期：2026-10-01。输入证据：[本地对照实验](header-causality-verification.md)、[发布响应头基线](../../docs/operations/release-and-incident-runbook.md#响应头基线)。项目所有者已批准，实施记录见[模块计划](../build-verifier/plan.md)。

## 决定一：保留 `no-cache` 的字面要求

本次 Chrome 154 在 `public, max-age=0, must-revalidate` 下能取到新版 HTML 和 manifest；这只证明所测浏览器、路径与观测时间内功能可用。现有 `response-headers`／`html-headers` 判它不通过，是**项目发布约定比这次功能观察更严格**，不是解析器错误。

[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)的区别：无参数的响应 `no-cache` 要求缓存每次复用前成功验证；`max-age=0` 指定零秒新鲜期，`must-revalidate` 只约束已过期后的复用；共享缓存的 `s-maxage` 可以覆盖 `max-age` 的新鲜期。因此不把这三个指令组合静默归一化成 `no-cache`。`REVALIDATED`、校验器单元测试和运维推荐值保持原样；报告解释“未通过门禁”和“本次功能失败”是两个不同结论。

## 决定二：增加 worker 主脚本 MIME 门禁

对照实验已证明，同一份 worker JavaScript 在 `Content-Type: application/javascript` 下可注册并离线启动，在 `text/plain` 下浏览器拒绝注册、离线启动失败，而当前 `response-headers` 两者都通过。[Service Workers 规范](https://www.w3.org/TR/service-workers/#update-algorithm)要求主脚本响应的 MIME 为 JavaScript MIME；允许值按 [MIME Sniffing 标准](https://mimesniff.spec.whatwg.org/#javascript-mime-type)的集合判断，忽略合法参数，例如 `; charset=utf-8`。推荐运营配置 `text/javascript`；现有 `application/javascript` 也属于可接受集合。

采用与已交付 `html-headers` 相同的兼容模式：

| 项目 | 决定 |
|---|---|
| 独立检查 | `verifyWorkerScriptMime(plan, observed)`，结果名 `worker-mime`；只检查 `plan.identity.serviceWorkerUrl` 的实收 `Content-Type`。 |
| `verifyRelease` 输入 | 新增可选 `workerMimeObserved?: PwaObservedResponses`。省略时不运行；调用方可把原来采集的 `observed` 同一对象传入，不再发第二次请求。 |
| 缺少整个路径的观测 | 复用 `verify.header-unreadable`。 |
| 路径已观测，但 MIME 缺失、非法或非 JavaScript | 新增 `verify.worker-script-mime-invalid`，错误路径为 `/identity/serviceWorkerUrl`；固定消息，不回显实收值。 |
| 报告和发布协议 | `VERIFICATION_CHECKS` 末尾追加 `worker-mime`；`requiredReleaseChecks` 及运维手册所有拓扑的必需集纳入它。旧调用方不传新属性时既有检查输出不变，但使用完整必需集的发布系统须升级采集与判断。 |
| Cloudflare 测试站工具 | 已采集 worker 的响应头；组装报告时将同一 `observed` 传给 `workerMimeObserved`，保存既有证据字段，不扩大线上采集范围。 |

范围只覆盖 worker 主脚本。导入脚本的路径和响应头目前不在 `PwaPlan` 的可判定集合中；若要覆盖，应另立范围与采集契约。manifest 的 `Content-Type` 及 `Service-Worker-Allowed` 也不在本次增量内，不能在发布报告里声称已检查。

## 验收与迁移

1. 单元测试：`text/javascript`、`application/javascript`、合法 `charset` 参数通过；`text/plain`、缺失/非法 MIME 失败；路径未观测单独报 `verify.header-unreadable`；诊断不回显头值。
2. 兼容测试：不传 `workerMimeObserved` 的既有 `verifyRelease` 报告逐字节不变；传入后 `worker-mime` 仅出现一次、顺序位于末尾；覆盖校验能指出缺失的新必需项。
3. 浏览器正反例沿用 `header-causality.spec.ts` 的 worker MIME 组；断言 `worker-mime` 正例通过、反例失败，同时保留 `response-headers` 只判缓存头的独立事实。
4. Cloudflare 工具单元测试证明复用已采集的 worker 头、错误 MIME 会挡住发布；原始 `facts.json` 保留报告和覆盖结果。执行 `contracts`、`build-verifier`、示例浏览器 E2E、发布工具测试、类型检查与包导出检查。

本增量新增 `verify.*` 诊断码，并改变公开检查名集合和生产发布的必需检查清单。项目所有者依据 [build-verifier 规格](../../spec/build-verifier.md#边界)“先询问”条款批准后，已修订模块规格、计划与 [ADR-0051](../../docs/adr/0051-worker-script-mime-release-check.md) 并实施代码；执行结果见[对照实验记录](header-causality-verification.md)。
