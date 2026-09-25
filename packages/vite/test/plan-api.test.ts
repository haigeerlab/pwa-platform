import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { PWA_PLUGIN_NAME, pwa, type PwaPluginApi } from "../src/index.js";

// The api exists so a sibling plugin (pwaEntryResilience, built on top of this one) can confirm its own artifacts
// landed in the same plan this plugin compiled, without recompiling or re-reading the bundle itself. What matters
// here is not what the plan contains — that is covered elsewhere — but when it becomes readable, that the exposed
// copy cannot be mutated, and that a failed rebuild never leaks a stale plan from an earlier one.

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

/** A minimal app; `publicFiles` land in the public directory Vite copies verbatim. */
function app(publicFiles: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-plan-api-"));
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

/**
 * Finds the platform plugin the way a sibling plugin would: by `PWA_PLUGIN_NAME`, off the resolved config, rather
 * than by holding on to the object `pwa()` returned. `sink` carries the result out, since `configResolved` runs
 * before the test can see anything.
 */
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

describe("the plan api", () => {
  it("is unreadable during another plugin's generateBundle and readable by writeBundle, matching this build", async () => {
    const sink: { api: PwaPluginApi | undefined } = { api: undefined };
    let generateBundleRan = false;
    let planDuringGenerate: PwaPlan | null = null;
    let planAtWrite: PwaPlan | null = null;
    let bundleNames: string[] = [];
    const root = app();

    await build({
      configFile: false,
      root,
      base: "/app/",
      logLevel: "silent",
      build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
      plugins: [
        apiLookupPlugin(sink),
        pwa({ identity, policy, install, topology: { kind: "standalone-origin" } }),
        {
          name: "observer",
          apply: "build",
          // Default (non-"post") enforce, so this plugin's generateBundle runs before the platform plugin's own —
          // the point being made is that the plan is not ready yet at that moment.
          generateBundle() {
            generateBundleRan = true;
            planDuringGenerate = sink.api?.getPlan() ?? null;
          },
          writeBundle(_options, bundle) {
            planAtWrite = sink.api?.getPlan() ?? null;
            bundleNames = Object.keys(bundle);
          },
        },
      ],
    });

    expect(generateBundleRan).toBe(true);
    expect(planDuringGenerate).toBeNull();
    expect(planAtWrite).not.toBeNull();
    // `planAtWrite` is only ever reassigned from inside the `writeBundle` closure above, which TypeScript's control
    // flow analysis does not trace into — so its statically known type here is still the declaration's initial
    // `null`, even though the runtime check just above proves otherwise. `unknown` sidesteps that.
    const plan = planAtWrite as unknown as PwaPlan;
    expect(plan.identity).toEqual(identity);

    // At least one chunk this build fingerprinted has to be in the plan's precache, under the same URL writeBundle
    // just saw it published at — proof the plan reflects this build, not a fixture recorded ahead of time.
    const fingerprinted = bundleNames.filter((name) => /-[\w-]{8}(?:\.[a-z0-9]+)+$/i.test(name));
    expect(fingerprinted.length).toBeGreaterThan(0);
    for (const name of fingerprinted) {
      expect(plan.precache.some((entry) => entry.url === `/app/${name}`)).toBe(true);
    }
  });

  it("freezes the top level and everything nested, and rejects every mutation attempt", async () => {
    const sink: { api: PwaPluginApi | undefined } = { api: undefined };
    const root = app();

    await build({
      configFile: false,
      root,
      base: "/app/",
      logLevel: "silent",
      build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
      plugins: [apiLookupPlugin(sink), pwa({ identity, policy, install, topology: { kind: "standalone-origin" } })],
    });

    const plan = sink.api?.getPlan();
    expect(plan).not.toBeNull();
    if (plan === null || plan === undefined) throw new Error("expected a compiled plan");

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.identity)).toBe(true);
    expect(Object.isFrozen(plan.precache)).toBe(true);
    const firstEntry = plan.precache[0];
    expect(firstEntry).toBeDefined();
    expect(Object.isFrozen(firstEntry)).toBe(true);

    // Every attempt below has to throw: this is ESM, which is always strict mode, so assigning to a frozen
    // object's property throws a TypeError rather than failing silently.
    expect(() => {
      (plan as { identity: unknown }).identity = { tampered: true };
    }).toThrow();
    expect(() => {
      (plan.identity as { appId: string }).appId = "tampered";
    }).toThrow();
    expect(() => {
      (plan.precache as unknown as { push: (value: unknown) => number }).push({ url: "/app/tampered", revision: null });
    }).toThrow();
    expect(() => {
      (firstEntry as { url: string }).url = "/app/tampered";
    }).toThrow();

    // None of the attempts above could have changed anything — they all threw before writing — so the plan reads
    // back identical, and the build this all happened in still produced its usual artifacts (implicit: the `build`
    // call above already resolved, which it would not have if the plugin's own writeBundle check had failed).
    expect(sink.api?.getPlan()).toEqual(plan);
  });

  it("does not leak a previous build's plan once this build's own compilation fails", async () => {
    // Same plugin instance across two builds. The first succeeds and leaves a plan; the second is missing the
    // file its policy requires for the offline fallback, so compilation fails before a new plan exists. Without
    // the buildStart reset, getPlan() would still return the first build's plan here — that is exactly the bug
    // this test exists to catch.
    const offlinePolicy: PwaPolicy = {
      schemaVersion: 1,
      install: { enabled: true },
      offlineFallback: { enabled: true, path: "/offline.html" },
      updateMode: "prompt",
      resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
    };
    const plugin = pwa({ identity, policy: offlinePolicy, install, topology: { kind: "standalone-origin" } });

    const firstRoot = app({ "offline.html": "<!doctype html><p>offline</p>\n" });
    await build({
      configFile: false,
      root: firstRoot,
      base: "/app/",
      logLevel: "silent",
      build: { write: true, outDir: join(firstRoot, "dist"), emptyOutDir: true },
      plugins: [plugin],
    });
    expect(plugin.api?.getPlan()).not.toBeNull();

    const secondRoot = app(); // no offline.html this time: the same policy now names a file that was never built.
    await expect(
      build({
        configFile: false,
        root: secondRoot,
        base: "/app/",
        logLevel: "silent",
        build: { write: true, outDir: join(secondRoot, "dist"), emptyOutDir: true },
        plugins: [plugin],
      }),
    ).rejects.toThrow(/compile\.offline-fallback-not-built/);

    expect(plugin.api?.getPlan()).toBeNull();
  });
});
