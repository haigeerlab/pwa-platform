# Vite + Vue 接入

适用范围：Vite 8、Vue 3.4 及以上且低于 4，构建环境为 Node.js 22.12 或更高版本。先按[包选择](/start/choose)安装，再完成以下步骤。示例以部署在域名根路径为例；若部署到 <code>/app/</code>，需要同时调整 Vite <code>base</code>、身份中的路径和安装资源 URL。

本页的页面入口依赖构建期提供的 <code>virtual:pwa-config</code>。当前插件不支持 <code>vite dev</code>；本地验证请运行生产构建，再用 <code>vite preview</code> 打开产物。
示例要求浏览器提供 <code>navigator.serviceWorker</code>；若业务系统还要在不提供此 API 的环境运行，请先看[兼容范围中的降级说明](/reference/compatibility#不支持-service-worker-的环境)。

示例使用 <code>App.vue</code> 单文件组件，需要在 Vite 中启用 <code>@vitejs/plugin-vue</code>。已有 Vite + Vue 项目保留原有 Vue 插件；若尚未安装，先运行 <code>pnpm add -D @vitejs/plugin-vue@6.0.9</code>。

## 1. 声明身份与策略

在项目根目录新增 <code>pwa.config.ts</code>，按[配置指南](/guide/configuration)填写真实 origin、名称和图标。生产身份首次注册后不能随意改动。

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

为虚拟模块增加类型声明：

~~~ts
// src/virtual-pwa.d.ts
declare module "virtual:pwa-config" {
  import type { createPwa } from "@pwa-platform/vue";
  const config: Parameters<typeof createPwa>[0]["config"];
  export default config;
}
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

运行项目的生产构建，然后把产物部署到与 <code>IDENTITY.origin</code>、<code>scope</code> 一致的 HTTPS 地址。接着按[上线前检查](/start/checklist)确认首次注册、离线重新打开和更新等待行为。
