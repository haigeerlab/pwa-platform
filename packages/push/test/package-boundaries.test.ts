// Same technique as packages/sw-runtime/test/package-boundaries.test.ts: reads source through TypeScript's host
// (avoiding a Node-typings dependency this package does not otherwise need) and walks the relative-import closure
// of each export entry. T5 added `./server`; T6 adds `.` (the page entry) as a second row in ENTRIES below, per
// spec/push-module.md "设计 / 3": it must import no package at all, and no relative import outside src/client.
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

type Closure = {
  /** Source files reached through relative imports, starting with the entry. */
  readonly files: readonly string[];
  /** `file: specifier` for every package import in the closure. */
  readonly packages: readonly string[];
  /** `file: specifier` for relative imports that resolve to no source file. */
  readonly unresolved: readonly string[];
};

function closure(entry: string, files: SourceFiles): Closure {
  const reached: string[] = [];
  const packages: string[] = [];
  const unresolved: string[] = [];
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.shift() ?? "";
    if (reached.includes(file)) continue;
    reached.push(file);
    for (const specifier of specifiers(files.get(file) ?? "")) {
      if (!specifier.startsWith(".")) {
        packages.push(`${file}: ${specifier}`);
        continue;
      }
      const target = new URL(specifier, `file:///src/${file}`).pathname.slice("/src/".length).replace(/\.js$/, ".ts");
      if (files.has(target)) pending.push(target);
      else unresolved.push(`${file}: ${specifier}`);
    }
  }
  return { files: reached, packages, unresolved };
}

const ENTRIES: readonly { readonly name: string; readonly entry: string; readonly directory: string; readonly allowedPackages: readonly string[] }[] = [
  { name: "./server", entry: "server/index.ts", directory: "server/", allowedPackages: ["@pwa-platform/sw-runtime/push-payload"] },
  { name: ".", entry: "client/index.ts", directory: "client/", allowedPackages: [] },
];

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes exactly two entries: the page entry and the backend entry", () => {
    expect(manifest["exports"]).toEqual({
      ".": { types: "./dist/client/index.d.ts", import: "./dist/client/index.js" },
      "./server": { types: "./dist/server/index.d.ts", import: "./dist/server/index.js" },
    });
    expect(manifest["private"]).toBe(true);
    expect(manifest["files"]).toEqual(["dist"]);
    expect(manifest["sideEffects"]).toBe(false);
  });

  it("depends only on sw-runtime, as a workspace dependency, with no peer dependencies", () => {
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/sw-runtime": "workspace:*" });
    expect(manifest["peerDependencies"]).toBeUndefined();
  });

  it("declares devDependencies only for browser test tooling (typescript and vitest still come from the workspace root; T7 adds real-Chrome browser-tests/, which needs @playwright/test, the harness and @types/node for its node:crypto import)", () => {
    expect(manifest["devDependencies"]).toEqual({
      "@playwright/test": "1.63.0",
      "@pwa-platform/browser-test-harness": "workspace:*",
      "@types/node": "24.13.4",
    });
  });
});

describe.each(ENTRIES)("dependency boundaries: $name", ({ entry, directory, allowedPackages }) => {
  const files = sourceFiles();

  it("has a source file for the entry", () => {
    expect(files.has(entry)).toBe(true);
  });

  it(`imports only its allowed packages, and no relative import outside src/${directory}`, () => {
    const reach = closure(entry, files);
    const offenders = [
      ...reach.packages.filter((line) => !allowedPackages.includes(line.slice(line.indexOf(": ") + 2))).map((line) => `package ${line}`),
      ...reach.files.filter((file) => !file.startsWith(directory)).map((file) => `reaches ${file}`),
      ...reach.unresolved.map((line) => `unresolved ${line}`),
    ];
    expect(offenders).toEqual([]);
    // The closure reaches exactly the allowed package specifiers — not fewer, so this isn't vacuously satisfied by
    // an entry that imports nothing when it's supposed to import something.
    expect(reach.packages.map((line) => line.slice(line.indexOf(": ") + 2)).sort()).toEqual([...allowedPackages].sort());
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("detects a forbidden package import and a forbidden directory reach, so the boundary check above is not vacuous", () => {
    const probe: SourceFiles = new Map([
      [entry, `export { helper } from "./helper.js";\nimport "zod";\n`],
      [`${directory}helper.ts`, `export const helper = () => import("../other-entry-dir/index.js");\n`],
      ["other-entry-dir/index.ts", "export {};\n"],
    ]);
    const reach = closure(entry, probe);
    const offenders = [
      ...reach.packages.filter((line) => !allowedPackages.includes(line.slice(line.indexOf(": ") + 2))).map((line) => `package ${line}`),
      ...reach.files.filter((file) => !file.startsWith(directory)).map((file) => `reaches ${file}`),
      ...reach.unresolved.map((line) => `unresolved ${line}`),
    ];
    expect(offenders).toEqual([`package ${entry}: zod`, "reaches other-entry-dir/index.ts"]);
  });

  it("detects an unresolved relative import", () => {
    expect(closure(entry, new Map([[entry, "import { x } from './missing.js';"]])).unresolved).toEqual([`${entry}: ./missing.js`]);
  });
});

describe("src/server source scan: no browser or service-worker globals", () => {
  const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: "window", pattern: /\bwindow\b/ },
    { name: "document", pattern: /\bdocument\b/ },
    { name: "navigator", pattern: /\bnavigator\b/ },
    { name: "self", pattern: /\bself\b/ },
    { name: "fetch(", pattern: /\bfetch\s*\(/ },
  ];

  function serverSourceFiles(): readonly [string, string][] {
    return [...sourceFiles()].filter(([file]) => file.startsWith("server/"));
  }

  it("has source files to scan", () => {
    expect(serverSourceFiles().length).toBeGreaterThan(0);
  });

  it("contains none of the forbidden globals", () => {
    const offenders: string[] = [];
    for (const [file, text] of serverSourceFiles()) {
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects each forbidden global it claims to, so the check above means something", () => {
    const probes: Readonly<Record<string, string>> = {
      window: "const w = window;",
      document: "document.title = 'x';",
      navigator: "if (navigator.onLine) {}",
      self: "self.postMessage(1);",
      "fetch(": "await fetch('/x');",
    };
    for (const [label, snippet] of Object.entries(probes)) {
      const hit = FORBIDDEN.some(({ pattern }) => pattern.test(snippet));
      expect(hit, `expected the forbidden-global patterns to catch: ${label}`).toBe(true);
    }
  });
});
