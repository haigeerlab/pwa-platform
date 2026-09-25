import ts from "typescript";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";
import type { PwaHostBuildFile } from "../src/index.js";
import { input } from "./fixtures.js";

// Invalid inputs and hand-built registries are part of the contract, so tests call through an
// `unknown`-typed alias, exactly like the other core test files.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

function readGolden(name: string): unknown {
  const location = new URL(`./golden/${name}.input.json`, import.meta.url);
  const text = ts.sys.readFile(decodeURIComponent(location.pathname));
  if (text === undefined) throw new Error(`Cannot read ${name}`);
  return JSON.parse(text);
}

function findings(result: ReturnType<typeof compilePlan>): (readonly [string, string])[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

function warningFindings(result: ReturnType<typeof compilePlan>): (readonly [string, string, string])[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path, finding.severity] as const);
}

function ok(result: ReturnType<typeof compilePlan>) {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  return result.value;
}

// ---------------------------------------------------------------------------
// standalone-origin: proves the compiler's output is byte-identical to before
// this task, for every fixture and golden already in the suite (design §"标准
// unchanged"). Each expected string below was captured by running the
// pre-T3 compiler (commit dbc3cb6) over the same input; the equality here is
// the "before vs after" proof the plan calls for, on top of golden.test.ts
// continuing to pass unchanged.
// ---------------------------------------------------------------------------

const BASE_EXPECTED =
  "{\"ok\":true,\"value\":{\"schemaVersion\":1,\"planVersion\":1,\"policyVersion\":1,\"identity\":{\"appId\":\"shop\",\"manifestId\":\"/app/\",\"origin\":\"https://shop.example.com\",\"scope\":\"/app/\",\"serviceWorkerUrl\":\"/app/sw.js\",\"manifestUrl\":\"/app/manifest.webmanifest\",\"mountPath\":\"/app\",\"environment\":\"production\",\"cacheNamespaceSeed\":\"r1\"},\"install\":{\"startUrl\":\"/app/\",\"display\":\"standalone\",\"name\":\"Shop\",\"shortName\":\"Shop\",\"themeColor\":\"#0f172a\",\"backgroundColor\":\"#ffffff\",\"icons\":[{\"src\":\"/app/icons/192.png\",\"sizes\":\"192x192\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/512.png\",\"sizes\":\"512x512\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/maskable.png\",\"sizes\":\"192x192 512x512\",\"type\":\"image/png\",\"purpose\":\"maskable\"}]},\"hostBuildOutput\":{\"publicPath\":\"/app/\"},\"topology\":{\"kind\":\"standalone-origin\"},\"artifacts\":{\"serviceWorkerFile\":\"sw.js\",\"manifestFile\":\"manifest.webmanifest\"},\"precache\":[],\"cacheNamespace\":{\"prefix\":\"pwa:shop:production:r1:\"},\"requestBaselineDenials\":[\"non-get\",\"cross-origin\",\"no-store\",\"opaque-response\",\"redirect\",\"websocket\",\"unclassified\"],\"pathRules\":[],\"offlineFallback\":{\"enabled\":false},\"updateMode\":\"prompt\",\"diagnostics\":[]},\"diagnostics\":[]}";

