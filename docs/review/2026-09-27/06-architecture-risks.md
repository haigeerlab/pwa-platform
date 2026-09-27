# 06 · 架构与代码风险清单

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
| R1 | P2（Codex 评 P1） | 缓存准入 · 安全 · 一致性 | `navigation-public-dynamic` 导航不检查 `Authorization` | [decide.ts:118-127](../../../packages/sw-runtime/src/worker/decide.ts#L118) 的导航分支没有检查；数据分支有（[decide.ts:137](../../../packages/sw-runtime/src/worker/decide.ts#L137)）。规格 [public-read-cache.md:95](../../../spec/public-read-cache.md#L95) 和 ADR-0012 的增补都写着“带 `Authorization` 的请求透传” | 被标为公共动态页的路径，如果请求带了 `Authorization` 头、响应又没标 `private` 或 `no-store`，就可能被缓存。**降级原因**：浏览器导航时附加的 HTTP 认证信息，通常在 Service Worker 之下的网络层才加上，SW 里的 `Request` 一般看不到 | 测试反而把这个行为固定了下来：[decide.test.ts:346](../../../packages/sw-runtime/test/worker/decide.test.ts#L346) | 已确认（与规格不一致） | S |
| R2 | P2 | 缓存准入 · 安全 | 带 `Set-Cookie`、但没标 `private` 的响应会被 public-read 缓存 | [runtime-cache.spec.ts:163](../../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts#L163) 用例名写明“IS cached” | 业务把某个会下发会话 Cookie 的接口误标为 `public-data` 时，响应体会被缓存下来，再提供给其他会话。缓存的 `Response` 读不到 `Set-Cookie`，所以 Cookie 本身不会泄露，但同一份响应体会被共享 | L3 测试固定了当前行为 | 已确认（设计选择，但缺少防误用） | S |
| R3 | P2（Codex 评 P1，根因定位不同） | SW 注册与 scope | 身份契约没有检查“scope 不能超出 SW 脚本所在目录” | [validate.ts:451](../../../packages/contracts/src/validate.ts#L451) 只检查 SW 地址在 scope 之下；仓库里没有任何地方提到 `Service-Worker-Allowed` 头；Vite 不要求 `base` 等于 `mountPath`（[host-output.ts:101-124](../../../packages/vite/src/host-output.ts#L101)），Nuxt 则要求相等（[artifacts.ts:98](../../../packages/nuxt/src/artifacts.ts#L98)） | 比如 `scope=/app/`、`serviceWorkerUrl=/app/assets/sw.js`，契约校验和构建都能通过，浏览器却拒绝注册，应用完全失去 PWA 能力。好在第一次真实访问就会暴露，不会损坏数据 | 无 | 已确认 | S |
| R4 | P2 | 身份不可变 | 发布校验的输入缺省即跳过，报告为空也算 `ok` | [release.ts:48-79](../../../packages/build-verifier/src/release.ts#L48) 的注释写明“an empty report `ok: true`”；[release-gate.ts:13-37](../../../packages/build-verifier/src/release-gate.ts#L13) 把覆盖检查交给调用方组合 | 集成方只看 `ok`、没有传 `baseline`，身份的九个字段就可能在不知情的情况下漂移，留下旧注册、旧缓存和旧队列。“身份不可变”这条平台的核心承诺，实际上取决于调用方是否用对了 API | 有测试，但测的是这种宽松语义 | 已确认（有文档说明，但默认值偏开放） | M |
| R5 | P2 | 多标签页并发 · 离线写入 | 并发 `flush` 可能重复发送同一条离线写入 | [offline-write-store.ts:72-95](../../../packages/sw-runtime/src/worker/offline-write-store.ts#L72) 的 `prepareFlush` 只读出 `pending` 状态的记录，不标记“发送中”；[offline-write-flush.ts:12-26](../../../packages/sw-runtime/src/worker/offline-write-flush.ts#L12) | 两个标签页同时 `flush`（或一个页面连点两次），会带着相同的 `idempotency-key` 并行 POST。只要服务端正确实现了幂等就没事；否则会产生重复的副作用。该包**尚未发布** | 没有并发测试；ADR-0027 也没有讨论这种情况 | 已确认 | M |
| R6 | P2 | 兼容性 · 可测试性 | 真实浏览器自动化只覆盖 Chrome 桌面 | 9 份 `playwright.config.ts` 都是 `channel: "chrome"`，没有 `projects` 矩阵；非 Chromium 的安装用例是 `test.skip` | Safari/iOS 和 Firefox 上 SW 生命周期、Cache、IndexedDB 的差异只能靠人工发现。真机记录已经抓到过 iPhone 的异常（R9） | 232 个 Chrome E2E 用例 | 已确认 | M |
| R7 | P2 | 本地门禁 · 可维护性 | `pnpm test` 遇到第一个失败就中止，而 release-tools 的集成测试在负载下会偶发超时 | 本次实跑：`run-gate.integration.test.ts` 有 14 个用例超过 5 秒默认超时，其余 14 个包因此一个都没执行；单独重跑仍有 3/44 超时；不中止地全量跑则全部通过 | ADR-0031 把本地门禁当作 CI 的替代。一个偶发超时就会挡住整个门禁，还会掩盖其他包的真实结果 | — | 已确认（本次实测） | S |
| R8 | P2 | 可观测性 · 接入体验 | 准入拒绝时没有任何诊断输出 | [admit.ts:64-70](../../../packages/sw-runtime/src/worker/admit.ts#L64) 在 `Vary` 不合规时直接 `return false` | 用 `vite preview` 本地验收时，public-read 缓存会静默失效（主会话已复现，见[接入报告 C-1](04-pc-onboarding-review.md)）。生产环境里 CDN 往响应里加 `Vary` 头时，同样会静默失效 | L2/L3 测了拒绝行为本身，没有测可观测性 | 已确认 | S–M |
| R9 | P2 | 兼容性 · 恢复链路 | iPhone Safari 断网恢复后，页面短暂显示 `not registered`，`register()` 和 `update()` 挂起 | 真机记录 [verification.md:65](../../../tasks/stable-release-qualification/verification.md#L65)、[:78](../../../tasks/stable-release-qualification/verification.md#L78) | 断网再恢复后手动回到 `/app/`：页面仍受 worker 控制，但 client-runtime 的注册状态停在“未注册”，原生调用超过 5 秒不返回；关掉网页 App 再重开才恢复 | 只有 L4 人工记录，没有自动化复现 | 已确认存在，根因未知 | M |
| R10 | P3 | 离线恢复 | iPhone 上默认离线页联网后没有自动重载 | [verification.md:70](../../../tasks/stable-release-qualification/verification.md#L70)（React 英文，未通过）；[:123](../../../tasks/stable-release-qualification/verification.md#L123)（后来中文版在同一设备通过） | 离线页的文案承诺“联网后自动重试”，结果却因设备和场景而异 | L4 结果互相矛盾 | 待验证 | S |
| R11 | P3（Codex 评 P1） | 安全 · 同源多应用 | worker 的特权消息只校验同源，不校验 scope | [handlers.ts:97-98](../../../packages/sw-runtime/src/worker/handlers.ts#L97)、[:345-348](../../../packages/sw-runtime/src/worker/handlers.ts#L345) | 同源下的兄弟应用可以向本 worker 发送 `skip-waiting` 或清队列消息。**降级原因**：浏览器的隔离边界本来就是源，同源页面可以直接删除 Cache Storage、打开 IndexedDB，加 scope 校验并不能构成安全边界；它的价值只在于防止误发 | 只覆盖了跨源拒绝 | 已确认（纵深防御） | M |
| R12 | P3 | 缓存清理 | 配额错误时的清理，只覆盖已经实例化的运行时缓存 | 引擎按实例注册 `purgeOnQuotaError`（[runtime.ts:131](../../../packages/engine-workbox/src/worker/runtime.ts#L131)），而实例是惰性创建的（[handlers.ts:372-416](../../../packages/sw-runtime/src/worker/handlers.ts#L372)） | 本次 worker 生命周期内没有被用到的另一类运行时缓存，不会注册回调，可能残留下来 | 浏览器测试事先把两个引擎都预热了，没有复现生产中的状态 | 待验证 | M |
| R13 | P3 | 框架绑定 | Vue 3.4 下卸载应用不会释放客户端 | [vue/src/index.ts:93-100](../../../packages/vue/src/index.ts#L93) 的注释已登记为已知限制；[binding.test.ts:254](../../../packages/vue/test/binding.test.ts#L254) | 微前端反复挂载时，监听器和更新调度器会累积 | 测试断言 `disposed=false` | 已确认（已登记的限制） | S（把最低版本提到 3.5） |
| R14 | P3 | 恢复链路 | 恢复 worker 可能在清理完成前就接管了页面 | [recovery-worker/index.ts:27-50](../../../packages/sw-runtime/src/recovery-worker/index.ts#L27)；E2E 观察到清理完成前已发生 `controllerchange`（[recovery.spec.ts:66-72](../../../packages/examples-browser-e2e/browser-tests/recovery.spec.ts#L66)） | 如果删除缓存失败，页面可能已被接管，但旧的敏感状态仍然残留 | 缺故障注入测试 | 待验证 | M |
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
