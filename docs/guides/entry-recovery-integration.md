# 入口恢复接入说明（2026-09-23 变更）

> 适用对象：准备接入访问入口灾备（`@pwa-platform/entry-resilience`）的业务开发与后端。
> 依据：本仓库 `main` 上截至 2026-09-23 的能力。信任模型见 [ADR-0033](../adr/0033-entry-manifest-supplied-by-the-application.md)，模块契约见 [spec/pwa-entry-resilience.md](../../spec/pwa-entry-resilience.md)。
> 该包已作为 `@pwa-platform/entry-resilience@0.1.0` 发布到 npm。业务须同时使用同批 `@pwa-platform/vite@0.1.0`，并在真实部署环境验证清单、缓存与跳转。

## 1. 它解决什么问题

已安装的 PWA 被绑死在原来的协议、主机和端口上。当这个地址要迁移、或者整个打不开时，已安装的用户点开桌面图标还是去老地址，而浏览器的同源隔离决定了 Service Worker、缓存、IndexedDB、Cookie 和安装身份**都带不到新地址**。

本模块不试图绕过同源隔离。它做的是：**提前**在旧地址上存一份"备用入口清单"，出事时在旧应用壳里显示提示，让用户**自己点一下**跳到新地址，然后在新地址重新登录。

三种典型场景：计划内迁移、旧地址网络层不可达、以及一切正常时什么都不显示。

**明确不做**：不自动跳转，不静默重定向，不在 URL 里带令牌或个人数据，不跨地址复制任何浏览器状态。

## 2. 2026-09-23 变更了什么

早先的设计要求清单由离线私钥签名，平台验签后才使用，且目标域名必须在构建时就登记进白名单。**这套机制已被取消**（ADR-0033），原因有三：

- 清单来自应用自己的域名时，签名挡不住真实攻击——能控制该域名的攻击者本就能直接改前端代码；
- 业务已有的接口加密提供的是机密性，**不是真实性**（对称密钥必须打进前端包，可被取出伪造），所以它替代不了签名，但在同源前提下也不需要替代；
- 构建期白名单会在真出事那天挡住发布方自己：域名被封后临时启用的新域名，不可能出现在几个月前的构建里。

| | 变更前 | 变更后 |
|---|---|---|
| 清单从哪来 | 独立域名上的签名静态文件，平台自己去取 | **业务后端的接口，应用自己取、自己解密，再交给平台** |
| 谁验真 | 平台验签（Ed25519） | **业务后端与传输层**；平台只校验形状、序号与有效期 |
| 目标域名 | 必须在构建期白名单内 | 无白名单，清单里给什么就是什么 |
| 接入方要建的制度 | 离线签发、密钥轮换、签发台账 | 保护好那个接口即可 |
| 构建配置 | `keys`、`seed`、`approvedOrigins`、`discoveryUrl`、`identity` | **只剩 `identity` 与 `maxValidityDays`** |

**安全边界（必须知道）**：取消验签后，**谁能控制你的后端，谁就能把全体已安装用户引向任意域名**。在同源前提下这与"谁能改前端代码"等价，因此被判定为可接受；但这意味着**该接口要按写操作级别保护**——需要鉴权、变更走审批、改动留台账。平台侧仍然保留的唯一防线是：用户必须亲自点击才会跳转，且入口地址不经页面侧 API 交给应用代码。

## 3. 接入三步

### 第一步：构建配置

```ts
// vite.config.ts
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";
import { pwa } from "@pwa-platform/vite";

const identity = /* 与 pwa() 使用同一个对象 */;

plugins: [
  pwaEntryResilience({ identity, maxValidityDays: 30 }),
  pwa({ identity, policy, install, topology }),
]
```

还要在应用策略里为恢复页加一条资源规则，路径 `/pwa-entry.html`（mount 相对）。参考 `packages/examples-browser-e2e/apps/shared/identity.ts`。

### 第二步：应用侧取数并交入

请求、鉴权、加解密、重试、轮询节奏**全归你自己的请求层**，平台一行都不碰：

