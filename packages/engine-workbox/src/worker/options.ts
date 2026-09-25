/** One entry of the injected manifest (`self.__WB_MANIFEST`), mirroring `PwaPlan.precache`. */
export type PwaPrecacheManifestEntry = {
  /** Canonical absolute path, as in `PwaPlan.precache`: no query, fragment, dot segments, `//` or backslashes. */
  readonly url: string;
  /** Content revision, or `null` when the URL itself is versioned (fingerprinted). */
  readonly revision: string | null;
};

export type PwaPrecacheEngineOptions = {
  /** The contracts `cacheName(identity, "precache")` for the running plan. */
  readonly cacheName: string;
  readonly entries: readonly PwaPrecacheManifestEntry[];
};

const CACHE_NAME_PREFIX = "pwa:";
const CACHE_NAME_SUFFIX = ":precache";
// Only used to check the form of paths; never requested.
const PATH_BASE = "https://engine-workbox.invalid/";

/** Validates engine options and returns a fresh copy. Messages name fields and indexes, never input values. */
export function validatePrecacheEngineOptions(options: unknown): PwaPrecacheEngineOptions {
  if (!isRecord(options)) throw new TypeError("Precache engine options must be an object");

  const { cacheName, entries } = options;
  const hasPlatformShape =
    typeof cacheName === "string" &&
    cacheName.startsWith(CACHE_NAME_PREFIX) &&
    cacheName.endsWith(CACHE_NAME_SUFFIX) &&
    cacheName.length > CACHE_NAME_PREFIX.length + CACHE_NAME_SUFFIX.length;
  if (!hasPlatformShape) {
    throw new Error('cacheName must be a contracts precache cache name of the form "pwa:<…>:precache"');
  }
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array");

  const seen = new Set<string>();
  const normalised = entries.map((entry: unknown, index: number): PwaPrecacheManifestEntry => {
    if (!isRecord(entry)) throw new TypeError(`entries[${index}] must be an object`);
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "revision" || keys[1] !== "url") {
      throw new Error(`entries[${index}] must have exactly the fields url and revision`);
    }
    const { url, revision } = entry;
    if (typeof url !== "string" || !isCanonicalPath(url)) {
      throw new Error(
        `entries[${index}].url must be a canonical same-origin absolute path: no query, fragment, dot segments, "//", backslashes or characters the URL parser would change`,
      );
    }
    if (revision !== null && (typeof revision !== "string" || revision === "")) {
      throw new Error(`entries[${index}].revision must be a non-empty string or null`);
    }
    // Canonical paths have exactly one spelling, so equal strings are the only duplicates.
    if (seen.has(url)) throw new Error(`entries[${index}].url duplicates an earlier entry`);
    seen.add(url);
    return { url, revision };
  });

  return { cacheName, entries: normalised };
}

/**
 * The rule contracts' `isCanonicalPath` applies to `PwaPlan.precache` URLs, repeated here because the worker entry
 * does not import contracts. The URL parser treats `\` as `/` and drops tabs and newlines, so without the final
 * comparison `/\evil.example/a.js` would resolve to another origin.
 */
function isCanonicalPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    URL.canParse(value, PATH_BASE) &&
    new URL(value, PATH_BASE).pathname === value
  );
}

/** Resolves `url` against `base` and drops the fragment; the query string is kept, so matching stays exact. */
export function resolveManifestUrl(url: string, base: string): string {
  const resolved = new URL(url, base);
  resolved.hash = "";
  return resolved.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
