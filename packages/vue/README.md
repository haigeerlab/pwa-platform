# @pwa-platform/vue

Vue 3 binding for PWA Platform.

Use `createPwa()` and `usePwa()` in a Vue 3 application. Also configure `@pwa-platform/vite` for build artifacts.

The current source adds an opt-in update notice (not present in the published `0.1.0-beta.1`):

```ts
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";
```

Render `<PwaUpdateNotice />` inside the app that installed `createPwa()`. Mounting it enables the notice; omit it to keep your own UI. The default is a non-modal bottom-right card. `position` also accepts `bottom-center`, `top-right`, and `top-center`; `messages` overrides Chinese copy. Use `:colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#ffffff' }"` for simple brand colors; `surface`, `text`, `mutedText`, and `border` are also available. Inherited `--pwa-update-*` CSS variables control the remaining appearance; `colors` takes precedence for values it sets. `reloadPage` can replace the final reload action when the application must protect unsaved work. Only a click on “刷新页面” calls it. The component does not register the worker; the application still calls `register()` and may configure `updateCheck` for long-lived pages.

This is a `0.1.0` prerelease. It provides online use, installation integration, static precaching, a safe offline fallback, and controlled updates. It does not enable runtime business API caching, private data caching, automatic write replay, or Push for applications. Production deployment requires the application and infrastructure checks described in the PWA Platform release runbook.

License: MIT.
