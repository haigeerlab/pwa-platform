import { fileURLToPath } from "node:url";
import { pwa } from "@pwa-platform/vite";
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";
import { defineConfig, type UserConfig } from "vite";
import { POLICY, SHELL_URL } from "../shared/identity.js";
import { identityForCloudflare, installForCloudflare } from "../shared/cloudflare-identity.js";
import { cloudflarePlanCapture } from "../shared/cloudflare-plan-capture.js";

// A real application's config, not a test harness: the example is built the way a consumer would build it, and the
// end-to-end suite later reuses this very file rather than reassembling the build in a script of its own.
//
// No @vitejs/plugin-vue: the example renders with `h()` instead of SFCs, and Vite handles that without a plugin.
// Explicitly typed rather than exported inline: `isolatedDeclarations` cannot infer a default export's type, and
// `packages/vite/playwright.config.ts` solves the same constraint the same way.
//
// Computed once and reused by both plugins below: spec/examples-browser-e2e.md's revised "契约增量" requires
// `pwaEntryResilience`'s `identity` to be the same object `pwa()` uses, not merely an equal one.
const identity = identityForCloudflare("vue");

const config: UserConfig = defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // The identity's scope. The fixture server serves a version directory as the site root, so the app lives at /app/.
  base: SHELL_URL,
  envDir: false,
  define: { __PWA_DRILL_NOTICE__: process.env.PWA_PLATFORM_CF_SLOT === "drill" },
  build: {
    // Unminified so a failing end-to-end test can be read, and so the injected precache manifest stays legible.
    minify: false,
    sourcemap: false,
  },
  plugins: [
    pwa({
      identity,
      policy: POLICY,
      install: installForCloudflare("vue"),
      topology: { kind: "standalone-origin" },
      offlinePage: { locale: "en" },
    }),
    // spec/pwa-entry-resilience.md's "构建集成": runs alongside `pwa()`, never in place of it.
    pwaEntryResilience({ identity, maxValidityDays: 30, locale: "en" }),
    cloudflarePlanCapture(),
  ],
});

export default config;
