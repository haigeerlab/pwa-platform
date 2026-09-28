# 06 · 架构与代码风险清单

## 2026-09-28 状态

下文风险表保留审查当时（2026-09-27）的判断；处理结果以本节为准。所有修复均已合入 `main`，合并后 `main` 上的 CI（Quality × 2、Browser、引擎冒烟、FCM 联网套件）全部通过。

| # | 状态 | 处理 |
|---|---|---|
| R1 | ✅ 已修复 | 带 `Authorization` 的导航不再进入运行时缓存。新增的 Chrome E2E 在修复前失败，证明这条路径在真实浏览器中可以触发，原先的降级理由不成立（[#27](https://github.com/haigeerlab/pwa-platform/pull/27)） |
| R2 | 📝 已登记为限制 | worker 按 Fetch 规范读不到 `Set-Cookie`，原建议无法实现；ADR-0035 已把它定为业务责任，文档已有警告。后续候选：在 build-verifier 中检查服务端采集的响应头 |
| R3 | ✅ 已修复 | 新增诊断码 `identity.scope-outside-worker-directory`，从构建期拒绝（[#27](https://github.com/haigeerlab/pwa-platform/pull/27)） |
| R4 | ✅ 已缓解 | ADR-0025 与发布编排协议早已规定必需检查集，审查时高估了风险；新增 `requiredReleaseChecks(plan)`，消除手写清单出错的可能（[#29](https://github.com/haigeerlab/pwa-platform/pull/29)） |
| R5 | ✅ 已修复 | 同一会话绑定的离线写入 `flush` 单飞；修复前真实浏览器中同一幂等键被 POST 两次（[#30](https://github.com/haigeerlab/pwa-platform/pull/30)；该包尚未发布） |
| R6 | ✅ 已缓解 | 测试服务器改为服务器端断网（[#34](https://github.com/haigeerlab/pwa-platform/pull/34)）；WebKit 与 Firefox 引擎冒烟以不阻断方式进入门禁和 CI（ADR-0042，[#37](https://github.com/haigeerlab/pwa-platform/pull/37)）。Chrome 仍是唯一阻断的浏览器，引擎冒烟结果不代表 Safari |
| R7 | ✅ 已修复 | 工作区测试不再在首个失败处中止；release-tools 集成测试超时放宽（[#28](https://github.com/haigeerlab/pwa-platform/pull/28)） |
| R8 | ✅ 已修复 | 准入拒绝时 worker 以 `console.warn` 报告原因与路径（[#27](https://github.com/haigeerlab/pwa-platform/pull/27)） |
| R9 | ⏳ 未解决 | iPhone 断网恢复后显示 `not registered`；ADR-0041 把它定为 iPhone 晋级生产通道的阻断条件，需要真机定位根因 |
| R10 | ✅ 已解决 | ADR-0041 裁定“离线页联网恢复”通过（[#25](https://github.com/haigeerlab/pwa-platform/pull/25) 真机证据） |
| R11 | ⏳ 未处理 | 纵深防御项，优先级 P3 |
| R12 | ✅ 已修复 | worker 启动时统一注册配额清理，不依赖引擎是否已创建（[#41](https://github.com/haigeerlab/pwa-platform/pull/41)）。只有单元测试，真实浏览器中耗尽配额的用例列为后续 |
| R13 | 📝 已文档化 | 保持 `vue: ^3.4.0`，在 Vue README、接入页和 Vue 3.4 接入作业单中标注（[#38](https://github.com/haigeerlab/pwa-platform/pull/38)） |
| R14 | ✅ 已查明 | 已受控页面确实在清理完成前被接管，但恢复 worker 不拦截请求，不构成安全缺陷；ADR-0012 增补澄清措辞，新增 2 个用例（[#39](https://github.com/haigeerlab/pwa-platform/pull/39)）。删除失败的场景需要专门的测试构建，列为后续 |
| R15 | ✅ 已修复 | `website/` 成为唯一对外文档来源；合并时漏掉的 12 个诊断码经只读核验发现，合并前已补回（[#38](https://github.com/haigeerlab/pwa-platform/pull/38)） |

### 修复过程中新发现的问题

| # | 问题 | 处理 |
|---|---|---|
| N1 | 更新提示的 UI 测试套件和 FCM 联网套件不在任何门禁里，证据台账却引用前者作为 L3 证据 | UI 套件进入阻断门禁，联网套件以不阻断方式运行（[#36](https://github.com/haigeerlab/pwa-platform/pull/36)、[#37](https://github.com/haigeerlab/pwa-platform/pull/37)） |
| N2 | UI 测试把截图写到只在 macOS 上存在的 `/private/tmp`，第一次在 Linux CI 上运行就失败 | 改用 Playwright 的输出目录（[#37](https://github.com/haigeerlab/pwa-platform/pull/37)） |
| N3 | 叠加 PR（#35、#36）合进了中间分支，改动没有进入 `main` | 用 [#37](https://github.com/haigeerlab/pwa-platform/pull/37) 补合；此后的 PR 一律以 `main` 为目标 |
| N4 | 新人接入冒烟的离线安装依赖本机 store 里恰好有的版本，在 CI 的全新 store 上失败 | 改用根 lockfile 锁定整个依赖闭包，并沿用根目录的构建脚本批准规则；已用空 store 复现并验证（[#40](https://github.com/haigeerlab/pwa-platform/pull/40)） |
| N5 | 规则集要求 PR 与 `main` 同步，每合并一个 PR，其余 PR 都要整轮重跑 CI | 关闭该要求，CI 改为合并后在 `main` 上重跑，不阻断的 job 移出 PR 触发（[#42](https://github.com/haigeerlab/pwa-platform/pull/42)） |
| N6 | 证据台账推送一行误写“从未经真实推送服务投递”，实际 FCM 联网套件早已跑通 | 已更正（[#36](https://github.com/haigeerlab/pwa-platform/pull/36)） |

## 来源与判定

风险有两个独立来源：

1. **Codex**（gpt-5.6-sol，推理档 high）：只读审查，覆盖 13 个维度。
2. **Claude 子代理**：场景语义、证据台账、新人接入三路调研中顺带发现的问题。

每条风险都由主会话回到代码核对过，判定分两级：**已确认**（代码能直接证明）、**待验证**（有依据，但需要浏览器实验或故障注入才能下结论）。严重度按实际触发的可能性调整过，与 Codex 原始评级不同的地方会注明。

| 严重度 | 含义 |
|---|---|
| P0 | 会造成数据泄露或大面积不可用，而且很容易触发 |
| P1 | 违反平台安全承诺或核心验收标准，存在现实的触发路径 |
| P2 | 与契约或规格不一致，或者会静默失败，但触发条件较窄 |
| P3 | 属于纵深防御、可维护性或已登记的限制 |

**本次没有发现 P0 或 P1。**

## 风险表

| # | 严重度 | 维度 | 标题 | 证据 | 触发条件与后果 | 测试覆盖 | 判定 | 投入 |
|---|---|---|---|---|---|---|---|---|
| R1 | P2（Codex 评 P1；已修复，见 PR #27） | 缓存准入 · 安全 · 一致性 | `navigation-public-dynamic` 导航不检查 `Authorization` | [decide.ts:118-127](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/decide.ts#L118) 的导航分支没有检查；数据分支有（[decide.ts:137](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/decide.ts#L137)）。规格 [public-read-cache.md:95](../../../spec/public-read-cache.md#L95) 和 ADR-0012 的增补都写着“带 `Authorization` 的请求透传” | 被标为公共动态页的路径，如果请求带了 `Authorization` 头、响应又没标 `private` 或 `no-store`，就可能被缓存。**更正（2026-09-28）**：原先降级的理由是“SW 里一般看不到导航的 `Authorization`”，经 E2E 实测不成立：通过 CDP 额外请求头（扩展、代理注入的也在这一层）加上的 `Authorization`，Chrome 会原样交给 SW，页面随后被写入 `runtime-pages` 缓存。维持 P2 只是因为它仍需要业务把路径标为公共动态页。已在 [PR #27](https://github.com/haigeerlab/pwa-platform/pull/27) 修复 | 测试反而把这个行为固定了下来：[decide.test.ts:346](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/test/worker/decide.test.ts#L346) | 已确认（与规格不一致） | S |
| R2 | P3（原评 P2，2026-09-28 更正） | 缓存准入 · 安全 | 带 `Set-Cookie`、但没标 `private` 的响应会被 public-read 缓存 | [runtime-cache.spec.ts:163](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/browser-tests/runtime-cache.spec.ts#L163)；[ADR-0035](../../adr/0035-explicit-public-read-runtime-cache.md) 探路 1 | 业务把某个会下发会话 Cookie 的接口误标为 `public-data` 时，响应体会被缓存下来，再提供给其他会话。**更正**：`Set-Cookie` 是 Fetch 规范的 forbidden response header，worker **读不到**它，因此原建议“在 worker 中默认拒绝”无法实现；ADR-0035 已把它定为业务责任（此类路径必须带 `Cache-Control: private`），[公共读取缓存](../../../website/guide/public-read-cache.md)页面已有醒目警告 | L3 测试固定了当前行为 | 已登记的限制，不改代码 | — |
| R3 | P2（Codex 评 P1，根因定位不同；已修复，见 PR #27） | SW 注册与 scope | 身份契约没有检查“scope 不能超出 SW 脚本所在目录” | [validate.ts:451](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/contracts/src/validate.ts#L451) 只检查 SW 地址在 scope 之下；仓库里没有任何地方提到 `Service-Worker-Allowed` 头；Vite 不要求 `base` 等于 `mountPath`（[host-output.ts:101-124](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vite/src/host-output.ts#L101)），Nuxt 则要求相等（[artifacts.ts:98](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/nuxt/src/artifacts.ts#L98)） | 比如 `scope=/app/`、`serviceWorkerUrl=/app/assets/sw.js`，契约校验和构建都能通过，浏览器却拒绝注册，应用完全失去 PWA 能力。好在第一次真实访问就会暴露，不会损坏数据 | 无 | 已确认 | S |
| R4 | P2 | 身份不可变 | 发布校验的输入缺省即跳过，报告为空也算 `ok` | [release.ts:48-79](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/build-verifier/src/release.ts#L48) 的注释写明“an empty report `ok: true`”；[release-gate.ts:13-37](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/build-verifier/src/release-gate.ts#L13) 把覆盖检查交给调用方组合 | 集成方只看 `ok`、没有传 `baseline`，身份的九个字段就可能在不知情的情况下漂移，留下旧注册、旧缓存和旧队列。“身份不可变”这条平台的核心承诺，实际上取决于调用方是否用对了 API | 有测试，但测的是这种宽松语义 | 已确认（有文档说明，但默认值偏开放） | M |
| R5 | P2 | 多标签页并发 · 离线写入 | 并发 `flush` 可能重复发送同一条离线写入 | [offline-write-store.ts:72-95](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/offline-write-store.ts#L72) 的 `prepareFlush` 只读出 `pending` 状态的记录，不标记“发送中”；[offline-write-flush.ts:12-26](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/offline-write-flush.ts#L12) | 两个标签页同时 `flush`（或一个页面连点两次），会带着相同的 `idempotency-key` 并行 POST。只要服务端正确实现了幂等就没事；否则会产生重复的副作用。该包**尚未发布** | 没有并发测试；ADR-0027 也没有讨论这种情况 | 已确认 | M |
| R6 | P2 | 兼容性 · 可测试性 | 真实浏览器自动化只覆盖 Chrome 桌面 | 9 份 `playwright.config.ts` 都是 `channel: "chrome"`，没有 `projects` 矩阵；非 Chromium 的安装用例是 `test.skip` | Safari/iOS 和 Firefox 上 SW 生命周期、Cache、IndexedDB 的差异只能靠人工发现。真机记录已经抓到过 iPhone 的异常（R9） | 232 个 Chrome E2E 用例 | 已确认 | M |
| R7 | P2（已修复，见 PR #28） | 本地门禁 · 可维护性 | `pnpm test` 遇到第一个失败就中止，而 release-tools 的集成测试在负载下会偶发超时 | 本次实跑：`run-gate.integration.test.ts` 有 14 个用例超过 5 秒默认超时，其余 14 个包因此一个都没执行；单独重跑仍有 3/44 超时；不中止地全量跑则全部通过 | ADR-0031 把本地门禁当作 CI 的替代。一个偶发超时就会挡住整个门禁，还会掩盖其他包的真实结果 | — | 已确认（本次实测） | S |
| R8 | P2（已修复，见 PR #27） | 可观测性 · 接入体验 | 准入拒绝时没有任何诊断输出 | [admit.ts:64-70](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/admit.ts#L64) 在 `Vary` 不合规时直接 `return false` | 用 `vite preview` 本地验收时，public-read 缓存会静默失效（主会话已复现，见[接入报告 C-1](04-pc-onboarding-review.md)）。生产环境里 CDN 往响应里加 `Vary` 头时，同样会静默失效 | L2/L3 测了拒绝行为本身，没有测可观测性 | 已确认 | S–M |
| R9 | P2 | 兼容性 · 恢复链路 | iPhone Safari 断网恢复后，页面短暂显示 `not registered`，`register()` 和 `update()` 挂起 | 真机记录 [verification.md:67](../../../tasks/stable-release-qualification/verification.md#L67)、[:80](../../../tasks/stable-release-qualification/verification.md#L80) | 断网再恢复后手动回到 `/app/`：页面仍受 worker 控制，但 client-runtime 的注册状态停在“未注册”，原生调用超过 5 秒不返回；关掉网页 App 再重开才恢复 | 只有 L4 人工记录，没有自动化复现 | 已确认存在，根因未知。[ADR-0041](../../adr/0041-keep-apple-as-progressive-compatibility.md)（审查期间合入）把它定为“恢复后的注册与更新就绪：部分通过”，并作为阻止 iPhone 晋级生产通道的条件 | M |
| R10 | ~~P3~~ 已解决 | 离线恢复 | iPhone 上默认离线页联网后没有自动重载 | [verification.md:72](../../../tasks/stable-release-qualification/verification.md#L72)（React 英文，未通过）；[:136](../../../tasks/stable-release-qualification/verification.md#L136)（中文版在同一设备通过） | **更正（2026-09-28）**：审查期间合入的 [ADR-0041](../../adr/0041-keep-apple-as-progressive-compatibility.md) 裁定“离线页联网恢复”记为通过；剩余问题归入 R9 | — | 已解决 | — |
| R11 | P3（Codex 评 P1） | 安全 · 同源多应用 | worker 的特权消息只校验同源，不校验 scope | [handlers.ts:97-98](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/handlers.ts#L97)、[:345-348](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/handlers.ts#L345) | 同源下的兄弟应用可以向本 worker 发送 `skip-waiting` 或清队列消息。**降级原因**：浏览器的隔离边界本来就是源，同源页面可以直接删除 Cache Storage、打开 IndexedDB，加 scope 校验并不能构成安全边界；它的价值只在于防止误发 | 只覆盖了跨源拒绝 | 已确认（纵深防御） | M |
| R12 | P3 | 缓存清理 | 配额错误时的清理，只覆盖已经实例化的运行时缓存 | 引擎按实例注册 `purgeOnQuotaError`（[runtime.ts:131](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/engine-workbox/src/worker/runtime.ts#L131)），而实例是惰性创建的（[handlers.ts:372-416](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/worker/handlers.ts#L372)） | 本次 worker 生命周期内没有被用到的另一类运行时缓存，不会注册回调，可能残留下来 | 浏览器测试事先把两个引擎都预热了，没有复现生产中的状态 | 待验证 | M |
| R13 | P3 | 框架绑定 | Vue 3.4 下卸载应用不会释放客户端 | [vue/src/index.ts:93-100](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vue/src/index.ts#L93) 的注释已登记为已知限制；[binding.test.ts:254](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vue/test/binding.test.ts#L254) | 微前端反复挂载时，监听器和更新调度器会累积 | 测试断言 `disposed=false` | 已确认（已登记的限制） | S（把最低版本提到 3.5） |
| R14 | P3 | 恢复链路 | 恢复 worker 可能在清理完成前就接管了页面 | [recovery-worker/index.ts:27-50](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/sw-runtime/src/recovery-worker/index.ts#L27)；E2E 观察到清理完成前已发生 `controllerchange`（[recovery.spec.ts:66-72](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/examples-browser-e2e/browser-tests/recovery.spec.ts#L66)） | 如果删除缓存失败，页面可能已被接管，但旧的敏感状态仍然残留 | 缺故障注入测试 | 待验证 | M |
| R15 | P3 | 文档一致性 · 可维护性 | 面向开发者的文档分在两套目录里 | `website/` 与 `docs/guides/`；站内链接会跳到 `main` 分支的指南（[integration-by-capability.md:249](../../../website/guide/integration-by-capability.md#L249)） | 两边内容会逐渐不同步，站内链接还会指向尚未发布的内容 | — | 已确认 | M |

## 各维度结论

| 维度 | 结论 |
|---|---|
| 模块边界与职责 | ✅ 包边界清晰，由测试守护导入闭包；没有发现越界导入，Workbox 也没有泄漏到公开 API |
| 公开 API 与配置契约 | ✅ `PwaPolicy` 按版本号区分（v1/v2/v3），闭合校验、上下限都很完整；⚠️ 发布校验 API 是“缺省即跳过”（R4） |
| `PwaIdentity` | ✅ 字段只读，运行时校验加基线比对；⚠️ 不可变只在显式启用的门禁中强制（R4）；缺少“scope 不超出 SW 目录”的校验（R3） |
| SW 注册与 scope | ✅ URL 与 scope 推导清楚，同源多应用有注册表校验；⚠️ R3 |
| 缓存准入、隔离、清理与迁移 | ✅ 默认拒绝加命名空间前缀加 `configDigest` 驱动清理，设计扎实，有 L3 证据；⚠️ R1、R2、R12 |
| 更新生命周期 | ✅ 只在用户确认后才 `skipWaiting`，从不 `clients.claim`、从不刷新页面，行为可预测，Chrome E2E 加 iPhone/Android 真机证据齐全；没有发现竞态 |
| 离线、恢复与降级链路 | ✅ 回退链固定，网络超时有 iPhone 真机实测（约 60 秒白屏缩短到约 5 秒）；⚠️ R9、R10、R14；没有根应用壳兜底属于有意取舍，需要写进文档 |
| 多标签页并发 | ✅ 更新依赖浏览器统一的 `controllerchange`，设计简单可靠，有 L3 证据；⚠️ 离线写入的 `flush` 缺少单飞控制（R5） |
| 安全 | ✅ 跨源、非 GET、不透明响应、重定向、`no-store`、`private` 都有拒绝和测试；push 载荷与点击目标限定在 scope 内；⚠️ R1、R2 |
| 浏览器兼容性 | ⚠️ 设计上有特性检测，但自动化只有 Chrome（R6）；Safari 的差异目前只能靠真机人工发现（R9、R10） |
| 可测试性与测试缺口 | ✅ 单元 2388 个用例、Chrome E2E 232 个；缺口：非 Chromium、并发 `flush`、非导航拒绝类请求逐类 E2E、响应头检查的真实服务器验证、身份变更被拒绝的测试 |
| 可维护性与扩展性 | ✅ ADR 纪律很好（40 份），规格与计划齐全；⚠️ 门禁容易被偶发超时拖垮（R7）、文档分两套（R15） |
| 文档、实现与测试一致性 | ⚠️ 已确认的不一致有：R1（规格与代码）；接入文档漏写的 4 处默认行为（[接入报告](04-pc-onboarding-review.md) C-3 至 C-6）；证据台账的 A 片曾把默认拒绝缓存误判为“只有 L2”，主会话已更正 |