const WITH_RULES_EXPECTED =
  "{\"ok\":true,\"value\":{\"schemaVersion\":1,\"planVersion\":1,\"policyVersion\":1,\"identity\":{\"appId\":\"shop\",\"manifestId\":\"/app/\",\"origin\":\"https://shop.example.com\",\"scope\":\"/app/\",\"serviceWorkerUrl\":\"/app/sw.js\",\"manifestUrl\":\"/app/manifest.webmanifest\",\"mountPath\":\"/app\",\"environment\":\"production\",\"cacheNamespaceSeed\":\"r1\"},\"install\":{\"startUrl\":\"/app/\",\"display\":\"standalone\",\"name\":\"Shop\",\"shortName\":\"Shop\",\"themeColor\":\"#0f172a\",\"backgroundColor\":\"#ffffff\",\"icons\":[{\"src\":\"/app/icons/192.png\",\"sizes\":\"192x192\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/512.png\",\"sizes\":\"512x512\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/maskable.png\",\"sizes\":\"192x192 512x512\",\"type\":\"image/png\",\"purpose\":\"maskable\"}]},\"hostBuildOutput\":{\"publicPath\":\"/app/\"},\"topology\":{\"kind\":\"standalone-origin\"},\"artifacts\":{\"serviceWorkerFile\":\"sw.js\",\"manifestFile\":\"manifest.webmanifest\"},\"precache\":[{\"url\":\"/app/assets/logo.png\",\"revision\":\"logohashvalue1\"},{\"url\":\"/app/assets/main.3f9a2c.js\",\"revision\":null},{\"url\":\"/app/offline.html\",\"revision\":\"off1line2hash3\"}],\"cacheNamespace\":{\"prefix\":\"pwa:shop:production:r1:\"},\"requestBaselineDenials\":[\"non-get\",\"cross-origin\",\"no-store\",\"opaque-response\",\"redirect\",\"websocket\",\"unclassified\"],\"pathRules\":[{\"pathPrefix\":\"/app/account\",\"resourceClass\":\"session-data\",\"action\":\"deny\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/api/catalog\",\"resourceClass\":\"public-data\",\"action\":\"stale-while-revalidate\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/assets\",\"resourceClass\":\"asset\",\"action\":\"cache-first\",\"source\":\"policy\"},{\"pathPrefix\":\"/app\",\"resourceClass\":\"navigation-public-static\",\"action\":\"network-first\",\"source\":\"policy\"}],\"offlineFallback\":{\"enabled\":true,\"path\":\"/app/offline.html\"},\"updateMode\":\"prompt\",\"diagnostics\":[]},\"diagnostics\":[]}";

const STOREFRONT_EXPECTED =
  "{\"ok\":true,\"value\":{\"schemaVersion\":1,\"planVersion\":1,\"policyVersion\":1,\"identity\":{\"appId\":\"storefront\",\"manifestId\":\"/app/\",\"origin\":\"https://shop.example.com\",\"scope\":\"/app/\",\"serviceWorkerUrl\":\"/app/sw.js\",\"manifestUrl\":\"/app/manifest.webmanifest\",\"mountPath\":\"/app\",\"environment\":\"production\",\"cacheNamespaceSeed\":\"r3\"},\"install\":{\"startUrl\":\"/app/\",\"display\":\"standalone\",\"name\":\"Storefront\",\"shortName\":\"Shop\",\"themeColor\":\"#0f172a\",\"backgroundColor\":\"#ffffff\",\"icons\":[{\"src\":\"/app/icons/192.png\",\"sizes\":\"192x192\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/512.png\",\"sizes\":\"512x512\",\"type\":\"image/png\",\"purpose\":\"any\"},{\"src\":\"/app/icons/maskable.png\",\"sizes\":\"192x192 512x512\",\"type\":\"image/png\",\"purpose\":\"maskable\"}]},\"hostBuildOutput\":{\"publicPath\":\"/app/\"},\"topology\":{\"kind\":\"standalone-origin\"},\"artifacts\":{\"serviceWorkerFile\":\"sw.js\",\"manifestFile\":\"manifest.webmanifest\"},\"precache\":[{\"url\":\"/app/assets/app.3f9a2c7d.js\",\"revision\":null},{\"url\":\"/app/assets/logo.svg\",\"revision\":\"a1b2c3d4e5f60718\"},{\"url\":\"/app/offline.html\",\"revision\":\"7d793037a0760186\"}],\"cacheNamespace\":{\"prefix\":\"pwa:storefront:production:r3:\"},\"requestBaselineDenials\":[\"non-get\",\"cross-origin\",\"no-store\",\"opaque-response\",\"redirect\",\"websocket\",\"unclassified\"],\"pathRules\":[{\"pathPrefix\":\"/app/api/account\",\"resourceClass\":\"session-data\",\"action\":\"deny\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/api/orders\",\"resourceClass\":\"mutation\",\"action\":\"deny\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/live\",\"resourceClass\":\"stream\",\"action\":\"deny\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/api/catalog\",\"resourceClass\":\"public-data\",\"action\":\"stale-while-revalidate\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/assets\",\"resourceClass\":\"asset\",\"action\":\"cache-first\",\"source\":\"policy\"},{\"pathPrefix\":\"/app/fonts\",\"resourceClass\":\"asset\",\"action\":\"cache-first\",\"source\":\"policy\"},{\"pathPrefix\":\"/app\",\"resourceClass\":\"navigation-public-static\",\"action\":\"network-first\",\"source\":\"policy\"}],\"offlineFallback\":{\"enabled\":true,\"path\":\"/app/offline.html\"},\"updateMode\":\"prompt\",\"diagnostics\":[{\"code\":\"compile.asset-rule-unmatched\",\"severity\":\"warning\",\"path\":\"/policy/resources/2/pathPrefix\",\"message\":\"Asset rule does not cover any host build output file.\"}]},\"diagnostics\":[{\"code\":\"compile.asset-rule-unmatched\",\"severity\":\"warning\",\"path\":\"/policy/resources/2/pathPrefix\",\"message\":\"Asset rule does not cover any host build output file.\"}]}";

