# @pwa-platform/react

React 19 binding for PWA Platform.

Use `PwaProvider` and `usePwa()` in a React 19 application. Also configure `@pwa-platform/vite` for build artifacts.

The current source adds an opt-in update notice (not present in the published `0.1.0-beta.1`):

```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

<PwaProvider config={config}>
  <App />
  <PwaUpdateNotice />
</PwaProvider>
```

The default is a non-modal bottom-right card. `position` also accepts `bottom-center`, `top-right`, and `top-center`; `messages` overrides Chinese copy. Use `colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }}` for simple brand colors; `surface`, `text`, `mutedText`, and `border` are also available. Inherited `--pwa-update-*` CSS variables control the remaining appearance; `colors` takes precedence for values it sets. `reloadPage` can replace the final reload action when the application must protect unsaved work. Only a click on “刷新页面” calls it. The component does not register the worker; the application still calls `register()` and may configure `updateCheck` for long-lived pages.

This is a `0.1.0` prerelease. It provides online use, installation integration, static precaching, a safe offline fallback, and controlled updates. It does not enable runtime business API caching, private data caching, automatic write replay, or Push for applications. Production deployment requires the application and infrastructure checks described in the PWA Platform release runbook.

License: MIT.
