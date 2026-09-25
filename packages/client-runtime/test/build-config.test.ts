import type { PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createClientConfig } from "../src/build/index.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const storefront = readPlan("storefront");
const rootMinimal = readPlan("root-minimal");

describe("createClientConfig", () => {
  it("takes every field from the identity and the plan", () => {
    expect(createClientConfig(storefront)).toEqual({
      appId: "storefront",
      scope: "/app/",
      serviceWorkerUrl: "/app/sw.js",
      updateMode: "prompt",
      installEnabled: true,
    });
  });

  it("reports installEnabled false when the plan has no install metadata", () => {
    expect(createClientConfig(rootMinimal)).toEqual({
      appId: "docs",
      scope: "/",
      serviceWorkerUrl: "/sw.js",
      updateMode: "prompt",
      installEnabled: false,
    });
  });

  it("carries nothing else from the plan into the page", () => {
    // The page must not receive the path rules, the precache manifest or the cache namespace.
    const serialized = JSON.stringify(createClientConfig(storefront));
    for (const leaked of ["pathRules", "precache", "cacheNamespace", "requestBaselineDenials", "offlineFallback", "/app/api/account"]) {
      expect(serialized, leaked).not.toContain(leaked);
    }
    expect(Object.keys(createClientConfig(storefront))).toEqual([
      "appId",
      "scope",
      "serviceWorkerUrl",
      "updateMode",
      "installEnabled",
    ]);
  });

  it("is deterministic and independent of the plan's key order", () => {
    const reordered = Object.fromEntries(Object.entries(storefront).reverse()) as PwaPlan;
    expect(createClientConfig(reordered)).toEqual(createClientConfig(storefront));
  });

  it("rejects an invalid plan with diagnostic codes and paths only", () => {
    const invalid = { ...storefront, updateMode: "immediate" } as unknown as PwaPlan;
    expect(() => createClientConfig(invalid)).toThrow(/Cannot create a client config from an invalid PwaPlan: schema\./);
  });

  it("rejects values that are not plans at all", () => {
    for (const value of [null, undefined, 1, "plan", []]) {
      expect(() => createClientConfig(value as unknown as PwaPlan), String(value)).toThrow(
        /Cannot create a client config from an invalid PwaPlan/,
      );
    }
  });

  it("never echoes the plan's contents in the error message", () => {
    const secret = "/app/api/token-abcdef123456";
    const invalid = {
      ...storefront,
      updateMode: "immediate",
      pathRules: [{ pathPrefix: secret, resourceClass: "session-data", action: "deny", source: "policy" }],
    } as unknown as PwaPlan;
    try {
      createClientConfig(invalid);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