```ts
import { updateEntryManifest, checkEntryRecovery } from "@pwa-platform/entry-resilience/client";

// 在线时：用你们现成的封装取数并解密，把明文对象交给平台
const data = await api.getEntryManifest();
await updateEntryManifest(data);          // { accepted: true, sequence } 或 { accepted: false, diagnostics }

// 需要展示时：只读本地存的那份，不发网络请求
const result = await checkEntryRecovery({ returnPath: location.pathname });
if (result.kind === "available") {
  // result.status: migrating | incident | unconfirmed-outage
  // result.reason.message：你在清单里写的说明文案
  // result.recoveryPageUrl：平台恢复页的链接（同源相对地址）
  showBanner(result.reason.message, result.recoveryPageUrl);
}
```

三点要注意：

- **两个函数都不抛异常**。失败一律体现为诊断码，不会把你的应用搞崩。
- **结果里没有备用域名**，只有恢复页链接。业务代码拿不到地址，也就无法绕过用户确认直接跳转。
- **调用时机由你定**。建议启动时查一次，主接口连不上时再查一次。不必高频轮询——正常情况下每次返回的都是"无入口"。

### 第三步：后端返回什么

解密之后交给平台的对象：

```jsonc
{
  "sequence": 7,                          // 非负整数，必须严格递增
  "expiresAt": "2026-10-23T00:00:00Z",    // 注意：不接受毫秒
  "status": "migrating",                  // normal | migrating | incident
  "reason": { "code": "planned-migration", "message": "服务已迁移到新地址" },
  "entries": [                            // 最多 5 条
    { "origin": "https://new.example.com", "startPath": "/app/" }
  ],
  "appId": "yourapp",                     // 可选，给了就必须与身份一致
  "environment": "production"             // 可选，同上
}
```

- `status` 为 `normal` 且 `entries` 为空，表示"一切正常，不显示任何入口"。**平时就该下发这样一份**，让客户端提前存好。
- `normal` 状态下平台会探测主入口，只有探测不通才以 `unconfirmed-outage` 展示；`migrating` 与 `incident` **不探测、直接展示**。
- `origin` 必须是 HTTPS，`startPath` 以 `/` 开头且不含 `..` 段。
- **`expiresAt` 必须是 `YYYY-MM-DDTHH:mm:ssZ`，不能带毫秒。**`2026-10-23T00:00:00.000Z` 会被拒绝——这是本平台的示例站点真实踩过的坑，而且当时毫无报错。

## 4. 自定义样式（可选）

恢复页自带一套默认样式，作为内联 `<style>` 随页面同文档到达，**断网时照常生效**，不需要任何额外请求。换肤只要覆盖 CSS 变量，不必接触布局规则。

### 可覆盖的变量

| 变量 | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--pwa-entry-bg` | `#ffffff` | `#0f1419` | 页面背景 |
| `--pwa-entry-fg` | `#1f2328` | `#e6e9ec` | 标题与正文 |
| `--pwa-entry-muted` | `#5b6470` | `#9aa4b0` | 有效期等次要文字 |
| `--pwa-entry-accent` | `#0b5cd5` | `#4c93ff` | 入口按钮底色 |
| `--pwa-entry-accent-fg` | `#ffffff` | `#0b1220` | 入口按钮文字 |

另有三项与主题无关：`--pwa-entry-radius`（`0.5rem`）、`--pwa-entry-max-width`（`34rem`）、`--pwa-entry-font`（系统字体栈）。表上没有的一律不是契约，别依赖。

> 2026-09-24 起根容器铺满整个视口（`position: fixed`），内容宽度改由左右内边距按 `--pwa-entry-max-width` 限制。如果你以前直接覆盖过 `.pwa-entry` 的 `margin`、`max-width` 或给 `body` 设背景，这些写法不再生效；改宽度请只覆盖变量。

### 怎么传进去

`css` 选项的文本原样追加在默认样式**之后**，作为第二段内联 `<style>`：

