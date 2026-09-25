import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheName, runtimeDataCacheName } from "@pwa-platform/contracts";
import { registerRecoveryWorker } from "../../src/recovery-worker/index.js";
import type { PwaRecoveryWorkerConfig } from "../../src/shared/config.js";
import { deleteExpirationRecords } from "../../src/shared/expiration-records.js";

// The recovery worker deletes workbox-expiration records under its appCachePrefix (ADR-0035, T8 follow-up), stubbed
// here so these tests keep driving a fake `indexedDB` (for the offline-write database) without a real one.
vi.mock("../../src/shared/expiration-records.js", () => ({ deleteExpirationRecords: vi.fn(async () => undefined) }));

const expirationRecordsMock = vi.mocked(deleteExpirationRecords);

const config: PwaRecoveryWorkerConfig = {
  kind: "recovery",
  version: 1,
  appCachePrefix: "pwa:storefront:production:",
  offlineWriteDatabaseName: "pwa-offline-write:storefront:production:r3",
};

/** Caches of the drill: this app's revisions are deleted, everything else is kept (recovery-drill.md). */
const CACHES = [
  "pwa:storefront:production:r3:precache",
  "pwa:storefront:production:r2:precache",
  "pwa:storefront:staging:r3:precache",
  "pwa:storefront-eu:production:r3:precache",
  "pwa:other:production:r3:precache",
  "images-v1",
];

type Listener = (event: ExtendableEvent) => void;

/**
 * Controls what the fake `pushManager.getSubscription()` / subscription `.unsubscribe()` do:
 * - "none": resolves to `null` (no subscription); `unsubscribe` is never reached.
 * - "present": resolves to a subscription whose `unsubscribe` resolves normally.
 * - "getSubscription-rejects": `getSubscription` rejects; `unsubscribe` is never reached.
 * - "unsubscribe-rejects": resolves to a subscription whose `unsubscribe` rejects.
 */
type SubscriptionMode = "none" | "present" | "getSubscription-rejects" | "unsubscribe-rejects";
type DatabaseOutcome = "success" | "blocked" | "error";

let databaseOutcome: DatabaseOutcome;
let deletedDatabases: string[];

type Harness = {
  readonly scope: ServiceWorkerGlobalScope;
  readonly listeners: Map<string, Listener[]>;
  /** Cache deletions, the push-subscription steps and the claim call, in the order they happened. */
  readonly calls: string[];
  readonly names: Set<string>;
  readonly open: ReturnType<typeof vi.fn>;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
};

function createHarness(options?: { readonly subscriptionMode?: SubscriptionMode; readonly withPushManager?: boolean }): Harness {
  const subscriptionMode = options?.subscriptionMode ?? "none";
  const withPushManager = options?.withPushManager ?? true;
  const listeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  const names = new Set(CACHES);
  const open = vi.fn();
  const unsubscribe = vi.fn(async () => {
    calls.push("unsubscribe");
    if (subscriptionMode === "unsubscribe-rejects") throw new Error("unsubscribe failed");
  });
  const getSubscription = vi.fn(async () => {
    calls.push("getSubscription");
    if (subscriptionMode === "getSubscription-rejects") throw new Error("getSubscription failed");
    if (subscriptionMode === "present" || subscriptionMode === "unsubscribe-rejects") return { unsubscribe };
    return null;
  });
  const registration = withPushManager ? { pushManager: { getSubscription } } : {};
  const scope = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting: vi.fn(async () => {
      calls.push("skipWaiting");
    }),
    clients: {
      claim: vi.fn(async () => {
        calls.push("claim");
      }),
    },
    caches: {
      keys: vi.fn(async () => [...names]),
      delete: vi.fn(async (name: string) => {
        calls.push(`delete ${name}`);
        return names.delete(name);
      }),
      open,
    },
    registration,
  };
  return { scope: scope as unknown as ServiceWorkerGlobalScope, listeners, calls, names, open, unsubscribe };
}

/** Dispatches an event and returns what the listener passed to `waitUntil`, asserting it was called synchronously. */
async function dispatch(harness: Harness, type: string): Promise<void> {
  const listener = (harness.listeners.get(type) ?? [])[0];
  if (listener === undefined) throw new Error(`No ${type} listener`);
  const waitUntil = vi.fn();
  listener({ type, waitUntil } as unknown as ExtendableEvent);
  expect(waitUntil, type).toHaveBeenCalledTimes(1);
  await (waitUntil.mock.calls[0]?.[0] as Promise<unknown>);
}

