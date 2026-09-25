# 规格：contracts-foundation

## 目标

定义供每个 PWA 宿主适配器和运行时包使用的、与框架无关且可序列化的契约层。在 Service Worker 或构建集成出现前，本模块先明确应用身份、业务策略、编译执行计划、策略诊断和客户端生命周期事件。

成功标准是：Vue、React、SSR 或未来宿主适配器可基于相同身份和策略生成、校验同一份 `PwaPlan`，且不引入 UI 框架、Workbox、浏览器全局对象或 Node 请求类型。

## 范围

本模块提供 TypeScript 类型、运行时 schema 校验、诊断和契约测试。`policy-compiler` 负责归一化和 `PwaPlan` 编译。本模块不注册 Service Worker、不输出 manifest、不访问浏览器存储、不缓存响应、不编译计划，也不集成构建工具。

## 公开契约

### PwaIdentity

`PwaIdentity` 包含 `appId`、`manifestId`、`origin`、`scope`、`serviceWorkerUrl`、`manifestUrl`、`mountPath`、`environment` 和 `cacheNamespaceSeed`。

- 所有 URL 路径均为以 `/` 开头的同源绝对路径。
- `scope` 必须以 `/` 结尾（浏览器按字符串前缀匹配 scope，`/app` 会同时覆盖 `/apple`），且必须包含 `mountPath`；除非未来引入专用迁移模式，`serviceWorkerUrl` 和 `manifestUrl` 必须位于 scope 内。
- 身份由平台配置提供，`PwaPolicy` 永远不能覆盖它。
- 编译器通过机器可读诊断拒绝相互冲突的路径、scope 和 origin 值。

### 缓存命名空间

平台缓存名由 contracts 导出的纯函数生成（ADR-0008）。浏览器与 Service Worker 可以直接调用这些函数，它们不依赖 schema 库。

- 格式为 `pwa:<appId>:<environment>:<cacheNamespaceSeed>:<cacheKind>`。`cacheNamespaceSeed` 就是 ADR-0008 中的 identity-revision 段，只在有名称的身份迁移中提升。
- `appId`、`environment`、`cacheNamespaceSeed` 三段各自按 `encodeURIComponent` 编码，编码结果不含分隔符 `:`，因此不同应用或不同环境的前缀互不包含。身份校验会拒绝含孤立 UTF-16 代理项的 `appId` 与 `cacheNamespaceSeed`。
- v1 的 `cacheKind` 只有 `precache`。增加种类属于公开契约变更。
- 前缀分两级：
  - 完整前缀 `pwa:<appId>:<environment>:<cacheNamespaceSeed>:`，由 `PwaPlan.cacheNamespace.prefix` 记录。
  - 应用前缀 `pwa:<appId>:<environment>:`，覆盖该应用在该环境下所有 revision 的缓存，供恢复 worker 和身份迁移清理使用。不同环境的应用前缀互不覆盖。

### 安装 manifest

`PwaInstallMetadata` 包含 `startUrl`、`display`、名称、短名称、主题/背景色和已校验的图标声明。它不能覆盖身份 URL 或 scope；宿主输出前必须校验必需的图标变体。

### PwaPolicy

`PwaPolicy` 可 JSON 序列化，由 `schemaVersion`、安装意图、离线降级、更新模式和显式资源规则构成。

资源分类为 `asset`、`navigation-public-static`、`navigation-public-dynamic`、`public-data`、`session-data`、`mutation`、`stream` 与 `unclassified`。

- 业务路径规则只支持规范化、相对 `mountPath` 的路径前缀；不支持 glob、任意函数、正则表达式源字符串和 Workbox callback。匹配忽略 query 和 fragment；路径按 URL 标准解码、保留大小写，前缀边界必须为完整路径段。
- 仅安全分类且符合 `GET` 语义时，才允许具备缓存能力的策略。
- session、mutation 和 stream 分类会编译为平台拒绝规则。
- 业务允许规则不能覆盖平台拒绝规则。

### PwaPlan

