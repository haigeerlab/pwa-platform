// assembleReleaseInput is exercised against the real build-verifier checks (via runChecks) wherever the assertion
// is really about what build-verifier concludes from the assembled input (a missing baseline, an omitted retention
// property), not just about the shape assembleReleaseInput itself produces.
import { readFileSync } from "node:fs";
import type { PwaPlan } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { assembleReleaseInput, type PwaReleaseHistoryEntry } from "../assemble.ts";
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
 * Compliant headers for every public HTML path the fixture plan names (mount path, install start URL, and the
 * offline fallback page — also the plan's one revisioned `.html` precache entry, deduped against the offline
 * fallback field): `html-headers` runs on every assembled input now (module spec, "两个组装变体的输入总带
 * htmlObserved 属性"), so `baseArgs` must satisfy it for the many tests below that expect `report.ok`/`coverage.ok`
 * to stay true for reasons unrelated to HTML headers.
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
};

describe("assembleReleaseInput / baseline", () => {
  it("is present when found, and the checker accepts it", () => {
    const { input } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("c", 100)],
      candidateDeploymentId: "c",
    });
    expect(Object.hasOwn(input, "baseline")).toBe(true);
    const { report } = runChecks(input, ["identity-baseline"]);
    expect(report.ok).toBe(true);
  });

  it("is present (as undefined) when not found, and build-verifier reports verify.baseline-missing", () => {
    const { input } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: false },
      history: [entry("c", 100)],
      candidateDeploymentId: "c",
    });
    expect(Object.hasOwn(input, "baseline")).toBe(true);
    expect(input.baseline).toBeUndefined();
    const { report } = runChecks(input, ["identity-baseline"]);
    expect(report.ok).toBe(false);
    expect(report.diagnostics.map(({ code }) => code)).toEqual(["verify.baseline-missing"]);
  });
});

describe("assembleReleaseInput / history", () => {
  it("orders a complete history's previous entries newest to oldest, excluding the candidate", () => {
    const { input, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("a", 10), entry("c", 30), entry("b", 20)],
      candidateDeploymentId: "c",
    });

    expect(history).toEqual({
      complete: true,
      candidateFound: true,
      candidateIsNewest: true,
      missingPlans: [],
      inconsistencies: [],
    });
    expect(Object.hasOwn(input, "retention")).toBe(true);
    expect(input.retention?.previous.map(({ releasedAtMs }) => releasedAtMs)).toEqual([20, 10]);
  });

  it("treats an empty previous list as legitimate when the candidate is the only deployment", () => {
    const { input, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("c", 100)],
      candidateDeploymentId: "c",
    });

    expect(history.complete).toBe(true);
    expect(input.retention).toEqual({ asOfMs: baseArgs.asOfMs, previous: [], available });
  });

  it("does not include retention, and marks history incomplete, when a previous deployment lacks a plan", () => {
    const { input, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("a", 10, { plan: null, missingReason: "local bundle not found" }), entry("c", 30)],
      candidateDeploymentId: "c",
    });

    expect(history.complete).toBe(false);
    expect(history.missingPlans).toEqual([{ deploymentId: "a", reason: "local bundle not found" }]);
    expect(Object.hasOwn(input, "retention")).toBe(false);

    // Proof the retention check was never invoked with an empty or truncated history: it does not appear in the
    // report at all (an omitted check, not a failed one), and coverage reports it missing rather than performed.
    const { report, coverage } = runChecks(input, [
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-retention",
      "html-headers",
    ]);
    expect(report.checks.map(({ name }) => name)).not.toContain("release-retention");
    expect(coverage.ok).toBe(false);
    expect(coverage.missing).toEqual(["release-retention"]);
  });

  it("defaults the missing-plan reason when the entry carries no missingReason", () => {
    const { history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("a", 10, { plan: null }), entry("c", 30)],
      candidateDeploymentId: "c",
    });
    expect(history.missingPlans).toEqual([{ deploymentId: "a", reason: "deployment lacks a saved plan" }]);
  });

  it("is incomplete, with retention omitted, when the candidate is not in the history", () => {
    const { input, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("a", 10), entry("b", 20)],
      candidateDeploymentId: "c",
    });
    expect(history).toEqual({
      complete: false,
      candidateFound: false,
      candidateIsNewest: false,
      missingPlans: [],
      inconsistencies: [{ deploymentId: "c", reason: "candidate deployment is not present in the history" }],
    });
    expect(Object.hasOwn(input, "retention")).toBe(false);
  });

  it("is incomplete, with retention omitted, when the candidate is not the newest entry", () => {
    const { input, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("c", 10), entry("a", 20)],
      candidateDeploymentId: "c",
    });
    expect(history).toEqual({
      complete: false,
      candidateFound: true,
      candidateIsNewest: false,
      missingPlans: [],
      inconsistencies: [{ deploymentId: "a", reason: "deployedAtMs is not strictly older than the candidate" }],
    });
    expect(Object.hasOwn(input, "retention")).toBe(false);
  });
});

