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

/** Packages this build adapter may use: the six platform packages it wires together, plus Vite itself. */
const ALLOWED_PACKAGES = [
  "@pwa-platform/build-verifier",
  "@pwa-platform/client-runtime",
  "@pwa-platform/contracts",
  "@pwa-platform/core",
  "@pwa-platform/engine-workbox",
  "@pwa-platform/sw-runtime",
  "vite",
];

/**
 * Node builtins any module in this package may import. All three are pure: they transform values and touch
 * nothing. Reading and writing stays with the one module named below.
 */
const ALLOWED_BUILTINS = ["node:crypto", "node:path", "node:url"];

/**
 * The one module allowed to read from disk.
 *
 * The rule used to be that nothing in this package could touch the file system, on the grounds that Vite's bundle
 * was the single source of truth about a build. Measurement showed it is not: Vite copies `publicDir` into the
 * output verbatim at write time, so those files never appear in any hook — and an app's icons and offline page
 * usually live there. Holding the line would have made the plan describe a smaller build than the one that ships,
 * which is the very drift the rule existed to prevent. So the rule changed and the reason stayed (ADR-0015).
 *
 * Reading stays confined to this file, the way build-verifier confines it to `baseline-file.ts`: everything else
 * remains a pure function of what it is handed, which is what keeps the rest of the package testable without a
 * temporary directory.
 */
const FILE_SYSTEM_MODULE = "public-files.ts";

/** Ways to obtain a builtin without an import specifier, which the specifier-based checks below cannot see. */
const SMUGGLED = /\bprocess\s*\.\s*(?:getBuiltinModule|binding)\b|\bcreateRequire\b|\bModule\s*\.\s*_load\b/;

/**
 * Specifiers a source file must not use: anything that is neither relative, an allowed package, nor a builtin it
 * is allowed to import. The file-system exemption has to apply here as well as to the check below — exempting
 * only one of the two would leave the allowed module failing the other, and the exemption would be decorative.
 */
function offenders(file: string, text: string): readonly string[] {
  return specifiers(text)
    .filter((specifier) => !specifier.startsWith("."))
    .filter((specifier) => !isAllowedPackage(specifier))
    .filter((specifier) => !ALLOWED_BUILTINS.includes(specifier))
    .filter((specifier) => !(file === FILE_SYSTEM_MODULE && isFileSystem(specifier)))
    .map((specifier) => `${file}: ${specifier}`);
}

/**
 * An allowed package, or one of its subpath entries.
 *
 * These packages publish several entries on purpose — `client-runtime/build`, `sw-runtime/platform-worker-entry`,
 * `engine-workbox/worker` — and which one is right is exactly what the boundary is about. Matching the package and
 * letting the subpath through keeps this list about *which packages* may be used; listing each entry separately
 * would mean editing the guard every time an upstream package adds one, and the guard would lag behind.
 */
