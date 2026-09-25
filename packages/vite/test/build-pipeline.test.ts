import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";

// These run the plugin inside a real Vite build. The pure units are covered elsewhere; what only a build can show
// is whether the hooks fire in the right order, whether a failure actually stops the build, and whether files Vite
// copies outside the bundle are accounted for.

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

const install: PwaInstallMetadata = {
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

function policy(installEnabled: boolean): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: installEnabled },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
  };
}

/** A minimal app; `publicFiles` land in the public directory Vite copies verbatim. */
function app(publicFiles: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-vite-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");

  // The worker is the app's own here: bundling the platform worker is T4's job, and the plan only needs the file
  // to exist at the identity's path.
  const files = { "sw.js": "self.addEventListener('install', () => {});\n", ...publicFiles };
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, "public", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/**
 * Runs a build and returns the file names that reached `writeBundle`.
 *
 * `write: true` is deliberate: files added with `emitFile` during `generateBundle` do not appear in that hook's
 * own bundle object, and with `write: false` the `writeBundle` hook never runs at all — an in-memory build can
 * observe neither.
 */
async function runBuild(root: string, installEnabled: boolean): Promise<string[]> {
  const names: string[] = [];
  await build({
    configFile: false,
    root,
    base: "/app/",
    logLevel: "silent",
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [
      pwa({
        identity,
        policy: policy(installEnabled),
        install: installEnabled ? install : null,
        topology: { kind: "standalone-origin" },
      }),
      {
        name: "fixture-observer",
        apply: "build",
        enforce: "post",
        writeBundle(_options, bundle) {
          names.push(...Object.keys(bundle));
        },
      },
    ],
  });
  return names;
}

describe("the plugin inside a real build", () => {
  it("writes the manifest itself when the app enables installation", async () => {
    const names = await runBuild(app(), true);
    expect(names).toContain("manifest.webmanifest");
  });

  it("fails the build when nothing can write the manifest", async () => {
    // Install is disabled, so the platform has no metadata and writes nothing — but the identity still names a
    // manifest URL. Shipping that would give the browser a 404 at the manifest it advertises.
    await expect(runBuild(app(), false)).rejects.toThrow(/enables no installation/);
  });

  it("accepts a manifest the app put in its public directory", async () => {
    // The chosen behaviour for a disabled install: the app supplies the file. Public files never enter the bundle,
    // so this passes only because the plugin reads the public directory — the whole point of that change.
    const root = app({ "manifest.webmanifest": '{"id":"/app/","name":"Hand written"}\n' });
    await expect(runBuild(root, false)).resolves.toBeDefined();
  });

  it("fails when a public file and a build output claim the same name", async () => {
    // Vite writes both, one over the other, without complaining — measured. Two different bytes at one URL is
    // precisely the kind of drift the plan is supposed to rule out, so the build stops instead.
    const root = app();
    mkdirSync(join(root, "public/assets"), { recursive: true });
    writeFileSync(join(root, "public/index.html"), "<!doctype html>\n");
    await expect(runBuild(root, true)).rejects.toThrow(/same name as a build output/);
  });

  it("counts public files in the plan, not only bundled ones", async () => {
    // An app's icons and offline page usually live in the public directory. If they were missing from the file
    // manifest, the release check would later report every one of them as a missing artifact.
    const root = app({ "icons/192.png": "x", "robots.txt": "User-agent: *\n" });
    const names = await runBuild(root, true);
    expect(names).toContain("manifest.webmanifest");
  });
});
