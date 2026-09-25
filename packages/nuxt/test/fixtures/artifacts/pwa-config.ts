// Identity, policy and install metadata for the real-Nuxt artifact-pipeline fixture (test/artifacts.test.ts).
// Not a deliverable — mirrors packages/ssr-spike-nuxt/spike-config.ts's proven shape (T1 record).
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";

export const IDENTITY: PwaIdentity = {
  appId: "nuxtartifacts",
  manifestId: "/app/",
  origin: "http://localhost:3000",
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
  name: "Nuxt artifacts fixture",
  shortName: "Artifacts",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** The default policy most scenarios use as-is; a few override `resources` or `offlineFallback` wholesale. */
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
    { pathPrefix: "/_nuxt/builds", resourceClass: "public-data", cache: "network-first" },
    { pathPrefix: "/account", resourceClass: "session-data", cache: "none" },
  ],
};
