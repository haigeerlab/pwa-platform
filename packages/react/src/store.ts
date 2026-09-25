// The whole binding, in plain TypeScript with no React in sight: the state machine, the subscription, the five
// forwarded methods, and the facade's lifetime. React's side is a provider that calls `bindFacade` from an effect
// and a hook that reads a snapshot.
//
// The split is deliberate. `useSyncExternalStore` only runs inside a render, and this package ships no renderer
// (spec: known limitations), so anything left in the component would have no unit test at all — and a defect did
// hide there: the provider used to rebuild the facade whenever the `config` prop changed identity while the store
// kept its old flags, so the UI read "registered" against a facade that had never registered. `bindFacade` exists
// so that whole create → attach → detach → dispose cycle is testable without mounting anything.
//
// This is the React package's own copy of the state machine; the Vue package has its own and neither imports the
// other. The parity suite compares their state sequences.
import { createPwaClient, type PwaClient, type PwaClientConfig, type PwaClientEvent } from "@pwa-platform/client-runtime";

export type PwaState = {
  /** `registered` was emitted: the worker is registered at the plan's scope. */
  readonly registered: boolean;
  /** `install-eligible` was emitted and the app is not installed yet: `promptInstall()` can be called. */
  readonly installEligible: boolean;
  readonly installed: boolean;
  /** `update-waiting` was emitted: a new version is waiting and `applyUpdate()` can be called. */
  readonly updateWaiting: boolean;
};

// Frozen, not merely `readonly`: it is a shared module-level object and every store starts from it, so a stray
// write would change the starting state of every store created afterwards.
export const INITIAL_STATE: PwaState = Object.freeze({
  registered: false,
  installEligible: false,
  installed: false,
  updateWaiting: false,
});

/**
 * Applies one lifecycle event and returns the next state — the *same* object when nothing changes. That identity
 * is load-bearing: `useSyncExternalStore` compares snapshots by reference and would re-render forever if a fresh
 * object came back every time.
 *
 * `installed` and `update-applied` clear the flags for prompts the facade no longer offers: `appinstalled` drops
 * the saved install prompt, and a controller change completes a previously announced update prompt. The other
 * events never fall back to false, because the facade emits no cancellation event for them. `logout()` is the visible case: it returns a boolean
 * without emitting anything, so `registered` stays true (spec: known limitations).
 */
export function reduce(state: PwaState, event: PwaClientEvent): PwaState {
  switch (event.type) {
    case "registered":
      return state.registered ? state : { ...state, registered: true };
    case "install-eligible":
      return state.installEligible ? state : { ...state, installEligible: true };
    case "installed":
      return state.installed && !state.installEligible
        ? state
        : { ...state, installed: true, installEligible: false };
    case "update-waiting":
      return state.updateWaiting ? state : { ...state, updateWaiting: true };
    case "update-applied":
      return state.updateWaiting ? { ...state, updateWaiting: false } : state;
    case "served-from-cache":
      // Carries no state the bindings expose (ADR-0035): the app subscribes to client-runtime's event directly.
      return state;
    default: {
      // Every member of PwaClientEventType is handled above. Should client-runtime ever add one, this turns into a
      // compile error here rather than a silently ignored event at runtime.
      const unreachable: never = event.type;
      return unreachable;
    }
  }
}

/** The five facade methods, taken from `PwaClient` so the signatures cannot drift from it. */
export type PwaMethods = Pick<PwaClient, "register" | "promptInstall" | "applyUpdate" | "logout" | "checkForUpdate">;

/**
 * The message every method rejects with during server-side rendering. The Vue package carries the same text, and
 * the server-side parity suite in examples-browser-e2e compares the two.
 */
export const SERVER_RENDERING_ERROR = "PWA methods are unavailable during server-side rendering: call them in the browser after hydration";

function rejectOnServer(): Promise<never> {
  return Promise.reject(new Error(SERVER_RENDERING_ERROR));
}

/**
 * What the binding hands out on the server (ADR-0016, 2026-09-17 amendment). There is no service worker, no install
 * prompt and no facade there, so every method rejects at once — waiting for a facade that will never be attached
 * would leave the call pending forever, and touching a browser API would throw something far less clear.
 */
export const SERVER_METHODS: PwaMethods = Object.freeze({
  register: rejectOnServer,
  promptInstall: rejectOnServer,
  applyUpdate: rejectOnServer,
  logout: rejectOnServer,
  checkForUpdate: rejectOnServer,
});

/**
 * The message `PwaProvider` throws when both `client` and `updateCheck` are passed. The Vue package carries the
 * same text (spec: 修订：主动检查更新, 框架绑定增量), and each package's test suite asserts it word for word.
 */
export const CLIENT_AND_UPDATE_CHECK_ERROR =
  "Cannot pass both client and updateCheck: an injected client is already built, so the binding has no way to configure its automatic update check";

export type PwaStore = PwaMethods & {
  /** `useSyncExternalStore`'s subscribe: the callback runs only when the snapshot actually changed. */
  subscribe(onChange: () => void): () => void;
  getSnapshot(): PwaState;
  /**
   * Binds a facade and starts tracking its events. Called from the provider's effect rather than during render,
   * which is what StrictMode's deliberate mount → unmount → mount requires: each mount attaches a fresh facade
   * and each cleanup detaches it, so a disposed facade is never reused.
   */
  attach(client: PwaClient): void;
  /**
   * Stops tracking and resets the state. The reset is the point: with no facade attached, the flags describe
   * nothing. Leaving them set is what let a rebuilt provider show "registered" for a facade that had never
   * registered. The facade itself is disposed by whoever created it.
   */
  detach(): void;
};

