import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, sep } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { buildPwaArtifacts, type PwaArtifactSourceFile } from "../src/artifacts.js";
import { PWA_PLUGIN_NAME, pwa, type PwaPluginApi } from "../src/index.js";
import { RECOVERY_WORKER_FILE } from "../src/workers.js";

// pwa() and buildPwaArtifacts are meant to be one pipeline wearing two entrances. This suite is the proof: run a
// real Vite build with pwa(), then run buildPwaArtifacts again on nothing but the files that build actually wrote
// to disk — the same thing an SSR framework's own final-file hook would have to work from — and check the two
// agree down to the plan and the worker bytes.

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

/** A minimal app with a couple of files in `public/`, so the fixture exercises both file sources pwa() merges. */
function app(): { root: string; publicPaths: readonly string[] } {
  const root = mkdtempSync(join(tmpdir(), "pwa-artifacts-parity-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");

  const publicFiles = { "robots.txt": "User-agent: *\n", "icons/192.png": "png-bytes" };
  for (const [path, content] of Object.entries(publicFiles)) {
    const full = join(root, "public", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return { root, publicPaths: Object.keys(publicFiles) };
}

/** Finds the platform plugin by name off the resolved config, the way a sibling plugin would. */
function apiLookupPlugin(sink: { api: PwaPluginApi | undefined }): Plugin {
  return {
    name: "api-lookup",
    apply: "build",
    configResolved(config) {
      const found = config.plugins.find((candidate) => candidate.name === PWA_PLUGIN_NAME);
      sink.api = found?.api as PwaPluginApi | undefined;
    },
  };
}

/** Reads every file under `dir`, recursively, the way an SSR framework's final-file hook would see its own output. */
function readBuiltFiles(dir: string): PwaArtifactSourceFile[] {
  const files: PwaArtifactSourceFile[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const relative = prefix === "" ? entry.name : posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        walk(full, relative);
      } else if (entry.isFile()) {
        files.push({ path: relative.split(sep).join(posix.sep), content: readFileSync(full) });
      }
    }
  };
  walk(dir, "");
  return files;
}

describe("buildPwaArtifacts parity with pwa()", () => {
  it("compiles the same plan and produces byte-identical worker and manifest content as a real build", async () => {
    const { root, publicPaths } = app();
    const distDir = join(root, "dist");
    const sink: { api: PwaPluginApi | undefined } = { api: undefined };

    await build({
      configFile: false,
      root,
      base: "/app/",
      logLevel: "silent",
      build: { write: true, outDir: distDir, emptyOutDir: true },
      plugins: [apiLookupPlugin(sink), pwa({ identity, policy, install, topology: { kind: "standalone-origin" } })],
    });

    const realPlan = sink.api?.getPlan();
    expect(realPlan).not.toBeNull();
    if (realPlan === null || realPlan === undefined) throw new Error("expected a compiled plan");

    // Files the fixture put in `public/` are marked unfingerprinted, exactly what pwa() does for them; every other
    // file is left for buildPwaArtifacts to classify with the same rule pwa() applies to bundle output. Nothing
    // here knows which plugin hook produced which byte — only what ended up on disk, same as an SSR framework's
    // own final-file hook would see.
    const publicPathSet = new Set(publicPaths);
    const files = readBuiltFiles(distDir).map((file) =>
      publicPathSet.has(file.path) ? { ...file, fingerprinted: false } : file,
    );

    const parity = await buildPwaArtifacts({
      identity,
      policy,
      install,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files,
    });

    expect(parity.plan).toEqual(realPlan);

    expect(parity.files.map((file) => file.path)).toEqual(["manifest.webmanifest", "sw.js", RECOVERY_WORKER_FILE]);
    for (const outputFile of parity.files) {
      const onDisk = readFileSync(join(distDir, outputFile.path), "utf8");
      expect(outputFile.content, outputFile.path).toBe(onDisk);
    }
  });
});
