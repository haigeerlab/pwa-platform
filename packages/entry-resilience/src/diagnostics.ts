// Every diagnostic this package can produce, plus the closed shape every one of them takes. Codes are the only
// thing callers may branch on; `path` is a JSON-Pointer-like location built from field names and array indices
// that are always known ahead of time — never from a value read out of the manifest being checked. That is what
// keeps the "never echo input" rule (see the module's trust model) mechanically true rather than merely intended.
//
// ADR-0033 (2026-09-23) removed the package's cryptographic trust root: the platform no longer verifies a signed
// envelope, so every code that named an envelope, a public key set, a build-time seed or a discovery-source fetch
// against an origin approval list was deleted here along with src/verify.ts, src/keys.ts (see tasks/pwa-entry-
// resilience/plan.md, "EM2") and src/browser/discovery.ts's `entry.discovery-*` codes ("EM3").

export const ENTRY_DIAGNOSTIC_CODES = [
  // Manifest field validation (src/manifest.ts): the plain object the application hands in.
  "entry.manifest-invalid-shape",
  "entry.app-id-mismatch",
  "entry.environment-mismatch",
  "entry.sequence-invalid",
  "entry.expires-at-invalid",
  "entry.expired",
  "entry.validity-period-too-long",
  "entry.status-invalid",
  "entry.reason-invalid-shape",
  "entry.reason-code-invalid",
  "entry.reason-message-invalid",
  "entry.entries-too-many",
  "entry.entry-invalid-shape",
  "entry.entry-origin-invalid",
  "entry.entry-start-path-invalid",
  // Write-time "does this beat what is already stored" decision (src/select.ts, src/update.ts).
  "entry.sequence-not-greater",
  // Display decision (src/decide.ts) and storage/runtime ports (src/resolve.ts, src/update.ts).
  "entry.no-entries",
  "entry.storage-unavailable",
  "entry.storage-write-failed",
  "entry.runtime-unavailable",
  "entry.return-path-dropped",
  // pwaEntryResilience plugin option validation and build integration (src/vite/), see
  // spec/pwa-entry-resilience.md's "构建集成". Build-time-only: they name a plugin option or a build state, never a
  // manifest field.
  "entry.max-validity-days-invalid",
  "entry.css-invalid",
  "entry.option-removed",
  "entry.locale-invalid",
  "entry.message-invalid",
  "entry.base-mismatch",
  "entry.platform-plugin-missing",
  "entry.platform-plan-unavailable",
  "entry.recovery-page-not-precached",
] as const;

export type EntryDiagnosticCode = (typeof ENTRY_DIAGNOSTIC_CODES)[number];

/** JSON Pointer (RFC 6901) into the value being checked; `""` addresses the root. */
export type EntryDiagnosticPath = "" | `/${string}`;

/** Machine-readable finding. Carries no message and must never be built from an input value. */
export type EntryDiagnostic = {
  readonly code: EntryDiagnosticCode;
  readonly path: EntryDiagnosticPath;
};

export function diagnostic(code: EntryDiagnosticCode, path: EntryDiagnosticPath): EntryDiagnostic {
  return { code, path };
}
