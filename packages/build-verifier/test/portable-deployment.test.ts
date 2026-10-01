import { describe, expect, it } from "vitest";
import { compilePlan } from "@pwa-platform/core";
import type { PwaPlanV4, PwaPortableIdentity, PwaPortableOriginRegistry, PwaPolicyV3 } from "@pwa-platform/contracts";
import { requiredDeploymentPaths } from "../src/deployment.js";
import { requiredReleaseChecks, verifyReleaseGateCoverage } from "../src/release-gate.js";
import { verifyRelease } from "../src/release.js";
import { verifyReleaseOrder } from "../src/release-order.js";

const identity: PwaPortableIdentity = {
  appId: "portal", manifestId: "/", scope: "/", serviceWorkerUrl: "/sw.js",
  manifestUrl: "/manifest.webmanifest", mountPath: "/", environment: "production", cacheNamespaceSeed: "r1",
};

function plan(): PwaPlanV4 {
  const result = compilePlan({
    deployment: { kind: "portable" }, identity, install: null,
    policy: {
      schemaVersion: 3, install: { enabled: false }, offlineFallback: { enabled: false },
      updateMode: "prompt", resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
      offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
      runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
    },
    topology: { kind: "standalone-origin" },
    hostBuildOutput: {
      publicPath: "/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest",
      files: [{ path: "assets/main-12345678.js", fingerprinted: true, contentHash: "123456789abcdef" }],
    },
  });
  if (!result.ok || result.value.schemaVersion !== 4) throw new Error("portable fixture did not compile");
  return result.value;
}

const candidate = plan();
const A = "https://a.example.test";
const B = "https://b.example.test";

function evidence(origin: string) {
  return {
    targetOrigin: origin,
    responses: Object.fromEntries(requiredDeploymentPaths(candidate).map((path) => [path, {
      finalUrl: `${origin}${path}`,
      status: 200,
      headers: { "cache-control": path.includes("main-12345678") ? "public, max-age=31536000, immutable" : "no-cache" },
    }])),
  };
}

function gate(origin: string, observed = evidence(origin)) {
  return verifyRelease({
    plan: candidate,
    published: [candidate.identity.serviceWorkerUrl, candidate.identity.manifestUrl, ...candidate.precache.map((entry) => entry.url)],
    deployment: observed,
    baseline: { origin, identity },
    retention: { asOfMs: 1, previous: [], available: candidate.precache.map((entry) => entry.url) },
  });
}

