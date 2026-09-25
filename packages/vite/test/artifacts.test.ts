import type { PwaIdentity, PwaInstallMetadata, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan, type PwaCompileHostOutput } from "@pwa-platform/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPwaArtifacts, buildPwaArtifacts } from "../src/artifacts.js";
import { RECOVERY_WORKER_FILE } from "../src/workers.js";

// buildPwaArtifacts is the pipeline entry an SSR framework calls with no Vite hooks to run inside (T1's Nuxt
// spike), and the one pwa() itself now calls from generateBundle. These tests exercise it directly, on a plain
// file list, so its behaviour is pinned independently of any Vite build. Parity with a real Vite build — proof
// this entry produces exactly what pwa() produces — is covered separately in artifacts-parity.test.ts.

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

function policy(installEnabled: boolean, resources: PwaPolicy["resources"] = [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }]): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: installEnabled },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources,
  };
}

describe("buildPwaArtifacts", () => {
  it("returns the manifest, the platform worker and the recovery worker, in that order", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(true),
      install,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [{ path: "assets/app.js", content: "console.log(1);" }],
    });

    expect(result.files.map((file) => file.path)).toEqual(["manifest.webmanifest", "sw.js", RECOVERY_WORKER_FILE]);
  });

  it("omits the manifest when install is disabled and the caller already publishes one", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(false),
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [{ path: "manifest.webmanifest", content: "{}" }],
    });

    expect(result.files.map((file) => file.path)).toEqual(["sw.js", RECOVERY_WORKER_FILE]);
  });

  it("fails when install is disabled and nothing in the input publishes the manifest", async () => {
    await expect(
      buildPwaArtifacts({
        identity,
        policy: policy(false),
        install: null,
        topology: { kind: "standalone-origin" },
        publicPath: "/app/",
        files: [],
      }),
    ).rejects.toThrow(/enables no installation/);
  });

  it("passes the compiler's warnings through, unmodified", async () => {
    const unmatched = policy(false, [{ pathPrefix: "/nomatch", resourceClass: "asset", cache: "cache-first" }]);
    const result = await buildPwaArtifacts({
      identity,
      policy: unmatched,
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [{ path: "manifest.webmanifest", content: "{}" }],
    });

    expect(result.warnings.map((warning) => warning.code)).toContain("compile.asset-rule-unmatched");
  });

  it("rejects a publicPath that is not a same-origin path with a trailing slash", async () => {
    for (const bad of ["https://cdn.example.com/app/", "app/", "/app"]) {
      await expect(
        buildPwaArtifacts({
          identity,
          policy: policy(false),
          install: null,
          topology: { kind: "standalone-origin" },
          publicPath: bad,
          files: [],
        }),
        bad,
      ).rejects.toThrow(/same-origin base/);
    }
  });

  it("throws when two files in the input publish the same path, rather than silently dropping one", async () => {
    await expect(
      buildPwaArtifacts({
        identity,
        policy: policy(false),
        install: null,
        topology: { kind: "standalone-origin" },
        publicPath: "/app/",
        files: [
          { path: "assets/duplicate.js", content: "a" },
          { path: "assets/duplicate.js", content: "b" },
        ],
      }),
    ).rejects.toThrow(/same path/);
  });

  it("auto-detects a fingerprinted name when `fingerprinted` is omitted, and respects an explicit false", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(false),
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [
        // Matches host-output.ts's FINGERPRINTED regex; left to the default rule.
        { path: "assets/app-BGTT0tj4.js", content: "auto" },
        // Same shape of name, but explicitly told it is not a content hash — as pwa() does for public files.
        { path: "assets/vendor-JYp-DHDg.js", content: "explicit", fingerprinted: false },
        { path: "manifest.webmanifest", content: "{}" },
      ],
    });

    const auto = result.plan.precache.find((entry) => entry.url === "/app/assets/app-BGTT0tj4.js");
    const explicit = result.plan.precache.find((entry) => entry.url === "/app/assets/vendor-JYp-DHDg.js");
    expect(auto?.revision).toBeNull();
    expect(explicit?.revision).not.toBeNull();
  });

  it("only precaches files the caller actually passed in", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(false),
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [
        { path: "assets/present.js", content: "x" },
        { path: "manifest.webmanifest", content: "{}" },
      ],
    });

    const urls = result.plan.precache.map((entry) => entry.url);
    expect(urls).toContain("/app/assets/present.js");
    expect(urls).not.toContain("/app/assets/absent.js");
  });
});

