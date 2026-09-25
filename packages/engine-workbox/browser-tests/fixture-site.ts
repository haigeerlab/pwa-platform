import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cacheName, validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const PACKAGE_ROOT: string = here("../");
/** Static files of the fixture site; copied into `SITE_ROOT` next to the bundled workers. */
export const SITE_SOURCE: string = here("./site/");
/** Files that differ in v2 of the site; copied over the v1 files into `SITE_V2_ROOT`. */
export const SITE_V2_SOURCE: string = here("./site-v2/");
export const WORKER_ENTRY: string = here("./worker/precache-worker.ts");
/** Git-ignored output of global-setup.ts. */
export const BUILD_ROOT: string = here("../browser-build/");
export const BUNDLE_ROOT: string = here("../browser-build/bundle/");
/** Directories served by the fixture server during the browser tests. */
export const SITE_ROOT: string = here("../browser-build/site/");
export const SITE_V2_ROOT: string = here("../browser-build/site-v2/");

/** Worker built with `PLAN` in v1 of the site and with `PLAN_V2` in v2. */
export const WORKER_URL = "/sw.js";
/** Worker built with `MISSING_ENTRY_PLAN` (v1 only). */
export const MISSING_ENTRY_WORKER_URL = "/sw-missing-entry.js";
/** Precache entry the fixture site does not serve, so the server answers 404. */
export const MISSING_ENTRY_URL = "/assets/missing.css";

export const FIXTURE_SITE: FixtureServerOptions = { versions: { v1: SITE_ROOT, v2: SITE_V2_ROOT } };

function loadPlan(): PwaPlan {
  const result = validatePlan(JSON.parse(readFileSync(here("./fixtures/precache.plan.json"), "utf8")));
  if (!result.ok) throw new Error(`Invalid fixture plan: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  return result.value;
}

export const PLAN: PwaPlan = loadPlan();

export const MISSING_ENTRY_PLAN: PwaPlan = {
  ...PLAN,
  precache: [...PLAN.precache, { url: MISSING_ENTRY_URL, revision: "0f1e2d3c4b5a6978" }],
};

/** The next deployment: the fingerprinted app bundle is replaced, the logo gets a new revision, offline.html is unchanged. */
export const PLAN_V2: PwaPlan = {
  ...PLAN,
  precache: [
    { url: "/assets/app.9e8d7c6b.js", revision: null },
    { url: "/assets/logo.svg", revision: "b2c3d4e5f6071829" },
    { url: "/offline.html", revision: "7d793037a0760186" },
  ],
};

export const PRECACHE_CACHE_NAME: string = cacheName(PLAN.identity, "precache");
