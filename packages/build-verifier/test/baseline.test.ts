import { DIAGNOSTIC_MESSAGES, type PwaIdentity, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BASELINE_FIELDS, compareIdentityBaseline } from "../src/baseline.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const identity = readPlan("storefront").identity;

/** A copy of the identity with one field changed. */
function withField(field: keyof PwaIdentity, value: string): PwaIdentity {
  return { ...identity, [field]: value };
}

const codes = (result: { diagnostics: readonly { code: string }[] }): string[] =>
  result.diagnostics.map(({ code }) => code);

describe("BASELINE_FIELDS", () => {
  it("covers every field of PwaIdentity", () => {
    // If contracts adds a field, this fails rather than letting the new field slip into — or out of — the
    // immutable set without anyone deciding which it should be (ADR-0008).
    expect([...BASELINE_FIELDS].sort()).toEqual(Object.keys(identity).sort());
  });

  it("covers every field of PwaIdentity at the type level, not only the fixture's keys", () => {
    // The assertion above reads its keys from a JSON fixture, so it only fails once someone also updates the
    // fixture. This one fails in `tsc`: an added field that nobody assigned to the immutable set makes
    // `MissingFromBaseline` non-empty, and the annotation below stops compiling.
    type MissingFromBaseline = Exclude<keyof PwaIdentity, (typeof BASELINE_FIELDS)[number]>;
    const covered: [MissingFromBaseline] extends [never] ? true : never = true;
    expect(covered).toBe(true);
  });

  it("lists the eight immutable fields before environment, as the baseline rules do", () => {
    expect(BASELINE_FIELDS).toEqual([
      "appId",
      "origin",
      "scope",
      "serviceWorkerUrl",
      "manifestId",
      "manifestUrl",
      "mountPath",
      "cacheNamespaceSeed",
      "environment",
    ]);
  });
});

describe("compareIdentityBaseline", () => {
  it("passes when the candidate equals the baseline", () => {
    expect(compareIdentityBaseline(identity, { ...identity })).toEqual({
      name: "identity-baseline",
      ok: true,
      diagnostics: [],
    });
  });

  it("is unaffected by the order of the baseline's keys", () => {
    const reordered = Object.fromEntries(Object.entries(identity).reverse());
    expect(compareIdentityBaseline(identity, reordered).ok).toBe(true);
  });

  /**
   * A legal variant of each field. Appending a suffix to every field would not do: `scope` must end in a slash
   * and must contain the worker, manifest and mount path, so changing it alone produces a baseline that fails
   * `validateIdentity` and is reported as invalid rather than drifted. Each replacement here keeps the identity
   * internally consistent, so the only finding is the drift being tested.
   */
  const LEGAL_DRIFT: Readonly<Record<(typeof BASELINE_FIELDS)[number], Partial<PwaIdentity>>> = {
    appId: { appId: "other-store" },
    origin: { origin: "https://other.example.com" },
    // Moving the scope moves everything addressed inside it.
    scope: {
      scope: "/shop/",
      serviceWorkerUrl: "/shop/sw.js",
      manifestUrl: "/shop/manifest.webmanifest",
      mountPath: "/shop",
      manifestId: "/shop/",
    },
    serviceWorkerUrl: { serviceWorkerUrl: "/app/service-worker.js" },
    manifestId: { manifestId: "/app/v2/" },
    manifestUrl: { manifestUrl: "/app/app.webmanifest" },
    mountPath: { mountPath: "/app/shop" },
    cacheNamespaceSeed: { cacheNamespaceSeed: "r4" },
    environment: { environment: "staging" },
  };

  it("reports each field that drifted, pointing at that field", () => {
    for (const field of BASELINE_FIELDS) {
      const result = compareIdentityBaseline(identity, { ...identity, ...LEGAL_DRIFT[field] });

      expect(codes(result), field).toContain("verify.baseline-mismatch");
      expect(result.diagnostics.map(({ path }) => path), field).toContain(`/identity/${field}`);
    }
  });

  it("reports exactly one mismatch when only one field moved", () => {
    // The scope entry deliberately moves several fields at once; the rest must each yield a single finding.
    for (const field of BASELINE_FIELDS) {
      if (field === "scope") continue;
      const result = compareIdentityBaseline(identity, { ...identity, ...LEGAL_DRIFT[field] });
      expect(result.diagnostics, field).toHaveLength(1);
      expect(result.diagnostics[0]?.path, field).toBe(`/identity/${field}`);
    }
  });

  it("reports every drifted field at once, in baseline-rule order", () => {
    const baseline = { ...identity, appId: "other", environment: "staging" };
    const result = compareIdentityBaseline(identity, baseline);
    expect(result.diagnostics.map(({ path }) => path)).toEqual(["/identity/appId", "/identity/environment"]);
  });

  it("treats a trailing slash as a different scope", () => {
    expect(compareIdentityBaseline(identity, withField("scope", "/app")).ok).toBe(false);
  });

  it("treats a case difference as a different identity", () => {
    expect(compareIdentityBaseline(identity, withField("appId", identity.appId.toUpperCase())).ok).toBe(false);
  });

  it("treats a percent-encoded spelling as a different identity", () => {
    // `/app/sw.js` and `/app%2Fsw.js` are different URLs; normalising them here would hide a migration.
    expect(compareIdentityBaseline(identity, withField("serviceWorkerUrl", "/app%2Fsw.js")).ok).toBe(false);
  });

  it("reports a missing baseline without deciding what it means", () => {
    for (const absent of [undefined, null]) {
      const result = compareIdentityBaseline(identity, absent);
      expect(codes(result), String(absent)).toEqual(["verify.baseline-missing"]);
      expect(result.diagnostics[0]?.path).toBe("/identity");
    }
  });

  it("reports a stored baseline that is not a valid identity", () => {
    for (const invalid of [{}, { appId: "storefront" }, "not an object", 42, [], { ...identity, origin: "ftp://x" }]) {
      expect(codes(compareIdentityBaseline(identity, invalid)), JSON.stringify(invalid)).toEqual([
        "verify.baseline-invalid",
      ]);
    }
  });

  it("does not report drift for a baseline it could not validate", () => {
    // An invalid baseline yields exactly one finding: a pile of mismatches on top would be noise.
    expect(compareIdentityBaseline(identity, { appId: "other" }).diagnostics).toHaveLength(1);
  });

  it("throws for an invalid candidate, which is a build problem rather than drift", () => {
    // Matching the message matters: without the guard the invalid candidate still reaches the field loop and
    // throws a TypeError of its own when the validated value is absent, so asserting the class alone would pass
    // whether or not the guard exists.
    for (const invalid of [
      { ...identity, origin: "ftp://x" },
      { ...identity, environment: "PROD" },
      { ...identity, appId: "" },
    ]) {
      expect(() => compareIdentityBaseline(invalid, { ...identity }), JSON.stringify(invalid.origin)).toThrow(
        /candidate identity is not valid/i,
      );
    }
  });

  it("uses the platform's message verbatim", () => {
    const result = compareIdentityBaseline(identity, withField("appId", "other"));
    for (const { code, message } of result.diagnostics) {
      expect(message, code).toBe(DIAGNOSTIC_MESSAGES[code]);
    }
  });

  it("never echoes either identity in its messages", () => {
    const result = compareIdentityBaseline(identity, withField("appId", "secret-tenant-name"));
    for (const { message } of result.diagnostics) {
      expect(message).not.toMatch(/secret-tenant-name|storefront|shop\.example\.com/);
    }
  });
});
