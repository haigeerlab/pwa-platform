// Test-only recovery worker for the deletion-failure drill (review #15, risk R14): bundled by global-setup.ts the same
// way the real recovery worker is, and runs the real `registerRecoveryWorker`. The only difference is one injected
// failure, chosen per built site by replacing `self.__PWA_RECOVERY_FAULT` after bundling (like `__PWA_WORKER_CONFIG`).
// Standard browser APIs cannot make `caches.delete` or `indexedDB.deleteDatabase` fail on demand, so the fault is
// patched onto this worker's own globals before the recovery worker registers. Never shipped: it lives under
// browser-tests/ and is only written into the git-ignored browser-build/.
import { registerRecoveryWorker } from "../src/recovery-worker/index.js";
import type { PwaRecoveryWorkerConfig } from "../src/shared/config.js";

declare const self: ServiceWorkerGlobalScope & {
  readonly __PWA_WORKER_CONFIG: PwaRecoveryWorkerConfig;
  /** Replaced after bundling with "cache" (the first `caches.delete` rejects) or "database" (deleteDatabase errors). */
  readonly __PWA_RECOVERY_FAULT: string;
};

const RECOVERY_FAULT = self.__PWA_RECOVERY_FAULT;

if (RECOVERY_FAULT === "cache") {
  const realDelete = self.caches.delete.bind(self.caches);
  let failed = false;
  self.caches.delete = (cacheName: string): Promise<boolean> => {
    if (failed) return realDelete(cacheName);
    failed = true;
    return Promise.reject(new DOMException(`injected failure deleting ${cacheName}`, "UnknownError"));
  };
} else if (RECOVERY_FAULT === "database") {
  self.indexedDB.deleteDatabase = (): IDBOpenDBRequest => {
    const request = new EventTarget() as IDBOpenDBRequest & { error: DOMException };
    Object.defineProperty(request, "error", { value: new DOMException("injected database deletion failure", "UnknownError") });
    setTimeout(() => request.onerror?.call(request, new Event("error")), 0);
    return request;
  };
} else {
  throw new Error(`recovery-fault-entry: unknown fault ${RECOVERY_FAULT}`);
}

registerRecoveryWorker({ scope: self, config: self.__PWA_WORKER_CONFIG });
