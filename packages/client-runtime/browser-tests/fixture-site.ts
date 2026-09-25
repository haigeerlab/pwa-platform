import { fileURLToPath } from "node:url";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";
import { appCachePrefix, cacheName, type PwaIdentity, type PwaPlan, type PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan, type PwaCompileInput, type PwaHostBuildFile } from "@pwa-platform/core";
import { createPlatformWorkerConfig } from "@pwa-platform/sw-runtime";
import { createClientConfig } from "../src/build/index.js";
import type { PwaClientConfig } from "../src/shared/config.js";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const PACKAGE_ROOT: string = here("../");
/** Static files of the fixture site; copied into every served version. */
export const SITE_SOURCE: string = here("./site/");
/** Files that differ in v2; copied over the v1 files. */
export const SITE_V2_SOURCE: string = here("./site-v2/");
/** T11: public-data/navigation-public-dynamic fixture files, layered onto the runtime-cache root. */
export const SITE_RUNTIME_SOURCE: string = here("./site-runtime/");
/** The page script that drives the facade inside the browser. */
export const PAGE_ENTRY: string = here("./page-entry.ts");
/**
 * sw-runtime's worker entry, by source path rather than by its built output: the same thing sw-runtime's own
 * browser tests bundle, so these tests do not depend on another package being built first.
 */
export const PLATFORM_ENTRY: string = here("../../sw-runtime/src/entries/platform-worker-entry.ts");

/** Git-ignored output of global-setup.ts. */
export const BUILD_ROOT: string = here("../browser-build/");
export const BUNDLE_ROOT: string = here("../browser-build/bundle/");
export const SITE_V1_ROOT: string = here("../browser-build/site-v1/");
export const SITE_V2_ROOT: string = here("../browser-build/site-v2/");
/** v1 page assets with the v2 offline-write worker configuration. */
export const SITE_OFFLINE_WRITE_ROOT: string = here("../browser-build/site-offline-write/");
/** T11: v1 page assets with a v3 (runtime cache enabled) worker configuration. */
export const SITE_RUNTIME_CACHE_ROOT: string = here("../browser-build/site-runtime-cache/");

/** Served paths the tests use. */
export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";
/** The bundled page script, listed in the plan like any other built asset. */
export const PAGE_SCRIPT_URL = "/app/assets/client.js";

export const FIXTURE_SITE: FixtureServerOptions = {
  versions: { v1: SITE_V1_ROOT, v2: SITE_V2_ROOT, "offline-write": SITE_OFFLINE_WRITE_ROOT, "runtime-cache": SITE_RUNTIME_CACHE_ROOT },
};

/** T11 runtime-cache fixture paths. */
export const RUNTIME_CATALOG_ITEMS_URL = "/app/api/catalog/items.json";
export const RUNTIME_REVIEWS_LIST_URL = "/app/api/reviews/list.json";
export const RUNTIME_DASHBOARD_URL = "/app/dashboard/";

const identity: PwaIdentity = {
  appId: "clientfixture",
  manifestId: "/app/",
  // The fixture server picks a port, so this origin only carries the host; nothing in the client config is
  // compared against it.
  origin: "http://localhost",
  scope: "/app/",
  serviceWorkerUrl: WORKER_URL,
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};

const offlineWritePolicy: PwaPolicy = {
  schemaVersion: 2,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [...policy.resources, { pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
  offlineWrites: { enabled: true, maxEntries: 4, maxTotalBodyBytes: 1024, targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 256 }] },
};

function file(path: string, contentHash: string, fingerprinted = false): PwaHostBuildFile {
  return { path, contentHash, fingerprinted };
}

const COMMON_FILES: readonly PwaHostBuildFile[] = [
  file("offline.html", "2222222222222222"),
  file("assets/client.js", "3333333333333333"),
  file("sw.js", "6666666666666666"),
  file("manifest.webmanifest", "7777777777777777"),
];

function input(files: readonly PwaHostBuildFile[]): PwaCompileInput {
  return {
    identity,
    install: {
      startUrl: "/app/",
      display: "standalone",
      name: "client-runtime fixture",
      shortName: "Fixture",
      themeColor: "#0f172a",
      backgroundColor: "#ffffff",
      icons: [
        { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/app/icons/maskable.png", sizes: "192x192 512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    topology: { kind: "standalone-origin" },
    policy,
    hostBuildOutput: { publicPath: "/app/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files },
  };
}

function compile(candidate: PwaCompileInput): PwaPlan {
  const result = compilePlan(candidate);
  if (!result.ok) {
    throw new Error(`The fixture plan did not compile: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  }
  return result.value;
}

/** v1: the shell and the page script. */
export const PLAN_V1: PwaPlan = compile(input([file("index.html", "1111111111111111"), ...COMMON_FILES]));

/** v2: the shell changes, so the deployed worker differs and the page can discover an update. */
export const PLAN_V2: PwaPlan = compile(input([file("index.html", "9999999999999999"), ...COMMON_FILES]));

/** v1's page assets with the explicit offline-write queue enabled in the worker. */
export const PLAN_OFFLINE_WRITE: PwaPlan = compile({ ...input([file("index.html", "1111111111111111"), ...COMMON_FILES]), policy: offlineWritePolicy });

const offlineWriteWorkerConfig = createPlatformWorkerConfig(PLAN_OFFLINE_WRITE);
if (!offlineWriteWorkerConfig.offlineWrites.enabled) throw new Error("The offline-write fixture did not enable its queue");
/** Derived by the worker configuration, so browser assertions target the exact identity-owned database. */
export const OFFLINE_WRITE_DATABASE_NAME: string = offlineWriteWorkerConfig.offlineWrites.databaseName;

/** T11: v3 policy with the runtime cache enabled — a network-first data rule, an SWR data rule and a dynamic-page rule. */
const runtimeCachePolicy: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    ...policy.resources,
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
    { pathPrefix: "/api/reviews", resourceClass: "public-data", cache: "stale-while-revalidate" },
    { pathPrefix: "/dashboard", resourceClass: "navigation-public-dynamic", cache: "network-first" },
  ],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 4096, maxAgeSeconds: 60 },
};
export const PLAN_RUNTIME_CACHE: PwaPlan = compile({
  ...input([file("index.html", "1111111111111111"), ...COMMON_FILES]),
  policy: runtimeCachePolicy,
});
const runtimeCacheWorkerConfig = createPlatformWorkerConfig(PLAN_RUNTIME_CACHE);
if (!runtimeCacheWorkerConfig.runtimeCache.enabled) throw new Error("The runtime-cache fixture did not enable the runtime cache");

/** Both versions serve the same app, so the page config is identical; only the workers differ. */
export const CLIENT_CONFIG: PwaClientConfig = createClientConfig(PLAN_V1);

/** `pwa:clientfixture:production:`: every cache this app owns. Logout must leave all of them alone. */
export const APP_CACHE_PREFIX: string = appCachePrefix(identity);
export const PRECACHE_CACHE_NAME: string = cacheName(identity, "precache");
