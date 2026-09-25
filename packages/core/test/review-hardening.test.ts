import { RESOURCE_CLASSES, validatePolicy } from "@pwa-platform/contracts";
import type { PwaPlan, PwaResourceRule, PwaValidationResult } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";
import type { PwaHostBuildFile } from "../src/index.js";
import { decodedPathKey, isWithinKey } from "../src/internal/path-key.js";
import { input } from "./fixtures.js";

// Invalid inputs are part of the contract, so tests call through an `unknown`-typed alias.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

type Rule = Pick<PwaResourceRule, "pathPrefix" | "resourceClass" | "cache">;
type Fallback = { enabled: false } | { enabled: true; path: string };

const rule = (pathPrefix: string, resourceClass: string, cache: string): Rule =>
  ({ pathPrefix, resourceClass, cache }) as Rule;
const deny = (pathPrefix: string): Rule => rule(pathPrefix, "session-data", "none");
const allow = (pathPrefix: string): Rule => rule(pathPrefix, "public-data", "network-first");
const asset = (pathPrefix: string): Rule => rule(pathPrefix, "asset", "cache-first");
const file = (path: string, contentHash = "a1b2c3d4e5f6"): PwaHostBuildFile => ({ path, fingerprinted: false, contentHash });

function build(
  resources: readonly Rule[],
  files: readonly unknown[] = [],
  offlineFallback: Fallback = { enabled: false },
  host: Record<string, unknown> = {},
  identity: Record<string, unknown> = {},
): ReturnType<typeof compilePlan> {
  return compile({
    ...input,
    identity: { ...input.identity, ...identity },
    policy: { ...input.policy, resources, offlineFallback },
    hostBuildOutput: { ...input.hostBuildOutput, files, ...host },
  });
}

function findings(result: PwaValidationResult<unknown>): (readonly [string, string])[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

function plan(result: ReturnType<typeof compilePlan>): PwaPlan {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  return result.value;
}

describe("review: malformed escapes compare fail-closed", () => {
  it.each([
    ["an invalid escape", "/a%zz", "/%61%zz"],
    ["a non-UTF-8 escape", "/a%FF", "/%61%FF"],
    ["valid escapes after an invalid one", "/a%zz%62", "/a%zzb"],
    ["different non-UTF-8 bytes", "/%FF", "/%FE"],
  ])("treats prefixes equal after decoding with %s as duplicates", (_name, denied, allowed) => {
    expect(findings(build([deny(denied), allow(allowed)]))).toEqual([
      ["compile.duplicate-path-prefix", "/policy/resources/1/pathPrefix"],
    ]);
  });

  it("detects an allow rule under a deny prefix that contains an invalid escape", () => {
    expect(findings(build([deny("/private%zz"), allow("/%70rivate%zz/x")]))).toEqual([
      ["compile.allow-under-deny", "/policy/resources/1/pathPrefix"],
    ]);
  });

  it("still keeps an encoded slash distinct next to invalid escapes", () => {
    expect(build([allow("/a%2F%zz"), allow("/a/%zz")]).ok).toBe(true);
  });

  it("never precaches a file under a deny prefix spelled with invalid escapes", () => {
    expect(plan(build([asset("/"), deny("/private%zz")], [file("%70rivate%zz/x.js")])).precache).toEqual([]);
  });

  it("rejects an offline fallback under such a deny prefix", () => {
    expect(
      findings(build([deny("/offline%zz")], [file("%6Fffline%zz")], { enabled: true, path: "/%6Fffline%zz" })),
    ).toEqual([["compile.offline-fallback-denied", "/policy/offlineFallback/path"]]);
  });
});

describe("review: build file spellings", () => {
  it("records the build file URL as the offline fallback path so the runtime lookup hits the precache", () => {
    const value = plan(build([], [file("offline.html")], { enabled: true, path: "/%6Fffline.html" }));
    expect(value.offlineFallback).toEqual({ enabled: true, path: "/app/offline.html" });
    expect(value.precache.map((entry) => entry.url)).toEqual(["/app/offline.html"]);
  });

  it("rejects build file paths that are equal after decoding, in either order", () => {
    const expected = [["compile.invalid-host-output", "/hostBuildOutput/files/1/path"]];
    expect(findings(build([asset("/")], [file("offline.html"), file("%6Fffline.html")]))).toEqual(expected);
    expect(findings(build([asset("/")], [file("%6Fffline.html"), file("offline.html")]))).toEqual(expected);
  });
});

describe("review: worker and manifest files", () => {
  it("requires the worker and manifest files to be served at the identity URLs", () => {
    expect(findings(build([], [], { enabled: false }, { serviceWorkerFile: "service-worker.js" }))).toEqual([
      ["compile.invalid-host-output", "/hostBuildOutput/serviceWorkerFile"],
    ]);
    expect(findings(build([], [], { enabled: false }, { manifestFile: "app.webmanifest" }))).toEqual([
      ["compile.invalid-host-output", "/hostBuildOutput/manifestFile"],
    ]);
  });

  it("accepts an encoded spelling of the worker file and excludes every spelling from the precache", () => {
    const value = plan(build([asset("/")], [file("sw.js"), file("index.html")], { enabled: false }, { serviceWorkerFile: "%73w.js" }));
    expect(value.precache.map((entry) => entry.url)).toEqual(["/app/index.html"]);
  });

  it("excludes source maps regardless of extension case", () => {
    expect(plan(build([asset("/")], [file("a.MAP"), file("b.js")])).precache.map((entry) => entry.url)).toEqual([
      "/app/b.js",
    ]);
  });
});

describe("review: input snapshots", () => {
  it("rejects accessor input fields without invoking them", () => {
    let reads = 0;
    const candidate: Record<string, unknown> = { ...input };
    Object.defineProperty(candidate, "hostBuildOutput", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return input.hostBuildOutput;
      },
    });
    expect(findings(compile(candidate))).toEqual([["value.not-serializable", "/hostBuildOutput"]]);
    expect(reads).toBe(0);
  });

  it("rejects sparse file lists and accessor file entries", () => {
    const sparse: unknown[] = new Array(2);
    sparse[1] = file("index.html");
    expect(findings(build([asset("/")], sparse))).toEqual([["compile.invalid-host-output", "/hostBuildOutput/files"]]);

    let reads = 0;
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, 0, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return file("index.html");
      },
    });
    expect(findings(build([asset("/")], accessor))).toEqual([["compile.invalid-host-output", "/hostBuildOutput/files/0"]]);
    expect(reads).toBe(0);
  });
});

