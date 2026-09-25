import { readLifecycleEvent } from "@pwa-platform/contracts";
import { SKIP_WAITING_MESSAGE } from "@pwa-platform/sw-runtime/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PwaClientConfig } from "../../src/shared/config.js";
import { createPwaClient, type PwaClient } from "../../src/client/facade.js";
import type { PwaClientEvent } from "../../src/client/events.js";

const CONFIG: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

/** A service worker whose state the test drives; `postMessage` records what the page sent it. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  readonly messages: unknown[] = [];
  /** When set, `postMessage` throws it, as the browser does for a worker that already went redundant. */
  postMessageFailure: Error | undefined;

  clearResponse: "cleared" | "invalid" | "none" = "cleared";

  /** How this worker answers a `pwa:runtime-cache:pending` query. */
  pendingResponse: "null" | "served" | "invalid" | "none" = "null";
  /** The `served` payload sent when `pendingResponse` is `"served"`. */
  pendingServed: { readonly url: string; readonly cachedAt: number; readonly reason: "network-failed" | "network-timeout" | "stale-while-revalidate" } = {
    url: "/data.json",
    cachedAt: 1_700_000_000_000,
    reason: "network-failed",
  };

  postMessage(message: unknown, transfer?: Transferable[]): void {
    if (this.postMessageFailure !== undefined) throw this.postMessageFailure;
    this.messages.push(message);
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    const port = transfer?.[0] as MessagePort | undefined;
    if (message.type === "pwa:offline-write:clear") {
      if (port === undefined || this.clearResponse === "none") return;
      const requestId = (message as unknown as { readonly requestId: string }).requestId;
      const response = this.clearResponse === "cleared"
        ? { type: "pwa:offline-write:result", version: 1, requestId, status: "cleared" }
        : { type: "pwa:offline-write:result", version: 1, requestId, status: "queued" };
      port.postMessage(response);
      return;
    }
    if (message.type === "pwa:runtime-cache:pending") {
      if (port === undefined || this.pendingResponse === "none") return;
      if (this.pendingResponse === "invalid") {
        port.postMessage({ bogus: true });
        return;
      }
      const served = this.pendingResponse === "served" ? this.pendingServed : null;
      port.postMessage({ type: "pwa:runtime-cache:pending-result", version: 1, served });
    }
  }

  /** Moves to a state and fires `statechange`, as the browser does. */
  moveTo(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  peer: FakeMessagePort | undefined;

  postMessage(data: unknown): void {
    this.peer?.onmessage?.({ data } as MessageEvent);
  }

  start(): void {}

  close(): void {}
}

function fakeMessageChannel(): MessageChannel {
  const port1 = new FakeMessagePort();
  const port2 = new FakeMessagePort();
  port1.peer = port2;
  port2.peer = port1;
  return { port1, port2 } as unknown as MessageChannel;
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  unregistered = 0;
  /** What `unregister()` resolves with. */
  unregisterResult = true;
  /** Live `updatefound` listener count, so a leaked listener is something a test can assert, not infer. */
  updateFoundListeners = 0;
  /** How many times `update()` was called, so a test can assert concurrent calls collapsed into one. */
  updateCalls = 0;
  /** When false, `update()` stays pending until `finishUpdate()` releases it, as `register()`'s `autoResolve` does. */
  autoResolveUpdate = true;
  /** When set, `update()` (or `finishUpdate()`, while not auto-resolving) rejects with it instead of resolving. */
  updateFailure: Error | undefined;
  private settleUpdate: ((failure?: Error) => void) | undefined;

  constructor(readonly scope: string) {
    super();
  }

  update(): Promise<void> {
    this.updateCalls += 1;
    if (this.autoResolveUpdate) {
      return this.updateFailure ? Promise.reject(this.updateFailure) : Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.settleUpdate = (failure) => (failure ? reject(failure) : resolve());
    });
  }

  /** Resolves or rejects an `update()` call started while `autoResolveUpdate` is false. */
  finishUpdate(failure?: Error): void {
    this.settleUpdate?.(failure ?? this.updateFailure);
    this.settleUpdate = undefined;
  }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    if (type === "updatefound") this.updateFoundListeners += 1;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    if (type === "updatefound") this.updateFoundListeners -= 1;
    super.removeEventListener(type, listener, options);
  }

  unregister(): Promise<boolean> {
    this.unregistered += 1;
    return Promise.resolve(this.unregisterResult);
  }

  /**
   * Simulates a new version installing while this page is open. The waiting slot is filled before `statechange`
   * fires, as the browser does: a worker that reaches "installed" is the one waiting.
   */
  installUpdate(worker: FakeWorker): void {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
    this.waiting = worker;
    worker.moveTo("installed");
    this.installing = null;
  }
}

class FakeContainer extends EventTarget {
  controller: ServiceWorker | null = null;
  registration: FakeRegistration | null = null;
  /** A version already waiting when the page registers, as on a return visit. */
  waitingOnRegister: FakeWorker | null = null;
  readonly registerCalls: { readonly url: string; readonly options: RegistrationOptions | undefined }[] = [];
  readonly getRegistrationScopes: (string | undefined)[] = [];
  /** Live `controllerchange` listener count: a takeover wait that outlives its caller shows up here. */
  controllerChangeListeners = 0;
  private settle: ((failure?: Error) => void) | undefined;

  constructor(private readonly autoResolve: boolean) {
    super();
  }

  /** Real `ServiceWorkerContainer` API surface the facade must not call (fix T13-2): asserted absent, not counted. */
  startMessages(): void {
    throw new Error("startRuntimeCacheMessages must not call container.startMessages()");
  }

