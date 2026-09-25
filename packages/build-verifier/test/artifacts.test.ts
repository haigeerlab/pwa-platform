import { DIAGNOSTIC_MESSAGES, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyArtifacts } from "../src/artifacts.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const storefront = readPlan("storefront");
const rootMinimal = readPlan("root-minimal");

/** Everything the storefront plan requires: its precache entries plus the identity's worker and manifest. */
function complete(plan: PwaPlan): string[] {
  return [...plan.precache.map(({ url }) => url), plan.identity.serviceWorkerUrl, plan.identity.manifestUrl];
}

describe("verifyArtifacts", () => {
  it("passes when every promised path was published", () => {
    expect(verifyArtifacts(storefront, complete(storefront))).toEqual({
      name: "artifacts",
      ok: true,
      diagnostics: [],
    });
  });

  it("passes for a plan mounted at the origin root", () => {
    expect(verifyArtifacts(rootMinimal, complete(rootMinimal)).ok).toBe(true);
  });

  it("reports a missing precache entry against its position in the plan", () => {
    const published = complete(storefront).filter((path) => path !== storefront.precache[1]?.url);
    const result = verifyArtifacts(storefront, published);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      { code: "verify.artifact-missing", severity: "error", path: "/precache/1/url", message: expect.any(String) },
    ]);
  });

  it("reports every missing entry, in plan order", () => {
    const result = verifyArtifacts(storefront, [storefront.identity.serviceWorkerUrl, storefront.identity.manifestUrl]);
    expect(result.diagnostics.map(({ path }) => path)).toEqual(
      storefront.precache.map((_, index) => `/precache/${index}/url`),
    );
  });

  it("reports the worker and the manifest against the identity that addresses them", () => {
    const result = verifyArtifacts(storefront, storefront.precache.map(({ url }) => url));
    expect(result.diagnostics).toEqual([
      {
        code: "verify.artifact-path-mismatch",
        severity: "error",
        path: "/identity/serviceWorkerUrl",
        message: expect.any(String),
      },
      {
        code: "verify.artifact-path-mismatch",
        severity: "error",
        path: "/identity/manifestUrl",
        message: expect.any(String),
      },
    ]);
  });

  it("ignores published files the plan never mentions", () => {
    const extra = [...complete(storefront), "/app/assets/extra.js", "/app/robots.txt", "/favicon.ico"];
    expect(verifyArtifacts(storefront, extra).ok).toBe(true);
  });

  it("is unaffected by duplicates in the published list", () => {
    const duplicated = [...complete(storefront), ...complete(storefront)];
    expect(verifyArtifacts(storefront, duplicated).ok).toBe(true);
  });

  it("treats a difference in case as a missing artifact", () => {
    const entry = storefront.precache[0]?.url ?? "";
    const published = complete(storefront).map((path) => (path === entry ? path.toUpperCase() : path));
    expect(verifyArtifacts(storefront, published).diagnostics).toHaveLength(1);
  });

  it("treats a difference in percent-encoding as a missing artifact", () => {
    // The browser requests the plan's spelling; an equivalent-looking encoding is served from a different URL.
    // Only the separators inside the path are encoded — the leading slash has to stay, or this would be rejected
    // as a non-absolute path instead of being compared.
    const entry = storefront.precache[1]?.url ?? "";
    const encoded = `/${entry.slice(1).replace(/\//g, "%2F")}`;
    const published = complete(storefront).map((path) => (path === entry ? encoded : path));
    expect(verifyArtifacts(storefront, published).diagnostics).toHaveLength(1);
  });

  it("treats a published path that merely contains the entry as missing", () => {
    // Publishing `app.3f9a2c7d.js.map` without `app.3f9a2c7d.js` means the script itself never shipped. The two
    // cases above only prove no normalisation happens — their replacements do not contain the original string, so
    // a containment check would still pass them. This one fails unless the comparison is verbatim equality.
    const entry = storefront.precache[0]?.url ?? "";
    const published = complete(storefront).map((path) => (path === entry ? `${path}.map` : path));
    expect(verifyArtifacts(storefront, published).diagnostics).toEqual([
      { code: "verify.artifact-missing", severity: "error", path: "/precache/0/url", message: expect.any(String) },
    ]);
  });

  it("uses the platform's message verbatim, so nothing from the input can reach it", () => {
    // Asserting equality with the published message is stronger than screening for forbidden substrings: any
    // rewriting or interpolation fails here, including appending a contract path that is not an input value but
    // still is not platform-authored text.
    const result = verifyArtifacts(storefront, []);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const { code, message } of result.diagnostics) {
      expect(message, code).toBe(DIAGNOSTIC_MESSAGES[code]);
    }
  });

  it("names the field in the path rather than the missing value", () => {
    const result = verifyArtifacts(storefront, []);
    for (const { path } of result.diagnostics) {
      expect(path).toMatch(/^\/(precache\/\d+\/url|identity\/(serviceWorkerUrl|manifestUrl))$/);
    }
  });

  it("rejects a published list that is not absolute paths, rather than calling everything missing", () => {
    // A caller passing relative paths would otherwise get a report that reads like a failed deployment.
    for (const wrong of [["app/index.html"], ["./app/sw.js"], [""], ["https://shop.example.com/app/sw.js"]]) {
      expect(() => verifyArtifacts(storefront, wrong), JSON.stringify(wrong)).toThrow(TypeError);
    }
  });

  it("does not echo the offending path when rejecting the list", () => {
    const secret = "app/token-abcdef123456/index.html";
    try {
      verifyArtifacts(storefront, [secret]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

/**
 * `plan.install.screenshots[].src` and `plan.install.shortcuts[].icons[].src` are checked against published paths
 * the same way precache entries are: verbatim membership, reported by field path.
 */
describe("verifyArtifacts — manifest asset existence", () => {
  function withInstallAssets(): PwaPlan {
    const plan = structuredClone(storefront);
    return {
      ...plan,
      install: {
        ...plan.install!,
        screenshots: [
          { src: "/app/screenshots/wide-1.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
          { src: "/app/screenshots/narrow-1.png", sizes: "540x720", type: "image/png", formFactor: "narrow" },
        ],
        shortcuts: [
          {
            name: "Cart",
            url: "/app/cart",
            icons: [{ src: "/app/icons/cart-96.png", sizes: "96x96", type: "image/png", purpose: "any" }],
          },
        ],
      },
    };
  }

  it("reports a missing screenshot at its field path, not its value", () => {
    const plan = withInstallAssets();
    const published = [...complete(plan), "/app/screenshots/narrow-1.png", "/app/icons/cart-96.png"];
    const result = verifyArtifacts(plan, published);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        code: "verify.manifest-asset-missing",
        severity: "error",
        path: "/install/screenshots/0/src",
        message: DIAGNOSTIC_MESSAGES["verify.manifest-asset-missing"],
      },
    ]);
    for (const { message, path } of result.diagnostics) {
      expect(message).not.toContain("/app/screenshots/wide-1.png");
      expect(path).not.toContain("wide-1.png");
    }
  });

  it("reports a missing shortcut icon at its field path, not its value", () => {
    const plan = withInstallAssets();
    const published = [...complete(plan), "/app/screenshots/wide-1.png", "/app/screenshots/narrow-1.png"];
    const result = verifyArtifacts(plan, published);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        code: "verify.manifest-asset-missing",
        severity: "error",
        path: "/install/shortcuts/0/icons/0/src",
        message: DIAGNOSTIC_MESSAGES["verify.manifest-asset-missing"],
      },
    ]);
  });

  it("passes when every screenshot and shortcut icon was published", () => {
    const plan = withInstallAssets();
    const published = [
      ...complete(plan),
      "/app/screenshots/wide-1.png",
      "/app/screenshots/narrow-1.png",
      "/app/icons/cart-96.png",
    ];
    expect(verifyArtifacts(plan, published)).toEqual({ name: "artifacts", ok: true, diagnostics: [] });
  });

  it("reports every missing screenshot and shortcut icon, each at its own index path", () => {
    const plan: PwaPlan = {
      ...withInstallAssets(),
      install: {
        ...withInstallAssets().install!,
        screenshots: [
          { src: "/app/screenshots/wide-1.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
          { src: "/app/screenshots/wide-2.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
        ],
        shortcuts: [
          {
            name: "Cart",
            url: "/app/cart",
            icons: [
              { src: "/app/icons/cart-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
              { src: "/app/icons/cart-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            ],
          },
          {
            name: "Wishlist",
            url: "/app/wishlist",
            icons: [{ src: "/app/icons/wishlist-96.png", sizes: "96x96", type: "image/png", purpose: "any" }],
          },
        ],
      },
    };
    const result = verifyArtifacts(plan, complete(plan));

    expect(result.diagnostics.map(({ path }) => path)).toEqual([
      "/install/screenshots/0/src",
      "/install/screenshots/1/src",
      "/install/shortcuts/0/icons/0/src",
      "/install/shortcuts/0/icons/1/src",
      "/install/shortcuts/1/icons/0/src",
    ]);
  });

  it("is unaffected when install is null", () => {
    expect(verifyArtifacts(rootMinimal, complete(rootMinimal))).toEqual({
      name: "artifacts",
      ok: true,
      diagnostics: [],
    });
  });

  it("is unaffected when install has neither screenshots nor shortcuts", () => {
    // storefront's fixture install carries no screenshots/shortcuts fields at all; the result must be identical
    // to the pre-revision behaviour, not merely "ok".
    expect(verifyArtifacts(storefront, complete(storefront))).toEqual({
      name: "artifacts",
      ok: true,
      diagnostics: [],
    });
  });
});
