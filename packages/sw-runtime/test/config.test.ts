import { appCachePrefix, cacheName, REQUEST_BASELINE_DENIALS, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createPlatformWorkerConfig, createRecoveryWorkerConfig } from "../src/build/index.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

function message(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

const storefront = readPlan("storefront");
const rootMinimal = readPlan("root-minimal");

describe("createPlatformWorkerConfig", () => {
  it("derives each field of the storefront config from the plan", () => {
    const config = createPlatformWorkerConfig(storefront);
    expect(config).toEqual({
      kind: "platform",
      version: 1,
      scope: "/app/",
      precacheCacheName: "pwa:storefront:production:r3:precache",
      requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
      pathRules: [
        { pathPrefix: "/app/api/account", action: "deny" },
        { pathPrefix: "/app/api/orders", action: "deny" },
        { pathPrefix: "/app/live", action: "deny" },
        { pathPrefix: "/app/api/catalog", action: "stale-while-revalidate" },
        { pathPrefix: "/app/assets", action: "cache-first" },
        { pathPrefix: "/app/fonts", action: "cache-first" },
        { pathPrefix: "/app", action: "network-first" },
      ],
      offlineFallback: { enabled: true, path: "/app/offline.html" },
      updateMode: "prompt",
      offlineWrites: { enabled: false },
      runtimeCache: {
        enabled: false,
        pagesCacheName: cacheName(storefront.identity, "runtime-pages"),
        dataCacheNamePrefix: `${cacheName(storefront.identity, "runtime-data")}-`,
      },
    });
    expect(Object.keys(config)).toEqual([
      "kind",
      "version",
      "scope",
      "precacheCacheName",
      "requestBaselineDenials",
      "pathRules",
      "offlineFallback",
      "updateMode",
      "offlineWrites",
      "runtimeCache",
    ]);
    expect(config.precacheCacheName).toBe(cacheName(storefront.identity, "precache"));
  });

  it("keeps the plan's rule order and spelling, and a disabled fallback", () => {
    expect(createPlatformWorkerConfig(rootMinimal)).toEqual({
      kind: "platform",
      version: 1,
      scope: "/",
      precacheCacheName: cacheName(rootMinimal.identity, "precache"),
      requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
      pathRules: [
        { pathPrefix: "/admin", action: "deny" },
        { pathPrefix: "/%61ssets", action: "stale-while-revalidate" },
      ],
      offlineFallback: { enabled: false },
      updateMode: "prompt",
      offlineWrites: { enabled: false },
      runtimeCache: {
        enabled: false,
        pagesCacheName: cacheName(rootMinimal.identity, "runtime-pages"),
        dataCacheNamePrefix: `${cacheName(rootMinimal.identity, "runtime-data")}-`,
      },
    });
  });

  it("carries only the closed v2 offline-write configuration", () => {
    const offlineWrites = {
      enabled: true,
      databaseName: "pwa-offline-write:storefront:production:r3",
      maxEntries: 10,
      maxTotalBodyBytes: 4096,
      targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
    } as const;
    const v2 = {
      ...storefront,
      schemaVersion: 2,
      planVersion: 2,
      policyVersion: 2,
      offlineWrites,
    } as PwaPlan;
    expect(createPlatformWorkerConfig(v2).offlineWrites).toEqual(offlineWrites);
    // The v2 fixture's "/app/api/catalog" rule is already stale-while-revalidate on a public-data resource — the
    // combination T7 later executes for a v3 plan — yet a v2 plan has no runtimeCache field at all, so it must never
    // become a runtime rule: enabled stays false and rules is absent from the type.
    expect(createPlatformWorkerConfig(v2).runtimeCache).toEqual({
      enabled: false,
      pagesCacheName: cacheName(storefront.identity, "runtime-pages"),
      dataCacheNamePrefix: `${cacheName(storefront.identity, "runtime-data")}-`,
    });
  });

  it("keeps a v3 plan's offline-write configuration", () => {
    const offlineWrites = {
      enabled: true,
      databaseName: "pwa-offline-write:storefront:production:r3",
      maxEntries: 10,
      maxTotalBodyBytes: 4096,
      targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
    } as const;
    const v3 = {
      ...storefront,
      schemaVersion: 3,
      planVersion: 3,
      policyVersion: 3,
      offlineWrites,
      runtimeCache: { enabled: false },
    } as PwaPlan;
    expect(createPlatformWorkerConfig(v3).offlineWrites).toEqual(offlineWrites);
    expect(createPlatformWorkerConfig(v3).runtimeCache).toEqual({
      enabled: false,
      pagesCacheName: cacheName(storefront.identity, "runtime-pages"),
      dataCacheNamePrefix: `${cacheName(storefront.identity, "runtime-data")}-`,
    });
  });

  it("derives an enabled v3 plan's runtime-cache configuration, filtered to executable rules only", () => {
    const v3 = {
      ...storefront,
      schemaVersion: 3,
      planVersion: 3,
      policyVersion: 3,
      offlineWrites: { enabled: false },
      runtimeCache: { enabled: true, maxEntries: 40, maxEntryBytes: 65_536, maxAgeSeconds: 300, configDigest: "0123456789abcdef" },
    } as PwaPlan;
    expect(createPlatformWorkerConfig(v3).runtimeCache).toEqual({
      enabled: true,
      pagesCacheName: cacheName(storefront.identity, "runtime-pages"),
      dataCacheNamePrefix: `${cacheName(storefront.identity, "runtime-data")}-`,
      dataCacheName: `${cacheName(storefront.identity, "runtime-data")}-0123456789abcdef`,
      maxEntries: 40,
      maxEntryBytes: 65_536,
      maxAgeSeconds: 300,
      // Only "/app/api/catalog" (public-data, stale-while-revalidate) qualifies: the deny, cache-first and
      // network-first navigation-public-static rules are not executable runtime-cache combinations.
      rules: [{ pathPrefix: "/app/api/catalog", resourceClass: "public-data", strategy: "stale-while-revalidate" }],
    });
  });

  it("carries networkTimeoutSeconds only when the plan set it (ADR-0038)", () => {
    expect(createPlatformWorkerConfig(storefront).networkTimeoutSeconds).toBeUndefined();
    expect(Object.hasOwn(createPlatformWorkerConfig(storefront), "networkTimeoutSeconds")).toBe(false);
    const withTimeout = { ...storefront, networkTimeoutSeconds: 5 } as PwaPlan;
    expect(createPlatformWorkerConfig(withTimeout).networkTimeoutSeconds).toBe(5);
  });

  it("is deterministic and independent of the plan's key order", () => {
    const reordered = Object.fromEntries(Object.entries(storefront).reverse()) as PwaPlan;
    expect(JSON.stringify(createPlatformWorkerConfig(reordered))).toBe(JSON.stringify(createPlatformWorkerConfig(storefront)));
  });
});

describe("createRecoveryWorkerConfig", () => {
  it("carries the identity-derived cache prefix and offline-write database name", () => {
    expect(createRecoveryWorkerConfig(storefront)).toEqual({ kind: "recovery", version: 1, appCachePrefix: "pwa:storefront:production:", offlineWriteDatabaseName: "pwa-offline-write:storefront:production:r3" });
    expect(createRecoveryWorkerConfig(rootMinimal)).toEqual({
      kind: "recovery",
      version: 1,
      appCachePrefix: appCachePrefix(rootMinimal.identity),
      offlineWriteDatabaseName: "pwa-offline-write:docs:staging:2026-09",
    });
  });
});

describe("invalid plans", () => {
  it("are rejected by both functions with diagnostic codes and paths but without echoing values", () => {
    const secret = "tok_do_not_echo";
    // schemaVersion 4 does not exist yet (unlike 3, added by the v3 runtime-cache plan); keeps this an
    // unsupported-version case rather than a v3 plan missing its other required fields.
    const invalid = { ...storefront, schemaVersion: 4, identity: { ...storefront.identity, appId: `${secret} ` } } as unknown as PwaPlan;
    for (const create of [createPlatformWorkerConfig, createRecoveryWorkerConfig]) {
      const text = message(() => create(invalid));
      expect(text).toMatch(/^Cannot create a worker config from an invalid PwaPlan: /);
      expect(text).toMatch(/schema\.[a-z-]+ at \/schemaVersion/);
      expect(text).not.toContain(secret);
    }
  });
});
