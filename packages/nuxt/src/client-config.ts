// The page's runtime config, served through a virtual module resolved only in the client build (design section 5).
//
// Built from the options, the same way packages/vite/src/client-config.ts builds its own virtual module: the plan
// this config would ideally come from does not exist until T6's `nitro:build:public-assets` hook, long after the
// client module graph — including this module's `load` hook — has already run. Every field below is settled by the
// options alone, so waiting for a plan is not necessary.
//
// `mountPath` travels alongside the client config (not part of `PwaClientConfig` itself) because the runtime plugin
// needs it to compare against `useRuntimeConfig().app.baseURL` (design section 4) — a check the plan-based
// `createClientConfig` in client-runtime has no reason to know about.
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { validateClientConfig, type PwaClientConfig } from "@pwa-platform/client-runtime/build";

export type PwaNuxtClientConfigInput = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  readonly install: PwaInstallMetadata | null;
};

/** Virtual module the client plugin imports to reach its config. */
export const VIRTUAL_MODULE_ID = "virtual:pwa-platform/nuxt";

/**
 * Resolved id for the virtual module.
 *
 * The leading NUL is the ecosystem's convention for "this is not a file": it keeps other plugins from treating the
 * id as a path and trying to read it off disk.
 */
export const VIRTUAL_RESOLVED_ID: string = `\0${VIRTUAL_MODULE_ID}`;

export type PwaNuxtVirtualModule = {
  readonly config: PwaClientConfig;
  readonly mountPath: string;
};

/**
 * Builds the config the client plugin will import.
 *
 * `installEnabled` mirrors how `compilePlan` decides `plan.install`, which is what `createClientConfig` (the
 * plan-based equivalent this module is measured against) reads: a policy with `install.enabled` false leaves the
 * plan's install null even when the app passed metadata, so reading only the metadata here would advertise an
 * installable app whose worker was never told to expect one.
 */
export function createClientConfigFromOptions(input: PwaNuxtClientConfigInput): PwaClientConfig {
  return validateClientConfig({
    appId: input.identity.appId,
    scope: input.identity.scope,
    serviceWorkerUrl: input.identity.serviceWorkerUrl,
    updateMode: input.policy.updateMode,
    installEnabled: input.policy.install.enabled && input.install !== null,
  });
}

/** The virtual module's source: a frozen default export, serialised so the page needs no runtime helper. */
export function serializeVirtualModule(module: PwaNuxtVirtualModule): string {
  return `export default Object.freeze(${JSON.stringify(module)});\n`;
}
