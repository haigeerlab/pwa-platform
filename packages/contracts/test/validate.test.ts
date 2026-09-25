import { describe, expect, it } from "vitest";
import {
  validateIdentity,
  validateInstallMetadata,
  validatePlan,
  validatePolicy,
} from "../src/index.js";
import type { PwaValidationResult } from "../src/index.js";
import { KNOWN_FIELDS } from "../src/internal/diagnostic.js";
import { event, identity, install, plan, policy } from "./fixtures.js";

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

describe("validateIdentity", () => {
  it("accepts a valid identity, loopback development origins and root scopes", () => {
    expect(validateIdentity(identity)).toEqual({ ok: true, value: identity, diagnostics: [] });
    expect(validateIdentity({ ...identity, origin: "http://localhost:5173" }).ok).toBe(true);
    expect(
      validateIdentity({
        ...identity,
        scope: "/",
        mountPath: "/",
        serviceWorkerUrl: "/sw.js",
        manifestUrl: "/manifest.webmanifest",
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["relative scope", { scope: "app/" }, ["path.invalid", "/scope"]],
    ["scope without a trailing slash", { scope: "/app" }, ["path.invalid", "/scope"]],
    ["protocol-relative worker", { serviceWorkerUrl: "//evil.example/sw.js" }, ["path.invalid", "/serviceWorkerUrl"]],
    ["dot segments", { manifestUrl: "/app/../manifest.webmanifest" }, ["path.invalid", "/manifestUrl"]],
    ["query in a path", { mountPath: "/app?x=1" }, ["path.invalid", "/mountPath"]],
    ["plain HTTP origin", { origin: "http://shop.example.com" }, ["identity.invalid-origin", "/origin"]],
    ["origin with a path", { origin: "https://shop.example.com/app" }, ["identity.invalid-origin", "/origin"]],
    ["uppercase environment", { environment: "Production" }, ["identity.invalid-environment", "/environment"]],
    ["empty appId", { appId: "" }, ["schema.invalid-value", "/appId"]],
    ["numeric appId", { appId: 42 }, ["schema.invalid-type", "/appId"]],
    ["mount path outside scope", { mountPath: "/shop" }, ["identity.scope-excludes-mount-path", "/scope"]],
    ["worker outside scope", { serviceWorkerUrl: "/sw.js" }, ["identity.service-worker-outside-scope", "/serviceWorkerUrl"]],
    [
      "manifest in a sibling path segment",
      { manifestUrl: "/application/manifest.webmanifest" },
      ["identity.manifest-outside-scope", "/manifestUrl"],
    ],
  ] as const)("rejects %s", (_name, patch, expected) => {
    expectRejected(validateIdentity({ ...identity, ...patch }), [expected]);
  });

  it("reports missing and unknown fields without echoing unknown key names", () => {
    expectRejected(validateIdentity(without(identity, "appId")), [["schema.missing-field", "/appId"]]);

    const result = validateIdentity({ ...identity, tok_SECRET_value: "x" });
    expectRejected(result, [["schema.unknown-field", ""]]);
    expect(JSON.stringify(result)).not.toContain("tok_SECRET");
  });
});

describe("plain JSON enforcement", () => {
  class Token {
    readonly value = "shop";
  }

  it.each([
    ["a function", () => "shop"],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["a Date", new Date(0)],
    ["a class instance", new Token()],
    ["a RegExp", /shop/],
  ])("rejects %s", (_name, value) => {
    expectRejected(validateIdentity({ ...identity, appId: value }), [["value.not-serializable", "/appId"]]);
  });

  it("rejects symbol keys, cycles and sparse arrays", () => {
    expectRejected(validateIdentity({ ...identity, [Symbol("x")]: 1 }), [["value.not-serializable", ""]]);

    const cyclic: Record<string, unknown> = { ...identity };
    cyclic["appId"] = cyclic;
    expectRejected(validateIdentity(cyclic), [["value.not-serializable", "/appId"]]);

    const icons: unknown[] = new Array(2);
    icons[1] = install.icons[0];
    expectRejected(validateInstallMetadata({ ...install, icons }, identity), [["value.not-serializable", "/icons"]]);
  });

  it("never invokes getters", () => {
    let reads = 0;
    const input = { ...identity };
    Object.defineProperty(input, "appId", {
      enumerable: true,
      get() {
        reads += 1;
        return "shop";
      },
    });
    expectRejected(validateIdentity(input), [["value.not-serializable", "/appId"]]);
    expect(reads).toBe(0);
  });

  it("accepts null-prototype objects and stops paths at unknown keys", () => {
    expect(validateIdentity(Object.assign(Object.create(null) as object, identity)).ok).toBe(true);

    const result = validateIdentity({ ...identity, extra: { tok_SECRET_value: () => "x" } });
    expectRejected(result, [["value.not-serializable", ""]]);
    expect(JSON.stringify(result)).not.toMatch(/tok_SECRET|extra/);
  });
});

describe("validateInstallMetadata", () => {
  it("accepts complete metadata, including icons that declare several sizes", () => {
    expect(validateInstallMetadata(install, identity)).toEqual({ ok: true, value: install, diagnostics: [] });
    const combined = [
      { src: "/app/icons/any.png", sizes: "192x192 512x512", type: "image/png", purpose: "any" },
      { src: "/app/icons/maskable.png", sizes: "192x192 512x512", type: "image/png", purpose: "maskable" },
    ];
    expect(validateInstallMetadata({ ...install, icons: combined }, identity).ok).toBe(true);
  });

  it("rejects a start URL outside the identity scope", () => {
    expectRejected(validateInstallMetadata({ ...install, startUrl: "/other/" }, identity), [
      ["install.start-url-outside-scope", "/startUrl"],
    ]);
  });

  it("names each missing required icon variant", () => {
    const icons = install.icons.filter((icon) => !(icon.purpose === "maskable" && icon.sizes === "512x512"));
    const result = validateInstallMetadata({ ...install, icons }, identity);
    expectRejected(result, [["install.missing-icon-variant", "/icons"]]);
    expect(result.diagnostics[0]?.message).toBe('Required 512x512 "maskable" icon is missing.');
  });

  it("rejects unknown display modes and relative icon sources", () => {
    expectRejected(validateInstallMetadata({ ...install, display: "window" }, identity), [
      ["schema.invalid-value", "/display"],
    ]);
    const icons = [{ ...install.icons[0], src: "icons/192.png" }, ...install.icons.slice(1)];
    expectRejected(validateInstallMetadata({ ...install, icons }, identity), [["path.invalid", "/icons/0/src"]]);
  });

  it("warns, without failing, when a color cannot be verified", () => {
    const result = validateInstallMetadata({ ...install, themeColor: "rebeccapurple" }, identity);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      {
        code: "install.invalid-color",
        severity: "warning",
        path: "/themeColor",
        message: "Color is not a hex color and cannot be verified.",
      },
    ]);
  });
});

describe("validatePolicy", () => {
  const rule = (patch: Record<string, unknown>) => ({
    ...policy,
    resources: [{ pathPrefix: "/data", resourceClass: "public-data", cache: "none", ...patch }],
  });

  it("accepts a valid policy", () => {
    expect(validatePolicy(policy)).toEqual({ ok: true, value: policy, diagnostics: [] });
    expect(validatePolicy(without(policy, "extensions")).ok).toBe(true);
  });

  it("accepts a bounded v2 offline-write policy only for an explicit mutation target", () => {
    const result = validatePolicy({
      ...policy,
      schemaVersion: 2,
      resources: [{ pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
      offlineWrites: {
        enabled: true,
        maxEntries: 10,
        maxTotalBodyBytes: 4096,
        targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1024 }],
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects offline-write configuration that is inconsistent with its enabled state", () => {
    expectRejected(
      validatePolicy({
        ...policy,
        schemaVersion: 2,
        offlineWrites: { enabled: false, maxEntries: 1, maxTotalBodyBytes: 0, targets: [] },
      }),
      [["offline-write.disabled-configuration", "/offlineWrites"]],
    );
    expectRejected(
      validatePolicy({
        ...policy,
        schemaVersion: 2,
        offlineWrites: { enabled: true, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
      }),
      [
        ["offline-write.enabled-configuration", "/offlineWrites/maxEntries"],
        ["offline-write.enabled-configuration", "/offlineWrites/maxTotalBodyBytes"],
        ["offline-write.target-required", "/offlineWrites/targets"],
      ],
    );
  });

  it("rejects duplicate offline-write target IDs and decoded path prefixes", () => {
    expectRejected(
      validatePolicy({
        ...policy,
        schemaVersion: 2,
        offlineWrites: {
          enabled: true,
          maxEntries: 10,
          maxTotalBodyBytes: 4096,
          targets: [
            { id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1024 },
            { id: "submit-order", pathPrefix: "/api/%6Frders", maxBodyBytes: 1024 },
          ],
        },
      }),
      [
        ["offline-write.duplicate-target-id", "/offlineWrites/targets/1/id"],
        ["offline-write.duplicate-target-path", "/offlineWrites/targets/1/pathPrefix"],
      ],
    );
  });

  it("bounds offline-write queue and body capacities", () => {
    expectRejected(
      validatePolicy({
        ...policy,
        schemaVersion: 2,
        offlineWrites: {
          enabled: true,
          maxEntries: 51,
          maxTotalBodyBytes: 524_289,
          targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 16_385 }],
        },
      }),
      [
        ["schema.invalid-value", "/offlineWrites/maxEntries"],
        ["schema.invalid-value", "/offlineWrites/maxTotalBodyBytes"],
        ["schema.invalid-value", "/offlineWrites/targets/0/maxBodyBytes"],
      ],
    );
  });

  const disabledOfflineWrites = { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] };
  const v3Policy = (runtimeCache: Record<string, unknown>) => ({
    ...policy,
    schemaVersion: 3,
    offlineWrites: disabledOfflineWrites,
    runtimeCache,
  });

  it("accepts a bounded v3 runtime-cache policy at every limit boundary", () => {
    expect(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 200, maxEntryBytes: 1_048_576, maxAgeSeconds: 604_800 })).ok,
    ).toBe(true);
    expect(validatePolicy(v3Policy({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60 })).ok).toBe(true);
    expect(
      validatePolicy(v3Policy({ enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 })).ok,
    ).toBe(true);
  });

  it("rejects runtime-cache limits outside their bounds", () => {
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 201, maxEntryBytes: 1, maxAgeSeconds: 60 })),
      [["schema.invalid-value", "/runtimeCache/maxEntries"]],
    );
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 1, maxEntryBytes: 1_048_577, maxAgeSeconds: 60 })),
      [["schema.invalid-value", "/runtimeCache/maxEntryBytes"]],
    );
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 59 })),
      [["schema.invalid-value", "/runtimeCache/maxAgeSeconds"]],
    );
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 604_801 })),
      [["schema.invalid-value", "/runtimeCache/maxAgeSeconds"]],
    );
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 1.5, maxEntryBytes: 1, maxAgeSeconds: 60 })),
      [["schema.invalid-value", "/runtimeCache/maxEntries"]],
    );
  });

  it("rejects runtime-cache configuration inconsistent with its enabled state", () => {
    expectRejected(
      validatePolicy(v3Policy({ enabled: false, maxEntries: 1, maxEntryBytes: 0, maxAgeSeconds: 0 })),
      [["runtime-cache.disabled-configuration", "/runtimeCache"]],
    );
    expectRejected(
      validatePolicy(v3Policy({ enabled: true, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 })),
      [
        ["runtime-cache.enabled-configuration", "/runtimeCache/maxEntries"],
        ["runtime-cache.enabled-configuration", "/runtimeCache/maxEntryBytes"],
        ["runtime-cache.enabled-configuration", "/runtimeCache/maxAgeSeconds"],
      ],
    );
  });

  it("closes the v3 shape and requires runtimeCache", () => {
    expectRejected(
      validatePolicy({ ...v3Policy({ enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 }), extraField: true }),
      [["schema.unknown-field", ""]],
    );
    expectRejected(
      validatePolicy(without(v3Policy({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60 }), "runtimeCache")),
      [["schema.missing-field", "/runtimeCache"]],
    );
  });

  it("reports identity override attempts separately from other unknown fields", () => {
    expectRejected(validatePolicy({ ...policy, scope: "/", identity, workbox: {} }), [
      ["policy.identity-override", "/identity"],
      ["policy.identity-override", "/scope"],
      ["schema.unknown-field", ""],
    ]);
  });

  it.each(["session-data", "mutation", "stream", "unclassified"])(
    "only allows the none strategy for %s",
    (resourceClass) => {
      expect(validatePolicy(rule({ resourceClass, cache: "none" })).ok).toBe(true);
      expectRejected(validatePolicy(rule({ resourceClass, cache: "network-first" })), [
        ["policy.unsafe-cache-strategy", "/resources/0/cache"],
      ]);
    },
  );

  it.each(["asset", "navigation-public-static", "navigation-public-dynamic", "public-data"])(
    "allows caching strategies for %s",
    (resourceClass) => {
      expect(validatePolicy(rule({ resourceClass, cache: "stale-while-revalidate" })).ok).toBe(true);
    },
  );

  it.each(["api", "/api/", "/api/*", "/api//v1", "/api/../admin", "/api?v=1", "/api#top"])(
    "rejects the non-canonical path prefix %s",
    (pathPrefix) => {
      expectRejected(validatePolicy(rule({ pathPrefix })), [["path.invalid", "/resources/0/pathPrefix"]]);
    },
  );

  it("rejects regular expressions and callbacks in rules", () => {
    expectRejected(validatePolicy(rule({ pathPrefix: /^\/api/ })), [
      ["value.not-serializable", "/resources/0/pathPrefix"],
    ]);
    expectRejected(validatePolicy(rule({ handler: () => undefined })), [["value.not-serializable", "/resources/0"]]);
  });

  it("rejects unsupported versions, update modes, namespaces and incomplete fallbacks", () => {
    expectRejected(validatePolicy({ ...policy, schemaVersion: 4 }), [["schema.invalid-value", "/schemaVersion"]]);
    expectRejected(validatePolicy({ ...policy, updateMode: "immediate" }), [["schema.invalid-value", "/updateMode"]]);
    expectRejected(validatePolicy({ ...policy, extensions: { analytics: {} } }), [
      ["extensions.invalid-namespace", "/extensions"],
    ]);
    expectRejected(validatePolicy({ ...policy, offlineFallback: { enabled: true } }), [
      ["schema.missing-field", "/offlineFallback/path"],
    ]);
  });

  it("returns identical diagnostics for identical input", () => {
    const input = { ...policy, schemaVersion: 2, token: "x", resources: [{ pathPrefix: "api" }] };
    expect(validatePolicy(input)).toStrictEqual(validatePolicy(structuredClone(input)));
  });

  const v2Base = { ...policy, schemaVersion: 2, offlineWrites: disabledOfflineWrites };
  const v3Base = v3Policy({ enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 });

  describe("networkTimeoutSeconds", () => {
    it.each([
      ["v1", policy],
      ["v2", v2Base],
      ["v3", v3Base],
    ])("accepts the boundary values 1 and 30 on %s", (_label, base) => {
      expect(validatePolicy({ ...base, networkTimeoutSeconds: 1 }).ok).toBe(true);
      expect(validatePolicy({ ...base, networkTimeoutSeconds: 30 }).ok).toBe(true);
    });

    it.each([
      ["v1", policy],
      ["v2", v2Base],
      ["v3", v3Base],
    ])("rejects 0 and 31 on %s", (_label, base) => {
      expectRejected(validatePolicy({ ...base, networkTimeoutSeconds: 0 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
      expectRejected(validatePolicy({ ...base, networkTimeoutSeconds: 31 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
    });

    it.each([
      ["v1", policy],
      ["v2", v2Base],
      ["v3", v3Base],
    ])("rejects a non-integer 1.5 on %s", (_label, base) => {
      expectRejected(validatePolicy({ ...base, networkTimeoutSeconds: 1.5 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
    });

    it.each([
      ["v1", policy],
      ["v2", v2Base],
      ["v3", v3Base],
    ])("rejects the string \"5\" on %s (wrong type, not the value diagnostic)", (_label, base) => {
      expectRejected(validatePolicy({ ...base, networkTimeoutSeconds: "5" }), [
        ["schema.invalid-type", "/networkTimeoutSeconds"],
      ]);
    });

    it.each([
      ["v1", policy],
      ["v2", v2Base],
      ["v3", v3Base],
    ])("rejects an explicit networkTimeoutSeconds: undefined on %s (JSON-serializability check runs before the schema)", (_label, base) => {
      expectRejected(validatePolicy({ ...base, networkTimeoutSeconds: undefined }), [
        ["value.not-serializable", "/networkTimeoutSeconds"],
      ]);
    });

    it("does not echo the invalid value in the diagnostic message", () => {
      const result = validatePolicy({ ...policy, networkTimeoutSeconds: 0 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      for (const finding of result.diagnostics) {
        expect(finding.message).not.toContain("0");
      }
    });

    it("parses an absent field to a policy deep-equal to the input, with no such key", () => {
      const result = validatePolicy(policy);
      expect(result).toEqual({ ok: true, value: policy, diagnostics: [] });
      if (result.ok) expect(Object.hasOwn(result.value, "networkTimeoutSeconds")).toBe(false);
    });

    it("carries a present value through unchanged", () => {
      const withTimeout = { ...policy, networkTimeoutSeconds: 5 };
      const result = validatePolicy(withTimeout);
      expect(result).toEqual({ ok: true, value: withTimeout, diagnostics: [] });
    });
  });
});

describe("validatePlan", () => {
  it("accepts a valid plan with or without install metadata", () => {
    expect(validatePlan(plan)).toEqual({ ok: true, value: plan, diagnostics: [] });
    expect(validatePlan({ ...plan, install: null }).ok).toBe(true);
  });

  it("accepts a closed v2 offline-write plan", () => {
    expect(
      validatePlan({
        ...plan,
        schemaVersion: 2,
        planVersion: 2,
        policyVersion: 2,
        pathRules: [
          ...plan.pathRules,
          { pathPrefix: "/app/api/orders", resourceClass: "mutation", action: "deny", source: "policy" },
        ],
        offlineWrites: {
          enabled: true,
          databaseName: "pwa-offline-write:shop:production:r1",
          maxEntries: 10,
          maxTotalBodyBytes: 4096,
          targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
        },
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects offline-write plans that escape their identity database or mutation rules", () => {
    const v2 = {
      ...plan,
      schemaVersion: 2,
      planVersion: 2,
      policyVersion: 2,
      pathRules: [
        ...plan.pathRules,
        { pathPrefix: "/app/api/orders", resourceClass: "mutation", action: "deny", source: "policy" },
      ],
      offlineWrites: {
        enabled: true,
        databaseName: "pwa-offline-write:shop:production:r1",
        maxEntries: 10,
        maxTotalBodyBytes: 4096,
        targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
      },
    };
    expectRejected(
      validatePlan({ ...v2, offlineWrites: { ...v2.offlineWrites, databaseName: "pwa-offline-write:other:production:r1" } }),
      [["plan.offline-write-database-mismatch", "/offlineWrites/databaseName"]],
    );
    expectRejected(
      validatePlan({ ...v2, offlineWrites: { ...v2.offlineWrites, targets: [{ ...v2.offlineWrites.targets[0], pathPrefix: "/app/assets" }] } }),
      [["plan.offline-write-target-invalid", "/offlineWrites/targets/0/pathPrefix"]],
    );
  });

  it("rejects unsupported versions and top-level extensions", () => {
    expectRejected(validatePlan({ ...plan, planVersion: 2 }), [["schema.unsupported-version", "/planVersion"]]);
    expectRejected(validatePlan({ ...plan, extensions: { "acme.x": 1 } }), [["schema.unknown-field", ""]]);
  });

  const v3Plan = (runtimeCache: Record<string, unknown>) => ({
    ...plan,
    schemaVersion: 3,
    planVersion: 3,
    policyVersion: 3,
    offlineWrites: { enabled: false },
    runtimeCache,
  });

  it("accepts a v3 plan with runtime cache disabled or at every limit boundary", () => {
    expect(validatePlan(v3Plan({ enabled: false })).ok).toBe(true);
    expect(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789abcdef" }),
      ).ok,
    ).toBe(true);
    expect(
      validatePlan(
        v3Plan({
          enabled: true,
          maxEntries: 200,
          maxEntryBytes: 1_048_576,
          maxAgeSeconds: 604_800,
          configDigest: "0123456789abcdef",
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects v3 runtime-cache plan limits outside their bounds", () => {
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 0, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789abcdef" }),
      ),
      [["schema.invalid-value", "/runtimeCache/maxEntries"]],
    );
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 201, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789abcdef" }),
      ),
      [["schema.invalid-value", "/runtimeCache/maxEntries"]],
    );
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 0, maxAgeSeconds: 60, configDigest: "0123456789abcdef" }),
      ),
      [["schema.invalid-value", "/runtimeCache/maxEntryBytes"]],
    );
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 59, configDigest: "0123456789abcdef" }),
      ),
      [["schema.invalid-value", "/runtimeCache/maxAgeSeconds"]],
    );
    expectRejected(
      validatePlan(
        v3Plan({
          enabled: true,
          maxEntries: 1,
          maxEntryBytes: 1,
          maxAgeSeconds: 604_801,
          configDigest: "0123456789abcdef",
        }),
      ),
      [["schema.invalid-value", "/runtimeCache/maxAgeSeconds"]],
    );
  });

  it("rejects a v3 runtime-cache plan digest that is not 16 lowercase hex characters", () => {
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789ABCDEF" }),
      ),
      [["schema.invalid-value", "/runtimeCache/configDigest"]],
    );
    expectRejected(
      validatePlan(
        v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789abcde" }),
      ),
      [["schema.invalid-value", "/runtimeCache/configDigest"]],
    );
  });

  it("closes the v3 runtime-cache plan shape", () => {
    expectRejected(validatePlan({ ...v3Plan({ enabled: false }), extra: true }), [["schema.unknown-field", ""]]);
    expectRejected(
      validatePlan({ ...v3Plan({ enabled: true, maxEntries: 1, maxEntryBytes: 1, maxAgeSeconds: 60, configDigest: "0123456789abcdef", extra: true }) }),
      [["schema.unknown-field", "/runtimeCache"]],
    );
    expectRejected(validatePlan(without(v3Plan({ enabled: false }), "runtimeCache")), [
      ["schema.missing-field", "/runtimeCache"],
    ]);
  });

  it("equals the same-content v2 plan except the version fields and the added runtimeCache field", () => {
    const v2Equivalent = {
      ...plan,
      schemaVersion: 2,
      planVersion: 2,
      policyVersion: 2,
      offlineWrites: { enabled: false },
    };
    const v3 = v3Plan({ enabled: false });
    const { schemaVersion: v2Schema, planVersion: v2Plan, policyVersion: v2Policy, ...v2Rest } = v2Equivalent;
    const { schemaVersion: v3Schema, planVersion: v3PlanVersion, policyVersion: v3Policy, runtimeCache, ...v3Rest } = v3;
    void v2Schema;
    void v2Plan;
    void v2Policy;
    void v3Schema;
    void v3PlanVersion;
    void v3Policy;
    void runtimeCache;
    expect(v3Rest).toEqual(v2Rest);
    expect(validatePlan(v2Equivalent).ok).toBe(true);
    expect(validatePlan(v3).ok).toBe(true);
  });

  it("applies identity and install invariants at nested paths", () => {
    expectRejected(validatePlan({ ...plan, identity: { ...identity, serviceWorkerUrl: "/sw.js" } }), [
      ["identity.service-worker-outside-scope", "/identity/serviceWorkerUrl"],
    ]);
    expectRejected(validatePlan({ ...plan, install: { ...install, startUrl: "/other/" } }), [
      ["install.start-url-outside-scope", "/install/startUrl"],
    ]);
  });

  it("rejects caching actions for unsafe classes, escaping artifact paths and unknown diagnostic codes", () => {
    const pathRules = [{ ...plan.pathRules[0], action: "cache-first" }, ...plan.pathRules.slice(1)];
    expectRejected(validatePlan({ ...plan, pathRules }), [["policy.unsafe-cache-strategy", "/pathRules/0/action"]]);
    expectRejected(validatePlan({ ...plan, artifacts: { ...plan.artifacts, serviceWorkerFile: "../sw.js" } }), [
      ["path.invalid", "/artifacts/serviceWorkerFile"],
    ]);
    expectRejected(validatePlan({ ...plan, diagnostics: [{ ...plan.diagnostics[0], code: "made.up" }] }), [
      ["schema.invalid-value", "/diagnostics/0/code"],
    ]);
  });

  describe("networkTimeoutSeconds", () => {
    const v2Plan = { ...plan, schemaVersion: 2, planVersion: 2, policyVersion: 2, offlineWrites: { enabled: false } };
    const v3PlanBase = v3Plan({ enabled: false });

    it.each([
      ["v1", plan],
      ["v2", v2Plan],
      ["v3", v3PlanBase],
    ])("accepts the boundary values 1 and 30 on %s", (_label, base) => {
      expect(validatePlan({ ...base, networkTimeoutSeconds: 1 }).ok).toBe(true);
      expect(validatePlan({ ...base, networkTimeoutSeconds: 30 }).ok).toBe(true);
    });

    it.each([
      ["v1", plan],
      ["v2", v2Plan],
      ["v3", v3PlanBase],
    ])("rejects 0, 31 and a non-integer 1.5 on %s", (_label, base) => {
      expectRejected(validatePlan({ ...base, networkTimeoutSeconds: 0 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
      expectRejected(validatePlan({ ...base, networkTimeoutSeconds: 31 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
      expectRejected(validatePlan({ ...base, networkTimeoutSeconds: 1.5 }), [
        ["schema.invalid-value", "/networkTimeoutSeconds"],
      ]);
    });

    it.each([
      ["v1", plan],
      ["v2", v2Plan],
      ["v3", v3PlanBase],
    ])("rejects the string \"5\" on %s (wrong type)", (_label, base) => {
      expectRejected(validatePlan({ ...base, networkTimeoutSeconds: "5" }), [
        ["schema.invalid-type", "/networkTimeoutSeconds"],
      ]);
    });

    it.each([
      ["v1", plan],
      ["v2", v2Plan],
      ["v3", v3PlanBase],
    ])("rejects an explicit networkTimeoutSeconds: undefined on %s (JSON-serializability check runs before the schema)", (_label, base) => {
      expectRejected(validatePlan({ ...base, networkTimeoutSeconds: undefined }), [
        ["value.not-serializable", "/networkTimeoutSeconds"],
      ]);
    });

    it("parses an absent field to a plan deep-equal to the input, with no such key", () => {
      const result = validatePlan(plan);
      expect(result).toEqual({ ok: true, value: plan, diagnostics: [] });
      if (result.ok) expect(Object.hasOwn(result.value, "networkTimeoutSeconds")).toBe(false);
    });

    it("carries a present value through unchanged", () => {
      const withTimeout = { ...plan, networkTimeoutSeconds: 5 };
      const result = validatePlan(withTimeout);
      expect(result).toEqual({ ok: true, value: withTimeout, diagnostics: [] });
    });
  });
});

describe("hardening from the module review", () => {
  it("rejects backslash paths instead of throwing", () => {
    expectRejected(validateIdentity({ ...identity, scope: "/\\" }), [["path.invalid", "/scope"]]);
    expectRejected(
      validatePolicy({ ...policy, resources: [{ pathPrefix: "/\\", resourceClass: "asset", cache: "none" }] }),
      [["path.invalid", "/resources/0/pathPrefix"]],
    );
  });

  it("uses browser prefix semantics for URLs that must be inside the scope", () => {
    expectRejected(validateIdentity({ ...identity, serviceWorkerUrl: "/app" }), [
      ["identity.service-worker-outside-scope", "/serviceWorkerUrl"],
    ]);
    expectRejected(validateIdentity({ ...identity, manifestUrl: "/app" }), [
      ["identity.manifest-outside-scope", "/manifestUrl"],
    ]);
    expectRejected(validateInstallMetadata({ ...install, startUrl: "/app" }, identity), [
      ["install.start-url-outside-scope", "/startUrl"],
    ]);
  });

  it("rejects own __proto__ keys instead of silently dropping them", () => {
    const extensions: unknown = JSON.parse('{"__proto__":{"x":1},"acme.ok":1}');
    expectRejected(validatePolicy({ ...policy, extensions }), [["value.not-serializable", "/extensions"]]);
  });

  it("never throws for hostile inputs", () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const throwingKeys = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("trap");
        },
      },
    );
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let depth = 0; depth < 20000; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor["a"] = next;
      cursor = next;
    }
    for (const input of [revoked.proxy, throwingKeys, deep]) {
      const results = [
        validateIdentity(input),
        validateInstallMetadata(input, identity),
        validatePolicy(input),
        validatePlan(input),
      ];
      for (const result of results) expect(result.ok).toBe(false);
    }
  });

  it("orders identity override diagnostics independently of input key order", () => {
    expect(validatePolicy({ ...policy, scope: "/", appId: "x" })).toStrictEqual(
      validatePolicy({ ...policy, appId: "x", scope: "/" }),
    );
  });

  it("stops diagnostic paths at free-form maps", () => {
    expectRejected(validatePolicy({ ...policy, extensions: { scope: { path: () => 1 } } }), [
      ["value.not-serializable", "/extensions"],
    ]);
  });

  it("compares icon sizes case-insensitively and accepts loopback origins", () => {
    const icons = install.icons.map((icon) => ({ ...icon, sizes: icon.sizes.toUpperCase() }));
    expect(validateInstallMetadata({ ...install, icons }, identity).ok).toBe(true);
    expect(validateIdentity({ ...identity, origin: "http://127.0.0.1:4173" }).ok).toBe(true);
    expect(validateIdentity({ ...identity, origin: "http://[::1]:4173" }).ok).toBe(true);
  });

  it("reports a missing discriminator as a missing field", () => {
    expectRejected(validatePolicy({ ...policy, offlineFallback: {} }), [
      ["schema.missing-field", "/offlineFallback/enabled"],
    ]);
  });

  it("requires every platform baseline denial exactly once in canonical order", () => {
    const complete = plan.requestBaselineDenials;
    for (const requestBaselineDenials of [[], complete.slice(1), [...complete, "non-get"], [...complete].reverse()]) {
      expectRejected(validatePlan({ ...plan, requestBaselineDenials }), [
        ["plan.incomplete-baseline-denials", "/requestBaselineDenials"],
      ]);
    }
  });

  it("does not accept a plan that carries error diagnostics", () => {
    expectRejected(validatePlan({ ...plan, diagnostics: [{ ...plan.diagnostics[0], severity: "error" }] }), [
      ["schema.invalid-value", "/diagnostics/0/severity"],
    ]);
  });
});

describe("cache namespace consistency", () => {
  it("rejects identities whose namespace segments are not well-formed UTF-16", () => {
    expectRejected(validateIdentity({ ...identity, appId: "shop\uD800" }), [["schema.invalid-value", "/appId"]]);
    expectRejected(validateIdentity({ ...identity, cacheNamespaceSeed: "\uDC00r1" }), [
      ["schema.invalid-value", "/cacheNamespaceSeed"],
    ]);
  });

  it("requires the plan prefix to match the prefix derived from its identity", () => {
    expectRejected(validatePlan({ ...plan, cacheNamespace: { prefix: "pwa:shop:production:r2:" } }), [
      ["plan.cache-namespace-mismatch", "/cacheNamespace/prefix"],
    ]);
    expectRejected(validatePlan({ ...plan, identity: { ...identity, cacheNamespaceSeed: "r2" } }), [
      ["plan.cache-namespace-mismatch", "/cacheNamespace/prefix"],
    ]);
  });
});

describe("diagnostic path allow-list", () => {
  it("covers every field used by the v1 models", () => {
    const keys = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        if (!Array.isArray(value)) keys.add(key);
        if (key !== "extensions" && key !== "metadata") collect(child);
      }
    };
    [identity, install, policy, plan, event].forEach(collect);
    expect([...keys].filter((key) => !KNOWN_FIELDS.has(key))).toEqual([]);
  });
});
