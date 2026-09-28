# 8 场景增量核验（HEAD dad5d1e，对照 eb5836e 时期的 05-scenario-recipes.md）

方法论：不复用旧审查结论，逐场景直接读 HEAD 代码重新核验，只引用本轮验证过的 file:line；测试标"单元"（vitest .test.ts）或"真实浏览器"（`browser-tests/` 下 playwright spec）。两份配置示例（路径一、路径五）已用当前 workspace 的 `packages/contracts/dist/index.d.ts` 跑 `tsc --noEmit --strict` 验证通过，无类型错误。

结论先说：eb5836e → HEAD 期间的 9 个相关 commit 里，**7 个已经被 website 文档吸收**（9b55a39/da45523 重写 + 若干 guide 页新增小节），旧审查文档 `docs/review/2026-09-27/05-scenario-recipes.md` 里"现有文档未覆盖"和"更新提示无 locale/无英文表"这两类结论现在是**过时/错误**的，不能再引用。仍然成立的差距只剩 2 处（见下方汇总表 G1、G2）。

---

## 1. 只启用应用壳（app shell only）/ SPA 深链接离线

**最小配置**（已 tsc 验证通过，类型 `PwaPolicyV1`/`PwaPolicy`，`packages/contracts/src/policy.ts:63-70`）：
```ts
import type { PwaPolicy } from "@pwa-platform/contracts";
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [],
};
```

**开启后实际行为**：`decide()`（`packages/sw-runtime/src/worker/decide.ts:99-146`）把每个 `navigation:true` 请求路由到 `navigate` 决策，附带 `navigationFallbacks()`（`decide.ts:166-186`）算出的候选顺序：请求路径本身 → 去 query 的同路径 → 该路径目录下 `index.html`（带/不带尾斜杠）→ 离线页（若开启，`decide.ts:188-190`）。**没有应用根 `index.html` 这一级候选**。`navigate()`（`packages/sw-runtime/src/worker/handlers.ts:323-384`）先走网络（可选 `networkTimeoutSeconds` 计时竞速），失败（`response.type==="error"` 或 fetch 被拒）才依次 `engine.match()` 候选，全部落空则 `Response.error()`（`fallbackResponse`，`handlers.ts:387-393`）。

**默认不配时行为**：`resources:[]` 时没有任何候选被 precache，只有请求路径本身/去 query 版本理论上可能命中（通常也不会命中，因为没预缓存），实际上等价于始终 `Response.error()`。

**可能白屏/失败的条件**：纯 history 路由的未预渲染动态路由（如 `/products/42`）离线刷新，且未开离线页 → 浏览器原生网络错误页，**不会**退回应用壳做客户端路由渲染。4xx/5xx 不算失败（见场景 2），原样透传。

**代码依据**：`packages/sw-runtime/src/worker/decide.ts:99-146,166-190`；`packages/sw-runtime/src/worker/handlers.ts:323-393`。

**测试依据**：单元 `packages/sw-runtime/test/worker/decide.test.ts:130-160`（候选链，无应用壳兜底）；单元 `packages/sw-runtime/test/worker/platform-worker.test.ts:198-203`（404 透传）；真实浏览器 `packages/sw-runtime/browser-tests/offline.spec.ts:8`（壳可离线打开）、`:32`（未缓存路由展示离线页）、`:41`（关闭离线页时网络错误而非壳）。

**与 05/网站的差异**：**无残留差异**。`website/guide/integration-by-capability.md:141-143` 的警告块已逐字匹配上述候选顺序，并明确说明不等价于 `vite-plugin-pwa` 的 `navigateFallback`。旧审查文档（`05-scenario-recipes.md:35`）当时提出的"缺失"已经被 9b55a39/da45523 吸收进网站正文。

---

## 2. 离线页（offline fallback page）

**最小配置**（`website/guide/integration-by-capability.md:150-172` 现有示例，未改动，类型仍是 `PwaOfflineFallback`/`PwaViteOfflinePageOptions`）：
```ts
offlineFallback: { enabled: true, path: "/offline.html" },
networkTimeoutSeconds: 5,
```
```ts
offlinePage: { locale: "zh-CN", messages: { heading: "网络暂时不可用" }, css: ".pwa-offline { --pwa-offline-accent: #006e52; }" }
```

