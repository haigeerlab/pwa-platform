// Read path for `checkEntryRecovery`, per spec/pwa-entry-resilience.md's revised "页面侧 API": reads the one
// manifest IndexedDB stores and, if it has not expired, runs the display decision (src/decide.ts) on it. No
// network request happens here (probes aside) and no multi-source selection: ADR-0033 (2026-09-23) removed the
// build-time seed and the discovery-source fetch, so there is exactly one manifest to consider, already accepted
// by a prior `updateEntryManifest` call (src/update.ts).
//
// Two behaviors worth calling out explicitly, both confirmed during EM3 (tasks/pwa-entry-resilience/plan.md):
// - The `currentOrigin`/`now` fail-closed guard below runs before any storage access, even though this file's own
//   pipeline no longer compares `currentOrigin`'s value against anything (see the guard's own comment).
// - Expiry is re-checked here, on every read, not only once at `updateEntryManifest` time (see the re-check below).
import { decideRecovery } from "./decide.js";
import type { EntryProbes } from "./decide.js";
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import { parseStrictIsoUtc } from "./internal/iso-date.js";
import type { EntryManifest, EntryManifestEntry } from "./types.js";

export type EntryRuntimeConfig = {
  readonly appId: string;
  readonly environment: string;
  readonly scope: string;
  readonly recoveryPagePath: string;
  /** Not read by this file's own read path; carried here so the one virtual config module (src/vite/index.ts) can
   *  also supply it to `updateEntryManifest`'s wiring (src/update.ts's `EntryManifestUpdateConfig`, shared via
   *  src/client/index.ts) without a second config shape. */
  readonly maxValidityDays: number;
};

export type EntryRuntimePorts = EntryProbes & {
  now(): number;
  currentOrigin(): string;
  loadStored(): Promise<EntryManifest | null>;
};

export type EntryResolution =
  | { readonly kind: "none"; readonly diagnostics: readonly EntryDiagnostic[] }
  | {
      readonly kind: "available";
      readonly status: "migrating" | "incident" | "unconfirmed-outage";
      readonly manifest: EntryManifest;
      /** The entries the recovery page may show — see `EntryDecision`'s own field of the same name. */
      readonly entries: readonly EntryManifestEntry[];
      readonly diagnostics: readonly EntryDiagnostic[];
    };

/** Runs `fn`, returning `undefined` if it throws. */
function tryCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export async function resolveEntryRecovery(
  config: EntryRuntimeConfig,
  ports: EntryRuntimePorts,
): Promise<EntryResolution> {
  const diagnostics: EntryDiagnostic[] = [];

  // `currentOrigin` no longer filters any entry (src/select.ts dropped the "no entry may equal the current origin"
  // rule along with its multi-source selection), but calling it here and failing closed if it throws is kept, on
  // purpose (confirmed EM3, tasks/pwa-entry-resilience/plan.md): it is this pipeline's one check that the runtime
  // port layer itself is sane before any storage access, mirroring `now()` right below it and `update.ts`'s own
  // `now()`-only version of the same guard. `currentOrigin`'s *value* still matters one call later — `check.ts`'s
  // `runEntryRecovery` calls it again to build the recovery page's return-path URL — so confirming here that it is
  // callable at all avoids reading storage in an environment where that downstream use would already be broken.
  const currentOrigin = tryCall(() => ports.currentOrigin());
  const now = tryCall(() => ports.now());
  if (currentOrigin === undefined || now === undefined || !Number.isFinite(now)) {
    diagnostics.push(diagnostic("entry.runtime-unavailable", ""));
    return { kind: "none", diagnostics };
  }

  let stored: EntryManifest | null;
  try {
    stored = await ports.loadStored();
  } catch {
    diagnostics.push(diagnostic("entry.storage-unavailable", ""));
    return { kind: "none", diagnostics };
  }

  if (stored === null) return { kind: "none", diagnostics };

  // Confirmed, kept (EM3, tasks/pwa-entry-resilience/plan.md): nothing re-validates the stored manifest's other
  // fields on read (that already happened once, at `updateEntryManifest` time) — except expiry, re-checked here on
  // every read. Signing is gone, so nothing else would stop an expired manifest from staying displayed once it is
  // stored, and the spec requires "过期后不展示" regardless of how long ago the record was written. Config no
  // longer carries `appId`/`environment` for anything past this loop.
  const expiresAtMs = parseStrictIsoUtc(stored.expiresAt);
  if (expiresAtMs === undefined || now >= expiresAtMs) {
    diagnostics.push(diagnostic("entry.expired", ""));
    return { kind: "none", diagnostics };
  }

  const decision = await decideRecovery(stored, ports);
  if (decision.kind === "none") {
    diagnostics.push(...decision.diagnostics);
    return { kind: "none", diagnostics };
  }

  return { kind: "available", status: decision.status, manifest: decision.manifest, entries: decision.entries, diagnostics };
}
