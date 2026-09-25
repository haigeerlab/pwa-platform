// Modelled on packages/vue/test/package-boundaries.test.ts. Two differences from that package's version, both
// because this module has code that only runs in Node at Nuxt build time (src/index.ts, options.ts, client-config.ts)
// alongside code that ships to the browser (src/runtime/**):
//
// - The import-closure walk starts at src/index.ts, same as the other package's ENTRY, but src/runtime/plugin.ts
//   is not reachable that way: it is wired in by `addPlugin({ src: ... })`, a path string, not an ES import. A
//   second scan therefore checks every file under src/ (not just what index.ts's closure reaches) for package
//   imports outside the allowed set, so the runtime plugin is covered too.
// - No blanket "never reaches a Node builtin" check: unlike vue-react-adapters, this package legitimately has a
//   Node-side half (options.ts, client-config.ts, and — since T6 — artifacts.ts, which walks and writes files under
//   `nitro:build:public-assets`). Node builtins it actually uses are named in ALLOWED_PACKAGES below, same as any
//   other package specifier.
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

/** Package specifiers this package's source may use. `nuxt/kit` and `nuxt/schema` are subpaths of `nuxt`. */
const ALLOWED_PACKAGES = [
  "@pwa-platform/client-runtime",
  "@pwa-platform/contracts",
  "@pwa-platform/sw-runtime",
  "@pwa-platform/vite",
  "@pwa-platform/vue",
  // Added for artifacts.ts's streaming contentHash (评审第 3 项): hashing a public-dir file without reading the
  // whole thing into memory needs node:crypto's incremental Hash alongside node:fs's readdir/createReadStream.
  "node:crypto",
  "node:fs",
  "node:path",
  "nuxt",
  "vue",
];

const ENTRY = "index.ts";

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes exactly one entry, built from src/index.ts", () => {
    expect(manifest["exports"]).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    });
    expect(manifest["private"]).toBe(true);
    expect(manifest["files"]).toEqual(["dist"]);
  });

  it("depends on client-runtime, contracts, sw-runtime, vite and vue, with nuxt and vue as peers", () => {
    // sw-runtime (createPathMatcher, for the denied-prerendered-HTML check) and vite (buildPwaArtifacts /
    // assertPwaArtifacts, the artifact pipeline entry) were added in T6 — the only task approved to add them.
    expect(manifest["dependencies"]).toEqual({
      "@pwa-platform/client-runtime": "workspace:*",
      "@pwa-platform/contracts": "workspace:*",
      "@pwa-platform/sw-runtime": "workspace:*",
      "@pwa-platform/vite": "workspace:*",
      "@pwa-platform/vue": "workspace:*",
    });
    expect(manifest["peerDependencies"]).toEqual({
      nuxt: ">=4.5.0 <4.6.0",
      vue: "^3.5.0",
    });
  });

  it("has exactly build, test, test:browser and typecheck scripts", () => {
    // test:browser added by T7 (browser-tests/), mirroring every other package that ships a Playwright suite.
    const scripts = manifest["scripts"] as Record<string, unknown>;
    expect(Object.keys(scripts).sort()).toEqual(["build", "test", "test:browser", "typecheck"]);
  });
});

/** Dynamic module loading, which would let an import escape the closure walk below. */
const DYNAMIC_LOADING = /\bimport\s*\(|\brequire\s*\(/;

/**
 * Calls this package must never contain. The facade this module wraps promises never to reload the page and never
 * to touch cache storage (ADR-0013); this module's client-side plugin must not reintroduce either.
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

/** Resolved by this module's own Vite plugin (client-config.ts), not by Node/Vite package resolution. */
const VIRTUAL_MODULE = "virtual:pwa-platform/nuxt";

function isAllowed(specifier: string): boolean {
  return specifier === VIRTUAL_MODULE || ALLOWED_PACKAGES.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`));
}

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has a source file for the entry", () => {
    expect(files.has(ENTRY)).toBe(true);
  });

  it("keeps index.ts's own import closure within the allowed packages", () => {
    const reach = closure(ENTRY, files);
    const offenders = reach.packages.filter((line) => !isAllowed(line.slice(line.indexOf(": ") + 2)));
    expect(offenders).toEqual([]);
    expect(reach.unresolved).toEqual([]);
  });

  it("keeps every file under src/ within the allowed packages, including files addPlugin reaches by path", () => {
    // src/runtime/plugin.ts is wired in by addPlugin({ src: ... }) — a path string index.ts's own import
    // closure never walks — so this scans every file directly instead of relying on reachability from ENTRY.
    const offenders = [...files].flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => !specifier.startsWith("."))
        .filter((specifier) => !isAllowed(specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never reloads, navigates, polls or touches cache storage", () => {
    const offenders = [...files].flatMap(([file, text]) =>
      FORBIDDEN_CALLS.filter(([pattern]) => pattern.test(text)).map(([, label]) => `${file}: ${label}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    expect([...files].filter(([, text]) => DYNAMIC_LOADING.test(text)).map(([file]) => file)).toEqual([]);
  });

  it("the scans detect what they forbid, so passing them means something", () => {
    // Without this, a typo in any pattern above (a lost \b, a wrong character class) would make that scan pass
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
      ["store.ts", 'import type { PwaClient } from "@pwa-platform/client-runtime";\nexport const s = 1;\n'],
      ["helper.ts", "import 'node:zlib'\nimport { compilePlan } from '@pwa-platform/core';\nexport const helper = compilePlan;\n"],
    ]);
    const reach = closure("index.ts", probe);
    expect(reach.packages.filter((line) => !isAllowed(line.slice(line.indexOf(": ") + 2)))).toEqual([
      "helper.ts: node:zlib",
      "helper.ts: @pwa-platform/core",
    ]);
    expect(closure("index.ts", new Map([["index.ts", "import { x } from './missing.js';"]])).unresolved).toEqual([
      "index.ts: ./missing.js",
    ]);
  });
});
