import type { PwaOfflineWriteMessage } from "../messages/index.js";
import type { PwaPlatformWorkerConfig } from "../shared/config.js";

type EnqueueMessage = Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:enqueue" }>;
type FlushMessage = Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:flush" }>;

export type PwaOfflineWriteIntent = {
  readonly targetId: string;
  readonly path: string;
  /** Canonical JSON text; the original object is deliberately not retained beyond this boundary. */
  readonly bodyJson: string;
  readonly idempotencyKey: string;
  readonly sessionBinding: string;
};

export type PwaOfflineWriteIntentResult =
  | { readonly ok: true; readonly value: PwaOfflineWriteIntent }
  | { readonly ok: false; readonly code: string };
export type PwaOfflineWriteFlushValidationResult =
  | { readonly ok: true; readonly binding: string }
  | { readonly ok: false; readonly code: string };

const OPAQUE_ASCII = /^[\x21-\x7e]{1,128}$/;
const SESSION_BINDING = /^[\x21-\x7e]{16,128}$/;

/** Validates and canonicalizes one explicit enqueue request before any persistent storage is opened. */
export function validateOfflineWriteEnqueue(
  message: EnqueueMessage,
  config: PwaPlatformWorkerConfig,
  origin: string,
): PwaOfflineWriteIntentResult {
  if (!config.offlineWrites.enabled) return { ok: false, code: "offline-write.disabled" };
  const { intent } = message;
  const target = config.offlineWrites.targets.find((candidate) => candidate.id === intent.targetId);
  if (target === undefined) return { ok: false, code: "offline-write.target" };
  if (!OPAQUE_ASCII.test(intent.idempotencyKey)) return { ok: false, code: "offline-write.idempotency-key" };
  if (!SESSION_BINDING.test(intent.sessionBinding)) return { ok: false, code: "offline-write.session-binding" };

  const path = canonicalSameOriginPath(intent.path, origin);
  if (path === undefined || !isWithin(path, config.scope) || !isWithin(path, target.pathPrefix)) {
    return { ok: false, code: "offline-write.path" };
  }
  const bodyJson = jsonText(intent.body);
  if (bodyJson === undefined || new TextEncoder().encode(bodyJson).length > target.maxBodyBytes) {
    return { ok: false, code: "offline-write.body" };
  }
  return { ok: true, value: { targetId: target.id, path, bodyJson, idempotencyKey: intent.idempotencyKey, sessionBinding: intent.sessionBinding } };
}

/** Checks the current page's opaque binding before a later flush may inspect stored records. */
export function validateOfflineWriteFlush(message: FlushMessage, config: PwaPlatformWorkerConfig): PwaOfflineWriteFlushValidationResult {
  if (!config.offlineWrites.enabled) return { ok: false, code: "offline-write.disabled" };
  if (!SESSION_BINDING.test(message.sessionBinding)) return { ok: false, code: "offline-write.session-binding" };
  return { ok: true, binding: message.sessionBinding };
}

function canonicalSameOriginPath(value: string, origin: string): string | undefined {
  if (!value.startsWith("/") || !URL.canParse(value, origin)) return undefined;
  const url = new URL(value, origin);
  return url.origin === origin && url.search === "" && url.hash === "" && url.pathname === value ? value : undefined;
}

function isWithin(path: string, prefix: string): boolean {
  if (prefix === "/") return true;
  const directory = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return path === prefix || path === directory.slice(0, -1) || path.startsWith(directory);
}

function jsonText(value: unknown): string | undefined {
  try {
    if (!isJsonValue(value, new WeakSet())) return undefined;
    const text = JSON.stringify(value);
    return text === undefined ? undefined : text;
  } catch {
    return undefined;
  }
}

function isJsonValue(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor) || !isJsonValue(descriptor.value, seen)) return false;
    }
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !isJsonValue(descriptor.value, seen)) return false;
  }
  return true;
}
