// getPushState: the six-way status read (spec/push-module.md "设计 / 3"). This is a read-only check, so every test
// here also asserts it never requests permission and never registers a worker (the register spy in
// stubNavigator/stubFullySupported throws if it is ever called, which would fail the test outright).
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushState, PwaPushClientError } from "../../src/client/index.js";
import {
  fakePushManager,
  fakeRegistration,
  fakeSubscription,
  SCOPE,
  SCOPE_URL,
  stubFullySupported,
  stubNavigatorWithoutServiceWorker,
  stubNotificationGlobal,
  stubPushManagerGlobal,
} from "./support/env.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPushState: unsupported", () => {
  it("navigator missing entirely", async () => {
    // No navigator stubbed at all: node's default global has none.
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("unsupported");
  });

  it("navigator present but without serviceWorker", async () => {
    stubNavigatorWithoutServiceWorker();
    stubPushManagerGlobal();
    stubNotificationGlobal();
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("unsupported");
  });

  it("PushManager missing", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    const { container } = stubFullySupported(registration);
    vi.stubGlobal("PushManager", undefined); // undo just this one stub so it reads as missing again
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("unsupported");
    expect(container.getRegistration).not.toHaveBeenCalled();
  });

  it("Notification missing", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    stubFullySupported(registration);
    vi.stubGlobal("Notification", undefined);
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("unsupported");
  });
});

describe("getPushState: no-registration", () => {
  it("no registration for the scope at all", async () => {
    const { container, notification } = stubFullySupported(undefined);
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("no-registration");
    expect(container.getRegistration).toHaveBeenCalledWith(SCOPE);
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });

  it("registration returned but its own scope differs from the requested one", async () => {
    // getRegistration(scope) can return a broader or narrower registration; only an exact scope match counts.
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager, `${SCOPE_URL}sub/`);
    stubFullySupported(registration);
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("no-registration");
  });
});

describe("getPushState: denied", () => {
  it("Notification.permission is denied, even with a subscription present", async () => {
    const subscription = fakeSubscription();
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "denied");
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("denied");
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("getPushState: subscribed", () => {
  it("a subscription exists", async () => {
    const subscription = fakeSubscription();
    const pushManager = fakePushManager({ subscription });
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "granted");
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("subscribed");
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe("getPushState: prompt", () => {
  it("no subscription and permission is still default", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "default");
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("prompt");
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("getPushState: not-subscribed", () => {
  it("no subscription and permission is granted", async () => {
    const pushManager = fakePushManager();
    const registration = fakeRegistration(pushManager);
    const { notification } = stubFullySupported(registration, "granted");
    await expect(getPushState({ scope: SCOPE })).resolves.toBe("not-subscribed");
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe("getPushState: invalid target", () => {
  it("rejects with push.invalid-target before touching any global", async () => {
    stubFullySupported(undefined);
    const promise = getPushState({ scope: "app/" });
    await expect(promise).rejects.toBeInstanceOf(PwaPushClientError);
    await expect(promise.catch((error: PwaPushClientError) => error.code)).resolves.toBe("push.invalid-target");
  });
});
