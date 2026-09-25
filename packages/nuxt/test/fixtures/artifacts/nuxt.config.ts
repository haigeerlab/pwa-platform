// Real-Nuxt build fixture for test/artifacts.test.ts (T6's artifact pipeline). Not a deliverable. The module is
// referenced by its own src (not a built dist) so the fixture exercises the current working tree, the same way
// test/fixtures/basic/nuxt.config.ts does for T5's tests.
//
// Deliberately sets no default `nitro` key: every scenario in artifacts.test.ts supplies its own complete
// `nitro.prerender` (which pages get prerendered, and in which shape) through fixture-config.json, the same
// mechanism test/nuxt-harness.ts already uses for a scenario's `app`/`experimental` overrides. A shallow spread
// means a scenario's own `nitro` replaces this file's default outright, so there is no default to fight.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";
import type { NuxtConfig } from "nuxt/schema";
import { IDENTITY, INSTALL, POLICY } from "./pwa-config.js";

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
