# @pwa-platform/vue

Vue 3.4+ binding for PWA Platform. It creates one browser lifecycle facade for the application, exposes reactive
install/update state through `usePwa()`, forwards the five supported actions, and provides an optional accessible
update notice. Configure build artifacts separately with `@pwa-platform/vite`.

## Install

```sh
npm install @pwa-platform/vue @pwa-platform/vite
```

Add `@pwa-platform/vite/virtual` to `compilerOptions.types`, then install the binding in the application entry:

```ts
// main.ts
import config from "virtual:pwa-config";
import { createPwa } from "@pwa-platform/vue";
import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);
app.use(createPwa({
  config,
  // Optional, visibility-aware update check. Omit to disable.
  updateCheck: { intervalMs: 30 * 60_000 },
}));
app.mount("#app");
```

Register from a mounted browser component, normally only in production:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { usePwa } from "@pwa-platform/vue";

const pwa = usePwa();

onMounted(() => {
  if (import.meta.env.PROD) void pwa.register();
});
</script>

<template>
  <button v-if="pwa.state.value.installEligible" @click="pwa.promptInstall()">
    安装应用
  </button>
  <button v-if="pwa.state.value.updateWaiting" @click="pwa.applyUpdate()">
    更新应用
  </button>
</template>
```

`usePwa()` returns a readonly ref with `registered`, `installEligible`, `installed` and `updateWaiting`, plus
`register()`, `promptInstall()`, `checkForUpdate()`, `applyUpdate()` and `logout()`. It throws when the plugin is not
installed. During SSR the state is the initial all-false snapshot and methods reject until called in the hydrated
browser.

## Optional update notice

```vue
<script setup lang="ts">
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";

const messages = { readyTitle: "发现新版本", update: "立即更新", later: "稍后" };
</script>

<template>
  <PwaUpdateNotice
    position="bottom-right"
    :messages="messages"
    :colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#fff' }"
    :reload-page="() => location.reload()"
  />
</template>
```

The notice is opt-in and non-modal. Positions are `bottom-right`, `bottom-center`, `top-right` and `top-center`.
`locale` selects the built-in copy (`"zh-CN"`, the default, or `"en"`); `messages` overrides individual keys on top of it; `colors` controls surface, text, muted text, border and
primary button colors. CSS variables prefixed with `--pwa-update-` provide deeper theming. `reloadPage` runs only
after the worker takeover and an explicit click, so the host can protect unsaved work.

## Lifecycle boundaries

- Do not pass both `client` and `updateCheck`; an injected facade is already configured and the binding throws.
- `applyUpdate()` changes the controlling worker but does not reload the document unless the host or notice does it.
- `logout()` returns the cleanup result but does not reset the binding's `registered` snapshot. Recreate/reload the
  application if its UI must reflect an unregistered worker immediately.
- Vue 3.5+ disposes the facade through `app.onUnmount`; Vue 3.4 has no equivalent application unmount hook.
- The binding intentionally does not expose raw event subscription. Use `@pwa-platform/client-runtime` directly
  only when the application genuinely needs lifecycle telemetry such as `served-from-cache`.

See the [Vue quick start](https://github.com/haigeerlab/pwa-platform/blob/main/website/start/vue.md) and
[update prompt guide](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/update-prompt.md).
