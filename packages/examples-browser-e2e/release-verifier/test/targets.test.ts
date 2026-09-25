import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLOUDFLARE_TARGETS, projectFor, registryOrigin } from "../targets.ts";

// Keeps this registry in sync with scripts/build-cloudflare-site.mjs's own `targets` map without importing an .mjs
// script into a .ts module: reads its source text and checks the same target -> project pairing appears there.
const buildScriptSource = readFileSync(new URL("../../../../scripts/build-cloudflare-site.mjs", import.meta.url), "utf8");

describe("targets registry", () => {
  it.each(CLOUDFLARE_TARGETS)("agrees with build-cloudflare-site.mjs's project name for %s", (target) => {
    expect(buildScriptSource).toContain(`${target}: { project: "${projectFor(target)}"`);
  });

  it("builds the main-slot origin from the project's own pages.dev domain", () => {
    expect(registryOrigin("react", "main")).toBe("https://pwa-platform-react-demo.pages.dev");
    expect(registryOrigin("vue", "main")).toBe("https://pwa-platform-vue-demo.pages.dev");
  });

  it("builds the drill-slot origin from the drill preview alias", () => {
    expect(registryOrigin("react", "drill")).toBe("https://drill.pwa-platform-react-demo.pages.dev");
    expect(registryOrigin("vue", "drill")).toBe("https://drill.pwa-platform-vue-demo.pages.dev");
  });
});
