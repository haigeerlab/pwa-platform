import type { PwaClient, PwaClientConfig, PwaClientEvent, PwaClientEventType } from "@pwa-platform/client-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  bindFacade,
  createStore,
  INITIAL_STATE,
  providerEffectDeps,
  reduce,
  type PwaState,
  type PwaStore,
} from "../src/store.js";

// Spied rather than stubbed with a bare function: capturing the exact options object is what the "updateCheck
// reaches createPwaClient" suite below needs, and a minimal stand-in facade keeps it from reaching for
// navigator.serviceWorker in Node. Harmless to every other test in this file: they all pass `client` explicitly,
// so the real (mocked) `createPwaClient` is never reached by them.
const createPwaClientCalls = vi.hoisted(() => [] as unknown[]);
vi.mock("@pwa-platform/client-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pwa-platform/client-runtime")>();
  return {
    ...actual,
    createPwaClient: (options: Parameters<typeof actual.createPwaClient>[0]) => {
      createPwaClientCalls.push(options);
      return {
        register: async () => undefined,
        promptInstall: async () => "unavailable" as const,
        applyUpdate: async () => false,
        logout: async () => false,
        checkForUpdate: async () => "unavailable" as const,
        subscribe: () => () => undefined,
        dispose: () => undefined,
      };
    },
  };
});

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

function event(type: PwaClientEventType): PwaClientEvent {
  return { version: 1, type, timestamp: "2026-09-17T00:00:00.000Z", appId: "storefront", metadata: {} };
}

function apply(types: readonly PwaClientEventType[], from: PwaState = INITIAL_STATE): PwaState {
  return types.reduce<PwaState>((state, type) => reduce(state, event(type)), from);
}

type Fake = {
  readonly client: PwaClient;
  /** Method names in call order, so a store that calls the facade on its own is visible. */
  readonly calls: string[];
  readonly emit: (type: PwaClientEventType) => void;
  readonly subscriberCount: () => number;
};