  /** Live `message` listener count: proves the facade's listener is actually removed on dispose. */
  messageListeners = 0;

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    if (type === "controllerchange") this.controllerChangeListeners += 1;
    if (type === "message") this.messageListeners += 1;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    if (type === "controllerchange") this.controllerChangeListeners -= 1;
    if (type === "message") this.messageListeners -= 1;
    super.removeEventListener(type, listener, options);
  }

  register(url: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration> {
    this.registerCalls.push({ url, options });
    const created = new FakeRegistration(`https://shop.example.com${options?.scope ?? "/"}`);
    created.waiting = this.waitingOnRegister;
    if (this.autoResolve) {
      this.registration = created;
      return Promise.resolve(created as unknown as ServiceWorkerRegistration);
    }
    return new Promise((resolve, reject) => {
      this.settle = (failure?: Error) => {
        if (failure) {
          reject(failure);
          return;
        }
        this.registration = created;
        resolve(created as unknown as ServiceWorkerRegistration);
      };
    });
  }

  getRegistration(scope?: string): Promise<ServiceWorkerRegistration | undefined> {
    this.getRegistrationScopes.push(scope);
    return Promise.resolve((this.registration ?? undefined) as ServiceWorkerRegistration | undefined);
  }

  /** Resolves or rejects the pending `register()`. */
  finish(failure?: Error): void {
    this.settle?.(failure);
  }

  /** The browser handing control to another worker. */
  changeController(worker: FakeWorker | null): void {
    this.controller = worker as unknown as ServiceWorker | null;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

/** A fake `navigator.serviceWorker` "message" event: a real Event carrying the two members the facade reads. */
function fakeMessage(data: unknown, source: unknown): Event {
  return Object.assign(new Event("message"), { data, source });
}

type InstallPrompt = {
  readonly event: Event;
  readonly prompted: () => number;
  readonly defaultPrevented: () => boolean;
};

/** A fake `beforeinstallprompt`: a real Event carrying the two members the facade uses. */
function installPrompt(outcome: "accepted" | "dismissed", failure?: Error): InstallPrompt {
  let prompted = 0;
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: (): Promise<void> => {
      prompted += 1;
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
    userChoice: Promise.resolve({ outcome }),
  });
  return { event, prompted: () => prompted, defaultPrevented: () => event.defaultPrevented };
}

type Harness = {
  readonly client: PwaClient;
  readonly container: FakeContainer;
  readonly events: PwaClientEvent[];
  readonly target: EventTarget;
};

function harness(options: { readonly autoResolve?: boolean; readonly config?: PwaClientConfig } = {}): Harness {
  const container = new FakeContainer(options.autoResolve !== false);
  const target = new EventTarget();
  const events: PwaClientEvent[] = [];
  const client = createPwaClient({
    config: options.config ?? CONFIG,
    container: container as unknown as ServiceWorkerContainer,
    target,
    messageChannel: fakeMessageChannel,
  });
  client.subscribe((event) => events.push(event));
  return { client, container, events, target };
}

/** A page already controlled by a worker, with one update registered and waiting. */
async function withWaitingUpdate(): Promise<Harness & { readonly waiting: FakeWorker }> {
  const context = harness();
  const active = new FakeWorker();
  active.state = "activated";
  context.container.controller = active as unknown as ServiceWorker;
  await context.client.register();

  const waiting = new FakeWorker();
  context.container.registration?.installUpdate(waiting);
  return { ...context, waiting };
}

/** A page-visibility source the test drives directly, mirroring the two-member shape `document` is picked down to. */
class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  /** Live `visibilitychange` listener count, so a leaked or missing listener is something a test can assert. */
  visibilityChangeListeners = 0;

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    if (type === "visibilitychange") this.visibilityChangeListeners += 1;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    if (type === "visibilitychange") this.visibilityChangeListeners -= 1;
    super.removeEventListener(type, listener, options);
  }

  /** Sets the state and fires `visibilitychange`, as the browser does. */
  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

/** A document that throws on any access, to prove a code path never touches it. */
function poisonedDocument(): Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> {
  const fail = (): never => {
    throw new Error("document must not be touched");
  };
  return {
    get visibilityState(): DocumentVisibilityState {
      return fail();
    },
    addEventListener: fail,
    removeEventListener: fail,
  };
}

/** A harness with `updateCheck` enabled and already registered, so the schedule is live. */
async function registeredUpdateCheckHarness(intervalMs = 60_000): Promise<{
  readonly client: PwaClient;
  readonly container: FakeContainer;
  readonly document: FakeDocument;
  readonly registration: FakeRegistration;
}> {
  const container = new FakeContainer(true);
  const document = new FakeDocument();
  const client = createPwaClient({
    config: CONFIG,
    container: container as unknown as ServiceWorkerContainer,
    target: new EventTarget(),
    document,
    updateCheck: { intervalMs },
    messageChannel: fakeMessageChannel,
  });
  await client.register();
  const registration = container.registration;
  if (registration === null) throw new Error("the harness should have produced a registration");
  return { client, container, document, registration };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createPwaClient", () => {
  it("validates the config and throws for an invalid one", () => {
    const container = {} as ServiceWorkerContainer;
    expect(() =>
      createPwaClient({ config: { ...CONFIG, updateMode: "immediate" } as unknown as PwaClientConfig, container }),
    ).toThrow(/config\.updateMode must be "prompt"/);
    expect(() => createPwaClient({ config: { ...CONFIG, serviceWorkerUrl: "/sw.js" }, container })).toThrow(
      /config\.serviceWorkerUrl must be inside config\.scope/,
    );
  });

  it("explains itself when there is no service worker container at all", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => createPwaClient({ config: CONFIG })).toThrow(/no navigator\.serviceWorker/);
  });

  it("explains itself when installs are enabled but there is no window", () => {
    vi.stubGlobal("window", undefined);
    expect(() => createPwaClient({ config: CONFIG, container: {} as ServiceWorkerContainer })).toThrow(
      /no window for the install events/,
    );
  });

  it("does not look for a window when the plan has no install metadata", () => {
    vi.stubGlobal("window", undefined);
    expect(() =>
      createPwaClient({ config: { ...CONFIG, installEnabled: false }, container: {} as ServiceWorkerContainer }),
    ).not.toThrow();
  });
});

