// Shared browser fakes for the client entry's tests (test/client/*.test.ts). Kept in one place so every test file
// stubs the same shapes spec/push-module.md "设计 / 3" describes: `navigator.serviceWorker.getRegistration(scope)`,
// `registration.pushManager.getSubscription()`/`.subscribe(options)`, `subscription.toJSON()`/`.unsubscribe()`, and
// `Notification.permission`/`.requestPermission()`. Each stub function calls `vi.stubGlobal`; every test file that
// uses one of these must call `vi.unstubAllGlobals()` in an `afterEach` so a stub never leaks into the next test.
import { vi } from "vitest";

export const SCOPE: string = "/app/";
export const ORIGIN: string = "https://example.test";
export const SCOPE_URL: string = `${ORIGIN}${SCOPE}`;

/** A syntactically valid uncompressed P-256 public key: 65 bytes, first byte 0x04, deterministic filler. */
export function rawKey(firstByte = 0x04, length = 65): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = firstByte;
  for (let index = 1; index < length; index += 1) bytes[index] = index % 256;
  return bytes;
}

/** Encodes bytes as base64url with no padding — the format `subscribePush`'s `applicationServerKey` expects. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type FakeSubscription = {
  readonly endpoint: string;
  readonly options: { readonly applicationServerKey: ArrayBuffer | null };
  readonly toJSON: () => PushSubscriptionJSON;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
};

/** Builds a fake `PushSubscription`. `unsubscribeResult`/`unsubscribeError` configure what `.unsubscribe()` does. */
export function fakeSubscription(config: {
  readonly endpoint?: string;
  readonly applicationServerKey?: ArrayBuffer | null;
  readonly unsubscribeResult?: boolean;
  readonly unsubscribeError?: Error;
} = {}): FakeSubscription {
  const endpoint = config.endpoint ?? `${ORIGIN}/push/endpoint`;
  const unsubscribe = vi.fn(async (): Promise<boolean> => {
    if (config.unsubscribeError !== undefined) throw config.unsubscribeError;
    return config.unsubscribeResult ?? true;
  });
  return {
    endpoint,
    options: { applicationServerKey: config.applicationServerKey ?? null },
    toJSON: () => ({ endpoint, expirationTime: null, keys: {} }) as unknown as PushSubscriptionJSON,
    unsubscribe,
  };
}

export type FakePushManager = {
  readonly getSubscription: ReturnType<typeof vi.fn>;
  readonly subscribe: ReturnType<typeof vi.fn>;
};

/**
 * Builds a fake `PushManager`. `subscription` is what `getSubscription()` resolves (default `null`); `subscribe()`
 * resolves `subscribeResult` or rejects `subscribeError` when called — calling it unconfigured is a test bug.
 */
export function fakePushManager(config: {
  readonly subscription?: FakeSubscription | null;
  readonly subscribeResult?: FakeSubscription;
  readonly subscribeError?: unknown;
} = {}): FakePushManager {
  return {
    getSubscription: vi.fn(async (): Promise<FakeSubscription | null> => config.subscription ?? null),
    subscribe: vi.fn(async (): Promise<FakeSubscription> => {
      if (config.subscribeError !== undefined) throw config.subscribeError;
      if (config.subscribeResult === undefined) throw new Error("fakePushManager: subscribe() was not configured for this test");
      return config.subscribeResult;
    }),
  };
}

export type FakeRegistration = {
  readonly scope: string;
  readonly pushManager: FakePushManager;
};

/** `scope` is the registration's OWN scope (an absolute URL) — pass one that differs from `SCOPE_URL` to test the exact-scope check. */
export function fakeRegistration(pushManager: FakePushManager, scope: string = SCOPE_URL): FakeRegistration {
  return { scope, pushManager };
}

export type FakeServiceWorkerContainer = {
  readonly getRegistration: ReturnType<typeof vi.fn>;
  /** Spies on `.register` and throws if ever called — this entry must never register a worker (spec "从不注册 worker"). */
  readonly register: ReturnType<typeof vi.fn>;
};

/** Stubs `location` (only `.href` is read by the client entry). */
export function stubLocation(href: string = SCOPE_URL): void {
  vi.stubGlobal("location", { href });
}

/** Stubs `navigator` with a `serviceWorker` container whose `getRegistration` always resolves `registration`. */
export function stubNavigator(registration: FakeRegistration | undefined): FakeServiceWorkerContainer {
  const getRegistration = vi.fn(async (): Promise<FakeRegistration | undefined> => registration);
  const register = vi.fn(() => {
    throw new Error("navigator.serviceWorker.register must never be called by this entry");
  });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration, register } });
  return { getRegistration, register };
}

/** Stubs `navigator` as an object that does not carry a `serviceWorker` property at all. */
export function stubNavigatorWithoutServiceWorker(): void {
  vi.stubGlobal("navigator", {});
}

/** Stubs the global `PushManager` constructor (only its existence is checked). */
export function stubPushManagerGlobal(): void {
  vi.stubGlobal("PushManager", class FakePushManagerCtor {});
}

export type NotificationStub = {
  readonly requestPermission: ReturnType<typeof vi.fn>;
  setPermission(permission: NotificationPermission): void;
};

/** Stubs the global `Notification` with a mutable `.permission` and a spy `.requestPermission()`. */
export function stubNotificationGlobal(
  initialPermission: NotificationPermission = "default",
  requestPermissionImpl: () => Promise<NotificationPermission> = async () => "granted",
): NotificationStub {
  let permission = initialPermission;
  const requestPermission = vi.fn(requestPermissionImpl);
  vi.stubGlobal("Notification", {
    get permission(): NotificationPermission {
      return permission;
    },
    requestPermission,
  });
  return {
    requestPermission,
    setPermission: (value: NotificationPermission) => {
      permission = value;
    },
  };
}

/** Stubs all four browser globals `isSupported()` checks, plus `location`, so `getPushState`/`subscribePush`/`unsubscribePush` see a fully-capable browser. */
export function stubFullySupported(
  registration: FakeRegistration | undefined,
  initialPermission: NotificationPermission = "default",
  requestPermissionImpl?: () => Promise<NotificationPermission>,
): { readonly container: FakeServiceWorkerContainer; readonly notification: NotificationStub } {
  const container = stubNavigator(registration);
  stubPushManagerGlobal();
  const notification = stubNotificationGlobal(initialPermission, requestPermissionImpl);
  stubLocation();
  return { container, notification };
}