describe("assembleReleaseInput / history entries that cannot be ordered", () => {
  // The invariant this section pins down: EVERY entry other than the candidate must end up in `previous`, or the
  // whole history is incomplete. A comparison that cannot decide "older" vs "not older" (a tied timestamp, a NaN)
  // must never let that entry silently disappear from `previous` while the rest of the history is still accepted.
  const requiredChecks = ["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers"] as const;

  function assertRejectedAsIncomplete(history: readonly PwaReleaseHistoryEntry[]): void {
    const { input, history: outcome } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history,
      candidateDeploymentId: "c",
    });

    expect(outcome.complete).toBe(false);
    expect(Object.hasOwn(input, "retention")).toBe(false);

    const { report, coverage } = runChecks(input, requiredChecks);
    expect(report.checks.map(({ name }) => name)).not.toContain("release-retention");
    expect(coverage.missing).toContain("release-retention");
  }

  it("rejects a tie: a non-candidate entry sharing the candidate's exact timestamp", () => {
    assertRejectedAsIncomplete([entry("c", 1000), entry("old-no-plan", 1000, { plan: null })]);
  });

  it("rejects a NaN timestamp on the candidate itself", () => {
    assertRejectedAsIncomplete([entry("c", Number.NaN), entry("old-no-plan", 500, { plan: null })]);
  });

  it("rejects a NaN timestamp on an older entry", () => {
    assertRejectedAsIncomplete([entry("c", 1000), entry("old-no-plan", Number.NaN)]);
  });

  it("rejects a history with duplicate deploymentIds on two non-candidate entries", () => {
    assertRejectedAsIncomplete([entry("c", 1000), entry("dup", 500), entry("dup", 400)]);
  });

  it("rejects a history where the candidate's own deploymentId appears twice", () => {
    assertRejectedAsIncomplete([entry("c", 1000), entry("c", 900), entry("old-no-plan", 500)]);
  });
});

describe("assembleReleaseInput / requiredChecks", () => {
  it("returns the five standalone/root checks for the fixture plan", () => {
    const { requiredChecks } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("c", 100)],
      candidateDeploymentId: "c",
    });
    expect(requiredChecks).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-retention",
      "html-headers",
    ]);
  });
});

describe("assembleReleaseInput / an end-to-end pass", () => {
  it("passes every check when published, headers, baseline and history are all complete", () => {
    const { input, requiredChecks, history } = assembleReleaseInput({
      ...baseArgs,
      baseline: { found: true, value: { ...plan.identity } },
      history: [entry("c", 100)],
      candidateDeploymentId: "c",
    });
    const { report, coverage } = runChecks(input, requiredChecks);
    expect(report.ok).toBe(true);
    expect(coverage.ok).toBe(true);
    expect(history.complete).toBe(true);
  });
});
