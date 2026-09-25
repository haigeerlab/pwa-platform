import { describe, expect, it } from "vitest";
import {
  CACHE_STRATEGIES,
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_MESSAGES,
  LIFECYCLE_EVENT_TYPES,
  RESOURCE_CLASSES,
  UPDATE_MODES,
} from "../src/index.js";
import * as fixtures from "./fixtures.js";

describe("v1 models are JSON-serializable", () => {
  it.each(Object.entries(fixtures))("%s survives a JSON round trip", (_name, value) => {
    expect(JSON.parse(JSON.stringify(value))).toStrictEqual(value);
  });
});

describe("v1 enumerations", () => {
  it("lists exactly the resource classes from the spec", () => {
    expect(RESOURCE_CLASSES).toEqual([
      "asset",
      "navigation-public-static",
      "navigation-public-dynamic",
      "public-data",
      "session-data",
      "mutation",
      "stream",
      "unclassified",
    ]);
  });

  it("lists exactly the lifecycle events from the spec", () => {
    expect(LIFECYCLE_EVENT_TYPES).toEqual([
      "registered",
      "install-eligible",
      "installed",
      "update-waiting",
      "update-applied",
      "activated",
      "offline-fallback",
      "cache-cleaned",
      "served-from-cache",
    ]);
  });

  it("only supports prompt updates and the four cache strategies", () => {
    expect(UPDATE_MODES).toEqual(["prompt"]);
    expect(CACHE_STRATEGIES).toEqual(["none", "cache-first", "network-first", "stale-while-revalidate"]);
  });

  it("has unique diagnostic codes", () => {
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(DIAGNOSTIC_CODES.length);
  });

  it("publishes one frozen, non-empty platform message per diagnostic code", () => {
    expect(Object.keys(DIAGNOSTIC_MESSAGES).sort()).toEqual([...DIAGNOSTIC_CODES].sort());
    expect(Object.values(DIAGNOSTIC_MESSAGES).every((message) => message.length > 0)).toBe(true);
    expect(Object.isFrozen(DIAGNOSTIC_MESSAGES)).toBe(true);
  });

  it("lists the policy-compiler diagnostic codes in spec order", () => {
    expect(DIAGNOSTIC_CODES.filter((code) => code.startsWith("compile."))).toEqual([
      "compile.invalid-host-output",
      "compile.unsupported-topology",
      "compile.public-path-outside-scope",
      "compile.duplicate-path-prefix",
      "compile.allow-under-deny",
      "compile.install-metadata-missing",
      "compile.offline-fallback-not-built",
      "compile.offline-fallback-denied",
      "compile.asset-rule-unmatched",
      "compile.offline-write-target-invalid",
      "compile.runtime-strategy-unsupported",
      "compile.runtime-cache-unused",
      "compile.policy-rule-in-child-scope",
      "compile.offline-fallback-in-child-scope",
      "compile.host-file-in-child-scope",
      "compile.start-url-in-child-scope",
      "compile.shortcut-url-in-child-scope",
    ]);
  });

  it("lists the build-verifier diagnostic codes in spec order", () => {
    expect(DIAGNOSTIC_CODES.filter((code) => code.startsWith("verify."))).toEqual([
      "verify.artifact-missing",
      "verify.artifact-path-mismatch",
      "verify.manifest-asset-missing",
      "verify.header-missing-directive",
      "verify.header-forbidden-directive",
      "verify.header-unreadable",
      "verify.baseline-invalid",
      "verify.baseline-missing",
      "verify.baseline-mismatch",
      "verify.root-plan-not-shared-origin",
      "verify.root-plan-missing-exclude",
      "verify.root-registry-older",
      "verify.root-registry-child-mismatch",
      "verify.root-registry-diverged",
      "verify.retention-history-invalid",
      "verify.retention-missing",
    ]);
  });

  it("lists the plan-level shared-origin diagnostic codes in spec order", () => {
    expect(DIAGNOSTIC_CODES.filter((code) => code.startsWith("plan.") && code.endsWith("-in-child-scope"))).toEqual([
      "plan.precache-in-child-scope",
      "plan.offline-fallback-in-child-scope",
      "plan.start-url-in-child-scope",
      "plan.shortcut-url-in-child-scope",
    ]);
  });
});
