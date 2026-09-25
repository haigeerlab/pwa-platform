// assemblePreDeployInput is exercised against the real build-verifier checks (via runChecks) wherever the
// assertion is really about what build-verifier concludes from the assembled input, matching assemble.test.ts's
// own convention for assembleReleaseInput.
import { readFileSync } from "node:fs";
import type { PwaPlan } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { assemblePreDeployInput, assembleReleaseInput, type PwaReleaseHistoryEntry } from "../assemble.ts";
import { runChecks } from "../run-checks.ts";

const plan = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as PwaPlan;

const publishedPaths = [...plan.precache.map(({ url }) => url), plan.identity.serviceWorkerUrl, plan.identity.manifestUrl];

const observed = {
  [plan.identity.serviceWorkerUrl]: { "cache-control": "no-cache" },
  [plan.identity.manifestUrl]: { "cache-control": "no-cache" },
  ...Object.fromEntries(
    plan.precache
      .filter(({ revision }) => revision === null)
      .map(({ url }) => [url, { "cache-control": "public, max-age=31536000, immutable" }]),
  ),
};

const available = plan.precache.filter(({ revision }) => revision === null).map(({ url }) => url);

/**
 * Compliant headers for every public HTML path the fixture plan names — same fixture and same rationale as
 * assemble.test.ts's own `htmlObserved`: `html-headers` now always runs (module spec, "两个组装变体的输入总带
 * htmlObserved 属性"), so `baseArgs` must satisfy it for the tests below whose `report.ok`/`coverage.ok`
 * expectations are about history and baseline, not about HTML headers.
 */
const htmlObserved = {
  [plan.identity.mountPath]: { "cache-control": "no-cache" },
  "/app/": { "cache-control": "no-cache" },
  "/app/offline.html": { "cache-control": "no-cache" },
};

/** A history entry whose plan is the fixture plan itself: same release line, same fingerprinted paths as `available`. */
function entry(deploymentId: string, deployedAtMs: number, overrides: Partial<PwaReleaseHistoryEntry> = {}): PwaReleaseHistoryEntry {
  return { deploymentId, deployedAtMs, plan, ...overrides };
}

const baseArgs = {
  plan,
  publishedPaths,
  observed,
  htmlObserved,
  asOfMs: 1_000,
  available,
  baseline: { found: true, value: { ...plan.identity } } as const,
};

const requiredChecks = ["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers"] as const;