export function createStore(): PwaStore {
  const listeners = new Set<() => void>();
  let state: PwaState = INITIAL_STATE;
  let client: PwaClient | null = null;
  let unsubscribe: (() => void) | null = null;

  /** Calls made while no facade is attached, released by the next `attach`. */
  let waiters: ((facade: PwaClient) => void)[] = [];

  /**
   * The attached facade — or, when none is attached yet, a promise for the next one.
   *
   * Waiting rather than throwing is what makes the binding usable from a child's mount effect. React runs effects
   * child-first, so a component inside `PwaProvider` that registers on mount runs *before* the provider's own effect
   * attaches the facade. Throwing here made that — the most natural way to write it — fail silently: the rejection
   * was swallowed and nothing ever registered. The end-to-end suite caught it on its first real render.
   *
   * The same gap reopens under StrictMode's deliberate remount (detach, then children's effects, then attach again),
   * so a call made after a detach waits too. A call made after the provider is gone for good never settles; the
   * component that made it is gone as well, so no rejection is left unhandled.
   */
  function bound(): Promise<PwaClient> {
    if (client !== null) return Promise.resolve(client);
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  }

  /** A copy, so a listener that unsubscribes during delivery does not disturb this dispatch. */
  function emit(): void {
    for (const listener of [...listeners]) listener();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot() {
      return state;
    },

    attach(next) {
      // A second attach without an intervening detach would otherwise leak the first subscription. The provider
      // pairs them correctly today, but a store that leaks under misuse is a trap for the next caller.
      unsubscribe?.();
      client = next;
      // Release every call that arrived before this facade did.
      const released = waiters;
      waiters = [];
      for (const release of released) release(next);
      unsubscribe = next.subscribe((event) => {
        const previous = state;
        state = reduce(state, event);
        // Notify only on a real change. Waking React for an event that changed nothing would re-render the tree
        // for no reason, and `getSnapshot` would hand back the very same object anyway.
        if (state !== previous) emit();
      });
    },

    detach() {
      unsubscribe?.();
      unsubscribe = null;
      client = null;
      if (state !== INITIAL_STATE) {
        state = INITIAL_STATE;
        emit();
      }
    },

    // Each call waits for a facade (see `bound`), then forwards unchanged: return values and rejections are the
    // facade's own.
    register: async () => (await bound()).register(),
    promptInstall: async () => (await bound()).promptInstall(),
    applyUpdate: async () => (await bound()).applyUpdate(),
    logout: async () => (await bound()).logout(),
    checkForUpdate: async () => (await bound()).checkForUpdate(),
  };
}

/** The shape of `PwaProviderProps.updateCheck`, repeated here rather than imported to keep this file React-free. */
type UpdateCheckOption = { readonly intervalMs: number };

/**
 * Creates (or takes) a facade, attaches it to the store, and returns the teardown. This is the entire body of the
 * provider's effect, extracted so it can be unit tested without a renderer: the provider is then a one-liner with
 * nowhere to hide a defect.
 *
 * `client` and `updateCheck` are positional optional parameters rather than fields on an options object on
 * purpose. The caller holds them as `X | undefined` (they come from props), and under `exactOptionalPropertyTypes`
 * an optional *property* rejects an explicitly passed `undefined`. Optional parameters carry no such restriction,
 * so this avoids a `client?: PwaClient | undefined` signature that reads like a mistake.
 *
 * The returned teardown disposes the facade even when it was injected — the binding takes ownership for its
 * lifetime, which keeps the Vue and React sides behaving alike. `PwaProvider` is responsible for rejecting a call
 * that passes both `client` and `updateCheck` before this function is ever reached.
 */
export function bindFacade(
  store: PwaStore,
  config: PwaClientConfig,
  client?: PwaClient,
  updateCheck?: UpdateCheckOption,
): () => void {
  const facade =
    client ??
    // Built conditionally, not `createPwaClient({ config, updateCheck })`: with `updateCheck` typed
    // `UpdateCheckOption | undefined`, that object literal would write `X | undefined` into a property declared
    // `updateCheck?: X`, which `exactOptionalPropertyTypes` rejects. The branch narrows it to `X`.
    createPwaClient(updateCheck !== undefined ? { config, updateCheck } : { config });
  store.attach(facade);
  return () => {
    store.detach();
    facade.dispose();
  };
}

/**
 * The provider's `useEffect` dependency list, extracted for the same reason as `bindFacade`: this package ships no
 * renderer, so nothing inside the component itself has a unit test. What matters here is the *shape* of the list
 * React compares with `Object.is` — in particular that `updateCheck` contributes its `intervalMs` field and not
 * the option object itself. An application that passes a fresh `{ intervalMs }` literal on every render must not
 * tear the facade down and rebuild it just because that object's identity changed, exactly as `config`'s fields
 * are read individually rather than depending on the `config` object.
 */
export function providerEffectDeps(
  store: PwaStore,
  client: PwaClient | undefined,
  config: PwaClientConfig,
  updateCheck: UpdateCheckOption | undefined,
): readonly unknown[] {
  return [
    store,
    client,
    config.appId,
    config.scope,
    config.serviceWorkerUrl,
    config.updateMode,
    config.installEnabled,
    updateCheck?.intervalMs,
  ];
}
