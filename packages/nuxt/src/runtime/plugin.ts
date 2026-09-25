// Runs on BOTH sides (registered by src/index.ts without a `mode` restriction — NuxtPlugin's own default is "all",
// verified below): the virtual module is now resolved in both the client and server Vite builds too (src/index.ts
// dropped its `applyToEnvironment` restriction), so `import.meta.server`/`import.meta.client` — Nuxt/Vite's own
// build-time defines, applied to every module the build processes, not only an app's own source — pick the right
// half of this file per environment. Verified on a real build: the server chunk contains no
// `bindClientToRuntimeBase` and no `useRuntimeConfig().app.baseURL` read — this file's own client branch is
// genuinely gone from it — while the client chunk does. `createPwaClient`'s own function *definition* still shows
// up in the server bundle (it is `@pwa-platform/vue`'s own `createPwa()` that references it as a fallback,
// unconditionally, not specific to this file's dead-code-eliminated branch); it is never *called* there, since
// `createPwa()`'s own `typeof window === "undefined"` check returns before reaching that line. Harmless dead code
// on the server's actual path, not a correctness issue — recorded here so a future reader who greps for it is not
// misled the way an earlier draft of this comment was.
//
// Registration stays the application's own call (ADR-0013) on the client — this plugin never calls register()
// itself, it only makes `usePwa()` available. On the server there is nothing to register at all: no service
// worker, no facade, just the Vue binding's own SSR-safety path (ADR-0016), which is the whole point of T7b — a
// page component can now call `usePwa()` unconditionally, on either side, without crashing prerendering (T7's own
// finding, reported rather than fixed at the time; fixed here).
//
// Imported from "nuxt/app" rather than relying on auto-imports: this file ships compiled inside node_modules, and
// unimport's auto-import transform is not guaranteed to reach files outside an app's own source directories.
import { createPwaClient } from "@pwa-platform/client-runtime";
import { createPwa } from "@pwa-platform/vue";
import { defineNuxtPlugin, useRuntimeConfig, type Plugin } from "nuxt/app";
import virtualModule from "virtual:pwa-platform/nuxt";
import { bindClientToRuntimeBase } from "./binding.js";

// A typed intermediate, not `export default defineNuxtPlugin(...)` directly: isolatedDeclarations cannot name a
// default export's type from an unannotated call expression, even with defineNuxtPlugin's generic pinned.
const plugin: Plugin<Record<string, unknown>> = defineNuxtPlugin<Record<string, unknown>>((nuxtApp) => {
  const { config } = virtualModule;

  if (import.meta.server) {
    // Server: only the Vue binding's own SSR-safety path — no facade (`options.client` stays undefined, so
    // createPwa's own `typeof window === "undefined"` branch provides the initial-state, method-rejecting
    // binding), no runtime mountPath check (nothing to compare the server's own baseURL against — the client
    // re-does this check once it boots), no browser API.
    nuxtApp.vueApp.use(createPwa({ config }));
    return;
  }

  const { mountPath } = virtualModule;
  // `RuntimeConfig["app"]` only gets its real shape from an app's own generated `.nuxt/types`, which a library
  // package never has; the field is there at runtime (Nuxt always sets it), so this names the one field read here
  // rather than widening the whole runtime config.
  const runtimeApp = useRuntimeConfig().app as { readonly baseURL: string };
  const client = bindClientToRuntimeBase(createPwaClient({ config }), runtimeApp.baseURL, mountPath);
  nuxtApp.vueApp.use(createPwa({ config, client }));
});

export default plugin;