**开启后实际行为**：`navigate()` 里判定失败的唯一标准是 `response.type !== "error"`（`packages/sw-runtime/src/worker/handlers.ts:333,356,379`）——HTTP 4xx/5xx 的 `response.type` 是 `"basic"`/`"cors"`，不是 `"error"`，原样返回，`response.status` 从未被检查。`networkTimeoutSeconds` 只作用于 `navigate()` 的计时竞速和两个 network-first 运行时缓存引擎，不作用于 `stale-while-revalidate`（`handlers.ts` `buildRuntimeEngines` 附近注释）。`offlinePage.css` 只会作为**第二个** `<style>` 追加在默认样式之后（`packages/vite/src/offline-page.ts:126-131`），不替换。

**默认不配时行为**：`offlineFallback.enabled:false` → 无离线页候选，见场景 1 的 `Response.error()`。

**可能白屏/失败的条件**：无（离线页本身就是顶替白屏的机制），但 4xx/5xx **不会**触发离线页，容易被误以为"任何非成功响应都进离线页"。

**代码依据**：`packages/sw-runtime/src/worker/handlers.ts:333,356,379`；`packages/vite/src/offline-page.ts:126-131`。

**测试依据**：单元 `packages/sw-runtime/test/worker/platform-worker.test.ts:198-203`（404 透传）、`:305-313`（5xx 在超时窗口内仍透传，计时器不触发）；真实浏览器 `packages/sw-runtime/browser-tests/offline.spec.ts:32`。4xx/5xx 透传目前**只有单元测试覆盖，没有真实浏览器 spec 单独验证**。

**与 05/网站的差异**：**无残留差异**。`website/guide/integration-by-capability.md:174` 已明确写"服务器如果确实返回了响应（包括 4xx、5xx），worker 会原样透传，不会显示离线页"；`website/guide/offline.md:45` 已明确写 `css` 只能追加、不能替换。旧审查文档标记的两处"缺失"（`05-scenario-recipes.md:82-84`）均已被 9b55a39/da45523 吸收。唯一可以算作"表述偏松"但不算错的点：`integration-by-capability.md:114` 汇总表格单元格写"`offlinePage.css` 覆盖"，单独看容易读成"替换"，但同文件正文（169 行示例、`offline.md:45`）已讲清楚是追加——不构成事实错误，不计入差距。

---

## 3. UI 多语言与主题（更新提示 / 离线页 / 恢复页）

**最小配置**（`PwaUpdateNoticeProps`，`packages/react/src/ui.ts:24-31`；Vue 同构，`packages/vue/src/ui.ts:82-89`）：
```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

<PwaUpdateNotice
  position="bottom-right"
  locale="en"                              // "zh-CN"（默认）| "en"，运行时选择
  messages={{ update: "Update now" }}      // 仅逐项覆盖，叠加在所选 locale 表之上
  colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }} // 无 theme/data-theme prop
/>
```

**开启后实际行为**（三个 UI 面各自独立，不共用一套多语言/主题机制）：

| UI | 内置语言 | 覆盖方式 | 主题 |
|---|---|---|---|
| 更新提示 | `zh-CN`(默认)/`en` 两套内置表，运行时 `locale` prop 切换 | `messages` 逐项覆盖，叠加在 `PWA_UPDATE_NOTICE_MESSAGES[locale]` 之上（`ui.ts:184` `{ ...PWA_UPDATE_NOTICE_MESSAGES[locale], ...overrides }`） | **仍然只有** `colors` prop（映射到 `--pwa-update-*` inline CSS 变量）+ 系统 `prefers-color-scheme`；无 `theme`/`data-theme` prop |
| 离线页 | `zh-CN`/`en`，构建期固定（`offlinePage.locale`） | `messages` 局部覆盖 | 默认跟随系统；CSS 支持 `data-theme` 选择器但无运行时脚本写入它 |
| 恢复页（entry-resilience） | `zh-CN`/`en`，构建期固定（`pwaEntryResilience({locale})`） | `messages` 局部覆盖 | 跟随 `setPwaTheme()` 写入的 `localStorage` 键 `pwa:theme:<appId>:<environment>`，优先级：应用显式 > 系统偏好 > 亮色默认 |

