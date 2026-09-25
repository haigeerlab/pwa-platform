import { describe, expect, it } from "vitest";
import { CACHE_KINDS, appCachePrefix, cacheName, cacheNamespacePrefix, runtimeDataCacheName } from "../src/index.js";
import { identity } from "./fixtures.js";

describe("cache namespace naming", () => {
  it("formats names as pwa:<appId>:<environment>:<identity-revision>:<cacheKind>", () => {
    expect(CACHE_KINDS).toEqual(["precache", "runtime-pages", "runtime-data"]);
    expect(appCachePrefix(identity)).toBe("pwa:shop:production:");
    expect(cacheNamespacePrefix(identity)).toBe("pwa:shop:production:r1:");
    expect(cacheName(identity, "precache")).toBe("pwa:shop:production:r1:precache");
    expect(cacheName(identity, "runtime-pages")).toBe("pwa:shop:production:r1:runtime-pages");
  });

  it("appends the configDigest to the runtime-data cache name", () => {
    expect(runtimeDataCacheName(identity, "0123456789abcdef")).toBe(
      "pwa:shop:production:r1:runtime-data-0123456789abcdef",
    );
  });

  it("keeps every cache kind name under both the namespace and app cache prefixes", () => {
    for (const kind of CACHE_KINDS) {
      const name = kind === "runtime-data" ? runtimeDataCacheName(identity, "0123456789abcdef") : cacheName(identity, kind);
      expect(name.startsWith(cacheNamespacePrefix(identity))).toBe(true);
      expect(name.startsWith(appCachePrefix(identity))).toBe(true);
    }
  });

  it("percent-encodes every segment so none contains the separator", () => {
    const tricky = { ...identity, appId: "Shop:production", cacheNamespaceSeed: "r1%3A店" };
    expect(cacheNamespacePrefix(tricky)).toBe("pwa:Shop%3Aproduction:production:r1%253A%E5%BA%97:");
  });

  it("keeps namespaces of different apps and environments disjoint", () => {
    const appIds = ["shop", "Shop", "shop-x", "shop:production", "shop%3Aproduction", "a:b", "店", "pwa"];
    const environments = ["production", "production-2", "staging"];
    const seeds = ["r1", "r10", "r1:", "%", "r1:precache"];
    const identities = appIds.flatMap((appId) =>
      environments.flatMap((environment) =>
        seeds.map((cacheNamespaceSeed) => ({ ...identity, appId, environment, cacheNamespaceSeed })),
      ),
    );

    const violations: string[] = [];
    for (const a of identities) {
      const ownName = cacheName(a, "precache");
      if (!ownName.startsWith(cacheNamespacePrefix(a)) || !ownName.startsWith(appCachePrefix(a))) {
        violations.push(`own prefixes do not cover ${ownName}`);
      }
      for (const b of identities) {
        if (a === b) continue;
        const sameAppAndEnvironment = a.appId === b.appId && a.environment === b.environment;
        if (cacheNamespacePrefix(b).startsWith(cacheNamespacePrefix(a))) {
          violations.push(`${cacheNamespacePrefix(a)} nests in ${cacheNamespacePrefix(b)}`);
        }
        if (cacheName(b, "precache").startsWith(appCachePrefix(a)) !== sameAppAndEnvironment) {
          violations.push(`${appCachePrefix(a)} vs ${cacheName(b, "precache")}`);
        }
      }
    }
    expect(identities).toHaveLength(120);
    expect(violations).toEqual([]);
  });

  it("is deterministic", () => {
    expect(cacheName({ ...identity }, "precache")).toBe(cacheName(structuredClone(identity), "precache"));
  });

  it("throws URIError for segments that validateIdentity rejects", () => {
    expect(() => cacheNamespacePrefix({ ...identity, appId: "shop\uD800" })).toThrow(URIError);
  });

  it("only accepts platform cache kinds", () => {
    // @ts-expect-error runtime caching is not a v1 cache kind
    const runtime = () => cacheName(identity, "runtime");
    void runtime;
  });
});