describe("assemblePreDeployInput / history", () => {
  it("treats every production deployment as a previous release, ordered newest to oldest", () => {
    const { input, history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10), entry("c", 30), entry("b", 20)],
    });

    expect(history).toEqual({ complete: true, missingPlans: [], inconsistencies: [] });
    expect(Object.hasOwn(input, "retention")).toBe(true);
    expect(input.retention?.previous.map(({ releasedAtMs }) => releasedAtMs)).toEqual([30, 20, 10]);

    const { report, coverage } = runChecks(input, requiredChecks);
    expect(report.checks.map(({ name }) => name)).toContain("release-retention");
    expect(coverage.ok).toBe(true);
  });

  it("does not include retention, and marks history incomplete, when any deployment lacks a plan", () => {
    const { input, history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10, { plan: null, missingReason: "local bundle not found" }), entry("c", 30)],
    });

    expect(history.complete).toBe(false);
    expect(history.missingPlans).toEqual([{ deploymentId: "a", reason: "local bundle not found" }]);
    expect(Object.hasOwn(input, "retention")).toBe(false);

    // Proof the retention check was never invoked with an empty or truncated history.
    const { report, coverage } = runChecks(input, requiredChecks);
    expect(report.checks.map(({ name }) => name)).not.toContain("release-retention");
    expect(coverage.ok).toBe(false);
    expect(coverage.missing).toEqual(["release-retention"]);
  });

  it("is incomplete, with retention omitted, when a deployedAtMs is NaN", () => {
    const { input, history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10), entry("b", Number.NaN)],
    });
    expect(history.complete).toBe(false);
    expect(history.inconsistencies).toEqual([{ deploymentId: "b", reason: "deployedAtMs is not a finite number" }]);
    expect(Object.hasOwn(input, "retention")).toBe(false);
  });

  it("is incomplete, with retention omitted, when a deployedAtMs is Infinity", () => {
    const { history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10), entry("b", Number.POSITIVE_INFINITY)],
    });
    expect(history.complete).toBe(false);
    expect(history.inconsistencies).toEqual([{ deploymentId: "b", reason: "deployedAtMs is not a finite number" }]);
  });

  it("is incomplete when deployedAtMs arrives as a numeric string rather than a number", () => {
    const { history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10), { deploymentId: "b", deployedAtMs: "20" as unknown as number, plan }],
    });
    expect(history.complete).toBe(false);
    expect(history.inconsistencies).toEqual([{ deploymentId: "b", reason: "deployedAtMs is not a finite number" }]);
  });

  it("is incomplete, with retention omitted, when a deploymentId is duplicated", () => {
    const { input, history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("dup", 10), entry("dup", 20)],
    });
    expect(history.complete).toBe(false);
    expect(history.inconsistencies).toEqual([{ deploymentId: "dup", reason: "deploymentId occurs more than once in the history" }]);
    expect(Object.hasOwn(input, "retention")).toBe(false);
  });

  it("defaults the missing-plan reason when the entry carries no missingReason", () => {
    const { history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10, { plan: null })],
    });
    expect(history.missingPlans).toEqual([{ deploymentId: "a", reason: "deployment lacks a saved plan" }]);
  });

  // Safer-default judgment call (module spec is silent on this case, see assemble.ts's resolvePreDeployHistory
  // doc comment): an empty history is ambiguous between "genuine first release" and "missing export data", so it
  // is treated as incomplete rather than as a legitimate empty `previous`.
  it("treats an empty history as incomplete rather than as a genuine first release", () => {
    const { input, history } = assemblePreDeployInput({ ...baseArgs, history: [] });
    expect(history.complete).toBe(false);
    expect(history.missingPlans).toEqual([]);
    expect(history.inconsistencies).toHaveLength(1);
    expect(history.inconsistencies[0]?.reason).toMatch(/cannot distinguish a genuine first release/);
    expect(Object.hasOwn(input, "retention")).toBe(false);

    const { report, coverage } = runChecks(input, requiredChecks);
    expect(report.checks.map(({ name }) => name)).not.toContain("release-retention");
    expect(coverage.missing).toContain("release-retention");
  });
});

describe("assemblePreDeployInput / an end-to-end pass", () => {
  it("passes every check when published, headers, baseline and history are all complete", () => {
    const { input, requiredChecks: picked, history } = assemblePreDeployInput({
      ...baseArgs,
      history: [entry("a", 10), entry("b", 20)],
    });
    const { report, coverage } = runChecks(input, picked);
    expect(report.ok).toBe(true);
    expect(coverage.ok).toBe(true);
    expect(history.complete).toBe(true);
  });
});

describe("assemblePreDeployInput / shared history rules with assembleReleaseInput", () => {
  // Regression test proving both variants route through the same consistency helper: the same malformed history
  // (a NaN timestamp and a duplicate id) yields the exact same inconsistency reasons from both, whether or not a
  // candidate is present.
  it("reports the same inconsistency reasons for the same malformed entries in both variants", () => {
    const malformed = [entry("a", Number.NaN), entry("dup", 500), entry("dup", 400)];

    const { history: preDeployHistory } = assemblePreDeployInput({ ...baseArgs, history: malformed });

    const { history: postDeployHistory } = assembleReleaseInput({
      ...baseArgs,
      history: [...malformed, entry("c", 1000)],
      candidateDeploymentId: "c",
    });

    const reasonsFor = (deploymentId: string, inconsistencies: readonly { deploymentId: string; reason: string }[]) =>
      inconsistencies.filter((entry) => entry.deploymentId === deploymentId).map((entry) => entry.reason);

    expect(reasonsFor("a", preDeployHistory.inconsistencies)).toEqual(reasonsFor("a", postDeployHistory.inconsistencies));
    expect(reasonsFor("dup", preDeployHistory.inconsistencies)).toEqual(reasonsFor("dup", postDeployHistory.inconsistencies));
  });
});