**默认不配时行为**：更新提示默认 `locale:"zh-CN"`；离线页/恢复页默认中文；三者主题都默认跟随系统。

**可能白屏/失败的条件**：无（纯展示层差异）。唯一容易踩的坑：把更新提示的"支持 locale"误当成"支持指定深浅色"——它不支持。

**代码依据**：react `packages/react/src/ui.ts:7,24-31,42-71,75-78,184`；vue `packages/vue/src/ui.ts` 同构；离线页 `packages/vite/src/offline-page.ts:10-20`（`PwaOfflinePageLocale`/`OFFLINE_PAGE_MESSAGES`）；恢复页 `packages/entry-resilience/src/vite/options.ts:15-27`、`src/page/messages.ts:34,60-66`、`src/client/index.ts:51-59`（`setPwaTheme`）。

**测试依据**：单元 `packages/react/test/ui-locale.test.ts:42-50`（"defaults to the Chinese copy"、"has an English table with all 12 keys"）；单元 `packages/vue/test/ui-locale.test.ts:43-49`（同名）；单元 `packages/react/test/ui-locale-parity.test.ts:13-19`（中英文表两包一致）；真实浏览器 `packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts:127`（`locale "en" renders the built-in English copy`，per-framework 参数化）；真实浏览器 `packages/entry-resilience/browser-tests/styling.spec.ts:135-232,243,263,273`（`setPwaTheme` 深浅色/对比度）。

**与 05/网站的差异（重要，这是本轮最大发现）**：旧审查文档 `docs/review/2026-09-27/05-scenario-recipes.md` 对"更新提示"的以下断言已被 **c22f3f3**（`feat(react,vue): built-in zh-CN and en update notice copy via locale`）证伪，**必须视为过时/错误**，不能再引用：
- 第 13 行（一页速查表）："更新提示无 locale/无英文表" —— 错误，现在两者都有。
- 第 106 行："`DEFAULT_MESSAGES` 硬编码中文……无内置英文表（全仓无第二套）" —— 错误，`EN_MESSAGES` 已存在（react `ui.ts:58-71`、vue 同构），且行号本身也因文件增长而漂移（当时引用 `ui.ts:37-50`，现在 `DEFAULT_MESSAGES` 在 react `ui.ts:42-55`）。
- 第 122 行示例注释："只能逐条覆盖 12 个 key，无 locale 字段" —— 错误，`locale` 字段已存在。
- 第 132 行对照表："locale: 不支持 | messages: 支持，无内置英文表" —— 两条都错误。
- 第 137 行："实际更新提示明显更弱（无 locale、无内置英文、无主题覆盖）" —— 前两个分句错误，"无主题覆盖"这一条**仍然成立**（更新提示确实没有 theme/data-theme prop，只有 `colors`），应保留。

`website/guide/integration-by-capability.md:19,24`（"多语言与主题怎么配置"表格及正文）**已经是当前代码的准确描述**，不需要再改。离线页目前没有找到独立的 `--pwa-offline-*` CSS 变量族（更新提示和恢复页各有一套变量表，离线页样式覆盖走 `offlinePage.css` 原样追加，不是变量契约）——若网站要补充这点，可在"多语言与主题"表格加一句区分。

---

## 4. 恢复页（entry-resilience）与 recovery worker 的区别

**最小配置**（`PwaEntryResilienceOptions`，`packages/entry-resilience/src/vite/options.ts:15-27`，已确认与 `website/guide/entry-resilience.md:27` 示例逐字段匹配）：
```ts
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";
pwaEntryResilience({ identity, maxValidityDays: 30, locale: "zh-CN" })
```

