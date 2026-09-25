import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as contracts from "../src/index.js";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

const PUBLIC_MODULES = [
  "index",
  "cache-namespace",
  "diagnostics",
  "events",
  "identity",
  "json",
  "plan",
  "policy",
  "validate",
] as const;

describe("public exports", () => {
  it("exposes exactly the documented v1 runtime API", () => {
    expect(Object.keys(contracts).sort()).toEqual([
      "CACHE_KINDS",
      "CACHE_STRATEGIES",
      "DIAGNOSTIC_CODES",
      "DIAGNOSTIC_MESSAGES",
      "DIAGNOSTIC_SEVERITIES",
      "INSTALL_DISPLAY_MODES",
      "INSTALL_DISPLAY_OVERRIDES",
      "INSTALL_ICON_PURPOSES",
      "INSTALL_ORIENTATIONS",
      "INSTALL_SCREENSHOT_FORM_FACTORS",
      "INSTALL_SCREENSHOT_TYPES",
      "LIFECYCLE_EVENT_TYPES",
      "REQUEST_BASELINE_DENIALS",
      "RESOURCE_CLASSES",
      "TOPOLOGY_KINDS",
      "UPDATE_MODES",
      "appCachePrefix",
      "cacheName",
      "cacheNamespacePrefix",
      "readLifecycleEvent",
      "runtimeDataCacheName",
      "validateIdentity",
      "validateInstallMetadata",
      "validateOriginRegistry",
      "validatePlan",
      "validatePolicy",
    ]);
  });

  it("publishes a single tree-shakable entry point with zod as the only dependency", () => {
    const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;
    expect(manifest["exports"]).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
    expect(manifest["sideEffects"]).toBe(false);
    expect(manifest["private"]).toBeUndefined();
    expect(Object.keys(manifest["dependencies"] as object)).toEqual(["zod"]);
  });

  it("keeps public declarations reviewable and free of internal implementation", async () => {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      declaration: true,
      isolatedDeclarations: true,
      exactOptionalPropertyTypes: true,
    };
    const declarations = PUBLIC_MODULES.map((name) => {
      const output = ts.transpileDeclaration(read(`../src/${name}.ts`), {
        compilerOptions,
        fileName: `${name}.ts`,
        reportDiagnostics: true,
      });
      expect(output.diagnostics ?? []).toEqual([]);
      return `// ---- ${name}.d.ts ----\n${output.outputText}`;
    }).join("\n");

    expect(declarations).not.toMatch(/zod|\/internal\//);
    await expect(declarations).toMatchFileSnapshot("./__snapshots__/public-api.d.ts.snap");
  });
});

describe("v1 compatibility", () => {
  const golden = JSON.parse(read("./golden/v1.json")) as Record<string, unknown>;

  it("still accepts every committed v1 golden document unchanged", () => {
    const identity = contracts.validateIdentity(golden["identity"]);
    expect(identity).toEqual({ ok: true, value: golden["identity"], diagnostics: [] });
    if (!identity.ok) return;

    expect(contracts.validateInstallMetadata(golden["install"], identity.value)).toEqual({
      ok: true,
      value: golden["install"],
      diagnostics: [],
    });
    for (const key of ["policy", "policyWithoutOptionalFields"]) {
      expect(contracts.validatePolicy(golden[key])).toEqual({ ok: true, value: golden[key], diagnostics: [] });
    }
    expect(contracts.validatePlan(golden["plan"])).toEqual({ ok: true, value: golden["plan"], diagnostics: [] });
    expect(contracts.readLifecycleEvent(golden["event"])).toEqual({ kind: "known", event: golden["event"] });
  });
});

describe("dependency boundaries", () => {
  const srcDirectory = decodeURIComponent(new URL("../src/", import.meta.url).pathname);

  /** Value imports, side-effect imports and re-exports; `import type` / `export type` are erased and skipped. */
  function runtimeImports(file: string): string[] {
    const statements = read(file).matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;=]*?from\s+)?"([^"]+)";/gm);
    return [...statements].filter((match) => !match[1]).map((match) => match[2] ?? "");
  }

  function runtimeClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const pending = [new URL(entry, import.meta.url).href];
    while (pending.length > 0) {
      const file = pending.pop() ?? "";
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of runtimeImports(file)) {
        if (specifier.startsWith(".")) pending.push(new URL(specifier.replace(/\.js$/, ".ts"), file).href);
        else seen.add(specifier);
      }
    }
    return seen;
  }

  it("loads zod at runtime only from the validation module", () => {
    const zodImporters = ts.sys
      .readDirectory(srcDirectory, [".ts"])
      .filter((file) => runtimeImports(file).includes("zod"))
      .map((file) => file.slice(srcDirectory.length));
    expect(zodImporters).toEqual(["validate.ts"]);
  });

  it.each(["cache-namespace", "events", "diagnostics", "identity", "json", "plan", "policy"])(
    "keeps %s.ts free of zod and the validation module",
    (name) => {
      const reached = [...runtimeClosure(`../src/${name}.ts`)];
      expect(reached.filter((module) => module === "zod" || module.endsWith("/validate.ts"))).toEqual([]);
    },
  );
});
