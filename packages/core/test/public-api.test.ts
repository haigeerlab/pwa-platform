import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

const PUBLIC_MODULES = ["index", "compile", "input"] as const;

describe("public exports", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(core).sort()).toEqual(["compilePlan"]);
  });

  it("publishes a single tree-shakable entry that depends only on contracts", () => {
    const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;
    expect(manifest["exports"]).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
    expect(manifest["sideEffects"]).toBe(false);
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/contracts": "workspace:*" });
  });

  it("keeps public declarations reviewable and free of implementation modules", async () => {
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

    expect(declarations).not.toMatch(/zod|\/internal\/|\.\/(rules|precache|host-output)\.js/);
    await expect(declarations).toMatchFileSnapshot("./__snapshots__/public-api.d.ts.snap");
  });
});

describe("dependency boundaries", () => {
  const srcDirectory = decodeURIComponent(new URL("../src/", import.meta.url).pathname);
  const sources = ts.sys.readDirectory(srcDirectory, [".ts"]).map((file) => ({
    name: file.slice(srcDirectory.length),
    text: read(file),
  }));

  it("imports only relative modules and @pwa-platform/contracts, so no I/O, Workbox or framework code", () => {
    const offenders = sources.flatMap(({ name, text }) =>
      [...text.matchAll(/^(?:import|export)\s+(?:type\s+)?(?:[^;=]*?from\s+)?"([^"]+)";/gm)]
        .map((match) => match[1] ?? "")
        .filter((specifier) => !specifier.startsWith(".") && specifier !== "@pwa-platform/contracts")
        .map((specifier) => `${name}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const offenders = sources.filter(({ text }) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
