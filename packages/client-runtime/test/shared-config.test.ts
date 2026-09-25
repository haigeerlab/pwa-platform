import { describe, expect, it } from "vitest";
import { validateClientConfig, type PwaClientConfig } from "../src/shared/config.js";

const VALID: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

/** A copy of VALID with one field replaced, typed loosely so invalid values can be passed in. */
function withField(field: string, value: unknown): unknown {
  return { ...VALID, [field]: value };
}

describe("validateClientConfig", () => {
  it("returns a fresh copy with the fields in canonical order", () => {
    const result = validateClientConfig({ ...VALID });
    expect(result).toEqual(VALID);
    expect(Object.keys(result)).toEqual(["appId", "scope", "serviceWorkerUrl", "updateMode", "installEnabled"]);
  });

  it("is independent of the input's key order and does not keep the input object", () => {
    const reordered = Object.fromEntries(Object.entries(VALID).reverse());
    const result = validateClientConfig(reordered);
    expect(result).toEqual(VALID);
    expect(result).not.toBe(reordered);
  });

  it("accepts a config whose scope is the origin root", () => {
    expect(validateClientConfig({ ...VALID, scope: "/", serviceWorkerUrl: "/sw.js" })).toEqual({
      ...VALID,
      scope: "/",
      serviceWorkerUrl: "/sw.js",
    });
  });

  it("accepts installEnabled false", () => {
    expect(validateClientConfig({ ...VALID, installEnabled: false }).installEnabled).toBe(false);
  });

  it("rejects values that are not plain objects", () => {
    for (const value of [null, undefined, 1, "config", [], [VALID], new Map()]) {
      expect(() => validateClientConfig(value), JSON.stringify(String(value))).toThrow(/config must be a plain object/);
    }
  });

  it("accepts a null-prototype object, as a structured clone produces", () => {
    expect(validateClientConfig(Object.assign(Object.create(null) as object, VALID))).toEqual(VALID);
  });

  it("rejects missing and extra fields", () => {
    for (const dropped of ["appId", "scope", "serviceWorkerUrl", "updateMode", "installEnabled"]) {
      const missing = Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== dropped));
      expect(() => validateClientConfig(missing), dropped).toThrow(/config must have exactly the fields/);
    }
    expect(() => validateClientConfig({ ...VALID, extra: 1 })).toThrow(/config must have exactly the fields/);
  });

  it("rejects an appId that is not a non-empty string", () => {
    for (const value of ["", 1, null, undefined]) {
      expect(() => validateClientConfig(withField("appId", value)), String(value)).toThrow(
        /config\.appId must be a non-empty string/,
      );
    }
  });

  it("requires a canonical absolute scope that ends with a slash", () => {
    for (const value of ["app/", "/app", "//app/", "/app\\/", "/app/?x=1", "/app/#a", "/app/../", 1, null]) {
      expect(() => validateClientConfig(withField("scope", value)), String(value)).toThrow(
        /config\.scope must (be a canonical absolute path|end with)/,
      );
    }
  });

  it("requires a canonical absolute service worker URL", () => {
    for (const value of ["sw.js", "/app//sw.js", "/app/sw.js?v=1", "/app/sw.js#x", 1, null]) {
      expect(() => validateClientConfig(withField("serviceWorkerUrl", value)), String(value)).toThrow(
        /config\.serviceWorkerUrl must be (a canonical absolute path|inside)/,
      );
    }
  });

  it("rejects a service worker URL outside the scope, which could never control the scope's pages", () => {
    expect(() => validateClientConfig({ ...VALID, serviceWorkerUrl: "/sw.js" })).toThrow(
      /config\.serviceWorkerUrl must be inside config\.scope/,
    );
    expect(() => validateClientConfig({ ...VALID, scope: "/app/", serviceWorkerUrl: "/other/sw.js" })).toThrow(
      /config\.serviceWorkerUrl must be inside config\.scope/,
    );
  });

  it("rejects an updateMode other than prompt", () => {
    for (const value of ["immediate", "", null, undefined, 1]) {
      expect(() => validateClientConfig(withField("updateMode", value)), String(value)).toThrow(
        /config\.updateMode must be "prompt"/,
      );
    }
  });

  it("rejects a non-boolean installEnabled", () => {
    for (const value of ["true", 1, 0, null, undefined]) {
      expect(() => validateClientConfig(withField("installEnabled", value)), String(value)).toThrow(
        /config\.installEnabled must be a boolean/,
      );
    }
  });

  it("never echoes the offending value in the message", () => {
    const secret = "/app/token-abcdef123456/";
    try {
      validateClientConfig({ ...VALID, scope: `${secret}?leak` });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