describe("register", () => {
  it("registers the plan's worker URL at the plan's scope", async () => {
    const { client, container } = harness();
    await client.register();
    expect(container.registerCalls).toEqual([{ url: "/app/sw.js", options: { scope: "/app/" } }]);
  });

  it("emits registered with the registration's scope once it succeeds", async () => {
    const { client, events } = harness();
    await client.register();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      version: 1,
      type: "registered",
      appId: "storefront",
      metadata: { scope: "https://shop.example.com/app/" },
    });
    expect(events[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(readLifecycleEvent(events[0]).kind).toBe("known");
  });

  it("emits nothing until the registration actually resolves", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const pending = client.register();
    expect(events).toEqual([]);
    container.finish();
    await pending;
    expect(events).toHaveLength(1);
  });

  it("registers only once however often it is called", async () => {
    const { client, container, events } = harness();
    await client.register();
    await client.register();
    await Promise.all([client.register(), client.register()]);
    expect(container.registerCalls).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("does not register twice when concurrent calls overlap", async () => {
    const { client, container } = harness({ autoResolve: false });
    const both = Promise.all([client.register(), client.register()]);
    container.finish();
    await both;
    expect(container.registerCalls).toHaveLength(1);
  });

  it("throws and emits nothing when registration fails", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const pending = client.register();
    container.finish(new Error("script fetch failed"));
    await expect(pending).rejects.toThrow(/script fetch failed/);
    expect(events).toEqual([]);
  });

  it("does not remember a failed registration, so the caller can retry", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const failed = client.register();
    container.finish(new Error("offline"));
    await expect(failed).rejects.toThrow(/offline/);

    const retried = client.register();
    container.finish();
    await retried;
    expect(container.registerCalls).toHaveLength(2);
    expect(events).toHaveLength(1);
  });
});