```ts
pwaEntryResilience({ identity, maxValidityDays: 30, css: HOST_CSS }),
```

### 两条主题路径都要写

暗色有两条路径：系统偏好暗色，以及应用调用 `setPwaTheme("dark")` 显式要求暗色。**各写一次**，否则只有其中一条会换肤：

```css
/* 亮色 */
.pwa-entry {
  --pwa-entry-accent: #0f766e;
  --pwa-entry-bg: #fbfaf7;
}
/* 暗色之一：系统偏好。选择器必须与平台完全一致，不能只写 .pwa-entry */
@media (prefers-color-scheme: dark) {
  .pwa-entry:not([data-theme="light"]) {
    --pwa-entry-accent: #5eead4;
    --pwa-entry-accent-fg: #06241f;
    --pwa-entry-bg: #0c1413;
  }
}
/* 暗色之二：应用显式要求暗色 */
.pwa-entry[data-theme="dark"] {
  --pwa-entry-accent: #5eead4;
  --pwa-entry-accent-fg: #06241f;
  --pwa-entry-bg: #0c1413;
}
```

两个**很容易踩且不报错**的坑：

1. **媒体查询里只写 `.pwa-entry` 会完全失效。** 它的特异度是 `(0,1,0)`，平台的 `.pwa-entry:not([data-theme="light"])` 是 `(0,2,0)`；特异度高者胜，与书写顺序无关。亮色照常生效，只有暗色不动——评审时看不出来。
2. **不带媒体查询的覆盖会同时作用于两套主题。** 只想改亮色时别漏掉媒体查询里的那份。

可直接参考 `packages/examples-browser-e2e/apps/react/vite.config.ts`，上面的片段就是它实际用的那份。

### 跟随应用的主题设置

恢复页是独立文档，拿不到应用的运行时状态，所以偏好通过同源 `localStorage` 传递：

```ts
import { setPwaTheme } from "@pwa-platform/entry-resilience/client";

setPwaTheme("dark");    // 或 "light"；"system" 删除该键，回到跟随系统
```

**公开契约是那个存储键，不是这个函数**：键名为 `pwa:theme:<appId>:<environment>`（各段 `encodeURIComponent` 编码）。恢复页只读它，不依赖任何平台包——应用壳已经坏掉时它必须能独立工作。你也可以自己写这个键，效果相同。

优先级是**应用显式设置 > 系统偏好 > 亮色默认值**。如实说明几条限制：偏好按源、按浏览器保存，与用户账号无关；用户从未在应用里切换过主题时跟随系统；隐私模式或存储被禁用时跟随系统，且不报错；用户清除站点数据后回到跟随系统。恢复 worker 不清除这个键。

### 严格 CSP 下怎么办

页面用的是内联 `<style>`。若你的 `style-src` 不允许 `unsafe-inline`，构建日志会打印每段样式的哈希，填进 `style-src` 即可：

```
pwa-entry.html style (default): sha256-…
pwa-entry.html style (host css): sha256-…
```

默认样式的哈希会随平台版本变化，宿主那段会随你自己的 CSS 变化，**两者都要在升级后重新取**。页面本身没有内联脚本，脚本是带指纹的外链模块。

> **2026-09-24 之前的版本打印的哈希是错的**：漏算了 `<style>` 之后的那个换行，照抄进 `style-src` 会让样式被拦截。同日默认样式也改了（暗色背景铺满整个页面）。升级后请按新日志重新取两个哈希。

### 平台不做的事

宿主 CSS 只挡 `</style`（含它会直接构建失败），此外**不解析、不清洗、不做任何校验**——平台无从判断你的样式意图。写坏了页面就是坏的，而这个页面恰恰在故障时才会被人看到，所以改完务必在断网状态下亲眼看一遍。

### 语言与文案（可选）

恢复页的文案默认是中文。语言在**构建时固定**，可选 `zh-CN`（默认）或 `en`，也可以用 `messages` 覆盖部分文案：

```ts
pwaEntryResilience({ identity, maxValidityDays: 30, locale: "en", messages: { go: "Open {host}" } }),
```

