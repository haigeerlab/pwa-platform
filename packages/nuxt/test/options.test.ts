import { DIAGNOSTIC_MESSAGES, type PwaIdentity, type PwaInstallMetadata, type PwaPolicy } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { RECOVERY_RELEASE_INVALID_TYPE_CODE, validateOptions } from "../src/options.js";
import { IDENTITY, INSTALL, options, POLICY } from "./fixtures.js";

describe("validateOptions", () => {
  it("accepts a complete set of options", () => {
    const validated = validateOptions(options());
    expect(validated.identity.appId).toBe("storefront");
    expect(validated.install).not.toBeNull();
  });

  it("accepts a null install, which means the app offers no installation", () => {
    expect(validateOptions(options({ install: null })).install).toBeNull();
  });

  it("preserves a validated v2 offline-write policy for the build pipeline", () => {
    const v2: PwaPolicy = {
      ...POLICY,
      schemaVersion: 2,
      resources: [{ pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
      offlineWrites: { enabled: true, maxEntries: 1, maxTotalBodyBytes: 1, targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1 }] },
    };
    expect(validateOptions(options({ policy: v2 })).policy).toEqual(v2);
  });

  it("rejects an invalid identity, naming the code and the contract path", () => {
    const broken = { ...IDENTITY, origin: "ftp://shop.example.com" };
    expect(() => validateOptions(options({ identity: broken }))).toThrow(/identity\.invalid-origin at \/identity/);
  });

  it("rejects an invalid policy", () => {
    const broken = { ...POLICY, updateMode: "silent" } as unknown as PwaPolicy;
    expect(() => validateOptions(options({ policy: broken }))).toThrow(/at \/policy/);
  });

  it("checks install metadata against the identity, not on its own", () => {
    // contracts verifies that startUrl falls inside the scope, which it can only do with the identity at hand.
    const outside = { ...INSTALL, startUrl: "/elsewhere/" } as PwaInstallMetadata;
    expect(() => validateOptions(options({ install: outside }))).toThrow(/install\.start-url-outside-scope/);
  });

  it("rejects options that are not an object at all", () => {
    for (const broken of [null, "config", 7, []]) {
      expect(() => validateOptions(broken), JSON.stringify(broken)).toThrow(TypeError);
    }
  });

  it("throws a clear, distinct error when the pwaPlatform key is missing entirely", () => {
    // Nuxt hands the module `{}` when nuxt.config has no `pwaPlatform` key at all (getOptions falls back to `{}`).
    expect(() => validateOptions(undefined)).toThrow(/requires an options object under the "pwaPlatform" key/);
    expect(() => validateOptions({})).toThrow(/requires an options object under the "pwaPlatform" key/);
  });

  it("never echoes an option value into the error message", () => {
    // Build logs get pasted into issues. An origin, a scope or an app id must not travel with them.
    const secret = "https://unreleased-tenant.example.com";
    const broken = { ...IDENTITY, origin: `${secret}/trailing` };
    try {
      validateOptions(options({ identity: broken }));
      expect.unreachable("should have thrown");
    } catch (error) {
      const { message } = error as Error;
      expect(message).not.toContain(secret);
      expect(message).not.toContain("unreleased-tenant");
      // What it does carry is the platform's own vocabulary: codes and contract paths.
      expect(message).toMatch(/identity\.[a-z-]+ at \/identity/);
    }
  });

  it("uses diagnostic codes the platform publishes, not invented ones", () => {
    const broken = { ...IDENTITY, origin: "ftp://shop.example.com" };
    try {
      validateOptions(options({ identity: broken }));
      expect.unreachable("should have thrown");
    } catch (error) {
      const code = /((?:identity|policy|install)\.[a-z-]+)/.exec((error as Error).message)?.[1] ?? "";
      expect(Object.keys(DIAGNOSTIC_MESSAGES)).toContain(code);
    }
  });

  it("rejects an identity that is present but not an object", () => {
    const broken = { identity: "nope" } as unknown as { identity: PwaIdentity };
    expect(() => validateOptions(broken)).toThrow(TypeError);
  });

  describe("recoveryRelease (T7b)", () => {
    it("defaults to false when omitted", () => {
      expect(validateOptions(options()).recoveryRelease).toBe(false);
    });

    it("accepts an explicit true", () => {
      expect(validateOptions(options({ recoveryRelease: true })).recoveryRelease).toBe(true);
    });

    it("accepts an explicit false", () => {
      expect(validateOptions(options({ recoveryRelease: false })).recoveryRelease).toBe(false);
    });

    it("rejects a non-boolean value with a code and a contract path, never the value itself", () => {
      const secret = "yes-please-enable-it";
      for (const broken of ["true", 1, secret, {}]) {
        expect(() => validateOptions(options({ recoveryRelease: broken as unknown as boolean }))).toThrow(
          new RegExp(`^${RECOVERY_RELEASE_INVALID_TYPE_CODE}:`),
        );
      }
      try {
        validateOptions(options({ recoveryRelease: secret as unknown as boolean }));
        expect.unreachable("should have thrown");
      } catch (error) {
        const { message } = error as Error;
        expect(message).not.toContain(secret);
        expect(message).toContain("/recoveryRelease");
      }
    });
  });
});
