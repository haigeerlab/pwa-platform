// The release-order check (ADR-0019): before a shared-origin child ships, the root plan that is actually deployed
// must already exclude the child's scope, belong to the same origin and environment, and carry a registry at
// least as new as the child's. The plans are built by hand from the storefront fixture and validated up front, so a
// mistake in the fixtures cannot pass itself off as a passing check.
import { readFileSync } from "node:fs";
import {
  cacheNamespacePrefix,
  validatePlan,
  type PwaIdentity,
  type PwaOriginRegistry,
  type PwaPlan,
  type PwaRegistryEntry,
} from "@pwa-platform/contracts";
import { compilePlan } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { verifyRelease } from "../src/release.js";
import { isSharedOriginChild, verifyReleaseOrder } from "../src/release-order.js";

const storefront = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as PwaPlan;

const rootIdentity: PwaIdentity = storefront.identity;
const childIdentity: PwaIdentity = {
  ...rootIdentity,
  appId: "storefront-m",
  scope: "/app/m/",
  mountPath: "/app/m",
  serviceWorkerUrl: "/app/m/sw.js",
  manifestId: "/app/m/",
  manifestUrl: "/app/m/manifest.webmanifest",
};

function registry(registryVersion: number): PwaOriginRegistry {
  return {
    schemaVersion: 1,
    registryVersion,
    origin: rootIdentity.origin,
    environment: rootIdentity.environment,
    root: pick(rootIdentity),
    children: [pick(childIdentity)],
  };
}

function pick(identity: PwaIdentity): PwaOriginRegistry["root"] {
  const { appId, scope, serviceWorkerUrl, manifestId, manifestUrl } = identity;
  return { appId, scope, serviceWorkerUrl, manifestId, manifestUrl };
}

