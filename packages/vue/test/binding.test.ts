import type { PwaClient, PwaClientConfig, PwaClientEvent, PwaClientEventType } from "@pwa-platform/client-runtime";
import { createApp, type App } from "vue";
import { describe, expect, it } from "vitest";
import { createPwa, usePwa, type PwaBinding } from "../src/index.js";
import { CLIENT_AND_UPDATE_CHECK_ERROR } from "../src/store.js";

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

type Fake = {
  readonly client: PwaClient;
  /** Method names in call order, so a binding that calls the facade on its own is visible. */
  readonly calls: string[];
  readonly emit: (type: PwaClientEventType) => void;
  readonly disposed: () => boolean;
  readonly subscriberCount: () => number;
};

function fakeClient(): Fake {
  const listeners = new Set<(event: PwaClientEvent) => void>();
  const calls: string[] = [];
  let disposed = false;
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
    dispose: () => {
      disposed = true;
    },
  };
  return {
    client,
    calls,
    emit: (type) => {
      const event: PwaClientEvent = {
        version: 1,
        type,
        timestamp: "2026-09-17T00:00:00.000Z",
        appId: config.appId,
        metadata: {},
      };
      for (const listener of [...listeners]) listener(event);
    },
    disposed: () => disposed,
    subscriberCount: () => listeners.size,
  };
}

/**
 * A stand-in for Vue's `App`, carrying only what the plugin touches. Two shapes matter: with `onUnmount` (Vue
 * 3.5+) and without it (Vue 3.4, whose App interface has no callback registration point at all). The installed
 * devDependency is 3.5.42, so a real app always has the hook — only a fake can exercise the 3.4 branch.
 */
function fakeApp(withUnmountHook: boolean): {
  readonly app: App;
  readonly binding: () => PwaBinding | undefined;
  readonly unmount: () => void;
} {
  let provided: PwaBinding | undefined;
  const callbacks: (() => void)[] = [];
  const app: Record<string, unknown> = {
    provide(_key: unknown, value: unknown) {
      provided = value as PwaBinding;
      return app;
    },
  };
  if (withUnmountHook) {
    app["onUnmount"] = (cb: () => void): void => {
      callbacks.push(cb);
    };
  }
  return {
    app: app as unknown as App,
    binding: () => provided,
    unmount: () => {
      for (const cb of callbacks) cb();
    },
  };
}

/** `createPwa` returns Vue's `Plugin` union; the object form is what this package builds. */
function install(plugin: ReturnType<typeof createPwa>, app: App): void {
  (plugin as { install: (app: App) => void }).install(app);
}

describe("plugin installation", () => {
  it("provides a binding and subscribes to the facade", () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);

    expect(host.binding()).toBeDefined();
    expect(fake.subscriberCount()).toBe(1);
  });

  it("does not call the facade on its own", () => {
    // The application decides when to register; an adapter that registers by itself takes that away.
    const fake = fakeClient();
    install(createPwa({ config, client: fake.client }), fakeApp(true).app);
    expect(fake.calls).toEqual([]);
  });

  it("starts from the initial state", () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);

    expect(host.binding()?.state.value).toEqual({
      registered: false,
      installEligible: false,
      installed: false,
      updateWaiting: false,
    });
  });
});

describe("state tracks the facade's events", () => {
  it("updates as events arrive", () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);
    const binding = host.binding();

    fake.emit("registered");
    expect(binding?.state.value.registered).toBe(true);

    fake.emit("install-eligible");
    expect(binding?.state.value.installEligible).toBe(true);

    fake.emit("installed");
    expect(binding?.state.value.installed).toBe(true);
    expect(binding?.state.value.installEligible).toBe(false);

    fake.emit("update-waiting");
    expect(binding?.state.value.updateWaiting).toBe(true);
  });

  it("keeps the same snapshot object when an event changes nothing", () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);
    const binding = host.binding();
    // Asserted before the comparison below: with an optional chain on both sides, a missing binding would make
    // `undefined === undefined` pass and this case would guard nothing.
    expect(binding).toBeDefined();

    fake.emit("registered");
    const first = binding?.state.value;
    fake.emit("registered");
    expect(binding?.state.value).toBe(first);
  });
});

