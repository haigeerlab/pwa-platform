# 功能证据台账

## 用途

本台账把平台约 30 项功能的"是否真的被验证过"做成一张可持续维护的清单：每项功能给出发布状态、默认开关、代码位置，以及支撑其证据等级的具体断言（文件:行号或真机记录文件），而不是"存在测试文件"这种含糊说法。目标是让任何人一眼看出——某功能只是"写了代码"，还是"单元测试断言过"，还是"真的在桌面 Chrome 里跑过"，还是"真的在手机上装过"。

- **核查日期**：2026-09-27；2026-09-28 按审查修复结果（PR #27–#42）更新，并补入发布后的 [#48](https://github.com/haigeerlab/pwa-platform/pull/48)、[#49](https://github.com/haigeerlab/pwa-platform/pull/49)。这些修复已随 npm `0.2.0` 发布（[发布记录](../../tasks/package-distribution/release-0.2.0.md)）；表中“npm 0.1.0”指该功能自 0.1.0 起已发布；**2026-09-28 增量复审**：本机重跑全部测试网关、逐行核对台账引用的 `文件:行号`、补入 0.2.1 两机 Android 轮次与 iPhone R9/Vue/R3 真机记录，详见下方"测试运行证据（2026-09-28 增量复审）"与各行"纠正说明" 2026-09-29 随 npm `0.2.3` 发布更新发布状态（第 3、14、16、21、23 行与 #14 详情）。
- **基线 commit**：`eb5836e`（`git rev-parse --short HEAD`）
- **主要来源**：2026-09-27 架构审查（[docs/review/2026-09-27](../review/2026-09-27/README.md)）中三路独立取证、一次全量测试运行（见下方"测试运行证据"）与主会话对关键结论的代码复核；复核结论与取证冲突时以复核为准，并在详情中写"纠正说明"。风险编号 R1–R15 对应[架构与代码风险清单](../review/2026-09-27/06-architecture-risks.md)。

> **行号约定（2026-09-28）**：表格与正文中带链接的 `文件#L行号` 已映射到当前 `main`；“每项详情”正文里未加链接的 `文件:行号` 保留首次核查时基线提交 `eb5836e` 的位置，仅作历史参考，以链接为准。

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
- **2026-09-28 起**：sw-runtime 套件另在 Playwright 自带的 WebKit 与 Firefox 上以不阻断方式运行（`pnpm test:browser:engines`，ADR-0042）。这类结果只记作“WebKit 引擎 / Firefox”的渐进兼容参考，不升级任何功能的等级，也不代表 Safari 或 iOS。**2026-09-29 起**：client-runtime 套件同样接入（22 个用例，1 个因 Firefox 与 Chromium/WebKit 的 Service Worker 任务队列行为差异被 `test.skip`，ADR-0043 已记录该差异）。
- **2026-09-29 起**：引擎冒烟扩到 client-runtime 与 examples-browser-e2e（后者 React 示例在 WebKit 上的 19 个用例因原因未查明的 Playwright 挂起而跳过，见 ADR-0042 增补）；另新增不阻断的 **Microsoft Edge 稳定版**运行（ADR-0044）：`main` @ `3097193` 的 CI（run 36457351633）在 Edge 153.0.4234.48 上 `pnpm test:browser` 全部 281 个用例通过。Edge 是真实的 Edge 稳定版，结果可记为桌面 Edge 的自动化证据，但不阻断发布。
- 本表标注"未确认"的单元格，表示三份复核或本次核查都没有找到可验证的一手证据，不代表功能不存在或未测试。

## 测试运行证据（2026-09-28 增量复审，`main` @ `dad5d1e`）

本机（macOS）对 0.2.1 发布后的 `main` 再次全量重跑，全部 exit 0；命令与 GitHub Actions run 36417040999（同一提交 `dad5d1e`）双源互证：

| 命令 | 结果 |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 通过，无告警 |
| `pnpm test`（vitest） | 16 个包全部通过，**2428** 个用例全绿，0 失败 |
| `pnpm test:browser`（阻断，系统 Google Chrome 153） | 9 个包共 **277** 个用例全部通过，0 失败、0 跳过 |
| `pnpm test:onboarding-smoke`（阻断） | 1/1 通过 |
| `pnpm test:browser:engines`（不阻断，Playwright WebKit 26.6 / Firefox 155.0） | **120 passed / 10 skipped**（跳过均为 Chromium 专有：push 3 类 × 2 引擎 + R8 准入诊断 × 2 + R12 配额清理 × 2） |

与 GitHub Actions run 36417040999（"Engine smoke" job，`dad5d1e`）报告的 120 passed / 10 skipped 完全一致。另：**PR #60**（N1 修复，`c8bf225`，未合并）在此基线上新增 2 个 `client-runtime` 单元测试，该分支上 `pnpm test` 为 2430 个用例。

## 测试运行证据（2026-09-28，`main` @ `13d6039`）

在合入审查修复（PR #27–#42）后的 `main` 上，本机（macOS）一次全量运行，全部 exit 0：

| 命令 | 结果 |
|---|---|
| `pnpm build` / `pnpm lint` / `pnpm typecheck` | 通过 |
| `pnpm test`（vitest） | 16 个包、186 个测试文件、2420 个用例全部通过，无超时（R7 修复后不再在首个失败处中止） |
| `pnpm test:browser`（阻断） | Playwright 1.63.0、系统 Google Chrome 153.0.8010.53，9 个包共 273 个用例全部通过，含更新提示 UI 套件 18 个 |
| `pnpm test:onboarding-smoke`（阻断） | 从打包产物离线安装、构建并在 Chrome 中验证最小接入，1 个用例通过 |
| `pnpm test:browser:engines`（不阻断） | Playwright WebKit 与 Firefox 上 sw-runtime 套件 116 个通过、8 个跳过（仅 Chromium 的推送与 worker 控制台用例） |

同一提交在 GitHub Actions（Linux）上的合并后运行也全部通过：Quality × 2、Browser、引擎冒烟、FCM 联网套件。

