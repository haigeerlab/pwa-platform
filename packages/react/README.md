# @pwa-platform/react

React 19 binding for PWA Platform. `PwaProvider` owns one browser lifecycle facade for its subtree, `usePwa()`
exposes install/update state and actions, and an optional accessible update notice handles the confirmation flow.
Configure build artifacts separately with `@pwa-platform/vite`.

## Install

```sh
npm install @pwa-platform/react @pwa-platform/vite
```

Add `@pwa-platform/vite/virtual` to `compilerOptions.types`, then mount the provider:

```tsx
// main.tsx
import config from "virtual:pwa-config";
import { PwaProvider } from "@pwa-platform/react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <PwaProvider config={config} updateCheck={{ intervalMs: 30 * 60_000 }}>
    <App />
  </PwaProvider>,
);
```

Register from a browser effect, normally only in production:

```tsx
import { useEffect } from "react";
import { usePwa } from "@pwa-platform/react";

export function PwaActions() {
  const pwa = usePwa();

  useEffect(() => {
    if (import.meta.env.PROD) void pwa.register();
  }, [pwa.register]);

  return (
    <>
      {pwa.state.installEligible && (
        <button onClick={() => void pwa.promptInstall()}>安装应用</button>
      )}
      {pwa.state.updateWaiting && (
        <button onClick={() => void pwa.applyUpdate()}>更新应用</button>
      )}
    </>
  );
}
```

`usePwa()` returns `registered`, `installEligible`, `installed` and `updateWaiting` in `state`, plus `register()`,
`promptInstall()`, `checkForUpdate()`, `applyUpdate()` and `logout()`. It throws outside a provider. Server rendering
receives the initial all-false state; methods reject until called after hydration.

## Optional update notice

```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

export function App() {
  return (
    <>
      <YourRoutes />
      <PwaUpdateNotice
        position="bottom-right"
        messages={{ readyTitle: "发现新版本", update: "立即更新", later: "稍后" }}
        colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#fff" }}
        reloadPage={() => location.reload()}
      />
    </>
  );
}
```

The notice is opt-in and non-modal. Positions are `bottom-right`, `bottom-center`, `top-right` and `top-center`.
`locale` selects the built-in copy (`"zh-CN"`, the default, or `"en"`); `messages` overrides individual keys on top of it; `colors` controls surface, text, muted text, border and primary
button colors. CSS variables prefixed with `--pwa-update-` provide deeper theming. `reloadPage` runs only after
worker takeover and an explicit click, allowing the host to protect unsaved work.

## Lifecycle boundaries

- Do not pass both `client` and `updateCheck`; an injected facade is already configured and the provider throws.
- The provider creates/disposes the facade in an effect and remains safe under React Strict Mode.
- `applyUpdate()` changes the controlling worker but never reloads the page unless the host or notice does it.
- `logout()` returns the cleanup result but does not reset the binding's `registered` snapshot. Recreate/reload the
  provider if its UI must reflect an unregistered worker immediately.
- The binding intentionally does not expose raw event subscription. Use `@pwa-platform/client-runtime` directly
  only when lifecycle telemetry such as `served-from-cache` is required.

See the [React quick start](https://github.com/haigeerlab/pwa-platform/blob/main/website/start/react.md) and
[update prompt guide](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/update-prompt.md).
