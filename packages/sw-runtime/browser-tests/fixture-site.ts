import { fileURLToPath } from "node:url";
import type { PwaIdentity, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";
import { compilePlan, type PwaCompileInput, type PwaHostBuildFile } from "@pwa-platform/core";
import {
  createPlatformWorkerConfig,
  createRecoveryWorkerConfig,
  type PwaPlatformWorkerConfig,
  type PwaRecoveryWorkerConfig,
} from "../src/build/index.js";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const PACKAGE_ROOT: string = here("../");
/** Static files of the fixture site; copied into every served version. */
export const SITE_SOURCE: string = here("./site/");
/** Files that differ in v2; copied over the v1 files. */
export const SITE_V2_SOURCE: string = here("./site-v2/");
/** T11: public-data/navigation-public-dynamic fixture files, layered onto the v3 (and v2-runtime-declared) roots. */
export const SITE_RUNTIME_SOURCE: string = here("./site-runtime/");
export const PLATFORM_ENTRY: string = here("../src/entries/platform-worker-entry.ts");
export const RECOVERY_ENTRY: string = here("../src/entries/recovery-worker-entry.ts");
/** Exposes `deleteExpirationRecords` on `window`, bundled the same way the workers are, for expiration-records.spec.ts. */
export const EXPIRATION_RECORDS_TEST_ENTRY: string = here("./expiration-records-test-entry.ts");
export const EXPIRATION_RECORDS_TEST_URL = "/app/expiration-records-test.js";

/** Git-ignored output of global-setup.ts. */
export const BUILD_ROOT: string = here("../browser-build/");
export const BUNDLE_ROOT: string = here("../browser-build/bundle/");
export const SITE_V1_ROOT: string = here("../browser-build/site-v1/");
export const SITE_V2_ROOT: string = here("../browser-build/site-v2/");
/** v1 of the site with the recovery worker published at the same service worker URL (recovery-drill.md step 2). */
export const SITE_RECOVERY_ROOT: string = here("../browser-build/site-recovery/");
/** v1 of the site built from a plan whose policy disables the offline fallback. */
export const SITE_NO_FALLBACK_ROOT: string = here("../browser-build/site-no-fallback/");
/** v1 of the site with a prerendered sub-page (`guide/index.html`) in the precache. */
export const SITE_SUBPAGE_ROOT: string = here("../browser-build/site-subpage/");
/** v1's files compiled as a shared-origin root whose child app owns `/app/guide/` (ADR-0019). */
export const SITE_EXCLUDED_ROOT: string = here("../browser-build/site-excluded/");
/** v1's files plus a binary asset, for the Range-request repro (ADR-0023). */
export const SITE_RANGE_ROOT: string = here("../browser-build/site-range/");
export const SITE_OFFLINE_WRITE_ROOT: string = here("../browser-build/site-offline-write/");
/** T11: v3 with runtimeCache enabled (base worker version). */
export const SITE_V3_ROOT: string = here("../browser-build/site-v3/");
/** T11: same runtimeCache config as v3 (same configDigest), but a different precache so it is a new worker version. */
export const SITE_V3_SAME_CONFIG_ROOT: string = here("../browser-build/site-v3-same-config/");
/** T11: v3 with a different runtimeCache limit, so its configDigest differs from v3's. */
export const SITE_V3_CHANGED_LIMIT_ROOT: string = here("../browser-build/site-v3-changed-limit/");
/** T11: v2 policy that declares a public-data/network-first rule; the worker must still never cache it. */
export const SITE_V2_RUNTIME_DECLARED_ROOT: string = here("../browser-build/site-v2-runtime-declared/");
/** NT6: same rules and limits as v3, plus `networkTimeoutSeconds: 1` (ADR-0038 real-browser scenarios). */
export const SITE_TIMEOUT_ROOT: string = here("../browser-build/site-timeout/");

/** Served paths the tests use. */
export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";
export const OFFLINE_URL = "/app/offline.html";
export const DENIED_URL = "/app/api/account/profile.json";
/** Outside the app's mount path, so no path rule matches it. */
export const UNCLASSIFIED_URL = "/outside/thing.json";
/** A sub-page's route, spelled without the trailing slash; only the `subpage` version precaches its index.html. */
export const GUIDE_URL = "/app/guide";
/** Binary asset precached only by the `range` version, for a Range request against a precached asset (ADR-0023). */
export const RANGE_ASSET_URL = "/app/assets/media.bin";
/** Byte length of the file at `site/app/assets/media.bin` (byte i = i % 256). */
export const RANGE_ASSET_SIZE = 4096;

export const FIXTURE_SITE: FixtureServerOptions = {
  versions: {
    v1: SITE_V1_ROOT,
    v2: SITE_V2_ROOT,
    recovery: SITE_RECOVERY_ROOT,
    "no-fallback": SITE_NO_FALLBACK_ROOT,
    subpage: SITE_SUBPAGE_ROOT,
    excluded: SITE_EXCLUDED_ROOT,
    range: SITE_RANGE_ROOT,
    "offline-write": SITE_OFFLINE_WRITE_ROOT,
    v3: SITE_V3_ROOT,
    "v3-same-config": SITE_V3_SAME_CONFIG_ROOT,
    "v3-changed-limit": SITE_V3_CHANGED_LIMIT_ROOT,
    "v2-runtime-declared": SITE_V2_RUNTIME_DECLARED_ROOT,
    timeout: SITE_TIMEOUT_ROOT,
  },
  responseRules: [{ method: "POST", path: "/app/api/orders", status: 201 }],
};

/** Paths served by site-runtime, relative to the app mount (T11 runtime-cache fixtures). */
export const RUNTIME_CATALOG_ITEMS_URL = "/app/api/catalog/items.json";
export const RUNTIME_CATALOG_NO_STORE_URL = "/app/api/catalog/reject-no-store.json";
export const RUNTIME_CATALOG_PRIVATE_URL = "/app/api/catalog/reject-private.json";
export const RUNTIME_CATALOG_VARY_COOKIE_URL = "/app/api/catalog/reject-vary-cookie.json";
export const RUNTIME_CATALOG_WRONG_MIME_URL = "/app/api/catalog/reject-wrong-mime.json";
export const RUNTIME_CATALOG_AUTH_URL = "/app/api/catalog/reject-auth.json";
export const RUNTIME_CATALOG_TOO_BIG_URL = "/app/api/catalog/reject-too-big.json";
export const RUNTIME_CATALOG_COOKIE_PUBLIC_URL = "/app/api/catalog/cookie-public.json";
export const RUNTIME_CATALOG_COOKIE_PRIVATE_URL = "/app/api/catalog/cookie-private.json";
export const RUNTIME_REVIEWS_LIST_URL = "/app/api/reviews/list.json";
export const RUNTIME_REVIEWS_NO_CACHE_URL = "/app/api/reviews/reject-no-cache.json";
/** Trailing slash: the fixture server 301-redirects a directory request without one, and a redirected response is
 * never admitted to the runtime cache (spec "响应准入": `response.redirected === false`). */
export const RUNTIME_DASHBOARD_URL = "/app/dashboard/";
export const RUNTIME_DASHBOARD_UNVISITED_URL = "/app/dashboard/never-visited";
/** Above `runtimeCache.maxEntryBytes` (300) for every v3 fixture plan below. */
export const RUNTIME_CACHE_MAX_ENTRY_BYTES = 300;

const identity: PwaIdentity = {
  appId: "swfixture",
  manifestId: "/app/",
  // The fixture server picks a port, so this origin only carries the host: the worker derives its own origin from
  // `scope.location`, and nothing in the runtime config is compared against `identity.origin`.
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
  install: { enabled: false },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api/account", resourceClass: "session-data", cache: "none" },
  ],
};

