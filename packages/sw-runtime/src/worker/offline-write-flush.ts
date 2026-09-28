import type { PwaOfflineWriteStore } from "./offline-write-store.js";

export type PwaOfflineWriteFlushResult = { readonly sent: number; readonly retained: number; readonly failed: number; readonly purged: number };

/**
 * Explicit FIFO replay; it is never called by fetch, Sync, Push or worker activation.
 *
 * `onPrepared`, when given, runs synchronously right after `store.prepareFlush` resolves, before the send loop
 * starts — handlers.ts's single-flight bookkeeping uses it to tell a flush request that joins this round while the
 * read is still pending (still eligible to observe this round's snapshot) apart from one that arrives afterward,
 * during the send loop, which cannot: that one is coalesced into a trailing pass instead (spec "增补：flush 单飞的
 * trailing pass", N2).
 */
export async function flushOfflineWrites(
  store: PwaOfflineWriteStore,
  binding: string,
  origin: string,
  send: typeof fetch,
  onPrepared?: () => void,
): Promise<PwaOfflineWriteFlushResult> {
  const prepared = await store.prepareFlush(binding);
  onPrepared?.();
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
