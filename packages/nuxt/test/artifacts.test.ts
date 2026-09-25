// Real Nuxt 4.5.x production builds that exercise T6's artifact pipeline (src/artifacts.ts): the
// `nitro:build:public-assets` hook writes the platform worker, recovery worker and manifest onto the final
// `.output/public`, and the setup-time checks (build-assets-outside-scope, cdn-url-unsupported) and the offline
// page's no-script route rule run before that. Slow on purpose — several full builds — but nothing here is faked:
// every assertion reads what a real build produced.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { PwaPolicyV3 } from "@pwa-platform/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withBuiltFixture } from "./nuxt-harness.js";
import { IDENTITY, INSTALL, POLICY } from "./fixtures/artifacts/pwa-config.js";

const FIXTURE = "artifacts";
const BUILD_TIMEOUT = 180_000;

/** The default resources plus a rule that no build output ever satisfies, for the asset-rule-unmatched scenario. */
const RESOURCES_WITH_UNMATCHED = [
  ...POLICY.resources,
  { pathPrefix: "/never-matches", resourceClass: "asset", cache: "cache-first" } as const,
];

function withResources(resources: typeof POLICY.resources): Record<string, unknown> {
  return { pwaPlatform: { identity: IDENTITY, policy: { ...POLICY, resources }, install: INSTALL } };
}

/** Whether `html` references the app's client entry (a `<script src=".../_nuxt/...">`), the way a hydrating page does. */
function hasAppEntryScript(html: string): boolean {
  return /<script[^>]+src="[^"]*\/_nuxt\//.test(html);
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address === null || typeof address === "string") reject(new Error("could not read a free port"));
        else resolve(address.port);
      });
    });
  });
}

type StartedServer = { readonly origin: string; stop(): Promise<void> };

/** Spawns a built Nitro `node-server` entry and waits until it actually answers requests, not a fixed delay. */
async function startNodeServer(entry: string): Promise<StartedServer> {
  const port = await getFreePort();
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`node server exited early with code ${child.exitCode}`);
    try {
      await fetch(origin);
      ready = true;
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  if (!ready) {
    child.kill();
    throw new Error("node server did not become ready within 30s");
  }

  return {
    origin,
    async stop() {
      child.kill();
      await new Promise((resolveExit) => child.once("exit", resolveExit));
    },
  };
}

describe("success: node-server build serves the platform's artifacts", () => {
  it(
    "writes sw.js, the recovery worker and the manifest, serves them, precaches prerendered pages, excludes session-data, and strips scripts from the offline page",
    async () => {
      let server: StartedServer | undefined;
      try {
        await withBuiltFixture(
          { nitro: { prerender: { routes: ["/", "/about", "/offline"] } } },
          async (publicDir, nuxt) => {
            // Written artifacts.
            const swSource = readFileSync(join(publicDir, "sw.js"), "utf8");
            expect(swSource.length).toBeGreaterThan(0);
            readFileSync(join(publicDir, "pwa-recovery-worker.js")); // throws (ENOENT) if missing
            readFileSync(join(publicDir, "manifest.webmanifest"));

            // The compiled precache: prerendered pages present, the session-data page absent.
            expect(swSource).toContain('"/app/about/index.html"');
            expect(swSource).toContain('"/app/offline/index.html"');
            // Precache entries are keyed "url" (path rules are keyed "pathPrefix", and /app/account legitimately
            // appears there as a deny rule) — so this checks the precache specifically, not the whole worker source.
            expect(swSource).not.toContain('"url":"/app/account');

            // Offline page has no app-entry script; a normal prerendered page still does.
            const aboutHtml = readFileSync(join(publicDir, "about", "index.html"), "utf8");
            const offlineHtml = readFileSync(join(publicDir, "offline", "index.html"), "utf8");
            expect(hasAppEntryScript(aboutHtml)).toBe(true);
            expect(hasAppEntryScript(offlineHtml)).toBe(false);

            // Served by the actual node-server entry the build produced.
            const serverEntry = join(nuxt.options.rootDir, ".output", "server", "index.mjs");
            server = await startNodeServer(serverEntry);
            const swResponse = await fetch(`${server.origin}/app/sw.js`);
            expect(swResponse.status).toBe(200);
            const manifestResponse = await fetch(`${server.origin}/app/manifest.webmanifest`);
            expect(manifestResponse.status).toBe(200);
          },
          FIXTURE,
        );
      } finally {
        await server?.stop();
      }
    },
    BUILD_TIMEOUT,
  );
});

describe("warning passthrough: an unmatched asset rule does not fail the build", () => {
  // The logged-warning half of this scenario (compile.asset-rule-unmatched reaching Nuxt's logger) is covered by
  // test/artifacts-checks.test.ts's direct call into runArtifactPipeline with a stub logger: consola's reporter
  // resolves `process.stdout`/`stderr` at write time in a way that a real build's own async/worker scheduling made
  // unreliable to intercept from here, so the logging assertion lives where it can be made deterministic instead.
  it(
    "still produces the worker in a real build (does not fail it)",
    async () => {
      await withBuiltFixture(
        { nitro: { prerender: { routes: ["/", "/about", "/offline"] } }, ...withResources(RESOURCES_WITH_UNMATCHED) },
        async (publicDir) => {
          readFileSync(join(publicDir, "sw.js"));
        },
        FIXTURE,
      );
    },
    BUILD_TIMEOUT,
  );
});

