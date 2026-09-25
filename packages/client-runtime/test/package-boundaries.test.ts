import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

type Entry = {
  /** Source file of the entry, relative to `src/`. */
  readonly source: string;
  /** Package specifiers the entry's whole import closure may use. */
  readonly packages: readonly string[];
  /** `src/` directories the closure must never reach. */
  readonly forbidden: readonly string[];
};

const ENTRIES: Readonly<Record<string, Entry>> = {
  ".": {
    source: "client/index.ts",
    // The skip-waiting constant comes from sw-runtime's dependency-free messages entry, never from its worker entries.
    packages: ["@pwa-platform/contracts", "@pwa-platform/sw-runtime/messages"],
    forbidden: ["build/"],
  },
  "./build": { source: "build/index.ts", packages: ["@pwa-platform/contracts"], forbidden: ["client/"] },
};

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("exports exactly the two entries, each built from its source under dist", () => {
    const expected = Object.fromEntries(
      Object.entries(ENTRIES).map(([key, { source }]) => {
        const built = `./dist/${source.replace(/\.ts$/, "")}`;
        return [key, { types: `${built}.d.ts`, import: `${built}.js` }];
      }),
    );
    expect(manifest["exports"]).toEqual(expected);
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
  });

  it("depends only on contracts and sw-runtime from the workspace", () => {
    expect(manifest["dependencies"]).toEqual({
      "@pwa-platform/contracts": "workspace:*",
      "@pwa-platform/sw-runtime": "workspace:*",
    });
  });
});

/** Globals that only exist in a browser; the build-time entry runs in Node and must not reach them. */
const DOM_GLOBALS = /\b(navigator|window|document|localStorage)\b/g;

/** Dynamic module loading, which would let an import escape the closure walk below. */
const DYNAMIC_LOADING = /\bimport\s*\(|\brequire\s*\(/;

/**
 * Calls this package must never contain. ADR-0013 promises both properties, so the patterns have to cover the ways
 * they are ordinarily written, not just the one spelling that came to mind first.
 */
const FORBIDDEN_CALLS: readonly (readonly [RegExp, string])[] = [
  [/\blocation\s*\.\s*(reload|assign|replace)\s*\(/, "a page reload"],
  [/\blocation(\s*\.\s*href)?\s*=[^=]/, "an assignment to location"],
  [/\bhistory\s*\.\s*(go|back|forward|pushState|replaceState)\s*\(/, "a history navigation"],
  [/\bwindow\s*\.\s*open\s*\(/, "a new window"],
  [/\bcaches\b/, "the cache storage API"],
];

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

/** Everything in an entry's closure that breaks its boundary. */
function violations({ source, packages, forbidden }: Entry, files: SourceFiles): readonly string[] {
  const reach = closure(source, files);
  return [
    ...reach.packages.filter((line) => !packages.includes(line.slice(line.indexOf(": ") + 2))).map((line) => `package ${line}`),
    ...reach.files.filter((file) => forbidden.some((directory) => file.startsWith(directory))).map((file) => `reaches ${file}`),
    ...reach.unresolved.map((line) => `unresolved ${line}`),
  ];
}

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has a source file for every entry", () => {
    for (const { source } of Object.values(ENTRIES)) expect(files.has(source), source).toBe(true);
  });

  for (const [name, entry] of Object.entries(ENTRIES)) {
    it(`keeps the import closure of ${name} within its boundary`, () => {
      expect(violations(entry, files)).toEqual([]);
    });
  }

  it("never reaches a Node builtin", () => {
    const offenders = [...files].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => specifier.startsWith("node:"))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps DOM-only globals out of the build-time closure", () => {
    // The build-time entry runs in Node, so a stray `navigator`, `window` or `document` would only fail at runtime:
    // its tsconfig has no DOM lib, but these are also plain identifiers TypeScript cannot flag on its own here.
    const reached = closure(ENTRIES["./build"]?.source ?? "", files).files;
    const offenders = reached.flatMap((file) =>
      [...(files.get(file) ?? "").matchAll(DOM_GLOBALS)].map((match) => `${file}: ${match[1] ?? ""}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never reloads or navigates the page, and never touches the cache storage", () => {
    // The acceptance matrix forbids a global forced refresh: applying an update hands control to the new worker and
    // leaves reloading to the application. Logout unregisters only (ADR-0013), so `caches` has no place here either.
    // Scanned in the source rather than asserted per call, so a future edit cannot quietly introduce one.
    const offenders = [...files].flatMap(([file, text]) =>
      FORBIDDEN_CALLS.filter(([pattern]) => pattern.test(text)).map(([, label]) => `${file}: ${label}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => DYNAMIC_LOADING.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("the source scans detect what they forbid, so passing them means something", () => {
    // Without this, a typo in any pattern above (a lost `\b`, a wrong character class) would make that scan pass
    // forever. The import-closure check has its own probe below; these three had none.
    const samples: readonly (readonly [string, string])[] = [
      ["location.reload();", "a page reload"],
      ["location.assign('/x');", "a page reload"],
      ["window.location.replace('/x');", "a page reload"],
      ["window.location = '/x';", "an assignment to location"],
      ["document.location.href = '/x';", "an assignment to location"],
      ["history.go(0);", "a history navigation"],
      ["history.pushState({}, '', '/x');", "a history navigation"],
      ["window.open('/x');", "a new window"],
      ["await caches.open('pwa');", "the cache storage API"],
      ["await caches.delete(name);", "the cache storage API"],
    ];
    for (const [sample, label] of samples) {
      const hit = FORBIDDEN_CALLS.find(([pattern]) => pattern.test(sample));
      expect(hit?.[1], sample).toBe(label);
    }
    // And it must not fire on ordinary code that merely mentions a similar word.
    for (const innocent of ["const relocation = 1;", "// history of this module", "openTheDoor();"]) {
      expect(FORBIDDEN_CALLS.some(([pattern]) => pattern.test(innocent)), innocent).toBe(false);
    }

    for (const sample of ["const m = await import('./x.js');", "const fs = require('node:fs');"]) {
      expect(DYNAMIC_LOADING.test(sample), sample).toBe(true);
    }
    expect(DYNAMIC_LOADING.test("export const important = 1;")).toBe(false);

    for (const sample of ["navigator.userAgent", "window.scrollY", "document.title", "localStorage.getItem('k')"]) {
      expect(new RegExp(DOM_GLOBALS.source).test(sample), sample).toBe(true);
    }
    expect(new RegExp(DOM_GLOBALS.source).test("const documentation = 1;")).toBe(false);
  });

  it("detects forbidden imports however they are written, so the boundary checks are not vacuous", () => {
    const probe: SourceFiles = new Map([
      ["build/index.ts", "  import { config } from '../shared/config.js'\nexport { helper } from \"./helper.js\""],
      ["build/helper.ts", "import 'node:fs'\nexport const helper = () => import(\"../client/index.js\");\n"],
      ["shared/config.ts", 'import type { PwaPlan } from "@pwa-platform/contracts";\nexport const config = 1;\n'],
      ["client/index.ts", "export {};\n"],
    ]);
    // The closure is walked breadth-first, so shared/config.ts is visited before helper.ts.
    expect(violations({ source: "build/index.ts", packages: [], forbidden: ["client/"] }, probe)).toEqual([
      "package shared/config.ts: @pwa-platform/contracts",
      "package build/helper.ts: node:fs",
      "reaches client/index.ts",
    ]);
    expect(closure("build/index.ts", new Map([["build/index.ts", "import { x } from './missing.js';"]])).unresolved).toEqual([
      "build/index.ts: ./missing.js",
    ]);
  });
});
