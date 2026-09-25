import { DIAGNOSTIC_MESSAGES, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyResponseHeaders, type PwaObservedResponses } from "../src/headers.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const storefront = readPlan("storefront");
/** `/app/assets/app.3f9a2c7d.js` — the one precache entry the compiler marked fingerprinted. */
const fingerprinted = storefront.precache.filter(({ revision }) => revision === null);

const REVALIDATE = { "cache-control": "no-cache" };
const IMMUTABLE = { "cache-control": "public, max-age=31536000, immutable" };

/** Headers that satisfy the baseline for every path the check looks at. */
function compliant(): Record<string, Record<string, string>> {
  const headers: Record<string, Record<string, string>> = {
    [storefront.identity.serviceWorkerUrl]: { ...REVALIDATE },
    [storefront.identity.manifestUrl]: { ...REVALIDATE },
  };
  for (const { url } of fingerprinted) headers[url] = { ...IMMUTABLE };
  return headers;
}

const codes = (result: { diagnostics: readonly { code: string }[] }): string[] =>
  result.diagnostics.map(({ code }) => code);

describe("verifyResponseHeaders", () => {
  it("only looks at fingerprinted precache entries", () => {
    // The fixture has revisioned entries too; those carry no baseline requirement.
    expect(fingerprinted).toHaveLength(1);
    expect(storefront.precache.length).toBeGreaterThan(fingerprinted.length);
  });

  it("passes when every observed response meets the baseline", () => {
    expect(verifyResponseHeaders(storefront, compliant())).toEqual({
      name: "response-headers",
      ok: true,
      diagnostics: [],
    });
  });

  it("ignores directives the baseline neither requires nor forbids", () => {
    const observed = compliant();
    observed[storefront.identity.serviceWorkerUrl] = { "cache-control": "no-cache, private, must-revalidate" };
    expect(verifyResponseHeaders(storefront, observed).ok).toBe(true);
  });

  it("reports a worker that does not revalidate", () => {
    const observed = compliant();
    observed[storefront.identity.serviceWorkerUrl] = { "cache-control": "public, max-age=600" };
    const result = verifyResponseHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-missing-directive"]);
    expect(result.diagnostics[0]?.path).toBe("/identity/serviceWorkerUrl");
  });

  it("reports a worker marked immutable", () => {
    const observed = compliant();
    observed[storefront.identity.serviceWorkerUrl] = { "cache-control": "no-cache, immutable" };
    expect(codes(verifyResponseHeaders(storefront, observed))).toEqual(["verify.header-forbidden-directive"]);
  });

  it("reports a manifest that does not revalidate", () => {
    const observed = compliant();
    observed[storefront.identity.manifestUrl] = { "cache-control": "max-age=3600" };
    const result = verifyResponseHeaders(storefront, observed);
    expect(result.diagnostics[0]?.path).toBe("/identity/manifestUrl");
  });

  it("reports a fingerprinted asset that is not immutable and has no max-age", () => {
    const observed = compliant();
    const entry = fingerprinted[0]?.url ?? "";
    observed[entry] = { "cache-control": "public" };
    const result = verifyResponseHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-missing-directive", "verify.header-missing-directive"]);
    expect(result.diagnostics.every(({ path }) => path.startsWith("/precache/"))).toBe(true);
  });

  it("reports a fingerprinted asset that revalidates or refuses storage", () => {
    const observed = compliant();
    const entry = fingerprinted[0]?.url ?? "";
    observed[entry] = { "cache-control": "immutable, max-age=60, no-cache, no-store" };
    expect(codes(verifyResponseHeaders(storefront, observed))).toEqual([
      "verify.header-forbidden-directive",
      "verify.header-forbidden-directive",
    ]);
  });

  it("accepts any positive max-age, since the runbook leaves the number to infrastructure", () => {
    const observed = compliant();
    const entry = fingerprinted[0]?.url ?? "";
    observed[entry] = { "cache-control": "immutable, max-age=1" };
    expect(verifyResponseHeaders(storefront, observed).ok).toBe(true);
  });

  it("reports a fingerprinted asset whose max-age is zero", () => {
    // `max-age=0, immutable` is a common CDN misconfiguration. A check that only asked whether the directive is
    // present would pass it, while the asset is in fact never cached — the opposite of what this baseline asks
    // for. Zero is not one of the lengths infrastructure might choose; it voids the requirement.
    const observed = compliant();
    const entry = fingerprinted[0]?.url ?? "";
    observed[entry] = { "cache-control": "immutable, max-age=0" };
    const result = verifyResponseHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-missing-directive"]);
    expect(result.diagnostics[0]?.path.startsWith("/precache/")).toBe(true);
  });

  it("reports a path that was never observed rather than skipping it", () => {
    // Silently passing what was never looked at would be worse than having no check at all.
    const rest = compliant();
    delete rest[storefront.identity.manifestUrl];
    const result = verifyResponseHeaders(storefront, rest);

    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(result.diagnostics[0]?.path).toBe("/identity/manifestUrl");
  });

  it("reports every unobserved path when nothing was collected", () => {
    const result = verifyResponseHeaders(storefront, {});
    expect(codes(result)).toEqual([
      "verify.header-unreadable",
      "verify.header-unreadable",
      "verify.header-unreadable",
    ]);
  });

  it("treats a missing Cache-Control header as failing the baseline, not as unreadable", () => {
    const observed = compliant();
    observed[storefront.identity.serviceWorkerUrl] = { "content-type": "text/javascript" };
    expect(codes(verifyResponseHeaders(storefront, observed))).toEqual(["verify.header-missing-directive"]);
  });

  it("does not mistake an inherited property for an observed response", () => {
    const observed = Object.create({ [storefront.identity.manifestUrl]: REVALIDATE }) as PwaObservedResponses;
    Object.assign(observed, {
      [storefront.identity.serviceWorkerUrl]: REVALIDATE,
      ...Object.fromEntries(fingerprinted.map(({ url }) => [url, IMMUTABLE])),
    });
    expect(codes(verifyResponseHeaders(storefront, observed))).toEqual(["verify.header-unreadable"]);
  });

  it("uses the platform's message verbatim", () => {
    const result = verifyResponseHeaders(storefront, {});
    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const { code, message } of result.diagnostics) {
      expect(message, code).toBe(DIAGNOSTIC_MESSAGES[code]);
    }
  });

  it("never echoes an observed header value", () => {
    const observed = compliant();
    observed[storefront.identity.serviceWorkerUrl] = { "cache-control": "public, max-age=31536000, s-maxage=99999" };
    for (const { message } of verifyResponseHeaders(storefront, observed).diagnostics) {
      expect(message).not.toMatch(/31536000|s-maxage|99999/);
    }
  });
});
