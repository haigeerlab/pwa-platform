import { cp, rm, stat } from "node:fs/promises";
import { BUILD_ROOT, CLIENT_ENTRY, SITE_ROOT, SITE_SOURCE } from "./fixture-site.js";

/**
 * Copies the static fixture site and the page entry's built output into the git-ignored browser-build/ the fixture
 * server serves. Unlike sw-runtime's global-setup.ts, this does not bundle anything itself: `src/client/index.ts`
 * imports nothing (its own file header), so its `tsc`-built `dist/client/index.js` is already a plain ES module and
 * is served as-is at /client.js. `pnpm build` (plan.md T7 part D) must already have produced dist/ before this runs.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  await cp(SITE_SOURCE, SITE_ROOT, { recursive: true });
  await assertBuilt();
  await cp(CLIENT_ENTRY, `${SITE_ROOT}client.js`);
}

async function assertBuilt(): Promise<void> {
  try {
    await stat(CLIENT_ENTRY);
  } catch {
    throw new Error(`${CLIENT_ENTRY} is missing — run "pnpm build" (or "pnpm --filter @pwa-platform/push build") first.`);
  }
}
