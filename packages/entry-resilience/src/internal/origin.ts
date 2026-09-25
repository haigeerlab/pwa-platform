// Loopback hosts the spec treats as potentially trustworthy for local development and tests, matching
// contracts' internal/paths.ts `isSecureOrigin` exemption list. `URL#hostname` keeps the brackets around an
// IPv6 literal (`new URL("http://[::1]").hostname === "[::1]"`), so the bracketed form is the correct key.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Normalized origin per the manifest contract: `new URL(value).origin === value` (no userinfo, path, query
 * or fragment), protocol `https:`, with the sole exception of `http:` on a loopback host (any port).
 */
export function isNormalizedOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.origin !== value) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}
