// Public entry: the entry-recovery manifest contract, its standalone validator, the display decision, the
// page-side query function and its browser adapters. The recovery page (src/page/) and the Vite plugin (src/vite/)
// are implemented but not re-exported here: the plugin has its own entry point (see the package's `./vite`
// export), and the recovery page is only ever loaded by the build the plugin emits, never imported directly by an
// application.
//
// This package's actual page-side API for applications — `checkEntryRecovery` and `updateEntryManifest` — lives on
// the `./client` export (src/client/index.ts) instead, since both need the Vite plugin's virtual config module.
// What is exported below is everything under that: the pure orchestration (`runEntryRecovery`), the manifest
// contract's types and validator, and the browser port builders, for anything that wants to assemble its own
// wiring rather than use the client facade.
//
// `parseEntryManifest` (spec/pwa-entry-resilience.md's "修订：导出清单校验函数") is exported here specifically so a
// caller can validate a manifest in Node — a CI check or a backend self-check before handing it to
// `updateEntryManifest` — without a browser. It is re-exported verbatim from src/manifest.ts, which stays the only
// place its rules are implemented; its result type is renamed on the way out (`ManifestResult` ->
// `EntryManifestParseResult`) to read as public API, but the internal name in src/manifest.ts is unchanged.
//
// The write-time "does this beat what's stored" decision (src/select.ts) and `runEntryManifestUpdate`
// (src/update.ts) stay internal — only `updateEntryManifest`, wired on `./client`, exposes that path.
export { runEntryRecovery } from "./check.js";
export type { EntryRecoveryResult, EntryRuntimeConfig, EntryRuntimePorts } from "./check.js";
export { decideRecovery } from "./decide.js";
export type { EntryDecision, EntryProbes } from "./decide.js";
export { ENTRY_DIAGNOSTIC_CODES } from "./diagnostics.js";
export type { EntryDiagnostic, EntryDiagnosticCode, EntryDiagnosticPath } from "./diagnostics.js";
export { parseEntryManifest } from "./manifest.js";
export type { ManifestResult as EntryManifestParseResult } from "./manifest.js";
export {
  ENTRY_MANIFEST_REASON_CODES,
  ENTRY_MANIFEST_STATUSES,
} from "./types.js";
export type {
  EntryManifest,
  EntryManifestEntry,
  EntryManifestReason,
  EntryManifestReasonCode,
  EntryManifestStatus,
  EntryManifestValidationContext,
} from "./types.js";

export {
  createEntryRecoveryChecker,
  createIndexedDbStore,
  createProbes,
} from "./browser/index.js";
export type {
  CreateIndexedDbStoreOptions,
  CreateProbesOptions,
  EntryCheckerConfig,
  EntryCheckOptions,
  EntryIndexedDbStore,
} from "./browser/index.js";
