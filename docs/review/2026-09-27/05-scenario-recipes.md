# 场景速查与现有文档核验

对照 8 个常见场景与 `website/guide/integration-by-capability.md`（下称"现有文档"，257 行，6 条路径）逐条核验：现有文档覆盖到哪一段、字段名和行为描述是否与代码一致。方法论：以 `packages/*/src` 代码与测试为准，字段名逐一 grep 核实，只引用已验证的行号；未验证的一律标"未确认"，不推断。

示例目标版本：npm `@pwa-platform/*@0.1.0`（2026-09-27 用 Playwright 真实验证过，见 `docs/review/2026-09-27/04-pc-onboarding-review.md`）。ADR-0040（manifest 主图标尺寸构建期校验，2026-09-27 当天接受）等 workspace-only 变更不在 0.1.0 发布范围内，不要照抄成已发布行为。

## 一页速查表

| 能力 | 默认 | 最小开关 | 断网时 | 白屏风险 | 证据等级 | 现有文档路径 |
|---|---|---|---|---|---|---|
| 应用壳预缓存 | 关（未配置资源规则不预缓存任何东西） | `resources` 给构建产物写 `resourceClass:"asset"` + 非 `"none"` 的 `cache` | 已预缓存文件可用；未预渲染的 history 深链接刷新得到网络错误页，**不回退到壳** | 不白屏，但 history 深链接断网得到浏览器网络错误页 | L3 | 路径一/三（1-59, 122-138 行） |
| 离线页 | 关（`offlineFallback.enabled:false`） | `offlineFallback:{enabled:true,path}` + 预缓存该文件 + 可选 `offlinePage` | 仅对导航生效，仅网络失败/`error`时展示，4xx/5xx 不展示 | 无（顶替白屏） | L3 | 路径四（140-175 行） |
| UI 多语言与主题 | 更新提示无 locale/无英文表；离线页/恢复页构建期固定语言 | 见场景 3 | 不受断网影响（离线页本身除外） | 无 | L3(更新提示/恢复页) / 文档层面无测试(离线页 data-theme 说明) | 路径二"多语言与主题"小节（107-120 行） |
| 恢复页/recovery worker | 关（未装插件/未部署） | 场景 4 | 恢复页断网时探测必失败；recovery worker 与网络状态无关 | 未验证（清理失败时是否白屏待故障注入） | L2 | 路径六（209-249 行） |
| 业务资源缓存（public-read） | 全部 `unclassified`/`cache:"none"` 不缓存 | v3 + `public-data` + `runtimeCache.enabled:true` | 视策略：network-first/SWR 曾成功且未过期可用 | 无 | L3 | 路径五（177-207 行） |
| 多标签页协调 | 开（浏览器原生 `controllerchange`，无开关） | 无需配置 | 各标签页独立感知，不互相推送 | 无 | L3 | **现有文档未覆盖** |
| 断网与网络恢复 | 开（无自动重放，无开关） | 无需配置 | 恢复后不自动重试排队请求，只有离线页自带脚本自动刷新自身 | 无 | L3 | **现有文档未覆盖** |

证据等级与[证据台账](../../operations/feature-evidence-ledger.md)一致：L2 = 自动化单元/构建断言；L3 = 真实桌面浏览器（目前仅 Chrome）；L4 = 真实手机记录。本文中“本次复现”（curl、临时接入项目）单独注明，不计入 L4。

---

## 1. 只启用应用壳（app shell only）

### 现有文档对照
覆盖于**路径一**（1-59 行，`resources: []` 版本）和**路径三**（122-138 行，加导航+资产规则的版本）。

