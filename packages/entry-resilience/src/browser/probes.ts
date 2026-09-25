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
      try {
        await fetchImpl(url, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return true;
      } catch {
        return false;
      }
    },
    async probeAlternate(origin: string, startPath: string): Promise<boolean> {
      try {
        await fetchImpl(`${origin}${startPath}`, {
          mode: "no-cors",
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