describe("update-waiting", () => {
  it("announces a version that installs while the page is controlled", async () => {
    const { events } = await withWaitingUpdate();
    expect(events.map(({ type }) => type)).toEqual(["registered", "update-waiting"]);
    expect(events[1]).toMatchObject({ version: 1, type: "update-waiting", appId: "storefront", metadata: {} });
    expect(readLifecycleEvent(events[1]).kind).toBe("known");
  });

  it("announces a version that was already waiting when the page registered", async () => {
    const { client, container, events } = harness();
    container.controller = new FakeWorker() as unknown as ServiceWorker;
    const waiting = new FakeWorker();
    waiting.state = "installed";
    container.waitingOnRegister = waiting;

    await client.register();
    expect(events.map(({ type }) => type)).toEqual(["registered", "update-waiting"]);
  });

  it("stays silent on a first visit, when nothing controls the page yet", async () => {
    const { client, container, events } = harness();
    await client.register();
    container.registration?.installUpdate(new FakeWorker());
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("announces the same waiting worker only once", async () => {
    const { container, waiting, events } = await withWaitingUpdate();
    // A second updatefound for the worker that is already waiting must not produce another event.
    container.registration?.installUpdate(waiting);
    expect(events.filter(({ type }) => type === "update-waiting")).toHaveLength(1);
  });

  it("announces a second, genuinely different version", async () => {
    const { container, events } = await withWaitingUpdate();
    container.registration?.installUpdate(new FakeWorker());
    expect(events.filter(({ type }) => type === "update-waiting")).toHaveLength(2);
  });

  it("completes an announced update once a new worker actually controls the page", async () => {
    const { container, waiting, events } = await withWaitingUpdate();

    container.changeController(waiting);

    expect(events.map(({ type }) => type)).toEqual(["registered", "update-waiting", "update-applied"]);
    expect(events[2]).toMatchObject({ version: 1, type: "update-applied", appId: "storefront", metadata: {} });
    expect(readLifecycleEvent(events[2]).kind).toBe("known");
  });

  it("completes each announced version once", async () => {
    const { container, waiting, events } = await withWaitingUpdate();
    container.changeController(waiting);

    const next = new FakeWorker();
    container.registration?.installUpdate(next);
    container.changeController(next);
    container.changeController(new FakeWorker());

    expect(events.map(({ type }) => type)).toEqual([
      "registered",
      "update-waiting",
      "update-applied",
      "update-waiting",
      "update-applied",
    ]);
  });

  it("does not invent completion when this facade never announced a waiting update", async () => {
    const { client, container, events } = harness();
    await client.register();

    container.changeController(new FakeWorker());

    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });
});

describe("applyUpdate", () => {
  it("sends sw-runtime's constant to the waiting worker and resolves once it takes control", async () => {
    const { client, container, waiting } = await withWaitingUpdate();
    const applied = client.applyUpdate();
    await Promise.resolve();
    container.changeController(waiting);

    await expect(applied).resolves.toBe(true);
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE]);
    // The very object sw-runtime exports, not a copy that happens to look alike.
    expect(waiting.messages[0]).toBe(SKIP_WAITING_MESSAGE);
  });

  it("returns false and sends nothing when no worker is waiting", async () => {
    const { client, container } = harness();
    await client.register();
    const waiting = new FakeWorker();
    await expect(client.applyUpdate()).resolves.toBe(false);
    expect(waiting.messages).toEqual([]);
    expect(container.getRegistrationScopes).toEqual(["/app/"]);
  });

  it("returns false when there is no registration at all", async () => {
    const { client } = harness();
    await expect(client.applyUpdate()).resolves.toBe(false);
  });

  it("works without a prior register() call", async () => {
    const { client, container } = harness();
    const registrationFor = new FakeRegistration("https://shop.example.com/app/");
    const waiting = new FakeWorker();
    registrationFor.waiting = waiting;
    container.registration = registrationFor;

    const applied = client.applyUpdate();
    await Promise.resolve();
    container.changeController(waiting);
    await expect(applied).resolves.toBe(true);
  });

  it("throws when the confirmed worker never takes control", async () => {
    vi.useFakeTimers();
    const { client } = await withWaitingUpdate();
    const applied = client.applyUpdate();
    const assertion = expect(applied).rejects.toThrow(/did not take control in time/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("completes a previously announced update when takeover happens after applyUpdate timed out", async () => {
    vi.useFakeTimers();
    const { client, container, waiting, events } = await withWaitingUpdate();
    const applied = client.applyUpdate();
    const timeout = expect(applied).rejects.toThrow(/did not take control in time/);
    await vi.advanceTimersByTimeAsync(10_000);
    await timeout;

    container.changeController(waiting);

    expect(events.map(({ type }) => type)).toEqual(["registered", "update-waiting", "update-applied"]);
  });

  it("tolerates concurrent calls: both finish on the same takeover and neither wait is left behind", async () => {
    const { client, container, waiting } = await withWaitingUpdate();
    const both = Promise.all([client.applyUpdate(), client.applyUpdate()]);
    await Promise.resolve();
    container.changeController(waiting);

    await expect(both).resolves.toEqual([true, true]);
    expect(container.controllerChangeListeners).toBe(1);
  });

  it("stops the temporary takeover wait once it happened while keeping one completion watcher", async () => {
    vi.useFakeTimers();
    const { client, container, waiting } = await withWaitingUpdate();
    const applied = client.applyUpdate();
    await Promise.resolve();
    container.changeController(waiting);
    await expect(applied).resolves.toBe(true);

    // The timer must have been cleared: advancing past the timeout produces no unhandled rejection.
    await vi.advanceTimersByTimeAsync(20_000);
    container.changeController(new FakeWorker());
    expect(container.controllerChangeListeners).toBe(1);
  });
});

describe("logout", () => {
  it("unregisters the app's worker and reports success", async () => {
    const { client, container } = await withWaitingUpdate();
    await expect(client.logout()).resolves.toBe(true);
    expect(container.registration?.unregistered).toBe(1);
    expect(container.getRegistrationScopes.at(-1)).toBe("/app/");
  });

  it("stops watching the registration it unregistered", async () => {
    const { client, container } = await withWaitingUpdate();
    const detached = container.registration;
    expect(detached?.updateFoundListeners).toBe(1);

    await client.logout();

    // A detached registration that still reported an update would make the facade prompt for a version the next
    // register() knows nothing about.
    expect(detached?.updateFoundListeners).toBe(0);
    expect(container.controllerChangeListeners).toBe(0);
  });

  it("returns false when there is no registration", async () => {
    const { client } = harness();
    await expect(client.logout()).resolves.toBe(false);
  });

  it("passes on a refused unregister", async () => {
    const { client, container } = await withWaitingUpdate();
    const current = container.registration;
    if (current === null) throw new Error("the harness should have produced a registration");
    current.unregisterResult = false;
    await expect(client.logout()).resolves.toBe(false);
  });

  it("works without a prior register() call", async () => {
    const { client, container } = harness();
    const existing = new FakeRegistration("https://shop.example.com/app/");
    container.registration = existing;
    container.controller = new FakeWorker() as unknown as ServiceWorker;
    await expect(client.logout()).resolves.toBe(true);
    expect(existing.unregistered).toBe(1);
  });

  it("keeps the registration when the controlled worker rejects cleanup", async () => {
    const { client, container } = await withWaitingUpdate();
    const controller = container.controller as unknown as FakeWorker;
    controller.clearResponse = "invalid";
    await expect(client.logout()).resolves.toBe(false);
    expect(container.registration?.unregistered).toBe(0);
  });

  it("keeps the registration when no current worker can confirm cleanup", async () => {
    const { client, container } = await withWaitingUpdate();
    container.controller = null;
    await expect(client.logout()).resolves.toBe(false);
    expect(container.registration?.unregistered).toBe(0);
  });

  it("keeps the registration when the cleanup acknowledgement times out", async () => {
    vi.useFakeTimers();
    const { client, container } = await withWaitingUpdate();
    (container.controller as unknown as FakeWorker).clearResponse = "none";
    const logout = client.logout();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(logout).resolves.toBe(false);
    expect(container.registration?.unregistered).toBe(0);
  });

  it("forgets the registration, so the page can register again afterwards", async () => {
    const { client, container } = await withWaitingUpdate();
    await client.logout();
    await client.register();
    expect(container.registerCalls).toHaveLength(2);
  });
});

describe("checkForUpdate", () => {
  it("returns unavailable when there is no registration", async () => {
    const { client, events } = harness();
    await expect(client.checkForUpdate()).resolves.toBe("unavailable");
    expect(events).toEqual([]);
  });

  it("returns update-available when the check finds a version installing", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    registration.installing = new FakeWorker();
    container.registration = registration;

    await expect(client.checkForUpdate()).resolves.toBe("update-available");
    expect(registration.updateCalls).toBe(1);
  });

  it("returns update-available when the check finds a version waiting", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    registration.waiting = new FakeWorker();
    container.registration = registration;

    await expect(client.checkForUpdate()).resolves.toBe("update-available");
  });

  it("returns up-to-date when nothing is installing or waiting after the check", async () => {
    const { client, container } = harness();
    container.registration = new FakeRegistration("https://shop.example.com/app/");

    await expect(client.checkForUpdate()).resolves.toBe("up-to-date");
  });

  it("does not post any message to a waiting worker", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    container.registration = registration;

    await client.checkForUpdate();
    expect(waiting.messages).toEqual([]);
  });

  it("lets a rejected check propagate and emits nothing", async () => {
    const { client, container, events } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    registration.updateFailure = new Error("network offline");
    container.registration = registration;

    await expect(client.checkForUpdate()).rejects.toThrow(/network offline/);
    expect(events).toEqual([]);
  });

  it("shares one in-flight check across concurrent calls", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    registration.autoResolveUpdate = false;
    container.registration = registration;

    const both = Promise.all([client.checkForUpdate(), client.checkForUpdate()]);
    await Promise.resolve();
    registration.finishUpdate();
    await expect(both).resolves.toEqual(["up-to-date", "up-to-date"]);
    expect(registration.updateCalls).toBe(1);
  });

  it("starts a new check once the previous one has settled", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    container.registration = registration;

    await client.checkForUpdate();
    await client.checkForUpdate();
    expect(registration.updateCalls).toBe(2);
  });

  it("starts a new check once the previous one has rejected", async () => {
    const { client, container } = harness();
    const registration = new FakeRegistration("https://shop.example.com/app/");
    registration.updateFailure = new Error("offline");
    container.registration = registration;

    await expect(client.checkForUpdate()).rejects.toThrow(/offline/);
    registration.updateFailure = undefined;
    await expect(client.checkForUpdate()).resolves.toBe("up-to-date");
    expect(registration.updateCalls).toBe(2);
  });

  it("throws after dispose", async () => {
    const { client } = harness();
    client.dispose();
    await expect(client.checkForUpdate()).rejects.toThrow(/has been disposed/);
  });
});

