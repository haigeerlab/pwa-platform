# Spec: pwa-entry-resilience

> 标题按 spec-guard Proposal 晋升校验要求写作 `# Spec: <module-id>`，与其他规格的"规格："写法不同。来源：[Proposal](proposals/pwa-entry-resilience.md)；能力图位置已由项目所有者于 2026-09-17 评审通过。

## 目标

当应用当前的 Origin 正在迁移或无法访问时，为**已安装、应用壳仍能从缓存启动**的用户提供一条可信、经用户确认的备用入口。

已安装的 PWA 绑定其原始的协议、主机与端口。浏览器的同源隔离意味着 Service Worker、Cache Storage、IndexedDB、Cookie 与安装身份都**无法**被带到新 Origin——本模块不尝试绕过这一点。它能做的是：在旧 Origin 上缓存一份签名可验的"备用入口清单"，在需要时向用户展示经批准的新地址、迁移原因与有效期，由用户点击后打开新 Origin。新 Origin 是一个独立的应用身份，自带 manifest、worker、存储与登录状态。

成功的样子：

- 计划内迁移时，打开旧应用的用户看到迁移公告和新地址，点击后到达新 Origin 上与原页面对应的位置，在那里重新登录。
- 旧 Origin 在网络层不可达、而用户设备在线时，用户看到"主入口可能不可用"的提示和经过探测确认可达的备用地址。
- 任何没有有效签名、使用未知或已撤销密钥、已过期、指向未批准 Origin 或序号回退的清单都被拒绝，界面上不出现任何入口。
- 过程中没有任何令牌、Cookie、个人数据进入 URL、浏览器历史或日志。

## 范围

### 本模块交付

- **新私有包 `@pwa-platform/entry-resilience`**，包含：
  - 签名清单的契约、解析与校验（独立于 `PwaPlan`，自带 `schemaVersion`）；
  - 页面侧查询函数 `checkEntryRecovery()`，供应用决定是否展示入口；
  - 平台发布的入口恢复页（静态 HTML 加外链脚本，不含内联脚本）；
  - Vite 插件 `pwaEntryResilience()`，与 `@pwa-platform/vite` 的 `pwa()` 并列使用，发布恢复页、脚本与虚拟配置模块；
  - 返回路径校验；
  - 单元测试与真实浏览器测试。
- **对已交付包 `@pwa-platform/vite` 的增量修改**（项目所有者 2026-09-17 批准）：新增只读插件 API，让同一构建中的其他插件读取编译后的 `PwaPlan`；不改变 `pwa()` 的选项与既有产物。修订 ADR-0015。
- **两份 ADR**：ADR-0017（信任模型），ADR-0018（入口恢复的交付边界）。
- **运维文档**：`docs/operations/entry-recovery-drill.md`（入口恢复演练与记录模板），以及在发布与事故 Runbook 中新增"入口清单签发、密钥轮换与撤回"一节。

### 不在范围

- 绕过同源保护，或在 Origin 之间复制 Cookie、Cache Storage、IndexedDB、Service Worker 状态。
- 单次网络失败后自动切换域名，以及任何静默重定向。
- 在 URL 中传输访问令牌、刷新令牌、Cookie、个人数据或可重放凭据。
- **服务端一次性交接码的签发与传递**（见"已决定事项"第 9 条）。
- SSO/OIDC 服务端、交接服务、域名注册与 DNS 自动化、签名私钥的托管设施。
- 框架绑定（Vue/React）集成、SSR 应用集成（归 `ssr-adapters` 之后的迭代）。
- Push 投递。

## 依赖

| 模块 | 本模块如何使用 |
|---|---|
| contracts-foundation | `PwaIdentity` 类型与 `appId`/`environment`，用于把清单绑定到应用与环境 |
| vite-adapter | 与 `pwa()` 并列构建；通过新增的只读插件 API 读取编译后的计划，确认恢复页已进入平台预缓存 |
| sw-runtime | 平台 worker 在离线或网络失败时从预缓存返回恢复页；本模块**不修改**其请求判断表 |
| browser-test-harness | 真实浏览器证据：多台 fixture 服务器模拟多个 Origin |
| platform-governance | 新增演练文档与 Runbook 一节，沿用浏览器矩阵的记录字段 |
| policy-compiler | 恢复页的预缓存依赖应用策略中的资源规则由编译器纳入计划 |
| build-verifier | 本模块的构建期检查沿用其报告形态（诊断码 + 契约路径，不回显输入） |
| client-runtime | 能力图声明了该依赖；**按本规格的设计本模块不调用它**。依赖边保持不变（已决定事项第 13 条） |

不依赖 `vue-react-adapters` 与 `examples-browser-e2e`。

## 信任模型（ADR-0017 的内容）

### 资产与信任边界

| 资产 | 需要防的事 |
|---|---|
| 用户被引导去的 Origin | 被引到攻击者控制的域名（钓鱼） |
| 签名私钥 | 泄露后可签发任意清单；**永不进入构建、仓库或浏览器** |
| 返回路径 | 被利用成开放重定向或注入载体 |
| 用户会话 | 不得以任何形式跨 URL 边界携带 |

| 跨越边界的输入 | 来源 | 处理 |
|---|---|---|
| 构建期种子清单与公钥集 | 仓库中受版本控制的文件，发布流程离线签名 | 构建时完整校验，不合法则构建失败 |
| 发现源返回的清单 | 独立 Origin，网络不可信 | 先验签、后解析；大小与超时受限 |
| IndexedDB 中的最后已知可信清单 | 同源存储，可能被同源 XSS 篡改 | 每次读取重新验签，不信任已解析的数据 |
| 返回路径查询参数 | 任何能构造链接的人 | 严格校验，不合法即丢弃，不报错回显 |

### STRIDE

| 威胁 | 场景 | 缓解 |
|---|---|---|
| 伪造 | 伪造清单指向钓鱼域名 | Ed25519 验签；清单内 Origin 必须在构建期批准列表中——私钥泄露时攻击面也被限制在批准列表内 |
| 篡改 | 中间人或同源脚本改清单 | 对原始字节验签后才解析；存储数据每次读取重新验签 |
| 回放/回滚 | 重放旧的"迁移中"清单，或用旧清单覆盖撤回 | 单调递增 `sequence`，拒绝低于已存序号的清单（下限只在其签名密钥仍受信任时有效）；`expiresAt` 过期即拒绝 |
| 信息泄露 | 令牌或路径中的个人数据进入 URL 与日志 | 只允许相对返回路径；诊断只输出码，不输出 URL、路径或清单内容 |
| 拒绝服务 | 超大清单、慢响应、存储写满 | 清单大小上限 64 KiB、发现源请求超时 5 秒、只存一条记录 |
| 权限提升 | 清单中的文本被渲染为 HTML | 一切展示文本只经 `textContent` 写入；恢复页不含内联脚本，可在严格 CSP 下运行 |

### 不在本模块能力范围内的威胁（如实登记）

- **旧域名被他人接管。** 接管者返回的任何 HTTP 响应都会被平台 worker 当作网络可用（导航策略"网络有响应就用网络，包括 4xx/5xx"），恢复页不会出现；接管者还能在旧 Origin 发布新的 worker 脚本。本模块无法防御，只能缩短暴露：清单有效期上限与发布流程中的域名续费监控。
- **签名私钥泄露。** 攻击面被批准 Origin 列表限制；彻底处置需要发布一个移除该密钥的新构建，已安装且长期离线的客户端在更新前仍信任旧密钥。
- **设备时钟错误。** 过期判断依赖设备时钟，允许 5 分钟偏差；时钟严重偏差的设备可能接受过期清单或拒绝有效清单。

