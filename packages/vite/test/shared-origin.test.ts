// The plugin with a shared-origin topology (ADR-0019), inside real Vite builds: one registry, a root app at `/` and
// a child app at `/m/`, built separately the way two teams would. What only a real build can show: the registry
// reaching the compiler through the plugin's options, the root's plan carrying the exclude rule, a child-scope file
// that ended up in the root's output staying out of its precache, and that warning reaching the build log.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaOriginRegistry, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { build, createLogger, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { PWA_PLUGIN_NAME, pwa, type PwaPluginApi } from "../src/index.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const origin = "https://portal.example.com";

const rootIdentity: PwaIdentity = {
  appId: "portal",
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
  appId: "portal-m",
  manifestId: "/m/",
  origin,
  scope: "/m/",
  serviceWorkerUrl: "/m/sw.js",
  manifestUrl: "/m/manifest.webmanifest",
  mountPath: "/m",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

function entry(identity: PwaIdentity): PwaOriginRegistry["root"] {
  const { appId, scope, serviceWorkerUrl, manifestId, manifestUrl } = identity;
  return { appId, scope, serviceWorkerUrl, manifestId, manifestUrl };
}

const registry: PwaOriginRegistry = {
  schemaVersion: 1,
  registryVersion: 1,
  origin,
  environment: "production",
  root: entry(rootIdentity),
  children: [entry(childIdentity)],
};

/** Install stays off, so each app ships its own manifest from its public directory. */
const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: false },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/", resourceClass: "asset", cache: "cache-first" }],
};

function app(publicFiles: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-shared-origin-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  for (const [path, content] of Object.entries(publicFiles)) {
    const full = join(root, "public", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
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

type Built = { readonly plan: PwaPlan; readonly warnings: readonly string[] };

async function runBuild(root: string, identity: PwaIdentity, base: string, topology: unknown = { kind: "shared-origin", registry }): Promise<Built> {
  const sink: { api: PwaPluginApi | undefined } = { api: undefined };
  const warnings: string[] = [];
  const logger = createLogger("warn", { allowClearScreen: false });
  logger.warn = (message) => {
    warnings.push(message);
  };
  logger.warnOnce = logger.warn;
  await build({
    configFile: false,
    root,
    base,
    customLogger: logger,
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [apiLookupPlugin(sink), pwa({ identity, policy, install: null, topology: topology as never })],
  });
  const plan = sink.api?.getPlan();
  if (plan === null || plan === undefined) throw new Error("expected a compiled plan");
  return { plan, warnings };
}

describe("the plugin with a shared-origin topology, in real builds", () => {
  it("compiles the root with the child's scope excluded ahead of every other rule", async () => {
    const root = app({ "manifest.webmanifest": '{"id":"/","name":"Portal"}\n', "about.html": "<p>about</p>\n" });
    const { plan } = await runBuild(root, rootIdentity, "/");

    expect(plan.topology).toEqual({ kind: "shared-origin", registry });
    expect(plan.pathRules[0]).toEqual({ pathPrefix: "/m", resourceClass: "unclassified", action: "exclude", source: "platform" });
    expect(plan.pathRules.filter((rule) => rule.action === "exclude")).toHaveLength(1);
    expect(plan.precache.some((precached) => precached.url === "/about.html")).toBe(true);
  });

  it("keeps a child-scope file that landed in the root's output out of its precache, and says so in the build log", async () => {
    const root = app({
      "manifest.webmanifest": '{"id":"/","name":"Portal"}\n',
      "m/index.html": "<p>the child's page, copied into the root by mistake</p>\n",
    });
    const { plan, warnings } = await runBuild(root, rootIdentity, "/");

    expect(plan.precache.some((precached) => precached.url.startsWith("/m/"))).toBe(false);
    expect(warnings.some((message) => message.includes("compile.host-file-in-child-scope"))).toBe(true);
    // Codes and contract paths only: the file's name is not echoed.
    expect(warnings.join("\n")).not.toContain("m/index.html");
  });

  it("compiles the child with no exclude rule of its own", async () => {
    const root = app({ "manifest.webmanifest": '{"id":"/m/","name":"Portal mobile"}\n' });
    const { plan, warnings } = await runBuild(root, childIdentity, "/m/");

    expect(plan.topology).toEqual({ kind: "shared-origin", registry });
    expect(plan.pathRules.some((rule) => rule.action === "exclude")).toBe(false);
    expect(plan.precache.every((precached) => precached.url.startsWith("/m/"))).toBe(true);
    expect(warnings.some((message) => message.includes("compile.host-file-in-child-scope"))).toBe(false);
  });

  it("fails the build when the app's identity is not in the registry", async () => {
    const stranger: PwaIdentity = { ...childIdentity, appId: "portal-x" };
    const root = app({ "manifest.webmanifest": '{"id":"/m/","name":"Stranger"}\n' });
    await expect(runBuild(root, stranger, "/m/")).rejects.toThrow(/plan\.registry-identity-mismatch/);
  });
});

describe("validating the registry when the plugin is created", () => {
  it("rejects an invalid registry at once, naming the code and path but no value", () => {
    const overlapping: PwaOriginRegistry = {
      ...registry,
      children: [entry(childIdentity), { ...entry(childIdentity), appId: "portal-m2", serviceWorkerUrl: "/m/x/sw.js", manifestId: "/m/x/", manifestUrl: "/m/x/manifest.webmanifest", scope: "/m/x/" }],
    };
    let message = "";
    try {
      pwa({ identity: rootIdentity, policy, install: null, topology: { kind: "shared-origin", registry: overlapping } });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/registry\.scope-overlap at \/topology\/registry\/children\/1\/scope/);
    expect(message).not.toContain("portal-m2");
    expect(message).not.toContain("/m/x/");
  });

  it("rejects a shared-origin topology without a registry", () => {
    expect(() => pwa({ identity: rootIdentity, policy, install: null, topology: { kind: "shared-origin" } as never })).toThrow(
      /topology\/registry/,
    );
  });
});
