// Display decision for a single already-selected manifest, per spec/pwa-entry-resilience.md's
// "状态与展示规则". Pure orchestration over injected probes: no clock, no storage, no network of its
// own, so every branch (empty entries, migrating/incident short-circuiting, normal's probe-then-probe
// sequencing) is directly testable.
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import type { EntryManifest, EntryManifestEntry } from "./types.js";

export type EntryProbes = {
  probePrimary(): Promise<boolean>;
  probeAlternate(origin: string, startPath: string): Promise<boolean>;
};

export type EntryDecision =
  | { readonly kind: "none"; readonly diagnostics: readonly EntryDiagnostic[] }
  | {
      readonly kind: "available";
      readonly status: "migrating" | "incident" | "unconfirmed-outage";
      readonly manifest: EntryManifest;
      /** Only the entries the spec allows showing: every entry for `migrating`/`incident` (not probed), or only the
       *  probe-confirmed-reachable ones for `unconfirmed-outage` (see spec's "只展示探测确认可达的入口"). */
      readonly entries: readonly EntryManifestEntry[];
    };

/** A probe that throws is treated as unreachable, per spec: "探测函数抛出时视为不可达". */
async function safeProbe(probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe();
  } catch {
    return false;
  }
}

export async function decideRecovery(manifest: EntryManifest, probes: EntryProbes): Promise<EntryDecision> {
  if (manifest.entries.length === 0) {
    return { kind: "none", diagnostics: [diagnostic("entry.no-entries", "")] };
  }

  if (manifest.status === "migrating" || manifest.status === "incident") {
    return { kind: "available", status: manifest.status, manifest, entries: manifest.entries };
  }

  // status === "normal": show nothing unless the primary is unreachable and some alternate is reachable. Every
  // entry is probed — not only up to the first reachable one — so the page can show every entry that is actually
  // confirmed reachable, per spec's "只展示探测确认可达的入口" (independent review finding, 2026-09-17).
  const primaryReachable = await safeProbe(() => probes.probePrimary());
  if (primaryReachable) return { kind: "none", diagnostics: [] };

  const reachable: EntryManifestEntry[] = [];
  for (const entry of manifest.entries) {
    const alternateReachable = await safeProbe(() => probes.probeAlternate(entry.origin, entry.startPath));
    if (alternateReachable) reachable.push(entry);
  }

  if (reachable.length === 0) return { kind: "none", diagnostics: [] };
  return { kind: "available", status: "unconfirmed-outage", manifest, entries: reachable };
}
