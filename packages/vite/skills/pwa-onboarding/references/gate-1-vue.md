# 关卡 1：Vite + Vue

适用范围：Vite 5／8、Vue 3.4 及以上且低于 4、Node.js 22.12 及以上。已有项目保留原有的 Vue 插件与路由，只**追加**，不要替换。

## 1. 挂载构建插件

<!-- 出处：website/start/vue.md -->
```ts
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
```

把 `pwa()` 加进现有 `plugins` 数组。`offlinePage: {}` 要与策略里的离线回退及其资源规则一起用。要英文离线页，写 `offlinePage: { locale: "en" }`（构建时选定）。

## 2. 安装页面绑定

<!-- 出处：website/start/vue.md -->
```ts
// src/main.ts
import config from "virtual:pwa-config";
import { createPwa } from "@pwa-platform/vue";
import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);
app.use(createPwa({ config, updateCheck: { intervalMs: 1_800_000 } }));
app.mount("#app");
```

`updateCheck` 是默认档的定时检查（30 分钟）。采访确认没有长期不刷新的独立窗口用户时，可以去掉这一项。

给虚拟模块加类型，在现有 `tsconfig` 的 `compilerOptions.types` 里**追加**，保留原有类型：

<!-- 出处：website/start/vue.md -->
```json
{ "compilerOptions": { "types": ["vite/client", "@pwa-platform/vite/virtual"] } }
```

## 3. 在应用启动后注册

平台不会自动注册 worker，必须由应用在生产环境主动调用 `register()`。合入现有 `App.vue`，保留原有业务页面：

<!-- 出处：website/start/vue.md -->
```vue
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
```

这段里的更新按钮只是演示 API。默认档改用下面的 `PwaUpdateNotice`，可以删掉更新按钮；安装按钮是否保留按采访 Q6。

## 4. 默认更新提示

<!-- 出处：website/guide/updates.md -->
```vue
<script setup lang="ts">
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";
</script>

<template>
  <RouterView />
  <PwaUpdateNotice
    position="bottom-right"
    :colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#ffffff' }"
  />
</template>
```

英文界面给组件加 `locale="en"`（运行时选择，默认 `zh-CN`）。

## 5. 保护未保存的内容（采访 Q8 为"有"时）

默认组件不会替业务判断表单是否已保存。传入 `reloadPage`：

<!-- 出处：website/guide/integration-by-capability.md -->
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

`confirmThenReload` 与 `updateMessages` 是占位：`confirmThenReload` 由业务实现（先确认或保存，再 `location.reload()`）；不需要自定义文案就去掉 `:messages`。

## 6. 验证

`vite dev` 只提供 `virtual:pwa-config`，不生成平台 worker。安装、离线与更新必须用 `vite build` 加 `vite preview`，或部署后验证。
