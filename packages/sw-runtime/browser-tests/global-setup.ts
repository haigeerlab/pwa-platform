import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { injectPrecacheManifest } from "@pwa-platform/engine-workbox";
import { build } from "vite";
import { injectWorkerConfig } from "../src/build/index.js";
import {
  BUILD_ROOT,
  BUNDLE_ROOT,
  CONFIG_NO_FALLBACK,
  CONFIG_EXCLUDED,
  CONFIG_RANGE,
  CONFIG_OFFLINE_WRITE,
  CONFIG_SUBPAGE,
  CONFIG_TIMEOUT,
  CONFIG_V1,
  CONFIG_V2,
  CONFIG_V2_RUNTIME_DECLARED,
  CONFIG_V3,
  CONFIG_V3_CHANGED_LIMIT,
  CONFIG_V3_SAME_CONFIG,
  EXPIRATION_RECORDS_TEST_ENTRY,
  EXPIRATION_RECORDS_TEST_URL,
  PACKAGE_ROOT,
  PLAN_NO_FALLBACK,
  PLAN_EXCLUDED,
  PLAN_RANGE,
  PLAN_OFFLINE_WRITE,
  PLAN_SUBPAGE,
  PLAN_TIMEOUT,
  PLAN_V1,
  PLAN_V2,
  PLAN_V2_RUNTIME_DECLARED,
  PLAN_V3,
  PLAN_V3_CHANGED_LIMIT,
  PLAN_V3_SAME_CONFIG,
  PLATFORM_ENTRY,
  RECOVERY_CONFIG,
  RECOVERY_ENTRY,
  SITE_NO_FALLBACK_ROOT,
  SITE_RECOVERY_ROOT,
  SITE_EXCLUDED_ROOT,
  SITE_RANGE_ROOT,
  SITE_OFFLINE_WRITE_ROOT,
  SITE_RUNTIME_SOURCE,
  SITE_SUBPAGE_ROOT,
  SITE_SOURCE,
  SITE_TIMEOUT_ROOT,
  SITE_V1_ROOT,
  SITE_V2_ROOT,
  SITE_V2_RUNTIME_DECLARED_ROOT,
  SITE_V2_SOURCE,
  SITE_V3_CHANGED_LIMIT_ROOT,
  SITE_V3_ROOT,
  SITE_V3_SAME_CONFIG_ROOT,
  WORKER_URL,
} from "./fixture-site.js";

