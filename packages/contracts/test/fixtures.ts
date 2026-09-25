import type {
  PwaIdentity,
  PwaInstallMetadata,
  PwaLifecycleEvent,
  PwaPlan,
  PwaPolicy,
  PwaWarningDiagnostic,
} from "../src/index.js";

export const identity: PwaIdentity = {
  appId: "shop",
  manifestId: "/app/",
  origin: "https://shop.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const install: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Shop",
  shortName: "Shop",
  themeColor: "#0f172a",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api/account", resourceClass: "session-data", cache: "none" },
  ],
  extensions: { "acme.analytics": { sampled: true } },
};

export const warning: PwaWarningDiagnostic = {
  code: "install.invalid-color",
  severity: "warning",
  path: "/themeColor",
  message: "Theme color is not a recognised CSS color.",
};

export const plan: PwaPlan = {
  schemaVersion: 1,
  planVersion: 1,
  policyVersion: 1,
  identity,
  install,
  hostBuildOutput: { publicPath: "/app/" },
  topology: { kind: "standalone-origin" },
  artifacts: { serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest" },
  precache: [
    { url: "/app/index.html", revision: "a1b2c3" },
    { url: "/app/assets/main.3f9a.js", revision: null },
  ],
  cacheNamespace: { prefix: "pwa:shop:production:r1:" },
  requestBaselineDenials: [
    "non-get",
    "cross-origin",
    "no-store",
    "opaque-response",
    "redirect",
    "websocket",
    "unclassified",
  ],
  pathRules: [
    { pathPrefix: "/app/api/account", resourceClass: "session-data", action: "deny", source: "platform" },
    { pathPrefix: "/app/assets", resourceClass: "asset", action: "cache-first", source: "policy" },
  ],
  offlineFallback: { enabled: true, path: "/app/offline" },
  updateMode: "prompt",
  diagnostics: [warning],
};

export const event: PwaLifecycleEvent = {
  version: 1,
  type: "cache-cleaned",
  timestamp: "2026-09-15T08:00:00.000Z",
  appId: "shop",
  metadata: { removedCaches: 2 },
};
