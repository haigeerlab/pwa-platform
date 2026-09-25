import { REQUEST_BASELINE_DENIALS, validatePlan } from "@pwa-platform/contracts";
import type { PwaPlan, PwaPlanV3, PwaValidationResult } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";
import { input } from "./fixtures.js";

function assertPlanV3(plan: PwaPlan): asserts plan is PwaPlanV3 {
  if (plan.schemaVersion !== 3) throw new Error(`expected a v3 plan, got schemaVersion ${plan.schemaVersion}`);
}

// Invalid inputs are part of the contract, so tests call through an `unknown`-typed alias.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

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

const host = input.hostBuildOutput;
const withHost = (patch: Record<string, unknown>): unknown => ({ ...input, hostBuildOutput: { ...host, ...patch } });
const withFile = (patch: Record<string, unknown>): unknown => withHost({ files: [{ ...host.files[0], ...patch }] });

describe("compilePlan: minimal plan", () => {
  it("compiles a policy without rules or fallback into a plan that contracts accept", () => {
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(validatePlan(result.value).ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      schemaVersion: 1,
      planVersion: 1,
      policyVersion: 1,
      identity: input.identity,
      install: input.install,
      hostBuildOutput: { publicPath: "/app/" },
      topology: { kind: "standalone-origin" },
      artifacts: { serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest" },
      precache: [],
      cacheNamespace: { prefix: "pwa:shop:production:r1:" },
      requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
      pathRules: [],
      offlineFallback: { enabled: false },
      updateMode: "prompt",
      diagnostics: [],
    });
  });

  it("is deterministic", () => {
    expect(JSON.stringify(compile(input))).toBe(JSON.stringify(compile(structuredClone(input))));
  });
});

describe("compilePlan: install switch", () => {
  it("omits install metadata when install is disabled", () => {
    const result = compile({ ...input, policy: { ...input.policy, install: { enabled: false } } });
    expect(result.ok && result.value.install).toBeNull();
  });

  it("requires install metadata when install is enabled", () => {
    expectRejected(compile({ ...input, install: null }), [["compile.install-metadata-missing", "/install"]]);
  });

  it("carries install warnings into the result and the plan", () => {
    const install = { ...input.install, themeColor: "rebeccapurple" };
    const result = compile({ ...input, install });
    expect(findings(result)).toEqual([["install.invalid-color", "/install/themeColor"]]);
    expect(result.ok && result.value.diagnostics.map((finding) => finding.path)).toEqual(["/install/themeColor"]);
  });
});

describe("compilePlan: input validation", () => {
  it("prefixes contracts diagnostics with the input field", () => {
    expectRejected(compile({ ...input, identity: { ...input.identity, scope: "app/" } }), [
      ["path.invalid", "/identity/scope"],
    ]);
    // A v3 policy also requires offlineWrites and runtimeCache (T2); this input supplies neither.
    expectRejected(compile({ ...input, policy: { ...input.policy, schemaVersion: 3 } }), [
      ["schema.missing-field", "/policy/offlineWrites"],
      ["schema.missing-field", "/policy/runtimeCache"],
    ]);
    expectRejected(compile({ ...input, install: { ...input.install, startUrl: "/other/" } }), [
      ["install.start-url-outside-scope", "/install/startUrl"],
    ]);
  });

  it("compiles a reviewed offline-write policy into a v2 runtime plan", () => {
    const result = compile({
        ...input,
        policy: {
          ...input.policy,
          schemaVersion: 2,
          resources: [{ pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
          offlineWrites: {
            enabled: true,
            maxEntries: 1,
            maxTotalBodyBytes: 1,
            targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1 }],
          },
        },
      });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      schemaVersion: 2,
      planVersion: 2,
      policyVersion: 2,
      offlineWrites: {
        enabled: true,
        databaseName: "pwa-offline-write:shop:production:r1",
        maxEntries: 1,
        maxTotalBodyBytes: 1,
        targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1 }],
      },
    });
  });

  it("rejects an offline-write target outside mutation rules", () => {
    expectRejected(
      compile({
        ...input,
        policy: {
          ...input.policy,
          schemaVersion: 2,
          resources: [{ pathPrefix: "/api/orders", resourceClass: "public-data", cache: "none" }],
          offlineWrites: { enabled: true, maxEntries: 1, maxTotalBodyBytes: 1, targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1 }] },
        },
      }),
      [["compile.offline-write-target-invalid", "/policy/offlineWrites/targets/0/pathPrefix"]],
    );
  });
});

