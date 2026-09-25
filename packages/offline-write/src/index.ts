import { isOfflineWriteClearResult } from "@pwa-platform/sw-runtime/messages";

export type OfflineWriteIntent = {
  readonly targetId: string;
  readonly path: string;
  readonly body: unknown;
  readonly idempotencyKey: string;
  readonly sessionBinding: string;
};

export type OfflineWriteQueue = {
  enqueue(intent: OfflineWriteIntent): Promise<{ readonly status: "queued" | "existing" }>;
  flush(sessionBinding: string): Promise<{ readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number }>;
  clear(): Promise<void>;
};

export type OfflineWriteQueueOptions = {
  readonly scope: string;
  readonly container?: ServiceWorkerContainer;
  readonly messageChannel?: () => MessageChannel;
};

const TIMEOUT_MS = 10_000;

/** Sends only closed protocol envelopes to a current controller; it never registers workers or accesses storage/network. */
export function createOfflineWriteQueue(options: OfflineWriteQueueOptions): OfflineWriteQueue {
  if (!isScope(options.scope)) throw new Error("offline-write.invalid-scope");
  const container = options.container ?? serviceWorkerContainer();
  const createChannel = options.messageChannel ?? (() => new MessageChannel());
  let nextRequestId = 1;

  async function request(message: Record<string, unknown>, accepted: (value: unknown, requestId: string) => unknown): Promise<unknown> {
    const registration = await container.getRegistration(options.scope);
    const controller = container.controller;
    if (registration === undefined || controller === null || registration.scope !== new URL(options.scope, location.href).href) {
      throw new Error("offline-write.uncontrolled");
    }
    const requestId = `offline-write-${nextRequestId++}`;
    const channel = createChannel();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        channel.port1.close();
        settle();
      };
      const timeout = setTimeout(() => finish(() => reject(new Error("offline-write.timeout"))), TIMEOUT_MS);
      channel.port1.onmessage = (event) => {
        const result = accepted(event.data, requestId);
        if (result === undefined) finish(() => reject(new Error("offline-write.protocol")));
        else finish(() => resolve(result));
      };
      channel.port1.onmessageerror = () => finish(() => reject(new Error("offline-write.protocol")));
      channel.port1.start();
      try {
        controller.postMessage({ ...message, version: 1, requestId }, [channel.port2]);
      } catch {
        finish(() => reject(new Error("offline-write.uncontrolled")));
      }
    });
  }

  return {
    enqueue: (intent) => request({ type: "pwa:offline-write:enqueue", intent }, enqueueResult) as Promise<{ readonly status: "queued" | "existing" }>,
    flush: (sessionBinding) => request({ type: "pwa:offline-write:flush", sessionBinding }, flushResult) as Promise<{ readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number }>,
    clear: async () => { await request({ type: "pwa:offline-write:clear" }, clearResult); },
  };
}

function enqueueResult(value: unknown, requestId: string): { readonly status: "queued" | "existing" } | undefined {
  const result = baseResult(value, requestId);
  return result !== undefined && (result.status === "queued" || result.status === "existing") ? { status: result.status } : undefined;
}

function flushResult(value: unknown, requestId: string): { readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number } | undefined {
  const result = baseResult(value, requestId);
  if (result === undefined || result.status !== "flushed" || !exactKeys(value, ["type", "version", "requestId", "status", "sent", "retained", "failed", "purged"])) return undefined;
  const { sent, retained, failed, purged } = result.value;
  if (![sent, retained, failed, purged].every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) return undefined;
  return { sent: sent as number, retained: retained as number, failed: failed as number, purged: purged as number };
}

function clearResult(value: unknown, requestId: string): true | undefined {
  return isOfflineWriteClearResult(value, requestId) ? true : undefined;
}

function baseResult(value: unknown, requestId: string): { readonly status: string; readonly value: { readonly sent: unknown; readonly retained: unknown; readonly failed: unknown; readonly purged: unknown } } | undefined {
  if (!exactKeys(value, ["type", "version", "requestId", "status"]) && !exactKeys(value, ["type", "version", "requestId", "status", "sent", "retained", "failed", "purged"])) return undefined;
  const record = value as Record<string, unknown>;
  if (record.type !== "pwa:offline-write:result" || record.version !== 1 || record.requestId !== requestId || typeof record.status !== "string") return undefined;
  return { status: record.status, value: record as { readonly sent: unknown; readonly retained: unknown; readonly failed: unknown; readonly purged: unknown } };
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isScope(value: string): boolean {
  return value.startsWith("/") && value.endsWith("/") && !value.includes("?") && !value.includes("#") && URL.canParse(value, "https://offline-write.invalid");
}

function serviceWorkerContainer(): ServiceWorkerContainer {
  if (typeof navigator === "undefined" || navigator.serviceWorker === undefined) throw new Error("offline-write.unsupported");
  return navigator.serviceWorker;
}
