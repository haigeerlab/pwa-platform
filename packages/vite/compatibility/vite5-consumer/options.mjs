export const identity = {
  appId: "vite-compat",
  manifestId: "/app/",
  origin: "https://example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const policy = {
  schemaVersion: 1,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
  ],
};
