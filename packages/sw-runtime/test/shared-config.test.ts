import { CACHE_STRATEGIES, REQUEST_BASELINE_DENIALS } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import {
  validatePlatformWorkerConfig,
  validateRecoveryWorkerConfig,
  validateWorkerConfig,
  WORKER_BASELINE_DENIALS,
  WORKER_PATH_RULE_ACTIONS,
} from "../src/shared/config.js";

const platform = {
  kind: "platform",
  version: 1,
  scope: "/app/",
  precacheCacheName: "pwa:storefront:production:r3:precache",
  requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
  pathRules: [
    { pathPrefix: "/app/api/account", action: "deny" },
    { pathPrefix: "/%61ssets", action: "cache-first" },
    { pathPrefix: "/", action: "network-first" },
  ],
  offlineFallback: { enabled: true, path: "/app/offline.html" },
  updateMode: "prompt",
  offlineWrites: { enabled: false },
  runtimeCache: {
    enabled: false,
    pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
    dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
  },
};
const recovery = { kind: "recovery", version: 1, appCachePrefix: "pwa:storefront:production:", offlineWriteDatabaseName: "pwa-offline-write:storefront:production:r3" };

function message(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("shared constants", () => {
  it("match contracts, so the worker never imports contracts", () => {
    expect(WORKER_BASELINE_DENIALS).toEqual(REQUEST_BASELINE_DENIALS);
    expect(WORKER_PATH_RULE_ACTIONS).toEqual(["exclude", "deny", ...CACHE_STRATEGIES]);
  });
});

describe("validatePlatformWorkerConfig", () => {
  it("returns a fresh copy with keys in canonical order", () => {
    const shuffled = Object.fromEntries(Object.entries(platform).reverse());
    const validated = validatePlatformWorkerConfig(shuffled);
    expect(validated).toEqual(platform);
    expect(Object.keys(validated)).toEqual(Object.keys(platform));
    expect(validated.pathRules).not.toBe(platform.pathRules);
    expect(validated.pathRules[0]).not.toBe(platform.pathRules[0]);
    expect(JSON.stringify(validatePlatformWorkerConfig({ ...platform, offlineFallback: { path: "/app/offline.html", enabled: true } }))).toBe(
      JSON.stringify(platform),
    );
    expect(validatePlatformWorkerConfig({ ...platform, offlineFallback: { enabled: false } }).offlineFallback).toEqual({ enabled: false });
  });

  it("requires a plain object with exactly the platform fields", () => {
    for (const value of [undefined, null, "config", [], new (class Config {})()]) {
      expect(() => validatePlatformWorkerConfig(value), String(value)).toThrow(/config must be a plain object/);
    }
    expect(() => validatePlatformWorkerConfig({ ...platform, install: null })).toThrow(/config must have exactly the fields/);
    const missing: Record<string, unknown> = { ...platform };
    delete missing["updateMode"];
    expect(() => validatePlatformWorkerConfig(missing)).toThrow(/config must have exactly the fields/);
  });

  it("checks kind, version, scope and update mode", () => {
    expect(() => validatePlatformWorkerConfig({ ...platform, kind: "recovery" })).toThrow(/config\.kind must be "platform"/);
    expect(() => validatePlatformWorkerConfig({ ...platform, version: "1" })).toThrow(/config\.version must be 1/);
    for (const scope of ["/app", "app/", "/app/../", "//app/", "/app/?x"]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, scope }), scope).toThrow(/config\.scope must/);
    }
    for (const updateMode of ["immediate", undefined, "PROMPT"]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, updateMode }), String(updateMode)).toThrow(/config\.updateMode must be "prompt"/);
    }
  });

  it("accepts only a precache cache name with the full contracts structure", () => {
    for (const precacheCacheName of [
      "workbox-precache-v2",
      "pwa:precache",
      "pwa:storefront:production:precache",
      "pwa:storefront:production:r3:runtime",
      "pwa:storefront:production:r3:extra:precache",
      "pwa::production:r3:precache",
      42,
    ]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, precacheCacheName }), String(precacheCacheName)).toThrow(
        /config\.precacheCacheName must have the form/,
      );
    }
  });

  it("requires the complete baseline denials in canonical order", () => {
    const denials = [...REQUEST_BASELINE_DENIALS];
    for (const requestBaselineDenials of [
      denials.slice(1),
      [...denials].reverse(),
      [...denials, "unclassified"],
      [...denials.slice(0, 6), "other"],
      "non-get",
    ]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, requestBaselineDenials })).toThrow(/config\.requestBaselineDenials must list/);
    }
  });

  it("checks every path rule's shape, prefix and action", () => {
    expect(() => validatePlatformWorkerConfig({ ...platform, pathRules: {} })).toThrow(/config\.pathRules must be an array/);
    expect(() => validatePlatformWorkerConfig({ ...platform, pathRules: [null] })).toThrow(/config\.pathRules\[0\] must be a plain object/);
    expect(() =>
      validatePlatformWorkerConfig({ ...platform, pathRules: [{ pathPrefix: "/api", action: "deny", resourceClass: "session-data" }] }),
    ).toThrow(/config\.pathRules\[0\] must have exactly the fields pathPrefix, action/);
    for (const pathPrefix of ["api", "//api", "/a\\b", "/a b", "/api?x", "/api#x", "/a/./b", "/café", "/ "]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, pathRules: [{ pathPrefix, action: "deny" }] }), pathPrefix).toThrow(
        /config\.pathRules\[0\]\.pathPrefix must be a canonical absolute path/,
      );
    }
    for (const action of ["allow", "prompt", "Deny", 1]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, pathRules: [{ pathPrefix: "/api", action }] }), String(action)).toThrow(
        /config\.pathRules\[0\]\.action must be/,
      );
    }
  });

  it("checks the offline fallback shape", () => {
    for (const offlineFallback of [{ enabled: true }, { enabled: false, path: "/offline.html" }, { enabled: "yes" }, null]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, offlineFallback }), JSON.stringify(offlineFallback)).toThrow(
        /config\.offlineFallback/,
      );
    }
    expect(() => validatePlatformWorkerConfig({ ...platform, offlineFallback: { enabled: true, path: "offline.html" } })).toThrow(
      /config\.offlineFallback\.path must be a canonical absolute path/,
    );
  });

  it("checks the closed offline-write shape", () => {
    const enabled = {
      enabled: true,
      databaseName: "pwa-offline-write:storefront:production:r3",
      maxEntries: 10,
      maxTotalBodyBytes: 4096,
      targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
    };
    expect(validatePlatformWorkerConfig({ ...platform, offlineWrites: enabled }).offlineWrites).toEqual(enabled);
    for (const offlineWrites of [
      { enabled: false, targets: [] },
      { ...enabled, databaseName: "other" },
      { ...enabled, maxEntries: 0 },
      { ...enabled, maxTotalBodyBytes: 524_289 },
      { ...enabled, targets: [] },
      { ...enabled, targets: [{ ...enabled.targets[0], pathPrefix: "/other" }] },
      { ...enabled, targets: [{ ...enabled.targets[0], maxBodyBytes: 16_385 }] },
    ]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, offlineWrites }), JSON.stringify(offlineWrites)).toThrow(
        /config\.offlineWrites/,
      );
    }
  });

  it("checks the closed runtime-cache shape", () => {
    const disabled = {
      enabled: false,
      pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
      dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
    };
    const enabled = {
      enabled: true,
      pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
      dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
      dataCacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
      maxEntries: 50,
      maxEntryBytes: 65_536,
      maxAgeSeconds: 300,
      rules: [{ pathPrefix: "/app/api/catalog", resourceClass: "public-data", strategy: "stale-while-revalidate" }],
    };
    expect(validatePlatformWorkerConfig({ ...platform, runtimeCache: disabled }).runtimeCache).toEqual(disabled);
    expect(validatePlatformWorkerConfig({ ...platform, runtimeCache: enabled }).runtimeCache).toEqual(enabled);

    for (const runtimeCache of [
      // Disabled shape: extra or missing fields, and malformed cache names.
      { ...disabled, extra: true },
      { enabled: false },
      { ...disabled, pagesCacheName: "workbox-runtime-pages" },
      { ...disabled, dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data" },
      // Enabled shape: extra/missing fields, a dataCacheName that does not extend the prefix, and out-of-range limits.
      { ...enabled, extra: true },
      { ...disabled, enabled: true },
      { ...enabled, dataCacheName: "pwa:storefront:production:r3:runtime-data-nothex" },
      { ...enabled, dataCacheName: "pwa:other:production:r3:runtime-data-0123456789abcdef" },
      { ...enabled, maxEntries: 0 },
      { ...enabled, maxEntries: 201 },
      { ...enabled, maxEntryBytes: 0 },
      { ...enabled, maxEntryBytes: 1_048_577 },
      { ...enabled, maxAgeSeconds: 59 },
      { ...enabled, maxAgeSeconds: 604_801 },
      { ...enabled, rules: {} },
      { ...enabled, rules: [{ ...enabled.rules[0], resourceClass: "session-data" }] },
      { ...enabled, rules: [{ ...enabled.rules[0], strategy: "cache-first" }] },
      { ...enabled, rules: [{ ...enabled.rules[0], pathPrefix: "not-absolute" }] },
      { ...enabled, rules: [{ ...enabled.rules[0], extra: true }] },
    ]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, runtimeCache }), JSON.stringify(runtimeCache)).toThrow(/config\.runtimeCache/);
    }
  });

  it("accepts networkTimeoutSeconds only within 1-30, and omits it entirely when unset (ADR-0038)", () => {
    expect(validatePlatformWorkerConfig(platform).networkTimeoutSeconds).toBeUndefined();
    expect(Object.hasOwn(validatePlatformWorkerConfig(platform), "networkTimeoutSeconds")).toBe(false);
    expect(validatePlatformWorkerConfig({ ...platform, networkTimeoutSeconds: 1 }).networkTimeoutSeconds).toBe(1);
    expect(validatePlatformWorkerConfig({ ...platform, networkTimeoutSeconds: 30 }).networkTimeoutSeconds).toBe(30);
    for (const networkTimeoutSeconds of [0, 31, 1.5, "5", null]) {
      expect(() => validatePlatformWorkerConfig({ ...platform, networkTimeoutSeconds }), String(networkTimeoutSeconds)).toThrow(
        /config\.networkTimeoutSeconds must be an integer between 1 and 30/,
      );
    }
  });

  it("rejects an explicit networkTimeoutSeconds: undefined (an own key with value undefined is not the same as an absent key)", () => {
    expect(() => validatePlatformWorkerConfig({ ...platform, networkTimeoutSeconds: undefined })).toThrow(
      /config\.networkTimeoutSeconds must be an integer between 1 and 30/,
    );
  });

  it("never echoes input values in messages", () => {
    const secret = "tok_do_not_echo";
    expect(message(() => validatePlatformWorkerConfig({ ...platform, precacheCacheName: `pwa:${secret}` }))).not.toContain(secret);
    expect(message(() => validatePlatformWorkerConfig({ ...platform, pathRules: [{ pathPrefix: `/${secret} x`, action: "deny" }] }))).not.toContain(
      secret,
    );
    expect(message(() => validatePlatformWorkerConfig({ ...platform, [secret]: 1 }))).not.toContain(secret);
  });
});

