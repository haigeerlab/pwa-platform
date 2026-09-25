// Script bundled by vite-adapter as the recovery worker: reads the injected recovery config.
import { registerRecoveryWorker } from "../recovery-worker/index.js";
import type { PwaRecoveryWorkerConfig } from "../shared/config.js";

/** `self.__PWA_WORKER_CONFIG` is replaced by `injectWorkerConfig` after bundling. */
declare const self: ServiceWorkerGlobalScope & { readonly __PWA_WORKER_CONFIG: PwaRecoveryWorkerConfig };

registerRecoveryWorker({ scope: self, config: self.__PWA_WORKER_CONFIG });
