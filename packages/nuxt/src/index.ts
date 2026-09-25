// The Nuxt module's single entry: options and the build-time mountPath check, the client-only virtual module for
// page config, the client plugin that installs the Vue binding, Nuxt's auto-reload defaults (ADR-0013, checkpoint
// A), and (T6) the artifact pipeline that turns the final `.output/public` into the platform worker, recovery
// worker, manifest and precache manifest.
import { addPlugin, addVitePlugin, createResolver, defineNuxtModule } from "nuxt/kit";
import type { Nuxt, NuxtModule } from "nuxt/schema";
import { checkBaseUrlMatchesMountPath, registerArtifactPipeline } from "./artifacts.js";
import {
  createClientConfigFromOptions,
  serializeVirtualModule,
  VIRTUAL_MODULE_ID,
  VIRTUAL_RESOLVED_ID,
  type PwaNuxtVirtualModule,
} from "./client-config.js";
import { validateOptions, type PwaNuxtOptions } from "./options.js";

export type { PwaNuxtOptions } from "./options.js";

/** Diagnostic code for a build-time `app.baseURL` that does not equal the identity's `mountPath`. */
export { BASE_URL_MISMATCH_CODE } from "./artifacts.js";

const module: NuxtModule<PwaNuxtOptions> = defineNuxtModule<PwaNuxtOptions>({
  meta: {
    name: "@pwa-platform/nuxt",
    configKey: "pwaPlatform",
    compatibility: { nuxt: ">=4.5.0 <4.6.0" },
  },

  setup(options, nuxt) {
    const validated = validateOptions(options);

    // Build-time base check (design section 4): mountPath and scope are production-immutable (ADR-0004), so a
    // Vite/Nuxt `base` that disagrees with the identity is a build-time configuration error, not a runtime one.
    // Re-asserted again at build-hook time in artifacts.ts's registerArtifactPipeline (评审第 2 项): nothing stops
    // a later hook from reassigning app.baseURL between this check and the build actually running.
    checkBaseUrlMatchesMountPath(nuxt, validated.identity.mountPath);

    // Dev guard (评审第 12 项): these two overrides exist for the platform's own production update-confirmation
    // model (ADR-0013) — a dev server has neither production builds nor the update prompt they coordinate with, so
    // applying them there would only change Nuxt's own HMR chunk-error behaviour for no reason that applies here.
    if (!nuxt.options.dev) applyReloadDefaults(nuxt);

    // T6: setup-time checks (build-assets-outside-scope, cdn-url-unsupported), the offline page's no-script route
    // rule, and the nitro:build:public-assets hook that writes the worker, recovery worker and manifest. A no-op
    // in dev, same as pwa()'s own build hooks.
    registerArtifactPipeline(nuxt, validated);

    // Page config through a virtual module, resolved in BOTH the client and server builds (design section 5,
    // amended T7b / spec decision 18): the plan it would ideally come from does not exist until T6, well after
    // this module's own setup has returned. No `applyToEnvironment` restriction — omitted, it applies to every
    // environment, which is what lets the server-side half of runtime/plugin.ts resolve it too (verified: T7b's
    // real-build test reads the initial state back out of server-rendered HTML).
    const clientConfig = createClientConfigFromOptions(validated);
    const virtualModule: PwaNuxtVirtualModule = { config: clientConfig, mountPath: validated.identity.mountPath };
    addVitePlugin({
      name: "pwa-platform:nuxt-config",
      resolveId(id) {
        return id === VIRTUAL_MODULE_ID ? VIRTUAL_RESOLVED_ID : null;
      },
      load(id) {
        return id === VIRTUAL_RESOLVED_ID ? serializeVirtualModule(virtualModule) : null;
      },
    });

    // The runtime plugin ships compiled inside this package's `dist`, so it needs `build.transpile` to be bundled
    // by Vite instead of treated as an external node_modules dependency (T1 record: this is what lets it resolve
    // both `nuxt/app` and the virtual module in the client build).
    nuxt.options.build.transpile.push("@pwa-platform/nuxt");

    // No extension on purpose: `addPlugin` resolves it through Nuxt's own extension list, which is what lets the
    // same source find the file whether this module is running from its built `dist` (published, `.js`) or
    // straight from `src` (this package's own tests, `.ts`).
    //
    // No `mode` (T7b, spec decision 18): `NuxtPlugin`'s own default is `"all"`, so the same plugin file is bundled
    // into both the client and server builds, each carrying only its own half after `import.meta.server` /
    // `import.meta.client` dead-code elimination (see that file's own comment).
    const resolver = createResolver(import.meta.url);
    addPlugin({ src: resolver.resolve("./runtime/plugin") });
  },
});

export default module;

// Lets an application's own nuxt.config.ts type-check `pwaPlatform: { identity, policy, install }` under the
// module's configKey, the same way any published Nuxt module augments its config surface.
declare module "nuxt/schema" {
  interface NuxtConfig {
    pwaPlatform?: PwaNuxtOptions;
  }
  interface NuxtOptions {
    pwaPlatform: PwaNuxtOptions;
  }
}

/**
 * Nuxt's own auto-reload defaults conflict with the platform's update-confirmation model (ADR-0013): left alone,
 * `emitRouteChunkError: "automatic"` and a `checkOutdatedBuildInterval` reload the page without asking, which can
 * discard state the application never offered to save and can race the platform's own update prompt.
 *
 * "Explicitly set" has to be read from the user's raw config layers, not from `nuxt.options.experimental` itself:
 * by the time any module's `setup` runs, `nuxt.options` already carries `@nuxt/schema`'s defaults merged in, so an
 * unset field and one the app deliberately set back to the default would be indistinguishable there. Reading
 * `_layers[*].config` reaches the config as the app actually wrote it, before that merge.
 */
function applyReloadDefaults(nuxt: Nuxt): void {
  if (!isExplicitlySet(nuxt, "emitRouteChunkError")) {
    nuxt.options.experimental.emitRouteChunkError = "manual";
  }
  if (!isExplicitlySet(nuxt, "checkOutdatedBuildInterval")) {
    nuxt.options.experimental.checkOutdatedBuildInterval = false;
  }
}

function isExplicitlySet(nuxt: Nuxt, key: "emitRouteChunkError" | "checkOutdatedBuildInterval"): boolean {
  return nuxt.options._layers.some((layer) => {
    const experimental = layer.config?.experimental;
    return experimental !== undefined && experimental !== null && experimental[key] !== undefined;
  });
}
