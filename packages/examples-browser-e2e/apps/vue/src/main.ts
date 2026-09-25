// The example's entry point, taking the path a real application takes: the config arrives through the virtual
// module the plugin serves, and the platform is reached only through the framework binding.
import config from "virtual:pwa-config";
import { createPwa } from "@pwa-platform/vue";
import { checkEntryRecovery, updateEntryManifest } from "@pwa-platform/entry-resilience/client";
import { createApp } from "vue";
import { SHELL_URL } from "../../shared/identity.js";
import { loadStartupEntryManifest } from "../../shared/entry-manifest-startup.js";
import { App } from "./app.js";

/** Demonstrates the recommended background check (spec: 修订：完整更新提示参考实现): every 30 minutes. */
const UPDATE_CHECK_INTERVAL_MS = 1_800_000;

const app = createApp(App);
app.use(createPwa({ config, updateCheck: { intervalMs: UPDATE_CHECK_INTERVAL_MS } }));
app.mount("#app");

// The binding itself hands out nothing on `window` on purpose: it does not expose `subscribe` — observing events is
// its job, not the application's (spec: vue-react-adapters). So an example cannot collect the raw event stream
// without reaching past the binding into client-runtime, which package boundaries forbid an application from doing.
//
// The end-to-end suite therefore observes what an event *did*: `install-eligible` arriving is what makes the
// install button appear, `update-waiting` is what makes the update prompt appear. That is also the honest thing
// to assert about an example — a user sees the interface, not an event array.
//
// The entry-resilience hooks below are the one exception, and a deliberate one (spec/examples-browser-e2e.md's
// revised "契约增量": "页面钩子常驻"). They exist so the entry-recovery drill can hand in a fresh manifest — or read
// the current recovery result — without a redeploy. A production application should NOT do this: any visitor could
// call `window.__entryUpdate` on their own browser (see the spec's "安全边界" for why that is scoped and accepted
// here, but not in general).
window.__entryUpdate = (data: unknown) => updateEntryManifest(data);
window.__entryCheck = (options?: { readonly returnPath?: string }) => checkEntryRecovery(options);

// Startup: fetch the same-origin manifest and hand it in. Stands in for a business backend's own endpoint — see
// apps/shared/entry-manifest-startup.ts's docstring. Never rejects, so it never delays or blocks the mount above.
void loadStartupEntryManifest(SHELL_URL, updateEntryManifest);
