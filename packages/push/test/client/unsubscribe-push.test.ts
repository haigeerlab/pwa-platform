// unsubscribePush: spec/push-module.md "设计 / 3". unsupported or no matching registration both resolve null (no
// error); no subscription resolves null; otherwise the cancelled subscription's toJSON() is captured before
// unsubscribe() runs, and a false result or a rejection both become push.unsubscribe-failed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { unsubscribePush, PwaPushClientError } from "../../src/client/index.js";
import { fakePushManager, fakeRegistration, fakeSubscription, SCOPE, SCOPE_URL, stubFullySupported, stubNavigatorWithoutServiceWorker } from "./support/env.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unsubscribePush: unsupported or no matching registration", () => {
  it("unsupported browser resolves null", async () => {
    stubNavigatorWithoutServiceWorker();
    await expect(unsubscribePush({ scope: SCOPE })).resolves.toBeNull();
  });

  it("no registration for the scope resolves null", async () => {
    stubFullySupported(undefined);
    await expect(unsubscribePush({ scope: SCOPE })).resolves.toBeNull();
  });

  it("registration with a different own scope resolves null", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager, `${SCOPE_URL}sub/`);
    stubFullySupported(registration);
    await expect(unsubscribePush({ scope: SCOPE })).resolves.toBeNull();
  });
});

describe("unsubscribePush: no subscription", () => {
  it("resolves null without calling unsubscribe on anything", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);
    await expect(unsubscribePush({ scope: SCOPE })).resolves.toBeNull();
  });
});

describe("unsubscribePush: success", () => {
  it("returns the cancelled subscription's toJSON()", async () => {
    const subscription = fakeSubscription({ unsubscribeResult: true });
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);

    const result = await unsubscribePush({ scope: SCOPE });
    expect(result).toEqual(subscription.toJSON());
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("unsubscribePush: unsubscribe() returns false", () => {
  it("rejects push.unsubscribe-failed", async () => {
    const subscription = fakeSubscription({ unsubscribeResult: false });
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);

    await expect(unsubscribePush({ scope: SCOPE })).rejects.toMatchObject({ code: "push.unsubscribe-failed" });
  });
});

describe("unsubscribePush: unsubscribe() rejects", () => {
  const MARKER = "UNSUBSCRIBE-FAIL-MARKER-7c1";

  it("rejects push.unsubscribe-failed, dropping the browser error entirely", async () => {
    const subscription = fakeSubscription({ unsubscribeError: new Error(`NetworkError: ${MARKER}`) });
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);

    let caught: unknown;
    try {
      await unsubscribePush({ scope: SCOPE });
      throw new Error("expected unsubscribePush to reject");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaPushClientError);
    const error = caught as PwaPushClientError;
    expect(error.code).toBe("push.unsubscribe-failed");
    expect(error.message).not.toContain(MARKER);
    expect(JSON.stringify(error)).not.toContain(MARKER);
    expect(String(error)).not.toContain(MARKER);
  });
});

describe("unsubscribePush: no failure path ever leaks a subscription endpoint", () => {
  const ENDPOINT_MARKER = "https://push.example/ENDPOINT-MARKER";

  it("unsubscribe() returning false", async () => {
    const subscription = fakeSubscription({ endpoint: ENDPOINT_MARKER, unsubscribeResult: false });
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);

    let caught: unknown;
    try {
      await unsubscribePush({ scope: SCOPE });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaPushClientError);
    expect(JSON.stringify(caught)).not.toContain(ENDPOINT_MARKER);
    expect(String(caught)).not.toContain(ENDPOINT_MARKER);
  });

  it("unsubscribe() rejecting", async () => {
    const subscription = fakeSubscription({ endpoint: ENDPOINT_MARKER, unsubscribeError: new Error(`failed for ${ENDPOINT_MARKER}`) });
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);

    let caught: unknown;
    try {
      await unsubscribePush({ scope: SCOPE });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaPushClientError);
    expect(JSON.stringify(caught)).not.toContain(ENDPOINT_MARKER);
    expect(String(caught)).not.toContain(ENDPOINT_MARKER);
  });
});