## 契约

### 签名信封

```json
{
  "keyId": "entry-2026-09",
  "payload": "<base64url 编码的清单 JSON 原始字节>",
  "signature": "<base64url 编码的 Ed25519 签名，签名对象为 payload 解码后的原始字节>"
}
```

**先验签、后解析**：验签对象是 `payload` 解码后的字节，不对 JSON 做任何规范化；只有验签通过才 `JSON.parse`。这样不存在"两种等价 JSON 签名不同"的问题。

**校验上下文必须有效**：当前时间须为有限数，有效期上限须为有限正数，否则失败即关闭（`entry.context-invalid`）。运行时端口返回的时间不是有限数时，在任何存储与网络访问之前失败即关闭（`entry.runtime-unavailable`）。

### 清单（payload 解析后）

```json
{
  "schemaVersion": 1,
  "appId": "pwaexample",
  "environment": "production",
  "sequence": 7,
  "issuedAt": "2026-09-17T08:00:00Z",
  "expiresAt": "2026-10-01T08:00:00Z",
  "status": "migrating",
  "reason": { "code": "planned-migration", "message": "域名将于 10 月 1 日停用" },
  "entries": [{ "origin": "https://new.example.com", "startPath": "/app/" }]
}
```

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 字面量 `1`；清单、`reason` 与 `entries` 的每一项都是封闭形状，出现未知字段即拒绝（T1 实施时明确，2026-09-17） |
| `appId`、`environment` | 必须与构建时的 `PwaIdentity` 逐字相等，防止跨应用、跨环境重放 |
| `sequence` | 非负安全整数；只接受不低于已存清单序号的清单，等于时 payload 字节必须完全相同 |
| `issuedAt`、`expiresAt` | 严格形如 `YYYY-MM-DDTHH:mm:ssZ`，不含毫秒与时区偏移，各字段范围逐一校验，年份不得早于 1970；`issuedAt ≤ 当前时间 + 5 分钟`，`当前时间 < expiresAt`，`expiresAt` 必须晚于 `issuedAt`，有效期（`expiresAt - issuedAt`）不超过构建配置的上限（默认 30 天，最大 90 天）。格式与先后顺序两条于 T1 实施时明确（2026-09-17） |
| `status` | `normal`、`migrating`、`incident` 之一 |
| `reason` | `code` 为 `planned-migration`、`incident`、`none` 之一；`message` 可选，纯文本，最长 200 个 UTF-16 码元，不得含控制字符 |
| `entries` | 0 到 5 条；`origin` 必须是规范化 Origin（见下），且在构建期批准列表中；运行时还必须不等于当前页面的 `location.origin`（构建期另查不等于身份的 `origin`——两者在测试与部署中可能不同，不能互相替代）；`startPath` 以 `/` 开头、无 `..` 段、无反斜杠、无 `//`、无控制字符，长度不超过 512；百分号解码一次后仍须满足这些规则，解码失败即拒绝 |

**Origin 规范化**：`new URL(origin).origin === origin`；协议必须为 `https:`，唯一例外是 `http://localhost`、`http://127.0.0.1` 与 `http://[::1]`（浏览器视为潜在可信的地址，供本地与测试使用）；不得含用户名、密码、路径、查询或片段。

### 公钥集（构建期配置）

```ts
type EntryKey = {
  readonly keyId: string;          // kebab-case，1–64 字符
  readonly publicKey: string;      // base64url 编码的 32 字节 Ed25519 原始公钥
  readonly notAfter?: string;      // 可选，ISO 8601；此后该密钥签的清单一律拒绝
};
```

`keyId` 未知、公钥格式错误、`notAfter` 已过的密钥签的清单均拒绝。轮换流程：先发布同时含新旧公钥的构建 → 用新密钥签发 → 发布移除旧公钥的构建。撤回密钥即发布移除它的构建。

### 状态与展示规则

| `status` | 是否展示入口 | 条件 |
|---|---|---|
| `normal` | 默认不展示 | 仅当"主入口探测失败且至少一个备用入口探测成功"时，展示为"主入口可能不可用"，并明确标注**未经确认** |
| `migrating` | 展示 | 在线与否都展示计划迁移公告 |
| `incident` | 展示 | 展示故障公告 |

**撤回**：签发 `sequence` 更高、`status` 为 `normal` 且不含迁移语义的清单。由于序号单调，旧的迁移或故障清单此后无法被重新接受。

**探测**：
- 主入口探测请求 `<mountPath>__pwa-entry-probe?<随机数>`。该路径不在预缓存中，而 v1 平台 worker 没有运行时缓存：即使它匹配应用策略里的 `network-first` 规则，网络失败时缓存也查不到它，因此探测结果反映真实网络；任何 HTTP 响应都视为"可达"。
- 备用入口探测以 `mode: "no-cors"`、`credentials: "omit"` 请求 `<origin><startPath>`，网络层成功即视为"可达"。响应不透明且不被读取，重定向与否不影响结论。
- 每次探测超时 5 秒，不重试。
- 设备离线时主入口与备用入口都会失败，因此**不会**展示任何入口——用户离线不会被误导成"域名故障"。

### 清单的来源与选择

候选来源依次为：构建期种子、IndexedDB 中的最后已知可信清单、发现源的新清单（可访问时）。选择规则：

1. 每个候选独立完整校验，不合法的丢弃并记录诊断码。
2. 在合法候选中取 `sequence` 最大者。若最大序号有两个及以上候选且 payload 字节不同，视为冲突，结果为"无入口"并记录 `entry.sequence-conflict`——失败即关闭，不回退到较低序号，以免冲突被利用来降级。
3. 发现源的合法清单序号大于已存清单时，覆盖写入 IndexedDB；否则不写。
4. 全部候选都不合法时，结果为"无入口"。

**T3 实施时明确的细则（2026-09-17）**：
- **序号下限**：IndexedDB 记录同时保存信封与写入时已校验的序号；下限取该序号，**但前提是已存信封能用现行密钥验签通过（不检查过期），且签名内容中的 `appId`、`environment`、`sequence` 与记录一致**——只看 `keyId` 的话，同源写入一份伪造记录就能钉死下限（T9 评审发现，2026-09-17）。已存清单过期后下限依然有效，**但仅当已存信封的签名密钥仍在当前公钥集中且未过 `notAfter` 时才采用**——密钥被撤销即放弃下限，否则泄露的密钥签发一份序号极大的清单，就能让此后所有合法清单永远无法被接受（项目所有者 2026-09-17 决定）。
- **同序号冲突**：与下限相等的候选，payload 与已存信封不同即丢弃。
- **展示前提**：`available` 至少要有一条入口；只有 `normal` 状态会发出探测，`migrating` 与 `incident` 不探测。
- **运行时条件不可用**：`currentOrigin` 或时钟不可用时，在任何存储与网络访问之前失败即关闭，诊断码为 `entry.runtime-unavailable`。
- **写入失败**：与读取失败使用不同的诊断码，分别为 `entry.storage-write-failed` 与 `entry.storage-unavailable`。

**发现源请求**：`fetch(discoveryUrl, { credentials: "omit", redirect: "error", cache: "no-store", signal: 5 秒超时 })`。`discoveryUrl` 必须为 HTTPS（本地地址例外同上），且不得与当前身份的 Origin 相同；响应体超过 64 KiB 即中止。发现源需要为应用的 Origin 返回 CORS 头，这由部署方负责。

