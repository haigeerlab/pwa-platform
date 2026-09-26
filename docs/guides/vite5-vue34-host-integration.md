# Vite 5 + Vue 3.4 业务项目接入作业单

> 供采用 Vite 5 + Vue 3.4 的应用开发者或 AI 执行。示例使用占位域名和应用名；必须按实际源码与部署路径调整。
>
> **版本边界：**npm 正式版 `0.1.0` 支持 Vite 5 并提供可选更新提示 UI；独立消费夹具以 Node 22.22.0、Vite 5.0.0、Vue 3.4.0 从最终候选 tarball 安装、类型检查和构建通过。接入时固定同一批 0.1.0 平台包。夹具通过不等于宿主验收通过。

## 1. 先在业务仓库核对

1. 读实际 `package.json`、锁文件、`vite.config.ts`、`tsconfig`、应用入口和部署配置，记录 Node、包管理器、Vite、Vue、TypeScript 的精确版本。Router 和状态管理包无需为了 PWA 单独升级；按宿主的 `tsconfig` 实测类型检查。隔离夹具曾观察到旧版 Vuex 与 TypeScript `moduleResolution: "Bundler"` 的声明解析问题，不应靠随意改解析模式掩盖。
2. 搜索 `VitePWA`、`virtual:pwa-register`、`registerSW`、`navigator.serviceWorker`、`src/sw.ts`、manifest 链接和旧更新提示。先读旧 worker 中是否有仍需保留的业务能力，再移除旧链路。若旧 PWA 从未在任何环境注册，可省去已安装用户的迁移；该前提须按宿主实际发布历史确认。
3. 确认最终 HTTPS origin、部署 `base`、图标、公开的离线应用壳、同源私有接口前缀和线上响应头。首次注册前确定 `appId`、manifest ID、scope、worker URL 与缓存命名空间；生产后不能当作普通配置随意修改。

## 2. 移除旧 PWA，保留业务构建链

