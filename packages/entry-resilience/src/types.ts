// Public contract types for the entry-recovery manifest the application hands in. Field names and shapes mirror
// spec/pwa-entry-resilience.md's "修订：入口清单由业务应用提供" -> "契约增量" section exactly; this module only
// declares types, it performs no checks (see src/manifest.ts for validation).
//
// ADR-0033 (2026-09-23) removed the package's cryptographic trust root: there is no more signed envelope, build-
// time public key set or `schemaVersion`. `EntryKey`, `EntryEnvelope`, `EntryVerifyContext` and `EntryVerification`
// existed only for that model and were deleted along with src/verify.ts and src/keys.ts.

export const ENTRY_MANIFEST_STATUSES = ["normal", "migrating", "incident"] as const;
export type EntryManifestStatus = (typeof ENTRY_MANIFEST_STATUSES)[number];

export const ENTRY_MANIFEST_REASON_CODES = ["planned-migration", "incident", "none"] as const;
export type EntryManifestReasonCode = (typeof ENTRY_MANIFEST_REASON_CODES)[number];

export type EntryManifestReason = {
  readonly code: EntryManifestReasonCode;
  /** Plain text, at most 200 UTF-16 code units, no control characters. */
  readonly message?: string;
};

export type EntryManifestEntry = {
  /** Normalized origin: HTTPS, or HTTP on a loopback host for local development. Not checked against any
   *  build-time approval list — ADR-0033 removed that list along with the signature it used to backstop. */
  readonly origin: string;
  /** Absolute path: starts with `/`, no `..` segments, no backslashes, no `//`, at most 512 characters. */
  readonly startPath: string;
};

/** The plain object the application hands in to `updateEntryManifest`, once parsed and field-validated. */
export type EntryManifest = {
  /** Non-negative safe integer; only a manifest with a strictly greater `sequence` than what is already stored
   *  replaces it (see src/select.ts). */
  readonly sequence: number;
  /** ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ssZ`); must be in the future when handed in, and no further out than the
   *  configured `maxValidityDays`. */
  readonly expiresAt: string;
  readonly status: EntryManifestStatus;
  readonly reason: EntryManifestReason;
  /** 0 to 5 entries. */
  readonly entries: readonly EntryManifestEntry[];
  /** Optional; when given, must equal the application's identity exactly. */
  readonly appId?: string;
  /** Optional; when given, must equal the application's identity exactly. */
  readonly environment?: string;
};

/** Everything `parseEntryManifest` needs and cannot read from ambient state — the clock included. */
export type EntryManifestValidationContext = {
  readonly appId: string;
  readonly environment: string;
  /** Integer 1-90: the maximum number of days between the moment the manifest is handed in and its `expiresAt`. */
  readonly maxValidityDays: number;
  /** Current time in epoch milliseconds, injected so validation never reads the system clock. */
  readonly now: number;
};