**开启后实际行为**：`decide()`（`packages/entry-resilience/src/decide.ts:34-57`）——`entries` 为空立即 `{kind:"none"}`（35-37 行）；`status==="migrating"||"incident"` 无条件展示全部声明入口，**完全不探测**（39-41 行）；只有 `status==="normal"` 才先探测主入口（46 行），不可达再对**每个**候选入口探测（不是命中第一个就停，43-45 行注释标注"independent review finding 2026-09-17"），全部不可达才 `none`，否则以 `unconfirmed-outage` 展示可达的那些（49-53 行）。探测固定 `PROBE_TIMEOUT_MS = 5_000`（`packages/entry-resilience/src/browser/probes.ts:10`），**无配置项**暴露它。恢复 worker（`packages/sw-runtime/src/recovery-worker/index.ts:24-93`）：`install` 阶段 `skipWaiting()`；`activate` 阶段删除本应用所有 `appCachePrefix` 缓存、workbox-expiration 记录、offline-write IndexedDB 库，全部成功后才取消 push 订阅并 `clients.claim()`；**与 entry-resilience 代码零交集**（entry-resilience 清单存在独立的 IndexedDB store，恢复 worker 的缓存清理不会碰到它，ADR-0018）。

**默认不配时行为**：未安装 `entry-resilience` 包/未部署 recovery worker，两者都不存在，无任何行为。

**可能白屏/失败的条件**：未在本轮验证范围（旧文档已标注"未验证"，本轮未新增故障注入测试）。

**代码依据**：`packages/entry-resilience/src/decide.ts:34-57`；`packages/entry-resilience/src/browser/probes.ts:10`；`packages/sw-runtime/src/recovery-worker/index.ts:24-93`；`docs/adr/0018-entry-resilience-delivery-boundary.md`。

**测试依据**：单元 `packages/entry-resilience/test/decide.test.ts`（9 个用例，行 26/34/44/54/62/69/75/87/110，覆盖空清单、migrating/incident 无探测、normal+主入口可达、unconfirmed-outage、全部不可达、探测抛错按不可达处理、"探测每个入口而非命中即停"）；真实浏览器 `packages/entry-resilience/browser-tests/scenarios.spec.ts:261`（"normal status with the main entry reachable: nothing is shown"）、`:271`（"only the current origin fails: a reachable alternate stays available"）、`:293`（设备离线不展示任何入口）、`:396`（"recovery worker coexistence: the stored manifest survives while the app's caches do not" —— 直接证明两者缓存命名空间隔离）；R9 相关单元 `packages/client-runtime/test/client/facade.test.ts:449,462`。`probes.test.ts` **没有用 fake timer 固定 5000ms 这个值**——该行为本身未被测试锁定，只能从源码常量读出。

**与 05/网站的差异**：`website/guide/entry-resilience.md:73` 已经把触发管线讲清楚（"只有 `normal` 状态下平台才会探测主入口……`migrating` 与 `incident` 不探测、直接展示"），**修复了**旧审查文档 `05-scenario-recipes.md:162` 当时标记的"缺失"。但旧审查文档同一节（`05-scenario-recipes.md:163-164`）提出的另外两条补充**仍未被采纳**，是本轮确认仍然存在的真实差距（见汇总表 G1、G2）：探测固定 5000ms 不可配置这件事，`website/guide/entry-resilience.md` 全文和 `integration-by-capability.md` 路径六都没有提；ADR-0033 移除的 `keys`/`seed`/`approvedOrigins`/`discoveryUrl` 四个旧字段名单，`entry-resilience.md` 也没有直接列出（只在正文提了一句"早先按离线私钥签名、构建期域名白名单的设计已被取消"，没有点名字段名，`docs/adr/0018:47` 这份 ADR 本身有但不是面向用户的 guide）。

`da94981`（scope 校验收紧）对 entry-resilience 场景**没有引入新行为**——它只是让 `@pwa-platform/contracts` 的 `validateIdentity` 更严格（拒绝比 worker 目录更宽的 scope），entry-resilience 复用同一个 `identity` 对象，因此间接受益但没有专属逻辑变化（`packages/contracts/src/validate.ts:454-457`）。R9 修复（`237ec67`，`packages/client-runtime/src/client/facade.ts` 新增 `activeRegistration()` 辅助函数，约 342-358 行）是 client-runtime 的注册时序修复，不属于恢复页/恢复 worker 场景本身，但与本场景共享同一批底层身份校验逻辑，值得知悉。