describe("install prompt", () => {
  it("suppresses the browser's own prompt and reports eligibility", () => {
    const { target, events } = harness();
    const prompt = installPrompt("accepted");
    target.dispatchEvent(prompt.event);

    expect(prompt.defaultPrevented()).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ version: 1, type: "install-eligible", appId: "storefront", metadata: {} });
    expect(readLifecycleEvent(events[0]).kind).toBe("known");
  });

  it("never shows the prompt on its own", () => {
    const { target } = harness();
    const prompt = installPrompt("accepted");
    target.dispatchEvent(prompt.event);
    expect(prompt.prompted()).toBe(0);
  });

  it("shows the saved prompt and reports the user's choice", async () => {
    for (const outcome of ["accepted", "dismissed"] as const) {
      const { client, target } = harness();
      const prompt = installPrompt(outcome);
      target.dispatchEvent(prompt.event);

      await expect(client.promptInstall()).resolves.toBe(outcome);
      expect(prompt.prompted()).toBe(1);
    }
  });

  it("reports unavailable when the browser never offered a prompt", async () => {
    const { client } = harness();
    await expect(client.promptInstall()).resolves.toBe("unavailable");
  });

  it("uses a prompt only once", async () => {
    const { client, target } = harness();
    const prompt = installPrompt("accepted");
    target.dispatchEvent(prompt.event);

    await expect(client.promptInstall()).resolves.toBe("accepted");
    await expect(client.promptInstall()).resolves.toBe("unavailable");
    expect(prompt.prompted()).toBe(1);
  });

  it("drops the prompt when the browser rejects it, and lets the error surface", async () => {
    const { client, target } = harness();
    const prompt = installPrompt("accepted", new Error("prompt not allowed"));
    target.dispatchEvent(prompt.event);

    await expect(client.promptInstall()).rejects.toThrow(/prompt not allowed/);
    await expect(client.promptInstall()).resolves.toBe("unavailable");
  });

  it("emits installed and forgets the prompt once the app is installed", async () => {
    const { client, target, events } = harness();
    target.dispatchEvent(installPrompt("accepted").event);
    target.dispatchEvent(new Event("appinstalled"));

    expect(events.map(({ type }) => type)).toEqual(["install-eligible", "installed"]);
    expect(readLifecycleEvent(events[1]).kind).toBe("known");
    await expect(client.promptInstall()).resolves.toBe("unavailable");
  });

  it("stays out of the install flow entirely when the plan has no install metadata", async () => {
    const { client, target, events } = harness({ config: { ...CONFIG, installEnabled: false } });
    const prompt = installPrompt("accepted");
    target.dispatchEvent(prompt.event);
    target.dispatchEvent(new Event("appinstalled"));

    expect(prompt.defaultPrevented()).toBe(false);
    expect(events).toEqual([]);
    await expect(client.promptInstall()).resolves.toBe("unavailable");
  });
});