describe("review: ordering details", () => {
  it("resolves prefixes under a mount path that ends with a slash", () => {
    const value = plan(build([allow("/api"), allow("/")], [], { enabled: false }, {}, { mountPath: "/app/" }));
    expect(value.pathRules.map((entry) => entry.pathPrefix)).toEqual(["/app/api", "/app"]);
  });

  it("orders by decoded length rather than spelled length", () => {
    const value = plan(build([allow("/%61%61%61"), allow("/bbbb")]));
    expect(value.pathRules.map((entry) => entry.pathPrefix)).toEqual(["/app/bbbb", "/app/%61%61%61"]);
  });

  it("measures length in code points rather than UTF-16 code units", () => {
    const value = plan(build([allow("/%F0%9F%98%80%F0%9F%98%80"), allow("/abc")]));
    expect(value.pathRules.map((entry) => entry.pathPrefix)).toEqual(["/app/abc", "/app/%F0%9F%98%80%F0%9F%98%80"]);
  });
});

describe("review: consistency with contracts", () => {
  it.each(RESOURCE_CLASSES)("compiles %s to deny exactly when contracts forbid caching it", (resourceClass) => {
    const cacheable = validatePolicy({ ...input.policy, resources: [rule("/x", resourceClass, "cache-first")] }).ok;
    const action = plan(build([rule("/x", resourceClass, "none")])).pathRules[0]?.action;
    expect(action === "deny").toBe(!cacheable);
  });
});

describe("review: first-match property", () => {
  it("never lets an allow rule match first where a deny rule applies", () => {
    const segments = ["a", "b", "%61", "A", "%zz", "%FF", "x%2Fy"];
    let seed = 31;
    const random = (limit: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * limit);
    };
    let compiled = 0;
    for (let round = 0; round < 300; round += 1) {
      const resources = Array.from({ length: 1 + random(5) }, () => {
        const depth = random(3);
        const prefix = `/${Array.from({ length: depth }, () => segments[random(segments.length)]).join("/")}`;
        return random(2) === 0 ? deny(prefix) : allow(prefix);
      });
      const result = build(resources);
      if (!result.ok) continue;
      compiled += 1;
      const rules = result.value.pathRules;
      for (const sample of rules.flatMap((entry) => [entry.pathPrefix, `${entry.pathPrefix}/leaf`])) {
        const key = decodedPathKey(sample);
        const matches = rules.filter((entry) => isWithinKey(key, decodedPathKey(entry.pathPrefix)));
        if (matches.some((entry) => entry.action === "deny")) expect(matches[0]?.action).toBe("deny");
      }
    }
    expect(compiled).toBeGreaterThan(50);
  });
});