function valid(plan: PwaPlan): PwaPlan {
  const result = validatePlan(plan);
  if (!result.ok) throw new Error(`fixture plan is invalid: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  return result.value;
}

function rootPlan(registryVersion: number, withExclude = true): PwaPlan {
  return {
    ...storefront,
    topology: { kind: "shared-origin", registry: registry(registryVersion) },
    pathRules: [
      ...(withExclude ? [{ pathPrefix: "/app/m", resourceClass: "unclassified", action: "exclude", source: "platform" } as const] : []),
      ...storefront.pathRules,
    ],
  };
}

function childPlan(registryVersion: number): PwaPlan {
  return valid({
    ...storefront,
    identity: childIdentity,
    install: null,
    hostBuildOutput: { publicPath: "/app/m/" },
    precache: [],
    pathRules: [],
    offlineFallback: { enabled: false },
    cacheNamespace: { prefix: cacheNamespacePrefix(childIdentity) },
    topology: { kind: "shared-origin", registry: registry(registryVersion) },
  });
}

/** A valid root plan identical to `rootPlan(2)` except that identity, registry and cache namespace move with `change`. */
function movedRoot(change: Partial<Pick<PwaIdentity, "environment" | "origin">>): PwaPlan {
  const identity: PwaIdentity = { ...rootIdentity, ...change };
  const base = rootPlan(2);
  if (base.topology.kind !== "shared-origin") throw new Error("unreachable");
  return valid({
    ...base,
    identity,
    cacheNamespace: { prefix: cacheNamespacePrefix(identity) },
    topology: { kind: "shared-origin", registry: { ...base.topology.registry, ...change } },
  });
}

const otherEnvironmentRoot = (): PwaPlan => movedRoot({ environment: "staging" });
const otherOriginRoot = (): PwaPlan => movedRoot({ origin: "https://other.example.com" });

const codes = (check: { diagnostics: readonly { code: string }[] }): string[] => check.diagnostics.map(({ code }) => code);

describe("verifyReleaseOrder", () => {
  it("passes when the deployed root excludes the child and its registry is as new or newer", () => {
    for (const rootVersion of [2, 3]) {
      const result = verifyReleaseOrder(childPlan(2), valid(rootPlan(rootVersion)));
      expect(result.ok, `root v${rootVersion}`).toBe(true);
      expect(result.name).toBe("release-order");
    }
  });

  it("reports a deployed root without the child's exclude rule", () => {
    // Still a valid plan? No — contracts pins a root's exclude set to its children. A root deployed before the child
    // was registered carries an older registry without the child and therefore no exclude for it.
    const older: PwaPlan = valid({
      ...storefront,
      topology: { kind: "shared-origin", registry: { ...registry(1), children: [{ ...pick(childIdentity), appId: "storefront-other", scope: "/app/other/", serviceWorkerUrl: "/app/other/sw.js", manifestId: "/app/other/", manifestUrl: "/app/other/manifest.webmanifest" }] } },
      pathRules: [{ pathPrefix: "/app/other", resourceClass: "unclassified", action: "exclude", source: "platform" }, ...storefront.pathRules],
    });
    // The older root's registry also lists a different child at a different scope, not this fixture's child at all.
    expect(codes(verifyReleaseOrder(childPlan(2), older))).toEqual([
      "verify.root-plan-missing-exclude",
      "verify.root-registry-child-mismatch",
      "verify.root-registry-older",
    ]);
  });

  it("reports a deployed root whose registry is older, even when it already excludes the child", () => {
    expect(codes(verifyReleaseOrder(childPlan(3), valid(rootPlan(2))))).toEqual(["verify.root-registry-older"]);
  });

  it("reports a deployed plan that is not this origin's shared-origin root", () => {
    const standalone = storefront;
    const cases: readonly (readonly [string, unknown, string])[] = [
      // Not a valid plan at all: reported at the record itself.
      ["unreadable record", undefined, "/deployedRootPlan"],
      ["not a plan", { hello: "world" }, "/deployedRootPlan"],
      // Valid plans that are not this origin's shared-origin root: reported at the topology.
      ["standalone root", standalone, "/deployedRootPlan/topology"],
      ["a child's plan instead of the root's", childPlan(2), "/deployedRootPlan/topology"],
      ["the same root deployed to another environment", otherEnvironmentRoot(), "/deployedRootPlan/topology"],
      ["the same root on another origin", otherOriginRoot(), "/deployedRootPlan/topology"],
    ];
    for (const [name, deployed, path] of cases) {
      const result = verifyReleaseOrder(childPlan(2), deployed);
      expect(codes(result), name).toEqual(["verify.root-plan-not-shared-origin"]);
      expect(result.diagnostics[0]?.path, name).toBe(path);
    }
  });

  it("never echoes a value from either plan into its diagnostics", () => {
    const result = verifyReleaseOrder(childPlan(3), valid(rootPlan(2, true)));
    for (const { message } of result.diagnostics) {
      expect(message).not.toMatch(/\/app\/m|storefront|shop\.example\.com|pwa:/);
    }
  });

  it("refuses a plan that is not a shared-origin child", () => {
    expect(isSharedOriginChild(storefront)).toBe(false);
    expect(isSharedOriginChild(valid(rootPlan(2)))).toBe(false);
    expect(isSharedOriginChild(childPlan(2))).toBe(true);
    expect(() => verifyReleaseOrder(storefront, valid(rootPlan(2)))).toThrow(TypeError);
  });
});

describe("verifyRelease with a deployed root plan", () => {
  it("runs release-order last, and only for a shared-origin child", () => {
    const child = childPlan(2);
    const withAll = verifyRelease({ plan: child, baseline: { ...child.identity }, deployedRootPlan: valid(rootPlan(2)) });
    expect(withAll.checks.map(({ name }) => name)).toEqual(["identity-baseline", "release-order"]);
    expect(withAll.ok).toBe(true);

    // A standalone or root plan ignores the input: there is no release order to check.
    expect(verifyRelease({ plan: storefront, deployedRootPlan: valid(rootPlan(2)) }).checks).toEqual([]);
    expect(verifyRelease({ plan: valid(rootPlan(2)), deployedRootPlan: valid(rootPlan(2)) }).checks).toEqual([]);
  });

  it("does not run when the property is omitted, and fails the release when the root is behind", () => {
    expect(verifyRelease({ plan: childPlan(2) }).checks).toEqual([]);
    const behind = verifyRelease({ plan: childPlan(3), deployedRootPlan: valid(rootPlan(2)) });
    expect(behind.ok).toBe(false);
    expect(behind.diagnostics.map(({ code }) => code)).toEqual(["verify.root-registry-older"]);
  });
});

// ---------------------------------------------------------------------------
// Registry identity checks (review #3): the exclude-rule and version checks above only prove the root stopped
// serving a *path*. They say nothing about which app the root's registry actually thinks lives there. Every plan
// below is a REAL plan compiled by `@pwa-platform/core`'s `compilePlan`, not hand-built, so a mistake in a fixture
// cannot pass itself off as a passing check the way it could with a JSON literal.
// ---------------------------------------------------------------------------

const MALL_ORIGIN = "https://mall.example.com";
const MALL_ENVIRONMENT = "production";

function mallEntry(appId: string, scope: `/${string}`): PwaRegistryEntry {
  return { appId, scope, serviceWorkerUrl: `${scope}sw.js`, manifestId: scope, manifestUrl: `${scope}manifest.webmanifest` };
}

function mallRegistry(registryVersion: number, children: readonly PwaRegistryEntry[]): PwaOriginRegistry {
  return {
    schemaVersion: 1,
    registryVersion,
    origin: MALL_ORIGIN,
    environment: MALL_ENVIRONMENT,
    root: mallEntry("mall", "/"),
    children,
  };
}

/** Compiles a real plan for `identity` against `registry`, throwing with the diagnostics if it does not compile. */
function compileMall(identity: PwaRegistryEntry & { readonly mountPath: `/${string}` }, registry: PwaOriginRegistry): PwaPlan {
  const result = compilePlan({
    identity: {
      appId: identity.appId,
      manifestId: identity.manifestId,
      origin: MALL_ORIGIN,
      scope: identity.scope,
      serviceWorkerUrl: identity.serviceWorkerUrl,
      manifestUrl: identity.manifestUrl,
      mountPath: identity.mountPath,
      environment: MALL_ENVIRONMENT,
      cacheNamespaceSeed: "r1",
    },
    install: null,
    policy: { schemaVersion: 1, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] },
    topology: { kind: "shared-origin", registry },
    hostBuildOutput: { publicPath: identity.scope, serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
  });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map(({ code, path }) => `${code} at ${path}`).join(", ")}`);
  return result.value;
}

