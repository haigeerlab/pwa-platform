import { fileURLToPath } from "node:url";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** The fixture application the plugin builds; nothing here is a hand-placed artifact. */
export const APP_ROOT: string = here("./app/");
export const APP_SHELL_CSS: string = here("./app/src/shell.css");

/**
 * Git-ignored output of global-setup.ts.
 *
 * The fixture server serves a version directory as the site root, while the app is mounted at `/app/` — the scope
 * the identity declares. So each version's build output goes one level down, into `<version>/app/`, and a request
 * for `/app/sw.js` finds the worker the plugin wrote. Building straight into the version root would leave every
 * `/app/...` reference in the generated HTML pointing at nothing.
 */
export const BUILD_ROOT: string = here("../browser-build/");
export const SITE_V1_ROOT: string = here("../browser-build/site-v1/");
export const SITE_V2_ROOT: string = here("../browser-build/site-v2/");
/** Where each version's build output lands: the site root plus the mount path. */
export const SITE_V1_OUT: string = here("../browser-build/site-v1/app/");
export const SITE_V2_OUT: string = here("../browser-build/site-v2/app/");

/**
 * Paths the identity declares. They are what the plugin is told to produce, so the browser tests assert against
 * these rather than against whatever the build happened to emit.
 */
export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";
export const MANIFEST_URL = "/app/manifest.webmanifest";
export const OFFLINE_URL = "/app/offline.html";
export const RECOVERY_WORKER_URL = "/app/pwa-recovery-worker.js";

export const IDENTITY: PwaIdentity = {
  appId: "vitefixture",
  manifestId: SHELL_URL,
  origin: "https://vite-fixture.example.com",
  scope: SHELL_URL,
  serviceWorkerUrl: WORKER_URL,
  manifestUrl: MANIFEST_URL,
  mountPath: SHELL_URL,
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: SHELL_URL,
  display: "standalone",
  name: "Vite Fixture",
  shortName: "Fixture",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/**
 * The app shell, its assets and the offline page are precached; everything else is a public navigation.
 *
 * Paths here are **mount-relative**, unlike the URL constants above: `compilePlan` resolves them against
 * `mountPath`, so `/offline.html` becomes `/app/offline.html`. Writing the absolute URL instead produces
 * `/app/app/offline.html` and the build fails with `compile.offline-fallback-not-built` — which is how this
 * fixture was written the first time.
 */
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    // A navigation rule alone does not precache the documents; the shell and the fallback need asset rules of
    // their own, the same way sw-runtime's fixture declares them.
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};

/** Two deployed versions of the same app, both produced by the plugin. */
export const FIXTURE_SITE: FixtureServerOptions = {
  versions: { v1: SITE_V1_ROOT, v2: SITE_V2_ROOT },
  initialVersion: "v1",
};

// The default offline page (spec/vite-adapter.md "修订：平台默认离线页", task OP4). Separate site trees built with
// `offlinePage` set, leaving the v1/v2 builds above untouched. The fallback lives at its own path because the app's
// public/offline.html already occupies /offline.html, and the plugin refuses to overwrite it
// (vite.offline-page-conflict).
export const DEFAULT_OFFLINE_URL = "/app/offline-default.html";
export const POLICY_WITH_DEFAULT_OFFLINE: PwaPolicy = {
  ...POLICY,
  offlineFallback: { enabled: true, path: "/offline-default.html" },
  resources: [...POLICY.resources, { pathPrefix: "/offline-default.html", resourceClass: "asset", cache: "cache-first" }],
};
export const SITE_OFFLINE_ZH_ROOT: string = here("../browser-build/site-offline-zh/");
export const SITE_OFFLINE_ZH_OUT: string = here("../browser-build/site-offline-zh/app/");
export const SITE_OFFLINE_EN_ROOT: string = here("../browser-build/site-offline-en/");
export const SITE_OFFLINE_EN_OUT: string = here("../browser-build/site-offline-en/app/");
/** The `messages` override the en build uses, so a spec can check it replaced exactly one key. */
export const EN_HEADING_OVERRIDE = "No connection right now";
export const OFFLINE_PAGE_SITE_ZH: FixtureServerOptions = { versions: { v1: SITE_OFFLINE_ZH_ROOT } };
export const OFFLINE_PAGE_SITE_EN: FixtureServerOptions = { versions: { v1: SITE_OFFLINE_EN_ROOT } };

// Manifest extension members (spec/contracts-foundation.md "修订：安装元数据的扩展字段", task MX5). A separate site
// tree built from a copy of the public directory that also holds the referenced screenshot and shortcut icon, so the
// v1/v2 builds above keep their exact output. The image bytes are copies of an existing icon: Chrome parses the
// manifest without fetching them, and the build only checks that the files are published.
export const MANIFEST_EXT_PUBLIC: string = here("../browser-build/public-manifest-ext/");
export const SITE_MANIFEST_EXT_ROOT: string = here("../browser-build/site-manifest-ext/");
export const SITE_MANIFEST_EXT_OUT: string = here("../browser-build/site-manifest-ext/app/");
export const INSTALL_WITH_EXTENSIONS: PwaInstallMetadata = {
  ...INSTALL,
  description: "A fixture app with every manifest extension member",
  categories: ["productivity"],
  orientation: "portrait",
  displayOverride: ["window-controls-overlay", "standalone"],
  screenshots: [{ src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide", label: "Home" }],
  shortcuts: [
    {
      name: "New order",
      shortName: "New",
      url: "/app/orders/new",
      icons: [{ src: "/app/icons/new.png", sizes: "192x192", type: "image/png", purpose: "any" }],
    },
  ],
};
export const MANIFEST_EXT_SITE: FixtureServerOptions = { versions: { v1: SITE_MANIFEST_EXT_ROOT } };
