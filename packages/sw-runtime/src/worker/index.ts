// Platform worker (service worker scope): registers install, activate, fetch and message listeners.
// It imports only @pwa-platform/engine-workbox/worker.
import { createPrecacheEngine, createRuntimeCacheEngine, type PwaPrecacheManifestEntry } from "@pwa-platform/engine-workbox/worker";
import { validatePlatformWorkerConfig, type PwaPlatformWorkerConfig } from "../shared/config.js";
import { attachPlatformWorker } from "./handlers.js";

export type PwaPlatformWorkerOptions = {
  readonly scope: ServiceWorkerGlobalScope;
  /** The injected config; validated before the engine is created or any listener is registered. */
  readonly config: PwaPlatformWorkerConfig;
  /** The injected precache manifest (`self.__WB_MANIFEST`). */
  readonly manifest: readonly PwaPrecacheManifestEntry[];
};

/**
 * Registers the platform worker: it precaches the plan's entries through the engine port, serves exact precache
 * hits, answers navigations network first with the plan's offline fallbacks, and leaves every other request to the
 * network. It skips waiting only when a page confirms an update.
 */
export function registerPlatformWorker({ scope, config, manifest }: PwaPlatformWorkerOptions): void {
  const validated = validatePlatformWorkerConfig(config);
  const engine = createPrecacheEngine({ cacheName: validated.precacheCacheName, entries: manifest });
  attachPlatformWorker({ scope, config: validated, engine, createRuntimeCacheEngine });
}

export type { PwaPassthroughReason, PwaRequestDecision, PwaRequestInput } from "./decide.js";
