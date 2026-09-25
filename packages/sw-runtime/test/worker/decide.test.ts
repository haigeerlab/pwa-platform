import { describe, expect, it } from "vitest";
import type { PwaPlatformWorkerConfig } from "../../src/shared/config.js";
import { createRouter } from "../../src/worker/decide.js";

const ORIGIN = "https://shop.example.com";
const MANIFEST = ["/app/assets/app.3f9a2c7d.js", "/app/assets/logo.svg", "/app/index.html", "/app/offline.html"];

const config: PwaPlatformWorkerConfig = {
  kind: "platform",
  version: 1,
  scope: "/app/",
  precacheCacheName: "pwa:storefront:production:r3:precache",
  requestBaselineDenials: ["non-get", "cross-origin", "no-store", "opaque-response", "redirect", "websocket", "unclassified"],
  pathRules: [
    { pathPrefix: "/app/api/account", action: "deny" },
    { pathPrefix: "/app/live", action: "deny" },
    { pathPrefix: "/app/assets", action: "cache-first" },
    { pathPrefix: "/app", action: "network-first" },
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

const router = createRouter({ config, manifestUrls: MANIFEST, origin: ORIGIN });

function decide(
  url: string,
  options: { readonly method?: string; readonly navigation?: boolean; readonly range?: boolean; readonly authorization?: boolean } = {},
): ReturnType<typeof router.decide> {
  return router.decide({
    method: options.method ?? "GET",
    url,
    navigation: options.navigation ?? false,
    range: options.range ?? false,
    authorization: options.authorization ?? false,
  });
}

describe("requests the worker never handles", () => {
  it("passes through everything that is not a GET", () => {
    for (const method of ["POST", "PUT", "DELETE", "HEAD", "get"]) {
      expect(decide(`${ORIGIN}/app/assets/logo.svg`, { method }), method).toEqual({ kind: "passthrough", reason: "non-get" });
    }
  });

  it("passes through other origins, including a precached path on another host", () => {
    expect(decide("https://cdn.example.com/app/assets/logo.svg")).toEqual({ kind: "passthrough", reason: "cross-origin" });
    expect(decide("http://shop.example.com/app/assets/logo.svg")).toEqual({ kind: "passthrough", reason: "cross-origin" });
  });

  it("passes through URLs it cannot parse", () => {
    expect(decide("not a url")).toEqual({ kind: "passthrough", reason: "unparsable" });
  });

  it("passes through paths no rule matches", () => {
    for (const path of ["/other/index.html", "/", "/appendix/x.js"]) {
      expect(decide(`${ORIGIN}${path}`), path).toEqual({ kind: "passthrough", reason: "unclassified" });
    }
  });

  it("passes through denied paths that are not navigations", () => {
    for (const path of ["/app/api/account", "/app/api/account/profile", "/app/live/stream.m3u8"]) {
      expect(decide(`${ORIGIN}${path}`), path).toEqual({ kind: "passthrough", reason: "denied" });
    }
  });

  it("passes through allowed requests the plan does not precache", () => {
    expect(decide(`${ORIGIN}/app/assets/missing.js`)).toEqual({ kind: "passthrough", reason: "not-precached" });
    // The query string is part of the key, so a variant of a precached URL is not precached itself.
    expect(decide(`${ORIGIN}/app/assets/logo.svg?v=2`)).toEqual({ kind: "passthrough", reason: "not-precached" });
  });
});

describe("precache hits", () => {
  it("reads the exact manifest URL", () => {
    expect(decide(`${ORIGIN}/app/assets/logo.svg`)).toEqual({ kind: "precache", manifestUrl: "/app/assets/logo.svg" });
    expect(decide(`${ORIGIN}/app/assets/app.3f9a2c7d.js`)).toEqual({ kind: "precache", manifestUrl: "/app/assets/app.3f9a2c7d.js" });
    // Path rules match on the decoded key, but manifest membership is an exact string, so an encoded spelling of a
    // precached URL is not a precache hit.
    expect(decide(`${ORIGIN}/app/%61ssets/logo.svg`)).toEqual({ kind: "passthrough", reason: "not-precached" });
  });

  it("does not change when range is false", () => {
    expect(decide(`${ORIGIN}/app/assets/logo.svg`, { range: false })).toEqual({ kind: "precache", manifestUrl: "/app/assets/logo.svg" });
  });
});

describe("range requests (ADR-0023)", () => {
  it("passes through a manifest-hit, non-navigation request that carries Range", () => {
    expect(decide(`${ORIGIN}/app/assets/logo.svg`, { range: true })).toEqual({ kind: "passthrough", reason: "range" });
    expect(decide(`${ORIGIN}/app/assets/app.3f9a2c7d.js`, { range: true })).toEqual({ kind: "passthrough", reason: "range" });
  });

  it("keeps the original reason for a Range request that would not have been a precache hit anyway", () => {
    expect(decide(`${ORIGIN}/app/api/account`, { range: true })).toEqual({ kind: "passthrough", reason: "denied" });
    expect(decide(`${ORIGIN}/other/page`, { range: true })).toEqual({ kind: "passthrough", reason: "unclassified" });
    expect(decide(`${ORIGIN}/app/assets/missing.js`, { range: true })).toEqual({ kind: "passthrough", reason: "not-precached" });
    expect(decide("https://cdn.example.com/app/assets/logo.svg", { range: true })).toEqual({ kind: "passthrough", reason: "cross-origin" });
    expect(decide(`${ORIGIN}/app/assets/logo.svg`, { range: true, method: "POST" })).toEqual({ kind: "passthrough", reason: "non-get" });

    const root = createRouter({
      config: { ...config, pathRules: [{ pathPrefix: "/app/m", action: "exclude" }, ...config.pathRules] },
      manifestUrls: [...MANIFEST, "/app/m/index.html"],
      origin: ORIGIN,
    });
    expect(root.decide({ method: "GET", url: `${ORIGIN}/app/m/index.html`, navigation: false, range: true, authorization: false })).toEqual({
      kind: "passthrough",
      reason: "excluded",
    });
  });

  it("ignores range on navigations", () => {
    expect(decide(`${ORIGIN}/app/`, { navigation: true, range: true, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/index.html", "/app/offline.html"],
    });
    expect(decide(`${ORIGIN}/app/products/42`, { navigation: true, range: true, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/offline.html"],
    });
  });
});

describe("navigations", () => {
  it("falls back to the requested URL, then index.html under a directory, then the offline page", () => {
    expect(decide(`${ORIGIN}/app/`, { navigation: true })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/index.html", "/app/offline.html"],
    });
    expect(decide(`${ORIGIN}/app/index.html`, { navigation: true })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/index.html", "/app/offline.html"],
    });
    expect(decide(`${ORIGIN}/app/products/42`, { navigation: true })).toEqual({ kind: "navigate", fallbacks: ["/app/offline.html"] });
  });

  it("tries the same route's index.html with or without a trailing slash", () => {
    const withGuide = createRouter({ config, manifestUrls: [...MANIFEST, "/app/guide/index.html"], origin: ORIGIN });
    const guide = (url: string) => withGuide.decide({ method: "GET", url, navigation: true, range: false, authorization: false });
    expect(guide(`${ORIGIN}/app/guide`)).toEqual({ kind: "navigate", fallbacks: ["/app/guide/index.html", "/app/offline.html"] });
    expect(guide(`${ORIGIN}/app/guide/`)).toEqual({ kind: "navigate", fallbacks: ["/app/guide/index.html", "/app/offline.html"] });
    // ADR-0034 (2026-09-23) reversed this: a decorated URL used to skip its own precached document and land on the
    // offline page solely because of its query string (the entry-recovery page's return-path query was the real
    // case). The exact candidate still misses first, but the query-dropped route document now answers instead.
    expect(guide(`${ORIGIN}/app/guide?ref=mail`)).toEqual({ kind: "navigate", fallbacks: ["/app/guide/index.html", "/app/offline.html"] });
    // Only the route's own file: a sibling route's index.html is never a candidate, query string or not.
    expect(guide(`${ORIGIN}/app/guides`)).toEqual({ kind: "navigate", fallbacks: ["/app/offline.html"] });
    expect(guide(`${ORIGIN}/app/guides?ref=mail`)).toEqual({ kind: "navigate", fallbacks: ["/app/offline.html"] });
    // Without a precached index.html for the route, nothing but the offline page remains.
    expect(decide(`${ORIGIN}/app/products`, { navigation: true })).toEqual({ kind: "navigate", fallbacks: ["/app/offline.html"] });
  });

  it("drops the query string on the fallback candidates once the exact match misses (ADR-0034)", () => {
    // The shell URL's directory pathname has no manifest entry of its own, only its index.html: the query-dropped
    // route document still answers instead of jumping straight to the offline page.
    expect(decide(`${ORIGIN}/app/?utm_source=mail`, { navigation: true })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/index.html", "/app/offline.html"],
    });
    // A query-decorated URL whose pathname (with or without /index.html) is not in the manifest still lands on the
    // offline page: dropping the query string never invents a candidate for a route that was never precached.
    expect(decide(`${ORIGIN}/app/products/42?ref=mail`, { navigation: true })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/offline.html"],
    });
  });

  it("still prefers an exact query-string match over the query-dropped candidates", () => {
    const withQueryVariant = createRouter({
      config,
      manifestUrls: [...MANIFEST, "/app/guide", "/app/guide?ref=mail"],
      origin: ORIGIN,
    });
    // The precached query-string variant is the first candidate and wins even though the query-dropped pathname is
    // also precached: exact match is never skipped just because a new fallback candidate exists.
    expect(withQueryVariant.decide({ method: "GET", url: `${ORIGIN}/app/guide?ref=mail`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/guide?ref=mail", "/app/guide", "/app/offline.html"],
    });
  });

  it("lists each fallback once", () => {
    expect(decide(`${ORIGIN}/app/offline.html`, { navigation: true })).toEqual({ kind: "navigate", fallbacks: ["/app/offline.html"] });
  });

  it("lets a denied navigation fall back to the offline page and to nothing else", () => {
    // Even a precached file under the denied path must not answer: the offline page is the only candidate.
    const withShadow = createRouter({ config, manifestUrls: [...MANIFEST, "/app/api/account/index.html"], origin: ORIGIN });
    for (const path of ["/app/api/account", "/app/api/account/", "/app/api/account/profile", "/app/live/stream.m3u8"]) {
      expect(withShadow.decide({ method: "GET", url: `${ORIGIN}${path}`, navigation: true, range: false, authorization: false }), path).toEqual({
        kind: "navigate",
        fallbacks: ["/app/offline.html"],
      });
    }
  });

  it("passes a denied navigation through when there is no offline page to offer", () => {
    const disabled = createRouter({ config: { ...config, offlineFallback: { enabled: false } }, manifestUrls: MANIFEST, origin: ORIGIN });
    expect(disabled.decide({ method: "GET", url: `${ORIGIN}/app/api/account`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "passthrough",
      reason: "denied",
    });
    const unprecached = createRouter({ config, manifestUrls: MANIFEST.filter((url) => url !== "/app/offline.html"), origin: ORIGIN });
    expect(unprecached.decide({ method: "GET", url: `${ORIGIN}/app/api/account`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "passthrough",
      reason: "denied",
    });
  });

  it("never answers an excluded path, navigation or not, even where a deny rule would fall back", () => {
    // A shared-origin root's plan: its child app's scope is excluded ahead of every other rule (ADR-0019).
    const root = createRouter({
      config: { ...config, pathRules: [{ pathPrefix: "/app/m", action: "exclude" }, ...config.pathRules] },
      manifestUrls: [...MANIFEST, "/app/m/index.html"],
      origin: ORIGIN,
    });
    for (const path of ["/app/m", "/app/m/", "/app/m/index.html", "/app/m/assets/app.js"]) {
      for (const navigation of [true, false]) {
        expect(root.decide({ method: "GET", url: `${ORIGIN}${path}`, navigation, range: false, authorization: false }), `${path} ${navigation}`).toEqual({
          kind: "passthrough",
          reason: "excluded",
        });
      }
    }
    // The contrast with deny: a denied navigation on the same worker falls back to the offline page.
    expect(root.decide({ method: "GET", url: `${ORIGIN}/app/api/account`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/offline.html"],
    });
    // Only whole segments: a sibling path that merely starts with the same letters is the root's own.
    expect(root.decide({ method: "GET", url: `${ORIGIN}/app/mx`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/offline.html"],
    });
  });

  it("still passes through navigations no rule matches", () => {
    expect(decide(`${ORIGIN}/other/page`, { navigation: true })).toEqual({ kind: "passthrough", reason: "unclassified" });
  });

  it("has no fallback when the plan disables the offline page", () => {
    const withoutFallback = createRouter({
      config: { ...config, offlineFallback: { enabled: false } },
      manifestUrls: MANIFEST,
      origin: ORIGIN,
    });
    expect(withoutFallback.decide({ method: "GET", url: `${ORIGIN}/app/products/42`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: [],
    });
    expect(withoutFallback.decide({ method: "GET", url: `${ORIGIN}/app/`, navigation: true, range: false, authorization: false })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/index.html"],
    });
  });
});

describe("runtime cache decisions (T7)", () => {
  const runtimeConfig: PwaPlatformWorkerConfig = {
    ...config,
    pathRules: [
      { pathPrefix: "/app/api/account", action: "deny" },
      { pathPrefix: "/app/live", action: "deny" },
      { pathPrefix: "/app/api/catalog", action: "stale-while-revalidate" },
      { pathPrefix: "/app/articles", action: "network-first" },
      { pathPrefix: "/app/assets", action: "cache-first" },
      { pathPrefix: "/app", action: "network-first" },
    ],
    runtimeCache: {
      enabled: true,
      pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
      dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
      dataCacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
      maxEntries: 50,
      maxEntryBytes: 65_536,
      maxAgeSeconds: 300,
      rules: [
        { pathPrefix: "/app/api/catalog", resourceClass: "public-data", strategy: "stale-while-revalidate" },
        { pathPrefix: "/app/articles", resourceClass: "navigation-public-dynamic", strategy: "network-first" },
      ],
    },
  };
  const runtimeManifest = [...MANIFEST, "/app/api/catalog/cached.json"];
  const runtimeRouter = createRouter({ config: runtimeConfig, manifestUrls: runtimeManifest, origin: ORIGIN });

  function runtimeDecide(
    url: string,
    options: { readonly navigation?: boolean; readonly range?: boolean; readonly authorization?: boolean } = {},
  ): ReturnType<typeof runtimeRouter.decide> {
    return runtimeRouter.decide({
      method: "GET",
      url,
      navigation: options.navigation ?? false,
      range: options.range ?? false,
      authorization: options.authorization ?? false,
    });
  }

  it("serves a non-navigation, non-manifest request under a public-data rule from the data runtime cache", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/latest.json`)).toEqual({
      kind: "runtime",
      cache: "data",
      strategy: "stale-while-revalidate",
      resourceClass: "public-data",
      fallbacks: [],
    });
  });

  it("passes a Range request through, ahead of the runtime cache", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/latest.json`, { range: true })).toEqual({ kind: "passthrough", reason: "range" });
  });

  it("passes an Authorization request through, ahead of the runtime cache", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/latest.json`, { authorization: true })).toEqual({ kind: "passthrough", reason: "authorization" });
  });

  it("prefers Range over Authorization when a request carries both", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/latest.json`, { range: true, authorization: true })).toEqual({
      kind: "passthrough",
      reason: "range",
    });
  });

  it("still answers a manifest hit under a public-data rule from the precache, never the runtime cache", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/cached.json`)).toEqual({ kind: "precache", manifestUrl: "/app/api/catalog/cached.json" });
    // Range on a manifest hit keeps its precache-adjacent reason (ADR-0023), not "authorization" or the data engine.
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/cached.json`, { range: true })).toEqual({ kind: "passthrough", reason: "range" });
  });

  it("serves a navigation under a navigation-public-dynamic rule from the pages runtime cache, with the usual navigation fallbacks", () => {
    expect(runtimeDecide(`${ORIGIN}/app/articles/42`, { navigation: true })).toEqual({
      kind: "runtime",
      cache: "pages",
      strategy: "network-first",
      resourceClass: "navigation-public-dynamic",
      fallbacks: ["/app/offline.html"],
    });
  });

  it("ignores Range and Authorization for a runtime-cache navigation, exactly as an ordinary navigation does", () => {
    expect(runtimeDecide(`${ORIGIN}/app/articles/42`, { navigation: true, range: true, authorization: true })).toEqual({
      kind: "runtime",
      cache: "pages",
      strategy: "network-first",
      resourceClass: "navigation-public-dynamic",
      fallbacks: ["/app/offline.html"],
    });
  });

  it("leaves a navigation under a public-data rule exactly as it behaves without runtime caching", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/catalog/latest.json`, { navigation: true })).toEqual({
      kind: "navigate",
      fallbacks: ["/app/offline.html"],
    });
  });

  it("leaves a non-navigation request under a navigation-public-dynamic (page) rule exactly as it behaves without runtime caching", () => {
    expect(runtimeDecide(`${ORIGIN}/app/articles/42`)).toEqual({ kind: "passthrough", reason: "not-precached" });
  });

  it("keeps the deny and exclude precedence ahead of the runtime cache", () => {
    expect(runtimeDecide(`${ORIGIN}/app/api/account`)).toEqual({ kind: "passthrough", reason: "denied" });
    const excludingRuntime = createRouter({
      config: { ...runtimeConfig, pathRules: [{ pathPrefix: "/app/api/catalog", action: "exclude" }, ...runtimeConfig.pathRules] },
      manifestUrls: runtimeManifest,
      origin: ORIGIN,
    });
    expect(excludingRuntime.decide({ method: "GET", url: `${ORIGIN}/app/api/catalog/latest.json`, navigation: false, range: false, authorization: false })).toEqual({
      kind: "passthrough",
      reason: "excluded",
    });
  });

  it("never turns a v1/v2 (runtimeCache disabled) network-first rule into a runtime decision", () => {
    // The base `config` fixture has no runtimeCache.rules at all (enabled: false); "/app" is a catch-all
    // network-first rule, same action as a runtime data rule would use, yet a non-manifest hit still just passes
    // through as it always has.
    expect(decide(`${ORIGIN}/app/some-other-page`)).toEqual({ kind: "passthrough", reason: "not-precached" });
  });
});

describe("shared-origin: a child app's exclude rule beats a broader root runtime-cache rule (T10)", () => {
  // ADR-0019's registry gives a root app's child scope its own `exclude` pathRule, ahead of every other rule
  // (compiled by core, not by hand here). This pins the property the ADR asks for at the router level: the root's
  // own runtime-cache rule sits at "/app", a prefix that also covers "/app/m" — so a lookup keyed only on
  // `pathname.startsWith(...)`, rather than on the one rule `matcher.match` actually picked, would wrongly treat a
  // child-app request as the root's own runtime-cache traffic. Root's `exclude` for "/app/m" must win regardless.
  const runtimePagesConfig = "pwa:storefront:production:r3:runtime-pages";
  const runtimeDataPrefix = "pwa:storefront:production:r3:runtime-data-";

  it("never turns a subresource under an excluded child prefix into a runtime decision (public-data at the root)", () => {
    const sharedOriginConfig: PwaPlatformWorkerConfig = {
      ...config,
      pathRules: [
        { pathPrefix: "/app/m", action: "exclude" },
        { pathPrefix: "/app", action: "stale-while-revalidate" },
      ],
      runtimeCache: {
        enabled: true,
        pagesCacheName: runtimePagesConfig,
        dataCacheNamePrefix: runtimeDataPrefix,
        dataCacheName: `${runtimeDataPrefix}0123456789abcdef`,
        maxEntries: 50,
        maxEntryBytes: 65_536,
        maxAgeSeconds: 300,
        rules: [{ pathPrefix: "/app", resourceClass: "public-data", strategy: "stale-while-revalidate" }],
      },
    };
    const router = createRouter({ config: sharedOriginConfig, manifestUrls: MANIFEST, origin: ORIGIN });

    expect(
      router.decide({ method: "GET", url: `${ORIGIN}/app/m/data.json`, navigation: false, range: false, authorization: false }),
    ).toEqual({ kind: "passthrough", reason: "excluded" });
  });

  it("never turns a navigation under an excluded child prefix into a runtime decision (navigation-public-dynamic at the root)", () => {
    const sharedOriginConfig: PwaPlatformWorkerConfig = {
      ...config,
      pathRules: [
        { pathPrefix: "/app/m", action: "exclude" },
        { pathPrefix: "/app", action: "network-first" },
      ],
      runtimeCache: {
        enabled: true,
        pagesCacheName: runtimePagesConfig,
        dataCacheNamePrefix: runtimeDataPrefix,
        dataCacheName: `${runtimeDataPrefix}0123456789abcdef`,
        maxEntries: 50,
        maxEntryBytes: 65_536,
        maxAgeSeconds: 300,
        rules: [{ pathPrefix: "/app", resourceClass: "navigation-public-dynamic", strategy: "network-first" }],
      },
    };
    const router = createRouter({ config: sharedOriginConfig, manifestUrls: MANIFEST, origin: ORIGIN });

    expect(
      router.decide({ method: "GET", url: `${ORIGIN}/app/m/page`, navigation: true, range: false, authorization: false }),
    ).toEqual({ kind: "passthrough", reason: "excluded" });
  });
});