function file(path: string, contentHash: string, fingerprinted = false): PwaHostBuildFile {
  return { path, contentHash, fingerprinted };
}

const COMMON_FILES: readonly PwaHostBuildFile[] = [
  file("offline.html", "2222222222222222"),
  file("api/account/profile.json", "5555555555555555"),
  file("sw.js", "6666666666666666"),
  file("manifest.webmanifest", "7777777777777777"),
];

/** The same policy without the offline fallback, for the version that must fail closed when offline. */
const policyWithoutFallback: PwaPolicy = { ...policy, offlineFallback: { enabled: false } };

function input(files: readonly PwaHostBuildFile[], selected: PwaPolicy = policy): PwaCompileInput {
  return {
    identity,
    install: null,
    topology: { kind: "standalone-origin" },
    policy: selected,
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

/** v1: the shell, a fingerprinted bundle and a revisioned logo. */
export const PLAN_V1: PwaPlan = compile(
  input([
    file("index.html", "1111111111111111"),
    file("assets/app.3f9a2c7d.js", "3333333333333333", true),
    file("assets/logo.svg", "4444444444444444"),
    ...COMMON_FILES,
  ]),
);

/** v2: the fingerprinted bundle is replaced, the logo gets a new revision, the shell changes. */
export const PLAN_V2: PwaPlan = compile(
  input([
    file("index.html", "9999999999999999"),
    file("assets/app.9e8d7c6b.js", "8888888888888888", true),
    file("assets/logo.svg", "aaaaaaaaaaaaaaaa"),
    ...COMMON_FILES,
  ]),
);

/** v1's files with the offline fallback switched off in the policy. */
export const PLAN_NO_FALLBACK: PwaPlan = compile(
  input(
    [
      file("index.html", "1111111111111111"),
      file("assets/app.3f9a2c7d.js", "3333333333333333", true),
      file("assets/logo.svg", "4444444444444444"),
      ...COMMON_FILES,
    ],
    policyWithoutFallback,
  ),
);

/**
 * v1's files plus a prerendered sub-page, with an asset rule precaching it. Kept out of v1 so v1's precache list,
 * which other suites spell out, stays as it is.
 */
export const PLAN_SUBPAGE: PwaPlan = compile(
  input(
    [
      file("index.html", "1111111111111111"),
      file("assets/app.3f9a2c7d.js", "3333333333333333", true),
      file("assets/logo.svg", "4444444444444444"),
      file("guide/index.html", "bbbbbbbbbbbbbbbb"),
      ...COMMON_FILES,
    ],
    { ...policy, resources: [...policy.resources, { pathPrefix: "/guide/index.html", resourceClass: "asset", cache: "cache-first" }] },
  ),
);

export const CONFIG_V1: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V1);
export const CONFIG_V2: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V2);
export const CONFIG_NO_FALLBACK: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_NO_FALLBACK);
export const CONFIG_SUBPAGE: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_SUBPAGE);

