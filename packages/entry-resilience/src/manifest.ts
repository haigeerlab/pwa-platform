// Validates the plain manifest object the application hands in to `updateEntryManifest` — see
// spec/pwa-entry-resilience.md's "修订：入口清单由业务应用提供" -> "契约增量". ADR-0033 (2026-09-23) removed the
// package's cryptographic trust root, so there is no more envelope or signature stage before this runs: this
// function is now the whole of manifest validation, not (as before that revision) only the part that ran after a
// signature had already verified.
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import { isNormalizedOrigin } from "./internal/origin.js";
import { parseStrictIsoUtc } from "./internal/iso-date.js";
import { hasKeysWithin, isPlainObject } from "./internal/plain-object.js";
import { ENTRY_MANIFEST_REASON_CODES, ENTRY_MANIFEST_STATUSES } from "./types.js";
import type { EntryManifest, EntryManifestStatus, EntryManifestValidationContext } from "./types.js";

const MANIFEST_REQUIRED_FIELDS = ["sequence", "expiresAt", "status", "reason", "entries"] as const;
const MANIFEST_OPTIONAL_FIELDS = ["appId", "environment"] as const;
const REASON_REQUIRED_FIELDS = ["code"] as const;
const REASON_OPTIONAL_FIELDS = ["message"] as const;
const ENTRY_FIELDS = ["origin", "startPath"] as const;

const MAX_ENTRIES = 5;
const MAX_REASON_MESSAGE_LENGTH = 200;
const MAX_START_PATH_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True if `value` contains a C0 control character (U+0000-U+001F) or DEL (U+007F). Avoids a control-character
 *  regex literal, which most lint configs (including this repo's) flag as suspicious. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export type ManifestResult =
  | { readonly ok: true; readonly manifest: EntryManifest }
  | { readonly ok: false; readonly diagnostics: readonly EntryDiagnostic[] };

/** Validates the manifest object an application hands in. Whole-manifest rejection: never partially accepted.
 *  Never throws. */
export function parseEntryManifest(value: unknown, context: EntryManifestValidationContext): ManifestResult {
  if (!isPlainObject(value) || !hasKeysWithin(value, MANIFEST_REQUIRED_FIELDS, MANIFEST_OPTIONAL_FIELDS)) {
    return { ok: false, diagnostics: [diagnostic("entry.manifest-invalid-shape", "")] };
  }

  const diagnostics: EntryDiagnostic[] = [
    ...topLevelDiagnostics(value, context),
    ...reasonDiagnostics(value["reason"]),
    ...entriesDiagnostics(value["entries"]),
  ];

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, manifest: value as EntryManifest };
}

function topLevelDiagnostics(value: Record<string, unknown>, context: EntryManifestValidationContext): EntryDiagnostic[] {
  const diagnostics: EntryDiagnostic[] = [];

  if ("appId" in value && value["appId"] !== context.appId) {
    diagnostics.push(diagnostic("entry.app-id-mismatch", "/appId"));
  }
  if ("environment" in value && value["environment"] !== context.environment) {
    diagnostics.push(diagnostic("entry.environment-mismatch", "/environment"));
  }

  const sequence = value["sequence"];
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) {
    diagnostics.push(diagnostic("entry.sequence-invalid", "/sequence"));
  }

  const expiresAt = value["expiresAt"];
  const expiresAtMs = typeof expiresAt === "string" ? parseStrictIsoUtc(expiresAt) : undefined;
  if (expiresAtMs === undefined) {
    diagnostics.push(diagnostic("entry.expires-at-invalid", "/expiresAt"));
  } else if (context.now >= expiresAtMs) {
    // Must be in the future at the moment it is handed in (spec: "过期后不展示" applies to the write path too —
    // an already-expired manifest could otherwise never be displayed, making acceptance pointless).
    diagnostics.push(diagnostic("entry.expired", "/expiresAt"));
  } else if (expiresAtMs - context.now > context.maxValidityDays * DAY_MS) {
    diagnostics.push(diagnostic("entry.validity-period-too-long", "/expiresAt"));
  }

  if (!isEntryManifestStatus(value["status"])) diagnostics.push(diagnostic("entry.status-invalid", "/status"));

  return diagnostics;
}

function isEntryManifestStatus(value: unknown): value is EntryManifestStatus {
  return typeof value === "string" && (ENTRY_MANIFEST_STATUSES as readonly string[]).includes(value);
}

function reasonDiagnostics(value: unknown): EntryDiagnostic[] {
  if (!isPlainObject(value) || !hasKeysWithin(value, REASON_REQUIRED_FIELDS, REASON_OPTIONAL_FIELDS)) {
    return [diagnostic("entry.reason-invalid-shape", "/reason")];
  }

  const diagnostics: EntryDiagnostic[] = [];

  const code = value["code"];
  if (typeof code !== "string" || !(ENTRY_MANIFEST_REASON_CODES as readonly string[]).includes(code)) {
    diagnostics.push(diagnostic("entry.reason-code-invalid", "/reason/code"));
  }

  if ("message" in value) {
    const message = value["message"];
    if (typeof message !== "string" || message.length > MAX_REASON_MESSAGE_LENGTH || hasControlCharacter(message)) {
      diagnostics.push(diagnostic("entry.reason-message-invalid", "/reason/message"));
    }
  }

  return diagnostics;
}

function entriesDiagnostics(value: unknown): EntryDiagnostic[] {
  if (!Array.isArray(value)) return [diagnostic("entry.entry-invalid-shape", "/entries")];

  const diagnostics: EntryDiagnostic[] = [];
  if (value.length > MAX_ENTRIES) diagnostics.push(diagnostic("entry.entries-too-many", "/entries"));

  value.forEach((entry: unknown, index: number) => diagnostics.push(...entryDiagnostics(entry, index)));
  return diagnostics;
}

function entryDiagnostics(value: unknown, index: number): EntryDiagnostic[] {
  if (!isPlainObject(value) || !hasKeysWithin(value, ENTRY_FIELDS)) {
    return [diagnostic("entry.entry-invalid-shape", `/entries/${index}`)];
  }

  const diagnostics: EntryDiagnostic[] = [];

  const origin = value["origin"];
  if (typeof origin !== "string" || !isNormalizedOrigin(origin)) {
    diagnostics.push(diagnostic("entry.entry-origin-invalid", `/entries/${index}/origin`));
  }

  const startPath = value["startPath"];
  if (typeof startPath !== "string" || !isValidStartPath(startPath)) {
    diagnostics.push(diagnostic("entry.entry-start-path-invalid", `/entries/${index}/startPath`));
  }

  return diagnostics;
}

/** True if any `/`-delimited segment of `value` is exactly `..`. */
function hasDotDotSegment(value: string): boolean {
  return value.split("/").some((segment) => segment === "..");
}

/**
 * `startPath`'s rules, checked on the raw string and again on its single percent-decoding — the same "raw, then
 * decoded" shape src/return-path.ts uses for `?return=`, so a percent-encoded `..`, `\`, `//` or control character
 * cannot slip past the raw-string checks alone. A percent-encoding that fails to decode is rejected outright.
 */
function isValidStartPath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_START_PATH_LENGTH) return false;
  if (!value.startsWith("/")) return false;
  if (value.includes("\\") || value.includes("//")) return false;
  if (hasControlCharacter(value)) return false;
  if (hasDotDotSegment(value)) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (decoded.includes("\\") || decoded.includes("//")) return false;
  if (hasControlCharacter(decoded)) return false;
  if (hasDotDotSegment(decoded)) return false;

  return true;
}