- 固定安装同一批平台版本：`pnpm add @pwa-platform/vue@0.1.0`，以及 `pnpm add -D @pwa-platform/vite@0.1.0 @pwa-platform/contracts@0.1.0`。`contracts` 仅在业务配置直接导入其类型时需要。
- 从 `vite.config.ts` 移除 `VitePWA(...)` 和对应导入；从应用入口移除旧注册调用、旧更新提示与旧 manifest 链接。新旧插件不能同时生成同一 scope 的 worker/manifest。
- 删除 `vite-plugin-pwa`；`src/sw.ts` 与 `workbox-*` 依赖仅在确认没有其他引用后清理。不要顺手改动 Vue Router、Vuex、业务 API、混淆或打包目录。
- 按最终线上挂载路径设置 Vite `base`，再按实际 `build.assetsDir` 写资源规则。根站示例使用 `/` 与默认 `/assets`；若线上在 `/m/`，需使用对应路径构建，不能靠反向代理改写一个根路径产物。多应用同源示例见[部署拓扑](../architecture/deployment-topologies.md#本地开发与线上子路径)。

## 3. 声明平台身份与最小安全策略

下面是**示意值**，由业务仓库用实际域名、产品名、图标和接口前缀替换。若一个 origin 下还有其他 PWA，应先按共享 origin 规则设计 topology，不能直接照抄 `standalone-origin`。

```ts
// pwa.config.ts
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";

export const BASE = "/";

export const IDENTITY: PwaIdentity = {
  appId: "business-app",
  manifestId: BASE,
  origin: "https://app.example.com",
  scope: BASE,
  serviceWorkerUrl: `${BASE}sw.js`,
  manifestUrl: `${BASE}manifest.webmanifest`,
  mountPath: BASE,
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: BASE,
  display: "standalone",
  name: "Business App",
  shortName: "App",
  themeColor: "#006e52",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
};

export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api", resourceClass: "session-data", cache: "none" },
  ],
};
```

只把真正公开的应用壳和静态产物放入预缓存。登录态、个人数据、写请求、视频流及未分类请求不能因通配规则被缓存。同源 API 要逐一确认请求性质并声明拒绝类别；不要把开发代理配置直接当作生产接口清单。默认离线页由平台生成时，用 `offlinePage: {}`，不要再把旧 `public/offline.html` 同路径一起输出。

## 4. 加入构建插件并稳定产物

保留宿主的 Vue、JSX、自动导入、组件和压缩插件，只替换 PWA 部分。如果混淆插件也在 `enforce: "post"` 阶段，把 `pwa()` **列在它后面**，让平台读取最终 JS/CSS 字节。混淆插件的随机种子要固定，同一源码、同一构建输入不能生成同名不同字节的文件。

```ts
// vite.config.ts 的关键片段；不要覆盖业务配置的其余部分
import { pwa } from "@pwa-platform/vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config";

plugins: [
  // ...现有 Vue、JSX、AutoImport、Components 等插件
  // 若启用 CSS 清理，将 /^pwa-update-notice/ 加入其 safelist
  // 若启用随机构建插件，为相同发布输入固定随机种子
  pwa({ identity: IDENTITY, install: INSTALL, policy: POLICY,
    topology: { kind: "standalone-origin" }, offlinePage: {} }),
],
```

这个片段不是可以独立运行的完整 `vite.config.ts`。接入方须检查实际插件顺序与构建输出。CSS 清理插件只扫描业务 `.vue` 文件时可能删掉依赖包的类名，所以需保留 `pwa-update-notice` 样式；隔离夹具曾出现 CSS 清理输出无效 CSS，且移除平台插件后仍可出现。宿主若复现，应分别对照启用／停用 CSS 清理的产物，先定位构建链，不能跳过 CSS 验收。

若宿主每次构建都用当前时间生成版本码，重复构建比对时应固定这个输入，或把版本码改为明确的发布 ID；仅固定混淆种子不足以让整包可重现。同一源码、同一版本输入连续构建两次，比较同名 JS/CSS 的 SHA-256；修改一处会进入预缓存的代码后再构建，确认相应资源 URL 或 revision 变化且 worker 脚本变化。不得通过关闭文件指纹来回避同名异内容。

## 5. Vue 入口、更新提示与颜色

在 0.1.0 中，给项目已有的 `tsconfig` 增加 `@pwa-platform/vite/virtual` 类型引用；已有 `compilerOptions.types` 时追加，别覆盖其余类型。应用入口从 `virtual:pwa-config` 取得配置并安装 `createPwa({ config, updateCheck: { intervalMs: 1_800_000 } })`。长时间保持打开的单页应用建议显式开启 `updateCheck`；`vite dev` 只渲染普通页面，注册逻辑应限定在生产构建。

```vue
<!-- 现有根布局内，仅展示 PWA 相关部分 -->
<script setup lang="ts">
import { onMounted } from "vue";
import { usePwa } from "@pwa-platform/vue";
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";

const pwa = usePwa();
onMounted(() => {
  if (import.meta.env.PROD) {
    void pwa.register().catch((error: unknown) => {
      console.error("PWA worker 注册失败", error); // 接入业务现有错误上报
    });
  }
});

function reloadAfterBusinessCheck(): void {
  // 在这里接入业务已有的未保存内容保护；允许离开后才刷新。
  if (canLeaveCurrentPage()) window.location.reload();
}
</script>

<template>
  <RouterView />
  <PwaUpdateNotice
    position="bottom-right"
    :colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#ffffff' }"
    :reload-page="reloadAfterBusinessCheck"
  />
</template>
```

`canLeaveCurrentPage()` 代表业务已有的离页判断函数，不能原样复制为未定义调用。没有未保存内容保护要求时，省略 `reloadPage`，组件只会在用户点击“刷新页面”后刷新。`colors` 还支持 `surface`、`text`、`mutedText`、`border`，只作用于当前提示；CSS 变量可做更深入的品牌样式。默认提示不自动注册 worker，也不会在用户选“稍后”时接管。Vuex 和 Router 继续按业务原方式接入。

## 6. 业务仓库必须留下的验收证据

- **安装与构建：**使用实际 Node/pnpm 和固定平台包版本安装、类型检查、生产构建；`vite dev` 可打开页面且没有平台 worker。确认只有一份 manifest、一个预期 scope 的 worker、恢复 worker 与平台生成的离线页；最终 CSS 中保留 `.pwa-update-notice`。
- **重复构建：**固定源码与发布输入的两次构建中，同名 JS/CSS 字节一致；改源码后 worker 内容变化。若混淆、PurgeCSS 或时间戳导致不一致，先修复再继续。
- **真实浏览器：**首次在线注册，清除浏览器 HTTP 缓存后断网重开；预缓存范围不含私有响应。保持页面不刷新发布新版，确认出现提示；“稍后”保持旧 worker 等待，“更新”先接管，“刷新页面”再由用户明确触发。至少验证两个同源标签页。
- **部署：**在真实 HTTPS origin 核对 manifest、worker、静态资源的路径和响应头；worker 与 manifest 应可重新验证，带指纹资源按保留规则配置缓存。首次生产发布须建立身份基线，并按发布流程保存回滚与旧资源保留证据。

无法运行的宿主检查应明确写为“未验证”，附原因与下一步，不把本平台的 Vite 5 隔离夹具结果当作业务通过。更完整的通用迁移细节见[迁移指南](migrate-from-vite-plugin-pwa.md)，发布门禁见[运行手册](../operations/release-and-incident-runbook.md)。

## 给 AI 执行者

把本仓库的 [`.agents/skills/pwa-vite5-vue-integration`](../../.agents/skills/pwa-vite5-vue-integration/SKILL.md) 整个目录复制到宿主仓库同名路径，即可供 AI 执行者使用。Skill 会先读取实际宿主源码再实施；本手册的占位值和片段都不能直接视为最终配置。

详细构建日志、业务域名、文件路径和测试截图留在宿主仓库；向公开平台仓库反馈时，只提交脱敏后的结果和能独立复现的平台问题。