**存储**：
- IndexedDB 库名为 `pwa-entry:<appId>:<environment>`（段落用 `encodeURIComponent` 编码），只有一个对象仓库、一条记录，保存原始信封。
- 该库不在缓存命名空间下，ADR-0005 的恢复 worker 不会删除它。
- 清单是公开数据，登出时不清除。

### 页面侧 API

```ts
type EntryRecoveryResult =
  | { readonly kind: "none"; readonly diagnostics: readonly EntryDiagnostic[] }
  | {
      readonly kind: "available";
      readonly status: "migrating" | "incident" | "unconfirmed-outage";
      readonly reason: { readonly code: string; readonly message: string | null };
      readonly expiresAt: string;
      readonly recoveryPageUrl: string;   // 平台恢复页，带经校验的返回路径
      readonly diagnostics: readonly EntryDiagnostic[];   // { code, path }，不含任何输入值
    };

function checkEntryRecovery(options?: { readonly returnPath?: string }): Promise<EntryRecoveryResult>;
```

- 配置来自插件提供的虚拟模块，应用不直接传入公钥或发现源。
- **从不抛出**：网络、存储、校验失败一律体现为 `kind: "none"` 加诊断码。
- `returnPath` 不合法时静默丢弃，不影响其余结果。
- **结果中不含备用入口地址**：地址只在恢复页上展示与导航，应用拿到的只是恢复页链接，无法绕过确认步骤直接跳转。

### 入口恢复页

- 路径为 `<mountPath>pwa-entry.html`，外链脚本在 `<mountPath>assets/` 下带指纹。
- 页面独立重新执行完整选择与校验，不信任 URL 中除返回路径以外的任何参数。
- 展示内容：目标主机名、迁移原因、有效期，每个入口一个按钮；文本全部经 `textContent` 写入。`unconfirmed-outage` 时只展示探测确认可达的入口；`migrating`、`incident` 不探测，展示清单中的全部入口。
- 用户点击后执行顶层导航 `location.assign(href)`。`href` 由 `new URL(startPath, origin)` 构造，其 origin 必须仍等于批准的 Origin，否则丢弃该入口；有合法返回路径时以 `URLSearchParams` 写入 `pwa-return` 参数。新 Origin 须按 `URLSearchParams` 解析该参数（空格编码为 `+`），不能对原始查询串直接 `decodeURIComponent`。没有有效返回路径时不带该参数。不使用 `window.open`，不自动导航，页面脚本不使用任何定时器（T9 评审后明确，2026-09-17）。
- 无入口时显示"当前没有可用的备用入口"。

### 返回路径校验

合法返回路径必须满足全部条件，否则丢弃：

- 类型为字符串，长度 1–1024；
- 以单个 `/` 开头，第二个字符不是 `/` 或 `\`；
- 不含 `\`、控制字符（U+0000–U+001F、U+007F）；
- 原始值与百分号解码一次后的值都满足以上规则，且按 `/`、`?`、`#` 切分的任何一段都不等于 `..`——防止 `%2F%2F`、`%5C`、`%2E%2E`、`%3F` 等编码绕过（`%3F` 一项为 T9 评审发现）；
- 用当前 Origin 解析后，结果的 Origin 仍是当前 Origin，且 pathname 位于身份的 `scope` 之下。

新 Origin 上的应用自行决定如何使用 `pwa-return`；平台只保证它发出的值通过上述校验。

## 构建集成

```ts
// vite.config.ts
plugins: [
  pwaEntryResilience({
    identity,                                   // 与 pwa() 相同的对象
    keys: [{ keyId: "entry-2026-09", publicKey: "..." }],
    seed,                                       // 已解析的签名信封对象：import seed from "./pwa-entry/seed.json" with { type: "json" }
    approvedOrigins: ["https://new.example.com"],
    discoveryUrl: "https://status.example.net/pwa-entry/pwaexample.json",
    maxValidityDays: 30,
  }),
  pwa({ identity, policy, install, topology }),
]
```

插件从 `@pwa-platform/entry-resilience/vite` 导入，页面侧查询函数从 `@pwa-platform/entry-resilience/client` 导入。**应用策略须为恢复页加一条资源规则**，路径为 mount-relative：`{ pathPrefix: "/pwa-entry.html", resourceClass: "asset", cache: "cache-first" }`，恢复页脚本由已有的 `/assets` 规则覆盖；缺了任何一条，构建都会失败。

**种子以已解析对象传入，而不是文件路径**（T5 实施时修订，2026-09-17）：插件因此不需要 `node:fs`，符合 ADR-0018 "`src/` 不导入 `node:` 模块"的决定。

**产物校验在 `writeBundle` 中进行，失败时文件已经写到输出目录**（与 `pwa()` 自身的产物校验相同）。构建失败时的输出目录一律不得发布。

构建期必须失败的情况（诊断码 + 契约路径，不回显输入值）：

- 公钥或种子格式错误，种子验签失败，或种子已过期；
- `approvedOrigins` 中有非规范化 Origin，或包含身份自身的 Origin；
- `discoveryUrl` 不是 HTTPS、与身份同 Origin；
- `maxValidityDays` 超出 1–90；
- 恢复页或其脚本（包括脚本传递导入的全部 chunk）未进入平台预缓存：通过 `@pwa-platform/vite` 新增的只读插件 API 读取编译后的计划，任一 URL 不在 `plan.precache` 中即失败；
- `base` 与身份的 `mountPath` 不一致，或同一构建中没有挂载 `pwa()`。

**配置中出现可识别的私钥形态时构建失败**：PEM 中的 `PRIVATE KEY` 字样；Ed25519 PKCS#8 DER（48 字节，以 `302e020100300506032b657004220420` 开头）；64 字节的"种子加公钥"形态。**32 字节的原始私钥种子与公钥长度相同，按形态无法识别**：误把它填进 `publicKey` 时，只有当该密钥被用来校验种子清单、验签失败，构建才会失败；未被种子使用的密钥位上无法拦截。这一点写入已知限制，靠发布流程的密钥托管规程补足。

## 命令

```bash
pnpm test --filter @pwa-platform/entry-resilience
pnpm build --filter @pwa-platform/entry-resilience
pnpm typecheck --filter @pwa-platform/entry-resilience
pnpm test:browser --filter @pwa-platform/entry-resilience
```

本包声明 `build`、`test`、`typecheck`、`test:browser` 四个脚本。按 examples-browser-e2e 的经验，`tsconfig` 的 `include` 必须同时覆盖所有源文件扩展名，并显式声明所用的 `@types/*`，不依赖仓库外可解析到的类型。

## 测试策略

- **单元测试（Vitest）**：
  - 签名信封与清单的每条拒绝规则各至少一个用例：无效签名、未知 `keyId`、过期密钥、篡改 payload、未知字段、`appId` 或环境不符、序号回退、同序号不同字节、过期、有效期超上限、未批准 Origin、非规范化 Origin、自身 Origin；
  - 返回路径的开放重定向与编码绕过表：`//evil`、`/\evil`、`/%2F%2Fevil`、`/%5Cevil`、`/a/%2E%2E/b`、控制字符、scope 外路径；
  - 选择规则：来源优先级与覆盖写入条件；
  - 测试用密钥对在测试内由 `node:crypto` 生成，**仓库中不存放任何私钥**，包括测试用的。