let harness: Harness;

beforeEach(() => {
  databaseOutcome = "success";
  deletedDatabases = [];
  expirationRecordsMock.mockReset();
  expirationRecordsMock.mockResolvedValue(undefined);
  vi.stubGlobal("indexedDB", {
    deleteDatabase: vi.fn((name: string) => {
      deletedDatabases.push(name);
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (databaseOutcome === "success") request.onsuccess?.(new Event("success"));
        if (databaseOutcome === "blocked") request.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);
        if (databaseOutcome === "error") request.onerror?.(new Event("error"));
      });
      return request;
    }),
  });
  harness = createHarness();
});

afterEach(() => vi.unstubAllGlobals());

describe("registerRecoveryWorker", () => {
  it("validates the config before registering anything", () => {
    for (const invalid of [
      { ...config, appCachePrefix: "pwa:" },
      { ...config, kind: "platform" },
      { ...config, version: 2 },
      null,
    ]) {
      expect(() => registerRecoveryWorker({ scope: harness.scope, config: invalid as PwaRecoveryWorkerConfig })).toThrow(
        /Invalid sw-runtime worker config/,
      );
    }
    expect(harness.listeners.size).toBe(0);
  });

  it("registers only install and activate, never fetch or message", () => {
    registerRecoveryWorker({ scope: harness.scope, config });
    expect([...harness.listeners.keys()]).toEqual(["install", "activate"]);
    for (const [, registered] of harness.listeners) expect(registered).toHaveLength(1);
  });
});

describe("install", () => {
  it("skips waiting inside waitUntil, so the broken worker stops controlling pages", async () => {
    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "install");
    expect(harness.calls).toEqual(["skipWaiting"]);
  });
});

