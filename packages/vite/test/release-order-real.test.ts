// T7 scenario 6: the release-order check (ADR-0019, build-verifier's verifyReleaseOrder) exercised against plans a
// real Vite build actually produced, not hand-assembled ones. Follows shared-origin.test.ts's pattern of building
// small real apps with the real `pwa()` plugin and reading the compiled plan back through the plugin's API.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyRelease } from "@pwa-platform/build-verifier";
import type { PwaIdentity, PwaOriginRegistry, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { build, createLogger, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { PWA_PLUGIN_NAME, pwa, type PwaPluginApi } from "../src/index.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const origin = "https://release-order-fixture.example.com";

const rootIdentity: PwaIdentity = {
  appId: "release-order-root",
  manifestId: "/",
  origin,
  scope: "/",
  serviceWorkerUrl: "/sw.js",
  manifestUrl: "/manifest.webmanifest",
  mountPath: "/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const childIdentity: PwaIdentity = {
  appId: "release-order-child",
  manifestId: "/m/",
  origin,
  scope: "/m/",
  serviceWorkerUrl: "/m/sw.js",
  manifestUrl: "/m/manifest.webmanifest",
  mountPath: "/m",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

/** A different child, at a scope the fixture's actual child (above) never registers under. */
const otherChildIdentity: PwaIdentity = {
  ...childIdentity,
  appId: "release-order-other-child",
  manifestId: "/other/",
  scope: "/other/",
  serviceWorkerUrl: "/other/sw.js",
  manifestUrl: "/other/manifest.webmanifest",
  mountPath: "/other",
};

function entry(identity: PwaIdentity): PwaOriginRegistry["root"] {
  const { appId, scope, serviceWorkerUrl, manifestId, manifestUrl } = identity;
  return { appId, scope, serviceWorkerUrl, manifestId, manifestUrl };
}

/** Lists the fixture's real child at `/m/`: the registry the child app itself, and a correct root, build against. */
const registryWithChild: PwaOriginRegistry = {
  schemaVersion: 1,
  registryVersion: 1,
  origin,
  environment: "production",
  root: entry(rootIdentity),
  children: [entry(childIdentity)],
};

/** Same root, but its only child is `/other/` — a root built against this never excludes `/m`. */
const registryWithoutChild: PwaOriginRegistry = {
  ...registryWithChild,
  children: [entry(otherChildIdentity)],
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/", resourceClass: "asset", cache: "cache-first" }],
};

function app(manifestId: string): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-release-order-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "public/manifest.webmanifest"), `{"id":"${manifestId}","name":"Release order fixture"}\n`);
  return root;
}

function apiLookupPlugin(sink: { api: PwaPluginApi | undefined }): Plugin {
  return {
    name: "api-lookup",
    apply: "build",
    configResolved(config) {
      sink.api = config.plugins.find((candidate) => candidate.name === PWA_PLUGIN_NAME)?.api as PwaPluginApi | undefined;
    },
  };
}

async function buildPlan(identity: PwaIdentity, base: string, registry: PwaOriginRegistry): Promise<PwaPlan> {
  const root = app(identity.manifestId);
  const sink: { api: PwaPluginApi | undefined } = { api: undefined };
  const logger = createLogger("error", { allowClearScreen: false });
  await build({
    configFile: false,
    root,
    base,
    customLogger: logger,
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [apiLookupPlugin(sink), pwa({ identity, policy, install: null, topology: { kind: "shared-origin", registry } })],
  });
  const plan = sink.api?.getPlan();
  if (plan === null || plan === undefined) throw new Error("expected a compiled plan");
  return plan;
}

describe("verifyRelease's release-order check, against plans a real build produced", () => {
  it("accepts a real Vite plan as explicit release-retention input without making the build perform that check", async () => {
    const childPlan = await buildPlan(childIdentity, "/m/", registryWithChild);
    const available = childPlan.precache.filter(({ revision }) => revision === null).map(({ url }) => url);

    const report = verifyRelease({ plan: childPlan, retention: { asOfMs: 1, previous: [], available } });

    expect(report).toEqual({
      ok: true,
      checks: [{ name: "release-retention", ok: true, diagnostics: [] }],
      diagnostics: [],
    });
  });

  it("passes the child against the root that actually excludes it", async () => {
    const childPlan = await buildPlan(childIdentity, "/m/", registryWithChild);
    const rootPlan = await buildPlan(rootIdentity, "/", registryWithChild);

    const report = verifyRelease({ plan: childPlan, deployedRootPlan: rootPlan });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toContain("release-order");
  });

  it("fails with verify.root-plan-missing-exclude when the deployed root's registry never listed this child", async () => {
    const childPlan = await buildPlan(childIdentity, "/m/", registryWithChild);
    // A real root plan, correctly compiled — just against a registry whose only child is `/other/`, not `/m/`.
    const rootPlanWithoutThisChild = await buildPlan(rootIdentity, "/", registryWithoutChild);

    const report = verifyRelease({ plan: childPlan, deployedRootPlan: rootPlanWithoutThisChild });

    expect(report.ok).toBe(false);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("verify.root-plan-missing-exclude");
  });
});
