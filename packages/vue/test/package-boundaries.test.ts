import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

/** Package specifiers this package's whole import closure may use. */
const ALLOWED_PACKAGES = ["@pwa-platform/client-runtime", "vue"];

const ENTRY = "index.ts";

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("keeps the root entry separate from the opt-in UI and stylesheet", () => {
    expect(manifest["exports"]).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./ui": { types: "./dist/ui.d.ts", import: "./dist/ui.js" },
      "./update-notice.css": "./dist/update-notice.css",
    });
    expect(manifest["sideEffects"]).toEqual(["./dist/update-notice.css"]);
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
  });

  it("depends on client-runtime only, with vue as a peer", () => {
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/client-runtime": "workspace:*" });
    expect(manifest["peerDependencies"]).toEqual({ vue: "^3.4.0" });
  });

  it("has no browser test script, because real-browser verification belongs to examples-browser-e2e", () => {
    const scripts = manifest["scripts"] as Record<string, unknown>;
    expect(Object.keys(scripts).sort()).toEqual(["build", "test", "typecheck"]);
  });
});

/** Dynamic module loading, which would let an import escape the closure walk below. */
const DYNAMIC_LOADING = /\bimport\s*\(|\brequire\s*\(/;

/**
 * Calls this package must never contain. The facade promises never to reload the page and never to touch cache
 * storage (ADR-0013); an adapter sitting on top of it must not reintroduce either.
 */
const FORBIDDEN_CALLS: readonly (readonly [RegExp, string])[] = [
  [/\blocation\s*\.\s*(reload|assign|replace)\s*\(/, "a page reload"],
  [/\blocation(\s*\.\s*href)?\s*=[^=]/, "an assignment to location"],
  [/\bhistory\s*\.\s*(go|back|forward|pushState|replaceState)\s*\(/, "a history navigation"],
  [/\bwindow\s*\.\s*open\s*\(/, "a new window"],
  [/\bcaches\b/, "the cache storage API"],
  [/\bsetInterval\s*\(/, "polling"],
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

function isAllowed(specifier: string): boolean {
  return ALLOWED_PACKAGES.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`));
}

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has a source file for the entry", () => {
    expect(files.has(ENTRY)).toBe(true);
  });

  it("keeps the import closure within client-runtime and vue", () => {
    const reach = closure(ENTRY, files);
    const offenders = reach.packages.filter((line) => !isAllowed(line.slice(line.indexOf(": ") + 2)));
    expect(offenders).toEqual([]);
    expect(reach.unresolved).toEqual([]);
    expect(reach.files).not.toContain("ui.ts");
  });

  it("never reaches a Node builtin", () => {
    // This package ships to the browser with the application; a Node import would break the bundle, not the build.
    const offenders = [...files].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => specifier.startsWith("node:"))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never reaches the vite adapter", () => {
    // `pwa()` is Node build-time code. A framework package that imported it would drag the build pipeline into the
    // browser bundle — the reason the capability map's "Vite 接入入口" was dropped from this module.
    const offenders = [...files].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => specifier.startsWith("@pwa-platform/vite"))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps facade code free of reloads and every source free of navigation, polling and cache storage", () => {
    const offenders = [...files].flatMap(([file, text]) =>
      FORBIDDEN_CALLS.filter(([pattern, label]) => !(file === "ui.ts" && label === "a page reload") && pattern.test(text))
        .map(([, label]) => `${file}: ${label}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    expect([...files].filter(([, text]) => DYNAMIC_LOADING.test(text)).map(([file]) => file)).toEqual([]);
  });

  it("the scans detect what they forbid, so passing them means something", () => {
    // Without this, a typo in any pattern above (a lost `\b`, a wrong character class) would make that scan pass
    // forever — a guard that cannot fail is worse than no guard, because it reads like coverage.
    const samples: readonly (readonly [string, string])[] = [
      ["location.reload();", "a page reload"],
      ["window.location.replace('/x');", "a page reload"],
      ["window.location = '/x';", "an assignment to location"],
      ["history.pushState({}, '', '/x');", "a history navigation"],
      ["window.open('/x');", "a new window"],
      ["await caches.open('pwa');", "the cache storage API"],
      ["setInterval(check, 1000);", "polling"],
    ];
    for (const [sample, label] of samples) {
      expect(FORBIDDEN_CALLS.find(([pattern]) => pattern.test(sample))?.[1], sample).toBe(label);
    }
    for (const innocent of ["const relocation = 1;", "// history of this module", "openTheDoor();"]) {
      expect(FORBIDDEN_CALLS.some(([pattern]) => pattern.test(innocent)), innocent).toBe(false);
    }

    for (const sample of ["const m = await import('./x.js');", "const fs = require('node:fs');"]) {
      expect(DYNAMIC_LOADING.test(sample), sample).toBe(true);
    }
    expect(DYNAMIC_LOADING.test("export const important = 1;")).toBe(false);
  });

  it("detects forbidden imports however they are written, so the closure walk is not vacuous", () => {
    const probe: SourceFiles = new Map([
      ["index.ts", "  import { s } from './store.js'\nexport { helper } from \"./helper.js\""],
      ["store.ts", 'import type { PwaClientEvent } from "@pwa-platform/client-runtime";\nexport const s = 1;\n'],
      ["helper.ts", "import 'node:fs'\nimport { pwa } from '@pwa-platform/vite';\nexport const helper = pwa;\n"],
    ]);
    const reach = closure("index.ts", probe);
    expect(reach.packages.filter((line) => !isAllowed(line.slice(line.indexOf(": ") + 2)))).toEqual([
      "helper.ts: node:fs",
      "helper.ts: @pwa-platform/vite",
    ]);
    expect(closure("index.ts", new Map([["index.ts", "import { x } from './missing.js';"]])).unresolved).toEqual([
      "index.ts: ./missing.js",
    ]);
  });
});
