// The state machine behind the binding. The React package carries its own copy and a parity suite there pins the
// two to the same conclusions; neither copy imports the other (spec/vue-react-adapters.md).
import type { PwaClient, PwaClientEvent } from "@pwa-platform/client-runtime";

export type PwaState = {
  /** `registered` was emitted: the worker is registered at the plan's scope. */
  readonly registered: boolean;
  /** `install-eligible` was emitted and the app is not installed yet: `promptInstall()` can be called. */
  readonly installEligible: boolean;
  readonly installed: boolean;
  /** `update-waiting` was emitted: a new version is waiting and `applyUpdate()` can be called. */
  readonly updateWaiting: boolean;
};

// Frozen, not merely `readonly`: it is a shared module-level object and every binding starts from it, so a stray
// write would change the starting state of every binding created afterwards.
export const INITIAL_STATE: PwaState = Object.freeze({
  registered: false,
  installEligible: false,
  installed: false,
  updateWaiting: false,
});

/**
 * Applies one lifecycle event and returns the next state — the *same* object when nothing changes, so callers can
 * compare by identity. React's `useSyncExternalStore` requires that of its snapshot, and the parity suite asserts
 * both copies behave alike, so this package keeps the property even though Vue does not need it.
 *
 * `installed` and `update-applied` clear the flags for prompts the facade no longer offers: `appinstalled` drops
 * the saved install prompt, and a controller change completes a previously announced update prompt. The other
 * events never fall back to false, because the facade emits no cancellation event for them. `logout()` is the visible case:
 * it returns a boolean without emitting anything, so `registered` stays true (spec: known limitations).
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

/**
 * The message every method rejects with during server-side rendering. The React package carries the same text, and
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
export const SERVER_METHODS: Pick<PwaClient, "register" | "promptInstall" | "applyUpdate" | "logout" | "checkForUpdate"> = Object.freeze({
  register: rejectOnServer,
  promptInstall: rejectOnServer,
  applyUpdate: rejectOnServer,
  logout: rejectOnServer,
  checkForUpdate: rejectOnServer,
});

/**
 * The message `createPwa` throws when both `client` and `updateCheck` are passed. The React package carries the
 * same text (spec: 修订：主动检查更新, 框架绑定增量), and each package's test suite asserts it word for word.
 */
export const CLIENT_AND_UPDATE_CHECK_ERROR =
  "Cannot pass both client and updateCheck: an injected client is already built, so the binding has no way to configure its automatic update check";
