import type { PwaReleaseGateCoverage, PwaVerificationReport } from "@pwa-platform/build-verifier";
import { describe, expect, it } from "vitest";
import type { PwaReleaseHistoryOutcome } from "../assemble.ts";
import { decideVerdict } from "../verdict.ts";

const passingReport: PwaVerificationReport = { ok: true, checks: [], diagnostics: [] };
const failingReport: PwaVerificationReport = {
  ok: false,
  checks: [{ name: "artifacts", ok: false, diagnostics: [] }],
  diagnostics: [],
};

const passingCoverage: PwaReleaseGateCoverage = { ok: true, missing: [] };
const failingCoverage: PwaReleaseGateCoverage = { ok: false, missing: ["release-retention"] };

const completeHistory: PwaReleaseHistoryOutcome = {
  complete: true,
  candidateFound: true,
  candidateIsNewest: true,
  missingPlans: [],
  inconsistencies: [],
};
const incompleteHistory: PwaReleaseHistoryOutcome = {
  complete: false,
  candidateFound: true,
  candidateIsNewest: true,
  missingPlans: [{ deploymentId: "a", reason: "no plan" }],
  inconsistencies: [],
};
const unorderableHistory: PwaReleaseHistoryOutcome = {
  complete: false,
  candidateFound: true,
  candidateIsNewest: false,
  missingPlans: [],
  inconsistencies: [{ deploymentId: "b", reason: "deployedAtMs is not strictly older than the candidate" }],
};

describe("decideVerdict", () => {
  it("passes only when the report, coverage and history are all ok", () => {
    const verdict = decideVerdict(passingReport, passingCoverage, completeHistory);
    expect(verdict).toEqual({
      reportOk: true,
      coverageOk: true,
      coverageMissing: [],
      historyComplete: true,
      missingPlanDeploymentIds: [],
      historyInconsistencies: [],
      pass: true,
    });
  });

  it("fails when only the report is not ok", () => {
    const verdict = decideVerdict(failingReport, passingCoverage, completeHistory);
    expect(verdict.reportOk).toBe(false);
    expect(verdict.coverageOk).toBe(true);
    expect(verdict.historyComplete).toBe(true);
    expect(verdict.pass).toBe(false);
  });

  it("fails when only the coverage is not ok", () => {
    const verdict = decideVerdict(passingReport, failingCoverage, completeHistory);
    expect(verdict.reportOk).toBe(true);
    expect(verdict.coverageOk).toBe(false);
    expect(verdict.coverageMissing).toEqual(["release-retention"]);
    expect(verdict.historyComplete).toBe(true);
    expect(verdict.pass).toBe(false);
  });

  it("fails when only the history is incomplete, and names the deployments lacking a plan", () => {
    const verdict = decideVerdict(passingReport, passingCoverage, incompleteHistory);
    expect(verdict.reportOk).toBe(true);
    expect(verdict.coverageOk).toBe(true);
    expect(verdict.historyComplete).toBe(false);
    expect(verdict.missingPlanDeploymentIds).toEqual(["a"]);
    expect(verdict.pass).toBe(false);
  });

  it("fails when all three are not ok", () => {
    const verdict = decideVerdict(failingReport, failingCoverage, incompleteHistory);
    expect(verdict.pass).toBe(false);
  });

  it("carries the history's unorderable-entry reasons through as historyInconsistencies", () => {
    const verdict = decideVerdict(passingReport, passingCoverage, unorderableHistory);
    expect(verdict.historyInconsistencies).toEqual([
      { deploymentId: "b", reason: "deployedAtMs is not strictly older than the candidate" },
    ]);
    expect(verdict.missingPlanDeploymentIds).toEqual([]);
    expect(verdict.pass).toBe(false);
  });
});
