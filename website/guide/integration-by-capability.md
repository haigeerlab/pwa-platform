# 按功能接入 PWA

不要先复制一份“全功能配置”。先选择产品真正需要的能力，再逐层增加策略。所有路径都共享同一份
`PwaIdentity`、Vite 插件和 Vue／React 页面绑定；差异只在安装信息、策略、可选页面与交互组件。

| 目标 | 必须配置 | 不会自动得到 |
| --- | --- | --- |
| 只要可安装的原生壳 | identity、install、空缓存策略（仍须写 `updateMode: "prompt"`，所有策略都必填）、页面注册 | 离线打开、版本更新提示、公共 API 缓存 |
| 增加用户确认更新 | 预缓存应用壳、`updateMode: "prompt"`、更新 UI | 自动刷新、未保存内容保护、后台周期同步 |
| 增加应用壳离线 | 静态资源规则、导航规则、首次在线访问 | 任意业务路由和用户数据离线可用 |
| 增加离线页 | `offlineFallback`、离线页资源规则、`offlinePage` | 把离线页变成完整业务页面 |
| 增加公共读取缓存 | PwaPolicy v3、明确的公共路径和容量／时效上限 | 私有接口、写入、流媒体或未分类请求缓存 |
| 增加故障恢复 | 恢复 worker 发布流程；可选入口恢复包 | 自动跳转、跨 Origin 登录态迁移 |

## 所有路径共用的基础

先按[选择接入包](/start/choose)安装 0.2.3，再在 `pwa.config.ts` 中声明生产部署的真实 identity 与
install metadata。完整字段、根路径／子路径区别和稳定性要求见[身份与策略配置](/guide/configuration)。
Vue 使用 `createPwa()`，React 使用 `PwaProvider`；两者都要在浏览器启动后显式调用 `register()`。

`vite dev` 只提供 `virtual:pwa-config`，不生成平台 worker 和预缓存。下面每条路径都要通过
`vite build` 后用 HTTPS 站点或 `vite preview` 验证。

## 路径一：只要可安装的原生壳，不启用缓存

这个路径适合“网页保持完全在线，只希望获得 manifest、图标、独立窗口和自定义安装按钮”的应用。
平台仍会生成并注册 Service Worker 来承载生命周期，但没有业务资源进入预缓存，也没有公共运行时缓存。

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

```ts
pwa({
  identity: IDENTITY,
  install: INSTALL,
  policy: POLICY,
  topology: { kind: "standalone-origin" },
  // 不写 offlinePage
})
```

页面照常调用 `register()`，在 `installEligible` 为真时由用户点击调用 `promptInstall()`。浏览器决定是否
提供安装事件；即使没有事件，普通网页也必须能使用。验收时检查 manifest 的 `id`、`start_url`、图标、
scope 和独立窗口，并在 Cache Storage 中确认没有业务资源预缓存。

::: warning 这不是“只开安装、同时自动提示所有业务版本更新”
`resources` 为空时，业务 JS／CSS 不进入 worker 的预缓存清单；普通页面发版未必改变 worker 字节，因而
不能把 `updateWaiting` 当作所有业务发版的通知机制。若需要可靠的 PWA 版本提示，继续路径二并把应用壳
纳入预缓存。
:::

## 路径二：增加用户确认更新

更新提示由三个部分组成：应用壳进入预缓存、策略使用 `updateMode: "prompt"`、页面显示更新交互。最小
应用壳规则如下；文件路径必须与最终 Vite 产物一致：

```ts
resources: [
  { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
  { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
],
updateMode: "prompt",
```

长时间不刷新的页面可在 Vue 的 `createPwa()` 或 React 的 `PwaProvider` 上增加：

```ts
updateCheck: { intervalMs: 1_800_000 }
```

这是页面可见时调用 `registration.update()` 的定时器，不是 Periodic Background Sync。新 worker 安装后
仍然等待；只有用户操作触发 `applyUpdate()` 才接管。接管不会刷新当前页面，业务必须在保存表单后决定
何时调用 `location.reload()`。

### 选择默认 UI 或自绘 UI

默认 UI 是可选组件。Vue：

