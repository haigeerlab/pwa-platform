# Vite + Vue 接入

适用范围：Vite 8、Vue 3.4 及以上且低于 4，构建环境为 Node.js 22.12 或更高版本。先按[包选择](/start/choose)安装，再完成以下步骤。示例以部署在域名根路径为例；若部署到 <code>/app/</code>，需要同时调整 Vite <code>base</code>、身份中的路径和安装资源 URL。

本页的页面入口依赖构建期提供的 <code>virtual:pwa-config</code>。当前插件不支持 <code>vite dev</code>；本地验证请运行生产构建，再用 <code>vite preview</code> 打开产物。

## 1. 声明身份与策略

在项目根目录新增 <code>pwa.config.ts</code>，按[配置指南](/guide/configuration)填写真实 origin、名称和图标。生产身份首次注册后不能随意改动。

## 2. 挂载构建插件

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config";

export default defineConfig({
  base: "/",
  plugins: [
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

<code>offlinePage: {}</code> 要与策略中的离线回退及其资源规则一起使用；插件会生成离线页并把 manifest 链接注入 HTML。若项目已有 Vite 插件，保留它们，在 <code>plugins</code> 数组中加入 <code>pwa()</code> 即可。

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

~~~vue
<script setup lang="ts">
import { usePwa } from "@pwa-platform/vue";
import { onMounted } from "vue";

const pwa = usePwa();
onMounted(() => {
  void pwa.register();
});
</script>

<template>
  <button v-if="pwa.state.value.installEligible" @click="pwa.promptInstall()">
    安装应用
  </button>
  <button v-if="pwa.state.value.updateWaiting" @click="pwa.applyUpdate()">
    应用更新
  </button>
</template>
~~~

上面的按钮仅演示 API。实际更新流程需处理失败、稍后提醒、未保存内容和是否刷新页面，见[安装与更新](/guide/updates)。

## 5. 构建并验收

运行项目的生产构建，然后把产物部署到与 <code>IDENTITY.origin</code>、<code>scope</code> 一致的 HTTPS 地址。接着按[上线前检查](/start/checklist)确认首次注册、离线重新打开和更新等待行为。
