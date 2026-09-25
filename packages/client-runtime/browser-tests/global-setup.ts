import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { injectPrecacheManifest } from "@pwa-platform/engine-workbox";
import { injectWorkerConfig, createPlatformWorkerConfig } from "@pwa-platform/sw-runtime";
import { build } from "vite";
import {
  BUILD_ROOT,
  BUNDLE_ROOT,
  CLIENT_CONFIG,
  PACKAGE_ROOT,
  PAGE_ENTRY,
  PAGE_SCRIPT_URL,
  PLAN_V1,
  PLAN_V2,
  PLAN_OFFLINE_WRITE,
  PLAN_RUNTIME_CACHE,
  PLATFORM_ENTRY,
  SITE_RUNTIME_SOURCE,
  SITE_SOURCE,
  SITE_V1_ROOT,
  SITE_V2_ROOT,
  SITE_OFFLINE_WRITE_ROOT,
  SITE_RUNTIME_CACHE_ROOT,
  SITE_V2_SOURCE,
  WORKER_URL,
} from "./fixture-site.js";

/**
 * Builds both served versions of the fixture site. The worker is bundled and injected exactly as a platform build
 * does it (manifest first, then the sw-runtime config); the page script carries its client config through vite's
 * `define`, standing in for the module vite-adapter will generate.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  for (const root of [SITE_V1_ROOT, SITE_V2_ROOT, SITE_OFFLINE_WRITE_ROOT, SITE_RUNTIME_CACHE_ROOT]) {
    await cp(SITE_SOURCE, root, { recursive: true });
  }
  await cp(SITE_V2_SOURCE, SITE_V2_ROOT, { recursive: true, force: true });
  // T11: layer the runtime-cache fixture files (data endpoints, dynamic page) onto the runtime-cache root.
  await cp(SITE_RUNTIME_SOURCE, SITE_RUNTIME_CACHE_ROOT, { recursive: true, force: true });

  const worker = await bundle(PLATFORM_ENTRY, "platform-worker.js");
  await writeInto(SITE_V1_ROOT, WORKER_URL, injectWorkerConfig(injectPrecacheManifest(worker, PLAN_V1), createPlatformWorkerConfig(PLAN_V1)));
  await writeInto(SITE_V2_ROOT, WORKER_URL, injectWorkerConfig(injectPrecacheManifest(worker, PLAN_V2), createPlatformWorkerConfig(PLAN_V2)));
  await writeInto(SITE_OFFLINE_WRITE_ROOT, WORKER_URL, injectWorkerConfig(injectPrecacheManifest(worker, PLAN_OFFLINE_WRITE), createPlatformWorkerConfig(PLAN_OFFLINE_WRITE)));
  await writeInto(SITE_RUNTIME_CACHE_ROOT, WORKER_URL, injectWorkerConfig(injectPrecacheManifest(worker, PLAN_RUNTIME_CACHE), createPlatformWorkerConfig(PLAN_RUNTIME_CACHE)));

  const page = await bundle(PAGE_ENTRY, "page.js", { __PWA_CLIENT_CONFIG__: JSON.stringify(CLIENT_CONFIG) });
  for (const root of [SITE_V1_ROOT, SITE_V2_ROOT, SITE_OFFLINE_WRITE_ROOT, SITE_RUNTIME_CACHE_ROOT]) {
    await writeInto(root, PAGE_SCRIPT_URL, page);
  }
}

async function bundle(entry: string, fileName: string, define: Record<string, string> = {}): Promise<string> {
  await build({
    configFile: false,
    root: PACKAGE_ROOT,
    envDir: false,
    publicDir: false,
    logLevel: "warn",
    define: {
      // Workbox guards its development logging with process.env.NODE_ENV, which exists in neither a worker nor a page.
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...define,
    },
    build: {
      outDir: BUNDLE_ROOT,
      emptyOutDir: false,
      copyPublicDir: false,
      // Unminified, so the worker's two injection points stay verbatim for the injections above.
      minify: false,
      sourcemap: false,
      lib: { entry, formats: ["iife"], name: fileName.replace(/\W/g, "_"), fileName: () => fileName },
    },
  });
  const source = await readFile(join(BUNDLE_ROOT, fileName), "utf8");
  assertSelfContained(fileName, source);
  return source;
}

async function writeInto(root: string, url: string, source: string): Promise<void> {
  const target = join(root, url.slice(1));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, source);
}

/** Neither a classic worker nor a plain script tag can resolve modules, so fail here rather than in Chrome. */
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
