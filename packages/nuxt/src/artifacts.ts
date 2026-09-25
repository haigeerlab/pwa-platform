// The artifact pipeline (design section 1): runs the platform's build pipeline on Nuxt's *final* `.output/public`
// inside the `nitro:build:public-assets` hook (T1 record: after prerendering and the public-directory copy, before
// Nitro freezes its static file table — later writes are invisible to `node-server`). Production builds only;
// `nuxt.options.dev` skips this module entirely, the same way a dev server never runs `pwa()`'s build hooks either.
//
// `nitro:build:public-assets` and `NuxtOptions.routeRules` are typed by `@nuxt/nitro-server`'s own ambient module
// augmentation to "nuxt/schema", not by nuxt/schema itself — and that package cannot be depended on directly (T6's
// boundary only approved @pwa-platform/vite and @pwa-platform/sw-runtime as new dependencies, confirmed reachable
// via `useNitro`/`useLogger`'s own return types). So this file augments the same two members itself, narrowed to
// what it reads and writes, the same way src/index.ts already augments `NuxtConfig`/`NuxtOptions` for `pwaPlatform`.
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { PwaPathRule, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { createPathMatcher, type PwaPathMatcher } from "@pwa-platform/sw-runtime";
import { assertPwaArtifacts, buildPwaArtifacts, type PwaArtifactOutputFile, type PwaArtifactSourceFile } from "@pwa-platform/vite";
import { useLogger, useNitro } from "nuxt/kit";
import type { Nuxt } from "nuxt/schema";
import type { PwaNuxtValidatedOptions } from "./options.js";

/** Structural type reached indirectly via `useNitro`'s own return type (nitropack cannot be resolved directly here). */
export type NitroLike = ReturnType<typeof useNitro>;
/** Structural type reached indirectly via `useLogger`'s own return type (consola cannot be resolved directly here). */
export type LoggerLike = ReturnType<typeof useLogger>;
type NitroBuildPublicAssetsHook = (nitro: NitroLike) => void | Promise<void>;

declare module "nuxt/schema" {
  interface NuxtHooks {
    "nitro:build:public-assets": NitroBuildPublicAssetsHook;
  }
  interface NuxtOptions {
    routeRules: Record<string, ({ noScripts?: boolean } & Record<string, unknown>) | undefined>;
  }
}

/** `app.baseURL` does not equal `identity.mountPath`. No path/URL values in the message. */
export const BASE_URL_MISMATCH_CODE = "nuxt.base-url-mismatch";
/** Setup-time: the published asset base falls outside `identity.scope` (design section 4). No path values. */
export const BUILD_ASSETS_OUTSIDE_SCOPE_CODE = "nuxt.build-assets-outside-scope";
/** Setup-time: `app.cdnURL` would serve assets from another origin, outside the worker's precache and scope. */
export const CDN_URL_UNSUPPORTED_CODE = "nuxt.cdn-url-unsupported";
/** The offline fallback's build path is not a form this module can turn into a Nuxt route. */
export const OFFLINE_PAGE_ROUTE_UNKNOWN_CODE = "nuxt.offline-page-route-unknown";
/** Logged (not thrown): the app explicitly disabled `noScripts` for the offline page's route. */
export const OFFLINE_PAGE_SCRIPTS_KEPT_CODE = "nuxt.offline-page-scripts-kept";
/** An HTML file in the final output — prerendered or copied verbatim from `public/` — falls under a denied path
 * rule (design section 2). No path values. */
export const PRERENDERED_HTML_DENIED_CODE = "nuxt.prerendered-html-denied";
/** Logged (not thrown) whenever `recoveryRelease` is on: the recovery worker is being published in the platform
 * worker's own place (T7b, spec decision 19). */
export const RECOVERY_RELEASE_CODE = "nuxt.recovery-release";
/** Setup-time: a v3 policy with `runtimeCache.enabled: true` is not supported by this adapter yet (T10, spec
 * "适配器"). A v3 policy with `runtimeCache.enabled: false` builds exactly like v2. No policy values echoed, same
 * convention as the module's other setup-time checks. */
export const RUNTIME_CACHE_UNSUPPORTED_CODE = "nuxt.runtime-cache-unsupported";

/**
 * `buildPwaArtifacts`'s own recovery-worker file name (packages/vite/src/workers.ts's `RECOVERY_WORKER_FILE`, not
 * exported from its public entry — this package's dependency boundary only approved the two functions, not that
 * constant — but it is otherwise part of this package's own established, documented output shape: T6's and T7's
 * own tests already read this exact literal off a real build).
 */
const RECOVERY_WORKER_FILE = "pwa-recovery-worker.js";

/**
 * Wires the artifact pipeline into `nuxt`: the two setup-time checks, the offline page's no-script route rule, and
 * the `nitro:build:public-assets` hook. A no-op in dev — none of this applies to a dev server, the same way `pwa()`
 * never runs its own build hooks there.
 */
export function registerArtifactPipeline(nuxt: Nuxt, validated: PwaNuxtValidatedOptions): void {
  if (nuxt.options.dev) return;

  const logger = useLogger("pwa-platform:nuxt");

  checkBuildAssetsWithinScope(nuxt, validated.identity.scope);
  checkNoCdnUrl(nuxt);
  checkNoRuntimeCache(validated.policy);
  if (validated.policy.offlineFallback.enabled) {
    applyOfflineNoScripts(nuxt, validated.policy.offlineFallback.path, logger);
  }

  nuxt.hook("nitro:build:public-assets", async (nitro) => {
    // Re-asserted here, before anything else (评审第 2 项): src/index.ts's setup-time check reads
    // `nuxt.options.app.baseURL` once, but this hook runs much later — after every other module's own
    // `modules:done`/`ready` handlers, which are free to reassign it in between. Capturing the value as a plain
    // argument (the line below) only proves it matched at *this* call, not that it still does; checking again is
    // what closes that window instead of merely re-reading the same possibly-stale field.
    checkBaseUrlMatchesMountPath(nuxt, validated.identity.mountPath);
    await runArtifactPipeline(nitro, validated, nuxt.options.app.baseURL, logger);
  });
}

/**
 * Throws `BASE_URL_MISMATCH_CODE` when `nuxt.options.app.baseURL` no longer equals `identity.mountPath`. Called at
 * module setup (src/index.ts) and again as the first thing the `nitro:build:public-assets` hook does. The message
 * names both fields, never their values, per the module's error-message convention.
 */
export function checkBaseUrlMatchesMountPath(nuxt: Nuxt, mountPath: string): void {
  if (nuxt.options.app.baseURL !== mountPath) {
    throw new Error(`${BASE_URL_MISMATCH_CODE}: nuxt.options.app.baseURL must equal identity.mountPath`);
  }
}

// ---- setup-time checks (design section 4) --------------------------------------------------------------------

/**
 * ufo-style relative join: single slashes between segments, and "." / ".." segments resolved the same way Nuxt's
 * own runtime `buildAssetsURL` helper resolves them (`joinRelativeURL`, not the non-resolving `joinURL`) — so this
 * sees the same asset base the running app will actually publish to, including a `buildAssetsDir` that traverses
 * out of `baseURL` with "../".
 */
export function resolveAssetBase(baseURL: string, buildAssetsDir: string): string {
  const stack: string[] = [];
  for (const segment of `${baseURL}/${buildAssetsDir}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return `/${stack.join("/")}${stack.length > 0 ? "/" : ""}`;
}

function checkBuildAssetsWithinScope(nuxt: Nuxt, scope: string): void {
  const assetBase = resolveAssetBase(nuxt.options.app.baseURL, nuxt.options.app.buildAssetsDir);
  if (!assetBase.startsWith(scope)) {
    throw new Error(
      `${BUILD_ASSETS_OUTSIDE_SCOPE_CODE}: app.baseURL joined with app.buildAssetsDir must stay within identity.scope`,
    );
  }
}

function checkNoCdnUrl(nuxt: Nuxt): void {
  if (nuxt.options.app.cdnURL !== "") {
    throw new Error(`${CDN_URL_UNSUPPORTED_CODE}: app.cdnURL is not supported; it would serve assets from another origin`);
  }
}

/**
 * A v3 policy that enables the runtime cache is not supported by this adapter yet (T10, spec "适配器"): the Vite
 * plugin accepts it, but this module has no equivalent for it. Exported so the pure check can be unit-tested
 * without a real Nuxt build, the same way `resolveAssetBase`/`deriveOfflineRoute` are.
 */
export function checkNoRuntimeCache(policy: PwaPolicy): void {
  if (policy.schemaVersion === 3 && policy.runtimeCache.enabled) {
    throw new Error(`${RUNTIME_CACHE_UNSUPPORTED_CODE}: policy.runtimeCache.enabled is not supported by this adapter yet`);
  }
}

/**
 * Derives the Nuxt route for the offline fallback from its mount-relative build path: `/x/index.html` -> `/x`,
 * `/index.html` -> `/`, `/x.html` -> `/x`. Any other form throws `nuxt.offline-page-route-unknown`.
 */
export function deriveOfflineRoute(mountRelativePath: string): string {
  if (mountRelativePath === "/index.html") return "/";
  const indexMatch = /^(\/[\s\S]*)\/index\.html$/.exec(mountRelativePath);
  if (indexMatch?.[1] !== undefined) return indexMatch[1];
  const htmlMatch = /^(\/[\s\S]*)\.html$/.exec(mountRelativePath);
  if (htmlMatch?.[1] !== undefined) return htmlMatch[1];
  throw new Error(`${OFFLINE_PAGE_ROUTE_UNKNOWN_CODE}: cannot derive a Nuxt route from the offline fallback's build path`);
}

/**
 * Sets `noScripts: true` for the offline page's route (checkpoint A decision 14), merged with whatever rule the app
 * already declared for that route. An app that explicitly turned it off keeps its own value — this only logs, it
 * never overrides an explicit `false`.
 *
 * The route rule field is `noScripts`, not the `experimentalNoScripts` name the spec and checkpoint A decision 14
 * assumed: T6's real-build check (design section 3, "该做法在 T6/T7 实测") found that Nuxt 4.5.2's renderer
 * (`@nuxt/nitro-server`'s `runtime/handlers/renderer.mjs`) only ever reads `routeOptions.noScripts` — nowhere in
 * the installed runtime is `experimentalNoScripts` read back out, only declared as a `@deprecated` type alias with
 * no code path behind it. `noScripts` is confirmed to work for a prerendered page too (this module's own build
 * fixture proves it: a prerendered page under this rule ships with no app-entry `<script>`, one without it does).
 */
function applyOfflineNoScripts(nuxt: Nuxt, offlineFallbackPath: string, logger: LoggerLike): void {
  const route = deriveOfflineRoute(offlineFallbackPath);
  const existing = nuxt.options.routeRules[route];
  if (existing?.noScripts === false) {
    logger.warn(`${OFFLINE_PAGE_SCRIPTS_KEPT_CODE}: keeping the app's explicit noScripts: false on the offline page's route`);
    return;
  }
  nuxt.options.routeRules[route] = { ...existing, noScripts: true };
}

// ---- the hook (design section 1 & 2) --------------------------------------------------------------------------

/**
 * Every file under `root`, as POSIX paths relative to it, sorted.
 *
 * Uses the directory entry's own type (`withFileTypes`), not `statSync` (评审第 15 项): `statSync` follows
 * symlinks, so a symlinked subdirectory would be descended into — and a symlink back up toward `root` (or a cycle
 * between two symlinked directories) would recurse forever. `Dirent#isDirectory`/`#isFile` read the entry itself,
 * never a followed target, so a symlink (to a file or a directory) satisfies neither and is skipped outright — the
 * same choice packages/vite/src/public-files.ts's own directory walk already makes for the same reason.
 *
 * Exported for testing without a real Nuxt build.
 */
export function walkPublicDir(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push(relative(root, path).split("\\").join("/"));
    }
  };
  visit(root);
  return found.sort();
}

