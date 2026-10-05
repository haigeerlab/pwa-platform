import { describe, expect, it } from "vitest";
import { validatePlan, validatePolicy } from "../src/index.js";
import { plan, policy } from "./fixtures.js";

describe("explicit navigation retry", () => {
  it("accepts a bounded retry sharing the existing navigation deadline", () => {
    expect(validatePolicy({ ...policy, networkTimeoutSeconds: 5, navigationRetry: { delayMilliseconds: 1000 } }).ok).toBe(true);
    expect(validatePlan({ ...plan, networkTimeoutSeconds: 5, navigationRetry: { delayMilliseconds: 1000 } }).ok).toBe(true);
  });

  it.each([99, 3001, 1.5, "1000", undefined])("rejects invalid retry delay %s", (delayMilliseconds) => {
    expect(validatePolicy({ ...policy, networkTimeoutSeconds: 5, navigationRetry: { delayMilliseconds } }).ok).toBe(false);
  });

  it.each([2, 3])("accepts the same explicit retry in policy version %s", (schemaVersion) => {
    const next = { ...policy, schemaVersion, networkTimeoutSeconds: 5, navigationRetry: { delayMilliseconds: 1000 },
      offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
      ...(schemaVersion === 3 ? { runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 } } : {}),
    };
    expect(validatePolicy(next).ok).toBe(true);
  });

  it("requires an explicit timeout and a delay smaller than the total budget", () => {
    for (const base of [policy, { ...policy, networkTimeoutSeconds: 1 }]) {
      expect(validatePolicy({ ...base, navigationRetry: { delayMilliseconds: 1000 } }).ok).toBe(false);
    }
    expect(validatePlan({ ...plan, navigationRetry: { delayMilliseconds: 1000 } }).ok).toBe(false);
  });

  it("keeps the retry shape closed and leaves old configurations without a new key", () => {
    expect(validatePolicy({ ...policy, networkTimeoutSeconds: 5, navigationRetry: { delayMilliseconds: 1000, maxRetries: 10 } }).ok).toBe(false);
    const result = validatePolicy(policy);
    expect(result.ok && Object.hasOwn(result.value, "navigationRetry")).toBe(false);
  });
});
