// Real Nuxt 4.5.x production builds (T1's spike proved the approach; this pins the module's own behaviour to it).
// Slow on purpose — two full builds — but nothing here is faked: the assertions read files a real build produced.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PwaInstallMetadata } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { IDENTITY, INSTALL, POLICY } from "./fixtures/basic/pwa-config.js";
import { withBuiltFixture, withLoadedFixture } from "./nuxt-harness.js";

/** Every `.js` file under a directory tree, read as UTF-8 and concatenated — good enough to grep for a marker. */
function clientBundleText(publicDir: string): string {
  const nuxtDir = join(publicDir, "_nuxt");
  const chunks: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) visit(path);
      else if (name.name.endsWith(".js")) chunks.push(readFileSync(path, "utf8"));
    }
  };
  visit(nuxtDir);
  return chunks.join("\n");
}

/**
 * Whether Nuxt's own `nuxt:<name>` plugin is present in a built client bundle.
 *
 * Not a plain substring check: `nuxt:chunk-reload-crawler` is Nuxt's own *separate* plugin, gated by
 * `experimental.emitRouteChunkError` being merely truthy rather than specifically `"automatic"` — so it is present
 * even under this module's "manual" default (measured), and `bundle.includes("nuxt:chunk-reload")` would read that
 * as the automatic-reload plugin being on. The negative lookahead excludes it (and `-immediate`) while still
 * matching the bare name, regardless of whether the minifier quotes it or uses a template literal.
 */
function hasNuxtPlugin(bundle: string, name: string): boolean {
  return new RegExp(`nuxt:${name}(?!-)`).test(bundle);
}

describe("real Nuxt build: default settings", () => {
  it(
    "builds, resolves the virtual module in the client build, and leaves both reload plugins off",
    async () => {
      await withBuiltFixture({}, async (publicDir) => {
        const bundle = clientBundleText(publicDir);

        // The virtual module's serialised config, proving it was resolved (client-only) and bundled into the
        // client build, not merely present as an unresolved import. Not asserted as a JSON-quoted substring: the
        // production minifier both drops quotes from object keys that are valid identifiers and switches string
        // values to template literals (measured: `{config:{appId:\`nuxtfixture\`,scope:\`/app/\`,...`).
        expect(bundle).toContain("appId");
        expect(bundle).toContain("nuxtfixture");
        expect(bundle).toContain("/app/");

        // Checkpoint A: auto-reload defaults off unless the app set them explicitly (design section 5).
        expect(hasNuxtPlugin(bundle, "chunk-reload")).toBe(false);
        expect(hasNuxtPlugin(bundle, "check-outdated-build")).toBe(false);
        // Nuxt still includes the crawler-targeted variant whenever emitRouteChunkError is merely truthy (not
        // `false`) — "manual" leaves it on, and this pins that it is really there rather than the check above
        // passing because nothing named "chunk-reload" matched at all.
        expect(hasNuxtPlugin(bundle, "chunk-reload-crawler")).toBe(true);
      });
    },
    180_000,
  );
});

describe("real Nuxt build: explicit experimental.emitRouteChunkError", () => {
  it(
    "keeps the chunk-reload plugin when the app explicitly asks for automatic reload",
    async () => {
      await withBuiltFixture({ experimental: { emitRouteChunkError: "automatic" } }, async (publicDir) => {
        const bundle = clientBundleText(publicDir);
        expect(hasNuxtPlugin(bundle, "chunk-reload")).toBe(true);
        // The app only set emitRouteChunkError, not checkOutdatedBuildInterval, so the module's own default for
        // the untouched setting still applies.
        expect(hasNuxtPlugin(bundle, "check-outdated-build")).toBe(false);
      });
    },
    180_000,
  );
});

