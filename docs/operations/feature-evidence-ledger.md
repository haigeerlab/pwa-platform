# 功能证据台账

## 用途

本台账把平台约 30 项功能的"是否真的被验证过"做成一张可持续维护的清单：每项功能给出发布状态、默认开关、代码位置，以及支撑其证据等级的具体断言（文件:行号或真机记录文件），而不是"存在测试文件"这种含糊说法。目标是让任何人一眼看出——某功能只是"写了代码"，还是"单元测试断言过"，还是"真的在桌面 Chrome 里跑过"，还是"真的在手机上装过"。

- **核查日期**：2026-09-27
- **基线 commit**：`eb5836e`（`git rev-parse --short HEAD`）
- **主要来源**：2026-09-27 架构审查（[docs/review/2026-09-27](../review/2026-09-27/README.md)）中三路独立取证、一次全量测试运行（见下方"测试运行证据"）与主会话对关键结论的代码复核；复核结论与取证冲突时以复核为准，并在详情中写"纠正说明"。风险编号 R1–R15 对应[架构与代码风险清单](../review/2026-09-27/06-architecture-risks.md)。

## 证据等级定义

| 等级 | 含义 |
|---|---|
| L0 | 仅文档/ADR 声明，代码未确认存在 |
| L1 | 代码存在（类型、函数、校验逻辑），但没有断言证明其行为 |
| L2 | 有自动化单元测试或真实构建（vitest/build）**断言**验证过行为 |
| L3 | 有真实桌面浏览器证据——Playwright 自动化断言，或人工在真实桌面浏览器中记录的操作 |
| L4 | 有真实手机记录（设备型号、系统版本、日期、证据文件） |

规则：

- 等级取"有断言支撑的最高级"；单元测试**文件存在**不算 L2，必须指向具体 `describe`/`it`/`expect` 或构建断言。
- E2E 全部只在桌面 Chrome 上跑——仓库内 9 个 `playwright.config.ts`（`browser-test-harness`、`client-runtime`、`engine-workbox`、`entry-resilience`、`examples-browser-e2e`、`nuxt`、`push`、`sw-runtime`、`vite`）均为 `channel: "chrome"`、无 `projects` 矩阵，无 Firefox/WebKit/移动模拟项目（逐份读取确认）。因此本表所有"L3"均指桌面 Chrome，不代表跨浏览器覆盖。
- 本表标注"未确认"的单元格，表示三份复核或本次核查都没有找到可验证的一手证据，不代表功能不存在或未测试。

## 测试运行证据（2026-09-27）

- `pnpm lint` / `pnpm typecheck` / `pnpm build`：均 exit 0，全绿。
- `pnpm test`（vitest 单元/集成）：16 个包、183 个测试文件、2388 个用例，`--no-bail` 全量重跑后全部通过；默认 `pnpm test` 因 `release-tools/test/run-gate.integration.test.ts` 在与 `contracts` 并发抢 CPU 时命中 vitest 默认 5000ms 超时（真实 `git worktree` 操作耗时 4-5s），属于环境时序相关的既有 flaky，非本次改动引入的回归。
- `pnpm test:browser`（Playwright，系统 Google Chrome 153.0.8010.53，9 个包）：232/232 通过，零重试。
- `pnpm docs:build`（VitePress）：exit 0。

## 总表