const MALL_ROOT = mallEntry("mall", "/");
const REAL_CHILD = mallEntry("mall-m", "/m/");

describe("verifyReleaseOrder: registry identity (review #3, L2-L4)", () => {
  it("L2: same registry version, but the root's entry for the child differs in serviceWorkerUrl and manifestId", () => {
    const child = compileMall({ ...REAL_CHILD, mountPath: "/m" }, mallRegistry(2, [REAL_CHILD]));
    const driftedEntry: PwaRegistryEntry = { ...REAL_CHILD, serviceWorkerUrl: "/m/sw-old.js", manifestId: "/m/old/" };
    const root = compileMall({ ...MALL_ROOT, mountPath: "/" }, mallRegistry(2, [driftedEntry]));

    const result = verifyReleaseOrder(child, valid(root));
    // The root still excludes "/m" (the scope did not move), so the path-only check alone would pass this.
    expect(codes(result)).toEqual(["verify.root-registry-child-mismatch", "verify.root-registry-diverged"]);
  });

  it("L3: same scope and version, but the root's `/m/` entry belongs to another appId", () => {
    const child = compileMall({ ...REAL_CHILD, mountPath: "/m" }, mallRegistry(2, [REAL_CHILD]));
    const impostorEntry: PwaRegistryEntry = { ...mallEntry("mall-impostor", "/m/") };
    const root = compileMall({ ...MALL_ROOT, mountPath: "/" }, mallRegistry(2, [impostorEntry]));

    const result = verifyReleaseOrder(child, valid(root));
    expect(codes(result)).toEqual(["verify.root-registry-child-mismatch", "verify.root-registry-diverged"]);
  });

  it("L4: root moved on to v2 (child now at /mobile/, /m/ given to app z) while the child still ships v1 at /m/", () => {
    const child = compileMall({ ...REAL_CHILD, mountPath: "/m" }, mallRegistry(1, [REAL_CHILD]));
    const movedChild = mallEntry("mall-m", "/mobile/");
    const appZ = mallEntry("z", "/m/");
    const root = compileMall({ ...MALL_ROOT, mountPath: "/" }, mallRegistry(2, [movedChild, appZ]));

    const result = verifyReleaseOrder(child, valid(root));
    // The root is *newer*, not older, and it still excludes "/m" — just for app z now, not this child. Only the
    // identity check catches that the app at this scope silently changed underneath the path-only checks.
    expect(codes(result)).toEqual(["verify.root-registry-child-mismatch"]);
  });

  it("passes when the root's entry for the child matches exactly, even though other children also exist", () => {
    const registry = mallRegistry(2, [REAL_CHILD, mallEntry("z", "/z/")]);
    const child = compileMall({ ...REAL_CHILD, mountPath: "/m" }, registry);
    const root = compileMall({ ...MALL_ROOT, mountPath: "/" }, registry);
    expect(verifyReleaseOrder(child, valid(root)).ok).toBe(true);
  });
});
