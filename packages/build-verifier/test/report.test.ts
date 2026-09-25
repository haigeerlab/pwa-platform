import { DIAGNOSTIC_CODES, DIAGNOSTIC_MESSAGES, type PwaDiagnostic } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { VERIFICATION_CHECKS, check } from "../src/report.js";

const diagnostic = (code: PwaDiagnostic["code"]): PwaDiagnostic => ({
  code,
  severity: "error",
  path: "/precache/0/url",
  message: DIAGNOSTIC_MESSAGES[code],
});

describe("verify.* diagnostic codes", () => {
  const codes = DIAGNOSTIC_CODES.filter((code) => code.startsWith("verify."));

  it("are published by contracts in spec order", () => {
    expect(codes).toEqual([
      "verify.artifact-missing",
      "verify.artifact-path-mismatch",
      // contracts-foundation 2026-09-24 (ADR-0037): screenshots and shortcut icons must be published.
      "verify.manifest-asset-missing",
      "verify.header-missing-directive",
      "verify.header-forbidden-directive",
      "verify.header-unreadable",
      "verify.baseline-invalid",
      "verify.baseline-missing",
      "verify.baseline-mismatch",
      // shared-origin-topology (ADR-0019): the release-order check against the deployed root plan.
      "verify.root-plan-not-shared-origin",
      "verify.root-plan-missing-exclude",
      "verify.root-registry-older",
      "verify.root-registry-child-mismatch",
      "verify.root-registry-diverged",
      "verify.retention-history-invalid",
      "verify.retention-missing",
    ]);
  });

  it("each carry a non-empty platform message that echoes no input", () => {
    for (const code of codes) {
      const message = DIAGNOSTIC_MESSAGES[code];
      expect(message.length, code).toBeGreaterThan(0);
      // Messages describe the rule, never the value that broke it.
      expect(message, code).not.toMatch(/https?:|\/app\/|pwa:/);
    }
  });
});

describe("check", () => {
  it("passes when there is nothing to report", () => {
    expect(check("artifacts", [])).toEqual({ name: "artifacts", ok: true, diagnostics: [] });
  });

  it("fails as soon as one diagnostic is present", () => {
    const result = check("artifacts", [diagnostic("verify.artifact-missing")]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("copies the diagnostics, so a later mutation of the caller's array cannot change the result", () => {
    const supplied: PwaDiagnostic[] = [diagnostic("verify.artifact-missing")];
    const result = check("artifacts", supplied);
    supplied.push(diagnostic("verify.baseline-mismatch"));
    expect(result.diagnostics).toHaveLength(1);
  });

  it("puts the fields in canonical order so reports diff cleanly", () => {
    expect(Object.keys(check("identity-baseline", []))).toEqual(["name", "ok", "diagnostics"]);
  });

  it("survives a JSON round trip", () => {
    const result = check("response-headers", [diagnostic("verify.header-missing-directive")]);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});

describe("VERIFICATION_CHECKS", () => {
  it("names the six checks in the order verifyRelease runs them", () => {
    expect(VERIFICATION_CHECKS).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-order",
      "release-retention",
      "html-headers",
    ]);
  });

  it("keeps the original five checks, in their original order, ahead of html-headers", () => {
    // html-headers (task H) was appended after the fact; a caller that indexed into the array before that
    // change must still see the same five names at the same five positions.
    expect(VERIFICATION_CHECKS.slice(0, 5)).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-order",
      "release-retention",
    ]);
  });
});
