// Pure view model for the recovery page: turns an already-resolved `EntryResolution` (src/resolve.ts) and a
// pre-validated return path into exactly what src/page/render.ts needs to draw, with no DOM access of its own —
// see spec/pwa-entry-resilience.md's "入口恢复页" and "状态与展示规则".
import type { EntryResolution } from "../resolve.js";

export type EntryPageEntry = { readonly host: string; readonly href: string };

export type EntryPageModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "entries";
      readonly status: "migrating" | "incident" | "unconfirmed-outage";
      readonly message: string | null;
      readonly expiresAt: string;
      readonly entries: readonly EntryPageEntry[];
    };

/**
 * `"2026-10-01T08:00:00Z"` -> `"2026-10-01 08:00 UTC"`. String slicing only, never `Date`: the manifest contract
 * (spec's "契约" table) guarantees `expiresAt` is strictly `YYYY-MM-DDTHH:mm:ssZ`, so this cannot depend on the
 * viewer's time zone or locale the way `toLocaleString` would.
 */
function formatExpiresAt(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

/**
 * Builds one entry's host/href, or `undefined` if it must be dropped.
 *
 * `startPath` was already validated at sign time (see this package's T1 record, "给 T6 的记录" in
 * tasks/pwa-entry-resilience/plan.md), but this re-asserts it as defense in depth rather than trusting that to
 * still hold: `new URL(startPath, origin)` is resolved and its own `origin` is required to still equal the
 * manifest's declared `origin` — a `startPath` such as `"//evil.example/x"` or an absolute
 * `"https://evil.example/"` would otherwise escape the approved origin at render time.
 */
function buildEntry(
  entry: { readonly origin: string; readonly startPath: string },
  returnPath: string | null,
): EntryPageEntry | undefined {
  let url: URL;
  try {
    url = new URL(entry.startPath, entry.origin);
  } catch {
    return undefined;
  }
  if (url.origin !== entry.origin) return undefined;

  if (returnPath !== null) url.searchParams.set("pwa-return", returnPath);

  return { host: url.host, href: url.href };
}

export function buildPageModel(resolution: EntryResolution, returnPath: string | null): EntryPageModel {
  if (resolution.kind === "none") return { kind: "none" };

  const entries: EntryPageEntry[] = [];
  for (const entry of resolution.entries) {
    const built = buildEntry(entry, returnPath);
    if (built !== undefined) entries.push(built);
  }
  if (entries.length === 0) return { kind: "none" };

  return {
    kind: "entries",
    status: resolution.status,
    message: resolution.manifest.reason.message ?? null,
    expiresAt: formatExpiresAt(resolution.manifest.expiresAt),
    entries,
  };
}
