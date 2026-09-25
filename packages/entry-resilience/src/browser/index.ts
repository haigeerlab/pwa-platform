// Assembles the browser ports (probes, IndexedDB store, `Date.now`, `location.origin`) into the page-side
// `checkEntryRecovery` function described in spec/pwa-entry-resilience.md's "页面侧 API". The Vite plugin supplies
// `config` from its virtual module.
//
// ADR-0033 (2026-09-23) removed the discovery-source fetch from the read path (`checkEntryRecovery` now only reads
// what a prior `updateEntryManifest` call stored — see src/resolve.ts and src/update.ts), so `createEntryRuntimePorts`
// no longer builds a `fetchDiscovery` port, and src/browser/discovery.ts is deleted along with it (EM3,
// tasks/pwa-entry-resilience/plan.md).
import { runEntryRecovery } from "../check.js";
import type { EntryRecoveryResult } from "../check.js";
import type { EntryRuntimeConfig, EntryRuntimePorts } from "../resolve.js";
import type { EntryManifest } from "../types.js";
import { createIndexedDbStore } from "./indexeddb.js";
import { createProbes } from "./probes.js";

export type EntryCheckerConfig = EntryRuntimeConfig & {
  /** Passed through to `createProbes`: the app's mount path, e.g. `"/app/"`. */
  readonly mountPath: string;
};

export type EntryCheckOptions = { readonly returnPath?: string };

/**
 * Assembles the real browser ports (probes, IndexedDB store, `Date.now`, `location.origin`) that
 * `createEntryRecoveryChecker` (below), src/client/index.ts's `checkEntryRecovery`/`updateEntryManifest` (which
 * share one instance across both calls) and the recovery page (src/page/main.ts, which calls
 * `resolveEntryRecovery` directly rather than `runEntryRecovery`) all need. `saveStored` is included alongside the
 * `EntryRuntimePorts` fields so the same object also satisfies `EntryManifestUpdatePorts` (src/update.ts) without a
 * second IndexedDB store being opened for the write path.
 */
export function createEntryRuntimePorts(
  config: EntryCheckerConfig,
): EntryRuntimePorts & { saveStored(manifest: EntryManifest): Promise<void> } {
  const probes = createProbes({ mountPath: config.mountPath });
  const store = createIndexedDbStore({ appId: config.appId, environment: config.environment });

  return {
    now: (): number => Date.now(),
    currentOrigin: (): string => location.origin,
    loadStored: store.loadStored,
    saveStored: store.saveStored,
    probePrimary: probes.probePrimary,
    probeAlternate: probes.probeAlternate,
  };
}

/** Builds `checkEntryRecovery`, wiring real browser ports around the pure `runEntryRecovery`. */
export function createEntryRecoveryChecker(
  config: EntryCheckerConfig,
): (options?: EntryCheckOptions) => Promise<EntryRecoveryResult> {
  const ports = createEntryRuntimePorts(config);
  return (options: EntryCheckOptions = {}): Promise<EntryRecoveryResult> => runEntryRecovery(config, ports, options);
}

export { createIndexedDbStore } from "./indexeddb.js";
export type { EntryIndexedDbStore, CreateIndexedDbStoreOptions } from "./indexeddb.js";
export { createProbes } from "./probes.js";
export type { CreateProbesOptions } from "./probes.js";
