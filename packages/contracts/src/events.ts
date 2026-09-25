import type { PwaDiagnostic, PwaDiagnosticCode } from "./diagnostics.js";
import { diagnostic } from "./internal/diagnostic.js";
import { findNonJsonValue, isExtensionNamespace } from "./internal/json.js";
import type { JsonPrimitive, PwaExtensions } from "./json.js";

export const LIFECYCLE_EVENT_TYPES = [
  "registered",
  "install-eligible",
  "installed",
  "update-waiting",
  "update-applied",
  "activated",
  "offline-fallback",
  "cache-cleaned",
  "served-from-cache",
] as const;

export type PwaLifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export type PwaEventEnvelope<TType extends string = PwaLifecycleEventType> = {
  readonly version: 1;
  readonly type: TType;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly appId: string;
  /** Non-sensitive flat metadata; never tokens, subscription endpoints or user data. */
  readonly metadata: { readonly [key: string]: JsonPrimitive };
  readonly extensions?: PwaExtensions;
};

export type PwaLifecycleEvent = {
  [TType in PwaLifecycleEventType]: PwaEventEnvelope<TType>;
}[PwaLifecycleEventType];

export type PwaEventReadResult =
  | { readonly kind: "known"; readonly event: PwaLifecycleEvent }
  | { readonly kind: "unknown"; readonly event: PwaEventEnvelope<string> }
  | { readonly kind: "invalid"; readonly diagnostics: readonly [PwaDiagnostic, ...PwaDiagnostic[]] };

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

type FieldCheck = (value: unknown) => PwaDiagnosticCode | undefined;

const nonEmptyString: FieldCheck = (value) =>
  typeof value !== "string" ? "schema.invalid-type" : value === "" ? "schema.invalid-value" : undefined;

/** Envelope fields in reporting order; every field except `extensions` is required. */
const FIELD_CHECKS: Readonly<Record<keyof PwaEventEnvelope<string>, FieldCheck>> = {
  version: (value) =>
    typeof value !== "number" ? "schema.invalid-type" : value !== 1 ? "schema.unsupported-version" : undefined,
  type: nonEmptyString,
  timestamp: (value) =>
    typeof value !== "string"
      ? "schema.invalid-type"
      : isIsoTimestamp(value)
        ? undefined
        : "schema.invalid-value",
  appId: nonEmptyString,
  metadata: (value) =>
    isRecord(value) && Object.values(value).every((entry) => entry === null || typeof entry !== "object")
      ? undefined
      : "schema.invalid-type",
  extensions: (value) =>
    !isRecord(value)
      ? "schema.invalid-type"
      : Object.keys(value).every(isExtensionNamespace)
        ? undefined
        : "extensions.invalid-namespace",
};

/**
 * Reads a lifecycle event envelope without throwing. Envelopes whose event type this version does
 * not know are returned as `unknown` so consumers can ignore them safely.
 *
 * Hand-written on purpose: browser runtimes call this, so it must not load the schema library.
 */
export function readLifecycleEvent(input: unknown): PwaEventReadResult {
  try {
    const [first, ...rest] = envelopeFindings(input);
    if (first) return { kind: "invalid", diagnostics: [first, ...rest] };

    const event = input as PwaEventEnvelope<string>;
    return isLifecycleEventType(event.type)
      ? { kind: "known", event: event as PwaLifecycleEvent }
      : { kind: "unknown", event };
  } catch {
    // Hostile inputs (revoked proxies, throwing traps, extreme nesting) must still produce a result.
    return { kind: "invalid", diagnostics: [diagnostic("value.not-serializable", [])] };
  }
}

function envelopeFindings(input: unknown): PwaDiagnostic[] {
  const nonJson = findNonJsonValue(input);
  if (nonJson) return [diagnostic("value.not-serializable", nonJson)];
  if (!isRecord(input)) return [diagnostic("schema.invalid-type", [])];

  const findings: PwaDiagnostic[] = [];
  if (Object.keys(input).some((key) => !Object.hasOwn(FIELD_CHECKS, key))) {
    findings.push(diagnostic("schema.unknown-field", []));
  }
  for (const [field, check] of Object.entries(FIELD_CHECKS)) {
    if (!Object.hasOwn(input, field)) {
      if (field !== "extensions") findings.push(diagnostic("schema.missing-field", [field]));
      continue;
    }
    const code = check(input[field]);
    if (code) findings.push(diagnostic(code, [field]));
  }
  return findings;
}

/** Calendar-checked ISO 8601 date-time; `Date.parse` is lenient in engine-specific ways. */
function isIsoTimestamp(value: string): boolean {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [year = NaN, month = NaN, day = NaN, hour = NaN, minute = NaN, second = NaN, offsetHour = 0, offsetMinute = 0] =
    match.slice(1).map((part) => Number(part ?? 0));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLifecycleEventType(type: string): type is PwaLifecycleEventType {
  return (LIFECYCLE_EVENT_TYPES as readonly string[]).includes(type);
}
