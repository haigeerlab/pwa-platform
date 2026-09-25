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

/** Specifiers of every import, export-from, dynamic import and require, as TypeScript's scanner reads them. */
function specifiers(text: string): readonly string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName);
}

/** Package specifiers the whole package may use. */
const ALLOWED_PACKAGES = ["@pwa-platform/contracts"];

/**
 * The only module allowed to touch the file system. Everything else in this package is a pure function, which is
 * what lets a release check run in CI without network or disk access (ADR-0014).
 */
const FILE_SYSTEM_MODULE = "baseline-file.ts";

/** Ways to obtain a builtin without an import specifier, which the specifier-based checks below cannot see. */
const SMUGGLED = /\bprocess\s*\.\s*(?:getBuiltinModule|binding)\b|\bcreateRequire\b|\bModule\s*\.\s*_load\b/;

/**
 * Package specifiers a source file must not import. `node:` builtins are specifiers too, so the file-system
 * exemption has to apply here as well — otherwise the allowed module could never pass this check and the
 * exemption below would be decorative.
 */
function packageOffenders(file: string, text: string): readonly string[] {
  return specifiers(text)
    .filter((specifier) => !specifier.startsWith("."))
    .filter((specifier) => !ALLOWED_PACKAGES.includes(specifier))
    .filter((specifier) => !(file === FILE_SYSTEM_MODULE && specifier.startsWith("node:")))
    .map((specifier) => `${file}: ${specifier}`);
}

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes a single entry built from src/index.ts", () => {
    expect(manifest["exports"]).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
    // Pure functions only: nothing in this package runs on import.
    expect(manifest["sideEffects"]).toBe(false);
  });

  it("depends only on contracts from the workspace", () => {
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/contracts": "workspace:*" });
  });
});

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has an entry module", () => {
    expect(files.has("index.ts")).toBe(true);
  });

  it("imports no package other than contracts", () => {
    const offenders = [...files].flatMap(([file, text]) => packageOffenders(file, text));
    expect(offenders).toEqual([]);
  });

  it("confines file system access to a single module", () => {
    // `readIdentityBaseline` (task #84) is the one function that reads from disk. Keeping `node:fs` out of every
    // other module is what makes the rest of the package testable without a temporary directory.
    const offenders = [...files].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => specifier.startsWith("node:"))
        .filter(() => file !== FILE_SYSTEM_MODULE)
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("never reaches a builtin around the import graph", () => {
    // Every check above reads import specifiers, so a builtin obtained without one is invisible to them. These
    // routes are forbidden in every module, the file-system one included: `baseline-file.ts` has a plain import
    // and needs no back door, and allowing one would make the single-module rule unenforceable.
    const offenders = [...files].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("detects the things it forbids, so passing these checks means something", () => {
    // Without a probe, a typo in any pattern above would let the check pass forever.
    const probe: SourceFiles = new Map([
      ["index.ts", "import { readFileSync } from 'node:fs';\nexport { x } from \"@pwa-platform/core\";\n"],
      ["baseline-file.ts", "import { readFileSync } from \"node:fs\";\n"],
      ["lazy.ts", "export const load = () => import(\"./other.js\");\n"],
      ["smuggler.ts", "const fs = process.getBuiltinModule(\"fs\");\n"],
    ]);

    // The exemption is per file, not per specifier: baseline-file.ts may import node: builtins, index.ts may not,
    // and neither may import another package. An exemption that only one of the two checks honoured would be
    // decorative — the allowed module could never pass both.
    expect([...probe].flatMap(([file, text]) => packageOffenders(file, text))).toEqual([
      "index.ts: node:fs",
      "index.ts: @pwa-platform/core",
    ]);

    const fsOffenders = [...probe].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => specifier.startsWith("node:"))
        .filter(() => file !== FILE_SYSTEM_MODULE)
        .map((specifier) => `${file}: ${specifier}`),
    );
    // baseline-file.ts is exempt; index.ts is not.
    expect(fsOffenders).toEqual(["index.ts: node:fs"]);

    expect([...probe].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file)).toEqual([
      "lazy.ts",
    ]);

    // The smuggled builtin carries no specifier at all, so it has to stay invisible to the three checks above and
    // be caught only by SMUGGLED — that is exactly why it is a separate check rather than another specifier rule.
    expect([...probe].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file)).toEqual(["smuggler.ts"]);
  });
});
