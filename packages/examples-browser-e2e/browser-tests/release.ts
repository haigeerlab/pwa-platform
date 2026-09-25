// Inputs for the three release checks, assembled from what the build actually shipped.
import { readdir, readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PwaObservedResponses } from "@pwa-platform/build-verifier";
import type { FixtureServer } from "@pwa-platform/browser-test-harness";
import {
  cacheName,
  cacheNamespacePrefix,
  type PwaPlan,
  type PwaPlanOfflineFallback,
  type PwaPrecacheEntry,
  type PwaRequestBaselineDenial,
  type PwaUpdateMode,
} from "@pwa-platform/contracts";
import type { Page } from "@playwright/test";
import { IDENTITY, INSTALL, SHELL_URL } from "../apps/shared/identity.js";
import { siteRoot, type ExampleName, type VersionName } from "./sites.js";

/** Where the slot baselines live; `readIdentityBaseline` appends `<slot>.json` itself. */
export const BASELINE_DIRECTORY: string = fileURLToPath(new URL("../apps/shared/release-baseline/", import.meta.url));
export const BASELINE_SLOT = "production";

/** The parts of the platform worker's injected configuration this module reads back. */
export type ShippedWorker = {
  readonly scope: string;
  readonly precacheCacheName: string;
  readonly requestBaselineDenials: readonly PwaRequestBaselineDenial[];
  readonly offlineFallback: PwaPlanOfflineFallback;
  readonly updateMode: PwaUpdateMode;
  readonly precache: readonly PwaPrecacheEntry[];
};

/**
 * Reads the platform worker a version shipped and returns the precache manifest and the configuration it carries.
 *
 * Both anchors are required to match exactly once; a build that stopped injecting either one fails here instead of
 * quietly yielding an empty plan that every check would then pass.
 */
export async function readShippedWorker(example: ExampleName, version: VersionName): Promise<ShippedWorker> {
  const source = await readFile(join(siteRoot(example, version), "app", "sw.js"), "utf8");
  const config = JSON.parse(only(source, /^\s*config: (\{"kind":"platform".*\}),$/m, "config")) as Omit<
    ShippedWorker,
    "precache"
  >;
  const precache = JSON.parse(only(source, /^\s*manifest: (\[.*\])$/m, "manifest")) as readonly PwaPrecacheEntry[];
  return {
    scope: config.scope,
    precacheCacheName: config.precacheCacheName,
    requestBaselineDenials: config.requestBaselineDenials,
    offlineFallback: config.offlineFallback,
    updateMode: config.updateMode,
    precache,
  };
}

function only(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  const first = matches[0]?.[1];
  if (matches.length !== 1 || first === undefined) {
    throw new Error(`Expected exactly one injected ${label} in the shipped worker, found ${matches.length}`);
  }
  return first;
}

/**
 * The input the three release checks are run against.
 *
 * vite-adapter does not publish the compiled plan as a file, so it cannot simply be read back. What the artifacts
 * do record is everything those checks look at: `verifyArtifacts`, `verifyResponseHeaders` and
 * `compareIdentityBaseline` read `identity` and `precache` and nothing else. `precache` is taken from the worker
 * the build shipped and `identity` is the object the build was given; the caller cross-checks both against the
 * worker's own configuration before using them.
 *
 * The remaining fields exist because `PwaPlan` is a closed shape. Where the shipped worker's configuration carries
 * one — the request baseline, the offline fallback, the update mode — it is read back from there; the rest are
 * constants of this example's configuration. `pathRules` is the exception: no shipped artifact records it in full
 * (the worker's rules carry a path and an action but not the resource class or the source), so it is left empty,
 * and no check reads it. This object is therefore an input assembled for three checks, not a claim about what the
 * compiler produced.
 */
export function releaseInput(shipped: ShippedWorker): PwaPlan {
  return {
    schemaVersion: 1,
    planVersion: 1,
    policyVersion: 1,
    identity: IDENTITY,
    install: INSTALL,
    hostBuildOutput: { publicPath: SHELL_URL },
    topology: { kind: "standalone-origin" },
    artifacts: { serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest" },
    precache: shipped.precache,
    cacheNamespace: { prefix: cacheNamespacePrefix(IDENTITY) },
    requestBaselineDenials: shipped.requestBaselineDenials,
    pathRules: [],
    offlineFallback: shipped.offlineFallback,
    updateMode: shipped.updateMode,
    diagnostics: [],
  };
}

/** The cache the worker was told to precache into, for cross-checking a shipped worker against the identity. */
export function expectedPrecacheCacheName(): string {
  return cacheName(IDENTITY, "precache");
}

/** Every file the build published, as the absolute paths the server serves them at. */
export async function publishedPaths(example: ExampleName, version: VersionName): Promise<readonly string[]> {
  const root = siteRoot(example, version);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => `/${posix.join(join(entry.parentPath, entry.name).slice(root.length).split(sep).join("/"))}`);
}

/** The paths the header baseline judges: the worker, the manifest, and every fingerprinted precache entry. */
export function headerPaths(plan: PwaPlan): readonly string[] {
  return [
    plan.identity.serviceWorkerUrl,
    plan.identity.manifestUrl,
    ...plan.precache.filter(({ revision }) => revision === null).map(({ url }) => url),
  ];
}

/**
 * Fetches each path and records the headers the deployment actually returned.
 *
 * `page.request` is used rather than a fetch inside the document: it goes to the server without passing through
 * the service worker, and the baseline is about what the deployment serves, not about what a worker replays.
 */
export async function collectHeaders(
  page: Page,
  fixtureServer: FixtureServer,
  paths: readonly string[],
): Promise<PwaObservedResponses> {
  const observed: Record<string, Readonly<Record<string, string>>> = {};
  for (const path of paths) {
    const response = await page.request.get(fixtureServer.url(path), { headers: { "cache-control": "no-cache" } });
    if (!response.ok()) throw new Error(`The deployment answered ${response.status()} for a path the plan names`);
    observed[path] = response.headers();
  }
  return observed;
}
