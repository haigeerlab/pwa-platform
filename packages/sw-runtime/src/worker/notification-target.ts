// Resolves a `notificationclick` target to an address the platform worker is allowed to open or focus: inside the
// same origin and scope as the worker itself. Spec: spec/push-module.md "设计 / 2. 平台 worker 的两个新监听"; ADR-0021.

/**
 * Resolves `url` (as read from the notification's `data.url`, of unknown shape) against `scopeUrl`
 * (`registration.scope`, always absolute and ending in "/"). Falls back to `scopeUrl` whenever `url` is missing,
 * malformed, cross-origin, carries credentials, or resolves outside the scope — including `..` and percent-encoded
 * traversal, and a same-origin address that merely shares the scope's prefix (e.g. `/application/` vs `/app/`),
 * because the WHATWG URL parser normalises the target before this compares its serialized `href` against the scope.
 */
export function resolveNotificationTarget(url: unknown, scopeUrl: string): string {
  if (typeof url !== "string" || url.length === 0) return scopeUrl;

  let target: URL;
  try {
    target = new URL(url, scopeUrl);
  } catch {
    return scopeUrl;
  }

  if (target.origin !== new URL(scopeUrl).origin) return scopeUrl;
  if (target.username.length > 0 || target.password.length > 0) return scopeUrl;
  if (!target.href.startsWith(scopeUrl)) return scopeUrl;

  return target.href;
}
