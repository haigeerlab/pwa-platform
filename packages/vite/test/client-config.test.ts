import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { createClientConfig } from "@pwa-platform/client-runtime/build";
import { compilePlan, type PwaCompileHostOutput } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import {
  CLIENT_CONFIG_MODULE_ID,
  CLIENT_CONFIG_RESOLVED_ID,
  createClientConfigFromOptions,
  serializeClientConfigModule,
} from "../src/client-config.js";

const identity: PwaIdentity = {
  appId: "storefront",
  manifestId: "/app/",
  origin: "https://shop.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const install: PwaInstallMetadata = {
  startUrl: "/app/home",
  display: "standalone",
  name: "Storefront",
  shortName: "Shop",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

function policy(installEnabled: boolean): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: installEnabled },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
  };
}

const hostBuildOutput: PwaCompileHostOutput = {
  publicPath: "/app/",
  serviceWorkerFile: "sw.js",
  manifestFile: "manifest.webmanifest",
  files: [
    { path: "assets/index-BGTT0tj4.js", fingerprinted: true, contentHash: "ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWY" },
    { path: "index.html", fingerprinted: false, contentHash: "aW5kZXhodG1sYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnc" },
  ],
};

/** The plan the real pipeline would compile for the same options. */
function planFor(installEnabled: boolean, metadata: PwaInstallMetadata | null) {
  const result = compilePlan({
    identity,
    install: metadata,
    policy: policy(installEnabled),
    topology: { kind: "standalone-origin" },
    hostBuildOutput,
  });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  return result.value;
}

describe("createClientConfigFromOptions", () => {
  it("carries the fields the page facade reads", () => {
    expect(createClientConfigFromOptions({ identity, policy: policy(true), install })).toEqual({
      appId: "storefront",
      scope: "/app/",
      serviceWorkerUrl: "/app/sw.js",
      updateMode: "prompt",
      installEnabled: true,
    });
  });

  it("reads updateMode from the policy rather than assuming the only legal value", () => {
    // `UPDATE_MODES` holds one member today, so a hard-coded "prompt" would satisfy every positive case. An
    // illegal value separates them: the real implementation hands it to validateClientConfig, which throws, while
    // a hard-coded literal would return a config as if nothing were wrong.
    const broken = { ...policy(true), updateMode: "silent" } as unknown as PwaPolicy;
    expect(() => createClientConfigFromOptions({ identity, policy: broken, install })).toThrow(/updateMode/);
  });

  it("never passes the whole plan to the page", () => {
    // The page has no business knowing the precache list or the path rules; sending them would put the platform's
    // routing table into every visitor's bundle.
    const config = createClientConfigFromOptions({ identity, policy: policy(true), install });
    expect(Object.keys(config).sort()).toEqual(["appId", "installEnabled", "scope", "serviceWorkerUrl", "updateMode"]);
  });
});

describe("parity with client-runtime's createClientConfig", () => {
  // Two implementations exist only because the virtual module is loaded before a plan exists. This is what keeps
  // them from drifting: whatever the real pipeline would produce from the compiled plan, this module produces from
  // the options.
  const cases: readonly (readonly [string, boolean, PwaInstallMetadata | null])[] = [
    ["install enabled with metadata", true, install],
    ["install disabled, no metadata", false, null],
    // The interesting one: the compiler validates metadata for a disabled install but keeps it out of the plan,
    // so `plan.install` is null and the page must be told installation is off. Reading only the metadata here
    // would advertise an installable app whose worker was never told to expect one.
    ["install disabled but metadata supplied", false, install],
  ];

  for (const [label, enabled, metadata] of cases) {
    it(`agrees on ${label}`, () => {
      const fromPlan = createClientConfig(planFor(enabled, metadata));
      const fromOptions = createClientConfigFromOptions({ identity, policy: policy(enabled), install: metadata });
      expect(fromOptions).toEqual(fromPlan);
    });
  }

  it("agrees on every key, not merely on the ones this test names", () => {
    const fromPlan = createClientConfig(planFor(true, install));
    const fromOptions = createClientConfigFromOptions({ identity, policy: policy(true), install });
    expect(Object.keys(fromOptions).sort()).toEqual(Object.keys(fromPlan).sort());
  });
});

describe("serializeClientConfigModule", () => {
  it("emits a default export the page can import", () => {
    const config = createClientConfigFromOptions({ identity, policy: policy(true), install });
    const source = serializeClientConfigModule(config);

    expect(source).toContain("export default");
    expect(source.endsWith("\n")).toBe(true);
    // The JSON round-trips: what the page receives is exactly the validated config.
    const literal = /export default Object\.freeze\((.*)\);/s.exec(source)?.[1] ?? "";
    expect(JSON.parse(literal)).toEqual(config);
  });

  it("freezes the config, so a page cannot reconfigure the platform by assignment", () => {
    const config = createClientConfigFromOptions({ identity, policy: policy(true), install });
    expect(serializeClientConfigModule(config)).toContain("Object.freeze");
  });
});

describe("module ids", () => {
  it("resolves to a NUL-prefixed id, which marks it as not a file", () => {
    expect(CLIENT_CONFIG_MODULE_ID).toBe("virtual:pwa-config");
    expect(CLIENT_CONFIG_RESOLVED_ID).toBe("\0virtual:pwa-config");
  });
});
