// Page-side entry for apps: spec/push-module.md "设计 / 3. 页面入口"; ADR-0021. Feature-detects Web Push, reads the
// existing service-worker registration for a scope, and wraps subscribe/unsubscribe with the validation the spec
// requires before the browser is ever touched. This file imports nothing — no package, no relative import outside
// src/client, not even sw-runtime or ./server — so it stays usable in any bundle that only wants the page API.
//
// Per spec "设计 / 3" and "边界": this module never registers a worker, never requests permission outside
// `subscribePush`, sends no network requests, stores nothing, and never puts a subscription endpoint, key or the
// caller's input into an error message or log.

/** Identifies the app's service-worker scope this call targets. Same shape as `PwaClientConfig.scope`. */
export type PwaPushTarget = {
  /** Absolute path, starting and ending with "/", no query or fragment. */
  readonly scope: string;
};

export type PwaPushState = "unsupported" | "no-registration" | "denied" | "prompt" | "subscribed" | "not-subscribed";

export const PUSH_CLIENT_ERROR_CODES = [
  "push.invalid-target",
  "push.unsupported",
  "push.no-registration",
  "push.registration-failed",
  "push.subscription-failed",
  "push.invalid-key",
  "push.key-mismatch",
  "push.permission-denied",
  "push.subscribe-failed",
  "push.unsubscribe-failed",
] as const;

export type PwaPushClientErrorCode = (typeof PUSH_CLIENT_ERROR_CODES)[number];

/** Thrown by every function in this module. `message` is always exactly `code`; never carries endpoint, key or input. */
export class PwaPushClientError extends Error {
  readonly code: PwaPushClientErrorCode;

  constructor(code: PwaPushClientErrorCode) {
    super(code);
    this.name = "PwaPushClientError";
    this.code = code;
  }
}

/** Validates `target.scope` before anything else runs. Throws inside an `async` body, so callers only ever see a rejection. */
function validateTarget(target: unknown): asserts target is PwaPushTarget {
  const scope: unknown = typeof target === "object" && target !== null ? (target as { readonly scope?: unknown }).scope : undefined;
  const valid = typeof scope === "string" && scope.startsWith("/") && scope.endsWith("/") && !scope.includes("?") && !scope.includes("#");
  if (!valid) throw new PwaPushClientError("push.invalid-target");
}

/** No UA sniffing: presence checks only, per spec "特性检测". */
function isSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof PushManager !== "undefined" && typeof Notification !== "undefined";
}

/**
 * The registration for `scope`, but only if its own scope matches exactly — a browser can return a registration for
 * a broader or narrower scope, which this module must never mistake for the requested one. Never registers a worker.
 */
async function getExactRegistration(scope: string): Promise<ServiceWorkerRegistration | undefined> {
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.getRegistration(scope);
  } catch {
    throw new PwaPushClientError("push.registration-failed");
  }
  if (registration === undefined) return undefined;
  return registration.scope === new URL(scope, location.href).href ? registration : undefined;
}

/** Reads a subscription without exposing any browser-provided error details to the application. */
async function getSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    throw new PwaPushClientError("push.subscription-failed");
  }
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_CHAR_VALUES: ReadonlyMap<string, number> = new Map([...BASE64URL_ALPHABET].map((char, index) => [char, index]));
const BASE64URL_CHARSET = /^[A-Za-z0-9_-]+$/;

/**
 * Strict base64url decode: only `A-Za-z0-9_-`, no `=` padding, no whitespace, and no non-canonical trailing bits
 * (the spare bits in the last character group must be zero). Never throws; an invalid encoding returns `undefined`.
 * Deliberately hand-rolled instead of `atob`, which is lenient about exactly the malformed input this must reject.
 */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!BASE64URL_CHARSET.test(value) || value.length % 4 === 1) return undefined;

  const bytes: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const char of value) {
    const charValue = BASE64URL_CHAR_VALUES.get(char);
    if (charValue === undefined) return undefined;
    bits = ((bits << 6) | charValue) & 0xffff;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >>> bitCount) & 0xff);
    }
  }
  // Whatever is left over is padding bits that carry no byte; a canonical encoding always zeroes them.
  if (bitCount > 0 && (bits & ((1 << bitCount) - 1)) !== 0) return undefined;

  return new Uint8Array(bytes);
}

/**
 * Decodes a base64url `applicationServerKey` (no padding) into the raw bytes `pushManager.subscribe` expects,
 * rejecting before the browser is touched unless it is exactly 65 bytes starting with 0x04 (uncompressed P-256).
 */
function decodeApplicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const bytes = decodeBase64Url(key);
  if (bytes === undefined || bytes.length !== 65 || bytes[0] !== 0x04) throw new PwaPushClientError("push.invalid-key");
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Reads the six-way push state for `target` (spec "设计 / 3"). Never calls `Notification.requestPermission` or
 * `pushManager.subscribe` — this is a read-only status check.
 */
export async function getPushState(target: PwaPushTarget): Promise<PwaPushState> {
  validateTarget(target);
  if (!isSupported()) return "unsupported";

  const registration = await getExactRegistration(target.scope);
  if (registration === undefined) return "no-registration";
  if (Notification.permission === "denied") return "denied";

  const subscription = await getSubscription(registration);
  if (subscription !== null) return "subscribed";
  if (Notification.permission === "default") return "prompt";
  return "not-subscribed";
}

/**
 * Subscribes `target` to push using `options.applicationServerKey`, requesting notification permission only if it is
 * still "default" and only from this call (spec "只在应用调用 subscribePush 时请求权限"). An existing subscription with
 * the same key is returned as-is, without requesting permission; a different or unreadable key is rejected without
 * touching the existing subscription (the caller must unsubscribe first).
 */
export async function subscribePush(target: PwaPushTarget, options: { readonly applicationServerKey: string }): Promise<PushSubscriptionJSON> {
  validateTarget(target);
  if (!isSupported()) throw new PwaPushClientError("push.unsupported");

  const keyBytes = decodeApplicationServerKey(options.applicationServerKey);

  const registration = await getExactRegistration(target.scope);
  if (registration === undefined) throw new PwaPushClientError("push.no-registration");

  const existing = await getSubscription(registration);
  if (existing !== null) {
    const existingKeyBytes = existing.options.applicationServerKey === null ? null : new Uint8Array(existing.options.applicationServerKey);
    if (existingKeyBytes !== null && bytesEqual(existingKeyBytes, keyBytes)) return existing.toJSON();
    throw new PwaPushClientError("push.key-mismatch");
  }

  if (Notification.permission === "denied") throw new PwaPushClientError("push.permission-denied");
  if (Notification.permission === "default") {
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      throw new PwaPushClientError("push.permission-denied");
    }
    if (permission !== "granted") throw new PwaPushClientError("push.permission-denied");
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
  } catch {
    throw new PwaPushClientError("push.subscribe-failed");
  }
  return subscription.toJSON();
}

/** Unsubscribes `target`, returning the subscription that was cancelled (for the caller to tell its backend), or `null` if there was none. */
export async function unsubscribePush(target: PwaPushTarget): Promise<PushSubscriptionJSON | null> {
  validateTarget(target);
  if (!isSupported()) return null;

  const registration = await getExactRegistration(target.scope);
  if (registration === undefined) return null;

  const subscription = await getSubscription(registration);
  if (subscription === null) return null;

  const json = subscription.toJSON();
  let ok: boolean;
  try {
    ok = await subscription.unsubscribe();
  } catch {
    throw new PwaPushClientError("push.unsubscribe-failed");
  }
  if (!ok) throw new PwaPushClientError("push.unsubscribe-failed");
  return json;
}