function fakeClient(overrides: Partial<PwaClient> = {}): Fake {
  const listeners = new Set<(event: PwaClientEvent) => void>();
  const calls: string[] = [];
  const client: PwaClient = {
    register: async () => {
      calls.push("register");
    },
    promptInstall: async () => {
      calls.push("promptInstall");
      return "accepted";
    },
    applyUpdate: async () => {
      calls.push("applyUpdate");
      return true;
    },
    logout: async () => {
      calls.push("logout");
      return true;
    },
    checkForUpdate: async () => {
      calls.push("checkForUpdate");
      return "up-to-date";
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => undefined,
    ...overrides,
  };
  return {
    client,
    calls,
    emit: (type) => {
      for (const listener of [...listeners]) listener(event(type));
    },
    subscriberCount: () => listeners.size,
  };
}

function mounted(): { readonly store: PwaStore; readonly fake: Fake } {
  const store = createStore();
  const fake = fakeClient();
  store.attach(fake.client);
  return { store, fake };
}

describe("reduce", () => {
  it("starts with every flag false", () => {
    expect(INITIAL_STATE).toEqual({
      registered: false,
      installEligible: false,
      installed: false,
      updateWaiting: false,
    });
  });

  it("is frozen, so one caller cannot change where every later store starts", () => {
    // `readonly` is erased at runtime; this object is shared by every store in the process.
    expect(Object.isFrozen(INITIAL_STATE)).toBe(true);
  });

  it("sets registered and nothing else", () => {
    expect(apply(["registered"])).toEqual({ ...INITIAL_STATE, registered: true });
  });

  it("sets installEligible and nothing else", () => {
    expect(apply(["install-eligible"])).toEqual({ ...INITIAL_STATE, installEligible: true });
  });

  it("sets updateWaiting and nothing else", () => {
    expect(apply(["update-waiting"])).toEqual({ ...INITIAL_STATE, updateWaiting: true });
  });

  it("clears updateWaiting when the announced update takes control", () => {
    expect(apply(["update-waiting", "update-applied"])).toEqual(INITIAL_STATE);
  });

  it("clears installEligible when installed arrives", () => {
    expect(apply(["install-eligible", "installed"])).toEqual({
      ...INITIAL_STATE,
      installed: true,
      installEligible: false,
    });
  });

  it("never lets a flag fall back to false on its own", () => {
    expect(apply(["registered", "install-eligible", "installed", "update-waiting"])).toEqual({
      registered: true,
      installEligible: false,
      installed: true,
      updateWaiting: true,
    });
  });

  it("reaches the same state whichever order the events arrive in", () => {
    expect(apply(["update-waiting", "install-eligible", "registered", "installed"])).toEqual(
      apply(["registered", "install-eligible", "installed", "update-waiting"]),
    );
  });

  it("leaves the state unchanged for served-from-cache: the event carries no state the bindings expose (ADR-0035)", () => {
    const before = apply(["registered", "install-eligible", "installed", "update-waiting"]);
    expect(reduce(before, event("served-from-cache"))).toBe(before);
  });
});

describe("snapshot identity", () => {
  // useSyncExternalStore compares snapshots by reference: a fresh object for an unchanged state re-renders forever.
  it("returns the same object when an event changes nothing", () => {
    const once = apply(["registered"]);
    expect(reduce(once, event("registered"))).toBe(once);
  });

  it("returns the same object when update-applied repeats after the prompt is gone", () => {
    const applied = apply(["update-waiting", "update-applied"]);
    expect(reduce(applied, event("update-applied"))).toBe(applied);
  });

  it("returns a new object when an event does change something", () => {
    const once = apply(["registered"]);
    expect(reduce(once, event("installed"))).not.toBe(once);
  });

  it("hands out a stable snapshot across repeated reads", () => {
    const { store, fake } = mounted();
    fake.emit("registered");
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    fake.emit("registered");
    expect(store.getSnapshot()).toBe(first);
  });
});

describe("subscription", () => {
  it("starts from the initial state before anything happens", () => {
    expect(createStore().getSnapshot()).toEqual(INITIAL_STATE);
  });

  it("subscribes to the facade on attach", () => {
    const store = createStore();
    const fake = fakeClient();
    expect(fake.subscriberCount()).toBe(0);
    store.attach(fake.client);
    expect(fake.subscriberCount()).toBe(1);
  });

  it("notifies listeners when the state changes", () => {
    const { store, fake } = mounted();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    fake.emit("registered");
    expect(notifications).toBe(1);
    expect(store.getSnapshot().registered).toBe(true);
  });

  it("does not notify when an event changes nothing", () => {
    // Waking React for a no-op event would re-render the tree while getSnapshot returns the very same object.
    const { store, fake } = mounted();
    fake.emit("registered");

    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    fake.emit("registered");
    expect(notifications).toBe(0);
  });

  it("stops notifying an unsubscribed listener", () => {
    const { store, fake } = mounted();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    unsubscribe();
    fake.emit("registered");
    expect(notifications).toBe(0);
  });

  it("delivers to the remaining listeners when one unsubscribes mid-dispatch", () => {
    const { store, fake } = mounted();
    const seen: string[] = [];
    const stopFirst = store.subscribe(() => {
      seen.push("first");
      stopFirst();
    });
    store.subscribe(() => {
      seen.push("second");
    });

    fake.emit("registered");
    expect(seen).toEqual(["first", "second"]);
  });

  it("stops tracking events after detach", () => {
    const { store, fake } = mounted();
    fake.emit("registered");
    store.detach();
    expect(fake.subscriberCount()).toBe(0);

    fake.emit("update-waiting");
    expect(store.getSnapshot().updateWaiting).toBe(false);
  });

  it("tracks a freshly attached facade after a detach", () => {
    // StrictMode mounts, unmounts and mounts again; the second mount must work against a new facade.
    const store = createStore();
    const first = fakeClient();
    store.attach(first.client);
    store.detach();

    const second = fakeClient();
    store.attach(second.client);
    second.emit("registered");
    expect(store.getSnapshot().registered).toBe(true);
  });
});

describe("method forwarding", () => {
  it("forwards all five methods and their return values unchanged", async () => {
    const { store, fake } = mounted();

    await expect(store.register()).resolves.toBeUndefined();
    await expect(store.promptInstall()).resolves.toBe("accepted");
    await expect(store.applyUpdate()).resolves.toBe(true);
    await expect(store.logout()).resolves.toBe(true);
    await expect(store.checkForUpdate()).resolves.toBe("up-to-date");

    expect(fake.calls).toEqual(["register", "promptInstall", "applyUpdate", "logout", "checkForUpdate"]);
  });

  it("does not call the facade on its own", () => {
    // The application decides when to register; an adapter that registers by itself takes that away.
    const { fake } = mounted();
    expect(fake.calls).toEqual([]);
  });

  it("lets a rejection propagate untouched", async () => {
    const store = createStore();
    const fake = fakeClient({
      applyUpdate: async () => {
        throw new Error("takeover timed out");
      },
    });
    store.attach(fake.client);

    await expect(store.applyUpdate()).rejects.toThrow("takeover timed out");
  });

  it("waits for a facade when called before mount, then forwards once one attaches", async () => {
    // React runs effects child-first: a component inside the provider that registers on mount calls this before
    // the provider's own effect has attached anything. Throwing here once made that silently register nothing.
    const store = createStore();
    const fake = fakeClient();

    let settled = false;
    const pending = store.register().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fake.calls).toEqual([]);

    store.attach(fake.client);
    await pending;
    expect(fake.calls).toEqual(["register"]);
  });

  it("releases every call that arrived before the facade, in order", async () => {
    const store = createStore();
    const fake = fakeClient();
    const results = Promise.all([store.register(), store.promptInstall(), store.applyUpdate()]);

    store.attach(fake.client);
    await expect(results).resolves.toEqual([undefined, "accepted", true]);
    expect(fake.calls).toEqual(["register", "promptInstall", "applyUpdate"]);
  });

  it("waits across a detach and forwards to the next facade, as a StrictMode remount needs", async () => {
    const { store, fake: first } = mounted();
    store.detach();

    const pending = store.register();
    const second = fakeClient();
    store.attach(second.client);
    await pending;

    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual(["register"]);
  });
});