- **真实浏览器测试（browser-test-harness）**，在一次测试中启动三台 fixture 服务器，分别作为当前 Origin、备用 Origin、发现源：
  - 计划迁移：发现源返回 `migrating` → 应用拿到恢复页链接 → 恢复页展示目标主机 → 点击后顶层导航到备用 Origin 且带合法 `pwa-return`；
  - 网络层不可达：当前 Origin 连接被拒、应用壳从缓存启动 → `unconfirmed-outage` 展示；
  - 设备离线：不展示任何入口；
  - 撤回：更高序号的 `normal` 清单使之前的迁移公告消失，旧清单重放被拒；
  - 篡改：发现源返回篡改或错签清单。全新设备上不展示入口、也不写入存储；已存有合法清单时，存储不被覆盖，结果继续来自已存清单（T7 实施时拆分表述，2026-09-17）；
  - 恢复 worker 共存：部署 ADR-0005 的恢复 worker 后，IndexedDB 中的清单仍在。
- **每项真实浏览器测试配一次变异**，证明它会失败，且死在目标断言上。
- **按浏览器矩阵如实登记**：本机只能执行 Chrome 桌面端 N；其余必测范围未执行，按矩阵计为未通过。

## 边界

- **始终**：先验签后解析；诊断只输出码；展示文本只经 `textContent`；清单与存储数据每次使用都重新校验；未取得的证据如实登记。
- **先询问**：修改任何已交付包（`@pwa-platform/vite` 的只读计划 API 已批准，范围之外的改动仍须询问）；新增依赖；引入交接码或任何跨 URL 的凭据形态；放宽 Origin、返回路径或有效期规则。
- **禁止**：在仓库、构建产物或测试夹具中存放私钥；自动跳转；通过 API 把备用入口地址交给应用代码（地址本身是公开信息，这条防的是应用绕过确认步骤直接跳转）；在 URL、日志或诊断中出现令牌、Cookie、个人数据或完整 URL。

## 验收标准

1. 新包的单元测试覆盖"测试策略"列出的每条拒绝规则与返回路径绕过用例，且每条规则至少一次变异证明其测试能失败。
2. 真实浏览器测试的六个场景在 Chrome 桌面端 N 上通过，各配一次变异。
3. 构建期失败条件逐条有测试，包括疑似私钥的拦截。
4. 仓库、构建产物与测试夹具中扫描不到可识别形态的私钥**材料**：完整的 PEM 私钥块、PKCS#8 前缀后接密钥主体、64 字节形态。检测规则本身必须包含 `PRIVATE KEY` 字样与 PKCS#8 前缀，它们出现在检测代码、测试与文档中不算违反（T9 评审后修正措辞，2026-09-17）。32 字节原始种子无法按形态扫描，如实登记。
5. ADR-0017、ADR-0018 已接受；入口恢复演练文档与 Runbook 新增一节已评审。
6. 入口恢复演练按其模板在本机执行一次并记录。
7. 未取得的范围（Chrome Android 的 N 与 N-1、桌面端 N-1、参考档与渐进兼容档、真实域名与 DNS 故障形态）逐条登记为未执行及其原因。
8. 模块质量门禁：干净 worktree 冻结安装后全部门禁通过、独立评审完成、lockfile 审阅记录在案；CI 证据待账号恢复后补取。

## 已决定事项

**项目所有者，2026-09-17，经选项确认：**

1. 能力图位置：v1 之后最后一组并行模块，可选能力（ADR-0006），不进入 V1 验收矩阵。
2. 配置放在**独立契约与产物**中，`PwaPlan` v1 不变。
3. 入口触达：**应用调用查询函数**，自行决定在何处放置指向平台恢复页的链接；不修改 client-runtime、sw-runtime 与框架绑定。
4. 签名算法：**Ed25519**。WebCrypto 验签支持 Chrome 137+、Firefox 129+、Safari 17+（MDN browser-compat-data），覆盖当前必测 N 与 N-1。
5. 最后已知可信清单存于 **IndexedDB 独立库**，不在缓存命名空间下。

**本规格提出、2026-09-17 列为假设时项目所有者未提出异议，随规格评审一并确认：**

6. 只做用户确认后的顶层导航，不自动跳转。
7. 私钥永不进入构建；发布流程离线签名。
8. 不新增依赖：浏览器端用 WebCrypto，测试端用 `node:crypto`。
9. **本期不做一次性交接码。** 故障期间旧 Origin 的服务端本身不可用，交接码无从签发；计划迁移时在新 Origin 重新登录即可。它是本模块唯一可能让凭据跨 URL 边界的形态，推迟到有真实需求且服务端契约明确时再单独评审。
10. 以多台 fixture 服务器模拟多个 Origin，不修改 browser-test-harness。

**项目所有者，2026-09-17，裁决规格初稿的开放问题：**

11. **恢复页进入预缓存的确认方式**：给 `@pwa-platform/vite` 增加只读插件 API 暴露编译后的计划，修订 ADR-0015；同时关闭 examples-browser-e2e T6 登记的"插件不公开计划"缺口。
12. **有效期上限**：默认 30 天，最大 90 天，保持初稿。
13. **能力图的 `client-runtime` 依赖边保持不变**。收窄它需要同时修订 Proposal 与能力图行，而晋升校验逐字比对依赖列表，改动面大于这条依赖本身的影响。

## 修订：导出清单校验函数（2026-09-23，已评审通过）

### 起因

[ADR-0033](../docs/adr/0033-entry-manifest-supplied-by-the-application.md) 之后，清单由业务后端产出，但校验只发生在浏览器运行时，且失败被应用静默吞掉。接入方没有任何办法在下发之前确认一份清单合法。

2026-09-23 的类生产演练暴露了这个缺口的代价：示例的种子清单把 `expiresAt` 写成带毫秒的 `2026-10-23T00:00:00.000Z`，而平台的严格语法只接受 `YYYY-MM-DDTHH:mm:ssZ`；它在每次启动时被拒绝，线上无任何迹象，演练也不会发现（"基线无入口"与"种子失效"表现相同）。见[验证记录](../tasks/pwa-entry-resilience/verification.md)的演练记录。

### 已确认的前提（项目所有者，2026-09-23）

- **导出现有的纯函数，不新造包装。** 现签名已满足需要：不读时钟、不抛出、整份拒绝、诊断带字段路径。
- **不提供命令行入口。** 接入方的 CI 本来就有 Node，几行脚本即可；bin 一旦发布即成公开契约，以后难改。
- **`maxValidityDays` 由调用方传入**，文档写明必须与构建配置一致。不从产物里读取，也不允许省略——省略就会漏掉本次这类问题。
- 不改校验逻辑、不改运行时行为、不动恢复页；不发布 npm 版本。

### 契约增量

包根入口（`.`）新增导出：

```ts
export function parseEntryManifest(
  value: unknown,
  context: EntryManifestValidationContext,
): { ok: true; manifest: EntryManifest } | { ok: false; diagnostics: readonly EntryDiagnostic[] };

export type EntryManifestValidationContext = {
  readonly appId: string;
  readonly environment: string;
  /** 1–90 的整数，必须与构建配置的 `maxValidityDays` 一致。 */
  readonly maxValidityDays: number;
  /** 以毫秒计的判定时刻，由调用方注入；校验从不读取系统时钟。 */
  readonly now: number;
};
```

- 行为与内部使用时逐字相同：同一份输入、同一个上下文，得到同一个结果。**本修订不引入任何新的判定规则。**
- `now` 不提供默认值：后端常按"下发时刻"而非"校验时刻"判断有效期上限，注入更准确，也保持纯函数性质。
- 不导出需要浏览器端口的编排函数（`runEntryManifestUpdate` 等）：它们对后端与 CI 无意义。

### 不变的部分

- 页面侧 `updateEntryManifest` 与 `checkEntryRecovery` 的行为、恢复页、返回路径校验、存储与诊断码。
- 构建插件的选项。

