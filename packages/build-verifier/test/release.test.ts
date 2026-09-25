import type { PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyRelease } from "../src/release.js";
import { VERIFICATION_CHECKS } from "../src/report.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const plan = readPlan("storefront");

/** Every path the plan promises, so the artifact check passes. */
const published = [...plan.precache.map(({ url }) => url), plan.identity.serviceWorkerUrl, plan.identity.manifestUrl];

/** Headers meeting the baseline for the worker, the manifest and the fingerprinted asset. */
const observed = {
  [plan.identity.serviceWorkerUrl]: { "cache-control": "no-cache" },
  [plan.identity.manifestUrl]: { "cache-control": "no-cache" },
  ...Object.fromEntries(
    plan.precache
      .filter(({ revision }) => revision === null)
      .map(({ url }) => [url, { "cache-control": "public, max-age=31536000, immutable" }]),
  ),
};

const retention = {
  asOfMs: 1,
  previous: [],
  available: plan.precache.filter(({ revision }) => revision === null).map(({ url }) => url),
};

const names = (report: { checks: readonly { name: string }[] }): string[] => report.checks.map(({ name }) => name);

describe("verifyRelease", () => {
  it("runs every supplied check and passes when all of them do", () => {
    const report = verifyRelease({ plan, published, observed, baseline: { ...plan.identity } });

    expect(report.ok).toBe(true);
    // `release-order` only runs for a shared-origin child; `release-retention` and `html-headers` were not
    // supplied here (their own describe blocks below cover them), so this call runs the other three.
    expect(names(report)).toEqual(
      VERIFICATION_CHECKS.filter((name) => name !== "release-order" && name !== "release-retention" && name !== "html-headers"),
    );
    expect(report.diagnostics).toEqual([]);
  });

  it("keeps the checks in the declared order regardless of input order", () => {
    const report = verifyRelease({ baseline: { ...plan.identity }, observed, plan, published });
    expect(names(report)).toEqual(["artifacts", "response-headers", "identity-baseline"]);
  });

  it("omits a check whose input was not supplied", () => {
    expect(names(verifyRelease({ plan, published }))).toEqual(["artifacts"]);
    expect(names(verifyRelease({ plan, observed }))).toEqual(["response-headers"]);
    expect(names(verifyRelease({ plan, baseline: { ...plan.identity } }))).toEqual(["identity-baseline"]);
    expect(names(verifyRelease({ plan, published, observed }))).toEqual(["artifacts", "response-headers"]);
  });

  it("tells an omitted baseline apart from a baseline that was looked up and not found", () => {
    // Omitting the property means the comparison did not happen; passing undefined means it happened and came up
    // empty. A release gate has to be able to distinguish those.
    expect(names(verifyRelease({ plan }))).toEqual([]);

    const looked = verifyRelease({ plan, baseline: undefined });
    expect(names(looked)).toEqual(["identity-baseline"]);
    expect(looked.diagnostics.map(({ code }) => code)).toEqual(["verify.baseline-missing"]);
    expect(looked.ok).toBe(false);
  });

  it("tells an omitted retention check apart from an explicitly supplied but invalid record", () => {
    expect(names(verifyRelease({ plan }))).toEqual([]);

    const supplied = verifyRelease({ plan, retention: undefined });
    expect(names(supplied)).toEqual(["release-retention"]);
    expect(supplied.diagnostics.map(({ code }) => code)).toEqual(["verify.retention-history-invalid"]);
    expect(supplied.ok).toBe(false);
  });

  it("runs retention last and accepts a release whose supplied assets meet the window", () => {
    const report = verifyRelease({ plan, published, observed, baseline: { ...plan.identity }, retention });

    expect(names(report)).toEqual(["artifacts", "response-headers", "identity-baseline", "release-retention"]);
    expect(report.ok).toBe(true);
  });

  it("treats a null baseline the same as an undefined one", () => {
    const report = verifyRelease({ plan, baseline: null });
    expect(report.diagnostics.map(({ code }) => code)).toEqual(["verify.baseline-missing"]);
  });

  it("reports ok for an empty report, which is why callers must inspect checks", () => {
    // Verifying nothing cannot fail. This is deliberate and documented, but it means `ok` alone never proves a
    // release was checked — the caller has to confirm the checks it required are present.
    const report = verifyRelease({ plan });
    expect(report).toEqual({ ok: true, checks: [], diagnostics: [] });
  });

  it("fails as soon as one check fails, and says which", () => {
    const report = verifyRelease({ plan, published: [], observed, baseline: { ...plan.identity } });

    expect(report.ok).toBe(false);
    expect(report.checks.find(({ name }) => name === "artifacts")?.ok).toBe(false);
    expect(report.checks.find(({ name }) => name === "response-headers")?.ok).toBe(true);
    expect(report.checks.find(({ name }) => name === "identity-baseline")?.ok).toBe(true);
  });

  it("concatenates diagnostics in check order", () => {
    const report = verifyRelease({
      plan,
      published: [],
      observed: {},
      baseline: { ...plan.identity, appId: "other" },
    });

    const prefixes = report.diagnostics.map(({ code }) => code.split(".")[1]?.split("-")[0]);
    // artifacts first, then headers, then the baseline — never interleaved.
    expect(prefixes.indexOf("artifact")).toBe(0);
    expect(prefixes.lastIndexOf("artifact")).toBeLessThan(prefixes.indexOf("header"));
    expect(prefixes.lastIndexOf("header")).toBeLessThan(prefixes.indexOf("baseline"));
  });

  it("gathers exactly the diagnostics the individual checks produced", () => {
    const report = verifyRelease({ plan, published: [], observed: {}, baseline: null });
    const fromChecks = report.checks.flatMap(({ diagnostics }) => diagnostics);
    expect(report.diagnostics).toEqual(fromChecks);
  });

  it("puts the report's fields in canonical order", () => {
    expect(Object.keys(verifyRelease({ plan, published }))).toEqual(["ok", "checks", "diagnostics"]);
  });

  it("survives a JSON round trip", () => {
    const report = verifyRelease({ plan, published: [], observed, baseline: { ...plan.identity, appId: "other" } });
    expect(JSON.parse(JSON.stringify(report))).toStrictEqual(report);
  });

  it("propagates a caller mistake rather than folding it into the report", () => {
    // A relative path is the caller using the interface wrongly; reporting it as a release finding would read
    // like a deployment failure.
    expect(() => verifyRelease({ plan, published: ["app/index.html"] })).toThrow(TypeError);
  });
});

