// Runtime-cache response admission check, as a pure function: no Cache API, no fetch, no Workbox. It only decides
// whether a network response may be written to the runtime cache; the caller still returns the response to the page
// either way (spec "响应准入").

export type PwaRuntimeAdmitOptions = {
  readonly resourceClass: "public-data" | "navigation-public-dynamic";
  readonly strategy: "network-first" | "stale-while-revalidate";
  readonly maxEntryBytes: number;
};

const ALLOWED_VARY_TOKENS = new Set(["accept", "accept-encoding"]);

/** Why a response was not written to the runtime cache, one per admission condition (spec "响应准入"). */
export type PwaRuntimeRejectionReason = "response-type" | "status" | "redirected" | "content-type" | "cache-control" | "vary" | "size";

/** True only if `response` may be written to the runtime cache. Never consumes `response` itself. */
export async function admitRuntimeResponse(response: Response, options: PwaRuntimeAdmitOptions): Promise<boolean> {
  return (await runtimeAdmissionRejection(response, options)) === undefined;
}

/** The first admission condition `response` fails, or undefined when it may be written. Never consumes `response`. */
export async function runtimeAdmissionRejection(
  response: Response,
  options: PwaRuntimeAdmitOptions,
): Promise<PwaRuntimeRejectionReason | undefined> {
  if (response.type !== "basic") return "response-type";
  if (response.status !== 200) return "status";
  if (response.redirected) return "redirected";
  if (!admittedMediaType(response.headers.get("content-type"), options.resourceClass)) return "content-type";
  if (!admittedCacheControl(response.headers.get("cache-control"), options.strategy)) return "cache-control";
  if (!admittedVary(response.headers.get("vary"))) return "vary";
  // `Set-Cookie` is intentionally not checked: the Fetch spec makes it a forbidden response-header name on a basic
  // response, so a worker can never read it (see spec.public-read-cache "响应准入").
  return (await admittedSize(response, options.maxEntryBytes)) ? undefined : "size";
}

function admittedMediaType(contentType: string | null, resourceClass: PwaRuntimeAdmitOptions["resourceClass"]): boolean {
  if (contentType === null) return false;
  const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (resourceClass === "navigation-public-dynamic") return mediaType === "text/html";
  return mediaType === "application/json" || /^application\/[^/]+\+json$/.test(mediaType);
}

/** Each directive token, with its value when the token carries one (`max-age=0` and `max-age="0"` both parse to `0`). */
function directives(headerValue: string): ReadonlyMap<string, string | undefined> {
  const found = new Map<string, string | undefined>();
  for (const item of headerValue.split(",")) {
    const [rawToken, ...rawValue] = item.split("=");
    const token = rawToken?.trim().toLowerCase();
    if (token === undefined || token.length === 0) continue;
    const value = rawValue.length === 0 ? undefined : rawValue.join("=").trim().replace(/^"|"$/g, "");
    found.set(token, value);
  }
  return found;
}

/** True when `directive` is present with a numeric value of exactly `0` (e.g. `max-age=0`, `max-age="0"`). */
function isZero(found: ReadonlyMap<string, string | undefined>, directive: string): boolean {
  const value = found.get(directive);
  return value !== undefined && Number(value) === 0;
}

function admittedCacheControl(cacheControl: string | null, strategy: PwaRuntimeAdmitOptions["strategy"]): boolean {
  if (cacheControl === null) return true;
  const found = directives(cacheControl);
  if (found.has("no-store") || found.has("private")) return false;
  if (strategy === "stale-while-revalidate") {
    // SWR hands out the cached entry without revalidating; a response that demands revalidation, or one that is
    // already stale on arrival, must not be written (spec "响应准入", ADR-0035 T13 评审后收紧). network-first is
    // unaffected: it always tries the network first and only falls back to the cache on failure.
    if (found.has("no-cache") || found.has("must-revalidate")) return false;
    if (isZero(found, "max-age") || isZero(found, "s-maxage")) return false;
  }
  return true;
}

function admittedVary(vary: string | null): boolean {
  if (vary === null) return true;
  const tokens = vary
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  return tokens.every((token) => ALLOWED_VARY_TOKENS.has(token));
}

async function admittedSize(response: Response, maxEntryBytes: number): Promise<boolean> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isInteger(declared) && declared >= 0 && declared > maxEntryBytes) return false;
  }

  const body = response.clone().body;
  if (body === null) return true;

  const reader = body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      reader.releaseLock();
      return true;
    }
    total += value.length;
    if (total > maxEntryBytes) {
      // Stop reading immediately rather than draining the rest of an oversized body. `cancel()` is fire-and-forget:
      // on a cloned response's tee'd stream, Node's undici never settles this promise even though the cancel signal
      // itself takes effect right away (no further reads happen upstream), so awaiting it would hang forever.
      reader.cancel().catch(() => {});
      return false;
    }
  }
}
