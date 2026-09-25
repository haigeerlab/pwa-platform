// Pins createClientConfigFromOptions (built from options alone, before a plan exists — design section 5's
// rationale) to createClientConfig (built from a real compiled plan) on the same inputs, for the three shapes of
// "is installation on" the compiler can produce. Same arrangement as packages/vite/test/client-config.test.ts.
import type { PwaInstallMetadata, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { createClientConfig } from "@pwa-platform/client-runtime/build";
import { compilePlan } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { createClientConfigFromOptions } from "../src/client-config.js";
import { IDENTITY, INSTALL } from "./fixtures.js";

function planFor(policy: PwaPolicy, install: PwaInstallMetadata | null): PwaPlan {
  const compiled = compilePlan({
    identity: IDENTITY,
    install,
    policy,
    topology: { kind: "standalone-origin" },
    hostBuildOutput: { publicPath: "/app/", serviceWorkerFile: "sw.js", manifestFile: "manifest.webmanifest", files: [] },
  });
  if (!compiled.ok) throw new Error(`fixture plan did not compile: ${compiled.diagnostics.map((d) => d.code).join(", ")}`);
  return compiled.value;
}

describe("createClientConfigFromOptions matches createClientConfig(plan) on real compiled plans", () => {
  it("install enabled, metadata present", () => {
    const policy: PwaPolicy = { schemaVersion: 1, install: { enabled: true }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] };
    const plan = planFor(policy, INSTALL);
    expect(plan.install).not.toBeNull();
    expect(createClientConfigFromOptions({ identity: IDENTITY, policy, install: INSTALL })).toEqual(createClientConfig(plan));
  });

  it("install disabled in the policy, even though metadata is present", () => {
    const policy: PwaPolicy = { schemaVersion: 1, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] };
    const plan = planFor(policy, INSTALL);
    expect(plan.install).toBeNull();
    expect(createClientConfigFromOptions({ identity: IDENTITY, policy, install: INSTALL })).toEqual(createClientConfig(plan));
  });

  it("no metadata at all (install must be disabled in the policy too: compilePlan errors on enabled-but-no-metadata)", () => {
    const policy: PwaPolicy = { schemaVersion: 1, install: { enabled: false }, offlineFallback: { enabled: false }, updateMode: "prompt", resources: [] };
    const plan = planFor(policy, null);
    expect(plan.install).toBeNull();
    expect(createClientConfigFromOptions({ identity: IDENTITY, policy, install: null })).toEqual(createClientConfig(plan));
  });
});