### 交付物增量

- `packages/entry-resilience/src/index.ts` 的导出与包 README 的用法说明。
- [入口恢复演练](../docs/operations/entry-recovery-drill.md)的"范围与准备"增加一步：下发前先用该函数自查。
- [发布与事故处置手册](../docs/operations/release-and-incident-runbook.md)的"变更步骤"改为先在后端或 CI 自查，再在受控客户端确认——前者不需要浏览器，可进 CI。
- [examples-browser-e2e](examples-browser-e2e.md) 的种子清单测试改用真正的 `parseEntryManifest`，删除此前临时镜像的正则。

### 测试策略增量

- **单元测试**：导出的函数与内部调用行为一致（同输入同上下文得同结果）；公开面快照包含新导出；包的导入边界测试不变（`src/` 仍不导入 `node:` 模块）。
- **示例仓库**：两份已发布的种子清单用真正的校验器判为合法；把 `expiresAt` 改成带毫秒的形态后判为非法（这正是演练发现的缺陷形态）。

### 验收标准增量

- 接入方只用包根入口即可在 Node 侧校验一份清单，无需浏览器。
- 示例的种子测试不再自行镜像任何平台规则。
- 演练文档与发布手册都指向该函数作为下发前的自查手段。

## 已知限制

- **只覆盖网络层不可达。** 旧 Origin 返回任何 HTTP 响应时，恢复页不会自动出现；计划迁移靠签名清单的 `migrating` 状态覆盖这种情况，被接管的域名无法覆盖。
- **需要应用接入。** 没有调用 `checkEntryRecovery()` 的应用不会展示任何入口。
- **长期离线的安装**：设备离线超过清单有效期上限后，种子与已存清单都会过期，恢复能力随之失效。
- **设备时钟严重偏差**会使过期判断失准。
- **32 字节原始私钥种子无法按形态识别**，误填进公钥配置时只有被种子校验用到才会被发现。
- **新 Origin 上的登录与数据**完全从零开始，本模块不提供任何迁移。
- **SSR 应用与非 Vite 构建**本期不支持。

## 开放问题

本期无。规格初稿的三个开放问题已由项目所有者于 2026-09-17 裁决，记入"已决定事项"第 11–13 条。

## 修订：入口清单由业务应用提供（2026-09-23，已评审通过）

### 起因

首个业务接入方评审本模块后提出：清单应由应用自己的后端接口提供，而不是独立 Origin 上的签名静态文件；接口的机密性由业务已有的 HTTPS 与加解密保证；平台不应要求接入方建立密钥管理制度。项目所有者据此裁决，见 [ADR-0033](../docs/adr/0033-entry-manifest-supplied-by-the-application.md)，它取代 [ADR-0017](../docs/adr/0017-entry-manifest-trust-model.md) 的信任模型。

### 已确认的前提（项目所有者，2026-09-23）

- **平台不再验签，也不再持有信任根。** 删除公钥集、构建期种子、私钥形态扫描与发现源请求。
- **应用取数，平台保存。** 应用用自己的请求层取得并解密清单，再交给平台；平台不发起该请求，也不接收解密函数。
- **取消 Origin 批准列表。** 入口不再与构建期白名单比对，以便域名被封后启用事先未登记的新域名。
- **保留用户确认。** 平台绝不自动导航；入口只在恢复页展示，由用户点击后跳转。
- **安全边界如实登记**：谁能控制应用后端，谁就能把全体已安装用户引向任意域名。
- 本包未发布 npm，没有外部调用方，直接替换公开面，不提供兼容层。

### 不变的部分

