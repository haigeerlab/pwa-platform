import { fileURLToPath } from "node:url";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const PACKAGE_ROOT: string = here("../");
/** Static files of the fixture site (checked in); copied into the served build by global-setup.ts. */
export const SITE_SOURCE: string = here("./site/");
/** The page entry's built output (`pnpm build` must have run first — plan.md T7 part D). */
export const CLIENT_ENTRY: string = here("../dist/client/index.js");

/** Git-ignored output of global-setup.ts (already covered by the root .gitignore's `browser-build/` entry). */
export const BUILD_ROOT: string = here("../browser-build/");
export const SITE_ROOT: string = here("../browser-build/site/");

export const FIXTURE_SITE: FixtureServerOptions = {
  versions: { default: SITE_ROOT },
};

/** Served paths the tests use. */
export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";
export const APP_SCOPE = "/app/";
/** A second, unrelated worker at a sibling scope (T7 part B, "a registration at a different scope"). */
export const OTHER_WORKER_URL = "/other/sw.js";
export const OTHER_SCOPE = "/other/";
