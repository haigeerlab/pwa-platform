import { createHash } from "node:crypto";
import type { PwaIdentity, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan } from "@pwa-platform/core";
import type { PwaCompileHostOutput, PwaHostBuildFile } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { collectHostOutput, collectSourceFiles, type PwaBundle } from "../src/host-output.js";

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

/** Names and shapes taken from a real Vite 8 build: chunks carry `code`, assets carry `source`. */
function bundle(overrides: Record<string, PwaBundle[string]> = {}): PwaBundle {
  return {
    "assets/index-BGTT0tj4.js": { type: "chunk", code: "export const boot = () => {};" },
    "assets/index-B_hd9E1T.css": { type: "asset", source: "body{margin:0}" },
    "assets/big-JYp-DHDg.svg": { type: "asset", source: new TextEncoder().encode("<svg></svg>") },
    "index.html": { type: "asset", source: "<!doctype html>" },
    ...overrides,
  };
}

const byPath = (output: PwaCompileHostOutput, path: string): PwaHostBuildFile | undefined =>
  output.files.find((file) => file.path === path);

describe("collectHostOutput", () => {
  it("reads both chunks and assets", () => {
    const output = collectHostOutput(bundle(), "/app/", identity);
    expect(output.files.map(({ path }) => path).sort()).toEqual([
      "assets/big-JYp-DHDg.svg",
      "assets/index-BGTT0tj4.js",
      "assets/index-B_hd9E1T.css",
      "index.html",
    ]);
  });

  it("hashes a Uint8Array source as readily as a string one", () => {
    // A real build produces both: CSS arrives as text, an SVG over the inline limit as bytes.
    const output = collectHostOutput(bundle(), "/app/", identity);
    for (const path of ["assets/index-B_hd9E1T.css", "assets/big-JYp-DHDg.svg"]) {
      expect(byPath(output, path)?.contentHash, path).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    }
  });

  it("produces hashes core will accept, with no base64 padding", () => {
    // core validates contentHash against /^[A-Za-z0-9_-]{8,128}$/ — a trailing "=" fails the whole build output.
    const output = collectHostOutput(bundle(), "/app/", identity);
    for (const { path, contentHash } of output.files) {
      expect(contentHash, path).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
      expect(contentHash, path).not.toContain("=");
      expect(contentHash.length, path).toBe(43);
    }
  });

  it("gives identical content the same hash and different content a different one", () => {
    const same = collectHostOutput(bundle({ "a.js": { type: "chunk", code: "x" }, "b.js": { type: "chunk", code: "x" } }), "/app/", identity);
    expect(byPath(same, "a.js")?.contentHash).toBe(byPath(same, "b.js")?.contentHash);

    const changed = collectHostOutput(bundle({ "a.js": { type: "chunk", code: "y" } }), "/app/", identity);
    expect(byPath(changed, "a.js")?.contentHash).not.toBe(byPath(same, "a.js")?.contentHash);
  });

  it("hashes an asset's content, not merely its presence", () => {
    // The chunk case above would stay green even if asset content never reached the hash: every asset would then
    // share one value, and their precache revisions would stop changing when the files do.
    const text = collectHostOutput(
      bundle({ "a.css": { type: "asset", source: "a{}" }, "b.css": { type: "asset", source: "a{}" } }),
      "/app/",
      identity,
    );
    expect(byPath(text, "a.css")?.contentHash).toBe(byPath(text, "b.css")?.contentHash);

    const changed = collectHostOutput(bundle({ "a.css": { type: "asset", source: "b{}" } }), "/app/", identity);
    expect(byPath(changed, "a.css")?.contentHash).not.toBe(byPath(text, "a.css")?.contentHash);

    // Bytes too: one flipped byte in a Uint8Array must change the hash.
    const bytes = collectHostOutput(bundle({ "x.svg": { type: "asset", source: new Uint8Array([1, 2, 3]) } }), "/app/", identity);
    const flipped = collectHostOutput(bundle({ "x.svg": { type: "asset", source: new Uint8Array([1, 2, 4]) } }), "/app/", identity);
    expect(byPath(bytes, "x.svg")?.contentHash).not.toBe(byPath(flipped, "x.svg")?.contentHash);

    // And no asset may hash like an empty one, which is exactly what dropping the content would produce.
    const empty = collectHostOutput(bundle({ "e.css": { type: "asset", source: "" } }), "/app/", identity);
    expect(byPath(bytes, "x.svg")?.contentHash).not.toBe(byPath(empty, "e.css")?.contentHash);
    expect(byPath(text, "a.css")?.contentHash).not.toBe(byPath(empty, "e.css")?.contentHash);
  });

  it("marks Vite's fingerprinted names and leaves plain ones alone", () => {
    const output = collectHostOutput(bundle(), "/app/", identity);
    expect(byPath(output, "assets/index-BGTT0tj4.js")?.fingerprinted).toBe(true);
    expect(byPath(output, "assets/big-JYp-DHDg.svg")?.fingerprinted).toBe(true);
    expect(byPath(output, "index.html")?.fingerprinted).toBe(false);
  });

  it("does not mistake an ordinary dash for a fingerprint", () => {
    // Getting this wrong in this direction is the expensive one: compilePlan turns `fingerprinted` into
    // `revision: null`, so a plain file marked fingerprinted is never revalidated again.
    //
    // The long names matter. The first three were read as fingerprinted while the pattern allowed a dash inside
    // the run — `{8,}` ran greedily across several of them. The short names alone could not show that: they were
    // the only ones this test had, which is why the defect survived until a reviewer supplied realistic ones.
    const named = collectHostOutput(
      bundle({
        "main-application.js": { type: "chunk", code: "self" },
        "service-worker-registration.js": { type: "chunk", code: "self" },
        "app-shell-styles.css": { type: "asset", source: "a{}" },
        "assets/my-long-component-name.css": { type: "asset", source: "a{}" },
        "vendor-bundle.js": { type: "chunk", code: "self" },
        "service-worker.js": { type: "chunk", code: "self" },
        "my-app.css": { type: "asset", source: "a{}" },
        "assets/logo-2x.png": { type: "asset", source: "png" },
      }),
      "/app/",
      identity,
    );
    for (const path of [
      "main-application.js",
      "service-worker-registration.js",
      "app-shell-styles.css",
      "assets/my-long-component-name.css",
      "vendor-bundle.js",
      "service-worker.js",
      "my-app.css",
      "assets/logo-2x.png",
    ]) {
      expect(byPath(named, path)?.fingerprinted, path).toBe(false);
    }
  });

  it("still recognises the hashes Vite actually produces", () => {
    // Narrowing the pattern must not stop it matching real output. These are names from real builds in this
    // repository's own fixtures.
    const hashed = collectHostOutput(
      bundle({
        "assets/index-P2Xu9kJm.js": { type: "chunk", code: "self" },
        "assets/index-D9tTKZML.css": { type: "asset", source: "a{}" },
        "assets/app-3f9a2c7d.js": { type: "chunk", code: "self" },
      }),
      "/app/",
      identity,
    );
    for (const path of ["assets/index-P2Xu9kJm.js", "assets/index-D9tTKZML.css", "assets/app-3f9a2c7d.js"]) {
      expect(byPath(hashed, path)?.fingerprinted, path).toBe(true);
    }
  });

  it("counts files copied from the public directory", () => {
    const output = collectHostOutput(bundle(), "/app/", identity, [
      { path: "robots.txt", content: new TextEncoder().encode("User-agent: *\n") },
      { path: "icons/192.png", content: new TextEncoder().encode("png") },
    ]);
    expect(output.files.map(({ path }) => path)).toContain("robots.txt");
    expect(output.files.map(({ path }) => path)).toContain("icons/192.png");
    expect(byPath(output, "robots.txt")?.contentHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never calls a public file fingerprinted, however it is named", () => {
    // Public files are copied verbatim, so a `-<hash>` in the name was typed by a person and has nothing to do
    // with the content. Marking one fingerprinted sets its precache revision to null, and the worker would then
    // keep serving the old bytes after the file changes — with no URL change to give it away.
    const output = collectHostOutput(bundle(), "/app/", identity, [
      { path: "logo-abcd1234.png", content: new TextEncoder().encode("png") },
      { path: "assets/vendor-XY_z9012.js", content: new TextEncoder().encode("js") },
    ]);
    expect(byPath(output, "logo-abcd1234.png")?.fingerprinted).toBe(false);
    expect(byPath(output, "assets/vendor-XY_z9012.js")?.fingerprinted).toBe(false);
    // The same name coming out of the bundle is fingerprinted: the difference is where the file came from.
    const bundled = collectHostOutput(bundle({ "logo-abcd1234.png": { type: "asset", source: "png" } }), "/app/", identity);
    expect(byPath(bundled, "logo-abcd1234.png")?.fingerprinted).toBe(true);
  });

  it("hashes a public file from its bytes", () => {
    const one = collectHostOutput(bundle(), "/app/", identity, [
      { path: "robots.txt", content: new TextEncoder().encode("a") },
    ]);
    const two = collectHostOutput(bundle(), "/app/", identity, [
      { path: "robots.txt", content: new TextEncoder().encode("b") },
    ]);
    expect(byPath(one, "robots.txt")?.contentHash).not.toBe(byPath(two, "robots.txt")?.contentHash);
  });

  it("refuses a public file that collides with a build output", () => {
    // Vite writes both, one over the other, without complaining. Two different bytes at one URL is the drift the
    // plan exists to rule out, so the build stops here instead.
    expect(() =>
      collectHostOutput(bundle(), "/app/", identity, [
        { path: "index.html", content: new TextEncoder().encode("<!doctype html>") },
      ]),
    ).toThrow(/same name as a build output/);
  });

  it("omits inlined assets, because they are not in the bundle at all", () => {
    // Vite inlines assets under assetsInlineLimit; they ship inside the chunk that imports them. Listing them
    // would make the release check hunt for a file no build ever emits.
    const output = collectHostOutput(bundle(), "/app/", identity);
    expect(output.files.some(({ path }) => path.includes("tiny"))).toBe(false);
  });

  it("derives the worker and manifest file names from the identity", () => {
    const output = collectHostOutput(bundle(), "/app/", identity);
    expect(output.publicPath).toBe("/app/");
    expect(output.serviceWorkerFile).toBe("sw.js");
    expect(output.manifestFile).toBe("manifest.webmanifest");
    // What core checks is that publicPath + fileName reproduces the identity URL.
    expect(`${output.publicPath}${output.serviceWorkerFile}`).toBe(identity.serviceWorkerUrl);
    expect(`${output.publicPath}${output.manifestFile}`).toBe(identity.manifestUrl);
  });

  it("rejects a base that is not a same-origin path", () => {
    for (const base of ["https://cdn.example.com/app/", "app/", "/app"]) {
      expect(() => collectHostOutput(bundle(), base, identity), base).toThrow(/same-origin base/);
    }
  });

  it("rejects an identity whose worker sits outside the base", () => {
    const outside = { ...identity, serviceWorkerUrl: "/other/sw.js" } as PwaIdentity;
    expect(() => collectHostOutput(bundle(), "/app/", outside)).toThrow(/serviceWorkerUrl must sit under/);
  });

  it("tells a wrong URL apart from one spelled with different escapes", () => {
    // `%70` is "p", so /a%70p/sw.js names the same path as /app/sw.js. core compares decoded keys and would
    // accept it; this plugin strips a literal prefix and cannot. Reporting that as "not under the base" would
    // send the author looking for a wrong path instead of a mismatched escape.
    const escaped = { ...identity, serviceWorkerUrl: "/a%70p/sw.js" } as PwaIdentity;
    expect(() => collectHostOutput(bundle(), "/app/", escaped)).toThrow(/different escapes/);

    const elsewhere = { ...identity, manifestUrl: "/other/manifest.webmanifest" } as PwaIdentity;
    expect(() => collectHostOutput(bundle(), "/app/", elsewhere)).toThrow(/must sit under the Vite base/);
  });

  it("rejects an identity URL that is the base itself", () => {
    const atBase = { ...identity, manifestUrl: "/app/" } as PwaIdentity;
    expect(() => collectHostOutput(bundle(), "/app/", atBase)).toThrow(/must name a file under/);
  });

  it("never echoes the identity's URLs into an error message", () => {
    const secret = "/unreleased-tenant/sw.js";
    const outside = { ...identity, serviceWorkerUrl: secret } as PwaIdentity;
    try {
      collectHostOutput(bundle(), "/app/", outside);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("unreleased-tenant");
    }
  });
});

// 评审第 3 项: a caller that already hashed a file (streaming it, rather than holding the whole thing in memory —
// packages/nuxt/src/artifacts.ts's hashFileContent does exactly this for the public directory) can hand
// `collectSourceFiles` a `contentHash` instead of `content`. This suite works at that lower-level entry directly
// (collectHostOutput always supplies `content`, via bundleSourceFiles) to exercise the passthrough and its guards.
describe("collectSourceFiles: contentHash passthrough", () => {
  it("gives a caller-supplied contentHash and one computed from the same bytes an identical plan", () => {
    const bytes = "export const boot = () => {};";
    const precomputed = createHash("sha256").update(bytes).digest("base64url");

    const fromContent = collectSourceFiles([{ path: "a.js", content: bytes }], "/app/", identity);
    const fromHash = collectSourceFiles([{ path: "b.js", contentHash: precomputed }], "/app/", identity);

    expect(fromHash.files[0]?.contentHash).toBe(fromContent.files[0]?.contentHash);
    // Full round trip: a plan compiled from either input agrees on the file's revision, not merely on the raw hash.
    const planFromContent = compilePlanFor(fromContent);
    const planFromHash = compilePlanFor(fromHash);
    expect(planFromHash.precache.find(({ url }) => url === "/app/b.js")?.revision).toBe(
      planFromContent.precache.find(({ url }) => url === "/app/a.js")?.revision,
    );
  });

  it("passes a given contentHash straight through, unchanged", () => {
    const output = collectSourceFiles([{ path: "a.js", contentHash: "a".repeat(43) }], "/app/", identity);
    expect(byPath(output, "a.js")?.contentHash).toBe("a".repeat(43));
  });

  it("rejects a source file that sets neither content nor contentHash, naming both fields and no value", () => {
    expect(() => collectSourceFiles([{ path: "a.js" }], "/app/", identity)).toThrow(
      /content or contentHash; neither was given/,
    );
  });

  it("rejects a source file that sets both content and contentHash, naming both fields and no value", () => {
    expect(() =>
      collectSourceFiles([{ path: "a.js", content: "x", contentHash: "a".repeat(43) }], "/app/", identity),
    ).toThrow(/content or contentHash, not both/);
  });

  it("never echoes a rejected file's content or contentHash value into the error message", () => {
    const secretContent = "super-secret-file-body";
    const secretHash = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    try {
      collectSourceFiles([{ path: "a.js", content: secretContent, contentHash: secretHash }], "/app/", identity);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secretContent);
      expect((error as Error).message).not.toContain(secretHash);
    }
  });
});

/** Compiles a minimal plan from `host`, for the contentHash-parity test's full round trip. */
function compilePlanFor(host: PwaCompileHostOutput): PwaPlan {
  const policy: PwaPolicy = {
    schemaVersion: 1,
    install: { enabled: false },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [{ pathPrefix: "/", resourceClass: "asset", cache: "cache-first" }],
  };
  const result = compilePlan({ identity, install: null, policy, topology: { kind: "standalone-origin" }, hostBuildOutput: host });
  if (!result.ok) {
    throw new Error(`fixture plan did not compile: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  }
  return result.value;
}
