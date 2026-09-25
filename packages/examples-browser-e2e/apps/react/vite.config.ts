import { fileURLToPath } from "node:url";
import { pwa } from "@pwa-platform/vite";
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";
import { defineConfig, type UserConfig } from "vite";
import { POLICY, SHELL_URL } from "../shared/identity.js";
import { identityForCloudflare, installForCloudflare } from "../shared/cloudflare-identity.js";
import { cloudflarePlanCapture } from "../shared/cloudflare-plan-capture.js";

// The same build a consumer would write, and deliberately the same one the Vue example uses apart from its root
// and the recovery page's host CSS below: identical identity, policy and install metadata, so the end-to-end suite
// compares two bindings rather than two configurations.
//
// No @vitejs/plugin-react: Vite's own esbuild compiles JSX to react/jsx-runtime calls, which is all this needs.
//
// Computed once and reused by both plugins below: spec/examples-browser-e2e.md's revised "契约增量" requires
// `pwaEntryResilience`'s `identity` to be the same object `pwa()` uses, not merely an equal one.
const identity = identityForCloudflare("react");

// The one thing the two examples deliberately differ in. spec/pwa-entry-resilience.md's "宿主定制" says a host
// reskins the recovery page by overriding custom properties and nothing else; React exercises that path while Vue
// keeps the platform default, so the pair shows both halves of the contract on real sites. Note that each theme is
// written separately — the media query is "the system is dark", the attribute is "the app asked for dark" — which
// is the spec's selector contract. Overriding only inside the media query would leave an app that calls
// `setPwaTheme("dark")` on a light system showing the light brand colours.
const DEMO_HOST_CSS = `.pwa-entry {
  --pwa-entry-accent: #0f766e;
  --pwa-entry-bg: #fbfaf7;
  --pwa-entry-radius: 0.75rem;
}
@media (prefers-color-scheme: dark) {
  .pwa-entry:not([data-theme="light"]) {
    --pwa-entry-accent: #5eead4;
    --pwa-entry-accent-fg: #06241f;
    --pwa-entry-bg: #0c1413;
  }
}
.pwa-entry[data-theme="dark"] {
  --pwa-entry-accent: #5eead4;
  --pwa-entry-accent-fg: #06241f;
  --pwa-entry-bg: #0c1413;
}
`;

const config: UserConfig = defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: SHELL_URL,
  envDir: false,
  build: {
    minify: false,
    sourcemap: false,
  },
  plugins: [
    pwa({
      identity,
      policy: POLICY,
      install: installForCloudflare("react"),
      topology: { kind: "standalone-origin" },
      offlinePage: { locale: "en" },
    }),
    // spec/pwa-entry-resilience.md's "构建集成": runs alongside `pwa()`, never in place of it.
    pwaEntryResilience({ identity, maxValidityDays: 30, css: DEMO_HOST_CSS }),
    cloudflarePlanCapture(),
  ],
});

export default config;