describe("detaching resets the state", () => {
  it("returns to the initial state, so nothing describes a facade that is gone", () => {
    const { store, fake } = mounted();
    fake.emit("registered");
    fake.emit("update-waiting");
    expect(store.getSnapshot()).not.toEqual(INITIAL_STATE);

    store.detach();
    expect(store.getSnapshot()).toEqual(INITIAL_STATE);
  });

  it("notifies subscribers about the reset", () => {
    const { store, fake } = mounted();
    fake.emit("registered");

    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.detach();
    expect(notifications).toBe(1);
  });

  it("stays quiet when there was nothing to reset", () => {
    const { store } = mounted();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.detach();
    expect(notifications).toBe(0);
  });
});

describe("attaching twice", () => {
  it("drops the first subscription instead of leaking it", () => {
    // The provider pairs attach with detach, so this is unreachable today — but a store that leaks under misuse
    // is a trap for the next caller, and the fix costs one line.
    const store = createStore();
    const first = fakeClient();
    const second = fakeClient();

    store.attach(first.client);
    store.attach(second.client);

    expect(first.subscriberCount()).toBe(0);
    expect(second.subscriberCount()).toBe(1);
  });
});

describe("bindFacade", () => {
  // This is the whole body of the provider's effect. It lives here rather than in the component so that the
  // create → attach → detach → dispose cycle has runtime coverage without a renderer.

  it("attaches the injected facade and tracks its events", () => {
    const store = createStore();
    const fake = fakeClient();
    bindFacade(store, config, fake.client);

    fake.emit("registered");
    expect(store.getSnapshot().registered).toBe(true);
  });

  it("disposes the facade on teardown, even one that was injected", () => {
    const store = createStore();
    let disposed = false;
    const fake = fakeClient({ dispose: () => void (disposed = true) });

    const teardown = bindFacade(store, config, fake.client);
    expect(disposed).toBe(false);
    teardown();
    expect(disposed).toBe(true);
  });

  it("leaves no stale flags behind after teardown", () => {
    // The regression guard for a real defect: the provider used to rebuild the facade whenever the `config` prop
    // changed identity, and the store kept its old flags — so the UI read "registered" while the live facade had
    // never registered. Resetting on detach makes that state unrepresentable.
    const store = createStore();
    const fake = fakeClient();
    const teardown = bindFacade(store, config, fake.client);

    fake.emit("registered");
    fake.emit("install-eligible");
    teardown();

    expect(store.getSnapshot()).toEqual(INITIAL_STATE);
  });

  it("starts clean when bound again, as a remount does", () => {
    const store = createStore();
    const first = fakeClient();
    bindFacade(store, config, first.client)();

    const second = fakeClient();
    bindFacade(store, config, second.client);
    expect(store.getSnapshot()).toEqual(INITIAL_STATE);

    second.emit("registered");
    expect(store.getSnapshot().registered).toBe(true);
    // The retired facade must no longer reach the store.
    first.emit("update-waiting");
    expect(store.getSnapshot().updateWaiting).toBe(false);
  });

  it("passes updateCheck through to createPwaClient when it builds its own facade", () => {
    createPwaClientCalls.length = 0;
    const store = createStore();
    bindFacade(store, config, undefined, { intervalMs: 60_000 });

    expect(createPwaClientCalls).toEqual([{ config, updateCheck: { intervalMs: 60_000 } }]);
  });

  it("leaves updateCheck out of the options passed to createPwaClient when it is not set", () => {
    createPwaClientCalls.length = 0;
    const store = createStore();
    bindFacade(store, config, undefined);

    expect(createPwaClientCalls).toEqual([{ config }]);
  });

  it("never reaches createPwaClient when a client is injected, updateCheck or not", () => {
    createPwaClientCalls.length = 0;
    const store = createStore();
    const fake = fakeClient();
    bindFacade(store, config, fake.client, { intervalMs: 60_000 });

    expect(createPwaClientCalls).toEqual([]);
  });
});

