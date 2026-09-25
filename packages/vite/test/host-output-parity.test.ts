import type { PwaIdentity, PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { collectHostOutput, decodedPathKey, type PwaBundle } from "../src/host-output.js";

// `collectHostOutput` carries its own copy of core's per-segment path decoding, because core keeps that helper
// internal. Rather than compare the two implementations line by line, this suite compares their verdicts through
// core's public entry: whatever the plugin collects is fed to `compilePlan`, which re-derives the worker and
// manifest URLs from publicPath + file name. A divergence in the decoding shows up as compile.invalid-host-output.
//
// This is the same arrangement sw-runtime uses to guard its path matcher and build-verifier uses for its second
// Cache-Control parser: two implementations are tolerable only while something pins them to the same conclusions.

function identity(overrides: Partial<PwaIdentity> = {}): PwaIdentity {
  return {
    appId: "storefront",
    manifestId: "/app/",
    origin: "https://shop.example.com",
    scope: "/app/",
    serviceWorkerUrl: "/app/sw.js",
    manifestUrl: "/app/manifest.webmanifest",
    mountPath: "/app/",
    environment: "production",
    cacheNamespaceSeed: "r1",
    ...overrides,
  };
}

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

const bundle: PwaBundle = {
  "assets/index-BGTT0tj4.js": { type: "chunk", code: "export const boot = () => {};" },
  "assets/index-B_hd9E1T.css": { type: "asset", source: "body{margin:0}" },
  "sw.js": { type: "chunk", code: "self.addEventListener('install', () => {});" },
  "manifest.webmanifest": { type: "asset", source: "{}" },
  "index.html": { type: "asset", source: "<!doctype html>" },
};

/**
 * Segments whose decoded form is stated outright, so this suite compares against a written expectation rather
 * than against itself. Lower-case escapes are here because they are where a re-implementation is most likely to
 * diverge: a stricter hex test would leave `%c3%a9` undecoded, and every upper-case sample would still pass.
 */
const DECODED_SEGMENTS: readonly (readonly [string, string])[] = [
  ["plain", "plain"],
  ["with%20space", "with space"],
  ["caf%C3%A9", "café"],
  ["caf%c3%a9", "café"],
  ["%41", "A"],
  ["%61", "a"],
  ["%zz", "%zz"],
  ["half%2", "half%2"],
];

describe("host output parity with core", () => {
  it("produces an output core compiles without complaint", () => {
    const host = collectHostOutput(bundle, "/app/", identity());
    const result = compilePlan({ identity: identity(), install: null, policy, topology: { kind: "standalone-origin" }, hostBuildOutput: host });

    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("agrees with core on which file is the worker and which is the manifest", () => {
    const host = collectHostOutput(bundle, "/app/", identity());
    const result = compilePlan({ identity: identity(), install: null, policy, topology: { kind: "standalone-origin" }, hostBuildOutput: host });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // core excludes the worker and the manifest from the precache by rebuilding their URLs from what we collected.
    // If our file names were derived differently, these two would show up as precache entries instead.
    const urls = result.value.precache.map(({ url }) => url);
    expect(urls).not.toContain(identity().serviceWorkerUrl);
    expect(urls).not.toContain(identity().manifestUrl);
  });

  it("keeps a percent-encoded worker path intact through the round trip", () => {
    // `/app/sw%20worker.js` and `/app/sw worker.js` are different URLs. Stripping the base must not blur them,
    // and core re-checks the join, so a divergence fails here rather than shipping a worker nobody can fetch.
    const encoded = identity({ serviceWorkerUrl: "/app/sw%20worker.js" });
    const host = collectHostOutput({ ...bundle, "sw%20worker.js": { type: "chunk", code: "self" } }, "/app/", encoded);

    expect(host.serviceWorkerFile).toBe("sw%20worker.js");
    const result = compilePlan({ identity: encoded, install: null, policy, topology: { kind: "standalone-origin" }, hostBuildOutput: host });
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  });

  it("decodes each segment to the form core's key produces", () => {
    // Each expectation is written out. An earlier version compared decodedPathKey(path) with itself, which is
    // true of any implementation — a mutant that refused lower-case escapes passed the whole suite.
    for (const [segment, decoded] of DECODED_SEGMENTS) {
      expect(decodedPathKey(`/app/${segment}/file.js`), segment).toBe(`/app/${decoded}/file.js`);
    }
  });

  it("keeps %2F from becoming a separator it never was", () => {
    // A decoded key may collapse two spellings into one, but must never split one path into two.
    expect(decodedPathKey("/app/a%2Fb")).not.toBe(decodedPathKey("/app/a/b"));
    expect(decodedPathKey("/app/a%2fb")).toBe(decodedPathKey("/app/a%2Fb"));
  });

  it("treats %41 and A as the same path, as the URL standard does", () => {
    expect(decodedPathKey("/app/%41.js")).toBe(decodedPathKey("/app/A.js"));
  });
});
