import { validateWorkerConfig, type PwaWorkerConfig } from "../shared/config.js";

/** Injection point for the worker config; the bundled worker source must contain it exactly once. */
export const WORKER_CONFIG_INJECTION_POINT = "self.__PWA_WORKER_CONFIG";

/**
 * Replaces the injection point in the bundled `workerSource` with `config` serialized as JSON. Call it after bundling,
 * like the precache manifest injection (ADR-0011).
 *
 * The config is validated first and serialized from the validated copy, so the output does not depend on the key
 * order of the given object. Throws when the config is invalid or the injection point does not occur exactly once.
 * Pure and deterministic: no file access, bundling or minification.
 */
export function injectWorkerConfig(workerSource: string, config: PwaWorkerConfig): string {
  if (typeof workerSource !== "string") throw new TypeError("The worker source must be a string");

  const serialized = JSON.stringify(validateWorkerConfig(config));

  const occurrences = countOccurrences(workerSource, WORKER_CONFIG_INJECTION_POINT);
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${WORKER_CONFIG_INJECTION_POINT} injection point in the worker source, found ${occurrences}`);
  }

  const index = workerSource.indexOf(WORKER_CONFIG_INJECTION_POINT);
  return `${workerSource.slice(0, index)}${serialized}${workerSource.slice(index + WORKER_CONFIG_INJECTION_POINT.length)}`;
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  for (let index = text.indexOf(search); index !== -1; index = text.indexOf(search, index + search.length)) count += 1;
  return count;
}