describe("activate", () => {
  it("deletes exactly this app's caches and never opens one", async () => {
    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect([...harness.names]).toEqual([
      "pwa:storefront:staging:r3:precache",
      "pwa:storefront-eu:production:r3:precache",
      "pwa:other:production:r3:precache",
      "images-v1",
    ]);
    expect(harness.open).not.toHaveBeenCalled();
    expect(deletedDatabases).toEqual(["pwa-offline-write:storefront:production:r3"]);
  });

  it("also deletes workbox-expiration records under appCachePrefix, and only those, after deleting caches and before the offline-write database", async () => {
    const order: string[] = [];
    harness.scope.caches.delete = vi.fn(async (name: string) => {
      order.push(`delete ${name}`);
      return harness.names.delete(name);
    }) as never;
    expirationRecordsMock.mockImplementation(async () => {
      order.push("expiration-records");
    });
    // beforeEach already stubbed a fake `indexedDB`; wrap its deleteDatabase in place to record ordering.
    const originalDeleteDatabase = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = ((name: string) => {
      order.push(`delete-database ${name}`);
      return originalDeleteDatabase(name);
    }) as typeof indexedDB.deleteDatabase;

    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect(expirationRecordsMock).toHaveBeenCalledTimes(1);
    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches("pwa:storefront:production:r3:precache")).toBe(true);
    expect(matches("pwa:storefront:staging:r3:precache")).toBe(false);
    expect(matches("pwa:other:production:r3:precache")).toBe(false);
    expect(order).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "expiration-records",
      "delete-database pwa-offline-write:storefront:production:r3",
    ]);
  });

  it("swallows a workbox-expiration record-deletion failure and still deletes the offline-write database and claims", async () => {
    expirationRecordsMock.mockRejectedValueOnce(new Error("workbox-expiration record deletion failed"));

    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect(deletedDatabases).toEqual(["pwa-offline-write:storefront:production:r3"]);
    expect(harness.calls).toContain("claim");
  });

  it("also deletes this app's runtime-cache caches (T8): they carry the same appCachePrefix, so no recovery-worker code change is needed", async () => {
    const identity = { appId: "storefront", environment: "production", cacheNamespaceSeed: "r3" };
    const runtimePages = cacheName(identity, "runtime-pages");
    const runtimeData = runtimeDataCacheName(identity, "0123456789abcdef");
    harness.names.add(runtimePages);
    harness.names.add(runtimeData);

    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect([...harness.names]).toEqual([
      "pwa:storefront:staging:r3:precache",
      "pwa:storefront-eu:production:r3:precache",
      "pwa:other:production:r3:precache",
      "images-v1",
    ]);
    expect(harness.calls).toContain(`delete ${runtimePages}`);
    expect(harness.calls).toContain(`delete ${runtimeData}`);
  });

  it("claims the clients only after every deletion finished, and after the push step (ADR-0021)", async () => {
    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect(harness.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "getSubscription",
      "claim",
    ]);
  });

  it("deletes nothing when the app has no cache yet", async () => {
    harness.names.clear();
    harness.names.add("images-v1");
    registerRecoveryWorker({ scope: harness.scope, config });
    await dispatch(harness, "activate");

    expect(harness.calls).toEqual(["getSubscription", "claim"]);
    expect([...harness.names]).toEqual(["images-v1"]);
  });

  it("cancels the push subscription after deleting caches and before claiming clients", async () => {
    const withSubscription = createHarness({ subscriptionMode: "present" });
    registerRecoveryWorker({ scope: withSubscription.scope, config });
    await dispatch(withSubscription, "activate");

    expect(withSubscription.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "getSubscription",
      "unsubscribe",
      "claim",
    ]);
    expect(withSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not unsubscribe when there is no subscription, and still claims clients", async () => {
    const noSubscription = createHarness({ subscriptionMode: "none" });
    registerRecoveryWorker({ scope: noSubscription.scope, config });
    await dispatch(noSubscription, "activate");

    expect(noSubscription.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "getSubscription",
      "claim",
    ]);
    expect(noSubscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("still claims clients, without throwing, when getSubscription rejects", async () => {
    const rejecting = createHarness({ subscriptionMode: "getSubscription-rejects" });
    registerRecoveryWorker({ scope: rejecting.scope, config });
    await dispatch(rejecting, "activate");

    expect(rejecting.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "getSubscription",
      "claim",
    ]);
    expect(rejecting.unsubscribe).not.toHaveBeenCalled();
  });

  it("still claims clients, without throwing, when unsubscribe rejects", async () => {
    const rejecting = createHarness({ subscriptionMode: "unsubscribe-rejects" });
    registerRecoveryWorker({ scope: rejecting.scope, config });
    await dispatch(rejecting, "activate");

    expect(rejecting.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "getSubscription",
      "unsubscribe",
      "claim",
    ]);
  });

  it("skips the push step and still claims clients when the registration has no pushManager", async () => {
    const withoutPushManager = createHarness({ withPushManager: false });
    registerRecoveryWorker({ scope: withoutPushManager.scope, config });
    await dispatch(withoutPushManager, "activate");

    expect(withoutPushManager.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
      "claim",
    ]);
  });

  it("does not cancel push or claim clients when the precise queue database cannot be deleted", async () => {
    databaseOutcome = "blocked";
    registerRecoveryWorker({ scope: harness.scope, config });
    await expect(dispatch(harness, "activate")).rejects.toThrow(/offline-write database deletion blocked/);
    expect(deletedDatabases).toEqual(["pwa-offline-write:storefront:production:r3"]);
    expect(harness.calls).toEqual([
      "delete pwa:storefront:production:r3:precache",
      "delete pwa:storefront:production:r2:precache",
    ]);
  });

  it("never calls console, on any push-subscription outcome", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const subscriptionMode of ["none", "present", "getSubscription-rejects", "unsubscribe-rejects"] as const) {
        const modeHarness = createHarness({ subscriptionMode });
        registerRecoveryWorker({ scope: modeHarness.scope, config });
        await dispatch(modeHarness, "activate");
      }
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe("the bundled entry script", () => {
  it("registers the recovery worker from the injected config", async () => {
    const entry = createHarness();
    vi.stubGlobal("self", Object.assign(entry.scope, { __PWA_WORKER_CONFIG: config }));
    try {
      await import("../../src/entries/recovery-worker-entry.js");
    } finally {
      vi.unstubAllGlobals();
    }
    expect([...entry.listeners.keys()]).toEqual(["install", "activate"]);
  });
});
