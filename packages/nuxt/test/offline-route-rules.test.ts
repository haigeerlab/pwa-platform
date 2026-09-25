// The offline page's route rule and the dev-mode skip, read straight off `nuxt.options` after `loadNuxt` — no build
// needed. Added in T6 acceptance: both branches existed without a test.
import { describe, expect, it } from "vitest";
import { withLoadedFixture } from "./nuxt-harness.js";

// The artifacts fixture's policy points the offline fallback at `/offline/index.html`, so the Nuxt route is `/offline`.
const OFFLINE_ROUTE = "/offline";

describe("the offline page's route rule", () => {
  it("turns scripts off for the offline route and keeps the app's other fields on that rule", async () => {
    await withLoadedFixture(
      { routeRules: { [OFFLINE_ROUTE]: { headers: { "x-app": "kept" } } } },
      async (nuxt) => {
        const rule = nuxt.options.routeRules[OFFLINE_ROUTE] as Record<string, unknown> | undefined;
        expect(rule?.["noScripts"]).toBe(true);
        expect(rule?.["headers"]).toEqual({ "x-app": "kept" });
      },
      "artifacts",
    );
  });

  it("keeps the app's explicit noScripts: false instead of overriding it", async () => {
    await withLoadedFixture(
      { routeRules: { [OFFLINE_ROUTE]: { noScripts: false } } },
      async (nuxt) => {
        const rule = nuxt.options.routeRules[OFFLINE_ROUTE] as Record<string, unknown> | undefined;
        expect(rule?.["noScripts"]).toBe(false);
      },
      "artifacts",
    );
  });

  it("leaves route rules alone in dev, where the artifact pipeline does not run", async () => {
    await withLoadedFixture(
      {},
      async (nuxt) => {
        expect(nuxt.options.dev).toBe(true);
        const rule = nuxt.options.routeRules[OFFLINE_ROUTE] as Record<string, unknown> | undefined;
        expect(rule?.["noScripts"]).toBeUndefined();
      },
      "artifacts",
      true,
    );
  });
});