/**
 * v1's files plus the child's `guide/index.html`, compiled as the root of a shared origin whose only child owns
 * `/app/guide/`. The compiler prepends an exclude rule for it and keeps the child's file out of this precache.
 */
export const PLAN_EXCLUDED: PwaPlan = compile({
  ...input([
    file("index.html", "1111111111111111"),
    file("assets/app.3f9a2c7d.js", "3333333333333333", true),
    file("assets/logo.svg", "4444444444444444"),
    file("guide/index.html", "bbbbbbbbbbbbbbbb"),
    ...COMMON_FILES,
  ]),
  topology: {
    kind: "shared-origin",
    registry: {
      schemaVersion: 1,
      registryVersion: 1,
      origin: identity.origin,
      environment: identity.environment,
      root: {
        appId: identity.appId,
        scope: identity.scope,
        serviceWorkerUrl: identity.serviceWorkerUrl,
        manifestId: identity.manifestId,
        manifestUrl: identity.manifestUrl,
      },
      children: [
        {
          appId: "swfixture-guide",
          scope: "/app/guide/",
          serviceWorkerUrl: "/app/guide/sw.js",
          manifestId: "/app/guide/",
          manifestUrl: "/app/guide/manifest.webmanifest",
        },
      ],
    },
  },
});

export const CONFIG_EXCLUDED: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_EXCLUDED);

/** v1's files plus a binary asset (Range-request repro, ADR-0023), kept out of v1 so v1's precache list stays as it is. */
export const PLAN_RANGE: PwaPlan = compile(
  input([
    file("index.html", "1111111111111111"),
    file("assets/app.3f9a2c7d.js", "3333333333333333", true),
    file("assets/logo.svg", "4444444444444444"),
    file("assets/media.bin", "eeeeeeeeeeeeeeee"),
    ...COMMON_FILES,
  ]),
);

export const CONFIG_RANGE: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_RANGE);
const offlineWritePolicy: PwaPolicy = {
  schemaVersion: 2,
  install: { enabled: false },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [...policy.resources, { pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
  offlineWrites: { enabled: true, maxEntries: 4, maxTotalBodyBytes: 1024, targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 256 }] },
};
export const PLAN_OFFLINE_WRITE: PwaPlan = compile(input([
  file("index.html", "1111111111111111"),
  file("assets/app.3f9a2c7d.js", "3333333333333333", true),
  file("assets/logo.svg", "4444444444444444"),
  ...COMMON_FILES,
], offlineWritePolicy));
export const CONFIG_OFFLINE_WRITE: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_OFFLINE_WRITE);
export const RECOVERY_CONFIG: PwaRecoveryWorkerConfig = createRecoveryWorkerConfig(PLAN_V1);

// --- T11: real-browser runtime-cache fixtures (spec "测试策略", ADR-0035) --------------------------------------

const runtimeCachePolicy: PwaPolicy = {
  schemaVersion: 3,
  install: { enabled: false },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    ...policy.resources,
    { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" },
    { pathPrefix: "/api/reviews", resourceClass: "public-data", cache: "stale-while-revalidate" },
    { pathPrefix: "/dashboard", resourceClass: "navigation-public-dynamic", cache: "network-first" },
  ],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: RUNTIME_CACHE_MAX_ENTRY_BYTES, maxAgeSeconds: 60 },
};

