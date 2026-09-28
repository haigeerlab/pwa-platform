# 04 · PC 端接入体验审查

## 方法

2026-09-27，由一名“首次接入者”（子代理）完成一次实操：只能读 README、`website/` 和 `docs/guides/`，不许靠读 `packages/*/src` 来弄清怎么用。它在仓库之外新建了一个 Vite 项目，从 npm 安装已发布的 `0.1.0` 包完成接入，再用 Playwright 驱动 Chromium 做真实浏览器验证。接入中发现的卡点，由主会话复核代码或复现确认。本文另外逐段核对了[按功能接入](../../../website/guide/integration-by-capability.md)页面的说法与代码是否一致。

| 项目 | 取值 |
|---|---|
| 环境 | macOS、Node 24.18.0、npm 11.16.0、Vite 8.3.1、React 19.2.8 |
| 安装的包 | `@pwa-platform/react@0.1.0`、`@pwa-platform/vite@0.1.0`、`@pwa-platform/contracts@0.1.0`（npm `latest` 与文档一致） |
| 耗时 | 约 1.5 小时（含 4 轮构建验证，以及排查一个高严重度卡点） |
| 结论 | **最小接入成功，第一次构建即通过**；可选的更新提示、public-read 缓存也都跑通；没有阻断级卡点 |

## 结论摘要

文档整体质量**高于同类项目**。入口清晰（README → 文档站首页“接入自己的系统” → 选包 → React 接入页，共 3 跳）；`vite dev` 不生成 worker、必须 `build` 后再 `preview` 验收这条边界反复强调；更新两阶段（worker 接管 与 页面刷新）讲得很细，实测行为和文档完全吻合。[按功能接入](../../../website/guide/integration-by-capability.md)页面已经提供了“按能力逐层开启”的最小配置，这正是本次审查希望看到的形式。

问题集中在三类：

1. **本地验收环境与文档规则冲突，而且失败时没有任何提示**（C-1、C-2）。开发者照着文档做，会得出错误结论。
2. **“默认会怎样”写得不够具体**：单页应用深层路由离线、服务器返回 4xx/5xx、网络恢复后的行为、多标签页，这几种情况文档都没有明说（C-3 至 C-6）。
3. **个别字段只出现在示例里，正文没有解释**（C-8、C-9）。

## 卡点清单

严重度含义：阻断 = 无法继续；高 = 会得出错误结论且无从排查；中 = 需要试错；低 = 有歧义，但照抄示例就能过。