describe("denied prerendered HTML fails the build", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "fails with nuxt.prerendered-html-denied for the default autoSubfolderIndex shape (account/index.html), without naming the path",
    async () => {
      await expect(
        withBuiltFixture(
          { nitro: { prerender: { routes: ["/", "/about", "/offline", "/account"] } } },
          async () => undefined,
          FIXTURE,
        ),
      ).rejects.toThrow(/^nuxt\.prerendered-html-denied:/);
      await expect(
        withBuiltFixture(
          { nitro: { prerender: { routes: ["/", "/about", "/offline", "/account"] } } },
          async () => undefined,
          FIXTURE,
        ),
      ).rejects.not.toThrow(/account/);
    },
    BUILD_TIMEOUT,
  );

  it(
    "fails with nuxt.prerendered-html-denied for the autoSubfolderIndex:false shape (account.html)",
    async () => {
      // autoSubfolderIndex: false writes "about.html" / "offline.html" instead of "about/index.html" /
      // "offline/index.html", so the offline fallback's own build path has to match that shape too — otherwise the
      // build would fail on the unrelated compile.offline-fallback-not-built before ever reaching the denied check.
      const policy = {
        ...POLICY,
        offlineFallback: { enabled: true, path: "/offline.html" },
        resources: [
          ...POLICY.resources.filter((rule) => rule.pathPrefix !== "/offline/index.html"),
          { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" } as const,
        ],
      };
      await expect(
        withBuiltFixture(
          {
            nitro: { prerender: { routes: ["/", "/about", "/offline", "/account"], autoSubfolderIndex: false } },
            pwaPlatform: { identity: IDENTITY, policy, install: INSTALL },
          },
          async () => undefined,
          FIXTURE,
        ),
      ).rejects.toThrow(/^nuxt\.prerendered-html-denied:/);
    },
    BUILD_TIMEOUT,
  );
});

describe("setup-time checks", () => {
  it(
    "fails with nuxt.build-assets-outside-scope when buildAssetsDir traverses out of scope",
    async () => {
      // The fixture-config.json override spreads at the top level of defineNuxtConfig, replacing `app` wholesale —
      // so baseURL has to be repeated here, or the base-url-mismatch check (which runs first) would fire instead.
      await expect(
        withBuiltFixture({ app: { baseURL: "/app/", buildAssetsDir: "/../outside/" } }, async () => undefined, FIXTURE),
      ).rejects.toThrow(/^nuxt\.build-assets-outside-scope:/);
    },
    BUILD_TIMEOUT,
  );

  it(
    "fails with nuxt.cdn-url-unsupported when app.cdnURL is set",
    async () => {
      await expect(
        withBuiltFixture({ app: { baseURL: "/app/", cdnURL: "https://cdn.example.com/" } }, async () => undefined, FIXTURE),
      ).rejects.toThrow(/^nuxt\.cdn-url-unsupported:/);
    },
    BUILD_TIMEOUT,
  );

  it(
    "fails with nuxt.runtime-cache-unsupported when a v3 policy enables the runtime cache (T10)",
    async () => {
      const policy: PwaPolicyV3 = {
        ...POLICY,
        schemaVersion: 3,
        offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
        runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 65_536, maxAgeSeconds: 300 },
      };
      await expect(
        withBuiltFixture(
          { app: { baseURL: "/app/" }, pwaPlatform: { identity: IDENTITY, policy, install: INSTALL } },
          async () => undefined,
          FIXTURE,
        ),
      ).rejects.toThrow(/^nuxt\.runtime-cache-unsupported:/);
    },
    BUILD_TIMEOUT,
  );

  it(
    "builds exactly like v2 when a v3 policy's runtime cache is disabled",
    async () => {
      const policy: PwaPolicyV3 = {
        ...POLICY,
        schemaVersion: 3,
        offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
        runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
      };
      await withBuiltFixture(
        {
          app: { baseURL: "/app/" },
          nitro: { prerender: { routes: ["/", "/about", "/offline"] } },
          pwaPlatform: { identity: IDENTITY, policy, install: INSTALL },
        },
        async (publicDir) => {
          // Proves the build genuinely ran to completion (not just "didn't throw"): the platform worker this
          // module's artifact pipeline writes is on disk, exactly as a v1/v2 build would leave it.
          expect(() => readFileSync(join(publicDir, "sw.js"))).not.toThrow();
        },
        FIXTURE,
      );
    },
    BUILD_TIMEOUT,
  );
});

describe("missing offline page surfaces the compiler's own diagnostic", () => {
  it(
    "fails with compile.offline-fallback-not-built when the offline route is never prerendered",
    async () => {
      await expect(
        withBuiltFixture({ nitro: { prerender: { routes: ["/", "/about"] } } }, async () => undefined, FIXTURE),
      ).rejects.toThrow(/compile\.offline-fallback-not-built/);
    },
    BUILD_TIMEOUT,
  );
});

describe("nuxt generate: static output", () => {
  it(
    "writes the artifacts and passes verification for a static (nitro.static) build, once the private page is excluded",
    async () => {
      // nitro.static (what `nuxt generate` sets) also auto-adds every non-dynamic page route to the prerender set
      // (T1 record: this is exactly why generate crawls a private page into a static file) — so the app has to
      // exclude it with nitro.prerender.ignore, same as the module's own docs tell it to (design section 6).
      await withBuiltFixture(
        { nitro: { static: true, prerender: { routes: ["/", "/about", "/offline"], ignore: ["/account"] } } },
        async (publicDir) => {
          readFileSync(join(publicDir, "sw.js"));
          readFileSync(join(publicDir, "pwa-recovery-worker.js"));
          readFileSync(join(publicDir, "manifest.webmanifest"));
          readFileSync(join(publicDir, "about", "index.html"));
        },
        FIXTURE,
      );
    },
    BUILD_TIMEOUT,
  );
});
