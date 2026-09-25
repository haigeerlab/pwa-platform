// The identity, install metadata and policy both examples share.
//
// They are deliberately identical. The two examples are one application written twice, so any behavioural
// difference the end-to-end suite observes has to come from the framework binding rather than from the
// configuration — otherwise a failure on one side would tell us nothing about which side is wrong.
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";

/** The mount path the examples are served under; the fixture server serves a version directory as the site root. */
export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";
export const MANIFEST_URL = "/app/manifest.webmanifest";
export const OFFLINE_URL = "/app/offline.html";
/** Where vite-adapter writes the recovery worker; the release process renames it onto WORKER_URL (ADR-0015). */
export const RECOVERY_WORKER_URL = "/app/pwa-recovery-worker.js";

export const IDENTITY: PwaIdentity = {
  appId: "pwaexample",
  manifestId: SHELL_URL,
  origin: "https://example.pwa-platform.invalid",
  scope: SHELL_URL,
  serviceWorkerUrl: WORKER_URL,
  manifestUrl: MANIFEST_URL,
  mountPath: SHELL_URL,
  environment: "production",
  cacheNamespaceSeed: "r1",
};

/**
 * Install metadata. The matching static PNGs are generated from the adjacent SVG sources. The browser test reads
 * their headers from the built site, so this declaration cannot silently claim a size the files do not provide.
 */
export const INSTALL: PwaInstallMetadata = {
  startUrl: SHELL_URL,
  display: "standalone",
  name: "PWA Platform Example",
  shortName: "Example",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  description: "A minimal reference app demonstrating PWA platform install, offline and update behaviour.",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  // The example has a single route, so this one shortcut only demonstrates the shape of the field; it reuses the
  // existing 192 icon rather than shipping a dedicated shortcut icon.
  shortcuts: [
    {
      name: "Open example app",
      shortName: "Example",
      url: "/app/",
      icons: [{ src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" }],
    },
  ],
  screenshots: [
    { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide", label: "The example app on a desktop-sized window" },
    { src: "/app/screenshots/narrow.png", sizes: "750x1334", type: "image/png", formFactor: "narrow", label: "The example app on a phone-sized window" },
  ],
};

/**
 * The app shell, its assets and the offline page are precached; everything else is a public navigation.
 *
 * **Paths here are mount-relative**, unlike the URL constants above: `compilePlan` resolves them against
 * `mountPath`, so `/offline.html` becomes `/app/offline.html`. Writing the absolute URL instead produces
 * `/app/app/offline.html` and the build fails with `compile.offline-fallback-not-built`.
 */
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  // Forgives a stalled network request after 5s in favour of the offline fallback or a runtime cache hit instead of
  // waiting indefinitely (ADR-0038, docs/guides/network-timeout.md).
  networkTimeoutSeconds: 5,
  resources: [
    // A navigation rule alone does not precache the documents; the shell and the fallback need asset rules too.
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    // Entry-recovery page (spec/pwa-entry-resilience.md's "构建集成"): required by `pwaEntryResilience()` alongside
    // `pwa()`, or the build fails. The page's own fingerprinted script falls under the `/assets` rule above.
    { pathPrefix: "/pwa-entry.html", resourceClass: "asset", cache: "cache-first" },
  ],
};
