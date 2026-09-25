import type { PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyReleaseGateCoverage } from "../src/release-gate.js";
import { verifyRelease } from "../src/release.js";
import { check, type PwaVerificationReport } from "../src/report.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const plan = readPlan("storefront");

function report(checks: PwaVerificationReport["checks"], ok = checks.every((entry) => entry.ok)): PwaVerificationReport {
  return { ok, checks, diagnostics: checks.flatMap((entry) => entry.diagnostics) };
}

describe("verifyReleaseGateCoverage", () => {
  it("confirms required checks ran even when a real verification report failed", () => {
    const supplied = verifyRelease({ plan, published: [], baseline: { ...plan.identity } });

    expect(verifyReleaseGateCoverage(supplied, ["artifacts", "identity-baseline"])).toEqual({ ok: true, missing: [] });
    expect(supplied.ok).toBe(false);
  });

  it("lists missing checks in the caller's declared order", () => {
    const supplied = report([check("response-headers", [])]);

    expect(verifyReleaseGateCoverage(supplied, ["release-retention", "artifacts", "response-headers"])).toEqual({
      ok: false,
      missing: ["release-retention", "artifacts"],
    });
  });

  it("allows an empty required set without treating an empty report as a release pass", () => {
    const supplied = report([]);

    expect(verifyReleaseGateCoverage(supplied, [])).toEqual({ ok: true, missing: [] });
    expect(supplied.ok).toBe(true);
  });

  it("rejects repeated or unknown required check names", () => {
    const supplied = report([check("artifacts", [])]);

    expect(() => verifyReleaseGateCoverage(supplied, ["artifacts", "artifacts"])).toThrow(TypeError);
    expect(() => verifyReleaseGateCoverage(supplied, ["not-a-check"] as never)).toThrow(TypeError);
  });

  it("rejects reports whose checks are unknown or repeated", () => {
    const supplied = report([check("artifacts", [])]);
    const unknown = {
      ...supplied,
      checks: [...supplied.checks, { name: "not-a-check", ok: true, diagnostics: [] }],
    } as unknown as PwaVerificationReport;
    const repeated = { ...supplied, checks: [...supplied.checks, check("artifacts", [])] };

    expect(() => verifyReleaseGateCoverage(unknown, ["artifacts"])).toThrow(TypeError);
    expect(() => verifyReleaseGateCoverage(repeated, ["artifacts"])).toThrow(TypeError);
  });

  it("reports html-headers missing when a report ran without it (task H2)", () => {
    const supplied = verifyRelease({ plan, published: [], baseline: { ...plan.identity } });

    expect(verifyReleaseGateCoverage(supplied, ["artifacts", "html-headers"])).toEqual({
      ok: false,
      missing: ["html-headers"],
    });
  });
});