```vue
<script setup lang="ts">
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";
</script>

<template>
  <PwaUpdateNotice
    position="bottom-right"
    :messages="updateMessages"
    :reload-page="confirmThenReload"
  />
</template>
```

React 使用相同概念：从 `@pwa-platform/react/ui` 导入组件，并导入
`@pwa-platform/react/update-notice.css`。自绘 UI 则读取 `updateWaiting`，在用户确认时调用
`applyUpdate()`。完整交互和错误处理见[安装与更新](/guide/updates)。

### 多语言与主题怎么配置

不同界面的配置时机不同，不能共用一个“全局 locale”参数：

| 界面 | 语言 | 主题 |
| --- | --- | --- |
| Vue／React 更新提示 | `locale` 在运行时选内置 `zh-CN`（默认）／`en`；`messages` 逐项覆盖，可接现有 i18n | 默认跟随系统亮暗；`colors` 或 `--pwa-update-*` CSS 变量覆盖 |
| 平台离线页 | `offlinePage.locale` 在构建时选 `zh-CN`／`en`，`messages` 局部覆盖 | 默认跟随系统亮暗；`offlinePage.css` 覆盖 |
| 入口恢复页 | `pwaEntryResilience.locale` 在构建时选择，`messages` 局部覆盖 | 默认跟随系统；以 `setPwaTheme()` 传入 `light`、`dark` 或 `system`，`css` 覆盖 |
| manifest 名称和描述 | 由 `PwaInstallMetadata` 在构建时写入 | `themeColor`／`backgroundColor` 是安装元数据，不是应用运行时主题开关 |

默认更新 UI 内置中文（`zh-CN`）和英文（`en`）两套文案，通过 `locale` 在运行时选择，默认 `zh-CN`；
其他语言由业务把自己的翻译对象传给 `messages`。离线页与入口恢复页
是独立静态文档，只内置中文和英文，语言在构建时固定；若一个部署必须根据用户即时切换语言，应由业务
自建离线页，不能假设它们能读取框架 i18n 状态。

## 路径三：增加应用壳缓存和离线打开

先增加公共导航规则，再明确列出要预缓存的 HTML 和静态资产：

```ts
resources: [
  { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
  { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
  { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
],
```

`navigation-public-static` 决定导航处理方式，不会自动把所有页面写入运行时缓存；`asset` 规则才决定哪些
构建文件进入预缓存。在线首次注册并完成安装后，再断网重新打开已缓存的应用壳。私有 HTML、账号接口、
写请求、流媒体和未分类请求仍不会因为这组规则进入缓存。

如果只需要应用壳离线，到这里即可。不要为了“缓存更多”直接把所有 `/api/` 标成公共数据。

::: warning 应用壳离线不等于任意路由通配符回退
断网时的候选顺序只有：请求路径本身、去掉查询串后的同一路径、该路径目录下的 `index.html`，最后才是离线页（若开启）；平台不会退回应用根 `index.html`。因此使用 history 路由的单页应用，若某个业务路由没有被单独预渲染或预缓存（例如 `/users/42`），断网直接打开会得到浏览器自身的网络错误页，**不会**回退到应用壳用客户端路由渲染。从 `vite-plugin-pwa` 迁移来的项目要特别注意：它的通配符 `navigateFallback` 在这里没有直接等价物。这种路由建议同时开启路径四的离线页，作为断网时的兜底显示。
:::

## 路径四：增加离线页与弱网回退

在路径三基础上同时完成三处配置：策略打开 fallback、离线页本身加入资产规则、Vite 插件生成页面。

```ts
offlineFallback: { enabled: true, path: "/offline.html" },
networkTimeoutSeconds: 5,
resources: [
  { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
  { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
  { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
  { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
],
```

```ts
pwa({
  identity: IDENTITY,
  policy: POLICY,
  install: INSTALL,
  topology: { kind: "standalone-origin" },
  offlinePage: {
    locale: "zh-CN",
    messages: { heading: "网络暂时不可用" },
    css: ".pwa-offline { --pwa-offline-accent: #006e52; }",
  },
})
```

