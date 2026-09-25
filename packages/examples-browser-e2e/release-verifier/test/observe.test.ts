// requiredHtmlHeaderPaths mirrors verifyHtmlHeaders' own path-derivation rule (build-verifier/src/html-headers.ts)
// field-for-field, so this test pins each rule individually and then, separately, cross-checks the result against
// what verifyHtmlHeaders itself reports for several plans (module spec, "路径集合与 verifyHtmlHeaders 一致"; plan's
// HC2 "对照测试").
import { readFileSync } from "node:fs";
import { verifyHtmlHeaders, type PwaObservedResponses } from "@pwa-platform/build-verifier";
import type { PwaPlan } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { requiredHtmlHeaderPaths } from "../observe.ts";

const storefront = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as PwaPlan;

describe("requiredHtmlHeaderPaths: derivation rules", () => {
  it("always names the mount path", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath]);
  });

  it("includes the install start URL when the plan carries install metadata", () => {
    const plan: PwaPlan = {
      ...storefront,
      offlineFallback: { enabled: false },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(plan.install).not.toBeNull();
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath, plan.install!.startUrl]);
  });

  it("does not include a start URL when install is null", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(requiredHtmlHeaderPaths(plan)).not.toContain("/app/");
  });

  it("includes the offline fallback page when enabled", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: true, path: "/app/offline.html" },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath, "/app/offline.html"]);
  });

  it("does not include an offline fallback page when disabled", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      // Also drop the fixture's own offline.html precache entry, so disabling offlineFallback is the only
      // difference under test: otherwise the precache rule would still name this path on its own.
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath]);
  });

  it("includes a precache entry with a revision whose URL ends in .html", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      precache: [{ url: "/app/legal/terms.html", revision: "9a8b7c6d" }],
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath, "/app/legal/terms.html"]);
  });

  it("excludes a fingerprinted (revision: null) .html precache entry", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      precache: [{ url: "/app/assets/shell.9f8e7d6c.html", revision: null }],
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath]);
  });

  it("excludes a revisioned precache entry whose URL does not end in .html", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: null,
      offlineFallback: { enabled: false },
      precache: [{ url: "/app/assets/logo.svg", revision: "a1b2c3d4e5f60718" }],
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath]);
  });

  it("dedupes a path named by more than one field, keeping only the first occurrence", () => {
    // storefront's offlineFallback.path and its one revisioned .html precache entry are both "/app/offline.html".
    expect(storefront.offlineFallback).toEqual({ enabled: true, path: "/app/offline.html" });
    const htmlEntry = storefront.precache.find(({ url }) => url === "/app/offline.html");
    expect(htmlEntry?.revision).not.toBeNull();

    const paths = requiredHtmlHeaderPaths(storefront);
    expect(paths.filter((path) => path === "/app/offline.html")).toHaveLength(1);
  });

  it("dedupes an install start URL equal to the mount path", () => {
    const plan: PwaPlan = {
      ...storefront,
      install: { ...storefront.install!, startUrl: storefront.identity.mountPath },
      offlineFallback: { enabled: false },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    };
    expect(requiredHtmlHeaderPaths(plan)).toEqual([plan.identity.mountPath]);
  });
});

describe("requiredHtmlHeaderPaths: matches verifyHtmlHeaders' own path set", () => {
  // Cross-check per HC2's plan: for several plans, the number of unique paths requiredHtmlHeaderPaths derives must
  // equal the number of diagnostics verifyHtmlHeaders(plan, {}) reports (every derived path is unobserved, so each
  // produces exactly one verify.header-unreadable diagnostic — see build-verifier/src/headers.ts judgeCacheControl:
  // an unresolved path always yields one diagnostic, never zero or more than one). Combined with the second
  // assertion — that supplying compliant headers keyed exactly by the derived paths makes verifyHtmlHeaders report
  // ok: true — the two together prove the derived set is neither missing a path verifyHtmlHeaders judges (the
  // second assertion would then report header-unreadable) nor padded with an extra one verifyHtmlHeaders does not
  // judge (the first assertion's counts would then diverge).
  function expectPathSetMatches(plan: PwaPlan): void {
    const derived = requiredHtmlHeaderPaths(plan);

    const unobserved = verifyHtmlHeaders(plan, {});
    expect(unobserved.diagnostics).toHaveLength(derived.length);
    expect(unobserved.diagnostics.every(({ code }) => code === "verify.header-unreadable")).toBe(true);

    const compliant: Record<string, Readonly<Record<string, string>>> = {};
    for (const path of derived) compliant[path] = { "cache-control": "no-cache" };
    expect(verifyHtmlHeaders(plan, compliant as PwaObservedResponses)).toEqual({
      name: "html-headers",
      ok: true,
      diagnostics: [],
    });
  }

  it("matches for the storefront fixture plan (install, offline fallback, and a deduped .html precache entry)", () => {
    expectPathSetMatches(storefront);
  });

  it("matches when install is null and offline fallback is disabled (mount path only)", () => {
    expectPathSetMatches({ ...storefront, install: null, offlineFallback: { enabled: false } });
  });

  it("matches when a revisioned .html precache entry adds a path no other field names", () => {
    expectPathSetMatches({
      ...storefront,
      offlineFallback: { enabled: false },
      precache: [
        ...storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
        { url: "/app/legal/terms.html", revision: "9a8b7c6d" },
      ],
    });
  });

  it("matches when the offline fallback page is not also a precache entry", () => {
    expectPathSetMatches({
      ...storefront,
      offlineFallback: { enabled: true, path: "/app/offline" },
      precache: storefront.precache.filter(({ url }) => url !== "/app/offline.html"),
    });
  });

  it("matches when a fingerprinted .html entry and a non-.html revisioned entry are both present", () => {
    expectPathSetMatches({
      ...storefront,
      precache: [
        ...storefront.precache,
        { url: "/app/assets/shell.9f8e7d6c.html", revision: null },
      ],
    });
  });
});
