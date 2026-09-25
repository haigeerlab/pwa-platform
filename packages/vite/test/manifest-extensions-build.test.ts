// The manifest extension fields (contracts-foundation's "修订：安装元数据的扩展字段", generation side in
// spec/vite-adapter.md's matching revision), inside a real Vite build. manifest.test.ts already covers the pure
// mapping; what only a build can show is that a screenshot's Chrome-preference warning actually reaches the build
// log through `this.warn` (index.ts's existing `built.warnings` loop — unchanged by this revision), and that a
// missing screenshot or shortcut icon file really fails the build via `assertPwaArtifacts`
// (build-verifier's `verify.manifest-asset-missing`, wired into writeBundle before this revision existed).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build, createLogger } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const identity: PwaIdentity = {
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

const baseInstall: PwaInstallMetadata = {
  startUrl: "/app/home",
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

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

/** A minimal app root; `publicFiles` land in the public directory Vite copies verbatim. */
function app(publicFiles: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-vite-manifest-ext-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");

  const files = { "sw.js": "self.addEventListener('install', () => {});\n", ...publicFiles };
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, "public", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Runs a real build, capturing `logger.warn` messages the way shared-origin.test.ts does. */
async function runBuild(root: string, install: PwaInstallMetadata): Promise<{ readonly warnings: readonly string[] }> {
  const warnings: string[] = [];
  const logger = createLogger("warn", { allowClearScreen: false });
  logger.warn = (message) => {
    warnings.push(message);
  };
  logger.warnOnce = logger.warn;
  await build({
    configFile: false,
    root,
    base: "/app/",
    customLogger: logger,
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [pwa({ identity, policy, install, topology: { kind: "standalone-origin" } })],
  });
  return { warnings };
}

describe("the manifest extension fields inside a real build", () => {
  it("writes screenshots and shortcuts whose files exist in the public directory into the emitted manifest", async () => {
    const install: PwaInstallMetadata = {
      ...baseInstall,
      screenshots: [
        { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
      ],
      shortcuts: [
        {
          name: "Cart",
          url: "/app/cart",
          icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
        },
      ],
    };
    const root = app({ "screenshots/wide.png": "x", "icons/cart.png": "x" });
    await runBuild(root, install);
    const manifest = JSON.parse(readFileSync(join(root, "dist/manifest.webmanifest"), "utf8")) as {
      screenshots?: unknown;
      shortcuts?: unknown;
    };
    expect(manifest.screenshots).toEqual([
      { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide" },
    ]);
    expect(manifest.shortcuts).toEqual([
      { name: "Cart", url: "/app/cart", icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }] },
    ]);
  });

  it("reports a screenshot's Chrome-preference warning through the build log, code and path only", async () => {
    const install: PwaInstallMetadata = {
      ...baseInstall,
      screenshots: [
        // A "wide" screenshot in range keeps install.screenshot-no-wide from also firing, isolating the assertion
        // to the size warning this test is actually about.
        { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
        // Below the 320px floor on both dimensions: install.screenshot-size-out-of-range (a warning, not an error —
        // the build must still succeed).
        { src: "/app/screenshots/tiny.png", sizes: "100x100", type: "image/png", formFactor: "wide" },
      ],
    };
    const root = app({ "screenshots/wide.png": "x", "screenshots/tiny.png": "x" });
    const { warnings } = await runBuild(root, install);
    const joined = warnings.join("\n");
    expect(joined).toContain("install.screenshot-size-out-of-range");
    expect(joined).toContain("/install/screenshots/1/sizes");
    // Diagnostics never echo values (existing convention, e.g. shared-origin.test.ts) — the path is reported, never
    // the file name or the declared size string.
    expect(joined).not.toContain("tiny.png");
    expect(joined).not.toContain("100x100");
  });

  it("fails the build when a declared screenshot file is missing from the published output", async () => {
    const install: PwaInstallMetadata = {
      ...baseInstall,
      screenshots: [{ src: "/app/screenshots/missing.png", sizes: "1280x800", type: "image/png", formFactor: "wide" }],
    };
    const root = app();
    await expect(runBuild(root, install)).rejects.toThrow(/verify\.manifest-asset-missing/);
  });

  it("fails the build when a declared shortcut icon file is missing from the published output", async () => {
    const install: PwaInstallMetadata = {
      ...baseInstall,
      shortcuts: [
        {
          name: "Cart",
          url: "/app/cart",
          icons: [{ src: "/app/icons/missing-cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
        },
      ],
    };
    const root = app();
    await expect(runBuild(root, install)).rejects.toThrow(/verify\.manifest-asset-missing/);
  });
});