describe("assertPwaArtifacts", () => {
  it("does not throw when every path the plan requires was published", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(false),
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [
        { path: "assets/present.js", content: "x" },
        { path: "manifest.webmanifest", content: "{}" },
      ],
    });

    const published = [
      identity.serviceWorkerUrl,
      identity.manifestUrl,
      ...result.plan.precache.map((entry) => entry.url),
    ];
    expect(() => assertPwaArtifacts(result.plan, published)).not.toThrow();
  });

  it("throws naming the missing diagnostic code when a required path is absent", async () => {
    const result = await buildPwaArtifacts({
      identity,
      policy: policy(false),
      install: null,
      topology: { kind: "standalone-origin" },
      publicPath: "/app/",
      files: [
        { path: "assets/present.js", content: "x" },
        { path: "manifest.webmanifest", content: "{}" },
      ],
    });

    expect(() => assertPwaArtifacts(result.plan, [])).toThrow(/verify\.artifact-path-mismatch/);
  });
});

describe("worker self-containment guard, exercised through the real bundling pipeline", () => {
  // workers.ts's assertSelfContained is already exercised directly in workers.test.ts, against strings that were
  // never bundled. What that leaves unproven is the wiring: that bundleEntry actually calls it on every worker it
  // builds, not just that the function works when called by hand. A mutation removing that call would leave every
  // other test in this package green — sw-runtime's real entries are already self-contained, so the bundled output
  // does not change either way, and this package may not touch sw-runtime to make one that fails on purpose.
  //
  // Mocking Vite's own `build()` sidesteps that: it lets the guard see bundled output that still carries a
  // `process.env` reference, without a real broken entry anywhere. bundleEntry's own call to assertSelfContained is
  // the only thing standing between that output and a return value, so if the call were ever removed, this is the
  // test that would catch it.
  afterEach(() => {
    vi.doUnmock("vite");
    vi.resetModules();
  });

  function fixturePlan(): PwaPlan {
    const hostBuildOutput: PwaCompileHostOutput = {
      publicPath: "/app/",
      serviceWorkerFile: "sw.js",
      manifestFile: "manifest.webmanifest",
      files: [{ path: "manifest.webmanifest", fingerprinted: false, contentHash: "a".repeat(43) }],
    };
    const result = compilePlan({ identity, install: null, policy: policy(false), topology: { kind: "standalone-origin" }, hostBuildOutput });
    if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
    return result.value;
  }

  it("makes bundleWorkers fail when the bundle it built is not actually self-contained", async () => {
    // Both "vite" and workers.js are already loaded (this file's top-level import of buildPwaArtifacts pulls
    // workers.js in, which pulls in the real "vite"). Without clearing the module registry first, the dynamic
    // import below would just return those already-cached, unmocked modules.
    vi.resetModules();
    vi.doMock("vite", async () => {
      const actual = await vi.importActual<typeof import("vite")>("vite");
      return {
        ...actual,
        // A worker Vite "bundled" that still reads process.env: exactly what assertSelfContained exists to reject,
        // and exactly what a real sw-runtime entry never produces — this is standing in for a bundler defect, not
        // reproducing one.
        build: vi.fn().mockResolvedValue({ output: [{ type: "chunk", code: "process.env.NODE_ENV;" }] }),
      };
    });

    const { bundleWorkers } = await import("../src/workers.js");
    await expect(bundleWorkers(fixturePlan())).rejects.toThrow(/not self-contained/);
  });
});
