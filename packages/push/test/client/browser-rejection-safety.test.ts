import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushState, PwaPushClientError, subscribePush, unsubscribePush } from "../../src/client/index.js";
import { fakePushManager, fakeRegistration, rawKey, SCOPE, stubFullySupported, toBase64Url } from "./support/env.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_KEY = toBase64Url(rawKey());
const ENDPOINT_MARKER = "https://push.example/ENDPOINT-MARKER";

async function expectSafeClientError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
    throw new Error("expected the promise to reject");
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PwaPushClientError);
  expect(caught).toMatchObject({ code });
  expect(String(caught)).not.toContain(ENDPOINT_MARKER);
  expect(JSON.stringify(caught)).not.toContain(ENDPOINT_MARKER);
  expect("cause" in (caught as object)).toBe(false);
}

describe("client entry: browser API rejections", () => {
  it("getPushState replaces a getRegistration rejection that contains an endpoint", async () => {
    const { container } = stubFullySupported(undefined);
    container.getRegistration.mockRejectedValue(new Error(`registration lookup failed for ${ENDPOINT_MARKER}`));

    await expectSafeClientError(getPushState({ scope: SCOPE }), "push.registration-failed");
  });

  it("subscribePush replaces a getSubscription rejection that contains an endpoint", async () => {
    const pushManager = fakePushManager();
    pushManager.getSubscription.mockRejectedValue(new Error(`subscription lookup failed for ${ENDPOINT_MARKER}`));
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "granted");

    await expectSafeClientError(subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY }), "push.subscription-failed");
  });

  it("unsubscribePush replaces a getRegistration rejection that contains an endpoint", async () => {
    const { container } = stubFullySupported(undefined);
    container.getRegistration.mockRejectedValue(new Error(`registration lookup failed for ${ENDPOINT_MARKER}`));

    await expectSafeClientError(unsubscribePush({ scope: SCOPE }), "push.registration-failed");
  });
});
