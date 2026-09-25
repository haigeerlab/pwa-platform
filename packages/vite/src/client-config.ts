// The page's runtime config, built from the plugin options.
//
// `createClientConfig` in client-runtime does the same job from a compiled `PwaPlan`, and that is the version this
// module is measured against. It cannot be used here: the virtual module is loaded while the module graph is being
// built, and the plan does not exist until `generateBundle` — measured, `load` runs fourth and `generateBundle`
// seventh. Waiting is not an option, so the config is assembled from the options instead.
//
// That is sound because every field it needs comes from the options and none from the build output: the config is
// fully determined before the first file is read. A parity test pins this module to `createClientConfig` on real
// compiled plans, the same arrangement build-verifier uses for its second Cache-Control parser.
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { validateClientConfig, type PwaClientConfig } from "@pwa-platform/client-runtime/build";

export type PwaClientConfigInput = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  readonly install: PwaInstallMetadata | null;
};

/** Virtual module the app imports to reach its config. */
export const CLIENT_CONFIG_MODULE_ID = "virtual:pwa-config";

/**
 * Resolved id for the virtual module.
 *
 * The leading NUL is the ecosystem's convention for "this is not a file": it keeps other plugins from treating the
 * id as a path and trying to read it off disk.
 */
export const CLIENT_CONFIG_RESOLVED_ID: string = `\0${CLIENT_CONFIG_MODULE_ID}`;

/**
 * Builds the config the page will import.
 *
 * `updateMode` is read from the policy, and a test does prove it: `validateClientConfig` rejects any value outside
 * `UPDATE_MODES`, so passing an illegal mode makes this function throw while a hard-coded `"prompt"` would return
 * happily. Telling the two apart needs an invalid value, not a second valid one — an earlier comment here claimed
 * the single-member enum made the assertion impossible, which a reviewer disproved.
 */
export function createClientConfigFromOptions(input: PwaClientConfigInput): PwaClientConfig {
  return validateClientConfig({
    appId: input.identity.appId,
    scope: input.identity.scope,
    serviceWorkerUrl: input.identity.serviceWorkerUrl,
    updateMode: input.policy.updateMode,
    installEnabled: installEnabled(input.policy, input.install),
  });
}

/**
 * Mirrors how `compilePlan` decides `plan.install`, which is what `createClientConfig` reads.
 *
 * Metadata alone is not enough: a policy with `install.enabled` false leaves `plan.install` null even when the app
 * passed metadata, because the compiler validates that metadata but keeps it out of the plan. Reading only the
 * metadata here would advertise an installable app whose worker was never told to expect one.
 */
function installEnabled(policy: PwaPolicy, install: PwaInstallMetadata | null): boolean {
  return policy.install.enabled && install !== null;
}

/** The virtual module's source: a frozen default export, serialised so the page needs no runtime helper. */
export function serializeClientConfigModule(config: PwaClientConfig): string {
  return `export default Object.freeze(${JSON.stringify(config)});\n`;
}