/**
 * Candidate URL paths a navigation to `path`'s file could resolve to, mirroring how the platform worker maps a
 * request onto a precached file (design section 2): the file itself; for `.../index.html`, its directory with and
 * without a trailing slash; for another `....html`, the same path with `.html` stripped (the `autoSubfolderIndex:
 * false` shape).
 *
 * The site root is its own case (评审第 9 项): `walkPublicDir` yields the root's own index file as `index.html`,
 * with no leading `/` to make the `.../index.html` branch below match it. Left to fall into the plain-`.html`
 * branch instead, it produced `publicPath` + `"index"` — a URL nothing ever requests — and never produced
 * `publicPath` itself, the one URL a visit to the site root actually resolves to.
 */
export function candidateHtmlUrls(publicPath: string, path: string): readonly string[] {
  const candidates = [`${publicPath}${path}`];
  if (path === "index.html") {
    // No "without a trailing slash" counterpart to add here, unlike the nested case below: that would be
    // `publicPath` itself minus its own trailing slash, which names a URL outside the app's scope, not another way
    // to reach the root.
    candidates.push(publicPath);
  } else if (path.endsWith("/index.html")) {
    const directory = path.slice(0, -"index.html".length);
    candidates.push(`${publicPath}${directory}`, `${publicPath}${directory.slice(0, -1)}`);
  } else if (path.endsWith(".html")) {
    candidates.push(`${publicPath}${path.slice(0, -".html".length)}`);
  }
  return candidates;
}

