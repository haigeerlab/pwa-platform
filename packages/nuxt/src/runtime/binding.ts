// The runtime baseURL decision (design section 4), pulled out of the client plugin so it is testable without Nuxt.
//
// `app.baseURL` can be overridden at deploy time with `NUXT_APP_BASE_URL` (T1 record), which would let the running
// site diverge from the identity's `mountPath` that the build baked into the worker config and the virtual module.
// Registering a worker under a scope the identity never declared would be exactly the kind of drift ADR-0004 rules
// out for `mountPath`, so this function keeps the app usable (the binding still installs, `usePwa()` still works)
// while refusing the one call that would create a mismatched registration.
import type { PwaClient } from "@pwa-platform/client-runtime";

/** Diagnostic code for a runtime `app.baseURL` that does not match the identity's `mountPath`. */
export const RUNTIME_BASE_URL_MISMATCH_CODE = "nuxt.runtime-base-url-mismatch";

/**
 * Returns the client the plugin should hand to `createPwa`.
 *
 * Equal paths: `client` itself, unchanged. Different paths: a wrapper whose `register` always rejects (naming the
 * diagnostic code, never either path's value) and whose other methods forward to `client` unchanged — so a
 * page that only reads `usePwa().state` or calls `logout()` after a previous, differently-configured deploy still
 * works. The mismatch is logged once, here, rather than on every rejected `register()` call.
 */
export function bindClientToRuntimeBase(client: PwaClient, runtimeBaseURL: string, mountPath: string): PwaClient {
  if (runtimeBaseURL === mountPath) return client;

  console.warn(
    `${RUNTIME_BASE_URL_MISMATCH_CODE}: the runtime app.baseURL does not match the identity's mountPath; register() will reject`,
  );

  return {
    ...client,
    register: () =>
      Promise.reject(
        new Error(`${RUNTIME_BASE_URL_MISMATCH_CODE}: cannot register because the runtime app.baseURL does not match the identity's mountPath`),
      ),
  };
}
