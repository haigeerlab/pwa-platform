// T7b (spec decision 18): the virtual module and the runtime plugin now run on both sides, so a page component can
// call usePwa() directly during SSR/prerendering without crashing (T7's own finding — reported at the time, fixed
// here). Real build, not a mock: prerendering the "artifacts" fixture's index page (test/fixtures/artifacts/app/pages/index.vue,
// which calls usePwa() unguarded) is itself proof the build does not crash; this also reads the emitted HTML back to
// confirm the binding served the initial state, not merely "did not throw".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withBuiltFixture } from "./nuxt-harness.js";

const FIXTURE = "artifacts";
const BUILD_TIMEOUT = 180_000;

describe("server-side Vue binding (T7b)", () => {
  it(
    "prerenders a page that calls usePwa() unguarded, and the HTML carries the initial state",
    async () => {
      await withBuiltFixture(
        { nitro: { prerender: { routes: ["/", "/about", "/offline"] } } },
        async (publicDir) => {
          const html = readFileSync(join(publicDir, "index.html"), "utf8");
          // data-registered="false": the server-side binding never creates a facade (no window), so the state it
          // reports is client-runtime's own INITIAL_STATE, not merely "some truthy-looking placeholder".
          expect(html).toContain('data-registered="false"');
          expect(html).toContain('id="pwa-state"');
        },
        FIXTURE,
      );
    },
    BUILD_TIMEOUT,
  );
});
