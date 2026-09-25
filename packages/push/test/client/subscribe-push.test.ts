// subscribePush: spec/push-module.md "设计 / 3" "subscribePush order". Order under test: target -> unsupported ->
// key validation (before the browser is touched) -> registration -> existing-subscription comparison -> permission
// -> pushManager.subscribe. Every failure path is also checked for leaking the subscription endpoint or the raw
// browser error into the thrown PwaPushClientError.
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribePush, PwaPushClientError } from "../../src/client/index.js";
import type { PwaPushClientErrorCode } from "../../src/client/index.js";
import { fakePushManager, fakeRegistration, fakeSubscription, rawKey, SCOPE, stubFullySupported, stubNavigatorWithoutServiceWorker, toBase64Url } from "./support/env.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_KEY = toBase64Url(rawKey());

async function codeOf(promise: Promise<unknown>): Promise<PwaPushClientErrorCode> {
  try {
    await promise;
    throw new Error("expected the promise to reject");
  } catch (error) {
    if (!(error instanceof PwaPushClientError)) throw error;
    return error.code;
  }
}

describe("subscribePush: unsupported", () => {
  it("rejects push.unsupported and never reads a registration", async () => {
    stubNavigatorWithoutServiceWorker();
    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.unsupported");
  });
});

describe("subscribePush: key validation runs before the browser is touched", () => {
  const cases: readonly { readonly name: string; readonly key: string }[] = [
    { name: "wrong alphabet (contains '+')", key: "a+b".padEnd(87, "a") },
    { name: "padding '='", key: `${toBase64Url(rawKey()).slice(0, -1)}=` },
    { name: "64 bytes (too short)", key: toBase64Url(rawKey(0x04, 64)) },
    { name: "66 bytes (too long)", key: toBase64Url(rawKey(0x04, 66)) },
    { name: "wrong first byte (0x02, compressed point)", key: toBase64Url(rawKey(0x02, 65)) },
  ];

  for (const { name, key } of cases) {
    it(`${name} -> push.invalid-key, getRegistration never called`, async () => {
      const { container } = stubFullySupported(undefined);
      const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: key });
      expect(await codeOf(promise)).toBe("push.invalid-key");
      expect(container.getRegistration).not.toHaveBeenCalled();
    });
  }
});

describe("subscribePush: no-registration", () => {
  it("rejects push.no-registration for a valid key with no matching registration", async () => {
    stubFullySupported(undefined);
    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.no-registration");
  });
});

describe("subscribePush: existing subscription", () => {
  it("same key: returns the existing subscription's toJSON(), without requesting permission or subscribing again", async () => {
    const existing = fakeSubscription({ applicationServerKey: rawKey().buffer as ArrayBuffer });
    const pushManager = fakePushManager({ subscription: existing });
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "default");

    const result = await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(result).toEqual(existing.toJSON());
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("different key: rejects push.key-mismatch and never unsubscribes the existing subscription", async () => {
    const existing = fakeSubscription({ applicationServerKey: rawKey(0x04, 65).buffer as ArrayBuffer });
    // Flip a byte so the stored key differs from VALID_KEY's bytes.
    const differentKeyBuffer = new Uint8Array(existing.options.applicationServerKey as ArrayBuffer);
    differentKeyBuffer[10] = (differentKeyBuffer[10] ?? 0) ^ 0xff;
    const differing = fakeSubscription({ applicationServerKey: differentKeyBuffer.buffer as ArrayBuffer });
    const pushManager = fakePushManager({ subscription: differing });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "default");

    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.key-mismatch");
    expect(differing.unsubscribe).not.toHaveBeenCalled();
  });

  it("existing subscription with a null stored key: rejects push.key-mismatch", async () => {
    const existing = fakeSubscription({ applicationServerKey: null });
    const pushManager = fakePushManager({ subscription: existing });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "default");

    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.key-mismatch");
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });
});

describe("subscribePush: permission", () => {
  it("default -> granted: requests permission once, then subscribes with userVisibleOnly true and the decoded bytes", async () => {
    const pushManager = fakePushManager({ subscribeResult: fakeSubscription() });
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "default", async () => "granted");

    await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    const call = pushManager.subscribe.mock.calls[0]?.[0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(call.userVisibleOnly).toBe(true);
    expect(Array.from(call.applicationServerKey)).toEqual(Array.from(rawKey()));
  });

  it("default -> denied: rejects push.permission-denied and never subscribes", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "default", async () => "denied");

    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.permission-denied");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("already denied: rejects push.permission-denied without ever calling requestPermission", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "denied");

    const promise = subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(await codeOf(promise)).toBe("push.permission-denied");
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("already granted: subscribes directly without requesting permission", async () => {
    const pushManager = fakePushManager({ subscribeResult: fakeSubscription() });
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "granted");

    await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("subscribePush: subscribe() failure", () => {
  const MARKER = "SUBSCRIBE-FAIL-MARKER-9f2";

  it("any rejection from pushManager.subscribe becomes push.subscribe-failed, dropping the browser error entirely", async () => {
    const pushManager = fakePushManager({ subscribeError: new Error(`AbortError: ${MARKER}`) });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "granted");

    let caught: unknown;
    try {
      await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
      throw new Error("expected subscribePush to reject");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PwaPushClientError);
    const error = caught as PwaPushClientError;
    expect(error.code).toBe("push.subscribe-failed");
    expect(error.message).not.toContain(MARKER);
    expect(JSON.stringify(error)).not.toContain(MARKER);
    expect(String(error)).not.toContain(MARKER);
    expect("cause" in error).toBe(false);
  });
});

describe("subscribePush: no failure path ever leaks a subscription endpoint", () => {
  const ENDPOINT_MARKER = "https://push.example/ENDPOINT-MARKER";

  it("key-mismatch: the existing subscription's endpoint never reaches the thrown error", async () => {
    const existing = fakeSubscription({ endpoint: ENDPOINT_MARKER, applicationServerKey: rawKey(0x04, 65).buffer as ArrayBuffer });
    const differentKeyBuffer = new Uint8Array(existing.options.applicationServerKey as ArrayBuffer);
    differentKeyBuffer[3] = (differentKeyBuffer[3] ?? 0) ^ 0xff;
    const differing = fakeSubscription({ endpoint: ENDPOINT_MARKER, applicationServerKey: differentKeyBuffer.buffer as ArrayBuffer });
    const pushManager = fakePushManager({ subscription: differing });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "default");

    let caught: unknown;
    try {
      await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaPushClientError);
    expect(JSON.stringify(caught)).not.toContain(ENDPOINT_MARKER);
    expect(String(caught)).not.toContain(ENDPOINT_MARKER);
  });

  it("subscribe-failed: an endpoint-shaped error message never reaches the thrown error", async () => {
    const pushManager = fakePushManager({ subscribeError: new Error(`subscribe failed for ${ENDPOINT_MARKER}`) });
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration, "granted");

    let caught: unknown;
    try {
      await subscribePush({ scope: SCOPE }, { applicationServerKey: VALID_KEY });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaPushClientError);
    expect(JSON.stringify(caught)).not.toContain(ENDPOINT_MARKER);
    expect(String(caught)).not.toContain(ENDPOINT_MARKER);
  });
});
