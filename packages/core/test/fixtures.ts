import type { PwaCompileInput } from "../src/index.js";

export const input: PwaCompileInput = {
  identity: {
    appId: "shop",
    manifestId: "/app/",
    origin: "https://shop.example.com",
    scope: "/app/",
    serviceWorkerUrl: "/app/sw.js",
    manifestUrl: "/app/manifest.webmanifest",
    mountPath: "/app",
    environment: "production",
    cacheNamespaceSeed: "r1",
  },
  install: {
    startUrl: "/app/",
    display: "standalone",
    name: "Shop",
    shortName: "Shop",
    themeColor: "#0f172a",
    backgroundColor: "#ffffff",
    icons: [
      { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/icons/maskable.png", sizes: "192x192 512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  policy: {
    schemaVersion: 1,
    install: { enabled: true },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [],
  },
  topology: { kind: "standalone-origin" },
  hostBuildOutput: {
    publicPath: "/app/",
    serviceWorkerFile: "sw.js",
    manifestFile: "manifest.webmanifest",
    files: [
      { path: "index.html", fingerprinted: false, contentHash: "a1b2c3d4e5f6" },
      { path: "assets/main.3f9a2c.js", fingerprinted: true, contentHash: "3f9a2c7d1e8b" },
    ],
  },
};