## 测试运行证据（2026-09-27，审查基线 `eb5836e`）

- `pnpm lint` / `pnpm typecheck` / `pnpm build`：均 exit 0，全绿。
- `pnpm test`（vitest 单元/集成）：16 个包、183 个测试文件、2388 个用例，`--no-bail` 全量重跑后全部通过；默认 `pnpm test` 因 `release-tools/test/run-gate.integration.test.ts` 在与 `contracts` 并发抢 CPU 时命中 vitest 默认 5000ms 超时（真实 `git worktree` 操作耗时 4-5s），属于环境时序相关的既有 flaky，非本次改动引入的回归。
- `pnpm test:browser`（Playwright，系统 Google Chrome 153.0.8010.53，9 个包）：232/232 通过，零重试。
- `pnpm docs:build`（VitePress）：exit 0。

## 总表

| 功能 | 用途 | 发布状态 | 默认开启 | 开启配置 | 代码 | 单元/构建 | 桌面浏览器 | 手机 | 最高等级 | 主要缺口 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. 清单链接注入 (ADR-0022) | 构建期注入 `<link rel="manifest">` | npm 0.1.0 | 是 | 无 | [manifest-link.ts](../../packages/vite/src/manifest-link.ts) | build test | [manifest-link.spec.ts:11](../../packages/vite/browser-tests/manifest-link.spec.ts#L11) | 未确认（间接） | L3 | 无 Firefox/Safari E2E；Nuxt 无此注入 |
| 2. 安装元数据扩展字段 (ADR-0037) | `description/categories/orientation/displayOverride/screenshots/shortcuts` | npm 0.1.0（beta.1 引入） | 否（未写字段则不变） | `PwaInstallMetadata` 字段 | [identity.ts:39-58](../../packages/contracts/src/identity.ts#L39) | `manifest-extensions-build.test.ts` | `manifest-extensions.spec.ts`（存在，断言未逐条核验） | 未确认（富安装对话框无专项记录） | L2（L3未核实内容） | 未读 E2E 断言体；无真机富对话框记录 |
| 3. 清单图标校验 (ADR-0040) | 校验 `install.icons` 文件存在且类型/尺寸匹配 | npm 0.2.0（commit 815ff0b） | 是（无开关） | 无 | [manifest-icons.ts](../../packages/vite/src/manifest-icons.ts) | [manifest-icon-validation-build.test.ts:89-148](../../packages/vite/test/manifest-icon-validation-build.test.ts#L89) | 无专项 | Android 真机安装记录（该 bug 的修复动因） | L2+L4 | 0.1.0 消费者无此保护，0.2.0 起随 `@pwa-platform/vite` 发布 |
| 4. SW 注册与 scope | 客户端在 `identity.scope/serviceWorkerUrl` 注册 | npm 0.1.0 | 是 | `identity.scope`/`serviceWorkerUrl` | [identity.ts:4-15](../../packages/contracts/src/identity.ts#L4) | `build-config.test.ts` | [registration.spec.ts:8-49](../../packages/vite/browser-tests/registration.spec.ts#L8) | Android/iPhone 多处记录（作为前置条件）；2026-09-28 两机 Android 轮次首次在线访问 registered（[verification.md:292](../../tasks/stable-release-qualification/verification.md#L292)）、iPhone Vue 0.2.1 首次访问 registered（[:325](../../tasks/stable-release-qualification/verification.md#L325)） | L3+L4 | 无跨浏览器 |
| 5. 预缓存/应用外壳 (ADR-0011) | 平台计算 precache 清单并注入 `__WB_MANIFEST` | npm 0.1.0 | 是（结构性） | 资源规则 in `PwaPolicy` | [precache.ts](../../packages/core/src/precache.ts) | [precache.test.ts:47-138](../../packages/core/test/precache.test.ts#L47) | `registration.spec.ts:40,49` | Android/iPhone 安装记录（外壳可离线加载）；2026-09-28 两机 Android 轮次原生安装+断网冷启动（[verification.md:293-294](../../tasks/stable-release-qualification/verification.md#L293)）、iPhone Vue 0.2.1 主屏幕安装+断网冷启动（[:326-327](../../tasks/stable-release-qualification/verification.md#L326)） | L2+L3+L4 | Workbox 7.4.1 类型/运行时不一致（已处理，需关注升级） |
| 6. 导航回退链 (ADR-0034) | 精确命中→丢查询串→`index.html`→离线页 | npm 0.1.0 | 是（不可配） | 无 | [decide.ts:166-173](../../packages/sw-runtime/src/worker/decide.ts#L167) | [decide.test.ts:159-247](../../packages/sw-runtime/test/worker/decide.test.ts#L159) | 未找到专项 E2E | ADR 背景本身是一次 Cloudflare 真实部署故障记录 | L2+L4 | 无根 shell SPA 回退——history 路由深链离线时得到网络错误而非离线页 |
| 7. 平台默认离线页 (ADR-0036) | 可选、本地化(zh-CN/en)、CSP 哈希、探测重连 | npm 0.1.0（beta.1 引入） | 否（`pwa({ offlinePage })` 显式开启） | `offlineFallback.path` 等 | [offline-page-style.ts](../../packages/vite/src/offline-page-style.ts) | `offline-page-build.test.ts` | [offline-page.spec.ts:33-209](../../packages/vite/browser-tests/offline-page.spec.ts#L33) | `docs/guides/offline-page.md:89` Android+iPhone 双端实测；2026-09-28 两机 Android 轮次断网访问未缓存路径→英文离线页（[verification.md:295](../../tasks/stable-release-qualification/verification.md#L295)）、iPhone Vue 0.2.1 断网访问未缓存路径（`lang=en`，[:328](../../tasks/stable-release-qualification/verification.md#L328)） | L3+L4 | 文档自称"单设备证据"；Nuxt 暂不支持 |
| 8. 默认拒绝缓存基线 | 私有数据/写请求/流/未分类请求默认不缓存 | npm 0.1.0 | 是（不可配） | 无（`allow/deny` 规则可开白名单） | [decide.ts:99-105](../../packages/sw-runtime/src/worker/decide.ts#L99) | [decide.test.ts:67-422](../../packages/sw-runtime/test/worker/decide.test.ts#L67) | [offline.spec.ts:62,72,103](../../packages/sw-runtime/browser-tests/offline.spec.ts#L62)（主会话核实，纠正首轮取证的"仅 L2"） +[deny-classes.spec.ts](../../packages/sw-runtime/browser-tests/deny-classes.spec.ts)（非导航五类请求 × 在线/断网，[#32](https://github.com/haigeerlab/pwa-platform/pull/32)） | 未确认 | L3 | V1 矩阵要求的四类请求（含非导航）均有 L3；仅 Chrome，另有 WebKit/Firefox 引擎冒烟 |
| 9. 网络超时 (ADR-0038) | `networkTimeoutSeconds`(1-30) 超时改走缓存/离线页 | npm 0.1.0（beta.1 引入） | 否 | `networkTimeoutSeconds?: number` | [runtime.ts:25](../../packages/engine-workbox/src/worker/runtime.ts#L26) | `config.test.ts`/`shared-config.test.ts` bounds | [network-timeout.spec.ts:108-223](../../packages/sw-runtime/browser-tests/network-timeout.spec.ts#L96) | `docs/guides/network-timeout.md:71` iPhone 16 Pro/iOS 27 实测 60s→5s | L2+L3+L4 | 单设备证据；无 Android 计时记录 |
| 10. Range 请求绕过预缓存 (ADR-0023) | 带 `Range` 头的非导航请求直连网络 | npm 0.1.0 | 是（结构性） | 无 | [decide.ts:27-33](../../packages/sw-runtime/src/worker/decide.ts#L27) | [decide.test.ts:89-346](../../packages/sw-runtime/test/worker/decide.test.ts#L89) | [range-request.spec.ts:11-35](../../packages/sw-runtime/browser-tests/range-request.spec.ts#L11) | 无 | L2+L3 | 无真实 `<video>` 流媒体真机测试 |
| 11. Identity 不可变/缓存命名空间 (ADR-0004/0008/0009) | 生产注册后 8 字段不可变，命名空间随身份派生 | npm 0.1.0 | 是（治理规则） | `PwaIdentity` 全字段 | [identity.ts:4-15](../../packages/contracts/src/identity.ts#L4)、[cache-namespace.ts:12-35](../../packages/contracts/src/cache-namespace.ts#L12) | [baseline.test.ts:93-131](../../packages/build-verifier/test/baseline.test.ts#L93)（字段漂移逐项报告，含尾斜杠/大小写/百分号编码差异） | [release.spec.ts:64](../../packages/examples-browser-e2e/browser-tests/release.spec.ts#L83) 在真实浏览器发布检查中执行 `identity-baseline` | 无 | L3 | 漂移检测已有断言；`requiredReleaseChecks(plan)` 按拓扑给出必需检查集（[#29](https://github.com/haigeerlab/pwa-platform/pull/29)），scope 超出 worker 目录在构建期拒绝（[#27](https://github.com/haigeerlab/pwa-platform/pull/27)）；门禁仍由发布系统组合 |
| 12. 客户端门面与生命周期事件 (ADR-0013) | `createPwaClient()` 门面，5 个页面可见事件 | npm 0.1.0 | 是（调用即生效） | `PwaClientConfig` | [facade.ts:88](../../packages/client-runtime/src/client/facade.ts#L88) | [facade.test.ts:378-909](../../packages/client-runtime/test/client/facade.test.ts#L378) | [handover.spec.ts:14-41](../../packages/examples-browser-e2e/browser-tests/handover.spec.ts#L14) | Android WebAPK / Mac Safari 记录 | L2+L3+L4 | 3 个 worker 侧事件（activated/offline-fallback/cache-cleaned）无传输，仅 L1 |
| 13. 手动/自动更新检查 (ADR-0020) | `checkForUpdate()` 手动 + 可选轮询 | npm 0.1.0 | 手动开；自动轮询默认关 | `updateCheck.intervalMs`(≥60000) | [update-check.ts:10-15](../../packages/client-runtime/src/client/update-check.ts#L10) | [facade.test.ts:772-866](../../packages/client-runtime/test/client/facade.test.ts#L772)（`checkForUpdate` describe）+[facade.test.ts:1284-1600](../../packages/client-runtime/test/client/facade.test.ts#L1284)（`updateCheck.intervalMs` 校验与自动轮询） | [update-check.spec.ts](../../packages/client-runtime/browser-tests/update-check.spec.ts) | 无：真机记录中的更新检测都直接调用浏览器原生 `registration.update()`（如 [verification.md:296](../../tasks/stable-release-qualification/verification.md#L296)、[:311-312](../../tasks/stable-release-qualification/verification.md#L311)），没有经过 `checkForUpdate()` 或 `updateCheck` 定时检查 | L2+L3 | React 绑定"无真实渲染测试"（ADR 自述）；无 24h+ 真机长时驱动记录；仅 Chrome，2026-09-29 起另有 WebKit/Firefox 引擎冒烟（ADR-0042） |
| 14. 更新提示流程+多标签协调 (ADR-0005/0026) | `update-waiting`→`applyUpdate()`→每个曾提示的标签独立收到 `update-applied` | npm 0.1.0 | 是（`updateMode` 仅 `"prompt"`） | 无开关 | [facade.ts:70,197-230](../../packages/client-runtime/src/client/facade.ts#L70) | [facade.test.ts:524-609](../../packages/client-runtime/test/client/facade.test.ts#L524) | [update.spec.ts:56](../../packages/examples-browser-e2e/browser-tests/update.spec.ts#L56)（多标签一次确认清空所有提示） | `tasks/stable-release-qualification/verification.md:46` 桌面 React 30 分钟重提醒+双标签；Android Vue 完整更新；**iPhone 16 Pro / iOS 27 安装窗口 Vue/React 真实 v1→v2（含“v2 已下载后断网接管并离线显式刷新”）通过**（[verification.md:138-159](../../tasks/stable-release-qualification/verification.md#L138)）；iPhone Safari 同 scope 双标签协调通过（[:161-168](../../tasks/stable-release-qualification/verification.md#L161)）；2026-09-28 两机 Android 轮次更新检测+默认提示+接管+刷新（[:296](../../tasks/stable-release-qualification/verification.md#L296)）、iPhone R9 复核安装窗口更新提示+接管+显式刷新（[:315](../../tasks/stable-release-qualification/verification.md#L315)）、iPhone Vue 0.2.1 恢复 worker 后更新提示流程（[:330](../../tasks/stable-release-qualification/verification.md#L330)） | L2+L3+L4 | iPhone 离线恢复后短暂 `not registered`，根因已定位并由 ADR-0043 修复（见"每项详情"#14），修复 237ec67 与其后续回归 N1 的修复（#60）均随 **npm 0.2.3** 发布（0.2.2 已准备但未发布） |
| 15. 可选默认更新提示 UI (ADR-0039) | `PwaUpdateNotice`（Vue/React），显式挂载 | npm 0.1.0（beta.2 起） | 否（需显式 import/挂载） | `position/messages/colors/reloadPage` | [ui.ts:37-59](../../packages/react/src/ui.ts#L42) | 未发现（`react/test`、`vue/test` 均无 UI 组件单测，主会话核实） | [update-notice.spec.ts:27-127](../../packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts#L27)（vue+react ×7 场景；2026-09-28 起随 `pnpm test:browser` 进入阻塞门禁，此前无任何脚本调用）；2026-09-28 新增 `locale="en"` 与英文覆盖用例（[#31](https://github.com/haigeerlab/pwa-platform/pull/31)） | Android+iPhone 仅英文文案实测；中文真机"另列待测" | L3 | 内置文案表有单元测试，组件合并逻辑只有 L3（包边界禁止 DOM 渲染器）；主题仍无 `setPwaTheme` |
| 16. 恢复 worker (ADR-0012) | 无 fetch 的应急 worker：删本应用缓存/过期记录/离线写队列/取消推送后 `clients.claim` | npm 0.1.0 | 需运维部署（非自动） | `PwaRecoveryWorkerConfig` | [recovery-worker/index.ts:22-32](../../packages/sw-runtime/src/recovery-worker/index.ts#L22) | [recovery-worker.test.ts:132-362](../../packages/sw-runtime/test/worker/recovery-worker.test.ts#L132) | [recovery.spec.ts:79-136](../../packages/examples-browser-e2e/browser-tests/recovery.spec.ts#L79)；R14 两条（接管不等待清理、持有数据库连接时仍完成，[#39](https://github.com/haigeerlab/pwa-platform/pull/39)）；删除失败两条（故障注入测试构建，Chrome/WebKit/Firefox，[#49](https://github.com/haigeerlab/pwa-platform/pull/49)，其中 WebKit/Firefox 来自不阻断的 `engines` job，ADR-0042，仅 push to main/nightly 触发，非 PR 门禁） | 2026-09-28 两机 Android 轮次（Xiaomi+Samsung）恢复 worker 接管+仅删本应用前缀+`images-v1` 保留+断网网络错误+修复后恢复离线启动，[verification.md:297-298](../../tasks/stable-release-qualification/verification.md#L297)；iPhone Vue 0.2.1（iPhone 16 Pro/iOS 27.0）同场景，[:329-330](../../tasks/stable-release-qualification/verification.md#L329) | L2+L3+L4 | 已受控页面在清理完成前被接管（不拦截请求，非安全缺陷，ADR-0012 增补）；删除失败时逐项尝试、不 claim（[#49](https://github.com/haigeerlab/pwa-platform/pull/49)，npm 0.2.1 起）；WebKit/Firefox 的删除失败覆盖来自不阻断的 `engines` job（ADR-0042，仅 push to main/nightly 触发，不在 PR 门禁中运行）；R14 残留（`blocked` 被当作删除失败）已修复，最多等待 3 秒（[#67](https://github.com/haigeerlab/pwa-platform/pull/67)，npm 0.2.3） |
| 17. 入口韧性恢复页+清单 (ADR-0017→ADR-0033)+HTML 头检查 (ADR-0032) | Origin 不可达时显示备用入口页；构建期检查公开 HTML 的 `Cache-Control` | npm 0.1.0（新增） | 否（需调用 `checkEntryRecovery()`/挂载） | 清单 `sequence/expiry/origin/startPath/entries≤5` | [check.ts](../../packages/entry-resilience/src/check.ts) | 12+ 个单测文件；[html-headers.test.ts:39](../../packages/build-verifier/test/html-headers.test.ts#L39) | [scenarios.spec.ts:147-396](../../packages/entry-resilience/browser-tests/scenarios.spec.ts#L147)；`html-headers` 真实响应头检查（[#33](https://github.com/haigeerlab/pwa-platform/pull/33)） | iPhone 16 Pro / iOS 27.0 单 Origin 入口恢复演练（R3，2026-09-28，**部分完成**）：基线/计划迁移展示与跳转/序号与形状校验/当前 Origin 不可达+已存 `migrating`→展示入口按钮 四步"通过"；`unconfirmed-outage`、整机离线不误报、过期三步**未执行**，受 iOS 故障注入方法限制（HTTP 代理/PAC 拦不住 iOS HTTP/3、Cloudflare WARP 转发破坏 TLS、同机无法为 iPhone 提供自建 DNS），[verification.md:334-354](../../tasks/stable-release-qualification/verification.md#L334) | L3+L4（部分） | `release-retention` 的可用资产取自构建产物而非服务器响应；iPhone 单 Origin 故障恢复仍缺 `unconfirmed-outage`/离线不误报/过期三项真机验证，需在不经过 WARP 的网络设备上补测 |
| 18. 在线/离线状态 API | 公开 `client.isOnline`/`onOnlineChange` 类 API | — | — | — | 不存在（主会话确认：grep `online`/`navigator.onLine` 仅命中 [offline-page.ts:60](../../packages/vite/src/offline-page.ts#L60) 离线页自身探测） | — | — | — | 不提供 | 无公开在线/离线状态 API；仅离线页内部探测 |
| 19. 登出 (ADR-0013) | 仅注销注册，**不删除任何缓存** | npm 0.1.0 | 显式调用 | 无 | [facade.ts:477](../../packages/client-runtime/src/client/facade.ts#L477) | [facade.test.ts:611-685](../../packages/client-runtime/test/client/facade.test.ts#L611)；`package-boundaries.test.ts`（源码扫描守护 `caches` API 不出现） | [handover.spec.ts:41](../../packages/examples-browser-e2e/browser-tests/handover.spec.ts#L41) | 未确认 | L2+L3 | 缓存保留半的"存活"断言未逐行定位 |
| 20. 安装提示处理 | 包装 `beforeinstallprompt`/`appinstalled` | npm 0.1.0 | 依赖 `installEnabled`+安装元数据 | `installEnabled: boolean` | [facade.ts:369-390](../../packages/client-runtime/src/client/facade.ts#L369) | [facade.test.ts:783-857](../../packages/client-runtime/test/client/facade.test.ts#L783) | [install.spec.ts:158](../../packages/examples-browser-e2e/browser-tests/install.spec.ts#L158)（明确标注"wiring only"，非真实系统安装） | `tasks/stable-release-qualification/verification.md:39-41` Android WebAPK 真装+Mac Safari 添加到程序坞；2026-09-28 两机 Android 轮次原生安装（Chrome 富安装面板→WebAPK→`display-mode: standalone`，[verification.md:293](../../tasks/stable-release-qualification/verification.md#L293)）、iPhone Vue 0.2.1 主屏幕网页 App 安装（[:326](../../tasks/stable-release-qualification/verification.md#L326)） | L2+L3+L4 | 自动化安装覆盖仅"模拟事件"；非 Chromium 安装校验被 `test.skip` 显式跳过；iPhone 完整装-更周期未确认 |
| 21. 公开读运行时缓存 (ADR-0035, PwaPolicy v3) | 同源公开 GET 的 network-first/SWR 运行时缓存 | npm 0.1.0（beta.1 起） | 否（`runtimeCache.enabled`） | `enabled/maxEntries(1-200)/maxEntryBytes(1-1048576)/maxAgeSeconds(60-604800)` | [policy.ts:84-99](../../packages/contracts/src/policy.ts#L84) | 10+ 单测文件；[admit.ts](../../packages/sw-runtime/src/worker/admit.ts) | [runtime-cache.spec.ts](../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)（network-first/SWR/准入/过期/LRU/配额/Set-Cookie 探针）；R1 带 `Authorization` 的导航、R8 准入诊断（[#27](https://github.com/haigeerlab/pwa-platform/pull/27)） | 无 | L3 | Android/N-1 未取得；配额清理已覆盖未创建的引擎（[#41](https://github.com/haigeerlab/pwa-platform/pull/41)），真实 Chrome 耗尽配额用例（[#48](https://github.com/haigeerlab/pwa-platform/pull/48)）；N3（新版本安装期预缓存超配额误删旧版本运行时缓存）已修复（[#68](https://github.com/haigeerlab/pwa-platform/pull/68)，npm 0.2.3） |
| 22. 策略编译器 allow-under-deny (ADR-0002/0007) | 拒绝"deny 前缀下声明 allow"的非法策略 | npm 0.1.0（基线） | 是（编译期强制） | 无 | [rules.ts:53](../../packages/core/src/rules.ts#L53) | [rules.test.ts:128-167](../../packages/core/test/rules.test.ts#L128) | 无（纯编译期错误，无浏览器可观察行为） | 无 | L2 | 未完整读取 `rules.ts`/`compile.ts` 全文 |
| 23. 离线写队列 (ADR-0027) | 显式、会话绑定、worker 中转的写请求队列，重连后重放 | **仅工作区**（`private:true`，未发布） | 由 `PwaOfflineWritePolicy` 门控 | `offlineWrites` on `PwaPolicyV2/V3` | [offline-write/src/index.ts](../../packages/offline-write/src/index.ts) | [offline-write-intent.test.ts](../../packages/sw-runtime/test/worker/offline-write-intent.test.ts) | [offline-write.spec.ts](../../packages/sw-runtime/browser-tests/offline-write.spec.ts)；并发 flush 单飞（[#30](https://github.com/haigeerlab/pwa-platform/pull/30)） | 无 | L3 | 仍未发布；设计上不保证恰好一次投递，依赖服务端幂等；N2 flush 补跑一轮（[#69](https://github.com/haigeerlab/pwa-platform/pull/69)，worker 端随 `sw-runtime` 0.2.3 发布，离线写包本身仍未发布） |
| 24. 推送 (ADR-0021) | 平台 worker 集成 Web Push：订阅/展示/点击跳转 | **仅工作区**（`private:true`，未发布） | 由是否注册 push 模块决定 | 无独立开关 | [push/src/client/index.ts](../../packages/push/src/client/index.ts) | [push-notification.test.ts](../../packages/sw-runtime/test/worker/push-notification.test.ts) | [client.spec.ts](../../packages/push/browser-tests/client.spec.ts)、[push.spec.ts](../../packages/sw-runtime/browser-tests/push.spec.ts)；**经真实 FCM 送达**：[push.network.spec.ts](../../packages/examples-browser-e2e/browser-tests-network/push.network.spec.ts)（[verification.md:100-104](../../tasks/push-module/verification.md#L100)，`--repeat-each 5` 20/20） | 无 | L3 | 联网套件 2026-09-28 起进入门禁但不阻塞；Android/iPhone 推送未验证 |
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
- 手机：`tasks/stable-release-qualification/verification.md:110` — Android 原生安装入口因 1×1 占位 PNG 而失效，修复后安装 WebAPK `org.chromium.webapk.a26b75328c3f9eda4_v2`，设备本地时间 2026-09-27 14:17:37。这是本功能存在的直接动因。
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
- 手机：`tasks/stable-release-qualification/verification.md:46` 桌面 Chrome React 30 分钟重提醒+双标签隔离；Android Vue 完整版本升级+离线刷新；**更正（2026-09-28）**：审查时 iPhone 安装窗口内更新尚未复测；PR #25 随后补齐了 iPhone Vue/React 安装窗口真实 v1→v2（含断网已下载后接管）与 Safari 双标签协调，见 `verification.md:138-168`。`release-0.1.0.md:9` 记录 iPhone Safari 离线恢复后瞬时报告 `not registered`（App relaunch 后自愈），根因未定位，列为已知开放风险而非阻断项。
- **R9 根因定位与修复（2026-09-28）**：`register()` 在 Service Worker 任务队列中排在挂起的 update 之后；真机 iPhone 上断网请求挂起而非失败，已在真机确认该排队机制（[verification.md:311-314](../../tasks/stable-release-qualification/verification.md#L311)）。修复见 ADR-0043（`237ec67`），改为回访时以浏览器既有活动注册为准，不再等待挂起的 `register()`；修复构建在真机 iOS 在线/离线回归通过，界面层 `not registered` 现象本轮未复现，继续观察（[verification.md:307-317](../../tasks/stable-release-qualification/verification.md#L307)）。`237ec67` 未进入 npm `0.2.1`；0.2.2 准备后未发布，该修复随 **npm `0.2.3`**（2026-09-28）发布，见[发布记录](../../tasks/package-distribution/release-0.2.3.md)。
- **后续回归 N1（已修复，2026-09-28）**：R9 修复引入的 `register()` 采纳既有注册路径存在一个后续 bug——若既有注册恰好正在安装一个新版本、且其 `updatefound` 在门面开始监听前已触发，`watchForUpdates` 此前只看 `waiting` 与之后的 `updatefound`，导致页面终生都不会收到 `update-waiting`。修复为 PR [#60](https://github.com/haigeerlab/pwa-platform/pull/60)：门面开始观察时也监听既有 `installing` worker，新增 2 个 `client-runtime` 单元测试；与 R9 一同随 npm `0.2.3` 发布。

### 15. 可选默认更新提示 UI
- 纠正说明：主会话核实 `react/test`、`vue/test` 目录**均无** `PwaUpdateNotice` 组件单测（首轮取证标记为"待确认"），但 L3 E2E 确凿存在：`update-notice.spec.ts:27-127`，7 个场景 ×{vue, react}（等待/稍后/重试/接管/刷新、失败重试不重复 apply、位置+CSS 变量覆盖+320px 窄视口、`colors` prop 覆盖、30 分钟再提醒、明暗对比度）。
- i18n/主题：**更正（2026-09-28）**：本条此前记为"仅内置 zh-CN，无 locale 字段/en 内置表"，已过时，与总表矛盾。`react/src/ui.ts`、`vue/src/ui.ts` 均已内置 `PwaUpdateNoticeLocale = "zh-CN" | "en"` 与 `PWA_UPDATE_NOTICE_MESSAGES`（含 `zh-CN`/`en` 两套文案表），通过 `locale` prop 选择（默认 `"zh-CN"`），`messages` prop 在所选 locale 之上做逐键覆盖（`react/src/ui.ts:6-7,42,73-76,88,184`；`vue/src/ui.ts:6-7,33,64-67,76,85,181`）；`update-notice.spec.ts:127`（`locale "en" renders the built-in English copy`）验证内置英文文案，`:142` 验证 `messages` 覆盖在所选 locale 上生效。主题走 `colors` prop + `--pwa-update-*` CSS 变量 + `prefers-color-scheme`（`update-notice.css:94`），**没有** `data-theme`/`setPwaTheme` 这类显式切换 API（`setPwaTheme` 只存在于 `entry-resilience/src/client/index.ts:51`，服务于恢复页，与更新提示 UI 无关）。
- 手机：Android(React/Vue)+iPhone(Vue) 已实测英文文案；中文真机渲染文档中明确"另列待测"。

### 16. 恢复 worker
- 待验证假设（风险 R14）：E2E 已观察到清理完成前发生 `controllerchange`（`examples-browser-e2e/browser-tests/recovery.spec.ts:66-72`），但尚未在真实浏览器中注入 Cache/IndexedDB 删除失败来验证：失败时是否已提前接管页面、旧敏感状态是否残留、是否出现白屏。未验证前不列为确定缺陷。
  - **更新（2026-09-28）**：已验证（[#39](https://github.com/haigeerlab/pwa-platform/pull/39)、[#49](https://github.com/haigeerlab/pwa-platform/pull/49)）。失败时已受控页面照样被接管、未受控页面不被 claim、残留不会被用来应答；第一次失败曾中止全部后续删除（含离线写数据库），已修复为逐项尝试。
- 未验证/风险：`docs/operations/recovery-drill.md` 存在于仓库（本次核查确认文件在目录中），但其中是否已填写 0.1.0 的真机恢复演练记录未在本次核查中打开确认。
- **手机（2026-09-28 增量复审补入）**：0.2.1 两机 Android 真机轮次（Xiaomi 14 + Samsung Galaxy A24，均 Android 16 / Chrome 153）——恢复 worker 接管、只删除本应用 `pwa:<app>:test:` 前缀、页面预置的 `images-v1` 保留、断网请求得到网络错误、修复 worker 后恢复离线启动，四台组合全部"通过"（[verification.md:297-298](../../tasks/stable-release-qualification/verification.md#L297)）；iPhone Vue 0.2.1（iPhone 16 Pro / iOS 27.0）同场景，含删除 `pwa:pwavuedrill:test:r1:precache`、断网请求 5 秒后中止而非应答、修复后恢复离线启动，全部"通过"（[verification.md:329-330](../../tasks/stable-release-qualification/verification.md#L329)）。

### 17. 入口韧性+HTML 头检查
- 信任模型变更：ADR-0017（Ed25519 签名清单）被 ADR-0033 取代（平台不再验签），最终随 0.1.0 发布的是 ADR-0033 模型（应用侧 `updateEntryManifest(data)`，平台只校验形状/新鲜度/序号，无加密）。
- html-headers 缺口：`build-verifier/test/html-headers.test.ts`、`release-gate.test.ts:64`、`report.test.ts:84-89` 提供扎实的 L2（vitest 合成头输入）覆盖，但 `examples-browser-e2e/browser-tests/release.spec.ts:64` 显式断言真实浏览器发布检查列表为 `["artifacts", "response-headers", "identity-baseline"]`——**不含** `html-headers`/`release-retention`，即这两项从未在真实服务器响应头上端到端跑过。
- **手机（2026-09-28 增量复审补入）**：iPhone 16 Pro / iOS 27.0、React Drill 主屏幕网页 App，单 Origin 故障演练（R3，部分完成，`docs/operations/entry-recovery-drill.md` 步骤编号）：1 基线空清单接受、2 计划迁移展示入口并正确跳转带 `pwa-return`、3 序号与形状边界（低序号/非法路径/超 5 条/已过期/超 30 天全部正确拒绝）、4a 当前 Origin 不可达+已存 `migrating`→展示入口按钮，四步"通过"；4b 当前 Origin 不可达+已存 `normal`→`unconfirmed-outage`、5 整机离线不误报、6 过期三步**未执行**——未取得可靠的单 Origin 故障环境：手机侧 HTTP 代理/PAC 拦不住 iOS 的 HTTP/3（QUIC 绕过被拒的 TCP 连接直连成功）、开启 Cloudflare WARP 转发的 Mac 会以自签 CA 破坏 TLS、同一台 Mac 也无法为 iPhone 提供自建 DNS（WARP 占用 `:53`，转发请求未到达手机）。Android 上同一判定已在 0.1.x 轮次通过。详见 [verification.md:334-354](../../tasks/stable-release-qualification/verification.md#L334)。

### 18. 在线/离线状态 API
- 结论（主会话核实）：`client-runtime`/`vue`/`react` 源码中对 `online`/`navigator.onLine` 的引用为零；唯一命中是 `vite/src/offline-page.ts:60`——离线兜底页自身的同源探测逻辑，不是面向应用的公开 API。因此本平台**没有** `client.isOnline`/`onOnlineChange` 类接口。

### 20. 安装提示处理
- 手机：`tasks/stable-release-qualification/verification.md:39` Android Chrome 153 Vue 真实 WebAPK 安装（`org.chromium.webapk.a5be8b3d54eb30ac0_v2`，2026-09-26 19:09:33 设备本地时间），CDP 确认 `display-mode: standalone = true`；`:40` Mac Safari 18.6 "添加到程序坞"真实流程，独立窗口 standalone 确认，React 端瞬时 `no-registration→prompt` 状态记录为预期内非故障；`:41` 该窗口的在线场景复测（更新/离线尚未在该具体安装窗口重跑）。
- 未验证/风险：`install.spec.ts:135`（原文引用行号，编号或有偏移）使用 `test.skip(true, "未取得：非 Chromium 浏览器，无法通过 CDP 复核安装条件（按规格跳过）")`——按规格显式跳过而非静默通过；自动化安装覆盖本身标注为"wiring only"（模拟 `beforeinstallprompt`/`appinstalled` 事件派发），非真实系统级安装动作。

### 21. 公开读运行时缓存
- 探路记录：ADR-0035"探路记录"一节记载了 5 项在临时目录中用真实 Chrome 153 桌面+Playwright 1.63 做的手工探测（Set-Cookie 可见性、LRU+配额全清行为、缓存副本头剥离、导航事件投递、离线/SWR 后台更新），代码未入库——按本台账口径记为"文档级 L3"，不是仓库内可重跑的证据。
- 未验证/风险：Android/N-1 真机证据规格自述"按惯例登记为未执行，不折算为通过"；配额错误清理是引擎实例级注册的回调，若某类 runtime cache 引擎按当前生命周期尚未实例化，配额回调不会注册，可能残留写入失败（风险 R12，P3，`engine-workbox/src/worker/runtime.ts:131-148` vs `sw-runtime/src/worker/handlers.ts:372-416` 惰性实例化）。
  - **更新（2026-09-28）**：已修复（[#41](https://github.com/haigeerlab/pwa-platform/pull/41)）并有真实 Chrome 用例（[#48](https://github.com/haigeerlab/pwa-platform/pull/48)）；实测缺口还包括已构建引擎在本次生命周期未读写过的缓存。

### 23. 离线写队列
- 风险（审查风险 R5，P2）：两个标签同时 flush 都能读到同一条 `pending` 记录，并携带相同幂等键并行发起写请求；服务端幂等处理不当时会产生重复副作用。相关代码：`handlers.ts:119-121`、`offline-write-store.ts:72-95`、`offline-write-flush.ts:12-26`。未见并发 flush 场景的自动化测试。

### 24. 推送
- **纠正说明（2026-09-28）**：首轮取证漏看了联网套件。`browser-tests-network/push.network.spec.ts` 已经过真实 FCM 完成订阅、合格推送展示、不合格推送不展示、取消订阅后 404/410 四个场景（[verification.md:100-104](../../tasks/push-module/verification.md#L100)）；它此前只能手动运行，2026-09-28 起列入门禁但不阻塞（spec/push-module.md 增补）。下一条描述的是默认离线套件中的情形。
- 未验证/风险：`push/browser-tests/client.spec.ts` 明确展示 `subscribePush` 使用合法 VAPID key 时因"测试环境无可达推送服务"而 reject（`push.subscribe-failed`）——即便是 L3 也只覆盖客户端注册半程和 worker 侧通知渲染半程，服务端→推送服务→浏览器的完整投递路径在本仓库测试体系中从未被验证过。

## 已知未验证清单

1. ~~非 Chromium 自动化为零~~ **已解决（2026-09-28）**：sw-runtime 套件在 WebKit 与 Firefox 上以不阻断方式运行（ADR-0042，[#37](https://github.com/haigeerlab/pwa-platform/pull/37)）；**2026-09-29** client-runtime 套件接入同一冒烟（22 个用例，1 个 Firefox 跳过，ADR-0043 已记录的引擎差异）；其余 7 个包仍只有 Chrome，Safari/iOS 仍只能靠真机。
2. **Android N / N-1 轮换证据未收**：`spec/public-read-cache.md` 测试策略段自述"未取得的 Android、N-1 证据按惯例登记为未执行，不折算为通过"。
3. ~~iPhone 安装窗口内更新流程未复测~~ **已补齐（2026-09-28 更正）**：PR #25 在审查期间合入 iPhone 安装窗口真实 v1→v2 与 Safari 双标签证据（[verification.md:138-168](../../tasks/stable-release-qualification/verification.md#L138)）。
4. ~~iPhone 断网恢复后短暂 `not registered`~~ **根因查明并修复（2026-09-28）**：`register()` 在 Service Worker 任务队列中排在挂起的 update 之后；真机 iPhone 上断网请求挂起而非失败，并已确认该排队机制。ADR-0043 改为回访时以已有活动注册为准（[#54](https://github.com/haigeerlab/pwa-platform/pull/54)），修复构建在真机在线/离线回归通过；界面层现象本轮未复现，继续观察（[真机记录](../../tasks/stable-release-qualification/verification.md)）。
5. ~~push 无真实推送服务投递证据~~ **已更正（2026-09-28）**：联网套件已验证真实 FCM 送达（见“每项详情”#24），现随门禁不阻塞运行；手机端推送仍未验证。
6. ~~html-headers 与 release-retention 无真实服务器浏览器检查~~ **已解决（2026-09-28）**：`html-headers` 已在真实服务器响应上检查，`release-retention` 用两次真实构建的产物检查（[#33](https://github.com/haigeerlab/pwa-platform/pull/33)）；后者的可用资产取自磁盘而非服务器响应。
7. ~~offline-write 多标签并发 flush 无测试~~ **已解决（2026-09-28）**：单飞修复与两页面并发 flush 的真实浏览器用例（[#30](https://github.com/haigeerlab/pwa-platform/pull/30)）。
8. ~~mutation/stream/session-data 非导航请求逐类 E2E 缺失~~ **已解决（2026-09-28）**：非导航五类请求 × 在线/断网共 10 个 Chrome 用例（[#32](https://github.com/haigeerlab/pwa-platform/pull/32)）。
9. ~~identity 门禁是 opt-in~~ **已解决（2026-09-28）**：`requiredReleaseChecks(plan)` 按拓扑给出必需检查集，调用方不再手写清单（[#29](https://github.com/haigeerlab/pwa-platform/pull/29)）；是否执行门禁仍由发布系统决定（ADR-0025）。
10. ~~配额清理只有单元测试~~ **已解决（2026-09-28）**：真实 Chrome 用例用 DevTools 协议把源配额压到当前用量，在重启后的 worker 里触发一次 `QuotaExceededError`，断言 `runtime-pages` 与 `runtime-data` 都被清空、预缓存保留（[runtime-cache.spec.ts](../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)）；撤掉 [#41](https://github.com/haigeerlab/pwa-platform/pull/41) 的修复后该用例失败，两个运行时缓存都残留。Chromium 专有，WebKit/Firefox 跳过。
11. ~~恢复 worker 删除失败场景~~ **已解决（2026-09-28）**：只存在于测试构建的故障注入版恢复 worker 在真实 Chrome 中分别让缓存删除和离线写数据库删除失败（[offline-write.spec.ts](../../packages/sw-runtime/browser-tests/offline-write.spec.ts)）。测得第一次失败曾中止全部后续删除；现改为逐项尝试，失败时仍不 claim、不取消 Push。原受控页面照样在激活时被接管（见 ADR-0012 增补）。
12. **从打包产物安装已有阻断门禁**：新人接入冒烟（[#40](https://github.com/haigeerlab/pwa-platform/pull/40)）用本仓库打包的 tarball 离线安装、构建，并在 Chrome 中验证最小接入；它验证的是发布包的完整性，不替代真机证据。

## 如何维护本台账

- **新增功能**：在总表追加一行，详情按"每项详情"格式（覆盖场景、桌面浏览器版本+日期、手机设备/系统/浏览器/日期/证据文件、未验证与风险）补充小节；证据必须给出具体文件:行号（源码或测试）或具体记录文件路径，不接受"有测试文件"这类不指向断言的表述。
- **新增测试**：若新增的单元/构建断言把某功能从 L1 提升到 L2，或新增 Playwright 规格把某功能从 L2 提升到 L3，更新总表"最高等级"列与对应"单元/构建"或"桌面浏览器"列的链接，并在详情小节补一句纠正说明（参考本文件 #8、#15、#18 的写法：先写"纠正说明"，再给出新证据）。
- **新增真机记录**：手机记录必须落到具体证据文件（如 `tasks/*/verification.md` 的行号、`docs/guides/*.md` 的行号，或新建一份真机记录文档），在总表"手机"列写清设备型号+系统版本+日期，并在详情小节引用该文件。仅口头/聊天记录的真机验证不计入 L4。
- **升级等级的唯一依据**：找到断言本身（`expect(...)`、`toThrow`、`toEqual`，或真机记录里的具体现象描述+时间戳），而不是"这个包应该测过"之类的推断。如果暂时找不到对应断言，就在"主要缺口"/"未验证与风险"里如实写"未确认"，不要为了让表格好看而拔高等级。
- **发现证据被推翻**：若后续核查发现本台账某条判断有误（如本次复核对默认拒绝缓存、更新提示 UI、在线/离线 API 三处的纠正），比照本文件"每项详情"里的纠正写法：保留原判断的简述+标注"纠正说明"+给出新证据来源，不要直接静默改写旧结论。