describe("compilePlan: v3 runtime cache", () => {
  const disabledOfflineWrites = { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] };
  const v3Policy = (patch: Record<string, unknown>) => ({
    ...input.policy,
    schemaVersion: 3,
    offlineWrites: disabledOfflineWrites,
    runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
    ...patch,
  });

  it("compiles a v3 policy into a v3 plan, never falling through to v1", () => {
    const result = compile({ ...input, policy: v3Policy({}) });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      schemaVersion: 3,
      planVersion: 3,
      policyVersion: 3,
      offlineWrites: { enabled: false },
      runtimeCache: { enabled: false },
    });
    expect(result.ok && validatePlan(result.value).ok).toBe(true);
  });

  it("produces a v3 enabled=false plan identical to the same-content v2 plan except the version fields and runtimeCache", () => {
    const v2Result = compile({ ...input, policy: { ...input.policy, schemaVersion: 2, offlineWrites: disabledOfflineWrites } });
    const v3Result = compile({ ...input, policy: v3Policy({}) });
    expect(v2Result.ok).toBe(true);
    expect(v3Result.ok).toBe(true);
    if (!v2Result.ok || !v3Result.ok) return;
    assertPlanV3(v3Result.value);
    const { schemaVersion: v2Schema, planVersion: v2PlanVersion, policyVersion: v2PolicyVersion, ...v2Rest } = v2Result.value;
    const { schemaVersion: v3Schema, planVersion: v3PlanVersion, policyVersion: v3PolicyVersion, runtimeCache, ...v3Rest } = v3Result.value;
    void v2Schema;
    void v2PlanVersion;
    void v2PolicyVersion;
    void v3Schema;
    void v3PlanVersion;
    void v3PolicyVersion;
    expect(runtimeCache).toEqual({ enabled: false });
    expect(v3Rest).toEqual(v2Rest);
  });

  it("compiles an enabled runtime cache policy's executable rules into a plan with a configDigest", () => {
    const result = compile({
      ...input,
      policy: v3Policy({
        resources: [{ pathPrefix: "/data", resourceClass: "public-data", cache: "network-first" }],
        runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 4096, maxAgeSeconds: 120 },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertPlanV3(result.value);
    expect(result.value.runtimeCache).toEqual({
      enabled: true,
      maxEntries: 50,
      maxEntryBytes: 4096,
      maxAgeSeconds: 120,
      configDigest: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(validatePlan(result.value).ok).toBe(true);
  });

  it("rejects an unsupported runtime cache strategy", () => {
    expectRejected(
      compile({
        ...input,
        policy: v3Policy({
          resources: [{ pathPrefix: "/data", resourceClass: "public-data", cache: "cache-first" }],
          runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 4096, maxAgeSeconds: 120 },
        }),
      }),
      [["compile.runtime-strategy-unsupported", "/policy/resources/0/cache"]],
    );
  });

  it("warns when runtime cache is enabled but no rule can execute it", () => {
    const result = compile({
      ...input,
      policy: v3Policy({ runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 4096, maxAgeSeconds: 120 } }),
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "compile.runtime-cache-unused", path: "/policy/runtimeCache" }),
    ]);
  });

  it("rejects unsupported topologies", () => {
    expectRejected(compile({ ...input, topology: { kind: "shared-origin" } }), [
      ["compile.unsupported-topology", "/topology"],
    ]);
  });

  it.each([
    ["a public path outside the scope", withHost({ publicPath: "/other/" }), "compile.public-path-outside-scope", "/hostBuildOutput/publicPath"],
    ["a relative public path", withHost({ publicPath: "app/" }), "compile.invalid-host-output", "/hostBuildOutput/publicPath"],
    ["a public path without a trailing slash", withHost({ publicPath: "/app" }), "compile.invalid-host-output", "/hostBuildOutput/publicPath"],
    ["an escaping worker file", withHost({ serviceWorkerFile: "../sw.js" }), "compile.invalid-host-output", "/hostBuildOutput/serviceWorkerFile"],
    ["an absolute manifest file", withHost({ manifestFile: "/manifest.webmanifest" }), "compile.invalid-host-output", "/hostBuildOutput/manifestFile"],
    ["files that are not an array", withHost({ files: {} }), "compile.invalid-host-output", "/hostBuildOutput/files"],
    ["an absolute file path", withFile({ path: "/index.html" }), "compile.invalid-host-output", "/hostBuildOutput/files/0/path"],
    ["a file path that is not URL-canonical", withFile({ path: "my page.html" }), "compile.invalid-host-output", "/hostBuildOutput/files/0/path"],
    ["a non-boolean fingerprint flag", withFile({ fingerprinted: "yes" }), "compile.invalid-host-output", "/hostBuildOutput/files/0/fingerprinted"],
    ["a short content hash", withFile({ contentHash: "abc" }), "compile.invalid-host-output", "/hostBuildOutput/files/0/contentHash"],
    ["a content hash with unsafe characters", withFile({ contentHash: "a1b2/c3d4+e5=" }), "compile.invalid-host-output", "/hostBuildOutput/files/0/contentHash"],
    ["an unknown file field", withFile({ size: 12 }), "compile.invalid-host-output", "/hostBuildOutput/files/0"],
    ["an unknown host output field", withHost({ outDir: "dist" }), "compile.invalid-host-output", "/hostBuildOutput"],
  ] as const)("rejects %s", (_name, candidate, code, path) => {
    expectRejected(compile(candidate), [[code, path]]);
  });

  it("rejects duplicate build file paths", () => {
    const files = [host.files[0], { ...host.files[1], path: host.files[0]!.path }];
    expectRejected(compile(withHost({ files })), [["compile.invalid-host-output", "/hostBuildOutput/files/1/path"]]);
  });

  it("validates the envelope without echoing unknown keys", () => {
    expectRejected(compile(null), [["schema.invalid-type", ""]]);
    expectRejected(compile(without(input, "hostBuildOutput")), [["schema.missing-field", "/hostBuildOutput"]]);
    const result = compile({ ...input, tok_SECRET_value: "x" });
    expectRejected(result, [["schema.unknown-field", ""]]);
    expect(JSON.stringify(result)).not.toContain("tok_SECRET");
  });

  it("reports every invalid input field in a stable order", () => {
    expectRejected(
      compile({ ...input, identity: { ...input.identity, scope: "app/" }, topology: { kind: "shared-origin" } }),
      [
        ["path.invalid", "/identity/scope"],
        ["compile.unsupported-topology", "/topology"],
      ],
    );
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
    for (const candidate of [revoked.proxy, throwingKeys, { ...input, hostBuildOutput: deep }, { ...input, policy: deep }]) {
      expect(compile(candidate).ok).toBe(false);
    }
  });
});

describe("compilePlan: networkTimeoutSeconds", () => {
  it("omits the key from the plan when the policy does not set it", () => {
    const result = compile(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "networkTimeoutSeconds")).toBe(false);
  });

  it("carries a present value through to the plan unchanged", () => {
    const result = compile({ ...input, policy: { ...input.policy, networkTimeoutSeconds: 5 } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.networkTimeoutSeconds).toBe(5);
  });

  it("rejects an out-of-range value with the contracts diagnostic, prefixed by /policy", () => {
    expectRejected(compile({ ...input, policy: { ...input.policy, networkTimeoutSeconds: 31 } }), [
      ["schema.invalid-value", "/policy/networkTimeoutSeconds"],
    ]);
    expectRejected(compile({ ...input, policy: { ...input.policy, networkTimeoutSeconds: 0 } }), [
      ["schema.invalid-value", "/policy/networkTimeoutSeconds"],
    ]);
  });
});