---

## 5. 业务资源缓存（public-read-cache）

**最小配置**（已 tsc 验证通过，`PwaPolicyV3`/`PwaRuntimeCachePolicy`，`packages/contracts/src/policy.ts:84-104`）：
```ts
export const POLICY: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
  ],
  runtimeCache: { enabled: true, maxEntries: 100, maxEntryBytes: 262_144, maxAgeSeconds: 86_400 },
};
```

**开启后实际行为**（三个新变化都已验证）：
1. **Authorization 排除**——实现点不在 `admit.ts`，在 `packages/sw-runtime/src/worker/decide.ts`：非导航 `public-data` 请求带 `Authorization` 头 → `PASSTHROUGH("authorization")`（`decide.ts:140`）；导航请求命中 `navigation-public-dynamic` 规则但带 `Authorization` 头（`!authorization` 条件，`decide.ts:125`）→ 直接走普通 `navigate`（只走网络，永不读写运行时缓存），注释明确引用 c7a289f 的意图（`decide.ts:123-124`）。
2. **准入拒绝上报**（b37c112）——`admitAndReport()`（`packages/sw-runtime/src/worker/handlers.ts:471-496`）包一层 `runtimeAdmissionRejection`，每个 `(engine-key, reason)` 组合在 worker 一次生命周期内只 `console.warn` 一次（`rejectionMessage()`，路径不含查询串，`reason==="vary"` 时附带 Vary 值），**纯调试信息，从不改变准入结果**，不是事件/postMessage，业务代码拿不到。
3. **配额错误清空全部运行时缓存**（a42f545）——`registerQuotaCleanup(() => deleteRuntimeCaches(scope, config.runtimeCache)...)` 在 worker attach 时**无条件注册一次**（`handlers.ts:81-83`），与本次 worker 生命周期内是否真的用过某个缓存引擎无关；`deleteRuntimeCaches`（`packages/sw-runtime/src/worker/runtime-cleanup.ts:16-24`，无 `keep` 参数）会删除 pages 缓存和**所有**数据缓存。

其余不变：`ALLOWED_VARY_TOKENS = {"accept","accept-encoding"}`（`admit.ts:11`），`Vary: Origin` 仍会被拒绝；`cache-first` 仍不经过运行时引擎（全仓 `grep CacheFirst` 在 `packages/sw-runtime`、`packages/engine-workbox` 源码零命中，只是编译期 precache 标签）；`network-first` 受 `networkTimeoutSeconds` 影响，SWR 不等网络。

**默认不配时行为**：`schemaVersion<3` 或 `runtimeCache.enabled:false` 时不启动运行时缓存引擎，未分类/私有/写请求默认拒绝缓存（`handlers.ts:76-95` 一带，行号随文件增长可能已漂移，本轮未逐行重新核对默认拒绝区间的确切行号——只确认结论仍成立，具体行号待下次核验时更新）。

**可能白屏/失败的条件**：`vite preview`/`vite dev` 默认给响应加 `Vary: Origin`，导致 public-read 运行时缓存静默不写入（已被 `website/guide/public-read-cache.md:69-71` 文档化，附排查方法）；`Vary` 陷阱本身与本轮 3 个新提交无关，是旧发现，依然成立。

**代码依据**：`packages/sw-runtime/src/worker/decide.ts:123-125,140`；`packages/sw-runtime/src/worker/handlers.ts:471-496,81-83`；`packages/sw-runtime/src/worker/runtime-cleanup.ts:16-24`；`packages/sw-runtime/src/worker/admit.ts:11,22-32,79-86`；`packages/contracts/src/policy.ts:84-104`。

**测试依据**：单元 `packages/sw-runtime/test/worker/admit.test.ts`；单元 `packages/sw-runtime/test/worker/platform-worker.test.ts`（含配额清理注册断言）；真实浏览器 `packages/sw-runtime/browser-tests/runtime-cache.spec.ts:163`（带 `Set-Cookie` 未标 `private` 的响应仍被当公共内容缓存）。**导航 Authorization 排除和准入拒绝上报这两点，本轮未定位到专属的独立测试用例名**——只确认了实现代码存在，测试覆盖需要下一轮针对性核实。

