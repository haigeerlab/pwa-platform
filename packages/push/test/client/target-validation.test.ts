// Target validation runs first in all three exported functions (spec/push-module.md "设计 / 3" "Target validation").
// Every invalid target rejects (or, for unsubscribePush, still rejects — target validation precedes the "unsupported
// or no registration -> null" fallback) with push.invalid-target as an async rejection, never a synchronous throw.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushState, subscribePush, unsubscribePush, PwaPushClientError } from "../../src/client/index.js";
import { rawKey, stubFullySupported, toBase64Url } from "./support/env.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const INVALID_TARGETS: readonly unknown[] = ["app/", "/app", "/app/?x", "/app/#x", 42, undefined, null, {}, { scope: 42 }];

type Target = { readonly scope: string };

function target(value: unknown): Target {
  return value as Target;
}

describe("target validation: getPushState", () => {
  for (const value of INVALID_TARGETS) {
    it(`rejects push.invalid-target for ${JSON.stringify(value)}`, async () => {
      const promise = getPushState(target(value));
      await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
      await expect(promise.catch((error: PwaPushClientError) => error.code)).resolves.toBe("push.invalid-target");
    });
  }

  it("is an async rejection, not a synchronous throw", async () => {
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = getPushState(target(42));
    }).not.toThrow();
    await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
  });
});

describe("target validation: subscribePush", () => {
  const key = toBase64Url(rawKey());

  for (const value of INVALID_TARGETS) {
    it(`rejects push.invalid-target for ${JSON.stringify(value)}`, async () => {
      const promise = subscribePush(target(value), { applicationServerKey: key });
      await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
      await expect(promise.catch((error: PwaPushClientError) => error.code)).resolves.toBe("push.invalid-target");
    });
  }

  it("is an async rejection, not a synchronous throw", async () => {
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = subscribePush(target(42), { applicationServerKey: key });
    }).not.toThrow();
    await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
  });
});

describe("target validation: unsubscribePush", () => {
  for (const value of INVALID_TARGETS) {
    it(`rejects push.invalid-target for ${JSON.stringify(value)}`, async () => {
      const promise = unsubscribePush(target(value));
      await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
      await expect(promise.catch((error: PwaPushClientError) => error.code)).resolves.toBe("push.invalid-target");
    });
  }

  it("is an async rejection, not a synchronous throw", async () => {
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = unsubscribePush(target(42));
    }).not.toThrow();
    await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
  });
});

describe("target validation runs before feature detection", () => {
  it("an invalid target rejects even when the browser is fully supported", async () => {
    stubFullySupported(undefined);
    await expect(getPushState(target("no-slashes"))).rejects.toMatchObject({ code: "push.invalid-target" });
  });
});
