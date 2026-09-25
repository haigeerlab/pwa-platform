import { describe, expect, it } from "vitest";
import { validateOriginRegistry } from "../src/index.js";
import type { PwaOriginRegistry, PwaValidationResult } from "../src/index.js";

type Finding = readonly [code: string, path: string];

function findings(result: PwaValidationResult<unknown>): Finding[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

function expectRejected(result: PwaValidationResult<unknown>, expected: readonly Finding[]): void {
  expect(result.ok).toBe(false);
  expect(findings(result)).toEqual(expected);
}

function without(value: object, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  delete copy[key];
  return copy;
}

// A non-trivial root (not `/`) so "outside the root" and "inside a child" are both reachable.
const baseRegistry: PwaOriginRegistry = {
  schemaVersion: 1,
  registryVersion: 1,
  origin: "https://shop.example.com",
  environment: "production",
  root: {
    appId: "shop",
    scope: "/app/",
    serviceWorkerUrl: "/app/sw.js",
    manifestId: "/app/",
    manifestUrl: "/app/manifest.webmanifest",
  },
  children: [
    {
      appId: "shop-m",
      scope: "/app/m/",
      serviceWorkerUrl: "/app/m/sw.js",
      manifestId: "/app/m/",
      manifestUrl: "/app/m/manifest.webmanifest",
    },
  ],
};

describe("validateOriginRegistry", () => {
  it("accepts a valid registry", () => {
    expect(validateOriginRegistry(baseRegistry)).toEqual({ ok: true, value: baseRegistry, diagnostics: [] });
  });

  it("rejects a child scope outside the root scope, without echoing the offending path", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        { appId: "shop-m", scope: "/other/", serviceWorkerUrl: "/other/sw.js", manifestId: "/other/", manifestUrl: "/other/manifest.webmanifest" },
      ],
    };
    const result = validateOriginRegistry(registry);
    expectRejected(result, [["registry.child-outside-root", "/children/0/scope"]]);
    expect(JSON.stringify(result)).not.toContain("/other/");
  });

  it("rejects a root scope reused unchanged as a child scope (equal is not within)", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [{ ...baseRegistry.children[0]!, scope: baseRegistry.root.scope }],
    };
    // The child scope now also contains the root's own URLs, so that check fires too.
    expectRejected(validateOriginRegistry(registry), [
      ["registry.child-outside-root", "/children/0/scope"],
      ["registry.root-url-in-child-scope", "/root/serviceWorkerUrl"],
      ["registry.root-url-in-child-scope", "/root/manifestUrl"],
    ]);
  });

  it("rejects two children with the same scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        baseRegistry.children[0]!,
        {
          appId: "shop-m2",
          scope: "/app/m/",
          serviceWorkerUrl: "/app/m/sw2.js",
          manifestId: "/app/m2/",
          manifestUrl: "/app/m/manifest2.webmanifest",
        },
      ],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.scope-overlap", "/children/1/scope"]]);
  });

  it("rejects a child scope nested inside another child scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        baseRegistry.children[0]!,
        {
          appId: "shop-m2",
          scope: "/app/m/sub/",
          serviceWorkerUrl: "/app/m/sub/sw.js",
          manifestId: "/app/m/sub/",
          manifestUrl: "/app/m/sub/manifest.webmanifest",
        },
      ],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.scope-overlap", "/children/1/scope"]]);
  });

  it("rejects a repeated manifestId across entries", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [{ ...baseRegistry.children[0]!, manifestId: baseRegistry.root.manifestId }],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.duplicate-identity-field", "/children/0/manifestId"]]);
  });

  it("rejects a service worker URL outside its own entry's scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [{ ...baseRegistry.children[0]!, serviceWorkerUrl: "/app/sw-bad.js" }],
    };
    expectRejected(validateOriginRegistry(registry), [
      ["registry.entry-url-outside-scope", "/children/0/serviceWorkerUrl"],
    ]);
  });

  it("rejects a manifest URL outside its own entry's scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [{ ...baseRegistry.children[0]!, manifestUrl: "/app/manifest-bad.webmanifest" }],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.entry-url-outside-scope", "/children/0/manifestUrl"]]);
  });

  it("rejects a root service worker URL that falls inside a child scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      root: { ...baseRegistry.root, serviceWorkerUrl: "/app/m/root-sw.js" },
    };
    expectRejected(validateOriginRegistry(registry), [["registry.root-url-in-child-scope", "/root/serviceWorkerUrl"]]);
  });

  it("rejects a root manifest URL that falls inside a child scope", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      root: { ...baseRegistry.root, manifestUrl: "/app/m/root-manifest.webmanifest" },
    };
    expectRejected(validateOriginRegistry(registry), [["registry.root-url-in-child-scope", "/root/manifestUrl"]]);
  });

  it("detects an overlap between scopes distinguished only by percent-encoding (ADR-0019 review #1)", () => {
    // "/app/m/" and "/app/%6D/" decode to the same path; a raw-string comparison would miss this.
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        baseRegistry.children[0]!,
        {
          appId: "shop-m2",
          scope: "/app/%6D/",
          serviceWorkerUrl: "/app/%6D/sw.js",
          manifestId: "/app/m2/",
          manifestUrl: "/app/%6D/manifest.webmanifest",
        },
      ],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.scope-overlap", "/children/1/scope"]]);
  });

  it("detects the same overlap with a lowercase percent-encoded escape", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        baseRegistry.children[0]!,
        {
          appId: "shop-m2",
          scope: "/app/%6d/",
          serviceWorkerUrl: "/app/%6d/sw.js",
          manifestId: "/app/m2/",
          manifestUrl: "/app/%6d/manifest.webmanifest",
        },
      ],
    };
    expectRejected(validateOriginRegistry(registry), [["registry.scope-overlap", "/children/1/scope"]]);
  });

  it("rejects a root service worker URL that falls inside a child scope only after percent-decoding", () => {
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      root: { ...baseRegistry.root, serviceWorkerUrl: "/app/%6D/root-sw.js" },
    };
    expectRejected(validateOriginRegistry(registry), [["registry.root-url-in-child-scope", "/root/serviceWorkerUrl"]]);
  });

  it("never treats an encoded slash inside a scope as a segment boundary, so it does not overlap a sibling", () => {
    // "/app/m%2Fx/" names one segment "m/x", never merged with the "m" segment of "/app/m/" (ADR-0019 review #1).
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [
        baseRegistry.children[0]!,
        {
          appId: "shop-slash",
          scope: "/app/m%2Fx/",
          serviceWorkerUrl: "/app/m%2Fx/sw.js",
          manifestId: "/app/m%2Fx/",
          manifestUrl: "/app/m%2Fx/manifest.webmanifest",
        },
      ],
    };
    expect(validateOriginRegistry(registry).ok).toBe(true);
  });

  it("reports both the duplicate field and the cache-prefix collision for a repeated appId", () => {
    // appCachePrefix is derived from appId + environment only, and environment is registry-wide,
    // so a cache-prefix collision can only happen alongside an appId collision; the check is kept
    // as an explicit contract invariant rather than an inferred consequence of the encoding.
    const registry: PwaOriginRegistry = {
      ...baseRegistry,
      children: [{ ...baseRegistry.children[0]!, appId: baseRegistry.root.appId }],
    };
    expectRejected(validateOriginRegistry(registry), [
      ["registry.duplicate-identity-field", "/children/0/appId"],
      ["registry.cache-prefix-collision", "/children/0/appId"],
    ]);
  });

  it.each([
    ["missing children", without(baseRegistry, "children"), ["schema.missing-field", "/children"]],
    ["zero children", { ...baseRegistry, children: [] }, ["schema.invalid-value", "/children"]],
    ["registryVersion 0", { ...baseRegistry, registryVersion: 0 }, ["schema.invalid-value", "/registryVersion"]],
    ["non-integer registryVersion", { ...baseRegistry, registryVersion: 1.5 }, ["schema.invalid-value", "/registryVersion"]],
    ["unknown top-level field", { ...baseRegistry, unknownField: true }, ["schema.unknown-field", ""]],
  ] as const)("rejects %s", (_name, input, expected) => {
    expectRejected(validateOriginRegistry(input), [expected]);
  });
});
