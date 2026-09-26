// The build adapter's single entry: one Vite plugin that wires the platform's packages into one pipeline.
import type { PwaPlan } from "@pwa-platform/contracts";
import type { Plugin } from "vite";
import { assertPwaArtifacts, buildPwaArtifacts } from "./artifacts.js";
import {
  CLIENT_CONFIG_MODULE_ID,
  CLIENT_CONFIG_RESOLVED_ID,
  createClientConfigFromOptions,
  serializeClientConfigModule,
} from "./client-config.js";
import { assertUnchangedBundleFiles, bundleSourceFiles, hashBundleFiles, type PwaBundle } from "./host-output.js";
import { assertFinalManifestLink, resolveManifestLinkAction } from "./manifest-link.js";
import { renderOfflinePage } from "./offline-page.js";
import {
  failOfflinePageDiagnostic,
  validateOfflinePageOption,
  validateOptions,
  type PwaViteOptions,
} from "./options.js";
import { readPublicFiles } from "./public-files.js";

export type { PwaViteOfflinePageOptions, PwaViteOptions } from "./options.js";
export type { PwaOfflinePageLocale, PwaOfflinePageMessages } from "./offline-page.js";
export type {
  PwaArtifactInput,
  PwaArtifactOutputFile,
  PwaArtifactResult,
  PwaArtifactSourceFile,
} from "./artifacts.js";
export { assertPwaArtifacts, buildPwaArtifacts } from "./artifacts.js";

export const PWA_PLUGIN_NAME = "pwa-platform";

/** Recursively freezes a plain data object so no caller can mutate it or anything it references. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export type PwaPluginApi = {
  /**
   * Returns the plan compiled for this build; a deeply frozen copy the caller cannot mutate.
   *
   * Ready only after this plugin's own `generateBundle` has compiled a plan successfully, and only until the next
   * `buildStart`. Before that point — including during another plugin's `generateBundle`, since this plugin runs
   * `enforce: "post"` — and whenever compilation fails, this returns `null`. Callers should read it from
   * `writeBundle` or a later hook.
   */
  getPlan(): PwaPlan | null;
};

/**
 * Creates the platform's Vite plugin.
 *
 * Options are validated here, not in a build hook: a bad origin or an out-of-scope start URL should fail while the
 * developer is still looking at `vite.config`.
 *
 * The virtual client config is available in both development and builds. Bundle hooks only run during builds;
 * the plugin runs last (`enforce: "post"`) so it reads the finished bundle before collecting the precache list.
 */
