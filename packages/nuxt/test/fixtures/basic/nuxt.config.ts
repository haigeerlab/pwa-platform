// Real-Nuxt build fixture for nuxt-build.test.ts and base-url.test.ts. Not a deliverable. The module is referenced
// by its own src (not a built dist) so the fixture exercises the current working tree, the same way
// packages/ssr-spike-nuxt referenced its local modules by path.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";
import type { NuxtConfig } from "nuxt/schema";
import { IDENTITY, INSTALL, POLICY } from "./pwa-config.js";

// Per-scenario overrides (a mismatched app.baseURL, an explicit experimental setting), written by
// test/nuxt-harness.ts before this file is loaded. Reading them here — rather than through loadNuxt's own
// `overrides` option — is what makes them show up in `nuxt.options._layers[*].config`, the same place a real app's
// own nuxt.config.ts would show up, which is exactly what the module's "did the app set this explicitly" check
// reads (see src/index.ts's applyReloadDefaults).
const overridesPath = fileURLToPath(new URL("./fixture-config.json", import.meta.url));
const scenarioOverrides: Partial<NuxtConfig> = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")) : {};

// Explicit annotation: defineNuxtConfig's own return type isn't nameable under isolatedDeclarations (its generic
// comes from c12's InputConfig, a type this package does not, and should not, depend on).
const config: NuxtConfig = defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  telemetry: false,
  modules: [fileURLToPath(new URL("../../../src/index.ts", import.meta.url))],
  devtools: { enabled: false },
  app: { baseURL: "/app/" },
  pwaPlatform: { identity: IDENTITY, policy: POLICY, install: INSTALL },
  ...scenarioOverrides,
});

export default config;
