# Vite + Vue 接入

适用范围：Vite 5／8、Vue 3.4 及以上且低于 4，构建环境为 Node.js 22.12 或更高版本（Vite 8 的要求；平台包声明 <code>>=22.0.0</code>）。先按[包选择](/start/choose)安装 0.2.4，再完成以下步骤。示例以部署在域名根路径为例；若部署到 <code>/app/</code>，需要同时调整 Vite <code>base</code>、身份中的路径和安装资源 URL。

::: warning Vue 3.4 不会在应用卸载时释放 facade
<code>app.onUnmount</code> 是 Vue 应用唯一的卸载钩子，Vue 3.5 才引入；3.4 的 <code>App</code> 接口没有任何卸载回调注册点，因此 <code>createPwa()</code> 创建的 facade 在 Vue 3.4 下**不会**被释放。普通场景（应用启动时挂载一次、页面生命周期内不再卸载）不受影响；只有反复挂载/卸载同一应用（例如微前端宿主）才需要升级到 Vue 3.5+ 以避免逐次泄漏。
:::

<code>vite dev</code> 和生产构建中都提供 <code>virtual:pwa-config</code>；开发服务不生成平台 worker。安装、离线与更新仍须运行生产构建，再用 <code>vite preview</code> 或目标 HTTPS 站点验收。
示例要求浏览器提供 <code>navigator.serviceWorker</code>；若业务系统还要在不提供此 API 的环境运行，请先看[兼容范围中的降级说明](/reference/compatibility#不支持-service-worker-的环境)。

示例使用 <code>App.vue</code> 单文件组件，需要在 Vite 中启用 <code>@vitejs/plugin-vue</code>。已有 Vite + Vue 项目保留原有 Vue 插件；若尚未安装，应按所用 Vite 主版本选择兼容的插件版本并核对其 peer 依赖。

::: warning 身份字段上线后不可变更
<code>appId</code>、<code>manifestId</code>、<code>origin</code>、<code>scope</code>、<code>serviceWorkerUrl</code>、<code>manifestUrl</code>、<code>mountPath</code>、<code>environment</code>、<code>cacheNamespaceSeed</code> 这九个字段在首次生产发布后即被记入发布基线，不可更改。首次上线前先确定真实的 HTTPS 域名、部署路径和 <code>sw.js</code> 的位置；之后再改属于迁移，需要 ADR 与迁移计划，不是普通发版。
:::

## 1. 声明身份与策略

在项目根目录新增 <code>pwa.config.ts</code>，必须导出 <code>IDENTITY</code>、<code>INSTALL</code>、<code>POLICY</code> 三个常量：直接复制[配置指南](/guide/configuration)中的完整示例，再替换真实 origin、名称和图标。前置条件：

- <code>public/icons</code> 下要有四个真实的 PNG 图标：192 与 512 两种尺寸，各含 <code>any</code> 和 <code>maskable</code> 两种用途；缺任何一个都会报 <code>install.missing-icon-variant</code>。
- 下面插件里的 <code>offlinePage: {}</code> 要求 <code>POLICY.offlineFallback.enabled: true</code>，否则构建报 <code>vite.offline-page-without-fallback</code>。
- 子路径部署（如 <code>/app/</code>）按配置指南中的[对应表](/guide/configuration#生产身份要保持稳定)逐项替换；<code>serviceWorkerUrl</code> 必须直接位于 <code>scope</code> 目录下。

## 2. 挂载构建插件

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config.ts";

export default defineConfig({
  base: "/",
  plugins: [
    vue(),
    pwa({
      identity: IDENTITY,
      install: INSTALL,
      policy: POLICY,
      topology: { kind: "standalone-origin" },
      offlinePage: {},
    }),
  ],
});
~~~

Vite 8 默认构建能解析省略扩展名的导入，但会提示未来原生配置加载器不支持；这里写出 <code>.ts</code> 扩展名。若现有项目的类型检查报 <code>TS5097</code>，请在检查 <code>vite.config.ts</code> 的 TypeScript 配置中启用 <code>allowImportingTsExtensions</code>，并保持 <code>noEmit</code>。

<code>offlinePage: {}</code> 要与策略中的离线回退及其资源规则一起使用；插件会生成离线页并把 manifest 链接注入 HTML。若项目还有其他 Vite 插件，保留它们，在 <code>plugins</code> 数组中加入 <code>pwa()</code> 即可。

## 3. 安装 Vue 绑定

~~~ts
// src/main.ts
import config from "virtual:pwa-config";
import { createPwa } from "@pwa-platform/vue";
import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);
app.use(createPwa({ config, updateCheck: { intervalMs: 1_800_000 } }));
app.mount("#app");
~~~

<code>updateCheck</code> 可选，默认关闭；<code>1_800_000</code> 即 30 分钟。<code>intervalMs</code> 必须是 60000 到 2147483647 之间的整数，否则创建绑定时抛错。<code>register()</code> 成功后满一个完整间隔才做第一次检查，不会立即检查；标签页隐藏时暂停，重新可见时补检；失败静默处理。详见[安装与更新](/guide/updates)。

为虚拟模块增加类型：在已有 <code>tsconfig</code> 的 <code>compilerOptions.types</code> 中追加 <code>@pwa-platform/vite/virtual</code>，保留项目原有类型。

~~~json
{ "compilerOptions": { "types": ["vite/client", "@pwa-platform/vite/virtual"] } }
~~~

## 4. 在应用启动后注册

将以下逻辑合入现有 <code>App.vue</code>，保留原有业务页面。安装与更新按钮只在对应状态出现；首次打开时两者可能都不可见，不能用按钮是否显示判断注册是否成功。

~~~vue
<script setup lang="ts">
import { usePwa } from "@pwa-platform/vue";
import { onMounted, ref } from "vue";

const pwa = usePwa();
const installAttempted = ref(false);
onMounted(() => {
  if (!import.meta.env.PROD) return;
  void pwa.register().catch((error: unknown) => {
    console.error("PWA worker 注册失败", error);
  });
});

function promptInstall(): void {
  installAttempted.value = true;
  void pwa.promptInstall().catch((error: unknown) => {
    console.error("PWA 安装提示失败", error);
  });
}

function applyUpdate(): void {
  void pwa.applyUpdate().catch((error: unknown) => {
    console.error("PWA 更新接管失败", error);
  });
}
</script>

<template>
  <button v-if="pwa.state.value.installEligible && !installAttempted" type="button" @click="promptInstall">
    安装应用
  </button>
  <button v-if="pwa.state.value.updateWaiting" type="button" @click="applyUpdate">
    应用更新
  </button>
</template>
~~~

上面的按钮仅演示 API：首次尝试安装后隐藏一次性提示按钮，失败时只写入控制台。业务界面仍需提供可见的错误与重试，并处理稍后提醒、未保存内容和是否刷新页面，见[安装与更新](/guide/updates)。
<code>register()</code> 失败时会拒绝 Promise，平台不会记住失败；修复原因后可再次调用。排查方法见[常见问题](/guide/troubleshooting#worker-注册失败)。

## 5. 构建并验收

运行生产构建并本地预览：

~~~bash
pnpm vite build
pnpm vite preview
~~~

<code>dist</code> 应包含：位于 <code>IDENTITY.serviceWorkerUrl</code> 的 <code>sw.js</code>、<code>manifest.webmanifest</code>、<code>pwa-recovery-worker.js</code>，启用 <code>offlinePage</code> 时还有离线页（文件名取自 <code>POLICY.offlineFallback.path</code>，示例为 <code>offline.html</code>）。部署前先读[服务器与 CDN 配置](/operations/hosting)，再把产物部署到与 <code>IDENTITY.origin</code>、<code>scope</code> 一致的 HTTPS 地址，然后按[上线前检查](/start/checklist)确认。