describe("portable release evidence", () => {
  it("requires provenance as well as the existing complete gate checks", () => {
    expect(gate(A).ok).toBe(true);
    expect(gate(B).ok).toBe(true);
    expect(requiredReleaseChecks(candidate)).toContain("deployment-origin");
    expect(verifyReleaseGateCoverage(gate(A), requiredReleaseChecks(candidate)).ok).toBe(true);
    const missing = verifyRelease({ plan: candidate, published: [], baseline: null, retention: { asOfMs: 1, previous: [], available: [] } });
    expect(missing.ok).toBe(false);
    expect(verifyReleaseGateCoverage(missing, requiredReleaseChecks(candidate)).ok).toBe(true);
    expect(verifyReleaseGateCoverage(verifyRelease({ plan: candidate }), requiredReleaseChecks(candidate)).missing)
      .toContain("artifacts");
    expect(missing.diagnostics.map((finding) => finding.code)).toContain("verify.deployment-origin-invalid");
  });

  it("rejects A's final responses when gating B", () => {
    const result = gate(B, { ...evidence(A), targetOrigin: B });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((finding) => finding.code)).toContain("verify.deployment-response-mismatch");
  });

  it.each([204, 404])("rejects a required path that returns HTTP %i", (status) => {
    const observed = evidence(A);
    const worker = observed.responses[candidate.identity.serviceWorkerUrl];
    if (!worker) throw new Error("missing worker fixture");
    const result = gate(A, {
      ...observed,
      responses: { ...observed.responses, [candidate.identity.serviceWorkerUrl]: { ...worker, status } },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((finding) => finding.code)).toContain("verify.deployment-response-unsuccessful");
  });

  it("rejects a response record without an HTTP status", () => {
    const observed = evidence(A);
    const worker = observed.responses[candidate.identity.serviceWorkerUrl];
    if (!worker) throw new Error("missing worker fixture");
    const { status: _status, ...incomplete } = worker;
    void _status;
    const result = gate(A, {
      ...observed,
      responses: { ...observed.responses, [candidate.identity.serviceWorkerUrl]: incomplete as typeof worker },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((finding) => finding.code)).toContain("verify.deployment-response-missing");
  });

  it("rejects a missing response and cross-origin retained history", () => {
    const observed = evidence(A);
    const { [candidate.identity.serviceWorkerUrl]: _removed, ...remaining } = observed.responses;
    void _removed;
    expect(gate(A, { ...observed, responses: remaining }).diagnostics.map((finding) => finding.code))
      .toContain("verify.deployment-response-missing");
    const result = verifyRelease({ plan: candidate, deployment: observed, baseline: { origin: B, identity },
      retention: { asOfMs: 2, previous: [{ releasedAtMs: 1, plan: candidate, origin: B }], available: [] } });
    expect(result.diagnostics.map((finding) => finding.code)).toContain("verify.baseline-origin-mismatch");
    expect(result.diagnostics.map((finding) => finding.code)).toContain("verify.retention-history-invalid");
  });
});

function sharedPlans(): { root: PwaPlanV4; child: PwaPlanV4 } {
  const childIdentity: PwaPortableIdentity = {
    ...identity, appId: "portal-m", manifestId: "/m/", scope: "/m/", mountPath: "/m/",
    serviceWorkerUrl: "/m/sw.js", manifestUrl: "/m/manifest.webmanifest",
  };
  const entry = (value: PwaPortableIdentity) => ({
    appId: value.appId, scope: value.scope, serviceWorkerUrl: value.serviceWorkerUrl,
    manifestId: value.manifestId, manifestUrl: value.manifestUrl,
  });
  const registry: PwaPortableOriginRegistry = {
    schemaVersion: 2, registryVersion: 3, environment: identity.environment,
    root: entry(identity), children: [entry(childIdentity)],
  };
  const policy: PwaPolicyV3 = {
    schemaVersion: 3, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt",
    resources: [], offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
    runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
  };
  const compile = (app: PwaPortableIdentity): PwaPlanV4 => {
    const result = compilePlan({
      deployment: { kind: "portable" }, identity: app, install: null, policy,
      topology: { kind: "shared-origin", registry },
      hostBuildOutput: { publicPath: app.scope, serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
    });
    if (!result.ok || result.value.schemaVersion !== 4) throw new Error("shared fixture did not compile");
    return result.value;
  };
  return { root: compile(identity), child: compile(childIdentity) };
}

describe("portable shared origin release order", () => {
  it("requires each domain to have its own live root exclusion record", () => {
    const { root, child } = sharedPlans();
    expect(root.pathRules[0]).toMatchObject({ action: "exclude", pathPrefix: "/m" });
    expect(verifyReleaseOrder(child, root, A, A, `${A}/sw.js`).ok).toBe(true);
    expect(verifyReleaseOrder(child, root, B, A, `${A}/sw.js`).ok).toBe(false);
    expect(verifyReleaseOrder(child, root, B, B, `${B}/sw.js`).ok).toBe(true);
    expect(verifyReleaseOrder(child, root, B, B, `${A}/sw.js`).ok).toBe(false);
    expect(verifyRelease({ plan: child, deployment: { targetOrigin: B, responses: {} }, deployedRoot: { origin: A, plan: root, workerFinalUrl: `${A}/sw.js` } })
      .checks.find((check) => check.name === "release-order")?.ok).toBe(false);
  });
});
