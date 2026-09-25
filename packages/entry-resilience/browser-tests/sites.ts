// Two origins for one test, and a platform build that knows how to mount both `pwa()` and `pwaEntryResilience()`
// together — the current origin (`primary`) and the target/alternate origin (`alternate`). ADR-0033 (2026-09-23)
// removed the discovery source: EM4 (tasks/pwa-entry-resilience/plan.md) dropped the third fixture server this file
// used to start for it, along with the signed-envelope helpers that server existed to serve. There is nothing left
// for the build to trust at build time either, so `pwaEntryResilience()` here takes only `identity` and
// `maxValidityDays`, same as any real application's `vite.config`.
//
// The fixture server's port is chosen by the operating system, so the servers start first on empty directories and
// the app is built into them afterwards, with the real origins baked in via `pwaEntryResilience`'s identity (the
// alternate origin itself is never baked into the build — ADR-0033 also dropped the build-time origin approval
// list, so a test supplies it at run time, through `updateEntryManifest`, exactly as an application would).
//
// The harness's own `fixtureServer` fixture is not used here: it closes its server when the test ends, and closing
// an already closed server fails, so a test that takes an origin down mid-way has to own that server itself.
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer, type FixtureServer, type HeaderRule } from "@pwa-platform/browser-test-harness";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { pwa } from "@pwa-platform/vite";
import { build } from "vite";
import type { PwaEntryPageLocale, PwaEntryPageMessages } from "../src/page/messages.js";
import { pwaEntryResilience } from "../src/vite/index.js";

export const SHELL_URL = "/app/";
export const WORKER_URL = "/app/sw.js";

export const IDENTITY: PwaIdentity = {
  appId: "entryfixture",
  manifestId: SHELL_URL,
  // Not the origin the tests serve from: the platform never compares it with `location.origin` at run time.
  origin: "https://entry-fixture.pwa-platform.invalid",
  scope: SHELL_URL,
  serviceWorkerUrl: WORKER_URL,
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: SHELL_URL,
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const INSTALL: PwaInstallMetadata = {
  startUrl: SHELL_URL,
  display: "standalone",
  name: "Entry resilience fixture",
  shortName: "Entry",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** Mount-relative paths, as in the examples: the compiler resolves them under `mountPath`. The `/pwa-entry.html`
 *  rule is the one the spec's "构建集成" requires the application's own policy to add; without it `writeBundle`
 *  fails the build with `entry.recovery-page-not-precached`. */
const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/pwa-entry.html", resourceClass: "asset", cache: "cache-first" },
  ],
};

const PRIMARY_HEADERS: readonly HeaderRule[] = [
  { pathPrefix: "/app/", headers: { "cache-control": "no-cache" } },
  { pathPrefix: "/app/assets/", headers: { "cache-control": "public, max-age=31536000, immutable" } },
];

export type StartSitesOptions = {
  /** Forwarded verbatim to `pwaEntryResilience`'s `css` option (styling.spec.ts's host-override coverage). */
  readonly css?: string;
  /** Forwarded verbatim to `pwaEntryResilience`'s `locale` and `messages` options (locale.spec.ts). */
  readonly locale?: PwaEntryPageLocale;
  readonly messages?: Partial<PwaEntryPageMessages>;
};

export type Sites = {
  readonly primary: FixtureServer;
  readonly alternate: FixtureServer;
  /** Closes one server; closing it again is a no-op, so a test may take an origin down before cleanup runs. */
  close(server: FixtureServer): Promise<void>;
  closeAll(): Promise<void>;
  /** The primary's version whose `sw.js` is the recovery worker, renamed onto the worker URL as the release process would. */
  readonly recoveryVersion: string;
};

const APP_ROOT = fileURLToPath(new URL("./fixture-app/", import.meta.url));

/**
 * Starts the primary and alternate servers, then builds the fixture app into the primary's version directories
 * with both `pwa()` and `pwaEntryResilience()` mounted. Mirrors the module header's "servers first, build second"
 * approach for the same reason: the servers' ports are assigned by the operating system.
 */
export async function startSites(options: StartSitesOptions = {}): Promise<Sites> {
  const workspace = await mkdtemp(join(tmpdir(), "pwa-entry-sites-"));
  const directories = {
    v1: join(workspace, "primary-v1"),
    recovery: join(workspace, "primary-recovery"),
    alternate: join(workspace, "alternate"),
  };
  for (const directory of Object.values(directories)) await mkdir(directory, { recursive: true });

  const primary = await startFixtureServer({
    versions: { v1: directories.v1, recovery: directories.recovery },
    initialVersion: "v1",
    headerRules: PRIMARY_HEADERS,
  });
  const alternate = await startFixtureServer({ versions: { live: directories.alternate } });

  const closed = new Set<FixtureServer>();
  const close = async (server: FixtureServer): Promise<void> => {
    if (closed.has(server)) return;
    closed.add(server);
    await server.close();
  };

  try {
    await build({
      root: APP_ROOT,
      base: SHELL_URL,
      configFile: false,
      envDir: false,
      logLevel: "silent",
      build: { outDir: join(directories.v1, "app"), emptyOutDir: true, minify: false },
      plugins: [
        pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL, topology: { kind: "standalone-origin" } }),
        pwaEntryResilience({
          identity: IDENTITY,
          maxValidityDays: 30,
          ...(options.css !== undefined ? { css: options.css } : {}),
          ...(options.locale !== undefined ? { locale: options.locale } : {}),
          ...(options.messages !== undefined ? { messages: options.messages } : {}),
        }),
      ],
    });
    await cp(join(directories.v1, "app"), join(directories.recovery, "app"), { recursive: true });
    await cp(join(directories.recovery, "app", "pwa-recovery-worker.js"), join(directories.recovery, "app", "sw.js"));

    await mkdir(join(directories.alternate, "app"), { recursive: true });
    await writeFile(join(directories.alternate, "app", "index.html"), "<!doctype html><h1 id=\"alternate\">alternate</h1>");
  } catch (error) {
    await Promise.all([primary, alternate].map(close));
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }

  return {
    primary,
    alternate,
    close,
    async closeAll() {
      await Promise.all([primary, alternate].map(close));
      await rm(workspace, { recursive: true, force: true });
    },
    recoveryVersion: "recovery",
  };
}
