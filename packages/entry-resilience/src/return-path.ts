// Return-path validation for `?return=` on the platform recovery page. Every rule mirrors
// spec/pwa-entry-resilience.md's "返回路径校验" section, in the order it lists them:
// structural checks on the raw string -> a ".." segment check on the raw string -> decode once -> the same
// structural and ".." checks re-run on the decoded string -> a URL-based origin/scope check against `value`
// itself (not the decoded form). On any failure the whole path is discarded; nothing is ever
// echoed back to a caller, only `null`.
//
// The ".." check splits the *entire* string on `/`, `?` and `#` rather than truncating at the first `?`/`#`: a
// literal `?` introduced by decoding (e.g. `%3f`) would otherwise let a later `..` segment hide past where the
// raw string's own `?`/`#` truncation stopped looking (independent review finding, 2026-09-17).

const MAX_LENGTH = 1024;

export type EntryReturnPathContext = {
  readonly origin: string;
  readonly scope: string;
};

/** True if `value` contains a C0 control character (U+0000-U+001F) or DEL (U+007F). */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Length, single leading `/`, no backslash, no control character — checked both before and after decoding. */
function isStructurallyValid(value: string): boolean {
  if (value.length < 1 || value.length > MAX_LENGTH) return false;
  if (value[0] !== "/") return false;
  if (value.length > 1 && (value[1] === "/" || value[1] === "\\")) return false;
  if (value.includes("\\")) return false;
  if (hasControlCharacter(value)) return false;
  return true;
}

/** True if any `/`-, `?`- or `#`-delimited segment of `value` is exactly `..`. Never truncates at `?`/`#`: the
 *  whole string is split, so a `..` segment cannot hide past a literal `?`/`#` (see this module's header comment). */
function hasDotDotSegment(value: string): boolean {
  return value.split(/[/?#]/).some((segment) => segment === "..");
}

/**
 * Validates a return path per spec/pwa-entry-resilience.md's "返回路径校验". Returns the input
 * string unchanged when it is legal, `null` otherwise. Never throws.
 */
export function normalizeReturnPath(value: unknown, context: EntryReturnPathContext): string | null {
  if (typeof value !== "string") return null;
  if (!isStructurallyValid(value)) return null;
  if (hasDotDotSegment(value)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!isStructurallyValid(decoded)) return null;
  if (hasDotDotSegment(decoded)) return null;

  let url: URL;
  try {
    url = new URL(value, context.origin);
  } catch {
    return null;
  }
  if (url.origin !== context.origin) return null;
  if (!url.pathname.startsWith(context.scope)) return null;

  return value;
}
