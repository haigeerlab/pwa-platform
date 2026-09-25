// Shared helper for the real-Nuxt tests (nuxt-build.test.ts, base-url.test.ts's build-time check, artifacts.test.ts):
// copies a fixture app into a fresh directory per scenario and runs it through loadNuxt/buildNuxt. Defaults to the
// "basic" fixture (T5); artifacts.test.ts passes "artifacts" (T6), a richer app with prerendered and denied pages.
//
// The copy lands inside this package (test/fixtures/.tmp-<random>/), not under the OS tmp dir: `loadNuxt` resolves
// the "nuxt" package itself by walking up `node_modules` from its `cwd`, and a directory outside the monorepo has
// no such chain to walk. Landing it as a sibling of test/fixtures/basic/ keeps each fixture's own
// "../../../src/index.ts" module reference (three levels up to packages/nuxt/) correct after the copy, since both
// live at the same depth.
//
// Per-scenario config (a baseURL override, an explicit `experimental` setting) is written as a JSON file the copied
// nuxt.config.ts reads and spreads into its own `defineNuxtConfig({...})` call, rather than passed through
// `loadNuxt`'s own `overrides` option. `loadNuxt`'s overrides merge into the final resolved `nuxt.options` without
// ever appearing in `nuxt.options._layers[*].config` (measured: an override there left every layer's
// `config.experimental` `undefined`), so they cannot exercise the module's "did the app explicitly set this" check,
// which reads exactly that layer config. Writing the override into the fixture's own source makes it
// indistinguishable from something a real app typed into its own nuxt.config.ts.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Nuxt, NuxtConfig } from "nuxt/schema";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Copies the named fixture app, seeds fixture-config.json, runs `use`, and always removes the copy afterwards. */
async function withFixtureCopy<T>(fixture: string, appConfig: Record<string, unknown>, use: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(FIXTURES_DIR, ".tmp-"));
  try {
    cpSync(join(FIXTURES_DIR, fixture), dir, { recursive: true });
    writeFileSync(join(dir, "fixture-config.json"), JSON.stringify(appConfig));
    return await use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Loads (but does not build) the fixture with the given config, closing it afterwards. Fixture defaults to "basic".
 *
 * `overrides` — unlike `appConfig` — is handed straight to `loadNuxt`'s own `overrides` option, in-process, rather
 * than round-tripped through fixture-config.json: JSON cannot carry a function, so a scenario that needs a real
 * hook (base-url.test.ts's re-assert-at-build-time case, 评审第 2 项 — a `modules:done` handler that mutates
 * `app.baseURL` after this module's own setup already ran) has no other way to register one.
 */
export async function withLoadedFixture<T>(
  appConfig: Record<string, unknown>,
  use: (nuxt: Nuxt) => Promise<T>,
  fixture = "basic",
  dev = false,
  overrides?: Partial<NuxtConfig>,
): Promise<T> {
  return withFixtureCopy(fixture, appConfig, async (dir) => {
    const { loadNuxt } = await import("nuxt/kit");
    // `dev` is a loadNuxt option, not a config key: setting `dev: true` in the app config alone leaves Nuxt in build mode.
    const nuxt = await loadNuxt({ cwd: dir, dotenv: false, dev, overrides });
    try {
      return await use(nuxt);
    } finally {
      await nuxt.close();
    }
  });
}

/** Loads and builds the fixture with the given config, returning the built `.output/public` directory. Fixture defaults to "basic". */
export async function withBuiltFixture<T>(
  appConfig: Record<string, unknown>,
  use: (publicDir: string, nuxt: Nuxt) => Promise<T>,
  fixture = "basic",
  overrides?: Partial<NuxtConfig>,
): Promise<T> {
  return withLoadedFixture(
    appConfig,
    async (nuxt) => {
      const { buildNuxt } = await import("nuxt/kit");
      await buildNuxt(nuxt);
      return use(join(nuxt.options.rootDir, ".output", "public"), nuxt);
    },
    fixture,
    false,
    overrides,
  );
}
