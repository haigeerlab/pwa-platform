// T7 browser-test fixture. Not a deliverable. The module is referenced by its own src (not a built dist), same as
// test/fixtures/*/nuxt.config.ts, so the browser suite exercises the current working tree.
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";
import type { NuxtConfig } from "nuxt/schema";
import { IDENTITY, INSTALL, POLICY } from "./pwa-config.js";

// Read once at config-evaluation time, not passed through loadNuxt's `overrides` (global-setup.ts uses `overrides`
// only for `nitro.output.dir`, which nothing reads back through _layers): the module's isExplicitlySet check
// (src/index.ts) reads `nuxt.options._layers[*].config.experimental`, which an override passed through loadNuxt's
// `overrides` parameter never populates (test/nuxt-harness.ts records the same finding). Setting it here, in this
// layer's own defineNuxtConfig call, is indistinguishable from an application that wrote it itself.
const autoReload = process.env["NUXT_E2E_AUTO_RELOAD"] === "1";
// Read the same way: whatever this evaluates to becomes a literal property of the `pwaPlatform` object below, so
// the module reads it exactly as it would read an application's own explicit setting (T7b, spec decision 19).
const recoveryRelease = process.env["NUXT_E2E_RECOVERY_RELEASE"] === "1";

// `nitro` (and, conditionally, `experimental`) are assembled here and spread in below, not written as literal
// properties of the defineNuxtConfig call: `nuxt/schema`'s own `NuxtConfig` type does not declare `nitro` unless
// nitropack's config typing is pulled into the program (it is not, here), so a literal `nitro: {...}` fails a
// excess-property check — the same reason test/fixtures/artifacts/nuxt.config.ts keeps its own `nitro` override
// out of its defineNuxtConfig literal, spreading it from a separately-typed value instead. The `as unknown as`
// cast (rather than a `Partial<NuxtConfig>` annotation, which still excess-property-checks a literal assigned to
// it directly) is what actually clears the check.
const extra = {
  // /news and /account are deliberately absent: unlisted pages render at request time (T1 record), which is what
  // makes them the request-time public and private pages the scenarios need. /lazy is absent for the same reason,
  // plus it must stay a genuine client-only chunk for reload.spec.ts.
  nitro: { prerender: { routes: ["/", "/about", "/offline"] } },
  ...(autoReload ? { experimental: { emitRouteChunkError: "automatic" as const } } : {}),
} as unknown as Partial<NuxtConfig>;

const config: NuxtConfig = defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  telemetry: false,
  modules: [fileURLToPath(new URL("../../src/index.ts", import.meta.url))],
  devtools: { enabled: false },
  app: { baseURL: "/app/" },
  ...extra,
  pwaPlatform: { identity: IDENTITY, policy: POLICY, install: INSTALL, recoveryRelease },
});

export default config;
