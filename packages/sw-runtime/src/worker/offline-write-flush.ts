import type { PwaOfflineWriteStore } from "./offline-write-store.js";

export type PwaOfflineWriteFlushResult = { readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number };

/** Explicit FIFO replay; it is never called by fetch, Sync, Push or worker activation. */
export async function flushOfflineWrites(
  store: PwaOfflineWriteStore,
  binding: string,
  origin: string,
  send: typeof fetch,
): Promise<PwaOfflineWriteFlushResult> {
  const prepared = await store.prepareFlush(binding);
  let sent = 0;
  let retained = 0;
  let failed = 0;
  for (const write of prepared.writes) {
    try {
      const response = await send(new URL(write.path, origin), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": write.idempotencyKey },
        body: write.bodyJson,
      });
      if (response.ok) {
        await store.remove(write.idempotencyKey);
        sent += 1;
      } else if (response.status >= 500) retained += 1;
      else {
        await store.markFailed(
          write.idempotencyKey,
          response.status === 401 || response.status === 403 ? "authorization-required" : "rejected",
        );
        failed += 1;
      }
    } catch {
      retained += 1;
    }
  }
  return { sent, retained, failed, purged: prepared.purged };
}