describe("manifest extension fields (contracts-foundation's 修订：安装元数据的扩展字段) in a real Nuxt build", () => {
  it(
    "writes screenshots and shortcuts whose files exist in the public directory into the emitted manifest",
    async () => {
      const install: PwaInstallMetadata = {
        ...INSTALL,
        screenshots: [{ src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide" }],
        shortcuts: [
          {
            name: "Cart",
            url: "/app/cart",
            icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
          },
        ],
      };
      await withBuiltFixture({ pwaPlatform: { identity: IDENTITY, policy: POLICY, install } }, async (publicDir) => {
        const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8")) as {
          screenshots?: unknown;
          shortcuts?: unknown;
        };
        expect(manifest.screenshots).toEqual([
          { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide" },
        ]);
        expect(manifest.shortcuts).toEqual([
          {
            name: "Cart",
            url: "/app/cart",
            icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
          },
        ]);
      });
    },
    180_000,
  );

  it(
    "fails the build when a declared screenshot file is missing from the published output",
    async () => {
      const install: PwaInstallMetadata = {
        ...INSTALL,
        screenshots: [{ src: "/app/screenshots/missing.png", sizes: "1280x800", type: "image/png", formFactor: "wide" }],
      };
      await expect(
        withBuiltFixture({ pwaPlatform: { identity: IDENTITY, policy: POLICY, install } }, async () => undefined),
      ).rejects.toThrow(/verify\.manifest-asset-missing/);
    },
    180_000,
  );
});

describe("auto-reload defaults (loadNuxt only, no bundling needed to read nuxt.options)", () => {
  it("defaults both settings to the platform's values when the app sets neither", async () => {
    await withLoadedFixture({}, async (nuxt) => {
      expect(nuxt.options.experimental.emitRouteChunkError).toBe("manual");
      expect(nuxt.options.experimental.checkOutdatedBuildInterval).toBe(false);
    });
  });

  it("keeps the app's explicit emitRouteChunkError instead of overriding it", async () => {
    await withLoadedFixture({ experimental: { emitRouteChunkError: "automatic" } }, async (nuxt) => {
      expect(nuxt.options.experimental.emitRouteChunkError).toBe("automatic");
      // The untouched setting still gets the module's default.
      expect(nuxt.options.experimental.checkOutdatedBuildInterval).toBe(false);
    });
  });

  it("keeps the app's explicit checkOutdatedBuildInterval instead of overriding it", async () => {
    await withLoadedFixture({ experimental: { checkOutdatedBuildInterval: 60_000 } }, async (nuxt) => {
      expect(nuxt.options.experimental.checkOutdatedBuildInterval).toBe(60_000);
      expect(nuxt.options.experimental.emitRouteChunkError).toBe("manual");
    });
  });

  it("treats explicit false as set too (a falsy-but-explicit value must not read as unset)", async () => {
    await withLoadedFixture({ experimental: { emitRouteChunkError: false } }, async (nuxt) => {
      expect(nuxt.options.experimental.emitRouteChunkError).toBe(false);
    });
  });

  // 评审第 12 项: applyReloadDefaults used to run unconditionally, changing Nuxt's own HMR chunk-error behaviour
  // even in dev, where none of the production update-confirmation model (ADR-0013) these overrides exist for
  // applies. Nuxt's own schema defaults (@nuxt/schema: emitRouteChunkError -> "automatic",
  // checkOutdatedBuildInterval -> 3_600_000) are asserted directly, in the same withLoadedFixture(..., fixture,
  // dev) style test/offline-route-rules.test.ts's own dev case uses for the route-rules half of this module.
  it("leaves Nuxt's own defaults alone in dev, where the platform's reload overrides do not apply", async () => {
    await withLoadedFixture(
      {},
      async (nuxt) => {
        expect(nuxt.options.dev).toBe(true);
        expect(nuxt.options.experimental.emitRouteChunkError).toBe("automatic");
        expect(nuxt.options.experimental.checkOutdatedBuildInterval).toBe(3_600_000);
      },
      "basic",
      true,
    );
  });
});