`PwaPlan` 由 `policy-compiler` 基于身份、安装元数据、策略、拓扑、宿主构建产物和平台基线生成。`PwaPlan v1` 是稳定契约，字段为 `schemaVersion`、`planVersion`、`policyVersion`、`identity`、`install`、`hostBuildOutput`、`topology`、`artifacts`、`precache`、`cacheNamespace`、`requestBaselineDenials`、`pathRules`、`offlineFallback`、`updateMode` 与 `diagnostics`；后续模块不得以补字段的方式修改 v1。

- `requestBaselineDenials` 必须按规范顺序完整列出全部平台基线拒绝项，不得缺项、重复或重排；增加拒绝项需要提升 `planVersion`。
- 有效计划的 `diagnostics` 只能包含 warning；含 error 的编译结果不是有效计划。
- `cacheNamespace.prefix` 必须等于由 `identity` 计算出的完整前缀。

`schemaVersion` 版本化序列化形状；`planVersion` 版本化编译计划语义；`policyVersion` 版本化业务策略语义。未知安全字段必须拒绝；未来可选能力只能放入带命名空间的 `extensions`。事件消费方必须安全忽略未知事件类型。

### 事件与诊断

客户端事件使用带版本、事件类型、时间戳、应用 ID 和非敏感元数据的可辨识 envelope。基础层支持的事件名为 `registered`、`install-eligible`、`installed`、`update-waiting`、`update-applied`、`activated`、`offline-fallback` 和 `cache-cleaned`。

诊断包含稳定 code、严重度、契约路径和人类可读消息，绝不得包含鉴权状态、Push 订阅、响应体或令牌。

## 兼容性

本包与框架无关，使用可被 Vue 3.4+、React 19.2+、Nuxt、TanStack Start 和未来适配器消费的 TypeScript 类型。运行时契约面向现代浏览器和当前 Node 构建环境；在 import 时不得依赖浏览器全局对象。

`schemaVersion: 1` 是首个稳定格式。后续版本必须保留 v1 解析能力或提供显式迁移函数；变更身份语义需要新增 ADR 和迁移计划。

## 命令

实现计划将确定工作区命令。本模块最终必须支持：

```text
pnpm lint
pnpm test --filter @pwa-platform/contracts
pnpm build --filter @pwa-platform/contracts
```

## 测试策略

- 单元测试校验合法身份和策略的结构。
- 负向测试覆盖无效 scope/路径组合、不安全缓存请求、不可序列化配置、身份覆盖尝试和不合法的结构规则。
- 契约测试证明编译器输入可在没有浏览器全局对象时消费；编译器确定性属于 `policy-compiler`。
- 契约快照测试覆盖公开 TypeScript 和序列化 JSON 结构。

## 边界

- 始终：同时执行运行时与 TypeScript 校验；保持公开输出可序列化；使用稳定错误码。
- 先询问：变更公开字段、资源分类、schema 版本或允许的缓存策略。
- 禁止：引入 Vue/React/Workbox；模块加载时读取浏览器全局对象；允许原始 Service Worker callback；默认将用户数据视为可缓存。

## 验收标准

1. contracts 包暴露带版本的身份、策略、计划、事件和诊断类型。
2. 合法身份、安装元数据和策略输入可校验为可序列化契约值。
3. 不安全或不一致的输入以稳定诊断失败。
4. schema 不提供可表达覆盖平台身份或安全拒绝规则的字段。
5. 测试不依赖浏览器，并证明合法和非法的结构场景；合并优先级与确定性属于 `policy-compiler`。

## 开放问题

- 精确的包构建工具和 TypeScript/Vitest 版本将由实现计划选定，并遵守仓库兼容性策略。

## 修订：安装元数据的扩展字段（2026-09-24，已评审通过）

### 起因

2026-09-24 的平台完成度审查对照 Elk 发现：平台生成的 manifest 只有 9 个成员（`id`、`scope`、`start_url`、`display`、`name`、`short_name`、`theme_color`、`background_color`、`icons`）。其中最实际的缺口是 `screenshots`：Chrome 的"富安装对话框"依赖它，没有截图时安装提示只是一个简单的对话框。

### 已确认的前提（项目所有者，2026-09-24）