// Public HTML headers (task H2 / spec "修订：公开 HTML 响应头检查"). `htmlObserved` is a new, optional input;
// every test above omits it and must keep passing byte-for-byte, which is the backward-compatibility guarantee
// the revision promises existing callers.
describe("verifyRelease: html-headers", () => {
  /** Headers meeting the baseline for every public HTML path the fixture plan names. */
  const htmlObserved = {
    [plan.identity.mountPath]: { "cache-control": "no-cache" },
    "/app/": { "cache-control": "no-cache" },
    "/app/offline.html": { "cache-control": "no-cache" },
  };

  it("omits html-headers when htmlObserved is not supplied, same as any other omitted input", () => {
    expect(names(verifyRelease({ plan, published, observed, baseline: { ...plan.identity }, retention }))).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-retention",
    ]);
  });

  it("runs html-headers last, after every other supplied check, regardless of input order", () => {
    const report = verifyRelease({
      htmlObserved,
      retention,
      plan,
      published,
      observed,
      baseline: { ...plan.identity },
    });

    expect(names(report)).toEqual(["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers"]);
    expect(report.ok).toBe(true);
  });

  it("runs html-headers alone when it is the only input supplied", () => {
    expect(names(verifyRelease({ plan, htmlObserved }))).toEqual(["html-headers"]);
  });

  it("combines ok with the other checks as usual", () => {
    const report = verifyRelease({ plan, htmlObserved: {} });
    expect(report.ok).toBe(false);
    expect(report.checks.find(({ name }) => name === "html-headers")?.ok).toBe(false);
  });
});
