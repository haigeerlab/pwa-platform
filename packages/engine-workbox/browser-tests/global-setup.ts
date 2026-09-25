import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import { injectPrecacheManifest } from "../src/build/index.js";
import {
  BUILD_ROOT,
  BUNDLE_ROOT,
  MISSING_ENTRY_PLAN,
  MISSING_ENTRY_WORKER_URL,
  PACKAGE_ROOT,
  PLAN,
  PLAN_V2,
  PRECACHE_CACHE_NAME,
  SITE_ROOT,
  SITE_SOURCE,
  SITE_V2_ROOT,
  SITE_V2_SOURCE,
  WORKER_ENTRY,
  WORKER_URL,
} from "./fixture-site.js";

const BUNDLE_FILE = "precache-worker.js";

/**
 * Bundles the test worker into one classic script, then writes both versions of the fixture site with that bundle
 * injected once per plan, in the order ADR-0011 prescribes: bundle the worker, then inject the manifest.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  await cp(SITE_SOURCE, SITE_ROOT, { recursive: true });
  await cp(SITE_SOURCE, SITE_V2_ROOT, { recursive: true });
  await cp(SITE_V2_SOURCE, SITE_V2_ROOT, { recursive: true, force: true });

  await build({
    configFile: false,
    root: PACKAGE_ROOT,
    envDir: false,
    publicDir: false,
    logLevel: "warn",
    define: {
      // Workbox guards its development logging with process.env.NODE_ENV, which does not exist in a worker.
      "process.env.NODE_ENV": JSON.stringify("production"),
      __PWA_PRECACHE_CACHE_NAME__: JSON.stringify(PRECACHE_CACHE_NAME),
    },
    build: {
      outDir: BUNDLE_ROOT,
      emptyOutDir: true,
      copyPublicDir: false,
      // Unminified, so `self.__WB_MANIFEST` stays verbatim for the injection below.
      minify: false,
      sourcemap: false,
      lib: { entry: WORKER_ENTRY, formats: ["iife"], name: "pwaPrecacheWorker", fileName: () => BUNDLE_FILE },
    },
  });

  const bundle = await readFile(join(BUNDLE_ROOT, BUNDLE_FILE), "utf8");
  assertSelfContained(bundle);
  await writeFile(join(SITE_ROOT, WORKER_URL.slice(1)), injectPrecacheManifest(bundle, PLAN));
  await writeFile(join(SITE_ROOT, MISSING_ENTRY_WORKER_URL.slice(1)), injectPrecacheManifest(bundle, MISSING_ENTRY_PLAN));
  await writeFile(join(SITE_V2_ROOT, WORKER_URL.slice(1)), injectPrecacheManifest(bundle, PLAN_V2));
}

/** A classic worker script can neither resolve modules nor read process.env, so fail here rather than in Chrome. */
function assertSelfContained(bundle: string): void {
  const leftovers: readonly (readonly [RegExp, string])[] = [
    [/^\s*(?:import|export)\b/m, "a module import or export"],
    [/\bimport\s*\(/, "a dynamic import"],
    [/\brequire\s*\(/, "a require call"],
    [/\bprocess\.env\b/, "a process.env reference"],
  ];
  const found = leftovers.filter(([pattern]) => pattern.test(bundle)).map(([, label]) => label);
  if (found.length > 0) throw new Error(`The bundled test worker is not self-contained: ${found.join(", ")}`);
}