/**
 * Builds the three served versions of the fixture site. Each worker is bundled first and injected afterwards, in the
 * order a platform build follows: the precache manifest (ADR-0011), then the sw-runtime config.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  for (const root of [
    SITE_V1_ROOT,
    SITE_V2_ROOT,
    SITE_RECOVERY_ROOT,
    SITE_NO_FALLBACK_ROOT,
    SITE_SUBPAGE_ROOT,
    SITE_EXCLUDED_ROOT,
    SITE_RANGE_ROOT,
    SITE_OFFLINE_WRITE_ROOT,
    SITE_V3_ROOT,
    SITE_V3_SAME_CONFIG_ROOT,
    SITE_V3_CHANGED_LIMIT_ROOT,
    SITE_V2_RUNTIME_DECLARED_ROOT,
    SITE_TIMEOUT_ROOT,
  ]) {
    await cp(SITE_SOURCE, root, { recursive: true });
  }
  await cp(SITE_V2_SOURCE, SITE_V2_ROOT, { recursive: true, force: true });
  // v3-same-config's precache uses v2's renamed asset/index.html (PLAN_V3_SAME_CONFIG's V3_FILES_B), so its worker is
  // byte-different from v3's even though its runtimeCache config (and configDigest) is identical.
  await cp(SITE_V2_SOURCE, SITE_V3_SAME_CONFIG_ROOT, { recursive: true, force: true });
  // T11: layer the runtime-cache fixture files (data endpoints, dynamic page) onto the v3/v2-runtime-declared roots.
  // NT6: the timeout fixture reuses the same runtime-cache rules, so it needs the same files.
  for (const root of [SITE_V3_ROOT, SITE_V3_SAME_CONFIG_ROOT, SITE_V3_CHANGED_LIMIT_ROOT, SITE_V2_RUNTIME_DECLARED_ROOT, SITE_TIMEOUT_ROOT]) {
    await cp(SITE_RUNTIME_SOURCE, root, { recursive: true, force: true });
  }

  const platform = await bundle(PLATFORM_ENTRY, "platform-worker.js");
  const recovery = await bundle(RECOVERY_ENTRY, "recovery-worker.js");

  await writeWorker(SITE_V1_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V1), CONFIG_V1));
  await writeWorker(SITE_V2_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V2), CONFIG_V2));
  await writeWorker(SITE_NO_FALLBACK_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_NO_FALLBACK), CONFIG_NO_FALLBACK));
  await writeWorker(SITE_SUBPAGE_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_SUBPAGE), CONFIG_SUBPAGE));
  await writeWorker(SITE_EXCLUDED_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_EXCLUDED), CONFIG_EXCLUDED));
  await writeWorker(SITE_RANGE_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_RANGE), CONFIG_RANGE));
  await writeWorker(SITE_OFFLINE_WRITE_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_OFFLINE_WRITE), CONFIG_OFFLINE_WRITE));
  await writeWorker(SITE_V3_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V3), CONFIG_V3));
  await writeWorker(SITE_V3_SAME_CONFIG_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V3_SAME_CONFIG), CONFIG_V3_SAME_CONFIG));
  await writeWorker(SITE_V3_CHANGED_LIMIT_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V3_CHANGED_LIMIT), CONFIG_V3_CHANGED_LIMIT));
  await writeWorker(
    SITE_V2_RUNTIME_DECLARED_ROOT,
    injectWorkerConfig(injectPrecacheManifest(platform, PLAN_V2_RUNTIME_DECLARED), CONFIG_V2_RUNTIME_DECLARED),
  );
  await writeWorker(SITE_TIMEOUT_ROOT, injectWorkerConfig(injectPrecacheManifest(platform, PLAN_TIMEOUT), CONFIG_TIMEOUT));
  // The recovery worker is published at the same service worker URL (recovery-drill.md step 2).
  await writeWorker(SITE_RECOVERY_ROOT, injectWorkerConfig(recovery, RECOVERY_CONFIG));

  // A plain page script (not a worker), served alongside v1, exposing the real deleteExpirationRecords for
  // expiration-records.spec.ts (T8 follow-up: workbox-expiration record cleanup).
  const expirationRecordsTest = await bundle(EXPIRATION_RECORDS_TEST_ENTRY, "expiration-records-test.js");
  await writeAsset(SITE_V1_ROOT, EXPIRATION_RECORDS_TEST_URL, expirationRecordsTest);
}

async function bundle(entry: string, fileName: string): Promise<string> {
  await build({
    configFile: false,
    root: PACKAGE_ROOT,
    envDir: false,
    publicDir: false,
    logLevel: "warn",
    define: {
      // Workbox guards its development logging with process.env.NODE_ENV, which does not exist in a worker.
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: BUNDLE_ROOT,
      emptyOutDir: false,
      copyPublicDir: false,
      // Unminified, so both injection points stay verbatim for the injections above.
      minify: false,
      sourcemap: false,
      lib: { entry, formats: ["iife"], name: fileName.replace(/\W/g, "_"), fileName: () => fileName },
    },
  });
  const source = await readFile(join(BUNDLE_ROOT, fileName), "utf8");
  assertSelfContained(fileName, source);
  return source;
}

async function writeWorker(root: string, source: string): Promise<void> {
  await writeAsset(root, WORKER_URL, source);
}

/** Writes a served path (worker or plain script) under a site root, creating its directory. */
async function writeAsset(root: string, url: string, source: string): Promise<void> {
  const target = join(root, url.slice(1));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, source);
}

/** A classic worker script can neither resolve modules nor read process.env, so fail here rather than in Chrome. */
function assertSelfContained(fileName: string, source: string): void {
  const leftovers: readonly (readonly [RegExp, string])[] = [
    [/^\s*(?:import|export)\b/m, "a module import or export"],
    [/\bimport\s*\(/, "a dynamic import"],
    [/\brequire\s*\(/, "a require call"],
    [/\bprocess\.env\b/, "a process.env reference"],
  ];
  const found = leftovers.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
  if (found.length > 0) throw new Error(`The bundled ${fileName} is not self-contained: ${found.join(", ")}`);
}