const ROOT_MINIMAL_EXPECTED =
  "{\"ok\":true,\"value\":{\"schemaVersion\":1,\"planVersion\":1,\"policyVersion\":1,\"identity\":{\"appId\":\"docs\",\"manifestId\":\"/\",\"origin\":\"https://docs.example.com\",\"scope\":\"/\",\"serviceWorkerUrl\":\"/sw.js\",\"manifestUrl\":\"/manifest.webmanifest\",\"mountPath\":\"/\",\"environment\":\"staging\",\"cacheNamespaceSeed\":\"2026-09\"},\"install\":null,\"hostBuildOutput\":{\"publicPath\":\"/\"},\"topology\":{\"kind\":\"standalone-origin\"},\"artifacts\":{\"serviceWorkerFile\":\"sw.js\",\"manifestFile\":\"manifest.webmanifest\"},\"precache\":[{\"url\":\"/assets/site.css\",\"revision\":\"b026324c6904b2a9\"}],\"cacheNamespace\":{\"prefix\":\"pwa:docs:staging:2026-09:\"},\"requestBaselineDenials\":[\"non-get\",\"cross-origin\",\"no-store\",\"opaque-response\",\"redirect\",\"websocket\",\"unclassified\"],\"pathRules\":[{\"pathPrefix\":\"/admin\",\"resourceClass\":\"session-data\",\"action\":\"deny\",\"source\":\"policy\"},{\"pathPrefix\":\"/%61ssets\",\"resourceClass\":\"asset\",\"action\":\"stale-while-revalidate\",\"source\":\"policy\"}],\"offlineFallback\":{\"enabled\":false},\"updateMode\":\"prompt\",\"diagnostics\":[]},\"diagnostics\":[]}";

