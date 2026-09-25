import { RESOURCE_CLASSES } from "@pwa-platform/contracts";
import type { PwaPathRule, PwaResourceRule, PwaValidationResult } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";
import { input } from "./fixtures.js";

// Invalid inputs are part of the contract, so tests call through an `unknown`-typed alias.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

type Rule = Pick<PwaResourceRule, "pathPrefix" | "resourceClass" | "cache">;

const rootIdentity = {
  ...input.identity,
  scope: "/",
  mountPath: "/",
  serviceWorkerUrl: "/sw.js",
  manifestUrl: "/manifest.webmanifest",
};

function compileRules(resources: readonly Rule[], root = false): ReturnType<typeof compilePlan> {
  return compile({
    ...input,
    identity: root ? rootIdentity : input.identity,
    policy: { ...input.policy, resources },
    hostBuildOutput: { ...input.hostBuildOutput, publicPath: root ? "/" : "/app/" },
  });
}

function pathRules(resources: readonly Rule[], root = false): readonly PwaPathRule[] {
  const result = compileRules(resources, root);
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  return result.value.pathRules;
}

function findings(result: PwaValidationResult<unknown>): (readonly [string, string])[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

const deny = (pathPrefix: string, resourceClass: Rule["resourceClass"] = "session-data"): Rule =>
  ({ pathPrefix, resourceClass, cache: "none" }) as Rule;
const allow = (pathPrefix: string, resourceClass: Rule["resourceClass"] = "public-data", cache: Rule["cache"] = "network-first"): Rule =>
  ({ pathPrefix, resourceClass, cache }) as Rule;

describe("path rules: resolution and actions", () => {
  it("resolves prefixes against the mount path, including the root prefix", () => {
    expect(pathRules([allow("/api"), allow("/")]).map((rule) => rule.pathPrefix)).toEqual(["/app/api", "/app"]);
    expect(pathRules([allow("/api"), allow("/")], true).map((rule) => rule.pathPrefix)).toEqual(["/api", "/"]);
  });

  it.each(RESOURCE_CLASSES)("maps the %s class to its action", (resourceClass) => {
    const denied = ["session-data", "mutation", "stream", "unclassified"].includes(resourceClass);
    const rule: Rule = denied ? deny("/x", resourceClass) : allow("/x", resourceClass, "stale-while-revalidate");
    expect(pathRules([rule])).toEqual([
      {
        pathPrefix: "/app/x",
        resourceClass,
        action: denied ? "deny" : "stale-while-revalidate",
        source: "policy",
      },
    ]);
  });

  it("keeps the network-only strategy for public classes as an allow rule", () => {
    expect(pathRules([allow("/x", "public-data", "none")])[0]?.action).toBe("none");
  });
});

describe("path rules: precedence", () => {
  it("orders deny rules before allow rules, longer prefixes first", () => {
    const rules = pathRules([
      allow("/assets", "asset", "cache-first"),
      deny("/account"),
      allow("/api/catalog", "public-data", "stale-while-revalidate"),
      deny("/api/orders", "mutation"),
      allow("/", "navigation-public-static", "network-first"),
    ]);
    expect(rules.map((rule) => [rule.pathPrefix, rule.action])).toEqual([
      ["/app/api/orders", "deny"],
      ["/app/account", "deny"],
      ["/app/api/catalog", "stale-while-revalidate"],
      ["/app/assets", "cache-first"],
      ["/app", "network-first"],
    ]);
  });

  it("breaks length ties by code point order", () => {
    expect(pathRules([allow("/b"), allow("/a")]).map((rule) => rule.pathPrefix)).toEqual(["/app/a", "/app/b"]);
  });

  it("is independent of the declaration order", () => {
    const resources = [
      allow("/assets", "asset", "cache-first"),
      deny("/account"),
      allow("/api/catalog", "public-data", "stale-while-revalidate"),
      deny("/api/orders", "mutation"),
      allow("/", "navigation-public-static", "network-first"),
      deny("/live", "stream"),
      allow("/docs"),
      allow("/dogs"),
    ];
    const expected = JSON.stringify(compileRules(resources));
    let seed = 20260915;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 25; round += 1) {
      const shuffled = [...resources];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
      }
      expect(JSON.stringify(compileRules(shuffled))).toBe(expected);
    }
  });

  it("never lets an allow rule be evaluated before a deny rule", () => {
    const rules = pathRules([allow("/"), deny("/account"), allow("/assets", "asset", "cache-first"), deny("/live", "stream")]);
    const lastDeny = rules.map((rule) => rule.action).lastIndexOf("deny");
    const firstAllow = rules.findIndex((rule) => rule.action !== "deny");
    expect(lastDeny).toBeLessThan(firstAllow);
  });
});

describe("path rules: conflicts", () => {
  it("rejects an allow rule under a deny prefix", () => {
    expect(findings(compileRules([deny("/api"), allow("/api/catalog")]))).toEqual([
      ["compile.allow-under-deny", "/policy/resources/1/pathPrefix"],
    ]);
    expect(findings(compileRules([deny("/", "unclassified"), allow("/assets", "asset", "cache-first")]))).toEqual([
      ["compile.allow-under-deny", "/policy/resources/1/pathPrefix"],
    ]);
  });

  it("allows deny rules under an allow prefix and sibling prefixes that only share characters", () => {
    expect(compileRules([allow("/"), deny("/account")]).ok).toBe(true);
    expect(compileRules([deny("/api"), allow("/apis")]).ok).toBe(true);
  });

  it("rejects prefixes that are equal after URL decoding", () => {
    expect(findings(compileRules([allow("/api"), allow("/%61pi")]))).toEqual([
      ["compile.duplicate-path-prefix", "/policy/resources/1/pathPrefix"],
    ]);
    expect(findings(compileRules([allow("/%E5%BA%97"), allow("/%e5%ba%97")]))).toEqual([
      ["compile.duplicate-path-prefix", "/policy/resources/1/pathPrefix"],
    ]);
    expect(findings(compileRules([deny("/api"), allow("/api")]))).toEqual([
      ["compile.duplicate-path-prefix", "/policy/resources/1/pathPrefix"],
    ]);
  });

  it("does not treat an encoded slash as a segment boundary", () => {
    expect(compileRules([allow("/a/b"), allow("/a%2Fb")]).ok).toBe(true);
    expect(compileRules([deny("/a"), allow("/a%2Fb")]).ok).toBe(true);
    expect(compileRules([allow("/a%252Fb"), allow("/a%2Fb")]).ok).toBe(true);
  });

  it("catches deny bypasses written with encoded characters", () => {
    expect(findings(compileRules([deny("/account"), allow("/%61ccount/avatar")]))).toEqual([
      ["compile.allow-under-deny", "/policy/resources/1/pathPrefix"],
    ]);
  });

  it("reports duplicate prefixes before allow-under-deny conflicts, each in resource order", () => {
    expect(findings(compileRules([deny("/api"), allow("/api/catalog"), allow("/x"), allow("/%78")]))).toEqual([
      ["compile.duplicate-path-prefix", "/policy/resources/3/pathPrefix"],
      ["compile.allow-under-deny", "/policy/resources/1/pathPrefix"],
    ]);
  });
});
