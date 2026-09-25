// Identity, install metadata and policy for the T7 browser-test fixture (not a deliverable). Resource paths are
// mount-relative, same convention as test/fixtures/artifacts/pwa-config.ts and the ssr-spike-nuxt spike before it.
//
// `/_nuxt` is `asset` (precached), matching every other real-Nuxt fixture in this package: scenario 2
// (offline.spec.ts) needs a prerendered page's own client chunk to actually be available for a genuine full-page
// offline load to hydrate without Nuxt's hydration-failure error page taking over the rendered content (measured:
// without this, an offline `/about` visit that never fetched about.vue's own chunk before goes offline shows
// Nuxt's own "500" error page, not the prerendered markup). reload.spec.ts (scenario 9) still gets a genuine
// chunk-load 404 for /lazy's own chunk without fighting this: it discovers that one chunk's real (build-hashed)
// URL from the browser's own resource timing after a single successful visit, deletes just that one entry from the
// live precache (sw-runtime's fromPrecache handler falls back to the network on a cache miss — see its own
// comment), and only then deploys a new build that genuinely does not have that file. See reload.spec.ts.
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";

export const IDENTITY: PwaIdentity = {
  appId: "nuxte2e",
  manifestId: "/app/",
  origin: "https://nuxte2e.pwa-platform.invalid",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Nuxt T7 fixture",
  shortName: "NuxtT7",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline/index.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/_payload.json", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/about/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/about/_payload.json", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/_nuxt", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/news", resourceClass: "navigation-public-dynamic", cache: "network-first" },
    { pathPrefix: "/lazy", resourceClass: "navigation-public-dynamic", cache: "network-first" },
    { pathPrefix: "/account", resourceClass: "session-data", cache: "none" },
  ],
};
