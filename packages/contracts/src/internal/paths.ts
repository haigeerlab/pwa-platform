const URL_BASE = "https://contracts.invalid";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Same-origin absolute path already in WHATWG URL serialized form: no dot or empty segments,
 * no query, fragment, backslash or characters the URL parser would re-encode.
 */
export function isCanonicalPath(value: string): boolean {
  // `/\` would otherwise parse as a protocol-relative URL and make the URL constructor throw.
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    URL.canParse(value, URL_BASE) &&
    new URL(value, URL_BASE).pathname === value
  );
}

/** Whole-segment path prefix: canonical, no trailing slash (except root) and no glob characters. */
export function isPathPrefix(value: string): boolean {
  return isCanonicalPath(value) && (value === "/" || !value.endsWith("/")) && !value.includes("*");
}

/** Whole-segment containment; a trailing slash on `base` is not significant. */
export function isWithinPath(path: string, base: string): boolean {
  const directory = base.endsWith("/") ? base : `${base}/`;
  return path === base || `${path}/` === directory || path.startsWith(directory);
}

/** Serialized origin using HTTPS, or HTTP on a loopback host for local development. */
export function isSecureOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.origin !== value) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
}

/** POSIX path relative to a build output directory, without dot or empty segments. */
export function isRelativeFilePath(value: string): boolean {
  return (
    value !== "" &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}