describe("subscribe", () => {
  it("delivers to every subscriber and stops on unsubscribe", async () => {
    const { client } = harness();
    const first: PwaClientEvent[] = [];
    const second: PwaClientEvent[] = [];
    client.subscribe((event) => first.push(event));
    const stop = client.subscribe((event) => second.push(event));
    stop();

    await client.register();
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it("isolates subscribers: one that throws neither blocks the others nor fails register", async () => {
    const { client, events } = harness();
    const after: PwaClientEvent[] = [];
    client.subscribe(() => {
      throw new Error("a faulty analytics hook");
    });
    client.subscribe((event) => after.push(event));

    await expect(client.register()).resolves.toBeUndefined();
    expect(events).toHaveLength(1);
    expect(after).toHaveLength(1);
  });

  it("is unaffected by a subscriber that unsubscribes during delivery", async () => {
    const { client } = harness();
    const seen: PwaClientEvent[] = [];
    const stop = client.subscribe((event) => {
      stop();
      seen.push(event);
    });
    const other: PwaClientEvent[] = [];
    client.subscribe((event) => other.push(event));

    await client.register();
    expect(seen).toHaveLength(1);
    expect(other).toHaveLength(1);
  });

  it("unsubscribing twice is harmless", async () => {
    const { client, events } = harness();
    const stop = client.subscribe(() => undefined);
    stop();
    stop();
    await client.register();
    expect(events).toHaveLength(1);
  });
});

describe("served-from-cache", () => {
  /** A page already controlled by a worker whose pending query answers `served: null` (the default, no signal). */
  async function controlledHarness(): Promise<Harness & { readonly controller: FakeWorker }> {
    const context = harness();
    const controller = new FakeWorker();
    controller.state = "activated";
    context.container.controller = controller as unknown as ServiceWorker;
    await context.client.register();
    return { ...context, controller };
  }

  it("attaches exactly one message listener on register, without calling container.startMessages()", async () => {
    const { container } = await controlledHarness();
    expect(container.messageListeners).toBe(1);
  });

  it("does not accumulate a message listener across a register, logout, register cycle", async () => {
    const { client, container } = harness();
    const first = new FakeWorker();
    first.state = "activated";
    container.controller = first as unknown as ServiceWorker;
    await client.register();
    expect(container.messageListeners).toBe(1);

    await client.logout();
    expect(container.messageListeners).toBe(0);

    const second = new FakeWorker();
    second.state = "activated";
    container.controller = second as unknown as ServiceWorker;
    await client.register();
    expect(container.messageListeners).toBe(1);
  });

  it("emits exactly one event for one served message after a register, logout, register cycle", async () => {
    const { client, container, events } = harness();
    const first = new FakeWorker();
    first.state = "activated";
    container.controller = first as unknown as ServiceWorker;
    await client.register();

    await client.logout();

    const second = new FakeWorker();
    second.state = "activated";
    container.controller = second as unknown as ServiceWorker;
    await client.register();

    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1, reason: "network-failed" }, second),
    );

    expect(events.filter(({ type }) => type === "served-from-cache")).toHaveLength(1);
  });

  it("emits served-from-cache for a valid served message from the controller", async () => {
    const { container, controller, events } = await controlledHarness();
    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1_700_000_000_000, reason: "network-failed" }, controller),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered", "served-from-cache"]);
    expect(events[1]).toMatchObject({
      version: 1,
      type: "served-from-cache",
      appId: "storefront",
      metadata: { url: "/data.json", cachedAt: 1_700_000_000_000, reason: "network-failed" },
    });
    expect(readLifecycleEvent(events[1]).kind).toBe("known");
  });

  it("ignores a message whose source is not the current controller", async () => {
    const { container, events } = await controlledHarness();
    const other = new FakeWorker();
    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1, reason: "network-failed" }, other),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("ignores a malformed served message", async () => {
    const { container, controller, events } = await controlledHarness();
    container.dispatchEvent(fakeMessage({ type: "pwa:runtime-cache:served", version: 1 }, controller));
    container.dispatchEvent(fakeMessage("not an object", controller));
    container.dispatchEvent(fakeMessage(null, controller));
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("ignores a served message with an extra field", async () => {
    const { container, controller, events } = await controlledHarness();
    container.dispatchEvent(
      fakeMessage(
        { type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1, reason: "network-failed", extra: true },
        controller,
      ),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("emits served-from-cache with reason network-timeout unchanged, from a direct served message (ADR-0038)", async () => {
    const { container, controller, events } = await controlledHarness();
    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1_700_000_000_000, reason: "network-timeout" }, controller),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered", "served-from-cache"]);
    expect(events[1]).toMatchObject({
      type: "served-from-cache",
      appId: "storefront",
      metadata: { url: "/data.json", cachedAt: 1_700_000_000_000, reason: "network-timeout" },
    });
  });

  it("still rejects an unknown reason, network-timeout being the only addition (ADR-0038)", async () => {
    const { container, controller, events } = await controlledHarness();
    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1, reason: "network-first" }, controller),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("queries the controller once for a stashed navigation signal and emits it", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const controller = new FakeWorker();
    controller.state = "activated";
    controller.pendingResponse = "served";
    container.controller = controller as unknown as ServiceWorker;

    const pending = client.register();
    container.finish();
    await pending;

    expect(controller.messages).toEqual([{ type: "pwa:runtime-cache:pending", version: 1 }]);
    expect(events.map(({ type }) => type)).toEqual(["registered", "served-from-cache"]);
    expect(events[1]).toMatchObject({
      type: "served-from-cache",
      metadata: { url: "/data.json", cachedAt: 1_700_000_000_000, reason: "network-failed" },
    });
  });

  it("delivers a stashed navigation signal whose reason is network-timeout unchanged (ADR-0038)", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const controller = new FakeWorker();
    controller.state = "activated";
    controller.pendingResponse = "served";
    controller.pendingServed = { url: "/app/products/1", cachedAt: 1_700_000_000_000, reason: "network-timeout" };
    container.controller = controller as unknown as ServiceWorker;

    const pending = client.register();
    container.finish();
    await pending;

    expect(events.map(({ type }) => type)).toEqual(["registered", "served-from-cache"]);
    expect(events[1]).toMatchObject({
      type: "served-from-cache",
      metadata: { url: "/app/products/1", cachedAt: 1_700_000_000_000, reason: "network-timeout" },
    });
  });

  it("emits nothing when the stashed query answers null", async () => {
    const { controller, events } = await controlledHarness();
    expect(controller.messages).toEqual([{ type: "pwa:runtime-cache:pending", version: 1 }]);
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("emits nothing when the pending query times out", async () => {
    vi.useFakeTimers();
    const { client, container, events } = harness();
    const controller = new FakeWorker();
    controller.state = "activated";
    controller.pendingResponse = "none";
    container.controller = controller as unknown as ServiceWorker;

    await client.register();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("emits nothing when the pending reply is malformed", async () => {
    const { client, container, events } = harness();
    const controller = new FakeWorker();
    controller.state = "activated";
    controller.pendingResponse = "invalid";
    container.controller = controller as unknown as ServiceWorker;

    await client.register();

    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("does not query anything when there is no controller", async () => {
    const { client, container, events } = harness();
    await client.register();
    expect(container.registration).not.toBeNull();
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });

  it("removes the message listener on dispose", async () => {
    const { client, container } = await controlledHarness();
    expect(container.messageListeners).toBe(1);
    client.dispose();
    expect(container.messageListeners).toBe(0);
  });

  it("stops emitting after dispose, even for a message that arrives right after", async () => {
    const { client, container, controller, events } = await controlledHarness();
    client.dispose();
    container.dispatchEvent(
      fakeMessage({ type: "pwa:runtime-cache:served", version: 1, url: "/data.json", cachedAt: 1, reason: "network-failed" }, controller),
    );
    expect(events.map(({ type }) => type)).toEqual(["registered"]);
  });
});

describe("dispose", () => {
  it("stops delivering events, and does not start watching a registration that lands after dispose", async () => {
    const { client, container, events } = harness({ autoResolve: false });
    const pending = client.register();
    client.dispose();
    container.finish();
    await pending;

    expect(events).toEqual([]);
    // The event assertion above cannot fail on its own: dispose() empties the subscribers, so nothing would arrive
    // either way. What tells a leak apart is whether the late registration got listeners attached to it at all.
    expect(container.registration?.updateFoundListeners ?? 0).toBe(0);
  });

  it("ends an applyUpdate that is still waiting, leaving no listener or timer behind", async () => {
    vi.useFakeTimers();
    const { client, container, waiting } = await withWaitingUpdate();
    const applied = client.applyUpdate();
    await Promise.resolve();
    expect(container.controllerChangeListeners).toBe(2);

    client.dispose();
    // Without this the wait would linger and reject ten seconds later into a promise nobody awaits any more.
    await expect(applied).rejects.toThrow(/Stopped waiting for the worker/);
    expect(container.controllerChangeListeners).toBe(0);

    // The timer went with it: advancing well past the timeout produces no second, unhandled rejection.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE]);
  });

  it("does not leak the takeover wait when the confirmation cannot be delivered", async () => {
    const { client, container, waiting } = await withWaitingUpdate();
    waiting.postMessageFailure = new Error("InvalidStateError: worker is redundant");

    await expect(client.applyUpdate()).rejects.toThrow(/InvalidStateError/);
    expect(container.controllerChangeListeners).toBe(1);
  });

  it("removes the install listeners from the target", () => {
    const { client, target, events } = harness();
    client.dispose();
    const prompt = installPrompt("accepted");
    target.dispatchEvent(prompt.event);
    target.dispatchEvent(new Event("appinstalled"));

    expect(prompt.defaultPrevented()).toBe(false);
    expect(events).toEqual([]);
  });

  it("stops watching the registration for updates", async () => {
    const { client, container, events } = await withWaitingUpdate();
    const before = events.length;
    client.dispose();
    container.registration?.installUpdate(new FakeWorker());
    expect(events).toHaveLength(before);
  });

  it("makes every method throw afterwards", async () => {
    const { client } = harness();
    client.dispose();
    await expect(client.register()).rejects.toThrow(/has been disposed/);
    await expect(client.promptInstall()).rejects.toThrow(/has been disposed/);
    await expect(client.applyUpdate()).rejects.toThrow(/has been disposed/);
    await expect(client.logout()).rejects.toThrow(/has been disposed/);
    expect(() => client.subscribe(() => undefined)).toThrow(/has been disposed/);
  });

  it("is idempotent", () => {
    const { client } = harness();
    client.dispose();
    expect(() => client.dispose()).not.toThrow();
  });
});

describe("updateCheck option validation", () => {
  it.each([
    ["a non-integer", 60_000.5],
    ["below the floor", 59_999],
    ["above the ceiling", 2_147_483_648],
    ["NaN", Number.NaN],
    ["a non-number", "60000"],
  ])("throws for %s", (_label, intervalMs) => {
    expect(() =>
      createPwaClient({ config: CONFIG, container: {} as ServiceWorkerContainer, updateCheck: { intervalMs: intervalMs as number } }),
    ).toThrow(/updateCheck\.intervalMs must be an integer between 60000 and 2147483647/);
  });

  it("accepts the floor and the ceiling", () => {
    const container = {} as ServiceWorkerContainer;
    const target = new EventTarget();
    const document = new FakeDocument();
    expect(() =>
      createPwaClient({ config: CONFIG, container, target, document, updateCheck: { intervalMs: 60_000 } }),
    ).not.toThrow();
    expect(() =>
      createPwaClient({ config: CONFIG, container, target, document, updateCheck: { intervalMs: 2_147_483_647 } }),
    ).not.toThrow();
  });

  it("never touches document when updateCheck is omitted", async () => {
    const container = new FakeContainer(true);
    const client = createPwaClient({
      config: CONFIG,
      container: container as unknown as ServiceWorkerContainer,
      target: new EventTarget(),
      document: poisonedDocument(),
    });
    await expect(client.register()).resolves.toBeUndefined();
  });

  it("explains itself when updateCheck is set but there is no document anywhere", () => {
    expect(() =>
      createPwaClient({ config: CONFIG, container: {} as ServiceWorkerContainer, updateCheck: { intervalMs: 60_000 } }),
    ).toThrow(/no document for the automatic update check/);
  });
});

// Vitest fails the run on an unhandled rejection surfacing during a test, which is what a leaked automatic-check
// failure (or a leaked `applyUpdate` takeover timeout, see `dispose` above) would produce; no extra hook is needed
// to catch one here.
describe("automatic update check", () => {
  it("does not schedule anything before register() succeeds", async () => {
    vi.useFakeTimers();
    const container = new FakeContainer(true);
    const document = new FakeDocument();
    createPwaClient({
      config: CONFIG,
      container: container as unknown as ServiceWorkerContainer,
      target: new EventTarget(),
      document,
      updateCheck: { intervalMs: 60_000 },
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(document.visibilityChangeListeners).toBe(0);
    expect(container.registration).toBeNull();
  });

  it("checks exactly once intervalMs after register() succeeds", async () => {
    vi.useFakeTimers();
    const { registration } = await registeredUpdateCheckHarness();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(registration.updateCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(registration.updateCalls).toBe(1);
  });

  it("arms the next check from the end of the previous one, so checks never overlap", async () => {
    vi.useFakeTimers();
    const { registration } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(1);

    // The first check is still gated; advancing well past another interval must not start a second one.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(registration.updateCalls).toBe(1);

    registration.finishUpdate();
    await vi.advanceTimersByTimeAsync(0); // let the resolved check's continuation re-arm the timer
    expect(registration.updateCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(registration.updateCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(registration.updateCalls).toBe(2);
  });

  it("skips a check while hidden and runs one immediately once the page becomes visible", async () => {
    vi.useFakeTimers();
    const { registration, document } = await registeredUpdateCheckHarness();
    document.setVisibility("hidden");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(0);

    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(registration.updateCalls).toBe(1);
  });

  it("checks immediately on becoming visible once a full interval has passed since the last check started, even with nothing owed", async () => {
    vi.useFakeTimers();
    const { registration, document } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000); // T=60s: first automatic check starts, gated
    expect(registration.updateCalls).toBe(1);

    document.setVisibility("hidden");
    registration.finishUpdate();
    await vi.advanceTimersByTimeAsync(5_000); // T=65s: check resolves; next tick re-armed for T=125s

    await vi.advanceTimersByTimeAsync(55_000); // T=120s: a full interval since the check started at T=60s
    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    // Runs immediately even though the rearmed tick (T=125s) has not fired and nothing was ever skipped as "owed".
    expect(registration.updateCalls).toBe(2);
  });

  it("does not run an extra check on becoming visible before a full interval has elapsed", async () => {
    vi.useFakeTimers();
    const { registration, document } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000); // T=60s
    expect(registration.updateCalls).toBe(1);

    document.setVisibility("hidden");
    registration.finishUpdate();
    await vi.advanceTimersByTimeAsync(5_000); // T=65s: check resolves; next tick re-armed for T=125s

    await vi.advanceTimersByTimeAsync(50_000); // T=115s: not yet a full interval since T=60s
    document.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(registration.updateCalls).toBe(1);
  });

  it("swallows a failing automatic check and still runs the next cycle", async () => {
    vi.useFakeTimers();
    const { registration } = await registeredUpdateCheckHarness();
    registration.updateFailure = new Error("network offline");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(1);

    registration.updateFailure = undefined;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(2);
  });

  it("treats an automatic check that resolves unavailable like any other result and keeps cycling", async () => {
    vi.useFakeTimers();
    const { container } = await registeredUpdateCheckHarness();
    // Simulate the registration having disappeared without going through logout(), so the schedule keeps running.
    container.registration = null;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(container.getRegistrationScopes.at(-1)).toBe("/app/");

    const registration = new FakeRegistration("https://shop.example.com/app/");
    container.registration = registration;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(1);
  });

  it("keeps the restarted schedule on time when a check from before logout settles late", async () => {
    vi.useFakeTimers();
    const { client, container, registration } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000); // an automatic check is in flight
    expect(registration.updateCalls).toBe(1);

    await client.logout();
    await client.register(); // the new schedule's first tick is due 60 s from here
    const restarted = container.registration;
    if (restarted === null) throw new Error("the harness should have produced a registration");

    await vi.advanceTimersByTimeAsync(30_000);
    registration.finishUpdate(); // the old check settles; it must not re-arm the new schedule

    await vi.advanceTimersByTimeAsync(30_000);
    expect(restarted.updateCalls).toBe(1);
  });

  it("stops the schedule on logout and restarts it on the next successful register()", async () => {
    vi.useFakeTimers();
    const { client, container, document } = await registeredUpdateCheckHarness();
    container.controller = new FakeWorker() as unknown as ServiceWorker;
    expect(document.visibilityChangeListeners).toBe(1);

    await client.logout();
    expect(document.visibilityChangeListeners).toBe(0);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(container.registration?.updateCalls ?? 0).toBe(0);

    await client.register();
    expect(document.visibilityChangeListeners).toBe(1);
    const restarted = container.registration;
    if (restarted === null) throw new Error("the harness should have produced a registration");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(restarted.updateCalls).toBe(1);
  });

  it("stops the schedule and the watching on logout even when the registration was already removed elsewhere", async () => {
    vi.useFakeTimers();
    const { client, container, document, registration } = await registeredUpdateCheckHarness();
    // Another tab logged out first: the browser no longer has a registration for this scope.
    container.registration = null;

    await expect(client.logout()).resolves.toBe(false);
    expect(document.visibilityChangeListeners).toBe(0);
    expect(registration.updateFoundListeners).toBe(0);

    const lookups = container.getRegistrationScopes.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(container.getRegistrationScopes).toHaveLength(lookups);
  });

  it("registers again after a logout that found the registration already removed", async () => {
    vi.useFakeTimers();
    const { client, container, document } = await registeredUpdateCheckHarness();
    container.registration = null;
    await client.logout();

    await client.register();
    expect(container.registerCalls).toHaveLength(2);
    expect(document.visibilityChangeListeners).toBe(1);
    // Widened again: the `= null` above narrowed the property, and TypeScript cannot see register() replace it.
    const restarted = container.registration as FakeRegistration | null;
    if (restarted === null) throw new Error("the harness should have produced a registration");
    expect(restarted.updateFoundListeners).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(restarted.updateCalls).toBe(1);
  });

  it("removes the timer and the visibility listener on dispose", async () => {
    vi.useFakeTimers();
    const { client, container, document } = await registeredUpdateCheckHarness();
    expect(document.visibilityChangeListeners).toBe(1);

    client.dispose();
    expect(document.visibilityChangeListeners).toBe(0);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(container.registration?.updateCalls ?? 0).toBe(0);
  });

  it("does not re-arm after dispose when an automatic check was still in flight", async () => {
    vi.useFakeTimers();
    const { client, registration } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(1);

    client.dispose();
    registration.finishUpdate();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(registration.updateCalls).toBe(1);
  });

  it("does not schedule twice when register() is called repeatedly", async () => {
    vi.useFakeTimers();
    const container = new FakeContainer(true);
    const document = new FakeDocument();
    const client = createPwaClient({
      config: CONFIG,
      container: container as unknown as ServiceWorkerContainer,
      target: new EventTarget(),
      document,
      updateCheck: { intervalMs: 60_000 },
    });
    await client.register();
    await client.register();
    await Promise.all([client.register(), client.register()]);
    expect(document.visibilityChangeListeners).toBe(1);

    const registration = container.registration;
    if (registration === null) throw new Error("the harness should have produced a registration");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.updateCalls).toBe(1);
  });

  it("coalesces a concurrent manual and automatic check into a single update() call", async () => {
    vi.useFakeTimers();
    const { client, registration } = await registeredUpdateCheckHarness();
    registration.autoResolveUpdate = false;

    await vi.advanceTimersByTimeAsync(60_000); // the tick fires; the automatic check's update() call is now gated
    expect(registration.updateCalls).toBe(1);

    const manual = client.checkForUpdate(); // must join the same in-flight check instead of calling update() again
    registration.finishUpdate();
    await expect(manual).resolves.toBe("up-to-date");
    expect(registration.updateCalls).toBe(1);
  });

  it("never sends the confirmation message or reloads the page from an automatic check", async () => {
    vi.useFakeTimers();
    const { registration } = await registeredUpdateCheckHarness();
    registration.waiting = new FakeWorker();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.waiting.messages).toEqual([]);
  });
});
