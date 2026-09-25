// The one place this tool speaks HTTP. Two request shapes, both bounded by a timeout and both refusing to follow a
// request off its starting origin:
//
// - `fetchFollowingRedirects` is for live-bytes and asset-availability checks, where a same-origin "pretty URL"
//   redirect (Cloudflare Pages turns `/app/index.html` into `/app/`) is expected and must still resolve to the
//   right bytes. A redirect that leaves the origin (or changes scheme) is never followed — it is reported as a
//   failure of that request, not silently resolved against a different host's response.
// - `fetchWithoutFollowingRedirects` is for header observation. A browser refuses to register a Service Worker
//   script reached through a redirect at all, so for the worker/manifest/fingerprinted-asset paths
//   `verifyResponseHeaders` judges, only a *direct* HTTP 200 counts as an observation; any redirect (same-origin or
//   not) or non-200 status must be reported as "not observed", never resolved by following it.
//
// Response bodies are hashed here and never returned or retained, matching "不含响应体" for every fact this tool
// writes.
import { createHash } from "node:crypto";

/** Every request this tool makes is bounded by this timeout, so one hanging socket cannot hang the whole run. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export type PwaRedirectHop = { readonly from: string; readonly status: number; readonly location: string };

export type PwaFetchResult = {
  readonly finalUrl: string;
  /** Header names lower-cased, one value per name (matches `PwaObservedResponses` in build-verifier). */
  readonly headers: Readonly<Record<string, string>>;
  readonly bodySha256: string;
  /** Every same-origin redirect hop that was followed to reach this response. */
  readonly redirectChain: readonly PwaRedirectHop[];
};

export type PwaFetchFailure = {
  readonly ok: false;
  readonly reason: string;
  /** The redirect response's status, when the failure came from one specific response (a redirect or a non-200 final status). Omitted for a hop-count, network or timeout failure that names no single response. */
  readonly status?: number;
  /** The redirect response's raw `Location` header value, when one was present. Omitted whenever `status` is. */
  readonly location?: string;
};

export type PwaFetchOutcome = { readonly ok: true; readonly value: PwaFetchResult } | PwaFetchFailure;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

/**
 * GETs `url`, following only same-origin, same-scheme redirects (a Cloudflare Pages "pretty URL" rewrite is exactly
 * this shape), and hashes the final body. A redirect to a different origin or scheme, a redirect with no `Location`,
 * too many hops, a timeout, or any other network failure is reported as `{ ok: false }` rather than thrown, so a
 * caller can record a specific per-path reason instead of catching a generic exception. HEAD is never used: the
 * module spec requires comparing actual bytes, and a HEAD response cannot be hashed.
 */
export async function fetchFollowingRedirects(url: string, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<PwaFetchOutcome> {
  const startOrigin = parseOrigin(url);
  if (startOrigin === undefined) return { ok: false, reason: "requested URL is not a valid absolute URL" };

  const redirectChain: PwaRedirectHop[] = [];
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await globalThis.fetch(current, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      return { ok: false, reason: fetchFailureReason(error) };
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      const status = response.status;
      await cancelBody(response);
      if (location === null) return { ok: false, reason: "redirect response carries no Location header", status };
      const next = parseUrl(location, current);
      if (next === undefined) return { ok: false, reason: "redirect Location header is not a valid URL", status, location };
      if (next.origin !== startOrigin) return { ok: false, reason: "cross-origin redirect", status, location };
      redirectChain.push({ from: current, status: response.status, location: next.toString() });
      current = next.toString();
      continue;
    }

    if (response.status !== 200) {
      const status = response.status;
      await cancelBody(response);
      return { ok: false, reason: `HTTP ${status}`, status };
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      return { ok: false, reason: fetchFailureReason(error) };
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of response.headers.entries()) headers[name.toLowerCase()] = value;
    return {
      ok: true,
      value: { finalUrl: current, headers, bodySha256: createHash("sha256").update(bytes).digest("hex"), redirectChain },
    };
  }

  return { ok: false, reason: "too many redirects" };
}

export type PwaHeaderObservationOutcome =
  | { readonly ok: true; readonly headers: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: string; readonly status?: number; readonly location?: string };

/**
 * GETs `url` exactly once, never following a redirect: only a direct HTTP 200 counts as an observation. A browser
 * refuses to register a Service Worker (or use a manifest, or trust a precache entry) reached through a redirect,
 * so treating a redirected response as "the headers of this path" would misreport what the site actually does.
 */
export async function fetchWithoutFollowingRedirects(
  url: string,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PwaHeaderObservationOutcome> {
  let response: Response;
  try {
    response = await globalThis.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { ok: false, reason: fetchFailureReason(error) };
  }

  if (REDIRECT_STATUSES.has(response.status)) {
    const location = response.headers.get("location");
    await cancelBody(response);
    return { ok: false, reason: "redirect", status: response.status, ...(location === null ? {} : { location }) };
  }
  if (response.status !== 200) {
    await cancelBody(response);
    return { ok: false, reason: `HTTP ${response.status}`, status: response.status };
  }

  await cancelBody(response);
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers.entries()) headers[name.toLowerCase()] = value;
  return { ok: true, headers };
}

/** Releases a response body this tool will never read (a redirect, a non-200, or a header-only observation). */
async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort: the socket is being torn down either way.
  }
}

function fetchFailureReason(error: unknown): string {
  return error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network error";
}

function parseOrigin(url: string): string | undefined {
  return parseUrl(url)?.origin;
}

function parseUrl(url: string, base?: string): URL | undefined {
  try {
    return new URL(url, base);
  } catch {
    return undefined;
  }
}