| 现有文档表述 | 位置 | 核验 | 代码依据 |
|---|---|---|---|
| "`resources` 为空时，业务 JS／CSS 不进入 worker 的预缓存清单" | 56-57 行 | ✅ 匹配 | 只有 `resourceClass==="asset"` 且 `cache` 非 `"none"` 才收入 precache，`packages/core/src/precache.ts:73-91,133-135` |
| "`navigation-public-static` 决定导航处理方式，不会自动把所有页面写入运行时缓存" | 134 行 | ✅ 匹配 | `packages/sw-runtime/src/worker/decide.ts:99-146`——导航请求走独立的 `navigate()` 逻辑，不进 `runtimeCache.rules` |
| "在线首次注册并完成安装后，再断网重新打开已缓存的应用壳" | 135 行 | ⚠️ 不完整 | 只说了"应用壳"整体可离线打开，**没有说明这仅限于已被 precache 命中的确切路径**；未预渲染的 history 动态路由离线刷新不会回退到应用壳，见下方"缺失" |

### 缺失（现有文档未提及）
- **history 路由深链接离线行为**：`navigationFallbacks()`（`packages/sw-runtime/src/worker/decide.ts:166-173`）只尝试请求路径自身、去 query 后的自身、该路径目录下的 `index.html`，**不会**去找应用根 `index.html`。纯 history 路由 SPA 的未预渲染动态路由（如 `/products/42`）离线刷新，若未开离线页，直接得到 `Response.error()`（网络错误页），**不会**自动退回应用壳用客户端路由渲染。本平台没有 `vite-plugin-pwa` 式的通配符 `navigateFallback`。
- 导航请求对 4xx/5xx **原样返回**（不算失败）：`packages/sw-runtime/src/worker/handlers.ts:265-283`，`response.type !== "error"` 才返回。
- Hash 路由与 history 路由的差异：hash 路由同文档内切路由不产生新 `navigate` 请求，只有首次整页加载触发一次 SW 决策。

### 最小配置（补充：会触发上述缺口的具体例子）
```ts
// 关闭离线页、纯 history 路由、动态路由 /products/:id 未被预渲染/precache
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
  ],
};
// 断网刷新 /products/42（未被单独预渲染）→ Response.error()，不是应用壳
```
类型：`PwaPolicyV1`（`packages/contracts/src/policy.ts:60-69`）。

### 常见误解
- **"应用壳"不等于"任意路由离线可回退到壳"**——现有文档路径三只说明了应用壳本身离线可用，没有明确警告"其它未预缓存路由不会回退到壳"这一后果，容易被读者脑补成 SPA 通配符回退。

### 证据
- `packages/sw-runtime/src/worker/decide.ts:166-173`（L2，测试 `decide.test.ts:140,153-156`）
- `packages/sw-runtime/browser-tests/offline.spec.ts:8-16`（L3，精确命中 precache 断网可用）

### 注意事项
- 构建文件未被任何 `resourceClass` 规则命中时悄悄不进 precache，无警告；"SW 安装中途断网/刷新"时序未见测试覆盖。

---

## 2. 离线页（offline fallback page）

### 现有文档对照
覆盖于**路径四**（140-175 行）。

| 现有文档表述 | 位置 | 核验 | 代码依据 |
|---|---|---|---|
| `offlineFallback: { enabled: true, path: "/offline.html" }` | 145 行 | ✅ 匹配 | `PwaOfflineFallback`，`packages/contracts/src/policy.ts:41-43` |
| `offlinePage: { locale, messages, css }` | 161-165 行 | ✅ 匹配 | `PwaViteOfflinePageOptions`，`packages/vite/src/options.ts:20-29` |
| "超时仅作用于 worker 处理的导航和 `network-first` 公共读取" | 170 行 | ✅ 匹配 | `packages/sw-runtime/src/shared/config.ts`（`networkTimeoutSeconds` 注释，`policy.ts:67-68`） |
| "不配置时曾约 60 秒白屏，配置 `5` 后约 5 秒回退" | 173-174 行 | ✅ 匹配（iPhone 实机数据，本次未重新验证但与 scenarios.md 汇总一致） | — |