/** Same rules and limits as `runtimeCachePolicy` (same configDigest); only the changed-limit variant differs. */
const runtimeCachePolicyChangedLimit: PwaPolicy = {
  ...runtimeCachePolicy,
  runtimeCache: { enabled: true, maxEntries: 60, maxEntryBytes: RUNTIME_CACHE_MAX_ENTRY_BYTES, maxAgeSeconds: 60 },
};

const V3_FILES_A: readonly PwaHostBuildFile[] = [
  file("index.html", "1111111111111111"),
  file("assets/app.3f9a2c7d.js", "3333333333333333", true),
  file("assets/logo.svg", "4444444444444444"),
  ...COMMON_FILES,
];
/** A different precache from `V3_FILES_A`, so a worker built from it is a new version even when the runtimeCache
 * config (and therefore its configDigest) is identical — used for the "same config, new activation" scenario. */
const V3_FILES_B: readonly PwaHostBuildFile[] = [
  file("index.html", "9999999999999999"),
  file("assets/app.9e8d7c6b.js", "8888888888888888", true),
  file("assets/logo.svg", "aaaaaaaaaaaaaaaa"),
  ...COMMON_FILES,
];

export const PLAN_V3: PwaPlan = compile(input(V3_FILES_A, runtimeCachePolicy));
export const PLAN_V3_SAME_CONFIG: PwaPlan = compile(input(V3_FILES_B, runtimeCachePolicy));
export const PLAN_V3_CHANGED_LIMIT: PwaPlan = compile(input(V3_FILES_A, runtimeCachePolicyChangedLimit));

export const CONFIG_V3: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V3);
export const CONFIG_V3_SAME_CONFIG: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V3_SAME_CONFIG);
export const CONFIG_V3_CHANGED_LIMIT: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V3_CHANGED_LIMIT);

if (!CONFIG_V3.runtimeCache.enabled || !CONFIG_V3_SAME_CONFIG.runtimeCache.enabled) {
  throw new Error("The v3 runtime-cache fixtures did not enable the runtime cache");
}
if (CONFIG_V3.runtimeCache.dataCacheName !== CONFIG_V3_SAME_CONFIG.runtimeCache.dataCacheName) {
  throw new Error("v3 and v3-same-config must share a configDigest (same rules and limits)");
}
if (!CONFIG_V3_CHANGED_LIMIT.runtimeCache.enabled || CONFIG_V3_CHANGED_LIMIT.runtimeCache.dataCacheName === CONFIG_V3.runtimeCache.dataCacheName) {
  throw new Error("v3-changed-limit must have a different configDigest from v3");
}

/** v2: declares a public-data/network-first rule, which the worker must still never execute (spec "成功标准"). */
const v2RuntimeDeclaredPolicy: PwaPolicy = {
  schemaVersion: 2,
  install: { enabled: false },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [...policy.resources, { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "network-first" }],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
};
export const PLAN_V2_RUNTIME_DECLARED: PwaPlan = compile(input(V3_FILES_A, v2RuntimeDeclaredPolicy));
export const CONFIG_V2_RUNTIME_DECLARED: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_V2_RUNTIME_DECLARED);
if (CONFIG_V2_RUNTIME_DECLARED.runtimeCache.enabled) throw new Error("A v2 plan must never enable the runtime cache");

// --- NT6: real-browser network-timeout fixture (spec "测试策略", ADR-0038) --------------------------------------

/** Same rules and limits as `runtimeCachePolicy`, plus `networkTimeoutSeconds: 1` — the shortest allowed value, so
 * navigation and both network-first runtime-cache paths (page and data) time out quickly and predictably. */
const timeoutPolicy: PwaPolicy = { ...runtimeCachePolicy, networkTimeoutSeconds: 1 };

export const PLAN_TIMEOUT: PwaPlan = compile(input(V3_FILES_A, timeoutPolicy));
export const CONFIG_TIMEOUT: PwaPlatformWorkerConfig = createPlatformWorkerConfig(PLAN_TIMEOUT);
if (CONFIG_TIMEOUT.networkTimeoutSeconds !== 1) throw new Error("The timeout fixture must set networkTimeoutSeconds: 1");
if (!CONFIG_TIMEOUT.runtimeCache.enabled) throw new Error("The timeout fixture did not enable the runtime cache");

export const PRECACHE_CACHE_NAME: string = CONFIG_V1.precacheCacheName;
/** `pwa:swfixture:production:`: everything the recovery worker deletes. */
export const APP_CACHE_PREFIX: string = RECOVERY_CONFIG.appCachePrefix;

/** Precache cache keys of a plan, as Workbox stores them: revisioned entries carry `__WB_REVISION__`. */
export function precacheCacheKeys(plan: PwaPlan, origin: string): readonly string[] {
  return plan.precache
    .map(({ url, revision }) => `${origin}${url}${revision === null ? "" : `?__WB_REVISION__=${revision}`}`)
    .sort();
}