**与 05/网站的差异**：`website/guide/public-read-cache.md` 已经相当完整——第 60 行提到"公共数据请求不能带 `Authorization` 请求头"，第 67 行准确描述了准入拒绝的 console.warn 机制（含"每个缓存+原因只提示一次"），第 112 行准确描述了配额错误清空全部运行时缓存的行为（且比旧审查文档更精确：明确写出"无论本次 worker 启动以来是否访问过某个运行时缓存，它都会被清空"）。**唯一的真实差距**：第 60 行的 Authorization 表述只覆盖了非导航 `public-data` 的情形，**没有提到导航请求（`navigation-public-dynamic` + Authorization）的排除规则**（`decide.ts:125`），这是 c7a289f 修复的另一半，网站文档目前遗漏（汇总表 G3，严重度低——多数业务不会给公共动态 HTML 导航发 Authorization 头，但既然文档已经专门讨论 Authorization，遗漏导航这一半容易让人误以为只要不在 fetch 里显式加 Authorization 头就万无一失）。`integration-by-capability.md` 路径五本身只做泛泛引用，合理地把细节都甩给 `public-read-cache.md`，这个分工没问题。旧审查文档 `05-scenario-recipes.md` 第 172-218 行整节都写于 eb5836e 之前，完全没提到这三个 commit 的任何行为，视为已被网站文档取代，不需要再单独更新那份旧文档（它本身标注是某次快照，不代表要追更）。`da94981` 与本场景资源规则无关（只影响 `PwaIdentity.scope`，与 `resources`/`runtimeCache` 字段形状无关）。

---

## 6. 更新提示（update notice，非展示层部分）

本轮除场景 3 已覆盖的 locale/英文表变化外，未发现 `updateMode`/`applyUpdate()`/`registration.update()` 定时器相关代码在 eb5836e→HEAD 间有变更（没有相关 commit 落在这条主线上）。`UPDATE_MODES = ["prompt"] as const`（`packages/contracts/src/policy.ts:26`）仍是唯一合法值，`applyUpdate()` 仍不主动刷新页面（`packages/client-runtime/src/client/facade.ts`，未在本轮重新逐行核对具体行号，属性未变的结论来自本轮 locale 代理未触及该函数）。**此场景的核心增量已经并入场景 3（locale/英文表）**，其余行为与旧审查文档一致，不重复展开。

**与 05/网站的差异**：无新增差异（除场景 3 已列出的 locale 相关部分）。

---

## 7. 多标签页（multiple tabs）

**是否无需配置**：是。

**开启后实际行为**：全仓 `grep BroadcastChannel` 唯一命中是 `packages/examples-browser-e2e/browser-tests/update.spec.ts:71` 里的一句注释，明确指出没有创建跨标签消息通道——确认零使用。`onControllerChange`（`packages/client-runtime/src/client/facade.ts:163-173`）只清除本标签页的 `announcedWaiting` 状态并发出 `update-applied` 事件，**从不**触发本标签页刷新，也不给其它标签页发消息（166-167 行注释明确写了这个设计意图）。一个标签页确认更新、worker 接管后，其余标签页各自观察到同一次原生 `controllerchange`，各自清除自己的更新提示，**没有任何标签页被自动刷新**。

**本轮新发现（旧审查文档在这里的结论已过时）**：旧审查文档 `05-scenario-recipes.md:271` 断言 offline-write 的 `flushOfflineWrites` "没有跨标签锁……理论上可能导致同一批记录被重复发送……是本轮考古发现的最高风险未测试空白点"。这条断言现在**不成立**：`packages/sw-runtime/src/worker/handlers.ts:74,227-235` 有一个 `inFlightFlushes = new Map<string, Promise<...>>()`，对同一 session binding 的并发 flush 调用做单飞（single-flight）合并，由 commit `f4ec3b3`（"fix(sw-runtime): single-flight offline-write flush per session binding"）引入，`git merge-base --is-ancestor f4ec3b3 eb5836e` 返回 false，证实这确实是旧审查基线之后才落地的修复，不是旧审查漏看。`prepareFlush()`（`packages/sw-runtime/src/worker/offline-write-store.ts:72-99`）这个 store 层函数本身依然没有"flushing 中"标志——单飞锁完全在 `handlers.ts` 的内存 Map 里实现，不在 store 层，这一点值得知悉但不是缺陷。