### 缺失（现有文档未提及）
- **4xx/5xx 不触发离线页**：`navigate()` 唯一判定是 `response.type !== "error"`（`packages/sw-runtime/src/worker/handlers.ts:283,306`）。4xx/5xx 是正常 `response.type`，原样返回，不进离线页。现有文档路径四完全没提这一区分，容易被误读为"任何非成功响应都会走离线页"。
- `offlinePage.css` 只能**追加**为第二个 `<style>`，不能替换默认样式（`packages/vite/src/offline-page.ts:123-127`）——文档 164 行给了 `css` 示例但未说明是追加还是替换。
- CSP 要求：三段内联内容各自需要 `sha256-` 值放行 `style-src`/`script-src`，`connect-src` 需放行 `'self'`（重试脚本同源探测）——文档未提及。

### 常见误解
- **离线页不对 4xx/5xx 回退**（见上）。

### 证据
- `packages/sw-runtime/src/worker/handlers.ts:265-283,306`（L3，`platform-worker.test.ts:198-204`404 直接透传，`:206-211` `Response.error()`才进离线页）
- `packages/vite/src/offline-page.ts:111-159`

### 注意事项
- 没有文档警告"纯 history 路由 SPA 关闭离线页时未预渲染动态路由离线刷新得网络错误页"（同场景 1）。

---

## 3. UI 多语言与主题（更新提示 / 离线页 / 恢复页分别说明）

### 现有文档对照
覆盖于**路径二"多语言与主题怎么配置"**（107-120 行），有一张对照表。