describe("method forwarding", () => {
  it("forwards all five methods and their return values unchanged", async () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);
    const binding = host.binding();

    await expect(binding?.register()).resolves.toBeUndefined();
    await expect(binding?.promptInstall()).resolves.toBe("accepted");
    await expect(binding?.applyUpdate()).resolves.toBe(true);
    await expect(binding?.logout()).resolves.toBe(true);
    await expect(binding?.checkForUpdate()).resolves.toBe("up-to-date");

    expect(fake.calls).toEqual(["register", "promptInstall", "applyUpdate", "logout", "checkForUpdate"]);
  });

  it("lets a rejection propagate untouched", async () => {
    const fake = fakeClient();
    const failing: PwaClient = {
      ...fake.client,
      applyUpdate: async () => {
        throw new Error("takeover timed out");
      },
    };
    const host = fakeApp(true);
    install(createPwa({ config, client: failing }), host.app);

    await expect(host.binding()?.applyUpdate()).rejects.toThrow("takeover timed out");
  });

  it("exposes neither subscribe nor dispose", () => {
    // Subscription is the binding itself; disposal belongs to the app's lifetime, not to the caller.
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);

    const binding = host.binding() as unknown as Record<string, unknown>;
    expect(Object.keys(binding).sort()).toEqual([
      "applyUpdate",
      "checkForUpdate",
      "logout",
      "promptInstall",
      "register",
      "state",
    ]);
  });
});

describe("updateCheck", () => {
  it("throws when both client and updateCheck are passed", () => {
    const fake = fakeClient();
    expect(() =>
      createPwa({ config, client: fake.client, updateCheck: { intervalMs: 60_000 } }),
    ).toThrow(CLIENT_AND_UPDATE_CHECK_ERROR);
  });

  it("does not throw when only one of client or updateCheck is passed", () => {
    const fake = fakeClient();
    expect(() => createPwa({ config, client: fake.client })).not.toThrow();
  });
});

describe("disposal follows the app's lifetime", () => {
  it("disposes the facade when the app unmounts (Vue 3.5+)", () => {
    const fake = fakeClient();
    const host = fakeApp(true);
    install(createPwa({ config, client: fake.client }), host.app);

    expect(fake.disposed()).toBe(false);
    host.unmount();
    expect(fake.disposed()).toBe(true);
  });

  it("installs without throwing when the app has no onUnmount (Vue 3.4)", () => {
    // The feature detection's other branch. Without this case a detection written the wrong way round would still
    // pass every other test here, and 3.4 users would get the broken behaviour.
    const fake = fakeClient();
    const host = fakeApp(false);

    expect(() => install(createPwa({ config, client: fake.client }), host.app)).not.toThrow();
    expect(host.binding()).toBeDefined();
    expect(fake.disposed()).toBe(false);

    // The binding still works; only automatic disposal is missing (a recorded known limitation).
    fake.emit("registered");
    expect(host.binding()?.state.value.registered).toBe(true);
  });
});

describe("usePwa", () => {
  it("returns the binding provided by the plugin", () => {
    // A real app, so the actual provide/inject path is exercised rather than the fake's. No mount, so no DOM.
    const fake = fakeClient();
    const app = createApp({});
    app.use(createPwa({ config, client: fake.client }));

    const binding = app.runWithContext(() => usePwa());
    fake.emit("registered");
    expect(binding.state.value.registered).toBe(true);
  });

  it("throws when the plugin was never installed", () => {
    const app = createApp({});
    expect(() => app.runWithContext(() => usePwa())).toThrow(/install the plugin/i);
  });
});
