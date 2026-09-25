import {
  createPrecacheEngine,
  type PwaPrecacheActivateResult,
  type PwaPrecacheInstallResult,
  type PwaPrecacheManifestEntry,
} from "../../src/worker/index.js";

// Stand-in for the platform worker (sw-runtime) that drives the precache port; bundled by global-setup.ts.

/** Replaced when the bundle is built: the precache cache name of the fixture plan. */
declare const __PWA_PRECACHE_CACHE_NAME__: string;
/** `self.__WB_MANIFEST` is replaced by `injectPrecacheManifest` after bundling. */
declare const self: ServiceWorkerGlobalScope & { readonly __WB_MANIFEST: readonly PwaPrecacheManifestEntry[] };

type Outcome<Result> = Result | { readonly error: string } | null;

const engine = createPrecacheEngine({ cacheName: __PWA_PRECACHE_CACHE_NAME__, entries: self.__WB_MANIFEST });

// Kept in memory for the page probes, which read them within seconds of the events.
let installOutcome: Outcome<PwaPrecacheInstallResult> = null;
let activateOutcome: Outcome<PwaPrecacheActivateResult> = null;

const describe = (error: unknown): { readonly error: string } => ({ error: error instanceof Error ? error.message : String(error) });

self.addEventListener("install", (event) => {
  // The engine passes the work to event.waitUntil itself, so a failed download fails the install.
  engine.install(event).then(
    (result) => (installOutcome = result),
    (error: unknown) => (installOutcome = describe(error)),
  );
});

self.addEventListener("activate", (event) => {
  engine.activate(event).then(
    (result) => (activateOutcome = result),
    (error: unknown) => (activateOutcome = describe(error)),
  );
});

/**
 * Page probes, each with a reply port:
 * - `{ type: "match", url }` answers with what `engine.match` returned, or with `{ error }` if it rejected;
 * - `{ type: "state" }` answers with the manifest URLs and the recorded install and activate outcomes;
 * - `{ type: "skipWaiting" }` skips waiting only on request, like an accepted update prompt.
 */
self.addEventListener("message", (event) => {
  const port = event.ports[0];
  const data: unknown = event.data;
  if (port === undefined || typeof data !== "object" || data === null) return;
  const { type, url } = data as { readonly type?: unknown; readonly url?: unknown };
  if (type === "match" && typeof url === "string") {
    event.waitUntil(
      engine.match(url).then(
        async (response) => {
          port.postMessage(response === undefined ? { found: false } : { found: true, status: response.status, body: await response.text() });
        },
        (error: unknown) => port.postMessage(describe(error)),
      ),
    );
  } else if (type === "state") {
    port.postMessage({ urls: engine.urls(), install: installOutcome, activate: activateOutcome });
  } else if (type === "skipWaiting") {
    event.waitUntil(self.skipWaiting().then(() => port.postMessage({})));
  }
});
