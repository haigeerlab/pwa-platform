// Script bundled by vite-adapter as the platform worker: reads the injected config and precache manifest.
import type { PwaPrecacheManifestEntry } from "@pwa-platform/engine-workbox/worker";
import type { PwaPlatformWorkerConfig } from "../shared/config.js";
import { registerPlatformWorker } from "../worker/index.js";

/** Both injection points are replaced after bundling: the manifest by engine-workbox, the config by sw-runtime. */
declare const self: ServiceWorkerGlobalScope & {
  readonly __PWA_WORKER_CONFIG: PwaPlatformWorkerConfig;
  readonly __WB_MANIFEST: readonly PwaPrecacheManifestEntry[];
};

registerPlatformWorker({ scope: self, config: self.__PWA_WORKER_CONFIG, manifest: self.__WB_MANIFEST });