describe("validateRecoveryWorkerConfig", () => {
  it("returns a fresh copy of a valid config", () => {
    const validated = validateRecoveryWorkerConfig({
      appCachePrefix: recovery.appCachePrefix,
      offlineWriteDatabaseName: recovery.offlineWriteDatabaseName,
      version: 1,
      kind: "recovery",
    });
    expect(validated).toEqual(recovery);
    expect(Object.keys(validated)).toEqual(["kind", "version", "appCachePrefix", "offlineWriteDatabaseName"]);
  });

  it("accepts only the exact app cache prefix structure, so it can never select other apps' caches", () => {
    for (const appCachePrefix of [
      "pwa:",
      "pwa:storefront:",
      "pwa:storefront:production",
      "pwa:storefront:production:r3:",
      "pwa::production:",
      "storefront:production:",
      "",
    ]) {
      expect(() => validateRecoveryWorkerConfig({ ...recovery, appCachePrefix }), appCachePrefix).toThrow(/config\.appCachePrefix must have the form/);
    }
  });

  it("checks kind, version and fields", () => {
    expect(() => validateRecoveryWorkerConfig({ ...recovery, kind: "platform" })).toThrow(/config\.kind must be "recovery"/);
    expect(() => validateRecoveryWorkerConfig({ ...recovery, version: 2 })).toThrow(/config\.version must be 1/);
    expect(() => validateRecoveryWorkerConfig({ ...recovery, scope: "/" })).toThrow(/config must have exactly the fields/);
  });
});

describe("validateWorkerConfig", () => {
  it("validates either config by kind and rejects other kinds", () => {
    expect(validateWorkerConfig(platform)).toEqual(platform);
    expect(validateWorkerConfig(recovery)).toEqual(recovery);
    expect(() => validateWorkerConfig({ ...recovery, kind: "push" })).toThrow(/config\.kind must be "platform" or "recovery"/);
    expect(() => validateWorkerConfig(null)).toThrow(/config must be a plain object/);
  });
});
