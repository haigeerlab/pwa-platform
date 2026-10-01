import { describe, expect, it } from "vitest";
import { validatePlan, type PwaPortableOriginRegistry, type PwaPolicyV3 } from "@pwa-platform/contracts";
import { compilePlan, type PwaPortableCompileInput } from "../src/index.js";
import { input } from "./fixtures.js";

const policy: PwaPolicyV3 = {
  schemaVersion: 3,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [],
  offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
  runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
};

const { origin: _ignored, ...fixedWithoutOrigin } = input.identity as Extract<typeof input, { identity: { origin: string } }>["identity"];
void _ignored;
const identity = { ...fixedWithoutOrigin, manifestId: "/app/" as const };

const portable: PwaPortableCompileInput = {
  ...input,
  deployment: { kind: "portable" },
  identity,
  policy,
  topology: { kind: "standalone-origin" },
};

describe("portable plan compilation", () => {
  it("requires an explicit mode and emits a v4 plan without an origin", () => {
    const result = compilePlan(portable);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(4);
    expect(result.value.identity).not.toHaveProperty("origin");
    expect(validatePlan(result.value).ok).toBe(true);
    const missingFixedOrigin = compilePlan({ ...input, identity } as never);
    expect(missingFixedOrigin.ok).toBe(false);
    if (!missingFixedOrigin.ok) expect(missingFixedOrigin.diagnostics.some((d) => d.path === "/identity/origin")).toBe(true);
  });

  it("rejects a fixed origin smuggled into portable identity", () => {
    const result = compilePlan({ ...portable, identity: { ...identity, origin: "https://example.com" } } as never);
    expect(result.ok).toBe(false);
  });

  it("rejects a domain-bearing portable manifest id", () => {
    const result = compilePlan({ ...portable, identity: { ...identity, manifestId: "https://shop.example/app/" } } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((finding) => finding.path)).toContain("/identity/manifestId");
  });

  it("compiles a portable root registry and excludes its child scope", () => {
    const root = { ...identity, appId: "portal", manifestId: "/" as const, scope: "/" as const, mountPath: "/" as const,
      serviceWorkerUrl: "/sw.js" as const, manifestUrl: "/manifest.webmanifest" as const };
    const child = { appId: "portal-m", scope: "/m/" as const, serviceWorkerUrl: "/m/sw.js" as const,
      manifestId: "/m/" as const, manifestUrl: "/m/manifest.webmanifest" as const };
    const registry: PwaPortableOriginRegistry = {
      schemaVersion: 2, registryVersion: 1, environment: root.environment,
      root: { appId: root.appId, scope: root.scope, serviceWorkerUrl: root.serviceWorkerUrl,
        manifestId: root.manifestId, manifestUrl: root.manifestUrl }, children: [child],
    };
    const result = compilePlan({
      deployment: { kind: "portable" }, identity: root, install: null,
      policy: { ...policy, install: { enabled: false } },
      topology: { kind: "shared-origin", registry },
      hostBuildOutput: { publicPath: "/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pathRules[0]).toMatchObject({ pathPrefix: "/m", action: "exclude" });
  });
});
