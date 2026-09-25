// Which fingerprinted assets does the live site still serve? (module spec, "采集输入": "对当前计划与历史计划中的
// 全部带指纹资源逐个请求，HTTP 200 且内容与记录的哈希一致才算可用".) This is deliberately broader than what
// `verifyReleaseRetention` (build-verifier) requires for any one candidate — it is the raw availability fact for
// every fingerprinted path across the candidate and every retrieved history plan; `assembleReleaseInput` (M4)
// decides which subset the retention window actually needs.
import type { PwaPlan } from "@pwa-platform/contracts";
import { fetchFollowingRedirects, DEFAULT_REQUEST_TIMEOUT_MS } from "./fetch-utils.ts";

/** Fingerprinted precache entries (`revision === null`) — the only resources this check ever asks about. */
export function fingerprintedPaths(plan: PwaPlan): readonly string[] {
  return plan.precache.filter((entry) => entry.revision === null).map((entry) => entry.url);
}

/**
 * Looks a path up in the first of `sources` that has a hash for it. `sources` should be ordered by trust: the
 * candidate's own `build.json` files first, then each history deployment's bundle files, newest first — so a stale
 * bundle can never override the hash the candidate itself just published for the same URL.
 */
export function knownHashLookup(sources: readonly Readonly<Record<string, string>>[]): (path: string) => string | undefined {
  return (path: string) => {
    const key = path.startsWith("/") ? path.slice(1) : path;
    for (const files of sources) {
      if (Object.hasOwn(files, key)) return files[key];
    }
    return undefined;
  };
}

export type PwaAvailabilityDetail = { readonly ok: boolean; readonly reason: string };

export type PwaAvailabilityResult = {
  readonly available: readonly string[];
  readonly details: Readonly<Record<string, PwaAvailabilityDetail>>;
};

export async function checkAvailability(
  origin: string,
  paths: readonly string[],
  knownHash: (path: string) => string | undefined,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PwaAvailabilityResult> {
  const available: string[] = [];
  const details: Record<string, PwaAvailabilityDetail> = {};

  for (const path of [...new Set(paths)]) {
    const expected = knownHash(path);
    if (expected === undefined) {
      details[path] = { ok: false, reason: "no known hash for this path in the candidate or any retrieved bundle" };
      continue;
    }
    const outcome = await fetchFollowingRedirects(`${origin}${path}`, timeoutMs);
    if (!outcome.ok) {
      details[path] = { ok: false, reason: outcome.reason };
      continue;
    }
    if (outcome.value.bodySha256 === expected) {
      available.push(path);
      details[path] = { ok: true, reason: "HTTP 200, body matches the known hash" };
    } else {
      details[path] = { ok: false, reason: "HTTP 200, body does not match the known hash" };
    }
  }

  return { available, details };
}