- 恢复页的行为：列表展示、每个入口一个按钮、文本经 `textContent` 写入、用户点击后 `location.assign` 顶层导航、`pwa-return` 参数。
- [返回路径校验](#返回路径校验)的全部规则。
- IndexedDB 的库名 `pwa-entry:<appId>:<environment>`、单对象仓库、单条记录；该库不在缓存命名空间下，恢复 worker 不删除它；登出不清除。
- 主入口与备用入口的探测规则、5 秒超时、离线时不展示入口。
- 诊断结果的形状 `{ code, path }`，不含任何输入值。

### 契约增量

**页面侧 API 变为两个函数**

```ts
type EntryUpdateResult =
  | { readonly accepted: true; readonly sequence: number }
  | { readonly accepted: false; readonly diagnostics: readonly EntryDiagnostic[] };

/** 在线时由应用调用：应用自己请求并解密后，把明文清单交进来。从不抛出。 */
function updateEntryManifest(data: unknown): Promise<EntryUpdateResult>;

/** 需要展示时调用：只读本地存的那份，不发任何网络请求（探测除外）。从不抛出。 */
function checkEntryRecovery(options?: { readonly returnPath?: string }): Promise<EntryRecoveryResult>;
```

- `updateEntryManifest` 在校验通过且 `sequence` 大于已存记录时写入 IndexedDB，返回 `accepted: true`；序号不大于已存记录时不写入，返回 `accepted: false` 并给出诊断码（不是错误，是"这份不比已有的新"）。
- `checkEntryRecovery` 的返回形状与修订前相同：`kind: "none" | "available"`，`available` 时含 `status`、`reason`、`expiresAt`、`recoveryPageUrl` 与诊断；**仍然不含入口地址**。

**清单形状（应用解密后交入的对象）**

```ts
{
  sequence: number;              // 非负安全整数，用于判断新旧
  expiresAt: string;             // ISO 8601，过期后不展示
  status: "normal" | "migrating" | "incident";
  reason: { code: "planned-migration" | "incident" | "none"; message?: string };
  entries: ReadonlyArray<{ origin: string; startPath: string }>;   // 0–5 条
  appId?: string;                // 可选；给出时必须与身份一致
  environment?: string;          // 可选；给出时必须与身份一致
}
```

- 不再有签名信封、`schemaVersion` 与公钥字段。
- `origin` 必须是 HTTPS（本地回环地址例外），`startPath` 必须以 `/` 开头且不含 `..` 段与反斜杠，长度上限 512。
- `expiresAt` 减 `issuedAt` 的上限改由 `maxValidityDays` 对"交入时刻到 `expiresAt`"计算：超过上限即拒绝，默认 30 天，可配 1–90 天。防止一份长期有效的清单再也撤不回来。
- `appId`、`environment` 为可选：给出时必须与应用身份逐字相等，用于挡住测试环境的数据混入生产；不给出时不校验。
- 校验失败的字段逐条产出诊断码，整份清单被拒绝，不做部分接受。

**构建集成精简**

```ts
plugins: [
  pwaEntryResilience({ identity, maxValidityDays: 30 }),
  pwa({ identity, policy, install, topology }),
]
```

- 删除 `keys`、`seed`、`approvedOrigins`、`discoveryUrl` 四个选项及其构建期校验（含私钥形态扫描）。
- 应用策略仍须为恢复页加一条资源规则，路径 `/pwa-entry.html`。

**状态与展示**

- `status` 为 `normal` 时仍探测主入口，探测不通才以 `unconfirmed-outage` 展示；`migrating` 与 `incident` 不探测，直接展示。
- `entries` 为空时不展示任何入口，无论 `status` 为何。
- 设备离线时主入口与备用入口探测都会失败，因此不展示入口——不把用户断网误报成域名故障。

**首次访问前**

- 不再提供构建期种子。用户首次在线访问时由应用调用 `updateEntryManifest` 取得清单；在此之前 `checkEntryRecovery` 返回 `kind: "none"`。

### 安全边界（如实登记）

- **平台不再验证清单的真实性。** 谁能控制应用后端，谁就能把全体已安装用户引向任意域名。在同源前提下这与"谁能改前端代码"等价，因此项目所有者判定可接受；接入方须把该接口按写操作级别保护。
- **应用自身的加解密不提供真实性保证**：对称密钥必须打进前端包，可被取出并用于伪造密文。它防的是内容被看到，不是内容被伪造。
- IndexedDB 中的记录可被同源脚本改写；由于不再验签，平台无法察觉这种改写。同源脚本本就能做任意事，不额外扩大风险面。
- 仍然保留的防线只有一条：**用户必须亲自点击**，平台绝不自动导航，且入口地址不经由页面侧 API 交给应用代码。

### 本修订不做的事

- 不做加解密、不做轮询、不做多发现源：这些归应用的请求层。
- 不改恢复页的 UI 与返回路径校验。
- 不做框架绑定与 SSR 支持。
- 不发布 npm 版本。

### 交付物增量

- `@pwa-platform/entry-resilience`：新增 `updateEntryManifest`，改写 `checkEntryRecovery` 的取数路径，删除验签、公钥、种子、发现源与白名单相关实现与导出（含 `verifyEnvelope`）。
- Vite 插件选项精简为 `identity` 与 `maxValidityDays`。
- [ADR-0033](../docs/adr/0033-entry-manifest-supplied-by-the-application.md)（新增，取代 ADR-0017 的信任模型），[ADR-0018](../docs/adr/0018-entry-resilience-delivery-boundary.md) 的构建集成一节修订。
- [入口恢复演练](../docs/operations/entry-recovery-drill.md)重写：删去离线签发、密钥轮换、撤回与台账，改为"应用交入清单 → 展示 → 用户点击 → 跳转"的演练步骤。
- [发布与事故处置手册](../docs/operations/release-and-incident-runbook.md)的"入口清单签发、密钥轮换与撤回"一节作废，改为指向应用侧的接口配置与本模块的演练。
- [包边界](../docs/architecture/package-boundaries.md)中本包的描述更新；模块验证记录追加本次修订。

### 测试策略增量

- **单元测试**：清单形状校验逐条（缺字段、`origin` 非 HTTPS、`startPath` 含 `..` 或反斜杠、`entries` 超过 5 条、`sequence` 非整数或为负、`expiresAt` 已过期或超出上限、`appId`/`environment` 不匹配）；序号不大于已存记录时不写入且返回 `accepted: false`；序号更大时覆盖；`updateEntryManifest` 与 `checkEntryRecovery` 在存储不可用、写入失败时都不抛出且给出相应诊断码。
- **真实浏览器测试**：不再需要发现源服务器。覆盖：应用交入 `migrating` 清单 → `checkEntryRecovery` 返回 `available` → 恢复页展示目标主机 → 点击后顶层导航到目标 Origin 且带合法 `pwa-return`；`normal` 且主入口可达时不展示；设备离线时不展示；交入序号更小的清单不覆盖已存记录。
- **变异检查**：序号比较、过期判断、`startPath` 路径穿越校验、`entries` 上限各注入一次变异并确认转红。
- 删除的验签测试随实现一并删除，不保留为跳过用例。

### 验收标准增量

- 插件配置只剩 `identity` 与 `maxValidityDays`，构建期不再要求任何密钥材料。
- 应用一次 `updateEntryManifest` 调用即可让后续 `checkEntryRecovery` 在无网络时返回 `available`。
- 校验失败的清单整份被拒绝，诊断码指出具体字段路径，且不回显字段值。
- 恢复页行为与返回路径校验与修订前逐项一致。
- 包内不再存在验签实现、公钥配置与发现源请求代码。

## 修订：恢复页的默认样式与宿主定制（2026-09-23，已评审通过）

### 起因

恢复页此前没有任何样式：HTML 由插件写死，渲染代码只造 `h1`、`p`、`ul`、`li`、`button`，连 class 都不设，页面呈现为浏览器默认的衬线字体与原生按钮。2026-09-23 的浏览器演示中，项目所有者指出这个页面"太丑"，并要求默认样式要体面、同时允许宿主自定义。

当初不做样式是为了让页面在应用壳已坏、域名不可达时仍能独立工作（[ADR-0018](../docs/adr/0018-entry-resilience-delivery-boundary.md)）。这个约束成立，但它只要求"不依赖框架与外部资源"，并不要求"没有样式"。

### 已确认的前提（项目所有者，2026-09-23）

- **样式内联进恢复页 HTML**，不外链 CSS 文件：外链是又一个在故障时可能取不到的资源，也会先闪一屏无样式内容。
- **宿主可提供自己的 CSS，追加在默认样式之后**，因此同名规则自然覆盖；不提供"替换默认样式"的开关。
- **构建时算出每段内联样式的 SHA-256** 供严格 CSP 使用。
- 交付边界的变化**增补进 ADR-0018**，不新开 ADR。

### 契约增量

**页面结构获得稳定的 class（公开契约）**

| 元素 | class |
|---|---|
| 根容器（已有 `id="pwa-entry"`） | `pwa-entry` |
| 标题 | `pwa-entry__headline` |
| 说明文案（清单的 `reason.message`） | `pwa-entry__message` |
| 有效期 | `pwa-entry__expiry` |
| 入口列表 | `pwa-entry__list` |
| 列表项 | `pwa-entry__item` |
| 入口按钮 | `pwa-entry__button` |
| 无入口时的提示 | `pwa-entry__empty` |
| 加载中的提示 | `pwa-entry__loading` |

class 名一经发布即为公开契约，改名等同破坏性变更。

**默认样式**

- 以一段内联 `<style>` 写入恢复页，位于脚本之前；内容为固定文本，不含任何来自配置的值。
- 覆盖：系统字体栈、正文最大宽度、行距与间距、按钮为块状且可点区域足够大、深色模式（`prefers-color-scheme: dark`）。
- 不引入图标、网络字体、图片或动画。
**色值全部走 CSS 自定义属性，平台自带亮色与暗色两套**

页面结构极简，可变的其实只有背景、文字、次要文字、边框与按钮几项。平台把它们定义成一组变量，亮色写在 `.pwa-entry` 上，暗色在 `@media (prefers-color-scheme: dark)` 中重新定义同名变量。宿主只要重置这些变量就完成换肤，不必接触任何布局规则。

| 变量 | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--pwa-entry-bg` | `#ffffff` | `#0f1419` | 页面背景 |
| `--pwa-entry-fg` | `#1f2328` | `#e6e9ec` | 标题与正文 |
| `--pwa-entry-muted` | `#5b6470` | `#9aa4b0` | 有效期等次要文字 |
| `--pwa-entry-accent` | `#0b5cd5` | `#4c93ff` | 入口按钮底色 |
| `--pwa-entry-accent-fg` | `#ffffff` | `#0b1220` | 入口按钮文字 |

另有三项与主题无关：`--pwa-entry-radius`（`0.5rem`）、`--pwa-entry-max-width`（`34rem`）、`--pwa-entry-font`（系统字体栈）。

**宿主换肤的写法**——重置变量即可，但暗色有两条路径，各写一次：

```css
/* 亮色 */
.pwa-entry {
  --pwa-entry-accent: #c8102e;
  --pwa-entry-bg: #fffdfa;
}
/* 暗色之一：系统偏好暗色。选择器必须与平台的完全一致，理由见下。 */
@media (prefers-color-scheme: dark) {
  .pwa-entry:not([data-theme="light"]) {
    --pwa-entry-accent: #ff6b81;
    --pwa-entry-bg: #14100f;
  }
}
/* 暗色之二：应用调用 setPwaTheme("dark") 显式要求暗色 */
.pwa-entry[data-theme="dark"] {
  --pwa-entry-accent: #ff6b81;
  --pwa-entry-bg: #14100f;
}
```

两条写进接入文档：

- **宿主 CSS 追加在平台样式之后，不带媒体查询的覆盖会同时作用于两套主题。**
- **媒体查询里必须写 `.pwa-entry:not([data-theme="light"])`，不能只写 `.pwa-entry`。** 后者特异度是 `(0,1,0)`，平台的是 `(0,2,0)`，特异度高者胜、与书写顺序无关，因此只写 `.pwa-entry` 的暗色覆盖**完全不生效**，而亮色照常生效——评审时看不出问题，只有在暗色下实测才会暴露。本规格最初给的正是这份坏写法，已于 2026-09-23 修正，并由浏览器测试按文档配方逐字守住。

**主题只跟随系统偏好。** 恢复页是独立文档，不与应用共享运行时状态，因此读不到应用内的主题开关。需要强制某一套的宿主，不带媒体查询地覆盖变量即可（效果就是固定为那一套）。这属于已知限制，不在本修订内扩展。

**跟随宿主应用的主题设置**

恢复页是独立文档，与应用不共享运行时状态，因此应用里的一次函数调用无法直达它。跨文档传递偏好只能走持久存储；恢复页与应用同源，`localStorage` 同步可读，在首次渲染前即可取到，不会先闪一屏错误配色。

- **页面侧新增 `setPwaTheme(theme)`**，从 `@pwa-platform/entry-resilience/client` 导出，取值 `"light" | "dark" | "system"`。它只做一件事：把偏好写入下述键；传 `"system"` 时删除该键。**从不抛出**：存储不可用时静默返回。
- **公开契约是存储键，不是这个函数**：键名为 `pwa:theme:<appId>:<environment>`（各段以 `encodeURIComponent` 编码）。恢复页只读该键，**不依赖 `client-runtime` 或任何其他平台包**——它必须在应用壳已坏时独立工作。将来若有别的平台界面，读同一个键即可。
- **恢复页在渲染前读取该键**，读到 `"light"` 或 `"dark"` 时在根元素上设 `data-theme`；读不到、值非法或存储不可用时不设，退回系统偏好。
- **优先级**：应用显式设置 > 系统偏好 > 亮色默认值。对应的选择器契约为：

  ```css
  .pwa-entry { /* 亮色变量 */ }
  @media (prefers-color-scheme: dark) {
    .pwa-entry:not([data-theme="light"]) { /* 暗色变量 */ }
  }
  .pwa-entry[data-theme="dark"] { /* 暗色变量，压过系统偏好 */ }
  ```

  宿主覆盖变量时若要区分两套主题，需同时覆盖媒体查询与 `[data-theme="dark"]` 两处；接入文档给出可直接抄的片段。

- **如实登记的限制**：偏好按源、按浏览器保存，与用户账号无关；用户从未在应用中切换过主题时跟随系统；隐私模式或存储被禁用时跟随系统；用户清除站点数据后回到跟随系统。恢复 worker 只删缓存与本模块的 IndexedDB，**不清除该键**。
- 平台此前未使用过 `localStorage`。该键只保存主题偏好这一个公开、非敏感的值，不写入任何用户数据。

**宿主定制**

- 插件新增可选项 `css?: string`：构建时作为**第二段内联 `<style>`**，紧随默认样式之后写入同一文档。
- 该字符串按原样写入；宿主自行保证它是合法 CSS。插件只做一处安全校验：出现 `</style` 序列时构建失败，避免提前闭合样式块。
- 不提供替换默认样式的开关；追加已足以覆盖任何规则。

**CSP 支持**

- 构建时对每段内联样式计算 SHA-256，并以 `sha256-<base64>` 的形式输出到**构建日志**（Vite 的 `this.info`），供接入方写进 `style-src`。
- **不生成额外文件**：新增产物会连带要求在 Cloudflare 部署链路的四处白名单登记（见 [examples-browser-e2e](examples-browser-e2e.md) 的"修订：示例接入入口恢复"），代价与收益不成比例。
- 文档说明接入方也可自行对样式文本计算同一哈希复核。

### 不变的部分

- 恢复页的 DOM 结构、文案、按钮行为、返回路径校验与导航规则。
- `checkEntryRecovery`、`updateEntryManifest` 的签名与返回值。
- 页面仍不含内联脚本，脚本仍为带指纹的外链模块。

### 本修订不做的事

- 不做多语言：页面文案仍写死中文（`lang="zh-CN"`）。记入后续事项。
- 不允许宿主改结构或文案；不提供自定义模板。
- 不改变 `pwa-entry.html` 的路径与预缓存规则。

### 测试策略增量

- **单元测试**：渲染后每个元素带上述 class；`css` 选项的文本原样出现在默认样式之后；含 `</style` 时构建失败；未传 `css` 时只有一段样式。
- **构建测试**：产出的 HTML 含内联样式且脚本仍为外链；日志中出现每段样式的 `sha256-` 值，且与对该段文本直接计算的结果一致。
- **真实浏览器**：恢复页在断网状态下仍套用样式（读取按钮的计算样式，确认不是浏览器默认值）；宿主 CSS 覆盖变量后取值随之改变。
- **主题跟随**：`setPwaTheme("dark")` 后恢复页在系统为亮色时仍呈暗色；`setPwaTheme("light")` 在系统为暗色时仍呈亮色；`setPwaTheme("system")` 后回到跟随系统；存储不可用时不抛出且跟随系统（以桩替换存储验证）。
- **人工确认**：部署到 Cloudflare `drill` 后截图复核，由项目所有者判断观感。

### 验收标准增量

- 默认呈现不再是浏览器默认样式：系统字体、受限正文宽度、块状按钮、深色模式可用。
- 宿主传入 `css` 后能覆盖颜色与按钮外观，且无需改动平台代码。
- 构建日志给出可直接写进 CSP 的 `sha256-` 值。
- 断网状态下样式仍然生效（与页面同文档，不依赖额外请求）。
- 应用调用 `setPwaTheme` 后，恢复页的配色跟随该设置而非系统偏好；未设置时跟随系统。

## 修订：恢复页的构建期语言与文案覆盖（2026-09-24，已评审通过）

### 起因

入口恢复页的全部文案写死为中文：页面外壳的 `lang="zh-CN"` 与 `<title>备用入口</title>`（`src/vite/index.ts`），以及加载中、无入口、三种状态标题、有效期、"前往 …"按钮共 7 处（`src/page/render.ts`）。面向非中文用户的应用无法使用，也无法调整措辞。

### 已确认的前提（项目所有者，2026-09-24）

1. 语言在**构建期固定**一种，内置 `zh-CN` 与 `en`，默认 `zh-CN`；不在运行时按浏览器语言切换。
2. 可用 `messages` 覆盖所选语言的部分或全部文案。
3. 与 [vite-adapter 的平台默认离线页修订](vite-adapter.md)采用同一套选项形态与校验方式，但不共享代码。
4. 样式、class、变量契约不变（"修订：恢复页的默认样式与宿主定制"）。

### 契约增量

```ts
type PwaEntryResilienceOptions = {
  // ……既有 identity、maxValidityDays、css 不变
  readonly locale?: "zh-CN" | "en";                          // 默认 "zh-CN"
  readonly messages?: Partial<PwaEntryPageMessages>;
};

type PwaEntryPageMessages = {
  readonly documentTitle: string;               // <title>
  readonly loading: string;                     // 正在检查备用入口…
  readonly empty: string;                       // 当前没有可用的备用入口
  readonly headlineMigrating: string;           // 应用正在迁移到新地址
  readonly headlineIncident: string;            // 应用当前的入口出现故障
  readonly headlineUnconfirmedOutage: string;   // 主入口可能暂时无法访问（未经确认）
  readonly expiry: string;                      // 必须恰好包含一次 {expiresAt}
  readonly go: string;                          // 必须恰好包含一次 {host}
};
```

| 键 | zh-CN（即现有文案） | en |
|---|---|---|
| `documentTitle` | 备用入口 | Alternative entry |
| `loading` | 正在检查备用入口… | Checking for alternative entries… |
| `empty` | 当前没有可用的备用入口 | No alternative entry is available right now |
| `headlineMigrating` | 应用正在迁移到新地址 | This app is moving to a new address |
| `headlineIncident` | 应用当前的入口出现故障 | This app's usual address is having problems |
| `headlineUnconfirmedOutage` | 主入口可能暂时无法访问（未经确认） | The usual address may be unreachable (unconfirmed) |
| `expiry` | 此通知有效期至 {expiresAt} | This notice is valid until {expiresAt} |
| `go` | 前往 {host} | Go to {host} |

- **传递路径**：合并后的文案进入页面已有的唯一配置通道——虚拟模块（`src/page/main.ts` 导入的配置），由 `renderPage` 通过 `textContent` 写入；占位符在写入前替换为 `expiresAt` 或 `host`。不新增任何 HTML 解析写入路径，`source-scan` 测试照旧约束。
- **页面外壳**：`<html lang>` 取所选 `locale`，`<title>` 取 `documentTitle` 经 HTML 转义后的值。
- **校验**：`locale` 只接受两个取值（`entry.locale-invalid`）；`messages` 未知键、非字符串、空串、超过 200 个字符、`expiry`/`go` 占位符不是恰好一次，均令构建失败（`entry.message-invalid`）。与本包既有规则一致，只报诊断码与路径，不回显值。
- **清单自带的说明**（`reason.message`）由业务写入清单，原样显示，平台不翻译。
- 未设置 `locale` 与 `messages` 时：页面外壳 HTML 除所引用脚本的指纹文件名外与本修订前相同；`zh-CN` 文案与修订前逐字相同；页面行为不变（由测试钉住）。
- **更正（2026-09-24，EL2 实现中发现，项目所有者确认）**：本节评审时写的是"产物与本修订前逐字节相同"，不成立。文案改走虚拟模块配置后，默认文案从页面脚本移入配置脚本，两者的内容与指纹必然变化；外壳因此只差脚本文件名。可见结果与行为不变。既有断言 `test/vite/plugin.test.ts` 中"页面脚本含空状态文案"随之改为在页面脚本的静态导入闭包中查找，意图不变。
- **同批的两项缺陷修复（2026-09-24，项目所有者确认）**，与语言修订无关，但同样改变了默认构建的外壳：
  - **CSP 哈希**：构建时打印的样式哈希原先漏算 `<style>` 之后的换行，照抄进仅哈希的 `style-src` 会使样式被拦截（Chrome 153 实测）。现按标签之间的完整内容计算；页面字节不变，只有打印的哈希变化。
  - **暗色背景**：根容器原为居中的限宽栏，暗色模式下只有该栏是暗色、视口其余部分为白色。默认样式改为根容器铺满视口（`position: fixed; inset: 0`）、以左右内边距限制内容宽度，并随主题设置 `color-scheme`。class 与变量契约不变；默认样式文本及其 CSP 哈希随之变化，严格 CSP 的站点升级时须更新哈希。

### 不变的部分

清单格式与校验、状态与展示规则、导航只在点击时发生、返回路径校验、样式与 class 契约、CSP 哈希输出方式。

### 本修订不做的事

运行时语言切换；除 `zh-CN`、`en` 之外的 `lang` 取值；翻译清单中的 `reason.message`。

### 测试策略增量

- **单元**：每个诊断码；文案合并；占位符替换；`renderPage` 在 `en` 下各状态的输出；标题转义；未设置时外壳只差脚本指纹、默认文案逐字不变。
- **真实浏览器（Chrome 桌面 N）**：`locale: "en"` 构建的恢复页，`lang="en"`，三种状态与按钮文案正确；`messages` 覆盖一例。每个场景配一次变异。

### 验收标准增量

- 上述测试全部通过，既有测试不改断言。
- [入口恢复接入说明](../docs/guides/entry-recovery-integration.md)写明 `locale` 与 `messages` 的用法和内置文案表。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 可选能力，不改变首期交付结果与排除项。 |
| architecture | follow | 不新增分层，也不改变依赖方向。 |
| developer-entry | update | README 的私有包一节指向本模块的接入说明。 |
| capability-map | update | 本模块 2026-09-17 加入能力图，依赖方向与构建位置记录在案。 |
| decisions | create | ADR-0017、ADR-0018，以及 2026-09-23 取代信任模型的 ADR-0033。 |
| lifecycle-and-recovery | follow | 不改变注册、更新或恢复 worker 的生命周期；与恢复 worker 的共存由本模块自己的演练覆盖。 |
| ci-baseline | follow | 不改变 CI 工作流。 |
| supply-chain | follow | 不新增第三方依赖，工作区设置不变。 |
| browser-matrix | follow | 遵守既有分档与 N/N-1 规则；未取得的浏览器范围记在本模块验证记录。 |
| v1-acceptance | follow | 属 v1 之后的可选能力，不进入 V1 验收矩阵。 |
| identity-release-baseline | follow | 不改变身份冻结与槽位基线规则。 |
| release-and-incident | update | 手册中的“入口清单的配置、迁移与撤回”一节由本模块交付并于 2026-09-23 重写。 |
| recovery-drill | follow | 入口恢复演练是独立文档；ADR-0005 的恢复演练不受影响。 |
| browser-release-evidence | follow | 不改变生产发布证据的模板与通道规则。 |
| package-distribution | follow | 该模块的私有包清单已列入本包名，分发决定本身不变。 |
| cloudflare-test-deployment | follow | 测试站接入由 examples-browser-e2e 的修订承担，本模块不改变部署契约。 |
| browser-test-harness | follow | 复用既有 harness，不改变其公开面。 |
| workbox-engine | follow | 不触及引擎端口。 |
| sw-runtime | follow | 不改变 worker 运行时行为；入口恢复完全在页面侧。 |
| offline-write-extension | follow | ADR-0027 中对本模块数据库的隔离说明由该模块维护。 |
| build-verifier | follow | 不新增发布检查。 |
| release-gate-contract | follow | 不改变必需检查覆盖判定。 |
| local-ci-record | follow | 不改变本地门禁记录模板。 |
| release-orchestration-protocol | follow | 不改变外部发布协议。 |
| vite-adapter | follow | ADR-0015 的只读计划 API 增补由 vite-adapter 自身维护，本模块只是其使用方。 |
| client-runtime | follow | 不改变注册与更新提示协议。 |
| vue-react-adapters | follow | 本期不提供框架绑定。 |
| examples-browser-e2e | follow | 示例接入由该模块 2026-09-23 的修订承担并记录。 |
| pwa-entry-resilience | create | 本模块自身的事实源：规格、三份 ADR、入口恢复演练、接入说明与验证记录。 |
| ssr-adapters | follow | 只支持 Vite 构建，SSR 留待后续迭代。 |
| shared-origin-topology | follow | 不改变同源拓扑的登记与排除规则。 |
| push-module | follow | 与 Push 无交互。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