离线页只在网络请求失败或超时时展示；服务器如果确实返回了响应（包括 4xx、5xx），worker 会原样透传，不会显示离线页。离线页解决的是“连不上服务器”，不是“服务器返回了故障”，源站整体故障应由业务自己的错误页或入口恢复处理。

也可以自行提供 `public/offline.html`，但不能与 `offlinePage` 同时占用同一路径。超时仅作用于 worker 处理
的导航和 `network-first` 公共读取，不会给业务代码直接发出的所有请求加超时。更多样式变量、CSP 和
重连行为见[离线体验](/guide/offline)。

`networkTimeoutSeconds` 在契约上是可选项，在生产接入清单中却必须显式决策。iPhone 真机物理断网对照中，
不配置时曾约 60 秒白屏，配置 `5` 后约 5 秒回退。若业务选择保持默认关闭，应记录并验收所支持浏览器的
最长等待；不能把“最终能显示离线页”当作可接受的首屏体验。

## 路径五：缓存明确的公共读取

只有当接口或动态 HTML 对所有用户完全相同，且服务端不会根据 Cookie、身份或权限改变内容时，才能把
策略升级到 PwaPolicy v3。v3 必须显式给出数量、单项大小和存活时间上限：

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
  runtimeCache: {
    enabled: true,
    maxEntries: 100,
    maxEntryBytes: 262_144,
    maxAgeSeconds: 86_400,
  },
};
```

上线前必须用真实响应验证状态码、Content-Type、`Cache-Control`、`Vary`、大小和是否携带
`Authorization`。完整准入规则、SWR 限制和验收步骤只在[公共读取缓存](/guide/public-read-cache)维护；
不要从本页片段推断私有数据可以缓存。

## 路径六：配置两种恢复能力

“恢复”有两个不同含义：

| 能力 | 解决的问题 | 接入方要做什么 |
| --- | --- | --- |
| 恢复 worker | 当前 worker 或缓存规则异常 | 预先保留构建产物；事故时部署到原 worker URL，清理本应用缓存后回到网络 |
| 入口恢复页 | 原 Origin 迁移或不可达 | 安装 `entry-resilience`、预缓存恢复页、业务后端提供清单、用户确认后跳到新 Origin |

恢复 worker 由 `@pwa-platform/vite` 随构建生成，不是页面中的开关。发布团队必须按
[部署与发布](/operations/release#回滚与恢复)保存并演练，不能靠修改 scope 或 worker URL 绕过事故。

入口恢复需要额外安装 `@pwa-platform/entry-resilience@0.2.3`：

```ts
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";

plugins: [
  pwa({ identity, policy, install, topology }),
  pwaEntryResilience({ identity, maxValidityDays: 30, locale: "zh-CN" }),
]
```

同一个 `identity` 对象必须传给两个插件；策略还要把 mount-relative `/pwa-entry.html` 与它的
`/assets` 脚本纳入预缓存。应用通过自己的鉴权请求取得清单，再调用：

```ts
import {
  checkEntryRecovery,
  setPwaTheme,
  updateEntryManifest,
} from "@pwa-platform/entry-resilience/client";

await updateEntryManifest(await api.getEntryManifest());
const result = await checkEntryRecovery({ returnPath: location.pathname });
setPwaTheme(currentTheme);
```

平台只校验形状、递增序号和有效期，不认证清单来源，也不限制目标 Origin；业务后端和请求层承担信任
边界。页面只给应用返回同源恢复页 URL，最终跨 Origin 导航必须由用户点击确认。完整 manifest 格式、
撤回流程、语言、主题和 CSP 见[入口恢复](/guide/entry-resilience)。

## 每增加一层后怎么验收

1. 构建必须通过，且 manifest、worker、离线页和图标的最终 URL 与 identity 一致。
2. 在线首次打开后确认页面由目标 worker 控制；再按本层功能制造安装、更新、断网或故障场景。
3. 检查“不该发生”的行为：空策略无业务缓存、私有请求不入缓存、更新不自动刷新、入口恢复不自动跳转。
4. 用 PC 和业务承诺的手机浏览器重复关键流程，并记录系统、浏览器版本、时间和结果。
5. 发布前继续执行[上线前检查](/start/checklist)；平台示例的测试结果不能替代业务站点证据。
