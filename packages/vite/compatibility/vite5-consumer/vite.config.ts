import { defineConfig } from "vite";
import { pwa } from "@pwa-platform/vite";

export default defineConfig({
  plugins: [pwa({
    identity: {
      appId: "vite-compat",
      manifestId: "/app/",
      origin: "https://example.com",
      scope: "/app/",
      serviceWorkerUrl: "/app/sw.js",
      manifestUrl: "/app/manifest.webmanifest",
      mountPath: "/app/",
      environment: "production",
      cacheNamespaceSeed: "r1",
    },
    policy: {
      schemaVersion: 1,
      install: { enabled: false },
      offlineFallback: { enabled: false },
      updateMode: "prompt",
      resources: [
        { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
        { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
      ],
    },
    install: null,
    topology: { kind: "standalone-origin" },
  })],
});