/** Count of final-output `.html` files — prerendered routes and files copied verbatim from `public/` alike (评审
 * 第 8 项: this walks the whole final `.output/public`, so it cannot tell the two sources apart) — whose
 * first-matching rule, on any candidate URL, is a deny rule. */
function countDeniedHtml(paths: readonly string[], publicPath: string, matcher: PwaPathMatcher<PwaPathRule>): number {
  return paths.filter(
    (path) => path.endsWith(".html") && candidateHtmlUrls(publicPath, path).some((url) => matcher.match(url)?.action === "deny"),
  ).length;
}

/**
 * `recoveryRelease` (T7b, spec decision 19): replaces the platform worker's own content with the recovery
 * worker's, at the platform worker's own path (`plan.artifacts.serviceWorkerFile`) — the recovery worker itself is
 * still written unchanged at its own path, and the manifest is untouched. `assertPwaArtifacts` still passes
 * afterwards: it only checks that the plan's required paths exist, not what bytes are at them.
 */
function applyRecoveryRelease(
  files: readonly PwaArtifactOutputFile[],
  plan: PwaPlan,
  logger: LoggerLike,
): readonly PwaArtifactOutputFile[] {
  const recovery = files.find((file) => file.path === RECOVERY_WORKER_FILE);
  if (recovery === undefined) {
    throw new Error(`${RECOVERY_RELEASE_CODE}: no recovery worker in this build's own output to publish`);
  }
  logger.warn(`${RECOVERY_RELEASE_CODE}: publishing the recovery worker at the platform worker's own path`);
  return files.map((file) =>
    file.path === plan.artifacts.serviceWorkerFile ? { ...file, content: recovery.content } : file,
  );
}

