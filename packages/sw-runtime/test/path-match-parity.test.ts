import type { PwaIdentity, PwaPathRule, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan, type PwaCompileInput, type PwaHostBuildFile } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { createPathMatcher } from "../src/shared/path-match.js";

// policy-compiler picks a build file for the precache when the file's first matching rule is an asset rule whose
// strategy caches. Running the same check with the runtime matcher must select the same files.
const CACHING_ASSET = (rule: PwaPathRule | undefined): boolean =>
  rule !== undefined && rule.resourceClass === "asset" && rule.action !== "deny" && rule.action !== "none";

function identity(mountPath: "/" | "/app"): PwaIdentity {
  const prefix = mountPath === "/" ? "" : mountPath;
  return {
    appId: "parity",
    manifestId: `${prefix}/`,
    origin: "https://parity.example.com",
    scope: `${prefix}/`,
    serviceWorkerUrl: `${prefix}/sw.js`,
    manifestUrl: `${prefix}/manifest.webmanifest`,
    mountPath,
    environment: "production",
    cacheNamespaceSeed: "r1",
  };
}

function policy(resources: PwaPolicy["resources"]): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: false },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources,
  };
}

function file(path: string): PwaHostBuildFile {
  return { path, fingerprinted: false, contentHash: "0123456789abcdef" };
}

function compile(input: PwaCompileInput): PwaPlan {
  const result = compilePlan(input);
  if (!result.ok) throw new Error(`Fixture plan did not compile: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  return result.value;
}

/** Every build file with the URL it is served at, minus the files policy-compiler never precaches. */
function precacheCandidates(input: PwaCompileInput): readonly { readonly path: string; readonly url: string }[] {
  const { publicPath, serviceWorkerFile, manifestFile, files } = input.hostBuildOutput;
  return files
    .filter(({ path }) => path !== serviceWorkerFile && path !== manifestFile && !/\.map$/i.test(path))
    .map(({ path }) => ({ path, url: `${publicPath}${path}` }));
}

const mounted: PwaCompileInput = {
  identity: identity("/app"),
  install: null,
  topology: { kind: "standalone-origin" },
  policy: policy([
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/%61ssets", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/api", resourceClass: "public-data", cache: "stale-while-revalidate" },
    { pathPrefix: "/apis", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/a%2Fb", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/%zz", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/%FF", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/admin", resourceClass: "session-data", cache: "none" },
  ]),
  hostBuildOutput: {
    publicPath: "/app/",
    serviceWorkerFile: "sw.js",
    manifestFile: "manifest.webmanifest",
    files: [
      file("index.html"),
      file("assets/site.css"),
      file("%61ssets/other.css"),
      file("api/catalog.json"),
      file("apis/lib.js"),
      file("a%2Fb/one.js"),
      file("a/b/two.js"),
      file("%zz/three.js"),
      file("%FF/four.js"),
      file("admin/panel.js"),
      file("assets/site.css.map"),
      file("sw.js"),
      file("manifest.webmanifest"),
    ],
  },
};

const rooted: PwaCompileInput = {
  identity: identity("/"),
  install: null,
  topology: { kind: "standalone-origin" },
  policy: policy([
    { pathPrefix: "/caf%C3%A9", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/data", resourceClass: "public-data", cache: "none" },
    { pathPrefix: "/", resourceClass: "asset", cache: "cache-first" },
  ]),
  hostBuildOutput: {
    publicPath: "/",
    serviceWorkerFile: "sw.js",
    manifestFile: "manifest.webmanifest",
    files: [file("caf%C3%A9/icon.svg"), file("data/points.json"), file("index.html")],
  },
};

/**
 * A shared-origin root at `/` whose child owns `/m/` (ADR-0019): the compiler prepends an exclude rule for `/m`, and
 * keeps the child's files out of the root's precache even though the root's `/` asset rule covers them. The runtime
 * matcher has to reach the same verdict — its first match for those URLs is the exclude rule, never the asset rule.
 */
const sharedRoot: PwaCompileInput = {
  ...rooted,
  topology: {
    kind: "shared-origin",
    registry: {
      schemaVersion: 1,
      registryVersion: 1,
      origin: "https://parity.example.com",
      environment: "production",
      root: { appId: "parity", scope: "/", serviceWorkerUrl: "/sw.js", manifestId: "/", manifestUrl: "/manifest.webmanifest" },
      children: [
        { appId: "parity-m", scope: "/m/", serviceWorkerUrl: "/m/sw.js", manifestId: "/m/", manifestUrl: "/m/manifest.webmanifest" },
      ],
    },
  },
  hostBuildOutput: {
    ...rooted.hostBuildOutput,
    files: [...rooted.hostBuildOutput.files, file("m/index.html"), file("m/assets/app.js"), file("mx/index.html")],
  },
};

describe("runtime path matching matches policy-compiler", () => {
  for (const [name, input] of [
    ["a mounted app with encoded, invalid and non-UTF-8 prefixes", mounted],
    ["a root app where a decoded prefix covers both spellings", rooted],
    ["a shared-origin root whose child scope is excluded", sharedRoot],
  ] as const) {
    it(`selects the same precache entries for ${name}`, () => {
      const plan = compile(input);
      const matcher = createPathMatcher(plan.pathRules);
      const precached = new Set<string>(plan.precache.map(({ url }) => url));

      const candidates = precacheCandidates(input);
      expect(candidates.length).toBeGreaterThan(0);
      for (const { path, url } of candidates) {
        expect(CACHING_ASSET(matcher.match(url)), `${path} -> ${url}`).toBe(precached.has(url));
      }
      // The comparison is only meaningful when both outcomes occur.
      expect(precached.size).toBeGreaterThan(0);
      expect(candidates.length).toBeGreaterThan(precached.size);
    });
  }

  it("really exercises the exclude rule in the shared-origin case", () => {
    // Guards the case above from passing vacuously: the child's files must be candidates the root's `/` asset rule
    // would otherwise precache, and the runtime matcher's first match for them must be the exclude rule.
    const plan = compile(sharedRoot);
    const matcher = createPathMatcher(plan.pathRules);
    expect(plan.pathRules[0]).toMatchObject({ pathPrefix: "/m", action: "exclude" });
    for (const url of ["/m/index.html", "/m/assets/app.js"]) {
      expect(matcher.match(url)?.action, url).toBe("exclude");
      expect(plan.precache.some((entry) => entry.url === url), url).toBe(false);
    }
    // A sibling that only shares the first letter stays the root's own and is precached.
    expect(plan.precache.some((entry) => entry.url === "/mx/index.html")).toBe(true);
  });

  it("matches both spellings of a decoded prefix to the same rule", () => {
    const matcher = createPathMatcher(compile(rooted).pathRules);
    const rule = matcher.match("/caf%C3%A9/icon.svg");
    expect(CACHING_ASSET(rule)).toBe(true);
    expect(matcher.match("/café/icon.svg")).toBe(rule);
  });

  it("keeps sibling segments and encoded slashes apart, as the compiled precache shows", () => {
    const plan = compile(mounted);
    const precached = new Set<string>(plan.precache.map(({ url }) => url));
    expect(precached.has("/app/apis/lib.js")).toBe(true);
    expect(precached.has("/app/api/catalog.json")).toBe(false);
    expect(precached.has("/app/a%2Fb/one.js")).toBe(true);
    expect(precached.has("/app/a/b/two.js")).toBe(false);
    expect(precached.has("/app/%61ssets/other.css")).toBe(true);
    expect(precached.has("/app/assets/site.css")).toBe(true);
    expect(precached.has("/app/admin/panel.js")).toBe(false);
  });
});