describe("providerEffectDeps", () => {
  // The provider's useEffect dependency list, extracted for the same reason as bindFacade: there is no renderer in
  // this package to observe whether React actually reruns the effect, so this checks the one thing under this
  // package's control — the values React will run Object.is against.
  const client = fakeClient().client;

  it("keeps every value the same, under Object.is, when a fresh updateCheck object has the same intervalMs", () => {
    const store = createStore();
    const a = providerEffectDeps(store, client, config, { intervalMs: 60_000 });
    const b = providerEffectDeps(store, client, config, { intervalMs: 60_000 });

    expect(a.length).toBe(b.length);
    expect(a.every((value, index) => Object.is(value, b[index]))).toBe(true);
  });

  it("changes under Object.is when intervalMs changes", () => {
    const store = createStore();
    const a = providerEffectDeps(store, client, config, { intervalMs: 60_000 });
    const b = providerEffectDeps(store, client, config, { intervalMs: 120_000 });

    expect(a.some((value, index) => !Object.is(value, b[index]))).toBe(true);
  });

  it("changes under Object.is when updateCheck goes from set to omitted", () => {
    const store = createStore();
    const a = providerEffectDeps(store, client, config, { intervalMs: 60_000 });
    const b = providerEffectDeps(store, client, config, undefined);

    expect(a.some((value, index) => !Object.is(value, b[index]))).toBe(true);
  });

  it("is unaffected by updateCheck when it stays omitted across calls", () => {
    const store = createStore();
    const a = providerEffectDeps(store, client, config, undefined);
    const b = providerEffectDeps(store, client, config, undefined);

    expect(a.every((value, index) => Object.is(value, b[index]))).toBe(true);
  });
});
