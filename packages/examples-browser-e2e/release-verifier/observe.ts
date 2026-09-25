// Observes the response headers `verifyResponseHeaders` (build-verifier's headers.ts) actually looks up: the
// worker, the manifest, and every fingerprinted precache entry (`revision === null`) — nothing more, nothing less,
// so this tool never claims to have observed a path the checker never consults.
//
// A single direct request per path, never following a redirect: a browser refuses to register a Service Worker (or
// trust a manifest, or precache an asset) reached through a redirect, so only a direct HTTP 200 counts as an
// observation. A redirect or non-200 is recorded in `unresolved` (status, `Location` if any, reason) and the path is
// left out of `observed` entirely — never synthesized from wherever the redirect happened to lead — so
// `verifyResponseHeaders` reports `verify.header-unreadable` for it honestly.
import type { PwaObservedResponses } from "@pwa-platform/build-verifier";
import type { PwaPlan } from "@pwa-platform/contracts";
import {
  fetchFollowingRedirects,
  fetchWithoutFollowingRedirects,
  DEFAULT_REQUEST_TIMEOUT_MS,
  type PwaRedirectHop,
} from "./fetch-utils.ts";

/** The exact path set `verifyResponseHeaders` reads headers for (see build-verifier/src/headers.ts). */
export function requiredHeaderPaths(plan: PwaPlan): readonly string[] {
  const paths = new Set<string>([plan.identity.serviceWorkerUrl, plan.identity.manifestUrl]);
  for (const entry of plan.precache) if (entry.revision === null) paths.add(entry.url);
  return [...paths];
}

/**
 * The exact public HTML path set `verifyHtmlHeaders` judges (build-verifier/src/html-headers.ts): the mount path;
 * the install start URL, when the plan carries install metadata; the offline fallback page, when enabled; and
 * every precache entry with a non-null revision whose URL ends in `.html` — a fingerprinted (`revision: null`)
 * `.html` entry belongs to `requiredHeaderPaths` instead, because its URL changes with its content. A path named
 * by more than one field is kept once, at its first occurrence — the same "first field wins" dedup
 * `verifyHtmlHeaders` applies — so the two stay aligned by construction (module spec, "路径集合与 verifyHtmlHeaders
 * 一致").
 */
export function requiredHtmlHeaderPaths(plan: PwaPlan): readonly string[] {
  const paths = new Set<string>([plan.identity.mountPath]);
  if (plan.install !== null) paths.add(plan.install.startUrl);
  if (plan.offlineFallback.enabled) paths.add(plan.offlineFallback.path);
  for (const entry of plan.precache) {
    if (entry.revision !== null && entry.url.endsWith(".html")) paths.add(entry.url);
  }
  return [...paths];
}

export type PwaHeaderObservationFailure = { readonly reason: string; readonly status?: number; readonly location?: string };

export type PwaObserveHeadersResult = {
  /** Only paths whose response was a direct HTTP 200 — never a path reached through a redirect. */
  readonly observed: PwaObservedResponses;
  /** Every required path that was NOT observed, and why (redirect, non-200 status, or timeout/network failure). */
  readonly unresolved: Readonly<Record<string, PwaHeaderObservationFailure>>;
};

export async function observeHeaders(
  origin: string,
  plan: PwaPlan,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PwaObserveHeadersResult> {
  const observed: Record<string, Readonly<Record<string, string>>> = {};
  const unresolved: Record<string, PwaHeaderObservationFailure> = {};

  for (const path of requiredHeaderPaths(plan)) {
    const outcome = await fetchWithoutFollowingRedirects(`${origin}${path}`, timeoutMs);
    if (outcome.ok) {
      observed[path] = outcome.headers;
    } else {
      unresolved[path] = {
        reason: outcome.reason,
        ...(outcome.status === undefined ? {} : { status: outcome.status }),
        ...(outcome.location === undefined ? {} : { location: outcome.location }),
      };
    }
  }

  return { observed: observed as PwaObservedResponses, unresolved };
}

/** One required HTML path's outcome: either the final response's address and the redirect hops that led to it, or (when unresolved) why it wasn't. */
export type PwaHtmlHeaderObservation =
  | { readonly finalUrl: string; readonly redirectChain: readonly PwaRedirectHop[] }
  | PwaHeaderObservationFailure;

export type PwaObserveHtmlHeadersResult = {
  /** Only paths whose final response (after following same-origin, same-scheme redirects) was HTTP 200. */
  readonly observed: PwaObservedResponses;
  /** One entry per required HTML path (module spec, "采集": "跨源或换协议的重定向……都把该路径记为未采集，并写明原因"). */
  readonly observations: Readonly<Record<string, PwaHtmlHeaderObservation>>;
};

/**
 * Observes the response headers `verifyHtmlHeaders` (build-verifier's html-headers.ts) judges: the plan's public
 * HTML paths (`requiredHtmlHeaderPaths`), each followed through same-origin, same-scheme redirects via
 * `fetchFollowingRedirects` — unlike `observeHeaders`, which never follows a redirect at all — because Cloudflare
 * Pages canonicalizes a public HTML URL (dropping `.html`, adding a trailing slash) and a browser navigating to the
 * un-canonicalized path still lands on the final page. Only the final HTTP 200 response's headers are recorded, and
 * only under the original plan path; the redirect hops themselves (and their own headers) never enter `observed` or
 * participate in judgment, matching the module spec's "重定向响应本身的头不参与判定".
 */
export async function observeHtmlHeaders(
  origin: string,
  plan: PwaPlan,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PwaObserveHtmlHeadersResult> {
  const observed: Record<string, Readonly<Record<string, string>>> = {};
  const observations: Record<string, PwaHtmlHeaderObservation> = {};

  for (const path of requiredHtmlHeaderPaths(plan)) {
    const outcome = await fetchFollowingRedirects(`${origin}${path}`, timeoutMs);
    if (outcome.ok) {
      observed[path] = outcome.value.headers;
      observations[path] = { finalUrl: outcome.value.finalUrl, redirectChain: outcome.value.redirectChain };
    } else {
      observations[path] = {
        reason: outcome.reason,
        ...(outcome.status === undefined ? {} : { status: outcome.status }),
        ...(outcome.location === undefined ? {} : { location: outcome.location }),
      };
    }
  }

  return { observed: observed as PwaObservedResponses, observations };
}