describe("standalone-origin: byte-identical output (before/after this task)", () => {
  it("compiles the base fixture to the same bytes as before this change", () => {
    expect(JSON.stringify(compile(input))).toBe(BASE_EXPECTED);
  });

  it("compiles a fixture with rules, precache and an offline fallback to the same bytes as before this change", () => {
    const withRules = {
      ...input,
      policy: {
        ...input.policy,
        offlineFallback: { enabled: true, path: "/offline.html" },
        resources: [
          { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
          { pathPrefix: "/account", resourceClass: "session-data", cache: "none" },
          { pathPrefix: "/api/catalog", resourceClass: "public-data", cache: "stale-while-revalidate" },
          { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
        ],
      },
      hostBuildOutput: {
        ...input.hostBuildOutput,
        files: [
          ...input.hostBuildOutput.files,
          { path: "offline.html", fingerprinted: false, contentHash: "off1line2hash3" },
          { path: "assets/logo.png", fingerprinted: false, contentHash: "logohashvalue1" },
        ],
      },
    };
    expect(JSON.stringify(compile(withRules))).toBe(WITH_RULES_EXPECTED);
  });

  it("compiles the storefront golden to the same bytes as before this change", () => {
    expect(JSON.stringify(compile(readGolden("storefront")))).toBe(STOREFRONT_EXPECTED);
  });

  it("compiles the root-minimal golden to the same bytes as before this change", () => {
    expect(JSON.stringify(compile(readGolden("root-minimal")))).toBe(ROOT_MINIMAL_EXPECTED);
  });

  it("still rejects a shared-origin topology object missing a registry", () => {
    expect(findings(compile({ ...input, topology: { kind: "shared-origin" } }))).toEqual([
      ["compile.unsupported-topology", "/topology"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// shared-origin fixtures
// ---------------------------------------------------------------------------

type RegistryEntry = {
  readonly appId: string;
  readonly scope: string;
  readonly serviceWorkerUrl: string;
  readonly manifestId: string;
  readonly manifestUrl: string;
};

const ORIGIN = "https://shop.example.com";
const ENVIRONMENT = "production";

const rootEntry: RegistryEntry = {
  appId: "root",
  scope: "/",
  serviceWorkerUrl: "/sw.js",
  manifestId: "/",
  manifestUrl: "/manifest.webmanifest",
};

const mobileEntry: RegistryEntry = {
  appId: "mobile",
  scope: "/m/",
  serviceWorkerUrl: "/m/sw.js",
  manifestId: "/m/",
  manifestUrl: "/m/manifest.webmanifest",
};

const betaEntry: RegistryEntry = {
  appId: "beta",
  scope: "/b/",
  serviceWorkerUrl: "/b/sw.js",
  manifestId: "/b/",
  manifestUrl: "/b/manifest.webmanifest",
};

function registry(children: readonly RegistryEntry[] = [mobileEntry], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    registryVersion: 1,
    origin: ORIGIN,
    environment: ENVIRONMENT,
    root: rootEntry,
    children,
    ...overrides,
  };
}

const rootIdentity = {
  ...input.identity,
  appId: rootEntry.appId,
  scope: rootEntry.scope,
  mountPath: "/",
  serviceWorkerUrl: rootEntry.serviceWorkerUrl,
  manifestUrl: rootEntry.manifestUrl,
  manifestId: rootEntry.manifestId,
  origin: ORIGIN,
  environment: ENVIRONMENT,
};

const childIdentity = {
  ...input.identity,
  appId: mobileEntry.appId,
  scope: mobileEntry.scope,
  mountPath: "/m",
  serviceWorkerUrl: mobileEntry.serviceWorkerUrl,
  manifestUrl: mobileEntry.manifestUrl,
  manifestId: mobileEntry.manifestId,
  origin: ORIGIN,
  environment: ENVIRONMENT,
};

type Rule = { readonly pathPrefix: string; readonly resourceClass: string; readonly cache: string };
const asset = (pathPrefix: string): Rule => ({ pathPrefix, resourceClass: "asset", cache: "cache-first" });
const deny = (pathPrefix: string): Rule => ({ pathPrefix, resourceClass: "session-data", cache: "none" });
const allow = (pathPrefix: string): Rule => ({ pathPrefix, resourceClass: "public-data", cache: "network-first" });

const file = (path: string, contentHash = "a1b2c3d4"): PwaHostBuildFile => ({ path, fingerprinted: false, contentHash });

function buildRoot(options: {
  readonly registry?: unknown;
  readonly resources?: readonly Rule[];
  readonly files?: readonly PwaHostBuildFile[];
  readonly offlineFallback?: { enabled: false } | { enabled: true; path: string };
  readonly install?: Record<string, unknown>;
}): ReturnType<typeof compilePlan> {
  return compile({
    identity: rootIdentity,
    install: options.install ?? null,
    policy: {
      schemaVersion: 1,
      install: { enabled: options.install !== undefined },
      offlineFallback: options.offlineFallback ?? { enabled: false },
      updateMode: "prompt",
      resources: options.resources ?? [],
    },
    topology: { kind: "shared-origin", registry: options.registry ?? registry() },
    hostBuildOutput: {
      publicPath: "/",
      serviceWorkerFile: "sw.js",
      manifestFile: "manifest.webmanifest",
      files: options.files ?? [],
    },
  });
}

/** A fully valid install object for the root identity (scope `/`), so only `startUrl` needs perturbing in a test. */
const rootInstall: Record<string, unknown> = {
  startUrl: "/",
  display: "standalone",
  name: "Shop",
  shortName: "Shop",
  themeColor: "#0f172a",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable.png", sizes: "192x192 512x512", type: "image/png", purpose: "maskable" },
  ],
};

function buildChild(options: {
  readonly identity?: Record<string, unknown>;
  readonly registryValue?: unknown;
  readonly resources?: readonly Rule[];
  readonly files?: readonly PwaHostBuildFile[];
  readonly topologyKind?: "standalone-origin" | "shared-origin";
}): ReturnType<typeof compilePlan> {
  const topologyKind = options.topologyKind ?? "shared-origin";
  return compile({
    identity: options.identity ?? childIdentity,
    install: null,
    policy: {
      schemaVersion: 1,
      install: { enabled: false },
      offlineFallback: { enabled: false },
      updateMode: "prompt",
      resources: options.resources ?? [],
    },
    topology:
      topologyKind === "standalone-origin"
        ? { kind: "standalone-origin" }
        : { kind: "shared-origin", registry: options.registryValue ?? registry() },
    hostBuildOutput: {
      publicPath: "/m/",
      serviceWorkerFile: "sw.js",
      manifestFile: "manifest.webmanifest",
      files: options.files ?? [],
    },
  });
}

describe("shared-origin: root app", () => {
  it("generates one exclude rule per child, ahead of every other rule including deny", () => {
    const value = ok(
      buildRoot({
        registry: registry([mobileEntry, betaEntry]),
        resources: [deny("/account"), allow("/")],
      }),
    );
    expect(value.pathRules).toEqual([
      { pathPrefix: "/b", resourceClass: "unclassified", action: "exclude", source: "platform" },
      { pathPrefix: "/m", resourceClass: "unclassified", action: "exclude", source: "platform" },
      { pathPrefix: "/account", resourceClass: "session-data", action: "deny", source: "policy" },
      { pathPrefix: "/", resourceClass: "public-data", action: "network-first", source: "policy" },
    ]);
    expect(value.topology).toEqual({ kind: "shared-origin", registry: registry([mobileEntry, betaEntry]) });
  });

  it("orders multiple exclude rules by code point, independent of registry declaration order", () => {
    const declaredReversed = ok(buildRoot({ registry: registry([betaEntry, mobileEntry]) }));
    const declaredForward = ok(buildRoot({ registry: registry([mobileEntry, betaEntry]) }));
    const excludePrefixes = (value: ReturnType<typeof ok>) =>
      value.pathRules.filter((rule) => rule.action === "exclude").map((rule) => rule.pathPrefix);
    expect(excludePrefixes(declaredReversed)).toEqual(["/b", "/m"]);
    expect(excludePrefixes(declaredForward)).toEqual(["/b", "/m"]);
  });

  it("rejects an allow rule that reaches into a child scope", () => {
    expect(findings(buildRoot({ resources: [allow("/m/api")] }))).toEqual([
      ["compile.policy-rule-in-child-scope", "/policy/resources/0/pathPrefix"],
    ]);
  });

  it("rejects a deny rule that reaches into a child scope", () => {
    expect(findings(buildRoot({ resources: [deny("/m/private")] }))).toEqual([
      ["compile.policy-rule-in-child-scope", "/policy/resources/0/pathPrefix"],
    ]);
  });

  it("allows a broader rule that merely contains a child scope", () => {
    expect(buildRoot({ resources: [asset("/")], files: [file("index.html")] }).ok).toBe(true);
  });

  it("never precaches a host file inside a child scope and warns about it instead, without failing the build", () => {
    const result = buildRoot({
      resources: [asset("/")],
      files: [file("index.html"), file("m/app.js")],
    });
    const value = ok(result);
    expect(value.precache.map((entry) => entry.url)).toEqual(["/index.html"]);
    expect(warningFindings(result)).toEqual([["compile.host-file-in-child-scope", "/hostBuildOutput/files/1/path", "warning"]]);
  });

  it("accepts an install start URL outside every child scope", () => {
    expect(buildRoot({ install: rootInstall }).ok).toBe(true);
  });

  it("rejects an install start URL that falls inside a child scope", () => {
    expect(findings(buildRoot({ install: { ...rootInstall, startUrl: "/m/" } }))).toEqual([
      ["compile.start-url-in-child-scope", "/install/startUrl"],
    ]);
  });

  it("rejects an install start URL inside a child scope spelled with percent-encoding", () => {
    expect(findings(buildRoot({ install: { ...rootInstall, startUrl: "/%6D/" } }))).toEqual([
      ["compile.start-url-in-child-scope", "/install/startUrl"],
    ]);
  });

  it("rejects a shortcut URL that falls inside a child scope (ADR-0037: same rule as the start URL)", () => {
    const shortcuts = [{ name: "Admin", url: "/m/orders" }] as const;
    expect(findings(buildRoot({ install: { ...rootInstall, shortcuts } }))).toEqual([
      ["compile.shortcut-url-in-child-scope", "/install/shortcuts/0/url"],
    ]);
  });

  it("rejects a percent-encoded shortcut URL inside a child scope", () => {
    const shortcuts = [{ name: "Admin", url: "/%6D/orders" }] as const;
    expect(findings(buildRoot({ install: { ...rootInstall, shortcuts } }))).toEqual([
      ["compile.shortcut-url-in-child-scope", "/install/shortcuts/0/url"],
    ]);
  });

  it("accepts a shortcut URL that only shares the child scope's first letter", () => {
    const shortcuts = [{ name: "Mx", url: "/mx/orders" }] as const;
    expect(buildRoot({ install: { ...rootInstall, shortcuts } }).ok).toBe(true);
  });

  it("does not flag a start URL that only shares the child scope's first letter", () => {
    expect(buildRoot({ install: { ...rootInstall, startUrl: "/mx/" } }).ok).toBe(true);
  });

  it("never runs the start-url check for a disabled install (nothing reaches the compiled plan)", () => {
    // `options.install` present but the plan's own `install.enabled` left off: mirrors a caller that supplied
    // install metadata while installation is disabled, which the compiled plan discards entirely (compile.ts).
    const result = compile({
      identity: rootIdentity,
      install: { ...rootInstall, startUrl: "/m/" },
      policy: {
        schemaVersion: 1,
        install: { enabled: false },
        offlineFallback: { enabled: false },
        updateMode: "prompt",
        resources: [],
      },
      topology: { kind: "shared-origin", registry: registry() },
      hostBuildOutput: { publicPath: "/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.install).toBeNull();
  });

  it("rejects an offline fallback page that falls inside a child scope", () => {
    expect(
      findings(
        buildRoot({
          files: [file("m/offline.html")],
          offlineFallback: { enabled: true, path: "/m/offline.html" },
        }),
      ),
    ).toEqual([["compile.offline-fallback-in-child-scope", "/policy/offlineFallback/path"]]);
  });

  it("keeps asset-rule-unmatched pointing at the right policy index once exclude rules are prepended", () => {
    const result = buildRoot({ resources: [asset("/assets"), asset("/fonts")], files: [file("assets/a.js")] });
    expect(warningFindings(result)).toEqual([["compile.asset-rule-unmatched", "/policy/resources/1/pathPrefix", "warning"]]);
    const value = ok(result);
    expect(value.pathRules[0]).toMatchObject({ action: "exclude" });
  });
});

describe("shared-origin: child app", () => {
  it("carries no exclude rules and otherwise compiles exactly like standalone-origin", () => {
    const resources = [deny("/account"), asset("/assets")];
    const files = [file("assets/a.js")];
    const shared = ok(buildChild({ resources, files, topologyKind: "shared-origin" }));
    const standalone = ok(buildChild({ resources, files, topologyKind: "standalone-origin" }));
    expect(shared.pathRules.some((rule) => rule.action === "exclude")).toBe(false);
    expect({ ...shared, topology: standalone.topology }).toEqual(standalone);
  });
});

describe("shared-origin: identity and registry matching", () => {
  it("rejects a registry whose origin differs from the identity", () => {
    expect(findings(buildRoot({ registry: registry([mobileEntry], { origin: "https://other.example.com" }) }))).toEqual([
      ["plan.registry-identity-mismatch", "/topology/registry"],
    ]);
  });

  it("rejects a registry whose environment differs from the identity", () => {
    expect(findings(buildRoot({ registry: registry([mobileEntry], { environment: "staging" }) }))).toEqual([
      ["plan.registry-identity-mismatch", "/topology/registry"],
    ]);
  });

  it.each(["appId", "serviceWorkerUrl", "manifestId", "manifestUrl"] as const)(
    "rejects an identity that differs from every registry entry in %s",
    (field) => {
      const badIdentity = { ...rootIdentity, [field]: `${rootIdentity[field]}-x` };
      // Keep the host build output aligned with whichever URL the perturbed identity now carries
      // (its scope is "/"), so the only diagnostic is the registry mismatch under test.
      expect(
        findings(
          compile({
            identity: badIdentity,
            install: null,
            policy: { schemaVersion: 1, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] },
            topology: { kind: "shared-origin", registry: registry() },
            hostBuildOutput: {
              publicPath: "/",
              serviceWorkerFile: badIdentity.serviceWorkerUrl.slice(1),
              manifestFile: badIdentity.manifestUrl.slice(1),
              files: [],
            },
          }),
        ),
      ).toEqual([["plan.registry-identity-mismatch", "/topology/registry"]]);
    },
  );

  it("rejects an identity whose scope differs from every registry entry", () => {
    // A root app's scope is pinned to "/" by its own mount path, so this is exercised on the
    // child instead: its scope can legitimately be "/" or "/m/" without failing identity
    // invariants, so setting it to "/" creates a genuine scope-only mismatch against the registry.
    const badIdentity = { ...childIdentity, scope: "/" };
    expect(
      findings(
        compile({
          identity: badIdentity,
          install: null,
          policy: { schemaVersion: 1, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] },
          topology: { kind: "shared-origin", registry: registry() },
          hostBuildOutput: { publicPath: "/m/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
        }),
      ),
    ).toEqual([["plan.registry-identity-mismatch", "/topology/registry"]]);
  });

  it("rejects a registry with no matching entry at all", () => {
    const unrelatedRoot = {
      appId: "unrelated",
      scope: "/",
      serviceWorkerUrl: "/other-sw.js",
      manifestId: "/other/",
      manifestUrl: "/other-manifest.webmanifest",
    };
    expect(findings(buildRoot({ registry: registry([mobileEntry], { root: unrelatedRoot }) }))).toEqual([
      ["plan.registry-identity-mismatch", "/topology/registry"],
    ]);
  });

  it("re-roots a structurally invalid registry's diagnostics under topology/registry", () => {
    // A registry whose child scope is not strictly within its own root scope is structurally
    // invalid on its own terms, independent of whether it would even match this app's identity;
    // resolveTopology reports its diagnostics rerooted under topology/registry.
    const badRegistry = {
      schemaVersion: 1,
      registryVersion: 1,
      origin: ORIGIN,
      environment: ENVIRONMENT,
      root: { appId: "root", scope: "/root/", serviceWorkerUrl: "/root/sw.js", manifestId: "/root/", manifestUrl: "/root/manifest.webmanifest" },
      children: [
        { appId: "mobile", scope: "/outside/", serviceWorkerUrl: "/outside/sw.js", manifestId: "/outside/", manifestUrl: "/outside/manifest.webmanifest" },
      ],
    };
    expect(findings(buildRoot({ registry: badRegistry }))).toEqual([
      ["registry.child-outside-root", "/topology/registry/children/0/scope"],
    ]);
  });

  it("never echoes a distinctive identity value into a registry mismatch or child-scope diagnostic", () => {
    const marker = "zzy-secret-app-marker";
    const mismatch = compile({
      ...(buildRootInput()),
      topology: { kind: "shared-origin", registry: registry([mobileEntry], { origin: `https://${marker}.example.com` }) },
    });
    expect(JSON.stringify(mismatch)).not.toContain(marker);

    const childScope = buildRoot({ resources: [{ pathPrefix: `/m/${marker}`, resourceClass: "public-data", cache: "network-first" }] });
    expect(JSON.stringify(childScope)).not.toContain(marker);
  });
});

function buildRootInput() {
  return {
    identity: rootIdentity,
    install: null,
    policy: {
      schemaVersion: 1,
      install: { enabled: false },
      offlineFallback: { enabled: false },
      updateMode: "prompt",
      resources: [],
    },
    hostBuildOutput: {
      publicPath: "/",
      serviceWorkerFile: "sw.js",
      manifestFile: "manifest.webmanifest",
      files: [],
    },
  };
}
