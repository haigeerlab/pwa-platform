// Write path behind spec/pwa-entry-resilience.md's revised page-side API, `updateEntryManifest(data)`: validates
// the plain object the application hands in (src/manifest.ts), decides whether it beats what is already stored
// (src/select.ts), and writes it if so. Not part of the package's public API on its own — src/client/index.ts
// wires the exported `updateEntryManifest` to this function, supplying the real browser ports (IndexedDB,
// `Date.now`) via src/browser/index.ts's `createEntryRuntimePorts`.
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import { parseEntryManifest } from "./manifest.js";
import { selectManifest } from "./select.js";
import type { EntryManifest } from "./types.js";

export type EntryManifestUpdateConfig = {
  readonly appId: string;
  readonly environment: string;
  /** Integer 1-90: the maximum number of days between now and the incoming manifest's `expiresAt`. */
  readonly maxValidityDays: number;
};

export type EntryManifestUpdatePorts = {
  now(): number;
  loadStored(): Promise<EntryManifest | null>;
  saveStored(manifest: EntryManifest): Promise<void>;
};

export type EntryManifestUpdateResult =
  | { readonly accepted: true; readonly sequence: number }
  | { readonly accepted: false; readonly diagnostics: readonly EntryDiagnostic[] };

/**
 * Validates `data`, compares it against the stored record, and writes it when it wins. Never throws: every port
 * failure (an unavailable clock, a failed read, a failed write) becomes `{ accepted: false, diagnostics }` rather
 * than a rejection — there is no room for a diagnostic on the `accepted: true` branch, so any failure that cannot
 * be represented there must reject instead of silently pretending to have succeeded.
 */
export async function runEntryManifestUpdate(
  data: unknown,
  config: EntryManifestUpdateConfig,
  ports: EntryManifestUpdatePorts,
): Promise<EntryManifestUpdateResult> {
  let now: number;
  try {
    now = ports.now();
  } catch {
    return { accepted: false, diagnostics: [diagnostic("entry.runtime-unavailable", "")] };
  }
  if (!Number.isFinite(now)) {
    return { accepted: false, diagnostics: [diagnostic("entry.runtime-unavailable", "")] };
  }

  const parsed = parseEntryManifest(data, {
    appId: config.appId,
    environment: config.environment,
    maxValidityDays: config.maxValidityDays,
    now,
  });
  if (!parsed.ok) return { accepted: false, diagnostics: parsed.diagnostics };

  let stored: EntryManifest | null;
  try {
    stored = await ports.loadStored();
  } catch {
    return { accepted: false, diagnostics: [diagnostic("entry.storage-unavailable", "")] };
  }

  const selection = selectManifest({ stored, incoming: parsed.manifest });
  if (selection.kind === "rejected") return { accepted: false, diagnostics: selection.diagnostics };

  try {
    await ports.saveStored(selection.manifest);
  } catch {
    return { accepted: false, diagnostics: [diagnostic("entry.storage-write-failed", "")] };
  }

  return { accepted: true, sequence: selection.manifest.sequence };
}
