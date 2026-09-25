import { cacheName, type PwaIdentity, type PwaPlan, type PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan, type PwaCompileHostOutput } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { assertSelfContained, bundleWorkers, RECOVERY_WORKER_FILE } from "../src/workers.js";

// These run two real Vite sub-builds, so they are the slowest tests in the package. They earn it: everything that
// can go wrong here — a bare import surviving the bundle, an injection point rewritten by the bundler, Workbox
// leaking into the recovery worker — is invisible to a unit test and fatal at registration time.

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

const hostBuildOutput: PwaCompileHostOutput = {
  publicPath: "/app/",
  serviceWorkerFile: "sw.js",
  manifestFile: "manifest.webmanifest",
  files: [
    { path: "assets/index-BGTT0tj4.js", fingerprinted: true, contentHash: "ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWY" },
    { path: "index.html", fingerprinted: false, contentHash: "aW5kZXhodG1sYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnc" },
  ],
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

function plan(): PwaPlan {
  const result = compilePlan({ identity, install: null, policy, topology: { kind: "standalone-origin" }, hostBuildOutput });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  return result.value;
}

// v2 baseline and its two v3 (runtime cache) counterparts, for T10's "the injected worker config and the rest of the
// build are otherwise unaffected" checks below. `v3Disabled` differs from `v2` only in schemaVersion and the two
// added-but-inert v3 fields (offlineWrites, runtimeCache: disabled) — the same resources, so a real v2 app that
// upgrades its schema without turning the runtime cache on should see no other change.
const v2Policy: PwaPolicy = {
  schemaVersion: 2,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
};

const v3PolicyDisabled: PwaPolicy = {
  ...v2Policy,
  schemaVersion: 3,
  runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
};

const v3PolicyEnabled: PwaPolicy = {
  ...v2Policy,
  schemaVersion: 3,
  resources: [...v2Policy.resources, { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "stale-while-revalidate" }],
  runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 65_536, maxAgeSeconds: 300 },
};

function planFor(fixturePolicy: PwaPolicy): PwaPlan {
  const result = compilePlan({ identity, install: null, policy: fixturePolicy, topology: { kind: "standalone-origin" }, hostBuildOutput });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  return result.value;
}

describe("bundleWorkers with a v3 (runtime cache) policy (T10)", () => {
  it("injects runtimeCache.enabled: true with the executable rule and the expected cache names", async () => {
    const workers = await bundleWorkers(planFor(v3PolicyEnabled));

    expect(workers.platform).toContain('"runtimeCache":{"enabled":true');
    expect(workers.platform).toContain('"pathPrefix":"/app/api/catalog"');
    expect(workers.platform).toContain('"resourceClass":"public-data"');
    expect(workers.platform).toContain('"strategy":"stale-while-revalidate"');
    // The pages/data cache names contracts derives from the identity, the same ones a runtime-cache read or an
    // activation cleanup would look them up by.
    expect(workers.platform).toContain(cacheName(identity, "runtime-pages"));
    expect(workers.platform).toContain(`${cacheName(identity, "runtime-data")}-`);
  });

  it("injects runtimeCache.enabled: false for a v3 policy with the cache turned off, with no rules", async () => {
    const workers = await bundleWorkers(planFor(v3PolicyDisabled));

    expect(workers.platform).toContain('"runtimeCache":{"enabled":false');
    expect(workers.platform).not.toContain('"rules":[{"pathPrefix"');
  });

  it("leaves the precache and path rules identical to the equivalent v2 build", async () => {
    const v2Plan = planFor(v2Policy);
    const v3Plan = planFor(v3PolicyDisabled);

    expect(v3Plan.precache).toEqual(v2Plan.precache);
    expect(v3Plan.pathRules.map(({ pathPrefix, action }) => ({ pathPrefix, action }))).toEqual(
      v2Plan.pathRules.map(({ pathPrefix, action }) => ({ pathPrefix, action })),
    );
    expect(v3Plan.cacheNamespace).toEqual(v2Plan.cacheNamespace);
  });
});

const occurrences = (source: string, needle: string): number => source.split(needle).length - 1;

