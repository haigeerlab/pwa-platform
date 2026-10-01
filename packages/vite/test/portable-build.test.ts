import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaInstallMetadata, PwaPolicyV3, PwaPortableIdentity } from "@pwa-platform/contracts";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";
import { writeInstallIconFixture } from "./install-icon-fixture.js";

const identity: PwaPortableIdentity = {
  appId: "portable-app", manifestId: "/app/", scope: "/app/", serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest", mountPath: "/app/", environment: "production", cacheNamespaceSeed: "r1",
};
const install: PwaInstallMetadata = {
  startUrl: "/app/", display: "standalone", name: "Portable App", shortName: "Portable",
  themeColor: "#000000", backgroundColor: "#ffffff", icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
const policy: PwaPolicyV3 = {
  schemaVersion: 3, install: { enabled: true }, offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt", resources: [
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
};

let roots: string[] = [];
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots = []; });

function app(link = ""): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-portable-build-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "src/main.js"), "document.body.dataset.ready = 'true';\n");
  writeFileSync(join(root, "index.html"), `<!doctype html><html><head>${link}</head><body><script type="module" src="/src/main.js"></script></body></html>`);
  writeFileSync(join(root, "public/offline.html"), "<!doctype html><title>Offline</title><h1>Offline</h1>");
  writeInstallIconFixture(root);
  return root;
}

async function run(root: string, base = "/app/", selectedPolicy = policy): Promise<void> {
  await build({
    configFile: false, root, base, logLevel: "silent",
    build: { outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [pwa({ deployment: { kind: "portable" }, identity, install, policy: selectedPolicy, topology: { kind: "standalone-origin" } })],
  });
}

function files(root: string, directory = join(root, "dist")): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(root, join(directory, entry.name)) : [join(directory, entry.name).slice(join(root, "dist").length + 1)]);
}

describe("portable Vite output", () => {
  it("builds a domain-free manifest, workers, offline page and HTML link", async () => {
    const root = app();
    await run(root);
    const output = files(root);
    expect(output).toContain("sw.js");
    expect(output).toContain("pwa-recovery-worker.js");
    expect(output).toContain("offline.html");
    expect(readFileSync(join(root, "dist/index.html"), "utf8")).toContain('href="/app/manifest.webmanifest"');
    for (const name of output.filter((name) => /\.(?:html|js|webmanifest)$/.test(name))) {
      expect(readFileSync(join(root, "dist", name), "utf8")).not.toMatch(/https:\/\/(?:shop|portable)\.example/);
    }
  });

  it("injects enabled v3 runtime caching into the portable worker", async () => {
    const root = app();
    await run(root, "/app/", {
      ...policy,
      resources: [...policy.resources, { pathPrefix: "/api/public", resourceClass: "public-data", cache: "network-first" }],
      runtimeCache: { enabled: true, maxEntries: 10, maxEntryBytes: 1024, maxAgeSeconds: 60 },
    });
    const worker = readFileSync(join(root, "dist/sw.js"), "utf8");
    expect(worker).toMatch(/"runtimeCache":\{"enabled":true/);
  });

  it("rejects a full URL manifest link and a cross-origin Vite base", async () => {
    const linked = app('<link rel="manifest" href="https://a.example.test/app/manifest.webmanifest">');
    await expect(run(linked)).rejects.toThrow(/manifest link that does not match/);
    const based = app();
    await expect(run(based, "https://cdn.example.test/app/")).rejects.toThrow(/same-origin base/);
  });

  it("requires the explicit mode when origin is absent", () => {
    expect(() => pwa({ identity, policy, install, topology: { kind: "standalone-origin" } } as never)).toThrow(/origin/);
  });

  it("rejects a domain-bearing manifest id before the build", () => {
    expect(() => pwa({ deployment: { kind: "portable" }, identity: {
      ...identity, manifestId: "https://a.example.test/app/",
    }, policy, install, topology: { kind: "standalone-origin" } } as never)).toThrow(/manifestId/);
  });
});
