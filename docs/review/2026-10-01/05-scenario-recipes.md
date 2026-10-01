# 05 · 按场景复制的最小配置

以下片段用于 **已按[固定身份配置](../../../website/guide/configuration.md)完成 `IDENTITY`/`INSTALL`、Vite 插件和 Vue/React `register()`** 的业务项目。每个 `POLICY` 片段可直接替换 `pwa.config.ts` 中同名常量；示例以部署在 `/` 的 Vite 项目、产物 `/index.html` 与 `/assets/` 为前提，子路径要按 `mountPath` 换算。所有例子都需先在线安装 worker，刷新使页面受控，再试离线。`cache-first` 在 `asset` 上代表预缓存准入；“网络优先导航”本身不写缓存。

## 1. 只要可安装外壳，业务默认无缓存

```ts
import type { PwaPolicy } from "@pwa-platform/contracts";
export const POLICY: PwaPolicy = {
  schemaVersion: 1, install: { enabled: true },
  offlineFallback: { enabled: false }, updateMode: "prompt", resources: [],
};
```

Vite 插件传 `identity:IDENTITY, install:INSTALL, policy:POLICY, topology:{kind:"standalone-origin"}`，不传 `offlinePage`。生成安装清单与 worker，但不预缓存业务资源；断网后新导航和动态 API 失败，可能是浏览器错误页或原页面自己的空白状态。若“应用壳”指**离线可启动的静态框架**，换用下例：

```ts
export const POLICY: PwaPolicy = {
  schemaVersion: 1, install: { enabled: true },
  offlineFallback: { enabled: false }, updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};
```

断网打开已预缓存的 `/index.html` 可见壳；未预缓存的 `/users/42` **不会通配回根壳**，会网络错误；壳里的动态 API 不缓存，应用自己的加载态可能空白。依据：[决策表](../../../packages/sw-runtime/src/worker/decide.ts)、[离线 E2E](../../../packages/sw-runtime/browser-tests/offline.spec.ts)。

## 2. 加离线页

沿用第 1 节的 `IDENTITY`、`INSTALL` 与 Vite 插件，把 `POLICY` 换成：

```ts
import type { PwaPolicy } from "@pwa-platform/contracts";
export const POLICY: PwaPolicy = {
  schemaVersion: 1, install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" }, updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};
```

并在 `pwa()` 中加：

```ts
offlinePage: { locale: "zh-CN", messages: { heading: "暂时无法连接" } }
```

平台构建 `/offline.html` 并预缓存。受控、匹配公共导航规则的导航在**网络失败或 `networkTimeoutSeconds` 超时**后，若同路径缓存未命中，才显示离线页；HTTP 500 有响应时照常返回 500。自备 `public/offline.html` 时删除 `offlinePage` 选项。若希望弱网 5 秒内回退，在 `POLICY` 加 `networkTimeoutSeconds:5`；默认不设，iPhone 真机曾约等 60 秒。未分类导航仍直接透传，需公共导航规则。依据：[离线页 E2E](../../../packages/vite/browser-tests/offline-page.spec.ts)、[超时验证](../../../tasks/network-timeout/verification.md)。

## 3. UI 语言与主题

Vue 默认更新提示：

```vue
<script setup lang="ts">
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";
</script>
<template>
  <PwaUpdateNotice locale="en" :messages="{ readyTitle: 'A new version is ready' }"
    :colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#fff' }" />
</template>
```

React 对应用 `@pwa-platform/react/ui` 与其 CSS。提示语言运行时选，默认中文；不挂载则无默认提示。离线页在构建时用 `offlinePage:{locale:"en",messages:{heading:"Offline"},css:".pwa-offline { --pwa-offline-accent: #006e52; }"}`，默认主题跟随系统；恢复页用 `pwaEntryResilience({identity:IDENTITY,maxValidityDays:30,locale:"en"})` 与页面端 `setPwaTheme("dark")`。它们不是同一份 i18n 状态；离线/恢复页构建后不能随用户选择即时换语言。依据：[UI E2E](../../../packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts)、[离线页面](../../../packages/vite/src/offline-page.ts)、[恢复页语言](../../../website/guide/entry-resilience.md)。

## 4. 主源不可用的入口恢复页

在第 1 节应用壳策略的 `resources` 数组再加两条（已有 `/assets` 时无需重复）：

```ts
{ pathPrefix: "/pwa-entry.html", resourceClass: "asset", cache: "cache-first" },
{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
```

Vite 插件数组使用同一身份对象：

