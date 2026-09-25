import type { PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  createPlatformWorkerConfig,
  createRecoveryWorkerConfig,
  injectWorkerConfig,
  WORKER_CONFIG_INJECTION_POINT,
  type PwaPlatformWorkerConfig,
  type PwaWorkerConfig,
} from "../src/build/index.js";

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

/** Evaluates the injected source's config expression, proving the output is valid JavaScript. */
function evaluateConfig(injected: string): unknown {
  const body = injected.replace(/^const config = /, "return ").replace(/;\nexport \{ config \};\n$/, ";");
  return new Function(body)() as unknown;
}

// engine-workbox's injection point; the platform worker source contains both.
const MANIFEST_INJECTION_POINT = "self.__WB_MANIFEST";
const SOURCE = `const config = ${WORKER_CONFIG_INJECTION_POINT};\nexport { config };\n`;
const platform = createPlatformWorkerConfig(readPlan("storefront"));
const recovery = createRecoveryWorkerConfig(readPlan("storefront"));

describe("injectWorkerConfig", () => {
  it("uses its own injection point, distinct from the precache manifest's", () => {
    expect(WORKER_CONFIG_INJECTION_POINT).toBe("self.__PWA_WORKER_CONFIG");
    expect(WORKER_CONFIG_INJECTION_POINT.includes(MANIFEST_INJECTION_POINT)).toBe(false);
    expect(MANIFEST_INJECTION_POINT.includes(WORKER_CONFIG_INJECTION_POINT)).toBe(false);
  });

  it("replaces the injection point with the config serialized as JSON", () => {
    expect(injectWorkerConfig(SOURCE, platform)).toBe(`const config = ${JSON.stringify(platform)};\nexport { config };\n`);
    expect(evaluateConfig(injectWorkerConfig(SOURCE, platform))).toEqual(platform);
    expect(evaluateConfig(injectWorkerConfig(SOURCE, recovery))).toEqual(recovery);
  });

  it("leaves the rest of the source, including the manifest injection point, byte for byte unchanged", () => {
    const prefix = `// '$&' and "$1" and $$ stay literal\nconst manifest = ${MANIFEST_INJECTION_POINT};\n`;
    const suffix = ";\nconst after = '$`';\n";
    const injected = injectWorkerConfig(`${prefix}${WORKER_CONFIG_INJECTION_POINT}${suffix}`, platform);
    expect(injected).toBe(`${prefix}${JSON.stringify(platform)}${suffix}`);
  });

  it("fails unless the injection point occurs exactly once, counting comments", () => {
    expect(() => injectWorkerConfig("const config = {};\n", platform)).toThrow(/exactly one self\.__PWA_WORKER_CONFIG .*found 0/);
    expect(() =>
      injectWorkerConfig(`// reads ${WORKER_CONFIG_INJECTION_POINT}\nconst config = ${WORKER_CONFIG_INJECTION_POINT};\n`, platform),
    ).toThrow(/found 2/);
  });

  it("validates the config before injecting it", () => {
    const invalid = { ...platform, updateMode: "immediate" } as unknown as PwaWorkerConfig;
    expect(() => injectWorkerConfig(SOURCE, invalid)).toThrow(/config\.updateMode must be "prompt"/);
    const truncated = { ...recovery, appCachePrefix: "pwa:" };
    expect(() => injectWorkerConfig(SOURCE, truncated)).toThrow(/config\.appCachePrefix must have the form/);
  });

  it("rejects a worker source that is not a string", () => {
    expect(() => injectWorkerConfig(undefined as unknown as string, platform)).toThrow(TypeError);
  });

  it("is deterministic and independent of the config's key order", () => {
    const reordered = Object.fromEntries(Object.entries(platform).reverse()) as PwaPlatformWorkerConfig;
    expect(injectWorkerConfig(SOURCE, reordered)).toBe(injectWorkerConfig(SOURCE, platform));
  });

  it("keeps percent-encoded paths intact, while paths with raw special characters never reach the output", () => {
    const encoded: PwaPlatformWorkerConfig = { ...platform, pathRules: [{ pathPrefix: "/caf%C3%A9/%E2%80%A8", action: "deny" }] };
    expect(evaluateConfig(injectWorkerConfig(SOURCE, encoded))).toEqual(encoded);
    // Written as escapes on purpose: U+2028 and U+2029 end a line in JavaScript before ES2019, and they look like
    // blank space in an editor. The URL parser re-encodes them, so canonicalPath rejects them and a raw one can
    // never reach the injected source.
    for (const rawPrefix of ["/caf\u00e9/\u2028", "/a\u2029b", "/caf\u00e9"]) {
      const raw = { ...platform, pathRules: [{ pathPrefix: rawPrefix, action: "deny" as const }] };
      expect(() => injectWorkerConfig(SOURCE, raw as PwaPlatformWorkerConfig), JSON.stringify(rawPrefix)).toThrow(
        /pathPrefix must be a canonical absolute path/,
      );
    }
  });
});