| 功能 | 用途 | 发布状态 | 默认开启 | 开启配置 | 代码 | 单元/构建 | 桌面浏览器 | 手机 | 最高等级 | 主要缺口 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. 清单链接注入 (ADR-0022) | 构建期注入 `<link rel="manifest">` | npm 0.1.0 | 是 | 无 | [manifest-link.ts](../../packages/vite/src/manifest-link.ts) | build test | [manifest-link.spec.ts:11](../../packages/vite/browser-tests/manifest-link.spec.ts#L11) | 未确认（间接） | L3 | 无 Firefox/Safari E2E；Nuxt 无此注入 |
| 2. 安装元数据扩展字段 (ADR-0037) | `description/categories/orientation/displayOverride/screenshots/shortcuts` | npm 0.1.0（beta.1 引入） | 否（未写字段则不变） | `PwaInstallMetadata` 字段 | [identity.ts:39-58](../../packages/contracts/src/identity.ts#L39) | `manifest-extensions-build.test.ts` | `manifest-extensions.spec.ts`（存在，断言未逐条核验） | 未确认（富安装对话框无专项记录） | L2（L3未核实内容） | 未读 E2E 断言体；无真机富对话框记录 |
| 3. 清单图标校验 (ADR-0040) | 校验 `install.icons` 文件存在且类型/尺寸匹配 | **仅工作区**（未发布，commit 815ff0b 在 0.1.0 之后） | 是（无开关） | 无 | [manifest-icons.ts](../../packages/vite/src/manifest-icons.ts) | [manifest-icon-validation-build.test.ts:89-148](../../packages/vite/test/manifest-icon-validation-build.test.ts#L89) | 无专项 | Android 真机安装记录（该 bug 的修复动因） | L2+L4 | 未发布到 npm，0.1.0 消费者无此保护 |
| 4. SW 注册与 scope | 客户端在 `identity.scope/serviceWorkerUrl` 注册 | npm 0.1.0 | 是 | `identity.scope`/`serviceWorkerUrl` | [identity.ts:4-15](../../packages/contracts/src/identity.ts#L4) | `build-config.test.ts` | [registration.spec.ts:8-49](../../packages/vite/browser-tests/registration.spec.ts#L8) | Android/iPhone 多处记录（作为前置条件） | L3+L4 | 无跨浏览器 |
| 5. 预缓存/应用外壳 (ADR-0011) | 平台计算 precache 清单并注入 `__WB_MANIFEST` | npm 0.1.0 | 是（结构性） | 资源规则 in `PwaPolicy` | [precache.ts](../../packages/core/src/precache.ts) | [precache.test.ts:47-138](../../packages/core/test/precache.test.ts#L47) | `registration.spec.ts:40,49` | Android/iPhone 安装记录（外壳可离线加载） | L2+L3+L4 | Workbox 7.4.1 类型/运行时不一致（已处理，需关注升级） |
| 6. 导航回退链 (ADR-0034) | 精确命中→丢查询串→`index.html`→离线页 | npm 0.1.0 | 是（不可配） | 无 | [decide.ts:166-173](../../packages/sw-runtime/src/worker/decide.ts#L166) | [decide.test.ts:159-247](../../packages/sw-runtime/test/worker/decide.test.ts#L159) | 未找到专项 E2E | ADR 背景本身是一次 Cloudflare 真实部署故障记录 | L2+L4 | 无根 shell SPA 回退——history 路由深链离线时得到网络错误而非离线页 |
| 7. 平台默认离线页 (ADR-0036) | 可选、本地化(zh-CN/en)、CSP 哈希、探测重连 | npm 0.1.0（beta.1 引入） | 否（`pwa({ offlinePage })` 显式开启） | `offlineFallback.path` 等 | [offline-page-style.ts](../../packages/vite/src/offline-page-style.ts) | `offline-page-build.test.ts` | [offline-page.spec.ts:33-209](../../packages/vite/browser-tests/offline-page.spec.ts#L33) | `docs/guides/offline-page.md:89` Android+iPhone 双端实测 | L3+L4 | 文档自称"单设备证据"；Nuxt 暂不支持 |
| 8. 默认拒绝缓存基线 | 私有数据/写请求/流/未分类请求默认不缓存 | npm 0.1.0 | 是（不可配） | 无（`allow/deny` 规则可开白名单） | [decide.ts:99-105](../../packages/sw-runtime/src/worker/decide.ts#L99) | [decide.test.ts:67-422](../../packages/sw-runtime/test/worker/decide.test.ts#L67) | [offline.spec.ts:63,73,101](../../packages/sw-runtime/browser-tests/offline.spec.ts#L63)（主会话核实，纠正首轮取证的"仅 L2"） | 未确认 | L3（部分） | 无非导航 mutation/stream/session-data 逐类 E2E |
| 9. 网络超时 (ADR-0038) | `networkTimeoutSeconds`(1-30) 超时改走缓存/离线页 | npm 0.1.0（beta.1 引入） | 否 | `networkTimeoutSeconds?: number` | [runtime.ts:25](../../packages/engine-workbox/src/worker/runtime.ts#L25) | `config.test.ts`/`shared-config.test.ts` bounds | [network-timeout.spec.ts:108-223](../../packages/sw-runtime/browser-tests/network-timeout.spec.ts#L108) | `docs/guides/network-timeout.md:71` iPhone 16 Pro/iOS 27 实测 60s→5s | L2+L3+L4 | 单设备证据；无 Android 计时记录 |
| 10. Range 请求绕过预缓存 (ADR-0023) | 带 `Range` 头的非导航请求直连网络 | npm 0.1.0 | 是（结构性） | 无 | [decide.ts:27-33](../../packages/sw-runtime/src/worker/decide.ts#L27) | [decide.test.ts:89-346](../../packages/sw-runtime/test/worker/decide.test.ts#L89) | [range-request.spec.ts:11-35](../../packages/sw-runtime/browser-tests/range-request.spec.ts#L11) | 无 | L2+L3 | 无真实 `<video>` 流媒体真机测试 |
| 11. Identity 不可变/缓存命名空间 (ADR-0004/0008/0009) | 生产注册后 8 字段不可变，命名空间随身份派生 | npm 0.1.0 | 是（治理规则） | `PwaIdentity` 全字段 | [identity.ts:4-15](../../packages/contracts/src/identity.ts#L4)、[cache-namespace.ts:12-35](../../packages/contracts/src/cache-namespace.ts#L12) | [baseline.test.ts:93-131](../../packages/build-verifier/test/baseline.test.ts#L93)（字段漂移逐项报告，含尾斜杠/大小写/百分号编码差异） | [release.spec.ts:64](../../packages/examples-browser-e2e/browser-tests/release.spec.ts#L64) 在真实浏览器发布检查中执行 `identity-baseline` | 无 | L3 | 漂移检测已有断言，但门禁是 opt-in，非运行时强制；风险 R4：空报告默认 `ok`，门禁默认可跳过（P2） |
| 12. 客户端门面与生命周期事件 (ADR-0013) | `createPwaClient()` 门面，5 个页面可见事件 | npm 0.1.0 | 是（调用即生效） | `PwaClientConfig` | [facade.ts:88](../../packages/client-runtime/src/client/facade.ts#L88) | [facade.test.ts:378-909](../../packages/client-runtime/test/client/facade.test.ts#L378) | [handover.spec.ts:14-41](../../packages/examples-browser-e2e/browser-tests/handover.spec.ts#L14) | Android WebAPK / Mac Safari 记录 | L2+L3+L4 | 3 个 worker 侧事件（activated/offline-fallback/cache-cleaned）无传输，仅 L1 |
| 13. 手动/自动更新检查 (ADR-0020) | `checkForUpdate()` 手动 + 可选轮询 | npm 0.1.0 | 手动开；自动轮询默认关 | `updateCheck.intervalMs`(≥60000) | [update-check.ts:10-15](../../packages/client-runtime/src/client/update-check.ts#L10) | [facade.test.ts:687-781](../../packages/client-runtime/test/client/facade.test.ts#L687) | [update-check.spec.ts](../../packages/client-runtime/browser-tests/update-check.spec.ts) | 未确认 | L2+L3 | React 绑定"无真实渲染测试"（ADR 自述）；无 24h+ 真机长时驱动记录 |
| 14. 更新提示流程+多标签协调 (ADR-0005/0026) | `update-waiting`→`applyUpdate()`→每个曾提示的标签独立收到 `update-applied` | npm 0.1.0 | 是（`updateMode` 仅 `"prompt"`） | 无开关 | [facade.ts:70,197-230](../../packages/client-runtime/src/client/facade.ts#L70) | [facade.test.ts:524-609](../../packages/client-runtime/test/client/facade.test.ts#L524) | [update.spec.ts:56](../../packages/examples-browser-e2e/browser-tests/update.spec.ts#L56)（多标签一次确认清空所有提示） | `tasks/stable-release-qualification/verification.md:45` 桌面 React 30 分钟重提醒+双标签；Android Vue 完整更新；iPhone 更新未复测（明确标记未完成） | L2+L3+L4 | iPhone 安装窗口内更新未复测；iPhone 离线恢复后短暂 `not registered`，根因未定位 |
| 15. 可选默认更新提示 UI (ADR-0039) | `PwaUpdateNotice`（Vue/React），显式挂载 | npm 0.1.0（beta.2 起） | 否（需显式 import/挂载） | `position/messages/colors/reloadPage` | [ui.ts:37-59](../../packages/react/src/ui.ts#L37) | 未发现（`react/test`、`vue/test` 均无 UI 组件单测，主会话核实） | [update-notice.spec.ts:27-127](../../packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts#L27)（vue+react ×7 场景） | Android+iPhone 仅英文文案实测；中文真机"另列待测" | L3 | 无单测；`messages` 仅内置 zh-CN，无 locale 表；无 `setPwaTheme`（该 API 只在 entry-resilience） |
| 16. 恢复 worker (ADR-0012) | 无 fetch 的应急 worker：删本应用缓存/过期记录/离线写队列/取消推送后 `clients.claim` | npm 0.1.0 | 需运维部署（非自动） | `PwaRecoveryWorkerConfig` | [recovery-worker/index.ts:22-32](../../packages/sw-runtime/src/recovery-worker/index.ts#L22) | [recovery-worker.test.ts:132-362](../../packages/sw-runtime/test/worker/recovery-worker.test.ts#L132) | [recovery.spec.ts:79-136](../../packages/examples-browser-e2e/browser-tests/recovery.spec.ts#L79) | 未确认是否为 0.1.0 执行过真机恢复演练 | L2+L3 | `docs/operations/recovery-drill.md` 真机记录未在本次核查中确认存在；E2E 观察到清理完成前已 `controllerchange`（待故障注入验证） |
| 17. 入口韧性恢复页+清单 (ADR-0017→ADR-0033)+HTML 头检查 (ADR-0032) | Origin 不可达时显示备用入口页；构建期检查公开 HTML 的 `Cache-Control` | npm 0.1.0（新增） | 否（需调用 `checkEntryRecovery()`/挂载） | 清单 `sequence/expiry/origin/startPath/entries≤5` | [check.ts](../../packages/entry-resilience/src/check.ts) | 12+ 个单测文件；[html-headers.test.ts:39](../../packages/build-verifier/test/html-headers.test.ts#L39) | [scenarios.spec.ts:147-396](../../packages/entry-resilience/browser-tests/scenarios.spec.ts#L147) | 未确认（`tasks/pwa-entry-resilience/verification.md` 未读） | L2+L3 | `release.spec.ts:64` 真实浏览器发布检查不含 `html-headers`/`release-retention`，二者停留在 L2（vitest 合成头） |
| 18. 在线/离线状态 API | 公开 `client.isOnline`/`onOnlineChange` 类 API | — | — | — | 不存在（主会话确认：grep `online`/`navigator.onLine` 仅命中 [offline-page.ts:60](../../packages/vite/src/offline-page.ts#L60) 离线页自身探测） | — | — | — | 不提供 | 无公开在线/离线状态 API；仅离线页内部探测 |
| 19. 登出 (ADR-0013) | 仅注销注册，**不删除任何缓存** | npm 0.1.0 | 显式调用 | 无 | [facade.ts:449](../../packages/client-runtime/src/client/facade.ts#L449) | [facade.test.ts:611-685](../../packages/client-runtime/test/client/facade.test.ts#L611)；`package-boundaries.test.ts`（源码扫描守护 `caches` API 不出现） | [handover.spec.ts:41](../../packages/examples-browser-e2e/browser-tests/handover.spec.ts#L41) | 未确认 | L2+L3 | 缓存保留半的"存活"断言未逐行定位 |
| 20. 安装提示处理 | 包装 `beforeinstallprompt`/`appinstalled` | npm 0.1.0 | 依赖 `installEnabled`+安装元数据 | `installEnabled: boolean` | [facade.ts:369-390](../../packages/client-runtime/src/client/facade.ts#L369) | [facade.test.ts:783-857](../../packages/client-runtime/test/client/facade.test.ts#L783) | [install.spec.ts:158](../../packages/examples-browser-e2e/browser-tests/install.spec.ts#L158)（明确标注"wiring only"，非真实系统安装） | `tasks/stable-release-qualification/verification.md:39-41` Android WebAPK 真装+Mac Safari 添加到程序坞 | L2+L3+L4 | 自动化安装覆盖仅"模拟事件"；非 Chromium 安装校验被 `test.skip` 显式跳过；iPhone 完整装-更周期未确认 |
| 21. 公开读运行时缓存 (ADR-0035, PwaPolicy v3) | 同源公开 GET 的 network-first/SWR 运行时缓存 | npm 0.1.0（beta.1 起） | 否（`runtimeCache.enabled`） | `enabled/maxEntries(1-200)/maxEntryBytes(1-1048576)/maxAgeSeconds(60-604800)` | [policy.ts:84-99](../../packages/contracts/src/policy.ts#L84) | 10+ 单测文件；[admit.ts](../../packages/sw-runtime/src/worker/admit.ts) | [runtime-cache.spec.ts](../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)（network-first/SWR/准入/过期/LRU/配额/Set-Cookie 探针） | 无 | L3 | Android/N-1 真机证据规格自述"未取得"；配额错误全局清理不保证覆盖所有实例（风险 R12，P3） |
| 22. 策略编译器 allow-under-deny (ADR-0002/0007) | 拒绝"deny 前缀下声明 allow"的非法策略 | npm 0.1.0（基线） | 是（编译期强制） | 无 | [rules.ts:53](../../packages/core/src/rules.ts#L53) | [rules.test.ts:128-167](../../packages/core/test/rules.test.ts#L128) | 无（纯编译期错误，无浏览器可观察行为） | 无 | L2 | 未完整读取 `rules.ts`/`compile.ts` 全文 |
| 23. 离线写队列 (ADR-0027) | 显式、会话绑定、worker 中转的写请求队列，重连后重放 | **仅工作区**（`private:true`，未发布） | 由 `PwaOfflineWritePolicy` 门控 | `offlineWrites` on `PwaPolicyV2/V3` | [offline-write/src/index.ts](../../packages/offline-write/src/index.ts) | [offline-write-intent.test.ts](../../packages/sw-runtime/test/worker/offline-write-intent.test.ts) | [offline-write.spec.ts](../../packages/sw-runtime/browser-tests/offline-write.spec.ts) | 无 | L2+L3 | 设计上不保证恰好一次投递；**多标签并发 flush 可重复发送同一写**，无并发测试（风险 R5，P2，`offline-write-store.ts:72-95`） |
| 24. 推送 (ADR-0021) | 平台 worker 集成 Web Push：订阅/展示/点击跳转 | **仅工作区**（`private:true`，未发布） | 由是否注册 push 模块决定 | 无独立开关 | [push/src/client/index.ts](../../packages/push/src/client/index.ts) | [push-notification.test.ts](../../packages/sw-runtime/test/worker/push-notification.test.ts) | [client.spec.ts](../../packages/push/browser-tests/client.spec.ts)、[push.spec.ts](../../packages/sw-runtime/browser-tests/push.spec.ts) | 无 | L2+L3 | **无真实推送服务投递证据**——测试环境中合法 key 的订阅本身即因"无可达推送服务"而失败，端到端投递从未被真正跑通 |
| 25. 共享域注册表/排除 (ADR-0019) | 一父多子 PWA 共享 origin；`exclude` 规则使父 worker 永不拦截子路径 | npm 0.1.0（基线） | 否（需提供注册表） | 注册表对象（`schemaVersion/registryVersion/origin/environment/entries`，具体类型定义行未定位） | [topology.ts](../../packages/core/src/topology.ts) | 未逐条列出（存在但未读） | [shared-origin-isolation.spec.ts](../../packages/vite/browser-tests/shared-origin-isolation.spec.ts)、[shared-origin-recovery.spec.ts](../../packages/vite/browser-tests/shared-origin-recovery.spec.ts) | 无 | L3 | 移除子应用无自动化检查（ADR 明确设计如此）；发布顺序校验是否有对应测试未确认 |
| 26. 构建校验报告 (ADR-0014) | 纯函数、零网络、零写入的身份/策略/构建产物/部署契约校验报告 | npm 0.1.0 | N/A（库） | 无 | [report.ts](../../packages/build-verifier/src/report.ts) 等 11 个源文件 | 未逐条列出（存在，未按 file:line 核实） | [release.spec.ts](../../packages/examples-browser-e2e/browser-tests/release.spec.ts) | 无 | L2+L3 | 报告"空输入即 `ok`"是已知架构风险，依赖调用方使用额外完整性层（见 #27） |
| 27. 发布工具/本地门禁/发布留存 (ADR-0024/0025/0031) | 留存窗口(R/R-1/R-2 资产≥7天宽限)校验+门禁完整性+临时本地门禁替代 CI | 底层逻辑随 build-verifier 发布；**CLI (`release-tools`) 仅工作区** | N/A（显式调用 `pnpm gate:local`） | 无 | [release-retention.ts](../../packages/build-verifier/src/release-retention.ts)、[release-gate.ts](../../packages/build-verifier/src/release-gate.ts) | 未逐条列出 | 无（Node CLI，非浏览器行为） | 无（ADR-0031 本身是运维记录） | L1+L2 | ADR-0031"本地门禁替代 CI"为临时措施，是否已因 GitHub/Actions 恢复而失效未核实；`release-tools` 自身测试覆盖未逐一确认 |
| 28. Vue/React/Nuxt 框架绑定 (ADR-0016) | 两个独立实现同一状态机的框架包；Nuxt 为 SSR 适配 | Vue/React npm 0.1.0；**Nuxt 仅工作区** | N/A（各自 opt-in） | 无（`./ui` 子路径单独 opt-in，见 #15） | [vue/src/store.ts](../../packages/vue/src/store.ts)、[react/src/store.ts](../../packages/react/src/store.ts) | [store.test.ts](../../packages/vue/test/store.test.ts)、[parity.test.ts](../../packages/react/test/parity.test.ts)（跨包一致性） | [handover.spec.ts](../../packages/examples-browser-e2e/browser-tests/handover.spec.ts)；Nuxt 7 个 spec 文件 | 无 | L2+L3 | Nuxt 全部证据均为"未发布产物"的预发布证据；ADR 明确不强制 Vue/React API 对称（设计如此） |
| 29. Vite 5 兼容 | `vite: ^5.0.0 \|\| ^8.0.0`、`node >=22.0.0` | npm 0.1.0（beta.2 起） | N/A（peerDependency） | 无 | [package.json:33,47,50](../../packages/vite/package.json#L33) | CHANGELOG 声称双版本构建覆盖，但双版本测试矩阵文件未定位 | `packages/vite/browser-tests/*`（未确认是否对两个 Vite 大版本各跑一次，devDependency 固定为 8.3.0） | 无 | L1（声称）/未确认矩阵 | 未找到 Vite 5 专项测试矩阵；可能只对 8.3.0 实际跑过 |
| 30. 从 vite-plugin-pwa 迁移指南 | 文档：引导团队从社区插件迁移到本平台 | 仅规格（纯文档） | N/A | N/A | `docs/guides/migrate-from-vite-plugin-pwa.md` | N/A（文档无法自动化校验） | N/A | N/A | L0 | 文档内容本身未读，`website/guide/migration.md` 与其关系未核实 |

## 每项详情

以下仅对总表中证据链较复杂或存在纠正的条目展开；配置字段默认值、断言位置见上表链接，此处补充覆盖场景、真机细节与风险。

### 1. 清单链接注入
- 覆盖场景：served 页面恰好一条 manifest link；manifest 可 fetch 且 id/scope/start_url 与身份一致；Chrome CDP 解析零错误（`manifest-link.spec.ts:24,31-38,49-50`）。
- 桌面浏览器：Chrome 153（系统安装版），2026-09-27（本次 `pnpm test:browser` 运行）。
- 手机：未单独标记，依赖 #4/#20 的真机安装记录间接覆盖。
- 未验证/风险：Nuxt 不获得此注入（ADR 明确列为未决问题）。

### 3. 清单图标校验
- 手机：`tasks/stable-release-qualification/verification.md:107` — Android 原生安装入口因 1×1 占位 PNG 而失效，修复后安装 WebAPK `org.chromium.webapk.a26b75328c3f9eda4_v2`，设备本地时间 2026-09-27 14:17:37。这是本功能存在的直接动因。
- 未验证/风险：`maskable` 安全区、截图/快捷方式图标尺寸校验均明确排除在外（"另行评估"）；未发布到 npm，`0.1.0` 消费者不受保护。

### 6. 导航回退链
- 覆盖场景（`decide.ts:166-173` 主会话核实）：候选顺序为 `[path+query, path, dir/index.html, offlinePage]`，仅在候选属于 precache 成员时命中。
- 未验证/风险：无根 shell（SPA history 路由）回退项——深链页面离线时若从未精确预缓存，会得到网络错误而非离线页，而非通常预期的"回退到 index.html 再进入前端路由"。这是 ADR-0012 的有意取舍（“除降级页外不返回其他路由的缓存内容”），风险在于接入文档没有写明其后果（见 docs/review/2026-09-27/04-pc-onboarding-review.md C-3）。

### 8. 默认拒绝缓存基线
- 纠正说明：首轮取证原判定为"仅 L2"，主会话复核后确认存在 L3：`sw-runtime/browser-tests/offline.spec.ts:63`（denied 导航离线→离线页，从不进入缓存、从不打服务器）、`:73`（未分类导航离线→网络错误）、`:101`（denied 导航在线→网络，无缓存写入）；另有 `nuxt/browser-tests/private-cache.spec.ts`、`register.spec.ts:28`（从不缓存 `/app/account`、`/app/news`）、`runtime-cache.spec.ts:188`（`Cache-Control: private` 不缓存）。
- 风险新发现：`runtime-cache.spec.ts:163` 显式断言"带 `Set-Cookie` 且未声明 `private` 的响应会被缓存"——这是公开读缓存准入的既定行为，而非缺陷，但记录在此提醒风险面。
- 未验证/风险：仍缺少按 v1 矩阵逐类覆盖的非导航 mutation(POST)/stream/session-data 请求 E2E。

### 11. Identity 不可变性
- 风险（审查风险 R4，P2）：`build-verifier` 的报告在缺少必需检查输入时仍返回 `ok: true`（`release.ts:48-79`、`baseline.ts:20-67`、`release-gate.ts:13-37`），意味着常规构建或遗漏 baseline 时，9 个身份字段可能漂移而无自动拦截；不可变性事实上依赖发布期人工基线比对，不是运行时强制。

### 14. 更新提示流程+多标签协调
- 手机：`tasks/stable-release-qualification/verification.md:45` 桌面 Chrome React 30 分钟重提醒+双标签隔离；Android Vue 完整版本升级+离线刷新；**iPhone Vue 安装窗口内更新流程本次仅验证在线/离线冷启动，更新流程未重跑，报告中明确标记为未完成**。`release-0.1.0.md:9` 记录 iPhone Safari 离线恢复后瞬时报告 `not registered`（App relaunch 后自愈），根因未定位，列为已知开放风险而非阻断项。

### 15. 可选默认更新提示 UI
- 纠正说明：主会话核实 `react/test`、`vue/test` 目录**均无** `PwaUpdateNotice` 组件单测（首轮取证标记为"待确认"），但 L3 E2E 确凿存在：`update-notice.spec.ts:27-127`，7 个场景 ×{vue, react}（等待/稍后/重试/接管/刷新、失败重试不重复 apply、位置+CSS 变量覆盖+320px 窄视口、`colors` prop 覆盖、30 分钟再提醒、明暗对比度）。
- i18n/主题：`DEFAULT_MESSAGES` 仅内置 zh-CN（`react/src/ui.ts:37-50`），可通过 `messages` prop 覆盖但无 locale 字段/en 内置表；主题走 `colors` prop + `--pwa-update-*` CSS 变量 + `prefers-color-scheme`（`update-notice.css:94`），**没有** `data-theme`/`setPwaTheme` 这类显式切换 API（`setPwaTheme` 只存在于 `entry-resilience/src/client/index.ts:51`，服务于恢复页，与更新提示 UI 无关）。
- 手机：Android(React/Vue)+iPhone(Vue) 已实测英文文案；中文真机渲染文档中明确"另列待测"。

### 16. 恢复 worker
- 待验证假设（风险 R14）：E2E 已观察到清理完成前发生 `controllerchange`（`examples-browser-e2e/browser-tests/recovery.spec.ts:66-72`），但尚未在真实浏览器中注入 Cache/IndexedDB 删除失败来验证：失败时是否已提前接管页面、旧敏感状态是否残留、是否出现白屏。未验证前不列为确定缺陷。
- 未验证/风险：`docs/operations/recovery-drill.md` 存在于仓库（本次核查确认文件在目录中），但其中是否已填写 0.1.0 的真机恢复演练记录未在本次核查中打开确认。

### 17. 入口韧性+HTML 头检查
- 信任模型变更：ADR-0017（Ed25519 签名清单）被 ADR-0033 取代（平台不再验签），最终随 0.1.0 发布的是 ADR-0033 模型（应用侧 `updateEntryManifest(data)`，平台只校验形状/新鲜度/序号，无加密）。
- html-headers 缺口：`build-verifier/test/html-headers.test.ts`、`release-gate.test.ts:64`、`report.test.ts:84-89` 提供扎实的 L2（vitest 合成头输入）覆盖，但 `examples-browser-e2e/browser-tests/release.spec.ts:64` 显式断言真实浏览器发布检查列表为 `["artifacts", "response-headers", "identity-baseline"]`——**不含** `html-headers`/`release-retention`，即这两项从未在真实服务器响应头上端到端跑过。

### 18. 在线/离线状态 API
- 结论（主会话核实）：`client-runtime`/`vue`/`react` 源码中对 `online`/`navigator.onLine` 的引用为零；唯一命中是 `vite/src/offline-page.ts:60`——离线兜底页自身的同源探测逻辑，不是面向应用的公开 API。因此本平台**没有** `client.isOnline`/`onOnlineChange` 类接口。

### 20. 安装提示处理
- 手机：`tasks/stable-release-qualification/verification.md:39` Android Chrome 153 Vue 真实 WebAPK 安装（`org.chromium.webapk.a5be8b3d54eb30ac0_v2`，2026-09-26 19:09:33 设备本地时间），CDP 确认 `display-mode: standalone = true`；`:40` Mac Safari 18.6 "添加到程序坞"真实流程，独立窗口 standalone 确认，React 端瞬时 `no-registration→prompt` 状态记录为预期内非故障；`:41` 该窗口的在线场景复测（更新/离线尚未在该具体安装窗口重跑）。
- 未验证/风险：`install.spec.ts:135`（原文引用行号，编号或有偏移）使用 `test.skip(true, "未取得：非 Chromium 浏览器，无法通过 CDP 复核安装条件（按规格跳过）")`——按规格显式跳过而非静默通过；自动化安装覆盖本身标注为"wiring only"（模拟 `beforeinstallprompt`/`appinstalled` 事件派发），非真实系统级安装动作。

### 21. 公开读运行时缓存
- 探路记录：ADR-0035"探路记录"一节记载了 5 项在临时目录中用真实 Chrome 153 桌面+Playwright 1.63 做的手工探测（Set-Cookie 可见性、LRU+配额全清行为、缓存副本头剥离、导航事件投递、离线/SWR 后台更新），代码未入库——按本台账口径记为"文档级 L3"，不是仓库内可重跑的证据。
- 未验证/风险：Android/N-1 真机证据规格自述"按惯例登记为未执行，不折算为通过"；配额错误清理是引擎实例级注册的回调，若某类 runtime cache 引擎按当前生命周期尚未实例化，配额回调不会注册，可能残留写入失败（风险 R12，P3，`engine-workbox/src/worker/runtime.ts:131-148` vs `sw-runtime/src/worker/handlers.ts:372-416` 惰性实例化）。

### 23. 离线写队列
- 风险（审查风险 R5，P2）：两个标签同时 flush 都能读到同一条 `pending` 记录，并携带相同幂等键并行发起写请求；服务端幂等处理不当时会产生重复副作用。相关代码：`handlers.ts:119-121`、`offline-write-store.ts:72-95`、`offline-write-flush.ts:12-26`。未见并发 flush 场景的自动化测试。

### 24. 推送
- 未验证/风险：`push/browser-tests/client.spec.ts` 明确展示 `subscribePush` 使用合法 VAPID key 时因"测试环境无可达推送服务"而 reject（`push.subscribe-failed`）——即便是 L3 也只覆盖客户端注册半程和 worker 侧通知渲染半程，服务端→推送服务→浏览器的完整投递路径在本仓库测试体系中从未被验证过。

## 已知未验证清单

1. **非 Chromium 自动化为零**：9 个 `playwright.config.ts` 均单一 `channel: "chrome"` 项目，无 Firefox/WebKit/Safari/移动模拟矩阵。
2. **Android N / N-1 轮换证据未收**：`spec/public-read-cache.md` 测试策略段自述"未取得的 Android、N-1 证据按惯例登记为未执行，不折算为通过"。
3. **iPhone 安装窗口内更新流程未复测**：`verification.md:45` 明确标记该项本轮未重跑（见"每项详情"#14）。
4. **iPhone 断网恢复后短暂 `not registered`**：`release-0.1.0.md:9` 记录的真机异常，自愈但根因未定位，未解决。
5. **push 无真实推送服务投递证据**：见"每项详情"#24——端到端投递从未被自动化或人工验证过。
6. **html-headers 与 release-retention 无真实服务器浏览器检查**：`release.spec.ts:64` 的真实 Chrome 发布检查列表不含这两项，二者停留在 L2（vitest 合成输入）。
7. **offline-write 多标签并发 flush 无测试**：见"每项详情"#23（风险 R5）。
8. **mutation/stream/session-data 非导航请求逐类 E2E 缺失**：默认拒绝基线（#8）虽已确认部分 L3，但 v1 矩阵中按请求类别逐一验证"从不缓存"的浏览器测试仍不完整。
9. **identity 门禁是 opt-in**：#11——漂移检测本身有 L2 断言并在 `release.spec.ts` 中执行，但调用方不传 `baseline` 时报告仍为 `ok`（风险 R4），没有测试证明“生产发布路径必然执行该检查”。

## 如何维护本台账

- **新增功能**：在总表追加一行，详情按"每项详情"格式（覆盖场景、桌面浏览器版本+日期、手机设备/系统/浏览器/日期/证据文件、未验证与风险）补充小节；证据必须给出具体文件:行号（源码或测试）或具体记录文件路径，不接受"有测试文件"这类不指向断言的表述。
- **新增测试**：若新增的单元/构建断言把某功能从 L1 提升到 L2，或新增 Playwright 规格把某功能从 L2 提升到 L3，更新总表"最高等级"列与对应"单元/构建"或"桌面浏览器"列的链接，并在详情小节补一句纠正说明（参考本文件 #8、#15、#18 的写法：先写"纠正说明"，再给出新证据）。
- **新增真机记录**：手机记录必须落到具体证据文件（如 `tasks/*/verification.md` 的行号、`docs/guides/*.md` 的行号，或新建一份真机记录文档），在总表"手机"列写清设备型号+系统版本+日期，并在详情小节引用该文件。仅口头/聊天记录的真机验证不计入 L4。
- **升级等级的唯一依据**：找到断言本身（`expect(...)`、`toThrow`、`toEqual`，或真机记录里的具体现象描述+时间戳），而不是"这个包应该测过"之类的推断。如果暂时找不到对应断言，就在"主要缺口"/"未验证与风险"里如实写"未确认"，不要为了让表格好看而拔高等级。
- **发现证据被推翻**：若后续核查发现本台账某条判断有误（如本次复核对默认拒绝缓存、更新提示 UI、在线/离线 API 三处的纠正），比照本文件"每项详情"里的纠正写法：保留原判断的简述+标注"纠正说明"+给出新证据来源，不要直接静默改写旧结论。
