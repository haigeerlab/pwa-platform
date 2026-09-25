// ADR-0019 review #1: contracts' registry checks (`registry.child-outside-root`, `registry.scope-overlap`) must use
// the exact same decoded, whole-segment path comparison core uses everywhere else. This runs one table of path
// pairs through core's own `isWithinKey(decodedPathKey(...))` and through contracts' public `validateOriginRegistry`
// and asserts the two never disagree. contracts exports no internal helper, so this parity check can only live on
// the side that already depends on the other — core depends on contracts, never the reverse.
import { validateOriginRegistry } from "@pwa-platform/contracts";
import type { PwaOriginRegistry } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { decodedPathKey, isWithinKey } from "../src/internal/path-key.js";

const ORIGIN = "https://parity.example.com";
const ENVIRONMENT = "production";

function entry(appId: string, scope: `/${string}`) {
  return {
    appId,
    scope,
    serviceWorkerUrl: `${scope}sw.js` as `/${string}`,
    manifestId: scope,
    manifestUrl: `${scope}manifest.webmanifest` as `/${string}`,
  };
}

/** A registry with one child, so `registry.child-outside-root` is the only structural check the pair can trip. */
function registryWithChild(childScope: `/${string}`): PwaOriginRegistry {
  return {
    schemaVersion: 1,
    registryVersion: 1,
    origin: ORIGIN,
    environment: ENVIRONMENT,
    root: entry("root", "/"),
    children: [entry("child", childScope)],
  };
}

/** A registry with two children at `/x/...` scopes, so only `registry.scope-overlap` can fire between them. */
function registryWithSiblings(left: `/${string}`, right: `/${string}`): PwaOriginRegistry {
  return {
    schemaVersion: 1,
    registryVersion: 1,
    origin: ORIGIN,
    environment: ENVIRONMENT,
    root: entry("root", "/"),
    children: [
      { ...entry("left", left), appId: "left" },
      { ...entry("right", right), appId: "right" },
    ],
  };
}

/** The scope without its trailing slash, decoded the same way core's compiler keys a prefix. */
const scopeKey = (scope: string): string => decodedPathKey(scope === "/" ? "/" : scope.slice(0, -1));

const hasCode = (result: ReturnType<typeof validateOriginRegistry>, code: string): boolean =>
  !result.ok && result.diagnostics.some((finding) => finding.code === code);

describe("core and contracts agree on decoded scope containment (child-outside-root)", () => {
  it.each([
    ["a plain scope is within the root", "/m/", true],
    ["a percent-encoded spelling of the same scope is within the root", "/%6D/", true],
    ["a lowercase percent-encoded spelling is within the root", "/%6d/", true],
    ["an invalid escape still decodes to something within the root", "/%zz/", true],
    ["a non-UTF-8 escape still decodes to something within the root", "/%FF/", true],
  ] as const)("%s", (_name, childScope, expectWithin) => {
    // The root here is "/", so every scope is trivially within it by `isWithinKey`'s "/" special case; the real
    // signal is that core and contracts reach the *same* verdict, which the next describe block varies genuinely.
    expect(isWithinKey(scopeKey(childScope), scopeKey("/"))).toBe(expectWithin);
    expect(hasCode(validateOriginRegistry(registryWithChild(childScope)), "registry.child-outside-root")).toBe(
      !expectWithin,
    );
  });
});

describe("core and contracts agree on decoded scope containment under a non-root parent", () => {
  const ROOT_ENTRY = entry("root", "/app/");
  function registryUnderApp(childScope: `/${string}`): PwaOriginRegistry {
    return {
      schemaVersion: 1,
      registryVersion: 1,
      origin: ORIGIN,
      environment: ENVIRONMENT,
      root: ROOT_ENTRY,
      children: [entry("child", childScope)],
    };
  }

  it.each([
    ["a child directly under the root", "/app/m/", true],
    ["a percent-encoded segment of the mount path itself", "/%61pp/m/", true],
    ["a scope outside the root entirely", "/other/", false],
    ["a scope that only shares the root's first letter", "/apples/", false],
  ] as const)("%s", (_name, childScope, expectWithin) => {
    expect(isWithinKey(scopeKey(childScope), scopeKey("/app/"))).toBe(expectWithin);
    expect(hasCode(validateOriginRegistry(registryUnderApp(childScope)), "registry.child-outside-root")).toBe(
      !expectWithin,
    );
  });
});

describe("core and contracts agree on decoded scope overlap between siblings", () => {
  it.each([
    ["identical scopes", "/m/", "/m/", true],
    ["scopes distinguished only by percent-encoding", "/m/", "/%6D/", true],
    ["scopes distinguished only by a lowercase percent-encoded escape", "/m/", "/%6d/", true],
    ["one scope nested inside the other", "/m/", "/m/sub/", true],
    ["disjoint siblings", "/m/", "/b/", false],
    ["a sibling that only shares the first letter", "/m/", "/mx/", false],
    ["an encoded slash never becomes a segment boundary", "/m/", "/m%2Fx/", false],
  ] as const)("%s", (_name, left, right, expectOverlap) => {
    const leftKey = scopeKey(left);
    const rightKey = scopeKey(right);
    const coreOverlap = isWithinKey(leftKey, rightKey) || isWithinKey(rightKey, leftKey);
    expect(coreOverlap).toBe(expectOverlap);
    expect(hasCode(validateOriginRegistry(registryWithSiblings(left, right)), "registry.scope-overlap")).toBe(
      expectOverlap,
    );
  });
});
