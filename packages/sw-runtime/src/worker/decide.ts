// The platform worker's request decision table, as a pure function: no events, no caches, no network. The fetch
// listener only carries out what `decide` returns, so every row is testable in Node.
import type { PwaPlatformWorkerConfig, PwaWorkerRuntimeCacheRule } from "../shared/config.js";
import { createPathMatcher } from "../shared/path-match.js";

export type PwaPassthroughReason =
  /** Baseline denials that are visible on the request itself. */
  | "non-get"
  | "cross-origin"
  /**
   * The first matching path rule is a shared-origin root's exclude rule: the path belongs to a child app on the same
   * origin, and this worker answers nothing there — not even an offline page, unlike `denied` (ADR-0019).
   */
  | "excluded"
  /**
   * The first matching path rule denies caching. A denied *navigation* is only passed through when there is no
   * offline page to fall back to; otherwise it is a `navigate` decision whose only fallback is that page.
   */
  | "denied"
  | "unclassified"
  /** An allowed request the plan does not precache; the platform has no runtime cache in v1. */
  | "not-precached"
  /** A URL the worker cannot parse. */
  | "unparsable"
  /**
   * A manifest-hit, non-navigation request that carries a `Range` header (any value). The precache stores full
   * responses, so `engine.match` cannot answer with a genuine partial response; the network answers instead
   * (ADR-0023). Only used where the decision would otherwise be `precache`: a denied, excluded, unclassified or
   * not-precached request keeps its own reason. Also used for a `Range` request under a runtime-cache `public-data`
   * rule, for the same reason.
   */
  | "range"
  /**
   * A non-navigation request under a runtime-cache `public-data` rule that carries an `Authorization` header. The
   * runtime cache never reads or writes a request whose response could be credential-specific (spec "请求判断").
   */
  | "authorization";

export type PwaRequestDecision =
  /** The worker does not call `respondWith`: the request behaves exactly as it would without a worker. */
  | { readonly kind: "passthrough"; readonly reason: PwaPassthroughReason }
  /** Read this exact manifest URL from the precache. */
  | { readonly kind: "precache"; readonly manifestUrl: string }
  /**
   * Network first; only when the network fails, try `fallbacks` in order, then fail. Nothing is ever written to a
   * cache on this path, whatever the network returns.
   */
  | { readonly kind: "navigate"; readonly fallbacks: readonly string[] }
  /**
   * The request matches a compiled runtime-cache rule: `cache: "pages"` for a navigation under a
   * `navigation-public-dynamic` rule (whose `fallbacks` are exactly what a `navigate` decision for the same request
   * would carry), `cache: "data"` for a non-navigation request under a `public-data` rule (`fallbacks: []`, the page
   * gets a network error when nothing cached answers).
   */
  | {
      readonly kind: "runtime";
      readonly cache: "pages" | "data";
      readonly strategy: "network-first" | "stale-while-revalidate";
      readonly resourceClass: "public-data" | "navigation-public-dynamic";
      readonly fallbacks: readonly string[];
    };

export type PwaRequestInput = {
  readonly method: string;
  /** Absolute request URL. */
  readonly url: string;
  /** `request.mode === "navigate"`. */
  readonly navigation: boolean;
  /** `request.headers.has("range")`, whatever the header's value. Ignored for navigations (ADR-0023). */
  readonly range: boolean;
  /** `request.headers.has("authorization")`, whatever the header's value. Only acted on for a `public-data` rule. */
  readonly authorization: boolean;
};

export type PwaRouterOptions = {
  readonly config: PwaPlatformWorkerConfig;
  /** The injected manifest's URLs, as the engine reports them (paths, without a query). */
  readonly manifestUrls: readonly string[];
  /** The worker's own origin; every other origin is a baseline denial. */
  readonly origin: string;
};

export type PwaRouter = { decide(request: PwaRequestInput): PwaRequestDecision };

const PASSTHROUGH = (reason: PwaPassthroughReason): PwaRequestDecision => ({ kind: "passthrough", reason });