```ts
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { IDENTITY, POLICY, INSTALL } from "./pwa.config.ts";
export default defineConfig({
  base: "/",
  plugins: [
    vue(),
    pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL,
      topology: { kind: "standalone-origin" } }),
    pwaEntryResilience({ identity: IDENTITY, maxValidityDays: 30, locale: "zh-CN" }),
  ],
});
```

这是 Vue/Vite 例子；React 项目保留原来的 React Vite 插件，替换上面的 `vue()` 即可。`POLICY` 要包含本节两条恢复页预缓存规则，否则构建会拒绝。

业务请求层先取得清单并解密，再交给平台；代码中的 `api` 和 `showBanner` 必须替换成业务已有实现：

```ts
import { updateEntryManifest, checkEntryRecovery } from "@pwa-platform/entry-resilience/client";
await updateEntryManifest(await api.getEntryManifest());
const result = await checkEntryRecovery({ returnPath: location.pathname });
if (result.kind === "available") showBanner(result.recoveryPageUrl);
```

平台只校验清单形状、递增序号、有效期，**不验证来源，也不限制目标 Origin**；清单接口须由业务保护。`status:"migrating"`/`"incident"` 可直接展示；`"normal"` 时仅在主入口探针不通且有可达备用入口时产生 `unconfirmed-outage`。探针每次最长 5 秒；用户确认后才跳新 Origin，不带走旧源会话和缓存。旧源连 DNS/证书都不可用且用户从未缓存过恢复页时，页面无法凭空加载；恢复 worker 处理的是同 URL SW 事故。完整清单结构与失败诊断见[入口恢复指南](../../../website/guide/entry-resilience.md)；证据：[双源浏览器场景](../../../packages/entry-resilience/browser-tests/scenarios.spec.ts)。真实 DNS/证书故障仍未演练。

## 5. 缓存经人工确认的公共业务读取

```ts
import type { PwaPolicy } from "@pwa-platform/contracts";
export const POLICY: PwaPolicy = {
  schemaVersion: 3, install: { enabled: true },
  offlineFallback: { enabled: false }, updateMode: "prompt",
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  resources: [
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
  ],
  runtimeCache: { enabled: true, maxEntries: 100, maxEntryBytes: 262_144, maxAgeSeconds: 86_400 },
};
```

只有同源、无身份差异的 GET `/api/catalog` 响应满足状态/MIME/Cache-Control/Vary/体积限制后才写缓存；在线优先网络，**本例未设网络超时**，网络失败时可用未过期的旧条目，请求一直挂起时会继续等。需要限时回退时另加 `networkTimeoutSeconds: 5`。改 `cache:"stale-while-revalidate"` 时可立即给旧公共数据、后台更新；不能据此缓存私有 API。`runtimeCache.enabled:false` 或 v1/v2 时即使写了 `network-first`，未预缓存业务请求仍透传。详见[公共读取准入](../../../website/guide/public-read-cache.md)及[浏览器 E2E](../../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)。

## 6. 更新提示

在第 1 节离线可启动壳的规则基础上，保留必填 `updateMode:"prompt"`，在 Vue/React 挂上第 3 节组件或自行订阅 `updateWaiting` 后让用户调用 `applyUpdate()`。长时间打开时可给 `createPwa({config,updateCheck:{intervalMs:1_800_000}})` 或 React Provider 同名选项。**默认没有定时检查，也没有默认 UI；浏览器自身仍可能触发更新检查。**新 worker 默认等待，确认后接管，当前页面仍需业务在安全时机显式刷新。依据：[更新 E2E](../../../packages/examples-browser-e2e/browser-tests/update.spec.ts)、[facade](../../../packages/client-runtime/src/client/facade.ts)。

## 7. 多标签页

无需增加策略字段；每个页面使用同一身份和 scope 调用 `register()`、订阅状态。一个标签确认 `applyUpdate()` 后，浏览器给其他受控标签发 `controllerchange`，各页面各自清除旧提示；业务表单状态、数据缓存和页面刷新**不由平台跨标签同步**。依据：[双标签断言](../../../packages/examples-browser-e2e/browser-tests/update.spec.ts)与[客户端监听](../../../packages/client-runtime/src/client/facade.ts)。

## 8. 断网与恢复联网

业务页面无额外平台配置，也没有公开 `isOnline` API；原生 fetch 失败由业务决定重试。只有第 2 节**平台离线页**内置 `online` 事件和 `HEAD` 探针，探测源恢复后重载；该行为不自动作用于原业务页面。真机 Safari 断网时 `navigator.onLine` 可能仍为真，页面以探针确认而非只信事件。依据：[离线页脚本](../../../packages/vite/src/offline-page.ts)、[跨平台矩阵 4a](../../../website/reference/platform-test-matrix.md)。
