import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

type SourceFiles = ReadonlyMap<string, string>;

function sourceFiles(): SourceFiles {
  const root = decodeURIComponent(new URL("../src/", import.meta.url).pathname);
  return new Map(ts.sys.readDirectory(root, [".ts"]).map((file) => [file.slice(root.length), read(file)]));
}

type ImportKind = "runtime" | "type";
type ImportRecord = { readonly specifier: string; readonly kind: ImportKind };

/**
 * Every import/export-from's module specifier in `text`, tagged by whether it is `import type`/`export type` or an
 * ordinary (runtime) one. This needs a real parse rather than `ts.preProcessFile`'s lexer scan (used below for the
 * builtin/dynamic-import checks, which do not care about the distinction): `preProcessFile` reports a specifier's
 * text but not whether its declaration was type-only.
 */
function imports(fileName: string, text: string): readonly ImportRecord[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const records: ImportRecord[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      records.push({
        specifier: node.moduleSpecifier.text,
        kind: node.importClause?.isTypeOnly === true ? "type" : "runtime",
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      records.push({ specifier: node.moduleSpecifier.text, kind: node.isTypeOnly ? "type" : "runtime" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return records;
}

/** Ways to obtain a builtin without an import specifier, which the specifier-based checks below cannot see. */
const SMUGGLED = /\bprocess\s*\.\s*(?:getBuiltinModule|binding)\b|\bcreateRequire\b|\bModule\s*\.\s*_load\b/;

/**
 * `src/` must run unmodified in Node 24 and in browsers, so no file anywhere in it may reach for a `node:`
 * builtin (see ADR-0018, "src/ 环境中立: 不导入 node: 模块"). This is what lets the same verification code run
 * inside a unit test today and inside a Vite plugin / browser bundle without a fork.
 */
function nodeBuiltinOffenders(file: string, text: string): readonly string[] {
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith("node:"))
    .map((specifier) => `${file}: ${specifier}`);
}

/**
 * Which non-relative (bare) specifiers a directory may import, and at which kind. Every other file in `src/` gets
 * `DEFAULT_RULE`: no bare specifier at all — the rule the whole package followed before this task, and still
 * follows outside these three directories (see ADR-0018, "不依赖任何第三方包").
 */
type DirectoryRule = { readonly runtime: readonly string[]; readonly type: readonly string[] };
const DEFAULT_RULE: DirectoryRule = { runtime: [], type: [] };
const DIRECTORY_RULES: ReadonlyMap<string, DirectoryRule> = new Map([
  // The Vite plugin: a runtime import of the sibling platform package (to find `pwa()` by name), and type-only
  // imports of `vite` (the `Plugin` type) and `@pwa-platform/contracts` (`PwaIdentity`).
  ["vite/", { runtime: ["@pwa-platform/vite"], type: ["vite", "@pwa-platform/contracts"] }],
  // The page-side entries: the one virtual module the plugin above serves, imported at runtime (it is a default
  // value import, not a type import) and nothing else.
  ["client/", { runtime: ["virtual:pwa-entry-config"], type: [] }],
  ["page/", { runtime: ["virtual:pwa-entry-config"], type: [] }],
]);

function ruleFor(file: string): DirectoryRule {
  for (const [prefix, rule] of DIRECTORY_RULES) {
    if (file.startsWith(prefix)) return rule;
  }
  return DEFAULT_RULE;
}

/** Every bare specifier `file` imports that its directory's rule does not allow at the kind it was imported as. */
function bareSpecifierOffenders(file: string, text: string): readonly string[] {
  const rule = ruleFor(file);
  return imports(file, text)
    .filter((record) => !record.specifier.startsWith("."))
    .filter((record) => !rule[record.kind].includes(record.specifier))
    .map((record) => `${file}: ${record.kind === "type" ? "type " : ""}${record.specifier}`);
}

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes three entries: the pure core, the vite plugin, and the client facade", () => {
    expect(manifest["exports"]).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./vite": { types: "./dist/vite/index.d.ts", import: "./dist/vite/index.js" },
      "./client": { types: "./dist/client/index.d.ts", import: "./dist/client/index.js" },
    });
    expect(manifest["private"]).not.toBe(true);
    expect(manifest["version"]).toBe("0.1.0");
    expect(manifest["license"]).toBe("MIT");
    expect(manifest["publishConfig"]).toEqual({
      registry: "https://registry.npmjs.org/",
      access: "public",
      tag: "latest",
    });
    expect(manifest["files"]).toEqual(["dist"]);
    // Pure functions only: nothing in this package runs on import.
    expect(manifest["sideEffects"]).toBe(false);
  });

  it("depends only on the sibling vite-adapter package, as a workspace dependency", () => {
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/vite": "workspace:*" });
    expect(manifest["peerDependencies"]).toEqual({ vite: "^5.0.0 || ^8.0.0" });
  });
});

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has an entry module", () => {
    expect(files.has("index.ts")).toBe(true);
  });

  it("imports no node: builtin anywhere in src/", () => {
    const found = [...files].flatMap(([file, text]) => nodeBuiltinOffenders(file, text));
    expect(found).toEqual([]);
  });

  it("only imports the bare specifiers each directory's import boundary allows, at the kind it allows them", () => {
    const found = [...files].flatMap(([file, text]) => bareSpecifierOffenders(file, text));
    expect(found).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("never reaches a builtin around the import graph", () => {
    // The checks above read import specifiers, so a builtin obtained without one is invisible to them.
    const smuggled = [...files].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file);
    expect(smuggled).toEqual([]);
  });

  it("detects the things it forbids, so passing these checks means something", () => {
    // Without a probe, a typo in any pattern above would let the check pass forever.
    const probe: SourceFiles = new Map([
      ["index.ts", "import { readFileSync } from 'node:fs';\nexport { x } from \"@pwa-platform/core\";\n"],
      ["lazy.ts", "export const load = () => import(\"./other.js\");\n"],
      ["smuggler.ts", "const fs = process.getBuiltinModule(\"fs\");\n"],
    ]);

    expect([...probe].flatMap(([file, text]) => nodeBuiltinOffenders(file, text))).toEqual(["index.ts: node:fs"]);

    // Catches both offenders in the probe's `index.ts`: `bareSpecifierOffenders` does not special-case `node:`
    // specifiers, so a builtin is "just" a bare specifier no directory's rule allows, same as a package would be.
    expect([...probe].flatMap(([file, text]) => bareSpecifierOffenders(file, text))).toEqual([
      "index.ts: node:fs",
      "index.ts: @pwa-platform/core",
    ]);

    expect([...probe].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file)).toEqual([
      "lazy.ts",
    ]);

    // The smuggled builtin carries no specifier at all, so it has to stay invisible to the checks above and
    // be caught only by SMUGGLED — that is exactly why it is a separate check rather than another specifier rule.
    expect([...probe].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file)).toEqual(["smuggler.ts"]);
  });

  it("lets vite/ import its two runtime and type-only allowances, and nothing else at either kind", () => {
    expect(
      bareSpecifierOffenders("vite/index.ts", 'import { PWA_PLUGIN_NAME } from "@pwa-platform/vite";\n'),
    ).toEqual([]);
    expect(bareSpecifierOffenders("vite/index.ts", 'import type { Plugin } from "vite";\n')).toEqual([]);
    expect(
      bareSpecifierOffenders("vite/options.ts", 'import type { PwaIdentity } from "@pwa-platform/contracts";\n'),
    ).toEqual([]);

    // The same three specifiers, each imported at the kind its rule does not grant.
    expect(bareSpecifierOffenders("vite/index.ts", 'import type { PwaPluginApi } from "@pwa-platform/vite";\n')).toEqual(
      ["vite/index.ts: type @pwa-platform/vite"],
    );
    expect(bareSpecifierOffenders("vite/index.ts", 'import { createServer } from "vite";\n')).toEqual([
      "vite/index.ts: vite",
    ]);
    expect(
      bareSpecifierOffenders("vite/options.ts", 'import { validateIdentity } from "@pwa-platform/contracts";\n'),
    ).toEqual(["vite/options.ts: @pwa-platform/contracts"]);

    // Nothing else is allowed at any kind, including packages this package's own dependencies list happens to make
    // resolvable, and including a relative-looking specifier for a package that is not actually relative.
    expect(bareSpecifierOffenders("vite/index.ts", 'import { z } from "zod";\n')).toEqual(["vite/index.ts: zod"]);
  });

  it("lets client/ and page/ import only the virtual module, as a runtime (not type-only) import", () => {
    expect(bareSpecifierOffenders("client/index.ts", 'import config from "virtual:pwa-entry-config";\n')).toEqual([]);
    expect(bareSpecifierOffenders("page/main.ts", 'import config from "virtual:pwa-entry-config";\n')).toEqual([]);
    // Relative imports into the rest of the package stay unrestricted in both directories.
    expect(
      bareSpecifierOffenders("client/index.ts", 'import { createEntryRecoveryChecker } from "../browser/index.js";\n'),
    ).toEqual([]);

    expect(
      bareSpecifierOffenders("client/index.ts", 'import type config from "virtual:pwa-entry-config";\n'),
    ).toEqual(["client/index.ts: type virtual:pwa-entry-config"]);
    expect(bareSpecifierOffenders("page/main.ts", 'import { helper } from "some-package";\n')).toEqual([
      "page/main.ts: some-package",
    ]);
  });

  it("still forbids every bare specifier outside vite/, client/ and page/", () => {
    expect(bareSpecifierOffenders("select.ts", 'import { x } from "@pwa-platform/core";\n')).toEqual([
      "select.ts: @pwa-platform/core",
    ]);
    expect(bareSpecifierOffenders("verify.ts", 'import type { Foo } from "vite";\n')).toEqual([
      "verify.ts: type vite",
    ]);
  });
});
