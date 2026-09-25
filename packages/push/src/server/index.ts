// Node-safe backend entry: constructs and validates the platform push payload (spec/push-module.md "设计 / 4. 后端
// 入口"; ADR-0021). Delegates every format rule to @pwa-platform/sw-runtime's zero-dependency ./push-payload entry
// (re-exported below) so the worker that parses a payload and this backend that constructs one share a single
// implementation. This file adds only what belongs on the constructing side: building a candidate object without
// ever invoking an accessor, and reporting a diagnosable error instead of returning `null`.
//
// Sending, encryption, VAPID signing and subscription storage are the business backend's own job (ADR-0021,
// spec/push-module.md "不在范围") — nothing here performs I/O or touches a browser/service-worker global (see
// tsconfig.server.json, which type-checks this directory with no DOM lib at all). Errors never echo an input
// value: only a diagnostic code and a JSON-pointer-style field path (spec/push-module.md "隐私" / "已核实的现状").
import {
  checkPushPayload,
  checkPushPayloadText,
  PUSH_PAYLOAD_ISSUE_CODES,
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_PAYLOAD_VERSION,
  validatePushPayload,
  type PwaPushPayload,
  type PwaPushPayloadCheck,
  type PwaPushPayloadIssue,
  type PwaPushPayloadIssueCode,
} from "@pwa-platform/sw-runtime/push-payload";

export type { PwaPushPayload, PwaPushPayloadCheck, PwaPushPayloadIssue, PwaPushPayloadIssueCode };
export { PUSH_PAYLOAD_ISSUE_CODES, PUSH_PAYLOAD_MAX_BYTES, PUSH_PAYLOAD_VERSION, checkPushPayloadText, validatePushPayload };

/** Input to `createPushPayload`: the payload minus `v`, which only the builder sets (see below). */
export type PwaPushPayloadInput = Omit<PwaPushPayload, "v">;

/**
 * Thrown by `createPushPayload` when `input` fails the platform push format. `issues` is the same list
 * `checkPushPayload`/`checkPushPayloadText` return. `message` formats those issues for a human and, like `issues`
 * itself, never contains an input value — only a diagnostic code and a field path.
 */
export class PwaPushPayloadError extends Error {
  readonly issues: readonly PwaPushPayloadIssue[];

  constructor(issues: readonly PwaPushPayloadIssue[]) {
    super(issues.map((issue) => `${issue.code} at ${issue.path === "" ? "(payload)" : issue.path}`).join("; "));
    this.name = "PwaPushPayloadError";
    this.issues = issues;
  }
}

/** True for a data property descriptor: an accessor descriptor is never invoked to read its value. */
function isDataDescriptor(descriptor: PropertyDescriptor): boolean {
  return "value" in descriptor;
}

/** True for a plain object: not `null`, not an array, and either `Object.prototype` or a null prototype. */
function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Copies `input`'s own enumerable string-keyed properties into a plain object, reading each through its property
 * descriptor so an accessor is never invoked. An accessor property is copied in as `true` — a non-string
 * placeholder that still reaches `checkPushPayload` as present, so it is reported as `push.payload-field-type`
 * rather than silently vanishing. Symbol-keyed and non-enumerable properties are dropped, same as a plain
 * `{ ...input }` spread would drop non-enumerable ones (unlike spread, this never invokes a getter).
 */
function ownDataProps(input: object): Record<string, unknown> {
  // A null-prototype target: with `{}`, assigning an own "__proto__" key (e.g. from JSON.parse) would set the
  // copy's prototype instead of creating a field, and the extra key would slip past the unknown-field check.
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined) continue; // cannot happen for a key Object.keys just reported, kept for totality
    result[key] = isDataDescriptor(descriptor) ? descriptor.value : true;
  }
  return result;
}

/**
 * Builds and validates a platform push payload from `input`, returning its exact UTF-8 JSON text
 * (spec/push-module.md "设计 / 4. 后端入口"). Throws `PwaPushPayloadError` for any invalid input. Never invokes an
 * accessor property and never includes an input value in the thrown error.
 */
export function createPushPayload(input: PwaPushPayloadInput): string {
  if (!isPlainObject(input)) throw new PwaPushPayloadError([{ code: "push.payload-not-object", path: "" }]);

  // `PwaPushPayloadInput` omits `v` — the builder below is the only place `v` is set. An input object that still
  // carries an own "v" key is always a caller mistake (it would otherwise silently override the version through
  // the spread just below); reporting it as an unknown field makes that visible instead of masking it.
  if (Object.prototype.hasOwnProperty.call(input, "v")) {
    throw new PwaPushPayloadError([{ code: "push.payload-unknown-field", path: "" }]);
  }

  const candidate = { v: PUSH_PAYLOAD_VERSION, ...ownDataProps(input) };
  const checked: PwaPushPayloadCheck = checkPushPayload(candidate);
  if (!checked.ok) throw new PwaPushPayloadError(checked.issues);

  const text = JSON.stringify(checked.value);
  const final = checkPushPayloadText(text);
  if (!final.ok) throw new PwaPushPayloadError(final.issues);

  return text;
}
