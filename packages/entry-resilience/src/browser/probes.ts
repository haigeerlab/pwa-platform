// Browser adapter for the "探测" (probing) rules in spec/pwa-entry-resilience.md. `fetchImpl` is
// injected so it can be replaced with a fake in unit tests.
import type { EntryProbes } from "../decide.js";

export type CreateProbesOptions = {
  readonly mountPath: string;
  readonly fetchImpl?: typeof fetch;
};

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Builds the `EntryProbes` port. The primary probe hits an uncached, non-precached path under the
 * mount so a network failure cannot be masked by the platform worker's cache; any settled response
 * (including a 404) counts as reachable. The alternate probe is a `no-cors` cross-origin request:
 * the response is opaque and never read, so a settled promise is the only signal available.
 */
export function createProbes({ mountPath, fetchImpl = fetch }: CreateProbesOptions): EntryProbes {
  return {
    async probePrimary(): Promise<boolean> {
      const url = `${mountPath}__pwa-entry-probe?${Math.random()}`;
      return settlesInTime((signal) => fetchImpl(url, { cache: "no-store", credentials: "omit", signal }));
    },
    async probeAlternate(origin: string, startPath: string): Promise<boolean> {
      return settlesInTime((signal) =>
        fetchImpl(`${origin}${startPath}`, { mode: "no-cors", credentials: "omit", cache: "no-store", signal }),
      );
    },
  };
}

/**
 * Whether `request` settles within the probe timeout. The timeout is an `AbortController` plus a timer rather than
 * `AbortSignal.timeout`, which browsers below the supported floor (Safari 13.1 / Chrome 80 / Firefox 74) lack — it
 * arrived in Chrome 103, Firefox 100 and Safari 16; without it every probe would report the origin unreachable.
 */
async function settlesInTime(request: (signal: AbortSignal) => Promise<Response>): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await request(controller.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