describe("bundleWorkers", () => {
  it("replaces both injection points in the platform worker", async () => {
    const workers = await bundleWorkers(plan());

    // Nothing may be left for the browser to trip over: an unreplaced point is the literal string
    // `self.__WB_MANIFEST`, which reads as an undefined property at install time.
    expect(occurrences(workers.platform, "__WB_MANIFEST")).toBe(0);
    expect(occurrences(workers.platform, "__PWA_WORKER_CONFIG")).toBe(0);
  });

  it("injects the precache manifest the plan lists", async () => {
    const workers = await bundleWorkers(plan());
    const entry = plan().precache[0];

    expect(entry).toBeDefined();
    expect(workers.platform).toContain(entry?.url ?? "");
  });

  it("injects the worker config with the cache name contracts derives", async () => {
    const workers = await bundleWorkers(plan());
    // The worker reads its precache cache name from the injected config; a wrong one would read and write a cache
    // no other part of the platform uses, and the precache would silently never hit.
    expect(workers.platform).toContain(plan().cacheNamespace.prefix);
  });

  it("gives the recovery worker its config and nothing else", async () => {
    const workers = await bundleWorkers(plan());

    expect(occurrences(workers.recovery, "__PWA_WORKER_CONFIG")).toBe(0);
    // The recovery worker must not carry a precache manifest: it exists to delete caches, not to fill them.
    expect(workers.recovery).not.toContain("__WB_MANIFEST");
  });

  it("keeps Workbox out of the recovery worker", async () => {
    const workers = await bundleWorkers(plan());

    // Every Workbox module registers a `workbox:<module>:<version>` marker on `self` when it loads, so the marker is
    // the signature of bundled Workbox code. The word alone is not: since ADR-0035 the recovery worker names the
    // `workbox-expiration` IndexedDB database whose records it deletes, without importing anything from Workbox.
    const workboxModule = /workbox:[a-z-]+:\d/;
    expect(workers.platform).toMatch(workboxModule);
    // A recovery worker that pulled in Workbox would be the thing it is meant to rescue the user from.
    expect(workers.recovery).not.toMatch(workboxModule);
    expect(workers.recovery).toContain('"workbox-expiration"');
  });

  it("produces workers a classic worker script can run", async () => {
    const workers = await bundleWorkers(plan());

    // The guard itself is called, not a copy of its patterns: a test that re-implemented them would stay green
    // after the real check stopped throwing.
    expect(() => assertSelfContained(workers.platform, "platform worker")).not.toThrow();
    expect(() => assertSelfContained(workers.recovery, "recovery worker")).not.toThrow();
  });

  it("builds the recovery worker far smaller than the platform one", async () => {
    const workers = await bundleWorkers(plan());

    // Not a size budget — a shape check. The recovery worker has no engine and no Workbox, so an order of
    // magnitude separates them. If they ever converge, something was linked into the recovery path.
    expect(workers.recovery.length * 5).toBeLessThan(workers.platform.length);
  });
});

describe("assertSelfContained", () => {
  it("rejects each thing a classic worker cannot execute", () => {
    // Every one of these appears in an unbundled sw-runtime entry, and each fails at registration with nothing
    // but "the worker did not install" to go on. They are far cheaper to catch here.
    const samples: readonly (readonly [string, string])[] = [
      ["import { x } from 'y';\n", "a module import or export"],
      ["export const x = 1;\n", "a module import or export"],
      ["const load = () => import('./other.js');\n", "a dynamic import"],
      ["const fs = require('node:fs');\n", "a require call"],
      ["if (process.env.NODE_ENV) {}\n", "a process.env reference"],
    ];
    for (const [source, label] of samples) {
      expect(() => assertSelfContained(source, "probe"), source).toThrow(new RegExp(label));
    }
  });

  it("accepts a bundled classic worker", () => {
    expect(() => assertSelfContained("self.addEventListener('install', () => {});\n", "probe")).not.toThrow();
  });

  it("names the worker it rejected, so the message says which build failed", () => {
    expect(() => assertSelfContained("import x from 'y';\n", "recovery worker")).toThrow(/recovery worker/);
  });
});

describe("RECOVERY_WORKER_FILE", () => {
  it("is not the address the identity registers", () => {
    // Writing the recovery worker to serviceWorkerUrl would mean every ordinary release ships the worker that
    // deletes caches and serves nothing. The release process renames this file onto that address deliberately,
    // during a drill or an incident (recovery-drill.md, step 2).
    expect(`/app/${RECOVERY_WORKER_FILE}`).not.toBe(identity.serviceWorkerUrl);
    expect(RECOVERY_WORKER_FILE).toBe("pwa-recovery-worker.js");
  });
});
