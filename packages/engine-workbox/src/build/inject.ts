import { validatePlan, type PwaPlan } from "@pwa-platform/contracts";

/** Workbox's default injection point; the platform worker source must contain it exactly once. */
export const WORKBOX_INJECTION_POINT = "self.__WB_MANIFEST";

/**
 * Replaces the injection point in `workerSource` with `plan.precache` serialized as a Workbox manifest
 * (`[{"url": …, "revision": …}]`), in plan order and without adding, removing or rewriting entries. Call it on the
 * bundled worker: the injection point must survive bundling unchanged (ADR-0011).
 *
 * Throws when the plan is invalid (the message lists diagnostic codes and paths only), when the precache holds
 * entries the worker engine would reject at startup, or when the injection point does not occur exactly once.
 * Pure and deterministic: no file access, bundling or minification.
 */
export function injectPrecacheManifest(workerSource: string, plan: PwaPlan): string {
  if (typeof workerSource !== "string") throw new TypeError("The worker source must be a string");

  const result = validatePlan(plan);
  if (!result.ok) {
    const findings = result.diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`);
    throw new Error(`Cannot inject an invalid PwaPlan: ${findings.join(", ")}`);
  }

  // contracts accept an empty revision and repeated URLs, which createPrecacheEngine rejects; failing here keeps
  // such a plan from shipping a worker that cannot start.
  const seen = new Set<string>();
  const problems = result.value.precache.flatMap(({ url, revision }, index) => {
    const found: string[] = [];
    if (revision === "") found.push(`/precache/${index}/revision must be null or a non-empty string`);
    if (seen.has(url)) found.push(`/precache/${index}/url duplicates an earlier entry`);
    seen.add(url);
    return found;
  });
  if (problems.length > 0) {
    throw new Error(`Cannot inject a precache manifest the worker engine would reject: ${problems.join(", ")}`);
  }

  const occurrences = countOccurrences(workerSource, WORKBOX_INJECTION_POINT);
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${WORKBOX_INJECTION_POINT} injection point in the worker source, found ${occurrences}`);
  }

  const manifest = JSON.stringify(result.value.precache.map(({ url, revision }) => ({ url, revision })));
  const index = workerSource.indexOf(WORKBOX_INJECTION_POINT);
  return `${workerSource.slice(0, index)}${manifest}${workerSource.slice(index + WORKBOX_INJECTION_POINT.length)}`;
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  for (let index = text.indexOf(search); index !== -1; index = text.indexOf(search, index + search.length)) count += 1;
  return count;
}