**默认不配时行为**：无需配置，机制始终生效。

**可能白屏/失败的条件**：无。

**代码依据**：`packages/client-runtime/src/client/facade.ts:163-173`；`packages/sw-runtime/src/worker/handlers.ts:74,227-235`；`packages/sw-runtime/src/worker/offline-write-store.ts:72-99`。

**测试依据**：真实浏览器 `packages/examples-browser-e2e/browser-tests/update.spec.ts:56`（"one confirmation clears the prompt in every controlled same-scope tab"）；真实浏览器 `packages/sw-runtime/browser-tests/offline-write.spec.ts:93`（"single-flights concurrent flushes for one session binding across two pages (R5)"，两个页面并发 flush 同一 session binding，只有一趟请求真正到达 fixture server，两边收到的计数器相同）。

**与 05/网站的差异**：旧审查文档 `05-scenario-recipes.md:251`（"现有文档 6 条路径均未覆盖多标签页协调这一主题……完全空白"）现在**不成立**——commit 9b55a39 在 `website/guide/updates.md:55-57` 新增了"## 多标签页"一节，内容（无 `BroadcastChannel`、各自监听 `controllerchange`、不自动刷新其它标签页）与本轮代码核验完全吻合，行号逐字匹配。**唯一残留差距**：网站新增的"多标签页"小节**没有提到** offline-write flush 的单飞保护（`handlers.ts:74,227-235`）——这是一个对业务有用的正面信息（"多标签并发调用 flush() 现在是安全的，不会重复发送"），目前网站和任何 guide 页都没有写（汇总表 G4，优先级低，是遗漏一个好消息，不是误导）。

---

## 8. 断网与网络恢复（online/offline）

**是否无需配置**：是。

**开启后实际行为**：`offlineWriteFlush.ts:5` 文档注释——"Explicit FIFO replay; it is never called by fetch, Sync, Push or worker activation." 仍然成立，offline-write 队列不会自动重放。`packages/vite/src/offline-page.ts` 第 40/52/60-61 行——`window.addEventListener("online", probeConnection)` + `setInterval(probeConnection, 10_000)` 轮询兜底，探测成功后 `location.reload()`；这段脚本**只存在于平台生成的默认离线页 HTML 里**，业务路由页面拿不到。`packages/client-runtime/src/client/events.ts:6-13` 的 `CLIENT_EVENT_TYPES` 仍是 `["registered","install-eligible","installed","update-waiting","update-applied","served-from-cache"]`，不含 online/offline。

**默认不配时行为**：无需配置，机制始终如上。

**可能白屏/失败的条件**：无（这一场景本身不产生白屏）。

**代码依据**：`packages/sw-runtime/src/worker/offline-write-flush.ts:5`；`packages/vite/src/offline-page.ts:40,52,60-61`；`packages/client-runtime/src/client/events.ts:6-13`。

**测试依据**：本轮未新增/未定位到专属的"网络恢复后重试"真实浏览器测试；沿用旧证据链（`offline-page.ts` 脚本本身的行为由构建产物静态检查覆盖，未见针对 `online` 事件 + 10 秒轮询竞态的浏览器测试，与旧审查文档"未确认"的结论一致，本轮未推翻也未证实）。

**与 05/网站的差异**：旧审查文档 `05-scenario-recipes.md:285`（"现有文档 6 条路径均未覆盖网络恢复后的自动/手动重试行为……空白"）现在**不成立**——commit 9b55a39 在 `website/guide/offline.md:78-80` 新增"## 断网与恢复"一节，逐句对应本轮代码核验结果（平台不提供 online/offline API、只有离线页自身会自动探测刷新、业务页面需要自己重试），无发现新的不准确之处。

---

