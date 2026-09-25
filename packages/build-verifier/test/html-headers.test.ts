import { DIAGNOSTIC_MESSAGES, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyHtmlHeaders } from "../src/html-headers.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const storefront = readPlan("storefront");
const rootMinimal = readPlan("root-minimal");

const REVALIDATE = { "cache-control": "no-cache" };

/**
 * Headers that satisfy the baseline for every public HTML path `storefront` names: the mount path
 * (`/app`), the install start URL (`/app/`), and the offline fallback page (`/app/offline.html`, which is also
 * the plan's one precached `.html` entry — its revision is non-null, so it is not fingerprinted).
 */
function compliant(): Record<string, Record<string, string>> {
  return {
    [storefront.identity.mountPath]: { ...REVALIDATE },
    "/app/": { ...REVALIDATE },
    [storefront.offlineFallback.enabled ? storefront.offlineFallback.path : ""]: { ...REVALIDATE },
  };
}

const codes = (result: { diagnostics: readonly { code: string }[] }): string[] =>
  result.diagnostics.map(({ code }) => code);
const paths = (result: { diagnostics: readonly { path: string }[] }): string[] =>
  result.diagnostics.map(({ path }) => path);

describe("verifyHtmlHeaders: path derivation", () => {
  it("passes when every derived public HTML path meets the baseline", () => {
    expect(verifyHtmlHeaders(storefront, compliant())).toEqual({
      name: "html-headers",
      ok: true,
      diagnostics: [],
    });
  });

  it("judges only the mount path when install is null, offline fallback is disabled, and nothing precached is HTML", () => {
    expect(rootMinimal.install).toBeNull();
    expect(rootMinimal.offlineFallback.enabled).toBe(false);
    expect(rootMinimal.precache.some(({ url }) => url.endsWith(".html"))).toBe(false);

    const result = verifyHtmlHeaders(rootMinimal, {});
    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(paths(result)).toEqual(["/identity/mountPath"]);
  });

  it("dedupes the offline fallback page against the identical precached .html entry, keeping the first field's path", () => {
    // storefront.offlineFallback.path and storefront.precache[2].url are both "/app/offline.html"; the
    // precache entry has a non-null revision, so on its own it would qualify as public HTML too.
    expect(storefront.offlineFallback).toEqual({ enabled: true, path: "/app/offline.html" });
    const htmlEntry = storefront.precache.find(({ url }) => url === "/app/offline.html");
    expect(htmlEntry?.revision).not.toBeNull();

    const observed = compliant();
    delete observed["/app/offline.html"];
    const result = verifyHtmlHeaders(storefront, observed);

    // One diagnostic for the missing path, not two, and it is attributed to offlineFallback (the earlier field).
    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(paths(result)).toEqual(["/offlineFallback/path"]);
  });

  it("dedupes an install start URL equal to the mount path, reporting only once under mountPath", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: { ...(storefront.install as NonNullable<PwaPlan["install"]>), startUrl: storefront.identity.mountPath },
    };

    const observed = compliant();
    delete observed[storefront.identity.mountPath];
    delete observed["/app/"];
    const result = verifyHtmlHeaders(plan, observed);

    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(paths(result)).toEqual(["/identity/mountPath"]);
  });

  it("does not treat a fingerprinted (revision: null) .html precache entry as public HTML", () => {
    // A fingerprinted entry's URL changes with its content, so it belongs to response-headers, not here.
    const plan: PwaPlan = {
      ...storefront,
      precache: [...storefront.precache, { url: "/app/assets/shell.9f8e7d6c.html", revision: null }],
    };

    const result = verifyHtmlHeaders(plan, compliant());
    expect(result.ok).toBe(true);
    expect(paths(result).some((path) => path.startsWith("/precache/3"))).toBe(false);
  });

  it("does not treat a revisioned, non-.html precache entry as public HTML", () => {
    // storefront.precache[1] is "/app/assets/logo.svg" with a non-null revision.
    const svg = storefront.precache[1];
    expect(svg?.url.endsWith(".html")).toBe(false);
    expect(svg?.revision).not.toBeNull();

    const observed = compliant();
    const result = verifyHtmlHeaders(storefront, observed);
    expect(paths(result).some((path) => path === "/precache/1/url")).toBe(false);
  });

  it("includes a revisioned .html precache entry that no other field already names", () => {
    const plan: PwaPlan = {
      ...storefront,
      offlineFallback: { enabled: false },
      // Drop the fixture's own offline.html entry so only the new terms.html entry is un-named by any other field.
      precache: [
        ...storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
        { url: "/app/legal/terms.html", revision: "9a8b7c6d" },
      ],
    };

    const observed: Record<string, Record<string, string>> = {
      [plan.identity.mountPath]: { ...REVALIDATE },
      "/app/": { ...REVALIDATE },
    };
    const result = verifyHtmlHeaders(plan, observed);

    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(paths(result)).toEqual(["/precache/2/url"]);
  });
});

describe("verifyHtmlHeaders: judging", () => {
  it("reports a public HTML path that does not revalidate", () => {
    const observed = compliant();
    observed["/app/"] = { "cache-control": "public, max-age=600" };
    const result = verifyHtmlHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-missing-directive"]);
    expect(paths(result)).toEqual(["/install/startUrl"]);
  });

  it("reports a public HTML path marked immutable", () => {
    const observed = compliant();
    observed["/app/offline.html"] = { "cache-control": "no-cache, immutable" };
    const result = verifyHtmlHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-forbidden-directive"]);
    expect(paths(result)).toEqual(["/offlineFallback/path"]);
  });

  it("reports both a missing no-cache and a present immutable on the same path", () => {
    const observed = compliant();
    observed[storefront.identity.mountPath] = { "cache-control": "public, max-age=3600, immutable" };
    const result = verifyHtmlHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-missing-directive", "verify.header-forbidden-directive"]);
    expect(paths(result)).toEqual(["/identity/mountPath", "/identity/mountPath"]);
  });

  it("reports a public HTML path with no observed response as unreadable, not as skipped", () => {
    const observed = compliant();
    delete observed[storefront.identity.mountPath];
    const result = verifyHtmlHeaders(storefront, observed);

    expect(codes(result)).toEqual(["verify.header-unreadable"]);
    expect(paths(result)).toEqual(["/identity/mountPath"]);
  });

  it("passes when every path is observed and meets the baseline", () => {
    expect(verifyHtmlHeaders(storefront, compliant()).ok).toBe(true);
  });

  it("uses the platform's message verbatim and never echoes an observed header value", () => {
    const observed = compliant();
    observed[storefront.identity.mountPath] = { "cache-control": "public, max-age=600, s-maxage=99999" };
    const result = verifyHtmlHeaders(storefront, observed);

    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const { code, message } of result.diagnostics) {
      expect(message, code).toBe(DIAGNOSTIC_MESSAGES[code]);
      expect(message).not.toMatch(/600|s-maxage|99999|https?:|\/app\//);
    }
  });
});