1. 不新增模块。本节是主体，另有 [build-verifier](build-verifier.md) 与 [vite-adapter](vite-adapter.md) 的配套修订。
2. 新字段**全部可选**。不写时 manifest 与 `PwaPlan` 与修订前逐字节相同，策略不升版本。
3. 新增 ADR-0037，记录接受与不接受哪些 manifest 成员及理由。
4. `launch_handler` 不做：它改变启动行为，且非 `auto` 模式需要页面用 `LaunchQueue` 接收目标，牵涉 client-runtime。
5. 截图与快捷方式图标的文件**必须存在于构建产物**，缺失即构建失败（由 build-verifier 检查）。Chrome 对截图的尺寸、比例、数量偏好只给**警告**。
6. `lang`、`dir` 不纳入（项目所有者 2026-09-24 评审时确认，理由见下表）。

### 字段取舍（依据 2026-09-24 查证的 W3C、MDN 与 Chrome 官方文档）

| 成员 | 决定 | 理由 |
|---|---|---|
| `description` | 纳入 | Android 安装提示会展示；W3C app-info 扩展成员 |
| `categories` | 纳入 | 分发平台分类用，浏览器不校验；透传 |
| `orientation` | 纳入 | W3C 主规范成员，Android 与独立窗口下生效 |
| `display_override` | 纳入，只收已标准化的取值 | `window-controls-overlay`、`fullscreen`、`standalone`、`minimal-ui`、`browser`；`tabbed`、`borderless` 仍在 WICG 孵化，不收 |
| `screenshots` | 纳入 | Chrome 富安装对话框（桌面 108+、Android 94+） |
| `shortcuts` | 纳入 | W3C 主规范成员；长按图标或右键时的快捷入口 |
| `lang`、`dir` | **不纳入**（与审查报告的原建议不同） | MDN 明确标注主流浏览器未实现，写入不产生任何效果；manifest 本地化的实际机制是仍在孵化的 `*_localized` 成员 |
| `launch_handler` | 不纳入 | 见前提 4 |
| `share_target`、`file_handlers`、`protocol_handlers` | 不纳入 | 需要 worker 或页面代码处理，与"业务不得注入 worker 代码"的边界冲突 |
| `related_applications`、`prefer_related_applications` | 不纳入 | 推广原生应用，不属于平台范围 |
| 按配色方案区分的主题色 | 不纳入 | manifest 的 `theme_color` 不支持；标准做法是 HTML 中带 `media` 的 `<meta name="theme-color">`，属另一项工作 |

### 契约增量

```ts
type PwaInstallMetadata = {
  // ……既有 7 个字段不变
  readonly description?: string;
  readonly categories?: readonly string[];
  readonly orientation?: PwaOrientation;          // any | natural | portrait | portrait-primary | portrait-secondary
                                                 // | landscape | landscape-primary | landscape-secondary
  readonly displayOverride?: readonly PwaDisplayOverride[];  // window-controls-overlay | fullscreen | standalone
                                                            // | minimal-ui | browser
  readonly screenshots?: readonly PwaInstallScreenshot[];
  readonly shortcuts?: readonly PwaInstallShortcut[];
};

type PwaInstallScreenshot = {
  readonly src: AbsolutePath;
  readonly sizes: string;                         // 单个 "宽x高"，例如 "1280x800"
  readonly type: "image/png" | "image/jpeg" | "image/webp";
  readonly formFactor?: "wide" | "narrow";
  readonly label?: string;
};

type PwaInstallShortcut = {
  readonly name: string;
  readonly url: AbsolutePath;                     // 必须在 identity.scope 内
  readonly shortName?: string;
  readonly description?: string;
  readonly icons?: readonly PwaInstallIcon[];     // 与既有 icons 同一形状
};
```

**格式规则（schema 层，与既有字段相同的严格对象校验）**：文本非空；`categories` 为小写、非空、不重复的字符串；`displayOverride` 至少一项且不重复；`screenshots[].sizes` 为单个 `宽x高`（小写 `x`，宽高为不带前导零、至多 5 位的正整数）；所有新增数组至少一项，空数组拒绝（写了等于没写的配置不被静默接受）。