/**
 * sha256/base64url of a file's bytes, streamed rather than read whole into memory (评审第 3 项). `createHash` is
 * incremental, so digesting the same bytes one chunk at a time produces the exact same value as hashing them in
 * one call — this is interchangeable with `collectSourceFiles`'s own `hashOfContent` (packages/vite/src/
 * host-output.ts), which is what makes a caller-supplied `contentHash` and a computed one equivalent there.
 *
 * Exported for testing: proving this streamed digest matches a plain whole-buffer sha256/base64url of the same
 * file is the direct evidence that switching to it changed nothing about the resulting plan.
 */
export function hashFileContent(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk: string | Buffer) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("base64url")));
  });
}

/**
 * Exported for testing without a real Nuxt build: `nitro` only needs to structurally provide
 * `options.output.publicDir`, and `logger` only `warn`, so a test can pass minimal stand-ins for both.
 */
export async function runArtifactPipeline(
  nitro: NitroLike,
  validated: PwaNuxtValidatedOptions,
  publicPath: string,
  logger: LoggerLike,
): Promise<void> {
  const publicDir = nitro.options.output.publicDir;
  const paths = walkPublicDir(publicDir);
  // Nuxt's file names are content hashes only (T1 record), never matching vite-adapter's `-<8 characters>` rule —
  // fingerprinted: false is correct for every one of them, not just harmless to force.
  //
  // contentHash only, never content (评审第 3 项): the public directory can hold arbitrarily large files (video,
  // downloadable assets), and buildPwaArtifacts only ever needs their hash — PwaArtifactSourceFile.contentHash
  // (packages/vite/src/artifacts.ts) exists for exactly this caller, so nothing here has to hold a whole file in
  // memory to produce one.
  //
  // Hashed one file at a time rather than with `Promise.all`: a public directory can hold thousands of files, and
  // opening a read stream for every one of them at once would exhaust the process's file descriptors on exactly
  // the large outputs this streaming exists for.
  const files: PwaArtifactSourceFile[] = [];
  for (const path of paths) {
    files.push({ path, contentHash: await hashFileContent(join(publicDir, path)), fingerprinted: false });
  }

  const result = await buildPwaArtifacts({
    identity: validated.identity,
    policy: validated.policy,
    install: validated.install,
    topology: { kind: "standalone-origin" },
    publicPath,
    files,
  });

  for (const warning of result.warnings) {
    logger.warn(`${warning.code} at ${warning.path === "" ? "(root)" : warning.path}`);
  }

  // Runs before anything is written (design section 2): a private page that ended up as a static HTML file — via
  // prerendering or copied verbatim from public/ — is a configuration mistake, and writing the worker/manifest
  // first would not make that file any less published.
  const matcher = createPathMatcher(result.plan.pathRules);
  const deniedCount = countDeniedHtml(paths, publicPath, matcher);
  if (deniedCount > 0) {
    // 评审第 8 项: this check cannot tell a prerendered route from a file simply copied out of public/, so the
    // hint has to cover both of its actual causes, not just the first one T6 had in mind.
    throw new Error(
      `${PRERENDERED_HTML_DENIED_CODE}: ${deniedCount} final output HTML file(s) fall under a denied path rule; ` +
        "exclude prerendered routes with nitro.prerender.ignore, or move files copied from public/ out of the denied prefix",
    );
  }

  const filesToWrite = validated.recoveryRelease
    ? applyRecoveryRelease(result.files, result.plan, logger)
    : result.files;

  for (const file of filesToWrite) {
    const destination = join(publicDir, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.content);
  }

  const published = walkPublicDir(publicDir).map((path) => `${publicPath}${path}`);
  assertPwaArtifacts(result.plan, published);
}
