import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PwaTopology } from "@pwa-platform/contracts";
import { build } from "vite";
import { pwa } from "../src/index.js";
import {
  BUILD_ROOT,
  CHILD_APP_ROOT,
  CHILD_IDENTITY,
  CHILD_POLICY,
  CHILD_RECOVERY_ROOT,
  CHILD_TOPOLOGY,
  PLAIN_CHILD_PAGE,
  ROOT_APP_ROOT,
  ROOT_IDENTITY,
  ROOT_ONLY_ROOT,
  ROOT_POLICY,
  ROOT_RECOVERY_MUTATED_ROOT,
  ROOT_RECOVERY_ROOT,
  ROOT_TOPOLOGY,
  SHARED_ROOT,
  STANDALONE_ROOT,
  STANDALONE_TOPOLOGY,
} from "./shared-origin-fixture-site.js";

/**
 * Builds T7's shared-origin fixture: one root app and one child app, both compiled by the real `pwa()` plugin
 * against one registry, merged into a single served origin (root at the site root, child under `/m/`).
 *
 * Nothing here is placed by hand except the two mutation-only recovery-worker swaps and the root-only site's plain
 * `/m/` page — everything else comes straight out of a real Vite build, the same stance browser-tests/global-setup.ts
 * takes for the standalone fixture.
 */
export default async function sharedOriginGlobalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });

  // The normal, merged site: root excludes `/m`, the child's own worker actually lives there.
  await buildRoot(SHARED_ROOT, ROOT_TOPOLOGY);
  await buildChild(join(SHARED_ROOT, "m"));
  // The root build placed `m/root-leftover.json` (from its own public dir) before the child build ran, which is
  // what let the root's own compiler see it and exclude it from the root's precache (T3's warning, checked again
  // here at runtime by T7 scenario 3). The child build's `emptyOutDir` on this same directory then wiped it, so it
  // is copied back in now, after both builds, purely so the merged site still serves the URL the test fetches —
  // this has no effect on either app's already-compiled plan or worker.
  await cp(join(ROOT_APP_ROOT, "public/m/root-leftover.json"), join(SHARED_ROOT, "m/root-leftover.json"));

  // Same root, but the child was never deployed: a plain page at `/m/`, no worker, no manifest.
  await buildRoot(ROOT_ONLY_ROOT, ROOT_TOPOLOGY);
  await mkdir(join(ROOT_ONLY_ROOT, "m"), { recursive: true });
  await writeFile(join(ROOT_ONLY_ROOT, "m/index.html"), PLAIN_CHILD_PAGE, "utf8");

  // Mutation-only: the root built without a registry at all, so it never excludes `/m` (scenarios 3 and 4).
  await buildRoot(STANDALONE_ROOT, STANDALONE_TOPOLOGY);
  await buildChild(join(STANDALONE_ROOT, "m"));

  // Recovery variants, each a copy of the real merged site with one worker script swapped for a recovery worker.
  await cp(SHARED_ROOT, ROOT_RECOVERY_ROOT, { recursive: true });
  await overwrite(join(ROOT_RECOVERY_ROOT, "sw.js"), join(ROOT_RECOVERY_ROOT, "pwa-recovery-worker.js"));

  await cp(SHARED_ROOT, CHILD_RECOVERY_ROOT, { recursive: true });
  await overwrite(join(CHILD_RECOVERY_ROOT, "m/sw.js"), join(CHILD_RECOVERY_ROOT, "m/pwa-recovery-worker.js"));

  // Mutation-only: the child's recovery worker published at the root's own URL (scenario 5).
  await cp(SHARED_ROOT, ROOT_RECOVERY_MUTATED_ROOT, { recursive: true });
  await overwrite(join(ROOT_RECOVERY_MUTATED_ROOT, "sw.js"), join(ROOT_RECOVERY_MUTATED_ROOT, "m/pwa-recovery-worker.js"));
}

async function buildRoot(outDir: string, topology: PwaTopology): Promise<void> {
  await build({
    configFile: false,
    root: ROOT_APP_ROOT,
    base: "/",
    envDir: false,
    logLevel: "error",
    build: { outDir, emptyOutDir: true, minify: false, sourcemap: false },
    plugins: [pwa({ identity: ROOT_IDENTITY, policy: ROOT_POLICY, install: null, topology })],
  });
}

async function buildChild(outDir: string): Promise<void> {
  await build({
    configFile: false,
    root: CHILD_APP_ROOT,
    base: "/m/",
    envDir: false,
    logLevel: "error",
    build: { outDir, emptyOutDir: true, minify: false, sourcemap: false },
    plugins: [pwa({ identity: CHILD_IDENTITY, policy: CHILD_POLICY, install: null, topology: CHILD_TOPOLOGY })],
  });
}

async function overwrite(target: string, source: string): Promise<void> {
  await writeFile(target, await readFile(source));
}
