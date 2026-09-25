import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";

// The artifact check is the last thing the plugin does, and it only means anything against a real build: it reads
// what the build actually produced rather than an inventory the plugin wrote down for itself.

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

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

function app(): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-verify-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  return root;
}

/**
 * Runs a build with the plugin, optionally alongside a plugin that tampers with the output.
 *
 * The saboteur is listed *before* the platform plugin on purpose. Within one `enforce` level, `writeBundle` runs
 * in plugin-array order — measured — so a saboteur listed afterwards would delete files the check had already
 * looked at, and every "should fail" case below would pass while proving nothing.
 */
async function runBuild(root: string, saboteur?: Plugin): Promise<void> {
  await build({
    configFile: false,
    root,
    base: "/app/",
    logLevel: "silent",
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [...(saboteur ? [saboteur] : []), pwa({ identity, policy, install, topology: { kind: "standalone-origin" } })],
  });
}

/** Deletes files from the bundle after the platform plugin has emitted and inspected everything. */
function removes(names: readonly string[]): Plugin {
  return {
    name: "saboteur",
    apply: "build",
    enforce: "post",
    writeBundle(_options, bundle) {
      for (const name of names) delete (bundle as Record<string, unknown>)[name];
    },
  };
}

describe("the artifact check", () => {
  it("passes when the build contains everything the plan requires", async () => {
    await expect(runBuild(app())).resolves.toBeUndefined();
  });

  it("fails when a precache entry is gone from the output", async () => {
    // The plan is compiled from this same build, so an entry can only be missing if something removed it after
    // compilation — exactly the drift this check exists to catch.
    const root = app();
    const removed = removes(["assets"]);
    const dropAsset: Plugin = {
      ...removed,
      writeBundle(_options, bundle) {
        for (const name of Object.keys(bundle)) {
          if (name.startsWith("assets/") && name.endsWith(".js")) delete (bundle as Record<string, unknown>)[name];
        }
      },
    };
    await expect(runBuild(root, dropAsset)).rejects.toThrow(/verify\.artifact-missing at \/precache\/\d+\/url/);
  });

  it("fails when the worker is not published at the identity's path", async () => {
    await expect(runBuild(app(), removes(["sw.js"]))).rejects.toThrow(
      /verify\.artifact-path-mismatch at \/identity\/serviceWorkerUrl/,
    );
  });

  it("fails when the manifest is not published at the identity's path", async () => {
    await expect(runBuild(app(), removes(["manifest.webmanifest"]))).rejects.toThrow(
      /verify\.artifact-path-mismatch at \/identity\/manifestUrl/,
    );
  });

  it("reports every missing artifact, not only the first", async () => {
    await expect(runBuild(app(), removes(["sw.js", "manifest.webmanifest"]))).rejects.toThrow(
      /serviceWorkerUrl.*manifestUrl/s,
    );
  });

  it("names contract paths, never the artifact path that was missing", async () => {
    // Build logs travel into issues. A diagnostic says which field of the plan is unsatisfied; the URL that was
    // looked for is not the platform's to publish.
    try {
      await runBuild(app(), removes(["sw.js"]));
      expect.unreachable("the build should have failed");
    } catch (error) {
      const { message } = error as Error;
      expect(message).toContain("/identity/serviceWorkerUrl");
      expect(message).not.toContain("/app/sw.js");
    }
  });
});
