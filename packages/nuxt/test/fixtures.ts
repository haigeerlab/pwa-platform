// Shared identity, policy and install metadata for the unit tests below (not the real-Nuxt fixture app under
// test/fixtures/, which is unrelated despite the similar name).
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import type { PwaNuxtOptions } from "../src/options.js";

export const IDENTITY: PwaIdentity = {
  appId: "storefront",
  manifestId: "/app/",
  origin: "https://shop.example.com",
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
  name: "Storefront",
  shortName: "Shop",
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
  updateMode: "prompt",
  offlineFallback: { enabled: false },
  resources: [],
};

export function options(overrides: Partial<PwaNuxtOptions> = {}): PwaNuxtOptions {
  return { identity: IDENTITY, policy: POLICY, install: INSTALL, ...overrides };
}