## 差距汇总表（本轮确认仍然成立、值得合入网站文档的项）

| 编号 | 场景 | 差距 | 严重度 | 证据 |
|---|---|---|---|---|
| G1 | 4. 恢复页 | 入口探测固定 `PROBE_TIMEOUT_MS=5000ms`，`website/guide/entry-resilience.md` 和 `integration-by-capability.md` 路径六均未提及，且该常量本身没有 fake-timer 测试锁定 | 中 | `packages/entry-resilience/src/browser/probes.ts:10`；`packages/entry-resilience/test/browser/probes.test.ts`（无固定值测试） |
| G2 | 4. 恢复页 | ADR-0033 移除的 `keys`/`seed`/`approvedOrigins`/`discoveryUrl` 四个旧字段名单，`entry-resilience.md` 只提了一句"早先……设计已取消"，没有点名字段，读者若参考旧版 PR/文档配置这些字段会在构建期报错但查不到对应关系 | 低 | `packages/entry-resilience/src/vite/options.ts:8-9,REMOVED_OPTION_NAMES` 一带（`checkForRemovedOptions`）；`docs/adr/0018-entry-resilience-delivery-boundary.md:47` |
| G3（主会话已复核：代码已修且有 Chrome E2E `runtime-cache.spec.ts:250`，只缺文档；另见 06 的 N6 注释过时） | 5. 业务资源缓存 | `website/guide/public-read-cache.md:60` 的 Authorization 排除表述只覆盖非导航 `public-data`，遗漏导航请求（`navigation-public-dynamic`）带 Authorization 头时同样被排除运行时缓存这一半（c7a289f） | 低 | `packages/sw-runtime/src/worker/decide.ts:123-125` |
| G4 | 7. 多标签页 | offline-write flush 的跨标签单飞保护（`handlers.ts` `inFlightFlushes`，commit f4ec3b3）未在任何网站页面提及，是遗漏一条对业务有用的"已修复"信息，不是误导 | 低（信息缺失，非错误） | `packages/sw-runtime/src/worker/handlers.ts:74,227-235`；真实浏览器 `packages/sw-runtime/browser-tests/offline-write.spec.ts:93` |

**已确认过时、不应再引用的旧结论**（`docs/review/2026-09-27/05-scenario-recipes.md`，均已被 HEAD 代码或网站文档推翻）：

| 旧文档位置 | 过时原因 |
|---|---|
| 第 13、106、122、132、137 行（更新提示"无 locale/无英文表"系列断言） | c22f3f3 加入了运行时 `locale` prop 和内置 `EN_MESSAGES` 表；"无主题覆盖"这半句仍然成立，其余全部作废 |
| 第 162-165 行（恢复页"触发条件缺失"） | `website/guide/entry-resilience.md:73` 已补上完整触发管线描述 |
| 第 251 行（多标签页"完全空白"） | `website/guide/updates.md:55-57` 已补上 |
| 第 266、271 行（offline-write flush"无跨标签锁……最高风险未测试空白点"） | commit f4ec3b3 已加单飞锁并有真实浏览器测试覆盖（`offline-write.spec.ts:93`），风险已消除且已证实修复，不再是"未测试空白点" |
| 第 285 行（网络恢复"完全空白"） | `website/guide/offline.md:78-80` 已补上 |
| 第 82-84 行（离线页"4xx/5xx 不回退""css 追加/替换未说明"） | `integration-by-capability.md:174`、`offline.md:45` 均已补上 |
| 第 35 行（应用壳"SPA 深链接不回退"未警告） | `integration-by-capability.md:141-143` 已补上完整警告块 |

结论：`docs/review/2026-09-27/05-scenario-recipes.md` 作为一份时点快照文档，其"建议合入现有页面的补充"待办清单（该文档 322-331 行的 8 条）里，**6 条已经被 9b55a39/da45523 落地**，只剩恢复页的 2 条子项（5000ms 超时、四个移除字段名单，即本轮 G1/G2）尚未合入；这两条加上本轮新发现的 G3（Authorization 导航排除遗漏）、G4（多标签单飞保护未宣传）是当前唯一值得继续跟进的网站文档差距。