| # | 严重度 | 类型 | 文档位置 | 现象 | 证据与根因 | 建议 |
|---|---|---|---|---|---|---|
| C-1 | **高** | 文档与行为不一致、失败无提示 | [checklist.md:16](../../../website/start/checklist.md#L16) 推荐用 `vite preview` 验收；[public-read-cache 准入条件](../../../website/guide/public-read-cache.md) 要求 `Vary` 为空或只含 `Accept`／`Accept-Encoding` | 其他准入条件全部满足，断网后仍拿不到数据；Cache Storage 里根本没有 `runtime-data-*`；构建、控制台、日志都没有报错 | **主会话已复现**：Vite 8.3.1 的 `vite preview` 给每个响应都加上 `Vary: Origin`；[admit.ts:64-70](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/admit.ts#L64) 因此静默拒绝写入 | 在 public-read-cache 页和验收清单中写明这个陷阱及绕过方法；长期可在开发构建中打印准入拒绝原因（建议 #4） |
| C-2 | 中 | 隐含前提 | [checklist.md](../../../website/start/checklist.md) 首次核验第 2 步“保持在线刷新一次” | worker 刚变为 `activated` 就立刻刷新，`navigator.serviceWorker.controller` 仍为 `null`；约 2 秒后再刷新才受控 | 平台 worker **从不** `clients.claim()`（[handlers.ts:41](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/handlers.ts#L41) 的注释写明），首次打开的页面永远不受控；刷新时如果激活还没完成，新页面也不受控 | 把“刷新一次”改为“等 worker 状态变为 `activated` 后再刷新”，并说明这是有意设计 |
| C-3 | 中 | 默认行为没写清 | [按功能接入 路径三](../../../website/guide/integration-by-capability.md#L122) | 用 history 路由的单页应用，没开离线页时，断网直接打开 `/users/42` 会得到浏览器的网络错误页，不会回退到应用壳 | 导航候选只有：原 URL → 去掉查询串 → 同目录 `index.html` → 离线页（[decide.ts:166-173](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/decide.ts#L166)），**没有根应用壳兜底**。这是 ADR-0012 的有意取舍 | 页面第 10 行“不会自动得到：任意业务路由离线可用”要展开：写明深层路由断网时的表现，并建议单页应用同时开启离线页。从 vite-plugin-pwa 迁移过来的开发者最容易踩到（对方有 `navigateFallback`） |
| C-4 | 中 | 默认行为没写清 | [按功能接入 路径四](../../../website/guide/integration-by-capability.md#L140)、[离线体验](../../../website/guide/offline.md) | 服务器返回 500 或 404 时，用户看到的是服务器的错误页，而不是离线页 | 离线页只在网络失败或超时时才使用；只要收到响应（包括 4xx/5xx），就原样返回 | 写明“离线页不是服务器故障页”；源站整体不可用属于入口恢复页的职责 |
| C-5 | 中 | 缺失 | 全站没有对应章节 | 网络恢复后应用会不会自动重试或刷新？文档没写 | 平台**不提供**在线／离线状态 API（client-runtime、vue、react 中都 grep 不到）；只有平台默认离线页自己带 `online` 事件监听和连通性探测，会自动重试（[offline-page.ts:60](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vite/src/offline-page.ts#L60)）；应用页面不会收到任何通知 | 补一节“断网与恢复”：无需配置；停在离线页上时会自动探测并重试；应用内请求需要业务自己处理重试 |
| C-6 | 低 | 缺失 | 全站没有对应章节 | 多标签页要不要配置？一个标签页点了更新，其他标签页会怎样？ | 无需配置。每个标签页各自观察浏览器的 `controllerchange`，一处确认后，所有同 scope 标签页的提示都会清除；**页面都不会被刷新**（[update.spec.ts:56](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/examples-browser-e2e/browser-tests/update.spec.ts#L56)，L3） | 在更新页补一段，并提醒：其他标签页里运行的仍是旧版前端代码，已经交给新 worker 控制，业务要自行判断何时刷新 |
| C-7 | 中 | 报错无排查指引 | [troubleshooting.md](../../../website/guide/troubleshooting.md)“有新部署但没有更新提示” | 在控制台对 `getRegistration()` 拿到的对象直接调用原生 `update()`，抛出 `InvalidStateError` | 已观察到，根因**未确认** | 排查页写明应使用 `checkForUpdate()`，并解释这个报错 |
| C-8 | 低 | 配置未说明 | [configuration.md:24](../../../website/guide/configuration.md#L24) | `cacheNamespaceSeed: "r1"` 只出现在示例里，正文没有解释用途、取值规则和改动后果 | 它决定缓存命名空间，ADR-0009 规定身份迁移时要换新值 | 在正文补一行：什么时候改、改了会发生什么（旧缓存被清理） |
| C-9 | 低 | 隐含前提 | [configuration.md:18](../../../website/guide/configuration.md#L18) 的示例 `origin: "https://app.example.com"` | 本地用 `vite preview` 时，`origin` 该填生产域名还是 `http://localhost:4173`？文档没说 | 子代理填了 localhost，一切正常；worker 的路由用的是它自己所在页面的 origin（[handlers.ts:51](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/handlers.ts#L51)），与 `identity.origin` 无关。身份契约规定“每个环境是独立的身份”（[identity.ts:12](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/contracts/src/identity.ts#L12)） | 写明本地验收应使用独立的 `environment` 身份，还是直接复用生产身份 |
| C-10 | 低 | 措辞易误读 | [按功能接入 第 9 行](../../../website/guide/integration-by-capability.md#L9) | 表格把 `updateMode: "prompt"` 列为“增加用户确认更新”才要配置的项 | `UPDATE_MODES = ["prompt"]`（[policy.ts:25](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/contracts/src/policy.ts#L25)），它是**所有**策略的必填项，而且只有这一个合法值；路径一里其实已经写了 | 改为“所有路径都必填，目前只支持 prompt” |

## 逐项评估（对应审查要求）

| 审查项 | 结论 |
|---|---|
| 能否顺利找到正确入口 | ✅ 3 跳。小瑕疵：README 首屏没有直接给出“选择接入包”的链接 |
| 安装和初始化步骤是否完整 | ✅ 版本号、peer 范围、`tsconfig` 的 `virtual` 类型声明都写到了 |
| 最小接入能否实际执行成功 | ✅ 第一次构建即通过，真实浏览器中 manifest、注册、scope、离线应用壳、离线页全部通过 |
| 每个配置项是否说明了用途、默认值和行为 | ⚠️ 大部分字段写得很清楚（取值范围、“三项都没有默认值”这类措辞都有），`cacheNamespaceSeed` 例外（C-8） |
| 配置之间的依赖、冲突与隐含前提 | ⚠️ 离线页需要同时改三处（策略、资产规则、插件），文档写清了；遗漏了本地服务器响应头（C-1）、`clients.claim`（C-2）和 origin 与环境的关系（C-9） |
| 开发、构建、部署、更新流程是否清楚 | ✅ 两阶段更新、恢复 worker 的发布流程都有专门章节 |
| 常见失败有没有排查方法 | ⚠️ 排查页覆盖了 manifest 冲突、离线页缺失、注册失败、安装按钮不出现；**没有覆盖“满足所有条件却没进缓存”这类静默失败**，平台也没有诊断输出 |
| 文档描述与代码、实际行为是否一致 | ⚠️ 没有发现事实错误；有 4 处默认行为没有写出来（C-3 至 C-6）。另外规格与代码有一处不一致，影响的是缓存安全而不是接入体验，见[风险清单 R1](06-architecture-risks.md) |

## 文档结构问题（维护视角）

- **开发者文档分布在两套目录里**：`website/`（VitePress 文档站）和 `docs/guides/`（仓库内指南）。例如入口恢复的完整说明，只能从文档站跳到 GitHub 上 `main` 分支的 `docs/guides/entry-recovery-integration.md`（[integration-by-capability.md:249](../../../website/guide/integration-by-capability.md#L249)），离线页、更新提示等主题在两边各有一份。随着版本演进，两边内容容易不同步，而且站内链接会指向未发布的 `main` 分支内容。建议明确哪一套是面向接入者的唯一来源。

## 可复现材料

接入项目和验证脚本保存在本次会话的临时目录，没有提交进仓库。如需长期复现，建议把最小接入过程做成 `examples/` 下的“新人接入冒烟”用例（建议 #6）。