**跨字段规则（错误）**：
- `install.shortcut-url-outside-scope`：`shortcuts[].url` 不在 `identity.scope` 内。规范本身不强制此条，平台与既有 `startUrl` 规则保持一致，保证快捷入口在应用内打开。
- `compile.shortcut-url-in-child-scope` 与 `plan.shortcut-url-in-child-scope`：同源共享拓扑下，根应用的快捷方式落进子应用的 scope。与 `startUrl` 的两层规则（`*.start-url-in-child-scope`）一一对应：编译期由 core 检查，计划层由 contracts 兜底。（2026-09-24 MX7 评审补入：最初只照搬了 scope 规则，漏了子 scope 规则。）
- `url` 与其他 `AbsolutePath` 一样只接受路径，不带查询串或片段。

**Chrome 偏好（警告，不阻断）**：
- `install.screenshot-size-out-of-range`：宽或高不在 320–3840 像素之间。
- `install.screenshot-aspect-ratio`：长边超过短边的 2.3 倍。
- `install.screenshot-aspect-mismatch`：同一 `formFactor` 的截图宽高比不一致。
- `install.screenshot-count`：`wide` 多于 8 张或 `narrow`（含未写 `formFactor`）多于 5 张，超出部分 Chrome 不显示。
- `install.screenshot-no-wide`：写了截图但没有 `wide`，桌面端不会显示截图。
- `install.description-too-long`：`description` 超过 324 个字符（Chrome DevTools 的提示阈值）。

平台只核对声明的 `sizes`，不读取图片的实际尺寸；接入说明要求如实填写。诊断只报字段路径，不回显值（与既有规则一致）。

**manifest 输出**：驼峰字段按 manifest 成员名输出（`displayOverride` → `display_override`，`formFactor` → `form_factor`，`shortName` → `short_name`），未写的字段不输出任何键，顺序固定。

**`PwaPlan`**：`plan.install` 原样带上新字段；`PwaPlan` 的 `schemaVersion` 不变。旧版本平台包的校验器会拒绝带新字段的计划（严格对象），因此同一次构建内的包版本必须一致——现有分发方式本就如此，接入说明写明。

### 不变的部分

身份与 scope 规则、既有 7 个字段与图标变体要求、`PwaPolicy`、worker 配置、预缓存规则。截图与快捷方式图标**不自动进入预缓存**：安装对话框在联网时展示，平台不为它们增加离线存储；若业务自己的资源规则覆盖了它们所在的路径，则照常按规则进入预缓存。

**对 core 的改动**（2026-09-24 MX7 评审后）：`installStartUrlInChildScope` 一并检查快捷方式 URL，core 的诊断路径字段增加 `shortcuts`、`url`。除此之外 core 不变，`install` 仍原样进入计划。

### 本修订不做的事

读取图片实际尺寸；按语言生成多份 manifest；为既有 `icons` 增加文件存在性检查（见 build-verifier 修订的已知限制）；HTML 中按配色方案的 `theme-color`。

### 测试策略增量

- **单元（contracts）**：每个新字段的合法与非法样例；每个诊断码（错误与警告各自的触发与边界：320/3840、2.3 倍、8/5 张）；空数组拒绝；不回显值；未写新字段时 schema 输出与修订前相同。
- 生成与产物检查的测试见 build-verifier、vite-adapter 修订。

### 验收标准增量

- 上述测试通过，既有测试不改断言。
- ADR-0037 被接受；[契约说明](../docs/architecture/contracts.md)同步；新增 manifest 字段的接入说明。

## Documentation impact

本表覆盖 2026-09-24 修订；原交付不回填（见下一节）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | README 不变；字段写法在接入说明中。 |
| capability-map | follow | 不涉及。 |
| decisions | create | ADR-0037：安装元数据的扩展字段，以及平台接受与不接受的 manifest 成员。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | 不涉及。 |
| supply-chain | follow | 不涉及。 |
| browser-matrix | follow | 按既有矩阵登记；截图等字段的 Chrome 行为写入 ADR 与接入说明。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | follow | 不涉及。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | 不涉及。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 该模块的修订节登记新增的产物检查；本表只覆盖契约侧。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 生成侧的修订记在该模块规格中。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | Nuxt 复用同一生成器，不改该模块；新增的 Nuxt 构建测试记在 vite-adapter 修订中。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 不涉及。 |

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。