function isAllowedPackage(specifier: string): boolean {
  return ALLOWED_PACKAGES.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`));
}

function isFileSystem(specifier: string): boolean {
  return specifier === "node:fs" || specifier.startsWith("node:fs/");
}

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes a single entry built from src/index.ts", () => {
    expect(manifest["exports"]).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
    // Nothing in this package runs on import: the plugin is created by calling pwa().
    expect(manifest["sideEffects"]).toBe(false);
  });

  it("depends on the six platform packages and takes Vite as a peer", () => {
    expect(manifest["dependencies"]).toEqual({
      "@pwa-platform/build-verifier": "workspace:*",
      "@pwa-platform/client-runtime": "workspace:*",
      "@pwa-platform/contracts": "workspace:*",
      "@pwa-platform/core": "workspace:*",
      "@pwa-platform/engine-workbox": "workspace:*",
      "@pwa-platform/sw-runtime": "workspace:*",
    });
    // The host brings its own Vite; bundling a second copy would run two plugin pipelines against one build.
    expect(manifest["peerDependencies"]).toEqual({ vite: "^8.0.0" });
  });
});

describe("dependency boundaries", () => {
  const files = sourceFiles();

  it("has an entry module", () => {
    expect(files.has("index.ts")).toBe(true);
  });

  it("imports nothing outside the platform packages, Vite and two builtins", () => {
    expect([...files].flatMap(([file, text]) => offenders(file, text))).toEqual([]);
  });

  it("confines file system access to a single module", () => {
    // Only `public-files.ts` reads from disk, and only because Vite copies the public directory outside of any
    // hook. Everything else stays a pure function of what it is handed, which is what lets the rest of this
    // package be tested without a temporary directory.
    const fsUsers = [...files]
      .flatMap(([file, text]) => specifiers(text).map((specifier) => ({ file, specifier })))
      .filter(({ specifier }) => isFileSystem(specifier))
      .filter(({ file }) => file !== FILE_SYSTEM_MODULE)
      .map(({ file, specifier }) => `${file}: ${specifier}`);
    expect(fsUsers).toEqual([]);
  });

  it("keeps the exemption to one module, which does use it", () => {
    // An exemption nobody exercises is indistinguishable from a rule nobody needs. If the read ever moves, this
    // fails and whoever moved it has to say where the new boundary is.
    const exempt = files.get(FILE_SYSTEM_MODULE);
    expect(exempt, `${FILE_SYSTEM_MODULE} should exist`).toBeDefined();
    expect(specifiers(exempt ?? "").filter(isFileSystem)).not.toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...files].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file);
    expect(dynamic).toEqual([]);
  });

  it("never reaches a builtin around the import graph", () => {
    const smugglers = [...files].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file);
    expect(smugglers).toEqual([]);
  });

  it("detects the things it forbids, so passing these checks means something", () => {
    // Without a probe, a typo in any pattern above would let every check pass forever.
    const probe: SourceFiles = new Map([
      ["index.ts", "import { readFileSync } from 'node:fs';\nexport { x } from \"@pwa-platform/nope\";\n"],
      ["hash.ts", "import { createHash } from \"node:crypto\";\nimport { join } from \"node:path\";\n"],
      // A subpath of an allowed package is allowed; a subpath of an unknown one is not. Without both samples the
      // prefix match could be loosened to a bare `startsWith` and nothing here would notice.
      ["entries.ts", "import a from \"@pwa-platform/client-runtime/build\";\nimport b from \"@pwa-platform/sw-runtime/platform-worker-entry\";\n"],
      ["stranger.ts", "import x from \"@pwa-platform/nope/build\";\n"],
      ["lazy.ts", "export const load = () => import(\"./other.js\");\n"],
      ["smuggler.ts", "const fs = process.getBuiltinModule(\"fs\");\n"],
      ["reader.ts", "import { readFile } from \"node:fs/promises\";\n"],
      [FILE_SYSTEM_MODULE, "import { readdirSync } from \"node:fs\";\nimport { join } from \"node:path\";\n"],
    ]);

    // The exemption is per file, not per specifier: public-files.ts may read from disk, index.ts may not, and
    // neither may import an unknown package. Exempting only one of the two checks would leave the allowed module
    // failing the other, so both are asserted against the same probe.
    expect([...probe].flatMap(([file, text]) => offenders(file, text))).toEqual([
      "index.ts: node:fs",
      "index.ts: @pwa-platform/nope",
      "stranger.ts: @pwa-platform/nope/build",
      "reader.ts: node:fs/promises",
    ]);

    const fsUsers = [...probe]
      .flatMap(([file, text]) => specifiers(text).map((specifier) => ({ file, specifier })))
      .filter(({ specifier }) => isFileSystem(specifier))
      .filter(({ file }) => file !== FILE_SYSTEM_MODULE)
      .map(({ file, specifier }) => `${file}: ${specifier}`);
    expect(fsUsers).toEqual(["index.ts: node:fs", "reader.ts: node:fs/promises"]);

    expect([...probe].filter(([, text]) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(([file]) => file)).toEqual([
      "lazy.ts",
    ]);

    // The smuggled builtin carries no specifier at all, so it stays invisible to the three checks above and is
    // caught only by SMUGGLED — which is why that is a separate check rather than another specifier rule.
    expect([...probe].filter(([, text]) => SMUGGLED.test(text)).map(([file]) => file)).toEqual(["smuggler.ts"]);
  });
});

describe("public surface", () => {
  it("exports the factory, the artifact pipeline entry, and their types, and nothing from upstream", () => {
    const entry = read("../src/index.ts");
    const exported = [...entry.matchAll(/^export (?:function|const|type|interface) (\w+)/gm)].map(([, name]) => name);
    const reExportedTypes = [...entry.matchAll(/^export type \{([^}]*)\}/gm)].flatMap(([, names]) =>
      (names ?? "").split(",").map((name) => name.trim()).filter(Boolean),
    );
    // buildPwaArtifacts and assertPwaArtifacts are values re-exported from artifacts.ts (`export { ... } from`),
    // a shape the two checks above cannot see: one requires "type" in the specifier, the other a direct
    // declaration. Matching it here is what makes this test see artifacts.ts's functions at all.
    const reExportedValues = [...entry.matchAll(/^export \{([^}]*)\} from/gm)].flatMap(([, names]) =>
      (names ?? "").split(",").map((name) => name.trim()).filter(Boolean),
    );
    expect([...exported, ...reExportedTypes, ...reExportedValues].sort()).toEqual([
      "PWA_PLUGIN_NAME",
      "PwaArtifactInput",
      "PwaArtifactOutputFile",
      "PwaArtifactResult",
      "PwaArtifactSourceFile",
      "PwaOfflinePageLocale",
      "PwaOfflinePageMessages",
      "PwaPluginApi",
      "PwaViteOfflinePageOptions",
      "PwaViteOptions",
      "assertPwaArtifacts",
      "buildPwaArtifacts",
      "pwa",
    ]);
  });
});
