/** Message a page posts to the waiting platform worker once the user accepts an update. */
export type PwaSkipWaitingMessage = { readonly type: "pwa:skip-waiting" };

export const SKIP_WAITING_MESSAGE: PwaSkipWaitingMessage = Object.freeze({ type: "pwa:skip-waiting" });

/**
 * True only for a plain object (this realm's `Object.prototype` or a null prototype) whose single own property is a
 * `type` data property equal to `"pwa:skip-waiting"`. Structured-cloned messages have that shape; accessors are
 * never invoked.
 */
export function isSkipWaitingMessage(value: unknown): value is PwaSkipWaitingMessage {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "type") return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "type");
  return descriptor !== undefined && "value" in descriptor && descriptor.value === SKIP_WAITING_MESSAGE.type;
}

export type PwaOfflineWriteIntentMessage = {
  readonly targetId: string;
  readonly path: string;
  readonly body: unknown;
  readonly idempotencyKey: string;
  readonly sessionBinding: string;
};

export type PwaOfflineWriteMessage =
  | {
      readonly type: "pwa:offline-write:enqueue";
      readonly version: 1;
      readonly requestId: string;
      readonly intent: PwaOfflineWriteIntentMessage;
    }
  | {
      readonly type: "pwa:offline-write:flush";
      readonly version: 1;
      readonly requestId: string;
      readonly sessionBinding: string;
    }
  | { readonly type: "pwa:offline-write:clear"; readonly version: 1; readonly requestId: string };

/** The only acknowledgement a page accepts before it unregisters after an offline-write clear request. */
export type PwaOfflineWriteClearResult = {
  readonly type: "pwa:offline-write:result";
  readonly version: 1;
  readonly requestId: string;
  readonly status: "cleared";
};

/**
 * Recognizes only the v1 offline-write request envelopes. It deliberately validates only wire shape: target matching,
 * JSON encoding, length limits and persistence are enforced together by the queue so a future caller cannot mistake
 * a syntactically valid message for an accepted write. Reads never invoke a page-provided accessor.
 */
export function isOfflineWriteMessage(value: unknown): value is PwaOfflineWriteMessage {
  try {
    const envelope = plainDataObject(value);
    if (envelope === undefined || read(envelope, "version") !== 1 || typeof read(envelope, "requestId") !== "string") return false;

    const type = read(envelope, "type");
    if (type === "pwa:offline-write:clear") return dataObject(value, ["type", "version", "requestId"]) !== undefined;
    if (type === "pwa:offline-write:flush") {
      const flush = dataObject(value, ["type", "version", "requestId", "sessionBinding"]);
      return flush !== undefined && typeof read(flush, "sessionBinding") === "string";
    }
    if (type !== "pwa:offline-write:enqueue") return false;

    const enqueue = dataObject(value, ["type", "version", "requestId", "intent"]);
    if (enqueue === undefined) return false;
    const intent = dataObject(read(enqueue, "intent"), ["targetId", "path", "body", "idempotencyKey", "sessionBinding"]);
    return (
      intent !== undefined &&
      typeof read(intent, "targetId") === "string" &&
      typeof read(intent, "path") === "string" &&
      typeof read(intent, "idempotencyKey") === "string" &&
      typeof read(intent, "sessionBinding") === "string"
    );
  } catch {
    // Proxies can throw while revealing their prototype or own keys. A hostile message is simply not our protocol.
    return false;
  }
}

/** Matches one closed clear acknowledgement without reading page- or worker-provided accessors. */
export function isOfflineWriteClearResult(value: unknown, requestId: string): value is PwaOfflineWriteClearResult {
  const result = dataObject(value, ["type", "version", "requestId", "status"]);
  return (
    result !== undefined &&
    read(result, "type") === "pwa:offline-write:result" &&
    read(result, "version") === 1 &&
    read(result, "requestId") === requestId &&
    read(result, "status") === "cleared"
  );
}

export type PwaRuntimeCacheReason = "network-failed" | "network-timeout" | "stale-while-revalidate";

/** Posted by the worker to the client that received a runtime-cache-served response (spec "页面信号"). */
export type PwaRuntimeCacheServedMessage = {
  readonly type: "pwa:runtime-cache:served";
  readonly version: 1;
  readonly url: string;
  readonly cachedAt: number;
  readonly reason: PwaRuntimeCacheReason;
};

/** A page's request, sent with exactly one `MessagePort`, for any runtime-cache signal stashed for its navigation. */
export type PwaRuntimeCachePendingMessage = { readonly type: "pwa:runtime-cache:pending"; readonly version: 1 };

/** The worker's reply on that port: `null` when nothing was stashed for this client, or was too stale. */
export type PwaRuntimeCachePendingResult = {
  readonly type: "pwa:runtime-cache:pending-result";
  readonly version: 1;
  readonly served: null | { readonly url: string; readonly cachedAt: number; readonly reason: PwaRuntimeCacheReason };
};

/** Matches only the closed `{ type, version }` request envelope. Reads never invoke a page-provided accessor. */
export function isRuntimeCachePendingMessage(value: unknown): value is PwaRuntimeCachePendingMessage {
  const message = dataObject(value, ["type", "version"]);
  return message !== undefined && read(message, "type") === "pwa:runtime-cache:pending" && read(message, "version") === 1;
}

/** Matches only the closed served signal. Reads never invoke a page-provided accessor. */
export function isRuntimeCacheServedMessage(value: unknown): value is PwaRuntimeCacheServedMessage {
  const message = dataObject(value, ["type", "version", "url", "cachedAt", "reason"]);
  if (message === undefined || read(message, "type") !== "pwa:runtime-cache:served" || read(message, "version") !== 1) return false;
  if (typeof read(message, "url") !== "string" || typeof read(message, "cachedAt") !== "number") return false;
  return isRuntimeCacheReason(read(message, "reason"));
}

/** Matches only the closed pending-result reply. Reads never invoke a page-provided accessor. */
export function isRuntimeCachePendingResult(value: unknown): value is PwaRuntimeCachePendingResult {
  const message = dataObject(value, ["type", "version", "served"]);
  if (message === undefined || read(message, "type") !== "pwa:runtime-cache:pending-result" || read(message, "version") !== 1) return false;
  const served = read(message, "served");
  if (served === null) return true;
  const entry = dataObject(served, ["url", "cachedAt", "reason"]);
  if (entry === undefined) return false;
  if (typeof read(entry, "url") !== "string" || typeof read(entry, "cachedAt") !== "number") return false;
  return isRuntimeCacheReason(read(entry, "reason"));
}

function isRuntimeCacheReason(value: unknown): value is PwaRuntimeCacheReason {
  return value === "network-failed" || value === "network-timeout" || value === "stale-while-revalidate";
}

function dataObject(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  const record = plainDataObject(value);
  if (record === undefined) return undefined;
  const actual = Reflect.ownKeys(record);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return undefined;
  return record;
}

function plainDataObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string" || !hasDataProperty(value, key))) return undefined;
  return value as Record<string, unknown>;
}

function hasDataProperty(value: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor;
}

function read(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}