export function createRouter({ config, manifestUrls, origin }: PwaRouterOptions): PwaRouter {
  const matcher = createPathMatcher(config.pathRules);
  const manifest = new Set(manifestUrls);
  // Keyed by pathPrefix, the same key `matcher` resolves on: `config.runtimeCache.rules` is compiled from the same
  // ordered path rules, filtered to the ones the runtime cache executes, so a pathPrefix match here is always the
  // exact rule `matcher` itself would have picked — no second longest-prefix search is needed.
  const runtimeRules = new Map<string, PwaWorkerRuntimeCacheRule>(
    config.runtimeCache.enabled ? config.runtimeCache.rules.map((rule) => [rule.pathPrefix, rule]) : [],
  );

  return {
    decide({ method, url, navigation, range, authorization }): PwaRequestDecision {
      if (method !== "GET") return PASSTHROUGH("non-get");
      if (!URL.canParse(url)) return PASSTHROUGH("unparsable");
      const requested = new URL(url);
      if (requested.origin !== origin) return PASSTHROUGH("cross-origin");

      const rule = matcher.match(requested.pathname);
      if (rule === undefined) return PASSTHROUGH("unclassified");
      // Checked before `deny` on purpose: a denied navigation may fall back to the offline page, an excluded one never
      // may — that page belongs to this app, and the excluded path belongs to another app on the same origin.
      if (rule.action === "exclude") return PASSTHROUGH("excluded");
      if (rule.action === "deny") {
        // A denied navigation still never touches a cache: the network answers whenever it responds at all, and only
        // a failed request falls back — to the offline page, never to anything cached for this path, since a
        // denied path has nothing in the precache (ADR-0012, 2026-09-17 amendment). Without an offline page there
        // is nothing to offer, so the worker stays out of the way exactly as before.
        const offline = navigation ? offlineFallback(config, manifest) : undefined;
        return offline === undefined ? PASSTHROUGH("denied") : { kind: "navigate", fallbacks: [offline] };
      }

      const runtimeRule = runtimeRules.get(rule.pathPrefix);

      if (navigation) {
        const fallbacks = navigationFallbacks(config, manifest, requested);
        // Only a navigation-public-dynamic rule turns a navigation into a runtime decision; a navigation under a
        // public-data rule behaves exactly as it does without runtime caching.
        if (runtimeRule !== undefined && runtimeRule.resourceClass === "navigation-public-dynamic") {
          return { kind: "runtime", cache: "pages", strategy: runtimeRule.strategy, resourceClass: runtimeRule.resourceClass, fallbacks };
        }
        return { kind: "navigate", fallbacks };
      }

      // The manifest is the precache's membership list, so the decision stays synchronous; the query string is part
      // of the key, so `?utm=…` variants of a precached URL are not precached themselves. A manifest hit always
      // wins over the runtime cache.
      const exact = `${requested.pathname}${requested.search}`;
      if (!manifest.has(exact)) {
        // Only a public-data rule turns a non-navigation request into a runtime decision; a non-navigation request
        // under a navigation-public-dynamic (page) rule behaves exactly as it does without runtime caching.
        if (runtimeRule !== undefined && runtimeRule.resourceClass === "public-data") {
          if (range) return PASSTHROUGH("range");
          if (authorization) return PASSTHROUGH("authorization");
          return { kind: "runtime", cache: "data", strategy: runtimeRule.strategy, resourceClass: runtimeRule.resourceClass, fallbacks: [] };
        }
        return PASSTHROUGH("not-precached");
      }
      // The precache holds full responses, so a Range request would otherwise get a full 200 body instead of a 206;
      // stepping aside here lets the network answer it directly (ADR-0023). Navigations never look at range.
      return range ? PASSTHROUGH("range") : { kind: "precache", manifestUrl: exact };
    },
  };
}

/**
 * What an offline navigation may fall back to, in order: the requested URL itself (query string intact), the same
 * route with the query string dropped, that route's `index.html` (query string dropped), and finally the plan's
 * offline fallback page. Nothing else: no other route's cached content may answer a navigation.
 *
 * The exact, query-preserving candidate is tried first so a precached query-string variant still wins when one
 * exists. Only once that misses does the query string get dropped (ADR-0034, 2026-09-23 amendment): a decorated URL
 * — for example a return-path query on an entry-recovery link — used to skip its own precached document and land on
 * the offline page solely because of its query string. Dropping the query string on the fallback candidates lets it
 * reach that document instead, while still never answering with a different route's cached content.
 *
 * The route's `index.html` is tried for URLs with and without a trailing slash. Frameworks that prerender write
 * `about/index.html` but link to `/about` (Nuxt does by default), and a static host serves both spellings from that
 * one file, so both name the same route (ADR-0012, 2026-09-17 amendment).
 */
function navigationFallbacks(config: PwaPlatformWorkerConfig, manifest: ReadonlySet<string>, requested: URL): readonly string[] {
  const { pathname, search } = requested;
  const candidates = [`${pathname}${search}`, pathname];
  candidates.push(pathname.endsWith("/") ? `${pathname}index.html` : `${pathname}/index.html`);
  const offline = offlineFallback(config, manifest);
  if (offline !== undefined) candidates.push(offline);
  return [...new Set(candidates.filter((candidate) => manifest.has(candidate)))];
}

/** The offline page, when the plan enables one and the precache holds it. */
function offlineFallback(config: PwaPlatformWorkerConfig, manifest: ReadonlySet<string>): string | undefined {
  return config.offlineFallback.enabled && manifest.has(config.offlineFallback.path) ? config.offlineFallback.path : undefined;
}