| 键 | zh-CN | en |
|---|---|---|
| `documentTitle` | 备用入口 | Alternative entry |
| `loading` | 正在检查备用入口… | Checking for alternative entries… |
| `empty` | 当前没有可用的备用入口 | No alternative entry is available right now |
| `headlineMigrating` | 应用正在迁移到新地址 | This app is moving to a new address |
| `headlineIncident` | 应用当前的入口出现故障 | This app's usual address is having problems |
| `headlineUnconfirmedOutage` | 主入口可能暂时无法访问（未经确认） | The usual address may be unreachable (unconfirmed) |
| `expiry` | 此通知有效期至 {expiresAt} | This notice is valid until {expiresAt} |
| `go` | 前往 {host} | Go to {host} |

- `expiry` 必须恰好包含一次 `{expiresAt}`，`go` 必须恰好包含一次 `{host}`，否则构建失败（`entry.message-invalid`）；`locale` 取其他值报 `entry.locale-invalid`。错误只给诊断码与路径，不回显值。
- 每项文案不超过 200 个字符，只以纯文本显示，不会被当作 HTML 解析。
- 清单里你自己写的说明（`reason.message`）原样显示，平台不翻译。

## 5. 下发前一定要自查

运行时的拒绝只体现为页面上的一个诊断码，按契约会被吞掉，所以**没有自查就等于没有反馈**。在后端或 CI 里用同一个校验器先过一遍：

```js
import { parseEntryManifest } from "@pwa-platform/entry-resilience";

const result = parseEntryManifest(manifest, {
  appId, environment,
  maxValidityDays: 30,   // 必须与构建配置一致；校验器不读构建配置
  now: Date.now(),
});
if (!result.ok) { console.error(result.diagnostics); process.exit(1); }
```

这就是运行时用的那个函数本身，不读时钟、不访问存储与网络，可以安全地放进流水线。

## 6. 运营上的三件事

1. **平时保持清单可用。** 故障当天你的接口多半也连不上，客户端用的是**之前在线时存下的那份**。所以一切正常时也要下发 `normal` 清单。
2. **序号只增不减。** 序号不大于客户端已存记录时会被拒绝（`entry.sequence-not-greater`）。同一序号发两份不同内容，客户端不会展示任何入口。
3. **撤回到不了离线的客户端。** 下发更高序号的 `normal` 清单即可撤回公告，但已经离线的客户端要等它再次联网。取消签名与发现源之后，平台没有远程失效手段。

签发、迁移与撤回的完整流程见[发布与事故处置手册](../operations/release-and-incident-runbook.md#入口清单的配置迁移与撤回)；上线前的演练见[入口恢复演练](../operations/entry-recovery-drill.md)。

## 7. 已验证到什么程度

- **2026-09-23 在 Cloudflare 测试站的 `drill` 槽位做过两轮类生产演练**：首轮 Chrome 153 与 Chrome for Testing 152 各 17 项检查通过；样式修订后重跑，两个浏览器各 **18 项**全部通过（新增的一项来自 ADR-0034：断网状态下打开带 `?return=…` 的恢复页）。涵盖迁移展示与跳转、序号与形状拒绝、当前域名不可达、设备离线、过期。记录见 [pwa-entry-resilience 验证记录](../../tasks/pwa-entry-resilience/verification.md)。
- **样式在真实站点上核对过**：断网状态下从预缓存打开恢复页，分别在系统亮色、系统暗色、以及应用 `setPwaTheme("dark")` 压过亮色系统偏好三种情形下取到预期配色；线上页面的两段内联样式哈希与构建日志逐字一致。
- **未验证**：真实域名故障、DNS 故障、证书错误、域名被他人接管。演练中的"当前域名不可达"是客户端级拦截模拟。
- **未覆盖**：Chrome Android、桌面 N-1 的完整矩阵；远端 CI 证据。
- **框架绑定与 SSR 不在范围内**：目前只支持 Vite 构建的应用，Vue/React 的 facade 需要自己写提示界面。
