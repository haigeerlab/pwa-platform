// The React binding: a provider that owns the facade for the subtree's lifetime, and a hook that reads a snapshot.
// Both are deliberately thin — every decision lives in `store.ts`, which is plain TypeScript and fully tested.
// The UI belongs to the application (ADR-0013): this package provides state and methods and renders nothing.
import type { PwaClient, PwaClientConfig } from "@pwa-platform/client-runtime";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  bindFacade,
  CLIENT_AND_UPDATE_CHECK_ERROR,
  createStore,
  INITIAL_STATE,
  providerEffectDeps,
  SERVER_METHODS,
  type PwaMethods,
  type PwaState,
  type PwaStore,
} from "./store.js";

export type { PwaMethods, PwaState } from "./store.js";

export type PwaBinding = PwaMethods & { readonly state: PwaState };

export type PwaProviderProps = {
  readonly config: PwaClientConfig;
  /**
   * Defaults to a facade built from `config`; passed explicitly only to inject a fake in tests. Whatever is passed
   * is disposed when the provider unmounts — the binding takes ownership of it for its lifetime.
   */
  readonly client?: PwaClient;
  /**
   * Automatic periodic checks, forwarded to `createPwaClient` when the provider builds its own facade. Omitted
   * means off. Meaningless together with `client` — an injected facade is already built, so `PwaProvider` throws
   * during render when both are passed (spec: 修订：主动检查更新).
   */
  readonly updateCheck?: { readonly intervalMs: number };
  readonly children?: ReactNode;
};

const StoreContext = createContext<PwaStore | null>(null);

// No JSX anywhere in this package: `tsconfig.base.json` sets no `jsx` option, and changing the whole repository's
// compiler configuration for one provider that renders no elements of its own is not worth it.
export function PwaProvider(props: PwaProviderProps): ReactElement {
  const { config, client, updateCheck, children } = props;
  // Checked first, before any hook runs: an injected facade is already built, and the provider has no way to
  // configure its automatic update check after the fact. Because this precedes every hook call, it can also be
  // exercised directly as a plain function call in a unit test, without a renderer.
  if (client !== undefined && updateCheck !== undefined) {
    throw new Error(CLIENT_AND_UPDATE_CHECK_ERROR);
  }
  // One store per provider instance, created lazily so it already exists on the first render and children can read
  // state immediately. The facade is attached by the effect below, not here.
  const [store] = useState(createStore);

  useEffect(
    // The whole body lives in `bindFacade` so it can be tested without a renderer. Creating the facade inside the
    // effect is also what StrictMode requires: it deliberately mounts, unmounts and mounts again, and a facade
    // built during render would be disposed by the first cleanup and then reused dead on the second mount.
    () => bindFacade(store, config, client, updateCheck),
    // Depends on the config's *fields*, not on the object, and on `updateCheck`'s `intervalMs` field rather than
    // the object itself — for the same reason. `<PwaProvider config={{ ... }} updateCheck={{ ... }}>` builds new
    // objects on every render, and an object dependency would tear the facade down and build a fresh, unregistered
    // one each time — with the store's flags still describing the old one. React's own docs flag object
    // dependencies for exactly this reason. See `providerEffectDeps` for the list itself, extracted for a unit
    // test this component cannot carry (spec: 已知限制).
    providerEffectDeps(store, client, config, updateCheck),
  );

  return createElement(StoreContext.Provider, { value: store }, children);
}

/** Reads the binding provided by `PwaProvider`. Throws when no provider is above it in the tree. */
export function usePwa(): PwaBinding {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error("No PWA binding found: wrap the tree in a PwaProvider first");
  }
  // The third argument is what React reads on the server and while hydrating. Without it a server render throws
  // (ADR-0016, 2026-09-17 amendment). The provider's effect never runs on the server, so no facade exists there and
  // the initial state is the only true answer.
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  // On the server the store's methods would wait for a facade that is never attached; hand out ones that reject.
  const methods: PwaMethods = typeof window === "undefined" ? SERVER_METHODS : store;
  // Memoised so the binding keeps its identity between renders. Without this, an application that lists the
  // binding in a dependency array would re-run that effect on every single render.
  return useMemo(
    () => ({
      state,
      register: methods.register,
      promptInstall: methods.promptInstall,
      applyUpdate: methods.applyUpdate,
      logout: methods.logout,
      checkForUpdate: methods.checkForUpdate,
    }),
    [state, methods],
  );
}

/** Module-level, so React sees the same function on every render. */
function getServerSnapshot(): PwaState {
  return INITIAL_STATE;
}
