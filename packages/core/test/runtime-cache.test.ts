import { describe, expect, it } from "vitest";
import type { AbsolutePath, PwaCacheStrategy, PwaPolicyV3, PwaResourceClass } from "@pwa-platform/contracts";
import { compileRuntimeCache } from "../src/runtime-cache.js";
import { fnv1a64 } from "../src/internal/digest.js";

describe("fnv1a64", () => {
  it("matches the known FNV-1a 64-bit test vectors", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
  });

  it("always returns 16 lowercase hex characters", () => {
    for (const input of ["", "a", "hello world", "public-data", "\u{1F600}"]) {
      expect(fnv1a64(input)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("is deterministic and sensitive to its input", () => {
    expect(fnv1a64("x")).toBe(fnv1a64("x"));
    expect(fnv1a64("x")).not.toBe(fnv1a64("y"));
  });
});

describe("compileRuntimeCache", () => {
  const mountPath = "/app" as AbsolutePath;

  const disabledRuntimeCache = { enabled: false as const, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 };
  const enabledRuntimeCache = { enabled: true as const, maxEntries: 100, maxEntryBytes: 1024, maxAgeSeconds: 300 };

  const policy = (resources: PwaPolicyV3["resources"], runtimeCache: PwaPolicyV3["runtimeCache"]): PwaPolicyV3 => ({
    schemaVersion: 3,
    install: { enabled: false },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources,
    offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
    runtimeCache,
  });

  it("passes every rule through and reports no diagnostics when disabled", () => {
    const result = compileRuntimeCache(
      policy(
        [
          { pathPrefix: "/data", resourceClass: "public-data", cache: "cache-first" },
          { pathPrefix: "/page", resourceClass: "navigation-public-dynamic", cache: "stale-while-revalidate" },
        ],
        disabledRuntimeCache,
      ),
      mountPath,
    );
    expect(result).toEqual({ runtimeCache: { enabled: false }, errors: [], warnings: [] });
  });

  const CLASSES: readonly ["public-data", "navigation-public-dynamic"] = ["public-data", "navigation-public-dynamic"];
  const STRATEGIES: readonly PwaCacheStrategy[] = ["none", "network-first", "stale-while-revalidate", "cache-first"];

  const TABLE: Record<(typeof CLASSES)[number], Record<PwaCacheStrategy, "passthrough" | "executable" | "error">> = {
    "public-data": {
      none: "passthrough",
      "network-first": "executable",
      "stale-while-revalidate": "executable",
      "cache-first": "error",
    },
    "navigation-public-dynamic": {
      none: "passthrough",
      "network-first": "executable",
      "stale-while-revalidate": "error",
      "cache-first": "error",
    },
  };

  for (const resourceClass of CLASSES) {
    for (const cache of STRATEGIES) {
      const outcome = TABLE[resourceClass][cache];
      it(`enabled=true, ${resourceClass} + ${cache} is ${outcome}`, () => {
        const result = compileRuntimeCache(
          policy([{ pathPrefix: "/x", resourceClass, cache }], enabledRuntimeCache),
          mountPath,
        );
        if (outcome === "error") {
          expect(result.errors).toEqual([
            { code: "compile.runtime-strategy-unsupported", severity: "error", path: "/policy/resources/0/cache", message: expect.any(String) },
          ]);
          return;
        }
        expect(result.errors).toEqual([]);
        if (outcome === "passthrough") {
          expect(result.warnings).toEqual([
            { code: "compile.runtime-cache-unused", severity: "warning", path: "/policy/runtimeCache", message: expect.any(String) },
          ]);
        } else {
          expect(result.warnings).toEqual([]);
          expect(result.runtimeCache.enabled).toBe(true);
        }
      });
    }
  }

  it("keeps asset and navigation-public-static rules unchanged regardless of strategy", () => {
    const unaffected: readonly PwaResourceClass[] = ["asset", "navigation-public-static"];
    for (const resourceClass of unaffected) {
      for (const cache of ["none", "network-first", "stale-while-revalidate", "cache-first"] as const) {
        const result = compileRuntimeCache(
          policy([{ pathPrefix: "/x", resourceClass, cache }], enabledRuntimeCache),
          mountPath,
        );
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([
          { code: "compile.runtime-cache-unused", severity: "warning", path: "/policy/runtimeCache", message: expect.any(String) },
        ]);
      }
    }
  });

  it("warns compile.runtime-cache-unused only when there is no executable rule", () => {
    const noExecutable = compileRuntimeCache(policy([], enabledRuntimeCache), mountPath);
    expect(noExecutable.warnings.map((w) => w.code)).toEqual(["compile.runtime-cache-unused"]);

    const withExecutable = compileRuntimeCache(
      policy([{ pathPrefix: "/data", resourceClass: "public-data", cache: "network-first" }], enabledRuntimeCache),
      mountPath,
    );
    expect(withExecutable.warnings).toEqual([]);
  });

  it("resolves executable rule path prefixes against the mount path and produces an enabled plan", () => {
    const result = compileRuntimeCache(
      policy([{ pathPrefix: "/data", resourceClass: "public-data", cache: "network-first" }], enabledRuntimeCache),
      mountPath,
    );
    expect(result.runtimeCache).toEqual({
      enabled: true,
      maxEntries: 100,
      maxEntryBytes: 1024,
      maxAgeSeconds: 300,
      configDigest: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  describe("configDigest", () => {
    const rule = (
      pathPrefix: AbsolutePath,
      resourceClass: "public-data" | "navigation-public-dynamic",
      cache: PwaCacheStrategy,
    ): PwaPolicyV3["resources"][number] => ({ pathPrefix, resourceClass, cache });

    function digestOf(
      resources: PwaPolicyV3["resources"],
      runtimeCache: PwaPolicyV3["runtimeCache"] = enabledRuntimeCache,
    ): string {
      const result = compileRuntimeCache(policy(resources, runtimeCache), mountPath);
      if (!result.runtimeCache.enabled) throw new Error("expected an enabled runtime cache plan");
      return result.runtimeCache.configDigest;
    }

    it("is stable when executable resources are reordered", () => {
      const a = digestOf([
        rule("/data", "public-data", "network-first"),
        rule("/page", "navigation-public-dynamic", "network-first"),
      ]);
      const b = digestOf([
        rule("/page", "navigation-public-dynamic", "network-first"),
        rule("/data", "public-data", "network-first"),
      ]);
      expect(a).toBe(b);
    });

    it("changes when a limit changes", () => {
      const resources = [rule("/data", "public-data", "network-first")];
      const base = digestOf(resources);
      expect(digestOf(resources, { ...enabledRuntimeCache, maxEntries: 101 })).not.toBe(base);
      expect(digestOf(resources, { ...enabledRuntimeCache, maxEntryBytes: 2048 })).not.toBe(base);
      expect(digestOf(resources, { ...enabledRuntimeCache, maxAgeSeconds: 301 })).not.toBe(base);
    });

    it("changes when an executable rule's path, class or strategy changes", () => {
      const base = digestOf([rule("/data", "public-data", "network-first")]);
      expect(digestOf([rule("/other", "public-data", "network-first")])).not.toBe(base);
      expect(digestOf([rule("/data", "public-data", "stale-while-revalidate")])).not.toBe(base);
      expect(
        digestOf([
          rule("/data", "public-data", "network-first"),
          rule("/page", "navigation-public-dynamic", "network-first"),
        ]),
      ).not.toBe(base);
    });

    it("ignores non-executable rules", () => {
      const base = digestOf([rule("/data", "public-data", "network-first")]);
      const withPassthrough = digestOf([
        rule("/data", "public-data", "network-first"),
        rule("/other", "public-data", "none"),
      ]);
      expect(withPassthrough).toBe(base);
    });
  });
});