export function pwa(options: PwaViteOptions): Plugin<PwaPluginApi> {
  const validated = validateOptions(options);
  // Validated against the already-validated policy, not the raw option — see options.ts's
  // `validateOfflinePageOption`. `undefined` means the option was never set: no page is rendered, and nothing in
  // generateBundle below runs differently than before this option existed (spec's "未开启时行为逐字节不变").
  const offlinePage = validateOfflinePageOption(options.offlinePage, validated.policy);
  let base = "";
  let publicDir = "";
  let copyPublicDir = true;
  // Carried from generateBundle to writeBundle: the plan is compiled where the bundle is complete, but the files
  // this plugin emits only become observable later (see the writeBundle hook).
  let planForCheck: PwaPlan | undefined;
  let bundleHashesForCheck: ReadonlyMap<string, string> | undefined;
  // The plan other plugins can read through `api.getPlan()`. Kept separate from `planForCheck` so nothing an
  // outside caller does to the exposed copy can reach the object this plugin's own artifact check relies on.
  let exposedPlan: PwaPlan | null = null;
  let publicPaths: readonly string[] = [];
  let htmlEntryFiles = new Set<string>();

  return {
    name: PWA_PLUGIN_NAME,
    enforce: "post",

    api: {
      getPlan: () => exposedPlan,
    },

    buildStart() {
      // A second build on the same plugin instance must not leak the previous one's plan: if this build's own
      // compilation fails before generateBundle sets a new value, getPlan() has to report "not ready", not "ready
      // with stale data".
      planForCheck = undefined;
      bundleHashesForCheck = undefined;
      exposedPlan = null;
      htmlEntryFiles = new Set<string>();
    },

    resolveId(id) {
      // Returning the NUL-prefixed id marks it as not-a-file, so no other plugin tries to read it from disk.
      return id === CLIENT_CONFIG_MODULE_ID ? CLIENT_CONFIG_RESOLVED_ID : null;
    },

    load(id) {
      if (id !== CLIENT_CONFIG_RESOLVED_ID) return null;
      // Built from the options, not from the plan: this runs while the module graph is being assembled, long
      // before generateBundle compiles one. Every field the page config needs is settled by the options alone.
      return serializeClientConfigModule(createClientConfigFromOptions(validated));
    },

    configResolved(config) {
      // `base` is the only thing this plugin takes from the host's config, and it is read once: reading it again
      // inside generateBundle would let a later plugin's mutation change what the plan says was published.
      base = config.base;
      // Both switches matter: `publicDir` is "" when the directory is disabled, and `copyPublicDir` false stops
      // the copy while leaving the path set. Reading only one would put files in the manifest that never ship.
      publicDir = config.publicDir;
      copyPublicDir = config.build.copyPublicDir;
    },

    transformIndexHtml(html, ctx) {
      // `ctx.path` is Vite's own root-relative served path for this HTML entry ("/index.html",
      // "/admin/index.html") — an identifier this plugin already gets for free, safe to put in an error message,
      // and the same whether the app builds one page or many.
      const action = resolveManifestLinkAction(html, validated.identity.origin, validated.identity.manifestUrl, ctx.path);
      htmlEntryFiles.add(ctx.path.replace(/^\//, ""));
      if (action === "keep") return;
      // `injectTo: "head"` appends at the end of <head>, matching the spec: the platform adds its own link without
      // disturbing anything the app already put there.
      return [{ tag: "link", attrs: { rel: "manifest", href: validated.identity.manifestUrl }, injectTo: "head" }];
    },

    async generateBundle(_outputOptions, bundle) {
      // Collected before anything is emitted, so the plan is compiled against what the app itself produced.
      bundleHashesForCheck = hashBundleFiles(bundle as unknown as PwaBundle);
      const publicFiles = readPublicFiles(publicDir, copyPublicDir);
      publicPaths = publicFiles.map((file) => `${base}${file.path}`);

      // Public files are merged in here: Vite copies them at write time, so they never enter the bundle.
      const files = bundleSourceFiles(bundle as unknown as PwaBundle, publicFiles);

      // The default offline page, when enabled — spec/vite-adapter.md's "修订：平台默认离线页". Added to `files`
      // before `buildPwaArtifacts` compiles the plan, so the page is a host build output file like any other and
      // enters the precache the same way a business-authored offline page would (OP3's plan: "在 buildPwaArtifacts
      // 之前才加入 files"). validateOfflinePageOption (options.ts, run at plugin creation) already guarantees
      // offlineFallback is enabled whenever offlinePage is set, so the `enabled` branch below always matches.
      if (offlinePage !== undefined && validated.policy.offlineFallback.enabled) {
        // `offlineFallback.path` is mount-relative, and this package treats Vite's `base` and `identity.mountPath` as
        // the same served root (host-output.ts's `relativeTo` assumes it for the worker and manifest URLs too), so
        // the output file name is that path without its leading slash. Core resolves the same path against
        // `mountPath` when it compiles the precache; should the two roots ever differ, the build fails there with
        // compile.offline-fallback-not-built rather than precaching a page that is not where the plan says.
        const offlinePageFileName = validated.policy.offlineFallback.path.slice(1);
        if (files.some((file) => file.path === offlinePageFileName)) {
          // Covers both sources a conflicting file could come from: a business-authored bundle output (an HTML
          // file Vite itself emitted at that path) and a public-directory file (already merged into `files` by
          // bundleSourceFiles above) — one check, because both already ended up in the same list.
          failOfflinePageDiagnostic("vite.offline-page-conflict", "/policy/offlineFallback/path");
        }

        const rendered = await renderOfflinePage({
          locale: offlinePage.locale,
          ...(offlinePage.messages !== undefined ? { messages: offlinePage.messages } : {}),
          ...(offlinePage.css !== undefined ? { css: offlinePage.css } : {}),
          appName: validated.install?.name ?? null,
        });
        files.push({ path: offlinePageFileName, content: rendered.html });
        // `files` only feeds `buildPwaArtifacts`' plan compilation (what the precache is allowed to name); it is
        // not written to disk on its own. The page still has to reach the actual build output, the same as any
        // other file this plugin emits below.
        this.emitFile({ type: "asset", fileName: offlinePageFileName, source: rendered.html });

        // CSP hashes for the page's inline blocks, logged and never written to a file — same convention
        // packages/entry-resilience/src/vite/index.ts uses for the recovery page's own inline style.
        this.info(`${offlinePageFileName} style (default): ${rendered.hashes.defaultStyle}`);
        if (rendered.hashes.hostStyle !== null) {
          this.info(`${offlinePageFileName} style (host css): ${rendered.hashes.hostStyle}`);
        }
        this.info(`${offlinePageFileName} script: ${rendered.hashes.script}`);
      }

      const built = await buildPwaArtifacts({ ...validated, publicPath: base, files });

      // The compiler's warnings reach the build output (codes and contract paths only, never values). Until the
      // shared-origin module this plugin dropped them; a root app's child-scope files kept out of the precache
      // (`compile.host-file-in-child-scope`, ADR-0019) are exactly the kind of thing a developer has to see.
      for (const warning of built.warnings) {
        this.warn(`${warning.code} at ${warning.path === "" ? "(root)" : warning.path}`);
      }

      // Order follows PwaArtifactResult's contract: the manifest (when present), the platform worker, the recovery
      // worker. The platform worker goes to the address the identity registers; the recovery worker goes beside it
      // under a name the release process renames onto that address when a drill or an incident calls for it.
      for (const file of built.files) {
        this.emitFile({ type: "asset", fileName: file.path, source: file.content });
      }

      planForCheck = built.plan;
      exposedPlan = deepFreeze(structuredClone(built.plan));
    },

    writeBundle(_outputOptions, bundle) {
      // Checked here, not in generateBundle, because that hook cannot see what it just emitted: measured, a file
      // added with emitFile is absent from that hook's own bundle object and present in this one. Verifying an
      // inventory this plugin wrote down from memory would be checking its own bookkeeping; this reads what the
      // build actually produced. Throwing here still fails the build — also measured.
      if (planForCheck === undefined) return;

      if (bundleHashesForCheck !== undefined) {
        assertUnchangedBundleFiles(bundle as unknown as PwaBundle, bundleHashesForCheck);
      }

      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !htmlEntryFiles.has(output.fileName)) continue;
        const html = typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source);
        assertFinalManifestLink(
          html,
          validated.identity.origin,
          validated.identity.manifestUrl,
          `/${output.fileName}`,
        );
      }

      // Files copied from the public directory never enter the bundle at any stage, so they are added from what
      // was read off disk. Precache entries pointing at them would otherwise all report as missing.
      const published = [...Object.keys(bundle).map((fileName) => `${base}${fileName}`), ...publicPaths];

      assertPwaArtifacts(planForCheck, published);
    },
  };
}
