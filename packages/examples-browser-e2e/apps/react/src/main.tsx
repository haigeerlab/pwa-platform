// The example's entry point, taking the path a real application takes: the config arrives through the virtual
// module the plugin serves, and the platform is reached only through the framework binding.
//
// StrictMode is kept because a real application would keep it. Its deliberate double-invocation of effects only
// happens in development builds, so the end-to-end suite — which runs production builds — does not exercise that
// path; the binding's own tests cover it instead.
import config from "virtual:pwa-config";
import { PwaProvider, usePwa } from "@pwa-platform/react";
import { checkEntryRecovery, updateEntryManifest } from "@pwa-platform/entry-resilience/client";
import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { SHELL_URL } from "../../shared/identity.js";
import { loadStartupEntryManifest } from "../../shared/entry-manifest-startup.js";
import { App } from "./app.js";

/** Demonstrates the recommended background check (spec: 修订：完整更新提示参考实现): every 30 minutes. */
const UPDATE_CHECK_INTERVAL_MS = 1_800_000;

function Root(): ReactElement {
  // The counter lives here, above the provider, on purpose: bumping it re-renders `Root`, which is what rebuilds
  // the config literal below. A counter inside `App` would re-render only `App` and prove nothing.
  const [count, setCount] = useState(0);

  return (
    <>
      {/* Spread into a fresh object, so this is `<PwaProvider config={{ ... }}>` — a new object on every render,
          which is how an application would most naturally write it. The provider depends on the config's fields
          rather than on the object, so the facade has to survive these renders; that is what the end-to-end suite
          checks, and what the binding's unit tests cannot (they have no renderer). `updateCheck` is a fresh object
          on every render for the same reason — the provider reads its `intervalMs` field, not its identity (spec:
          known limitations). */}
      <PwaProvider config={{ ...config }} updateCheck={{ intervalMs: UPDATE_CHECK_INTERVAL_MS }}>
        <Registrar />
        <App count={count} onBump={() => setCount((value) => value + 1)} />
      </PwaProvider>
      <OutsideProbe />
    </>
  );
}

/**
 * Calls `usePwa()` from outside any provider and leaves its outcome available to the browser test without presenting
 * a test-only diagnostic to example users.
 *
 * This is the one thing in the examples that exists for the test rather than for the demonstration, and it is here
 * because a unit test cannot reach it: outside a render, React's dispatcher rejects `useContext` before the
 * binding's own check ever runs. The hook is always called, and always throws, so the hook order never varies.
 */
function OutsideProbe(): ReactElement {
  let outcome: string;
  try {
    usePwa();
    outcome = "no error";
  } catch (error) {
    outcome = error instanceof Error ? error.message : String(error);
  }
  return <p id="outside-usepwa" hidden>{outcome}</p>;
}

/**
 * Registration is the application's call, not the adapter's — the binding never registers on its own. It happens
 * in an effect rather than during render because registering is a side effect, and it lives in its own component
 * so that `App` stays purely about what the user sees.
 */
function Registrar(): null {
  const { register } = usePwa();
  useEffect(() => {
    void register();
  }, [register]);
  return null;
}

const container = document.getElementById("app");
if (container === null) throw new Error("The example's mount point is missing");
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// The binding itself hands out nothing on `window` — it does not expose `subscribe`, so an example cannot collect
// the raw event stream without reaching past it into client-runtime. The suite observes what an event did —
// `install-eligible` is what makes the install button appear.
//
// The entry-resilience hooks below are the one exception, and a deliberate one (spec/examples-browser-e2e.md's
// revised "契约增量": "页面钩子常驻"). They exist so the entry-recovery drill can hand in a fresh manifest — or read
// the current recovery result — without a redeploy. A production application should NOT do this: any visitor could
// call `window.__entryUpdate` on their own browser (see the spec's "安全边界" for why that is scoped and accepted
// here, but not in general).
window.__entryUpdate = (data: unknown) => updateEntryManifest(data);
window.__entryCheck = (options?: { readonly returnPath?: string }) => checkEntryRecovery(options);

// Startup: fetch the same-origin manifest and hand it in. Stands in for a business backend's own endpoint — see
// apps/shared/entry-manifest-startup.ts's docstring. Never rejects, so it never delays or blocks the render above.
void loadStartupEntryManifest(SHELL_URL, updateEntryManifest);
