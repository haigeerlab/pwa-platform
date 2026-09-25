// Write-time "does this beat what is already stored" decision — spec/pwa-entry-resilience.md's revised
// "updateEntryManifest 在校验通过且 sequence 大于已存记录时写入 IndexedDB...序号不大于已存记录时不写入". Pure,
// synchronous, driven only by its arguments: no clock, storage or network access of its own.
//
// ADR-0033 (2026-09-23) removed the three-way (build-time seed / stored / discovery-source) selection this module
// used to perform, along with the signature verification that decided which candidates were even eligible: there
// is now exactly one incoming candidate (already field-validated by src/manifest.ts) and one stored record, and the
// only question is whether the incoming one's `sequence` is strictly greater.
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import type { EntryManifest } from "./types.js";

export type EntrySelectionInput = {
  readonly stored: EntryManifest | null;
  readonly incoming: EntryManifest;
};

export type EntrySelection =
  | { readonly kind: "accepted"; readonly manifest: EntryManifest }
  | { readonly kind: "rejected"; readonly diagnostics: readonly EntryDiagnostic[] };

/** Highest `sequence` wins; equal or lower is rejected without writing. */
export function selectManifest(input: EntrySelectionInput): EntrySelection {
  if (input.stored !== null && input.incoming.sequence <= input.stored.sequence) {
    return { kind: "rejected", diagnostics: [diagnostic("entry.sequence-not-greater", "/sequence")] };
  }
  return { kind: "accepted", manifest: input.incoming };
}
