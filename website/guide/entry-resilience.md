# 入口恢复（access entry resilience）

已安装的 PWA 被绑死在注册时的协议、主机和端口上。当这个地址要迁移、或者整体不可达时，已安装用户点开桌面图标仍然去老地址，而浏览器的同源隔离决定了 Service Worker、缓存、IndexedDB、Cookie 和安装身份都带不到新地址。

`@pwa-platform/entry-resilience@0.1.0` 不试图绕过同源隔离。它做的是：**提前**在旧地址上存一份备用入口清单，出事时在旧应用壳里显示提示，让用户**自己点一下**跳到新地址，再在新地址重新登录。明确不做的事：不自动跳转，不静默重定向，不在 URL 里带令牌或个人数据，不跨地址复制任何浏览器状态。安装与信息见[入口与恢复能力对照](/guide/integration-by-capability#路径六-配置两种恢复能力)；本页是它的完整接入说明。

## 信任模型（ADR-0033）

清单由**业务后端的接口**提供，应用自己取、自己解密后交给平台；平台只校验形状、序号递增和有效期，**不验证清单来源，也不限制目标 Origin**。早先按离线私钥签名、构建期域名白名单的设计已被取消：清单来自应用自己的域名时，签名挡不住能直接控制该域名的攻击者；构建期白名单会在真出事那天挡住临时启用的新域名。

::: danger 安全边界
取消验签后，**谁能控制你的后端，谁就能把全体已安装用户引向任意域名**。这与"谁能改前端代码"是同一等级的风险，因此被判定为可接受，但意味着提供清单的这个接口要按写操作级别保护——需要鉴权、变更走审批、改动留台账。平台侧仍保留的唯一防线是：用户必须亲自点击才会跳转，且入口地址不经页面侧 API 交给应用代码。
:::

## 接入三步

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

同一个 `identity` 对象必须传给两个插件；策略还要为恢复页加一条资源规则，路径为 mount 相对的 `/pwa-entry.html`。

### 第二步：应用侧取数并交入

请求、鉴权、加解密、重试、轮询节奏全归业务的请求层，平台不参与：

```ts
import { updateEntryManifest, checkEntryRecovery } from "@pwa-platform/entry-resilience/client";

// 在线时：用业务现成的封装取数并解密，把明文对象交给平台
const data = await api.getEntryManifest();
await updateEntryManifest(data); // { accepted: true, sequence } 或 { accepted: false, diagnostics }

// 需要展示时：只读本地存的那份，不发网络请求
const result = await checkEntryRecovery({ returnPath: location.pathname });
if (result.kind === "available") {
  // result.status: migrating | incident | unconfirmed-outage
  // result.reason.message：清单里写的说明文案
  // result.recoveryPageUrl：平台恢复页链接（同源相对地址）
  showBanner(result.reason.message, result.recoveryPageUrl);
}
```

两个函数都不抛异常，失败一律体现为诊断码；结果里没有备用域名，只有恢复页链接，业务代码拿不到目标地址，也就无法绕过用户确认直接跳转。调用时机由业务决定，建议启动时查一次、主接口连不上时再查一次，不需要高频轮询。

### 第三步：后端返回什么

解密之后交给平台的对象：

```jsonc
{
  "sequence": 7, // 非负整数，必须严格递增
  "expiresAt": "2026-10-23T00:00:00Z", // 不接受毫秒
  "status": "migrating", // normal | migrating | incident
  "reason": { "code": "planned-migration", "message": "服务已迁移到新地址" },
  "entries": [{ "origin": "https://new.example.com", "startPath": "/app/" }], // 最多 5 条
  "appId": "yourapp", // 可选，给了就必须与身份一致
  "environment": "production", // 可选，同上
}
```

`status` 为 `normal` 且 `entries` 为空，表示一切正常、不展示任何入口——这应当是平时的默认下发内容，让客户端提前存好。只有 `normal` 状态下平台才会探测主入口，探测不通才以 `unconfirmed-outage` 展示；`migrating` 与 `incident` 不探测、直接展示。`origin` 必须是 HTTPS，`startPath` 以 `/` 开头且不含 `..` 段，`expiresAt` 必须是不带毫秒的 `YYYY-MM-DDTHH:mm:ssZ`。

## 自定义样式（可选）

恢复页自带一套默认样式，作为内联 `<style>` 随页面到达，断网时照常生效，不需要额外请求。可覆盖的变量：`--pwa-entry-bg`、`-fg`、`-muted`、`-accent`、`-accent-fg`（各有亮/暗默认值），以及与主题无关的 `-radius`、`-max-width`、`-font`。表上没有的一律不是契约。根容器铺满整个视口，改宽度只应覆盖 `--pwa-entry-max-width`，不要覆盖根容器的 `margin`/`max-width`。

`css` 选项的文本原样追加在默认样式**之后**，作为第二段内联 `<style>`：`pwaEntryResilience({ identity, maxValidityDays: 30, css: HOST_CSS })`。

暗色有两条独立路径，**必须各写一次**：系统偏好暗色（`@media (prefers-color-scheme: dark) { .pwa-entry:not([data-theme="light"]) { ... } }`）与应用显式要求暗色（`.pwa-entry[data-theme="dark"] { ... }`）。只写不带媒体查询的 `.pwa-entry` 选择器特异度低于平台默认规则，会被完全覆盖而不报错。

恢复页是独立文档，拿不到应用运行时状态，主题偏好通过同源 `localStorage` 传递：

```ts
import { setPwaTheme } from "@pwa-platform/entry-resilience/client";

setPwaTheme("dark"); // 或 "light"；"system" 删除该键，回到跟随系统
```

公开契约是存储键本身（`pwa:theme:<appId>:<environment>`，各段做 URL 编码），不是这个函数；恢复页只读它，不依赖任何平台包，应用壳已经坏掉时也能独立工作。优先级为应用显式设置 > 系统偏好 > 亮色默认值；隐私模式或存储被禁用时跟随系统且不报错；恢复 worker 不清除这个键。

严格 CSP 下，把构建日志打印的默认样式与宿主 `css` 两段哈希分别放进 `style-src`；平台升级或修改 `css` 后需要重新取值。页面本身没有内联脚本。

## 语言与文案（可选）

文案默认中文，语言在构建时固定，可选 `zh-CN`（默认）或 `en`，`messages` 可逐项覆盖：`documentTitle`、`loading`、`empty`、`headlineMigrating`、`headlineIncident`、`headlineUnconfirmedOutage`、`expiry`、`go`。`expiry` 必须恰好包含一次 `{expiresAt}`，`go` 必须恰好包含一次 `{host}`，否则构建失败；每项不超过 200 个字符，只按纯文本显示。清单里业务自己写的 `reason.message` 原样显示，平台不翻译。

## 下发前自查

运行时的拒绝只体现为页面上的一个诊断码，没有自查就等于没有反馈。用运行时同一个校验器在后端或 CI 里先过一遍：

```ts
import { parseEntryManifest } from "@pwa-platform/entry-resilience";

const result = parseEntryManifest(manifest, {
  appId,
  environment,
  maxValidityDays: 30, // 必须与构建配置一致，校验器不读构建配置
  now: Date.now(),
});
if (!result.ok) {
  console.error(result.diagnostics);
  process.exit(1);
}
```

## 运营上的三件事

1. **平时也要保持清单可用**：故障当天业务接口多半也连不上，客户端用的是之前在线时存下的那份，因此一切正常时也要下发 `normal` 清单。
2. **序号只增不减**：序号不大于客户端已存记录时会被拒绝；同一序号发两份不同内容，客户端不会展示任何入口。
3. **撤回到不了已离线的客户端**：下发更高序号的 `normal` 清单即可撤回公告，但已经离线的客户端要等它再次联网；取消签名与发现源之后，平台没有远程失效手段。

拥有源仓库访问权限的发布团队应按内部[发布与事故处置手册](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/release-and-incident-runbook.md#入口清单的配置迁移与撤回)记录签发、迁移与撤回流程，并参考[入口恢复演练](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/entry-recovery-drill.md)完成上线前演练。

框架绑定与 SSR 不在当前范围内：目前只支持 Vite 构建的应用，Vue／React 的 facade 需要自行搭建提示界面。
