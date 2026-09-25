// The platform push payload: a closed, zero-dependency format shared by the platform worker (which parses and
// displays it) and the business backend (which constructs it, via @pwa-platform/push/server's re-export). It imports
// nothing, so the same validation runs unchanged wherever this entry is bundled. Spec: spec/push-module.md "设计 / 1.
// 推送格式"; ADR-0021.

/** The platform push payload. `v` is closed at 1; every other field is validated by `checkPushPayload`. */
export type PwaPushPayload = {
  readonly v: 1;
  /** 1..120 Unicode code points. */
  readonly title: string;
  /** 0..480 Unicode code points. */
  readonly body?: string;
  /** 1..64 Unicode code points. Notifications sharing a tag replace one another. */
  readonly tag?: string;
  /** 1..2048 Unicode code points. Format-level only: the worker resolves and range-checks the target later. */
  readonly url?: string;
  /** 0..256 Unicode code points. Opaque to the platform. */
  readonly data?: string;
};

export const PUSH_PAYLOAD_VERSION = 1 as const;

/** UTF-8 byte limit for the whole payload text (Web Push's 4096-byte record limit, less headroom for encryption). */
export const PUSH_PAYLOAD_MAX_BYTES = 3072 as const;

export const PUSH_PAYLOAD_ISSUE_CODES = [
  "push.payload-too-large",
  "push.payload-not-json",
  "push.payload-not-object",
  "push.payload-unknown-field",
  "push.payload-version",
  "push.payload-field-type",
  "push.payload-field-length",
] as const;

export type PwaPushPayloadIssueCode = (typeof PUSH_PAYLOAD_ISSUE_CODES)[number];

/** `path` is a JSON pointer into the payload: `""` for the whole payload, `"/title"` for a single field. */
export type PwaPushPayloadIssue = {
  readonly code: PwaPushPayloadIssueCode;
  readonly path: string;
};

export type PwaPushPayloadCheck =
  | { readonly ok: true; readonly value: PwaPushPayload }
  | { readonly ok: false; readonly issues: readonly PwaPushPayloadIssue[] };

type PushPayloadField = "title" | "body" | "tag" | "url" | "data";

const FIELD_ORDER: readonly PushPayloadField[] = ["title", "body", "tag", "url", "data"];

const FIELD_LIMITS: Readonly<Record<PushPayloadField, { readonly required: boolean; readonly min: number; readonly max: number }>> = {
  title: { required: true, min: 1, max: 120 },
  body: { required: false, min: 0, max: 480 },
  tag: { required: false, min: 1, max: 64 },
  url: { required: false, min: 1, max: 2048 },
  data: { required: false, min: 0, max: 256 },
};

const KNOWN_KEYS: ReadonlySet<PropertyKey> = new Set<PropertyKey>(["v", "title", "body", "tag", "url", "data"]);

/** True only for a data property descriptor: an accessor is never invoked to read its value. */
function isDataDescriptor(descriptor: PropertyDescriptor): boolean {
  return "value" in descriptor;
}

/** Unicode code point count, so an astral character (e.g. an emoji) counts once rather than as two UTF-16 units. */
function codePointLength(text: string): number {
  return [...text].length;
}

/**
 * Validates an already-parsed value against the payload format. Reports every issue found, in a deterministic
 * order: unknown fields (in the order their keys appear on the object), then the version, then each known field in
 * schema order. Never invokes an accessor property and never includes an input value in an issue. Used directly by
 * the server-side payload builder (a later task); the worker and `checkPushPayloadText` go through this too.
 */
export function checkPushPayload(value: unknown): PwaPushPayloadCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ code: "push.payload-not-object", path: "" }] };
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, issues: [{ code: "push.payload-not-object", path: "" }] };
  }

  const issues: PwaPushPayloadIssue[] = [];

  for (const key of Reflect.ownKeys(value)) {
    if (!KNOWN_KEYS.has(key)) issues.push({ code: "push.payload-unknown-field", path: "" });
  }

  const versionDescriptor = Object.getOwnPropertyDescriptor(value, "v");
  if (versionDescriptor === undefined || !isDataDescriptor(versionDescriptor) || versionDescriptor.value !== PUSH_PAYLOAD_VERSION) {
    issues.push({ code: "push.payload-version", path: "/v" });
  }

  const fields: Partial<Record<PushPayloadField, string>> = {};

  for (const field of FIELD_ORDER) {
    const limit = FIELD_LIMITS[field];
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined) {
      if (limit.required) issues.push({ code: "push.payload-field-type", path: `/${field}` });
      continue;
    }
    if (!isDataDescriptor(descriptor) || typeof descriptor.value !== "string") {
      issues.push({ code: "push.payload-field-type", path: `/${field}` });
      continue;
    }
    const fieldValue: string = descriptor.value;
    const length = codePointLength(fieldValue);
    if (length < limit.min || length > limit.max) {
      issues.push({ code: "push.payload-field-length", path: `/${field}` });
      continue;
    }
    fields[field] = fieldValue;
  }

  if (issues.length > 0) return { ok: false, issues };

  // `title` is required; with no issues collected, its required-field and type checks above must have passed, so a
  // value was recorded. (No throw: this module never throws, for any input.)
  const payload: { title: string; body?: string; tag?: string; url?: string; data?: string } = { title: fields.title as string };
  if (fields.body !== undefined) payload.body = fields.body;
  if (fields.tag !== undefined) payload.tag = fields.tag;
  if (fields.url !== undefined) payload.url = fields.url;
  if (fields.data !== undefined) payload.data = fields.data;

  return { ok: true, value: Object.freeze({ v: PUSH_PAYLOAD_VERSION, ...payload }) };
}

/**
 * Validates the raw push text as received by the worker: the UTF-8 byte limit on the text itself, then `JSON.parse`,
 * then `checkPushPayload`. Never throws: a `JSON.parse` failure becomes a `push.payload-not-json` issue.
 */
export function checkPushPayloadText(text: string): PwaPushPayloadCheck {
  if (new TextEncoder().encode(text).length > PUSH_PAYLOAD_MAX_BYTES) {
    return { ok: false, issues: [{ code: "push.payload-too-large", path: "" }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, issues: [{ code: "push.payload-not-json", path: "" }] };
  }

  return checkPushPayload(parsed);
}

/** Convenience for the worker: the payload, or `null` for anything invalid. */
export function validatePushPayload(text: string): PwaPushPayload | null {
  const result = checkPushPayloadText(text);
  return result.ok ? result.value : null;
}