| 现有文档表述 | 核验 | 代码依据 |
|---|---|---|
| "Vue／React 更新提示：`messages` 由应用运行时传入，可接现有 i18n" | ✅ 匹配 | `PwaUpdateNoticeProps.messages?: Partial<PwaUpdateNoticeMessages>`，`packages/react/src/ui.ts:21-26` |
| "默认更新 UI 内置中文文案；英文或其他语言由业务把自己的翻译对象传给 `messages`" | ✅ 匹配，且比较克制 | `DEFAULT_MESSAGES` 硬编码中文，`ui.ts:37-50`，无内置英文表（全仓无第二套） |
| "平台离线页：`offlinePage.locale` 在构建时选 `zh-CN`／`en`" | ✅ 匹配 | `PwaOfflinePageLocale = "zh-CN"\|"en"`，`packages/vite/src/options.ts:20-22` |
| "入口恢复页：以 `setPwaTheme()` 传入 `light`、`dark` 或 `system`" | ✅ 匹配 | `setPwaTheme(theme: PwaTheme)`，`packages/entry-resilience/src/client/index.ts:51-59` |
| "默认跟随系统亮暗" 用于更新提示和离线页 | ⚠️ 不完整 | 匹配"默认跟随系统"这一半；但**未说明离线页的 `data-theme` 选择器实际上没有任何脚本会去设置它**——离线页是独立静态文档，即使 CSS 写了 `[data-theme="dark"]` 选择器，也永远读不到应用侧的主题选择，这一点与恢复页的关键差异，现有文档表格没有区分出来（已核实：[offline-page-style.ts:15](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vite/src/offline-page-style.ts#L15) 注释写明只有 `prefers-color-scheme` 路径会生效） |

### 缺失（现有文档未提及）
- **更新提示组件没有 `theme`/`data-theme` 覆盖机制**，只有 `colors` prop 覆盖具体色值 + 系统 `prefers-color-scheme`；现有文档表格写"`colors` 或 `--pwa-update-*` CSS 变量覆盖"是对的，但没有点出"不支持应用显式指定深浅色"这一边界，容易被理解为"能配置主题"。
- **离线页与恢复页的主题差异本质**：两者 CSS 变量表、`data-theme` 选择器写法完全同构，但离线页没有运行时脚本写入 `data-theme`，只能跟系统；恢复页因为应用壳仍可执行时能调用 `setPwaTheme()` 写 localStorage，断网/应用壳崩溃后恢复页仍能读到之前的选择。现有文档表格把两者的"主题"列写得像是同等能力，实际上离线页那格的"默认跟随系统"其实是**唯一**能力，不是"默认值"。

### 最小配置（更新提示，无法从现有文档补出完整字段名的部分）
```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

<PwaUpdateNotice
  position="bottom-right"
  messages={{ update: "立即更新", later: "稍后提醒我" }} // 只能逐条覆盖 12 个 key，无 locale 字段
  colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }} // 无 theme/data-theme
/>
```
类型：`PwaUpdateNoticeProps`（`packages/react/src/ui.ts:21-32`）、`PwaUpdateNoticeMessages`（6-19 行，12 个 key）、`PwaUpdateNoticeColors`（27-33 行，6 个色值）。

### 开启后的实际行为

| UI | locale | messages | css | 主题 | 断网影响 |
|---|---|---|---|---|---|
| 更新提示 | 不支持 | 支持，无内置英文表 | 不支持（只有 `colors`） | 只跟系统偏好 | 不受影响（本地状态机） |
| 离线页 | 支持，构建期固定 | 支持 | 支持，追加 | CSS 支持选择器但无脚本写入，实际只跟系统 | 是离线场景本身的产物 |
| 恢复页 | 支持，构建期固定 | 支持 | 支持，追加 | 跟随 `setPwaTheme()` 写入的 localStorage | 断网时若清单已缓存则可能展示 |

### 常见误解
- 不要以为三个 UI 表面的多语言/主题能力一致——现有文档表格把它们并排列出，容易让人以为程度相当，实际更新提示明显更弱（无 locale、无内置英文、无主题覆盖）。

### 证据
- `packages/react/src/ui.ts:6-50`（L3，`packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts:27-127`）
- `packages/entry-resilience/src/client/index.ts:51-59`、`packages/entry-resilience/src/page/main.ts:63-78`（L3，`packages/entry-resilience/browser-tests/styling.spec.ts:197-279`）
- 离线页无脚本写 `data-theme`：[offline-page-style.ts:15](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/vite/src/offline-page-style.ts#L15)（主会话已核实）

### 注意事项
- `PwaUpdateNotice` 组件源码本身无单元测试文件，只有 L3 浏览器用例佐证。

---

## 4. 恢复页（entry-resilience）与 recovery worker 的区别

### 现有文档对照
覆盖于**路径六"配置两种恢复能力"**（209-249 行），已经用一张表区分了两者，是现有文档里**质量最高**的一段。

| 现有文档表述 | 核验 | 代码依据 |
|---|---|---|
| "恢复 worker：当前 worker 或缓存规则异常……事故时部署到原 worker URL" | ✅ 匹配 | `packages/sw-runtime/src/entries/recovery-worker-entry.ts`；ADR `docs/adr/0012...md:20` |
| "入口恢复页：原 Origin 迁移或不可达……业务后端提供清单、用户确认后跳到新 Origin" | ✅ 匹配 | `packages/entry-resilience/src/resolve.ts:55-103`、`decide.ts:34-57` |
| "同一个 `identity` 对象必须传给两个插件" | ✅ 匹配 | `packages/entry-resilience/src/vite/options.ts:15`（`identity: PwaIdentity`），构建期校验 `entry.platform-plugin-missing`/`entry.base-mismatch`（据 scenarios.md 汇总，行号未在本次重新核验） |
| "平台只校验形状、递增序号和有效期，不认证清单来源，也不限制目标 Origin" | ✅ 与设计一致 | [ADR-0033](../../adr/0033-entry-manifest-supplied-by-the-application.md) 明确删除了 ADR-0017 的签名与批准 Origin 列表，信任边界交给业务后端与请求层；唯一保留的防线是用户点击确认（ADR-0033 第 29 行） |

### 缺失（现有文档未提及）
- **触发条件的精确管线**：现有文档只说了"业务后端提供清单"，没有说明 `status==="migrating"||"incident"` 时**无条件展示全部入口、不探测当前域名**，只有 `status==="normal"` 才做客户端可达性探测（`packages/entry-resilience/src/decide.ts:39-53`）。
- 探测固定 **5000ms 超时，不可配置**（`packages/entry-resilience/src/browser/probes.ts:10`）。
- ADR-0033 已移除 `keys`/`seed`/`approvedOrigins`/`discoveryUrl` 四个旧字段，传入立即报 `entry.option-removed`——如果读者参考了更旧版本的文档或历史 PR，需要提醒这些字段已不存在。
- 两者代码零交集这一点，现有文档没有明说（虽然分成两行表格已经隐含了区分，但没有像"恢复页≠恢复 worker，共享'恢复'二字纯属命名巧合"这样直白提醒）。

### 常见误解
- 恢复页不是"主 SW 挂掉时的自动降级方案"，依赖业务后端主动下发清单；recovery worker 也不是自动检测触发，是人工运维部署。现有文档路径六已经通过分表隐含表达了这一点，但未直接点破"零交集、纯命名巧合"。

### 证据
- `packages/entry-resilience/src/decide.ts:34-57`（L2）
- `packages/entry-resilience/src/browser/probes.ts:10`（L2，`probes.test.ts` 未用 fake timer 固定该常量——未测试行为）
- recovery worker：`packages/sw-runtime/src/entries/recovery-worker-entry.ts`

### 注意事项
- recovery worker `clients.claim()` 后旧页面何时感知控制权切换未在本次范围内确认；已有 E2E 观察到清理完成前发生 `controllerchange`（`docs/review/2026-09-27` 系列的 codex 复核结论），故障注入下是否白屏尚未验证。

---

## 5. 业务资源缓存

### 现有文档对照
覆盖于**路径五**（177-207 行）。

| 现有文档表述 | 位置 | 核验 | 代码依据 |
|---|---|---|---|
| "只有当接口或动态 HTML 对所有用户完全相同……才能把策略升级到 PwaPolicy v3" | 179 行 | ✅ 匹配 | `PwaPolicyV3` 需要 `runtimeCache`，`packages/contracts/src/policy.ts:96-105` |
| "v3 必须显式给出数量、单项大小和存活时间上限" | 180 行 | ✅ 匹配 | `PwaRuntimeCachePolicy`，`policy.ts:84-89` |
| "上线前必须用真实响应验证状态码、Content-Type、`Cache-Control`、`Vary`、大小和是否携带 `Authorization`" | 205 行 | ⚠️ 不完整 | 列出了要验证 `Vary`，但**没有点名 `vite preview`/`vite dev` 默认会给所有响应加 `Vary: Origin`**，而准入规则只允许 `Vary` 为空或只含 `accept`/`accept-encoding`（`ALLOWED_VARY_TOKENS`，`packages/sw-runtime/src/worker/admit.ts:11,64-70`）——本次接入项目复现：`vite preview` 下所有响应带 `Vary: Origin`，public-read 运行时缓存**静默不写入，且无任何构建/控制台/日志报错**。现有文档的"上线前检查"清单会让人以为按文档流程走没有陷阱，实际这个陷阱恰好出现在文档自己推荐的验收方式（`vite preview`）里 |

### 最小配置（现有文档 182-203 行已给出正确示例，此处不重复；补充 Vary 陷阱的复现方式）
```bash
# 复现方式：vite build && vite preview 后
curl -sI http://localhost:4173/api/catalog | grep -i vary
# Vary: Origin  ← 触发准入拒绝，SW 静默不写入 runtime-data-* 缓存
```
业务侧规避：在中间件里显式 `res.removeHeader("Vary")`（或确保响应不带该头），再重新验证 Cache Storage。

### 开启后的实际行为（各策略）

| 策略 | 语义 |
|---|---|
| `cache-first` | **不经过运行时缓存引擎**——编译期直接收入 precache 清单，由 Workbox `PrecacheController` 伺服，不受 `maxEntries`/`maxAgeSeconds` 约束 |
| `network-first` | 受 `networkTimeoutSeconds` 影响；超时或失败回退缓存 |
| `stale-while-revalidate` | 缓存有未过期条目直接返回，不等网络；后台静默重新验证 |

### 常见误解
- **"cache-first" 不是运行时缓存策略**——全仓搜索 `CacheFirst` 在 `engine-workbox`/`sw-runtime` 源码零命中，只是编译期把资源塞进预缓存清单的标签，现有文档路径五和三都没有点出这个容易误导的命名。
- 带 `Set-Cookie` 且未标 `private` 的响应**会**被当公共内容缓存（`packages/sw-runtime/browser-tests/runtime-cache.spec.ts:163`），现有文档未提及这个准入细节。

### 证据
- 默认 deny：`packages/sw-runtime/src/worker/handlers.ts:76-95`（L3，`offline.spec.ts:73,101,119-133`）
- Vary 陷阱：`packages/sw-runtime/src/worker/admit.ts:11,64-70`（本次复现：接入项目 + curl，见 `04-pc-onboarding-review.md` C-1）
- SWR 准入：`packages/sw-runtime/src/worker/admit.ts:54-70`（L3，`admit.test.ts:133-217`）

### 注意事项
- `runtimeCache` 仅 `PwaPolicyV3` 有，`schemaVersion` 必须写 3。

---

## 6. 更新提示（update notice）

### 现有文档对照
覆盖于**路径二**（61-105 行）。

| 现有文档表述 | 位置 | 核验 | 代码依据 |
|---|---|---|---|
| "新 worker 安装后仍然等待；只有用户操作触发 `applyUpdate()` 才接管" | 81 行 | ✅ 匹配 | `attachPlatformWorker` 从不主动 `skipWaiting`，`packages/sw-runtime/src/worker/handlers.ts:40-43` |
| "接管不会刷新当前页面，业务必须……决定何时调用 `location.reload()`" | 82 行 | ✅ 匹配 | `applyUpdate()` 文档注释"Never reloads the page"，`packages/client-runtime/src/client/facade.ts:66-69` |
| "这是页面可见时调用 `registration.update()` 的定时器，不是 Periodic Background Sync" | 80 行 | ✅ 一致 | 调用点 [facade.ts:237](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/client-runtime/src/client/facade.ts#L237)；`updateCheck.intervalMs` 默认关闭、最小 60000（[update-check.ts:10-15](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/client-runtime/src/client/update-check.ts#L10)） |

### 缺失（现有文档未提及）
- **`UPDATE_MODES` 只有一个值 `"prompt"`**（`packages/contracts/src/policy.ts:26`），`updateMode` 是必填字段而非有默认值的可选项，现有文档 71 行只给了 `updateMode: "prompt"` 这行配置，没说明这是当前**唯一合法值**，容易被误读为"未来/当前存在其它模式可选"。
- 若用户永远不点更新、也不挂载任何 UI，浏览器会在该 scope 下所有受控标签页关闭后自动激活新 worker——这是浏览器原生行为，现有文档未提及这个兜底路径。

### 常见误解
- `updateMode: "prompt"` 不是"默认值"，是当前唯一合法值。

### 证据
- `packages/contracts/src/policy.ts:26`（三处独立必填校验：`client-runtime/src/shared/config.ts:43`、`sw-runtime/src/shared/config.ts:189`、`contracts/src/validate.ts:241,317`）
- `applyUpdate()`：`packages/client-runtime/src/client/facade.ts:430-447`（L3，`facade.test.ts:573-608`）

### 注意事项
- `PwaUpdateNotice` 组件源码本身无单元测试文件。

---

## 7. 多标签页（multiple tabs）

### 现有文档对照
**现有文档 6 条路径均未覆盖多标签页协调这一主题**。全文搜索"标签"/"tab"/"多个页面"均无命中（仅在"每增加一层后怎么验收"的通用清单里出现"用 PC 和业务承诺的手机浏览器重复关键流程"，与多标签无关）。这是一处**完全空白**，不是不准确。

### 是否无需配置
是。`packages/contracts/src` 与各包 options/config 类型均无涉及多标签页协调的字段。

### 最小配置
无需任何配置——这一点现有文档本可以在"不会自动得到"表格（6-13 行）里补一行，目前没有。

### 如何协调
全仓搜索 `BroadcastChannel` 零命中；平台 worker 从不 `clients.claim()`（只有 recovery worker 会）。唯一机制：每个受控页面各自监听浏览器原生 `controllerchange` 事件（`packages/client-runtime/src/client/facade.ts:163-173`）。

| 情形 | 行为 |
|---|---|
| 首次访问 | 各标签页独立注册/独立状态 |
| 在线 | 一个标签页确认更新后，其它标签页**不会自动 reload**，各自独立监听 `controllerchange` 清除自己的 waiting 提示 |
| 断网 | 不影响协调机制本身 |
| 弱网/超时 | 不适用 |

### 常见误解
- 不要以为多标签页之间有消息通道——真实浏览器 e2e 测试特意排除了 `BroadcastChannel`/`postMessage`（`packages/examples-browser-e2e/browser-tests/update.spec.ts:71-72` 注释）。
- offline-write 队列的 `flushOfflineWrites` **没有跨标签锁**，`prepareFlush()`（`packages/sw-runtime/src/worker/offline-write-store.ts:72-99`）只是"读取+过滤过期"，未标记"flushing 中"状态——多个标签页并发调用 `flush()` 理论上可能导致同一批记录被重复发送。这是本轮考古发现的**最高风险未测试空白点**，且现有文档完全没提及 offline-write 的多标签风险。

### 证据
- `packages/client-runtime/src/client/facade.ts:149-173`（L3，`packages/examples-browser-e2e/browser-tests/update.spec.ts:56-88`）
- flush 并发风险：`packages/sw-runtime/src/worker/offline-write-flush.ts`、`offline-write-store.ts:72-99`（**无测试**，风险未证伪也未证实）

### 注意事项
- 若业务大量依赖 offline-write 且经常多标签页同时在线，建议自行在业务层加节流/单例协调。

---

## 8. 断网与网络恢复（online/offline）

### 现有文档对照
**现有文档 6 条路径均未覆盖网络恢复后的自动/手动重试行为**。路径四提到了断网期间弱网超时和离线页展示，但没有单独讨论"网络恢复后会发生什么"。这是另一处**空白**。

### 是否无需配置
是。contracts 与各包 options 类型均无 `autoRetry`/`autoFlushOnline` 等字段。

### 最小配置
无需任何配置。

### 恢复后会不会自动重试/刷新
**offline-write 队列不会自动重放**：`flushOfflineWrites` 文档注释"Explicit FIFO replay; it is never called by fetch, Sync, Push or worker activation."（`packages/sw-runtime/src/worker/offline-write-flush.ts:5`）。ADR-0027 明确"不在首版使用 Background Sync 或自动重放"。

**离线页会自动刷新，但只限离线页自身**：`OFFLINE_PAGE_SCRIPT`（`packages/vite/src/offline-page.ts:40-62`）监听 `window` 的 `online` 事件 + 10 秒轮询兜底，成功探测后 `location.reload()`；这段脚本只存在于平台生成的默认离线页 HTML 里，不是给业务路由页面用的 API。

**没有 online/offline 事件包装成 API 暴露给业务**：`packages/client-runtime/src/client/events.ts` 的 `CLIENT_EVENT_TYPES` 只有 `registered/install-eligible/installed/update-waiting/update-applied/served-from-cache` 六种，不含 online/offline。

| 情形 | 行为 |
|---|---|
| 首次访问 | 不适用 |
| 在线 | 正常 |
| 断网 | offline-write 请求入队不发送；离线页展示（若命中） |
| 弱网/超时 | 同场景 2/5 的超时规则 |
| 网络恢复 | 离线页自身自动探测并 reload；业务路由页面不会自动重试/刷新，也没有平台事件通知业务"网络回来了" |

### 常见误解
- 不要以为"断网与网络恢复"是平台内置的通用能力——只在离线页这一个固定产物里生效，业务自己的页面/组件拿不到任何 online/offline 通知。
- ADR-0027 提到的"联网恢复"只是建议业务自己调用 `flush()` 的时机之一，不是平台自动监听 `online` 事件触发的。

### 证据
- `packages/sw-runtime/src/worker/offline-write-flush.ts:5`；`docs/adr/0027-explicit-session-bound-offline-write-queue.md`（决策第 5 条）
- `packages/vite/src/offline-page.ts:40-62`
- `packages/client-runtime/src/client/events.ts`（全仓 grep 确认无 online/offline）

### 注意事项
- `OFFLINE_PAGE_SCRIPT` 的 `online` 监听与 10 秒轮询之间的竞态，未确认是否被 `packages/vite/browser-tests/offline-page.spec.ts` 覆盖。

---

## 建议合入现有页面的补充（待办，未编辑 website/）

1. **路径一/三**：加一句明确警告——"应用壳"不等于任意路由的通配符回退；history 路由未预渲染的动态路由离线刷新会得到网络错误，不会退回应用壳（引 `decide.ts:166-173`）。
2. **路径四**：补充"离线页不对 4xx/5xx 回退"这一区分，避免被理解为"任何非成功响应都进离线页"。
3. **路径二"多语言与主题"表格**：给"更新提示"那一行的"主题"列加限定语——只跟随系统偏好，不支持应用显式指定；给"离线页"那一行补一句"CSS 支持 `data-theme` 选择器但没有脚本会设置它，实际只跟系统"，避免和恢复页的能力混同。
4. **路径五**：在"上线前必须用真实响应验证……`Vary`"这句后面，直接点名 `vite preview`/`vite dev` 默认注入 `Vary: Origin` 会导致 public-read 缓存静默失效且无任何报错，并给出 `curl -sI` 的排查方法。这是本次接入体验中**唯一的高严重度卡点**（见 `04-pc-onboarding-review.md`），文档目前的表述会让人以为"按文档验收"是安全的。
5. **路径二**：补充 `UPDATE_MODES` 目前只有 `"prompt"` 一个合法值，不是"默认值"而是封闭枚举，避免以为未来/当前存在其它模式。
6. **新增一节"多标签页与并发"**：说明协调机制是浏览器原生 `controllerchange`、没有 `BroadcastChannel`，以及 offline-write `flush()` 缺少跨标签锁的已知风险点。
7. **新增一节"网络恢复后会发生什么"**：明确 offline-write 不自动重放、业务页面拿不到 online/offline 事件、离线页自身的自动刷新脚本范围仅限离线页本身。
8. **路径六**：补充恢复页触发条件的精确管线（`migrating`/`incident` 无条件展示不探测，`normal` 才探测；探测固定 5000ms 不可配置），以及 ADR-0033 已移除的四个旧字段名单，防止读者参考旧版本配置。

## 相关文档
- 现有文档：[../../../website/guide/integration-by-capability.md](../../../website/guide/integration-by-capability.md)
- 契约类型源码：[../../../packages/contracts/src/policy.ts](../../../packages/contracts/src/policy.ts)、[../../../packages/contracts/src/identity.ts](../../../packages/contracts/src/identity.ts)
- 本次接入实测：[./04-pc-onboarding-review.md](./04-pc-onboarding-review.md)
