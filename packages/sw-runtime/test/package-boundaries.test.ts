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
  ".": { source: "build/index.ts", packages: ["@pwa-platform/contracts"], forbidden: ["worker/", "recovery-worker/", "entries/"] },
  "./worker": { source: "worker/index.ts", packages: ["@pwa-platform/engine-workbox/worker"], forbidden: ["build/", "recovery-worker/", "entries/"] },
  "./recovery-worker": { source: "recovery-worker/index.ts", packages: [], forbidden: ["build/", "worker/", "entries/"] },
  "./messages": { source: "messages/index.ts", packages: [], forbidden: ["build/", "worker/", "recovery-worker/", "entries/", "shared/"] },
  "./push-payload": {
    source: "push-payload/index.ts",
    packages: [],
    forbidden: ["build/", "worker/", "recovery-worker/", "entries/", "shared/", "messages/"],
  },
  "./platform-worker-entry": {
    source: "entries/platform-worker-entry.ts",
    packages: ["@pwa-platform/engine-workbox/worker"],
    forbidden: ["build/", "recovery-worker/"],
  },
  "./recovery-worker-entry": { source: "entries/recovery-worker-entry.ts", packages: [], forbidden: ["build/", "worker/"] },
};

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("exports exactly the seven entries, each built from its source under dist", () => {
    const expected = Object.fromEntries(
      Object.entries(ENTRIES).map(([key, { source }]) => {
        const built = `./dist/${source.replace(/\.ts$/, "")}`;
        return [key, { types: `${built}.d.ts`, import: `${built}.js` }];
      }),
    );
    expect(manifest["exports"]).toEqual(expected);
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
    // The worker entry scripts register listeners when evaluated, so the package is not side-effect free.
    expect(manifest["sideEffects"]).toBeUndefined();
  });

  it("depends only on contracts and engine-workbox from the workspace", () => {
    expect(manifest["dependencies"]).toEqual({
      "@pwa-platform/contracts": "workspace:*",
      "@pwa-platform/engine-workbox": "workspace:*",
    });
  });
});

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

  it("keeps src/shared free of package imports and of code from other entries", () => {
    // Both workers and the build entry share these modules, so they must run anywhere and pull in nothing.
    const shared = [...files].filter(([file]) => file.startsWith("shared/"));
    expect(shared.length).toBeGreaterThan(0);
    const offenders = shared.flatMap(([file, text]) =>
      specifiers(text)
        .filter((specifier) => !specifier.startsWith(".") || !new URL(specifier, `file:///src/${file}`).pathname.startsWith("/src/shared/"))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("detects forbidden imports however they are written, so the boundary checks are not vacuous", () => {
    const probe: SourceFiles = new Map([
      ["recovery-worker/index.ts", "  import { config } from '../shared/config.js'\nexport { helper } from \"./helper.js\""],
      ["recovery-worker/helper.ts", "import 'workbox-core'\nexport const helper = () => import(\"../worker/index.js\");\n"],
      ["shared/config.ts", 'import type { PwaPlan } from "@pwa-platform/contracts";\nexport const config = 1;\n'],
      ["worker/index.ts", "export {};\n"],
    ]);
    // The closure is walked breadth-first, so shared/config.ts is visited before helper.ts.
    expect(violations({ source: "recovery-worker/index.ts", packages: [], forbidden: ["worker/"] }, probe)).toEqual([
      "package shared/config.ts: @pwa-platform/contracts",
      "package recovery-worker/helper.ts: workbox-core",
      "reaches worker/index.ts",
    ]);
    expect(closure("recovery-worker/index.ts", new Map([["recovery-worker/index.ts", "import { x } from './missing.js';"]])).unresolved).toEqual([
      "recovery-worker/index.ts: ./missing.js",
    ]);
  });
});
