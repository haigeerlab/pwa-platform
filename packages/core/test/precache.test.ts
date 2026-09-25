import { validatePlan } from "@pwa-platform/contracts";
import type { PwaPlan, PwaResourceRule, PwaValidationResult } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";
import type { PwaHostBuildFile } from "../src/index.js";
import { input } from "./fixtures.js";

// Invalid inputs are part of the contract, so tests call through an `unknown`-typed alias.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

type Rule = Pick<PwaResourceRule, "pathPrefix" | "resourceClass" | "cache">;
type Fallback = { enabled: false } | { enabled: true; path: `/${string}` };

const asset = (pathPrefix: string): Rule => ({ pathPrefix, resourceClass: "asset", cache: "cache-first" }) as Rule;
const deny = (pathPrefix: string): Rule => ({ pathPrefix, resourceClass: "session-data", cache: "none" }) as Rule;
const publicData = (pathPrefix: string): Rule =>
  ({ pathPrefix, resourceClass: "public-data", cache: "network-first" }) as Rule;

const file = (path: string, fingerprinted = false): PwaHostBuildFile => ({
  path,
  fingerprinted,
  contentHash: `hash${path.replace(/[^A-Za-z0-9]/g, "").padEnd(8, "0").slice(0, 24)}`,
});

function build(
  resources: readonly Rule[],
  files: readonly PwaHostBuildFile[],
  offlineFallback: Fallback = { enabled: false },
): ReturnType<typeof compilePlan> {
  return compile({
    ...input,
    policy: { ...input.policy, resources, offlineFallback },
    hostBuildOutput: { ...input.hostBuildOutput, files },
  });
}

function plan(result: ReturnType<typeof compilePlan>): PwaPlan {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  expect(validatePlan(result.value).ok).toBe(true);
  return result.value;
}

function findings(result: PwaValidationResult<unknown>): (readonly [string, string, string])[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path, finding.severity] as const);
}

describe("precache: selection", () => {
  it("precaches only build files whose first matching rule is an asset rule", () => {
    const result = build(
      [asset("/assets")],
      [file("index.html"), file("assets/main.3f9a.js", true), file("assets/logo.png"), file("robots.txt")],
    );
    expect(plan(result).precache).toEqual([
      { url: "/app/assets/logo.png", revision: file("assets/logo.png").contentHash },
      { url: "/app/assets/main.3f9a.js", revision: null },
    ]);
  });

  it("does not precache files whose first matching asset rule is network-only, and does not warn about it", () => {
    const networkOnly = { pathPrefix: "/assets", resourceClass: "asset", cache: "none" } as Rule;
    const result = build([networkOnly], [file("assets/a.js")]);
    expect(plan(result).precache).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("always excludes the service worker, the manifest and source maps", () => {
    const result = build(
      [asset("/")],
      [file("sw.js"), file("manifest.webmanifest"), file("assets/main.js.map"), file("index.html")],
    );
    expect(plan(result).precache.map((entry) => entry.url)).toEqual(["/app/index.html"]);
  });

  it("follows first-match evaluation: longer public rules and deny rules take precedence over an asset root", () => {
    const result = build(
      [asset("/"), publicData("/data"), deny("/private")],
      [file("index.html"), file("data/catalog.json"), file("private/profile.js")],
    );
    expect(plan(result).precache.map((entry) => entry.url)).toEqual(["/app/index.html"]);
  });

  it("matches on whole path segments and on URL-decoded prefixes", () => {
    const result = build([asset("/%61ssets")], [file("assets/a.js"), file("assetsx/b.js")]);
    expect(plan(result).precache.map((entry) => entry.url)).toEqual(["/app/assets/a.js"]);
  });

  it("orders entries by URL code point and is independent of file order", () => {
    const files = [file("b.js"), file("a.js"), file("Z.js"), file("e.js")];
    const forward = build([asset("/")], files);
    const reversed = build([asset("/")], [...files].reverse());
    expect(plan(forward).precache.map((entry) => entry.url)).toEqual(["/app/Z.js", "/app/a.js", "/app/b.js", "/app/e.js"]);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });
});

describe("precache: unmatched asset rules", () => {
  it("warns about an asset rule that covers no build file, in the result and in the plan", () => {
    const result = build([asset("/assets"), asset("/fonts")], [file("assets/a.js")]);
    const expected = [["compile.asset-rule-unmatched", "/policy/resources/1/pathPrefix", "warning"]];
    expect(findings(result)).toEqual(expected);
    expect(plan(result).diagnostics.map((finding) => [finding.code, finding.path, finding.severity])).toEqual(expected);
  });

  it("treats an asset rule shadowed by a longer asset rule as unmatched", () => {
    const result = build([asset("/assets"), asset("/assets/img")], [file("assets/img/logo.png")]);
    expect(findings(result)).toEqual([["compile.asset-rule-unmatched", "/policy/resources/0/pathPrefix", "warning"]]);
  });
});

describe("offline fallback", () => {
  it("resolves the fallback path and always precaches it", () => {
    const result = build([], [file("offline.html"), file("index.html")], { enabled: true, path: "/offline.html" });
    const value = plan(result);
    expect(value.offlineFallback).toEqual({ enabled: true, path: "/app/offline.html" });
    expect(value.precache).toEqual([{ url: "/app/offline.html", revision: file("offline.html").contentHash }]);
  });

  it("does not duplicate a fallback that an asset rule already precaches", () => {
    const result = build([asset("/")], [file("offline.html", true)], { enabled: true, path: "/offline.html" });
    expect(plan(result).precache).toEqual([{ url: "/app/offline.html", revision: null }]);
  });

  it("requires the fallback to be a build file", () => {
    expect(findings(build([], [file("index.html")], { enabled: true, path: "/offline.html" }))).toEqual([
      ["compile.offline-fallback-not-built", "/policy/offlineFallback/path", "error"],
    ]);
    expect(findings(build([], [file("sw.js")], { enabled: true, path: "/sw.js" }))).toEqual([
      ["compile.offline-fallback-not-built", "/policy/offlineFallback/path", "error"],
    ]);
  });

  it("rejects a fallback covered by a deny rule", () => {
    expect(
      findings(build([deny("/offline.html")], [file("offline.html")], { enabled: true, path: "/offline.html" })),
    ).toEqual([["compile.offline-fallback-denied", "/policy/offlineFallback/path", "error"]]);
  });

  it("reports both problems when the fallback is neither built nor allowed", () => {
    expect(findings(build([deny("/")], [], { enabled: true, path: "/offline.html" }))).toEqual([
      ["compile.offline-fallback-not-built", "/policy/offlineFallback/path", "error"],
      ["compile.offline-fallback-denied", "/policy/offlineFallback/path", "error"],
    ]);
  });
});
