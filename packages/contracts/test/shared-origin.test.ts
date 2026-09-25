import { describe, expect, it } from "vitest";
import { REQUEST_BASELINE_DENIALS, validatePlan } from "../src/index.js";
import type { PwaOriginRegistry, PwaPathRule, PwaPlan, PwaValidationResult } from "../src/index.js";
import { plan as standalonePlan } from "./fixtures.js";

type Finding = readonly [code: string, path: string];

function findings(result: PwaValidationResult<unknown>): Finding[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

function expectRejected(result: PwaValidationResult<unknown>, expected: readonly Finding[]): void {
  expect(result.ok).toBe(false);
  expect(findings(result)).toEqual(expected);
}

// The typical topology from the spec: a root app at `/` and one fixed sub-path app at `/m/`.
const registry: PwaOriginRegistry = {
  schemaVersion: 1,
  registryVersion: 1,
  origin: "https://shop.example.com",
  environment: "production",
  root: {
    appId: "shop",
    scope: "/",
    serviceWorkerUrl: "/sw.js",
    manifestId: "/",
    manifestUrl: "/manifest.webmanifest",
  },
  children: [
    {
      appId: "shop-m",
      scope: "/m/",
      serviceWorkerUrl: "/m/sw.js",
      manifestId: "/m/",
      manifestUrl: "/m/manifest.webmanifest",
    },
  ],
};

const excludeRule: PwaPathRule = { pathPrefix: "/m", resourceClass: "unclassified", action: "exclude", source: "platform" };

const rootPlan: PwaPlan = {
  schemaVersion: 1,
  planVersion: 1,
  policyVersion: 1,
  identity: {
    appId: "shop",
    manifestId: "/",
    origin: "https://shop.example.com",
    scope: "/",
    serviceWorkerUrl: "/sw.js",
    manifestUrl: "/manifest.webmanifest",
    mountPath: "/",
    environment: "production",
    cacheNamespaceSeed: "r1",
  },
  install: null,
  hostBuildOutput: { publicPath: "/" },
  topology: { kind: "shared-origin", registry },
  artifacts: { serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest" },
  precache: [],
  cacheNamespace: { prefix: "pwa:shop:production:r1:" },
  requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
  pathRules: [excludeRule],
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  diagnostics: [],
};

const childPlan: PwaPlan = {
  schemaVersion: 1,
  planVersion: 1,
  policyVersion: 1,
  identity: {
    appId: "shop-m",
    manifestId: "/m/",
    origin: "https://shop.example.com",
    scope: "/m/",
    serviceWorkerUrl: "/m/sw.js",
    manifestUrl: "/m/manifest.webmanifest",
    mountPath: "/m",
    environment: "production",
    cacheNamespaceSeed: "r1",
  },
  install: null,
  hostBuildOutput: { publicPath: "/m/" },
  topology: { kind: "shared-origin", registry },
  artifacts: { serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest" },
  precache: [],
  cacheNamespace: { prefix: "pwa:shop-m:production:r1:" },
  requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
  pathRules: [],
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  diagnostics: [],
};

describe("validatePlan with shared-origin", () => {
  it("accepts a valid root plan whose exclude rule precedes everything else", () => {
    expect(validatePlan(rootPlan)).toEqual({ ok: true, value: rootPlan, diagnostics: [] });
  });

  it("accepts a valid child plan with no exclude rules", () => {
    expect(validatePlan(childPlan)).toEqual({ ok: true, value: childPlan, diagnostics: [] });
  });

  it("does not flag an exclude rule as an unsafe cache strategy", () => {
    // `unclassified` may only use the `none` cache strategy, but `exclude` is not a cache
    // strategy at all, so the root plan above must validate without `policy.unsafe-cache-strategy`.
    const result = validatePlan(rootPlan);
    expect(result.ok).toBe(true);
    expect(result.ok && result.diagnostics.some((d) => d.code === "policy.unsafe-cache-strategy")).toBe(false);
  });

  it("rejects a root plan whose registry origin does not match the identity", () => {
    const badPlan: PwaPlan = { ...rootPlan, topology: { kind: "shared-origin", registry: { ...registry, origin: "https://other.example.com" } } };
    expectRejected(validatePlan(badPlan), [["plan.registry-identity-mismatch", "/topology/registry"]]);
  });

  it("rejects a plan whose identity matches no registry entry", () => {
    const badPlan: PwaPlan = {
      ...rootPlan,
      identity: { ...rootPlan.identity, appId: "shop-other" },
      cacheNamespace: { prefix: "pwa:shop-other:production:r1:" },
    };
    expectRejected(validatePlan(badPlan), [["plan.registry-identity-mismatch", "/topology/registry"]]);
  });

  it("rejects a root plan missing the exclude rule for one of its children", () => {
    const badPlan: PwaPlan = { ...rootPlan, pathRules: [] };
    expectRejected(validatePlan(badPlan), [["plan.exclude-rules-mismatch", "/pathRules"]]);
  });

  it("rejects a child plan that carries an exclude rule", () => {
    const badPlan: PwaPlan = { ...childPlan, pathRules: [excludeRule] };
    expectRejected(validatePlan(badPlan), [["plan.exclude-rules-mismatch", "/pathRules"]]);
  });

  it.each([
    ["wrong source", { ...excludeRule, source: "policy" as const }],
    ["wrong resourceClass", { ...excludeRule, resourceClass: "asset" as const }],
  ])("rejects an exclude rule with %s", (_name, badRule) => {
    const badPlan: PwaPlan = { ...rootPlan, pathRules: [badRule] };
    expectRejected(validatePlan(badPlan), [["plan.exclude-rules-mismatch", "/pathRules/0"]]);
  });

  it("rejects an exclude rule that does not precede every non-exclude rule", () => {
    const leadingRule: PwaPathRule = { pathPrefix: "/api", resourceClass: "unclassified", action: "deny", source: "platform" };
    const badPlan: PwaPlan = { ...rootPlan, pathRules: [leadingRule, excludeRule] };
    expectRejected(validatePlan(badPlan), [["plan.exclude-not-first", "/pathRules/1/action"]]);
  });

  it("rejects a standalone-origin plan that carries an exclude rule", () => {
    const badPlan: PwaPlan = { ...standalonePlan, pathRules: [excludeRule, ...standalonePlan.pathRules] };
    expectRejected(validatePlan(badPlan), [["plan.exclude-rules-mismatch", "/pathRules/0/action"]]);
  });
});

describe("validatePlan: root content must not reach into a child scope (ADR-0019 review #2)", () => {
  it("rejects a precache entry inside a child scope", () => {
    const badPlan: PwaPlan = { ...rootPlan, precache: [{ url: "/m/leaked.js", revision: null }] };
    expectRejected(validatePlan(badPlan), [["plan.precache-in-child-scope", "/precache/0/url"]]);
  });

  it("reports every offending precache entry, each at its own index", () => {
    const badPlan: PwaPlan = {
      ...rootPlan,
      precache: [
        { url: "/index.html", revision: null },
        { url: "/m/leaked.js", revision: null },
        { url: "/m/other.js", revision: null },
      ],
    };
    expectRejected(validatePlan(badPlan), [
      ["plan.precache-in-child-scope", "/precache/1/url"],
      ["plan.precache-in-child-scope", "/precache/2/url"],
    ]);
  });

  it("does not flag a precache entry that only shares the child scope's first letter", () => {
    const okPlan: PwaPlan = { ...rootPlan, precache: [{ url: "/mx/index.html", revision: null }] };
    expect(validatePlan(okPlan).ok).toBe(true);
  });

  it("rejects an offline fallback inside a child scope", () => {
    const badPlan: PwaPlan = { ...rootPlan, offlineFallback: { enabled: true, path: "/m/offline.html" } };
    expectRejected(validatePlan(badPlan), [["plan.offline-fallback-in-child-scope", "/offlineFallback/path"]]);
  });

  it("rejects an install start URL inside a child scope", () => {
    const badPlan: PwaPlan = {
      ...rootPlan,
      install: {
        startUrl: "/m/",
        display: "standalone",
        name: "Shop",
        shortName: "Shop",
        themeColor: "#0f172a",
        backgroundColor: "#ffffff",
        icons: [],
      },
    };
    // Icons are incomplete too, but the child-scope finding is reported regardless of that separate error.
    const result = validatePlan(badPlan);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.code === "plan.start-url-in-child-scope")).toBe(true);
  });

  it("rejects a root plan's shortcut URL inside a child scope (plan-level backstop, ADR-0037)", () => {
    const badPlan = {
      ...rootPlan,
      install: {
        startUrl: "/",
        display: "standalone",
        name: "Shop",
        shortName: "Shop",
        themeColor: "#0f172a",
        backgroundColor: "#ffffff",
        icons: [],
        shortcuts: [{ name: "Admin", url: "/m/orders" }],
      },
    } as unknown as PwaPlan;
    const result = validatePlan(badPlan);
    expect(result.ok).toBe(false);
    expect(
      !result.ok &&
        result.diagnostics.some((d) => d.code === "plan.shortcut-url-in-child-scope" && d.path === "/install/shortcuts/0/url"),
    ).toBe(true);
  });

  it("does not run the child-scope checks against a child plan's own content", () => {
    const okPlan: PwaPlan = { ...childPlan, precache: [{ url: "/m/index.html", revision: null }] };
    expect(validatePlan(okPlan).ok).toBe(true);
  });

  it("catches a hand-edited root plan that adds a child-scope precache URL, even though it compiled cleanly", () => {
    // A compiled plan already satisfies the invariant; corrupting it after the fact must still be caught by
    // validatePlan, independent of how the plan was produced (design note: core never emits such a plan).
    const corrupted: PwaPlan = { ...rootPlan, precache: [...rootPlan.precache, { url: "/m/x.js", revision: null }] };
    expectRejected(validatePlan(corrupted), [["plan.precache-in-child-scope", `/precache/${rootPlan.precache.length}/url`]]);
  });
});
