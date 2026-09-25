// The Vue binding: a plugin that owns the facade for the application's lifetime, and a composable that reads it.
// The UI belongs to the application — this package hands over state and methods, nothing visual (ADR-0013).
import { createPwaClient, type PwaClient, type PwaClientConfig } from "@pwa-platform/client-runtime";
import { inject, shallowRef, type App, type InjectionKey, type Plugin, type Ref } from "vue";
import { CLIENT_AND_UPDATE_CHECK_ERROR, INITIAL_STATE, reduce, SERVER_METHODS, type PwaState } from "./store.js";

export type { PwaState } from "./store.js";

/**
 * The five facade methods the binding forwards unchanged. Taken from `PwaClient` rather than written out, so the
 * signatures cannot drift from the facade — and because `PwaInstallOutcome`, the return type of `promptInstall`,
 * is not exported from client-runtime's public entry.
 *
 * `subscribe` and `dispose` are deliberately absent: the binding itself is the subscription, and disposal belongs
 * to the application's lifetime, not to the caller.
 */
export type PwaMethods = Pick<PwaClient, "register" | "promptInstall" | "applyUpdate" | "logout" | "checkForUpdate">;

export type PwaBinding = PwaMethods & { readonly state: Readonly<Ref<PwaState>> };

export type PwaOptions = {
  readonly config: PwaClientConfig;
  /**
   * Defaults to a facade built from `config`. Passed explicitly to inject a fake in tests, and by
   * `@pwa-platform/nuxt` to wrap the facade when the deployed base path disagrees with the identity (ADR-0016,
   * 2026-09-17 amendment). Whatever is passed is disposed when the app unmounts — the binding takes ownership of it
   * for its lifetime.
   */
  readonly client?: PwaClient;
  /**
   * Automatic periodic checks, forwarded to `createPwaClient` when the plugin builds its own facade. Omitted means
   * off. Meaningless together with `client` — an injected facade is already built, so `createPwa` throws when both
   * are passed (spec: 修订：主动检查更新).
   */
  readonly updateCheck?: { readonly intervalMs: number };
};

export const PWA_KEY: InjectionKey<PwaBinding> = Symbol("pwa-platform");

/**
 * Builds the plugin. `app.use(createPwa({ config }))` creates the facade, subscribes to its events and provides the
 * binding; the application never touches `createPwaClient` itself.
 */
export function createPwa(options: PwaOptions): Plugin {
  // Checked eagerly, at call time rather than inside install(): an injected facade is already built, and the
  // binding has no way to configure its automatic update check after the fact. Silently ignoring updateCheck would
  // be a quiet no-op the caller has no way to notice.
  if (options.client !== undefined && options.updateCheck !== undefined) {
    throw new Error(CLIENT_AND_UPDATE_CHECK_ERROR);
  }

  return {
    install(app: App): void {
      // Server-side rendering (ADR-0016, 2026-09-17 amendment): no facade, because creating one reaches for
      // navigator.serviceWorker and throws. The binding reports the initial state and its methods reject. An
      // injected client is only ever a test fake, so it keeps the browser path even in Node. `updateCheck` is
      // simply unused on this path — there is no facade to schedule it against.
      if (options.client === undefined && typeof window === "undefined") {
        app.provide(PWA_KEY, { state: shallowRef<PwaState>(INITIAL_STATE), ...SERVER_METHODS });
        return;
      }

      const client =
        options.client ??
        createPwaClient(
          // Built conditionally, not `{ config: options.config, updateCheck: options.updateCheck }`:
          // `exactOptionalPropertyTypes` rejects an optional property written as `X | undefined` even when the
          // value happens to be present, so the branch is what narrows it to `X`.
          options.updateCheck !== undefined
            ? { config: options.config, updateCheck: options.updateCheck }
            : { config: options.config },
        );
      // shallowRef, not ref: the state is a flat frozen-by-convention snapshot that is replaced wholesale. A deep
      // reactive proxy would add nothing and would break the identity comparison `reduce` is built around.
      const state = shallowRef<PwaState>(INITIAL_STATE);

      // The returned unsubscribe is not kept: `dispose()` clears every listener the facade holds, and disposal is
      // the only path that ends this subscription.
      client.subscribe((event) => {
        state.value = reduce(state.value, event);
      });

      const binding: PwaBinding = {
        state,
        register: () => client.register(),
        promptInstall: () => client.promptInstall(),
        applyUpdate: () => client.applyUpdate(),
        logout: () => client.logout(),
        checkForUpdate: () => client.checkForUpdate(),
      };
      app.provide(PWA_KEY, binding);

      // `app.onUnmount` arrived in Vue 3.5.0 and is the only unmount hook an app has; the peer range allows 3.4,
      // whose App interface carries no callback registration point at all. On 3.4 the facade is therefore not
      // disposed — recorded as a known limitation rather than worked around with internal APIs.
      if (typeof app.onUnmount === "function") {
        app.onUnmount(() => {
          client.dispose();
        });
      }
    },
  };
}

/** Reads the binding provided by the plugin. Throws when the plugin was never installed. */
export function usePwa(): PwaBinding {
  const binding = inject(PWA_KEY);
  if (binding === undefined) {
    throw new Error("No PWA binding found: install the plugin first with app.use(createPwa({ config }))");
  }
  return binding;
}
