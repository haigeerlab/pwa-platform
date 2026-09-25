import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

const WORKBOX_VERSION = "7.4.1";

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes exactly a build-time entry and a worker entry from dist", () => {
    expect(manifest["exports"]).toEqual({
      ".": { types: "./dist/build/index.d.ts", import: "./dist/build/index.js" },
      "./worker": { types: "./dist/worker/index.d.ts", import: "./dist/worker/index.js" },
    });
    expect(manifest["private"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist"]);
    // Workbox modules register version markers when loaded, so the package does not claim to be side-effect free.
    expect(manifest["sideEffects"]).toBeUndefined();
  });

  it("depends only on contracts and exactly pinned workbox packages", () => {
    expect(manifest["dependencies"]).toEqual({
      "@pwa-platform/contracts": "workspace:*",
      "workbox-core": WORKBOX_VERSION,
      "workbox-expiration": WORKBOX_VERSION,
      "workbox-precaching": WORKBOX_VERSION,
      "workbox-strategies": WORKBOX_VERSION,
    });
  });
});

type Source = { readonly name: string; readonly text: string };

function sources(directory: string): readonly Source[] {
  const root = decodeURIComponent(new URL(directory, import.meta.url).pathname);
  return ts.sys.readDirectory(root, [".ts"]).map((file) => ({ name: file.slice(root.length), text: read(file) }));
}

/** Specifiers of every import, export-from, dynamic import and require, as TypeScript's scanner reads them. */
function specifiers({ text }: Source): readonly string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName);
}

function offenders(files: readonly Source[], allowed: (specifier: string) => boolean): readonly string[] {
  return files.flatMap((file) => specifiers(file).filter((specifier) => !allowed(specifier)).map((specifier) => `${file.name}: ${specifier}`));
}

/** The build-time entry imports only its own relative modules (never worker sources) and contracts. */
const buildAllowed = (specifier: string): boolean =>
  (specifier.startsWith(".") && !specifier.includes("/worker/") && !specifier.startsWith("../worker")) ||
  specifier === "@pwa-platform/contracts";

/**
 * The worker entry imports only its own relative modules (never build sources) and the pinned Workbox runtime
 * packages it is allowed to use: workbox-precaching, workbox-core, workbox-strategies and workbox-expiration.
 */
const ALLOWED_WORKBOX_PACKAGES = ["workbox-precaching", "workbox-core", "workbox-strategies", "workbox-expiration"];
const workerAllowed = (specifier: string): boolean =>
  (specifier.startsWith(".") && !specifier.includes("/build/") && !specifier.startsWith("../build")) ||
  ALLOWED_WORKBOX_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));

/** Imports from and re-exports of Workbox packages, with the imported names, read from the syntax tree. */
function workboxBindings({ name, text }: Source): readonly string[] {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return file.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const from = statement.moduleSpecifier.text;
      if (!from.startsWith("workbox-")) return [];
      const bindings = statement.importClause?.namedBindings;
      const names =
        statement.importClause?.name === undefined && bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => (element.propertyName ?? element.name).text).join(", ")
          : "(default, namespace or side-effect import)";
      return [`${name}: {${names}} from ${from}`];
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
      const from = statement.moduleSpecifier.text;
      return from.startsWith("workbox-") ? [`${name}: re-export from ${from}`] : [];
    }
    return [];
  });
}

describe("dependency boundaries", () => {
  const build = sources("../src/build/");
  const worker = sources("../src/worker/");

  it("has sources on both sides", () => {
    expect(build.length).toBeGreaterThan(0);
    expect(worker.length).toBeGreaterThan(0);
  });

  it("keeps the build-time entry on contracts only, without Workbox, Node modules or worker sources", () => {
    expect(offenders(build, buildAllowed)).toEqual([]);
  });

  it("keeps the worker entry on workbox-precaching and workbox-core only, without Node modules or build sources", () => {
    expect(offenders(worker, workerAllowed)).toEqual([]);
  });

  it("uses only the approved Workbox bindings and never registers listeners, skips waiting or claims clients", () => {
    expect(worker.flatMap(workboxBindings).sort()).toEqual(
      [
        "engine.ts: {PrecacheController} from workbox-precaching",
        "runtime.ts: {ExpirationPlugin} from workbox-expiration",
        "runtime.ts: {NetworkFirst, StaleWhileRevalidate} from workbox-strategies",
        // Type-only: workbox-expiration@7.4.1's own .d.ts needs one explicit WorkboxPlugin cast, see runtime.ts.
        "runtime.ts: {WorkboxPlugin} from workbox-core/types.js",
      ].sort(),
    );
    const forbidden = /\b(addEventListener|skipWaiting|claim|precacheAndRoute|registerRoute|cleanupOutdatedCaches|navigationPreload)\b/;
    const offending = worker
      .flatMap(({ name, text }) => text.split("\n").map((line, index) => ({ name, line: index + 1, text: line })))
      .filter(({ text }) => !/^\s*(\/\/|\*|\/\*\*)/.test(text) && forbidden.test(text))
      .map(({ name, line, text }) => `${name}:${line}: ${text.trim()}`);
    expect(offending).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const dynamic = [...build, ...worker]
      .filter(({ text }) => /\bimport\s*\(|\brequire\s*\(/.test(text))
      .map(({ name }) => name);
    expect(dynamic).toEqual([]);
  });

  it("detects forbidden imports however they are written, so the boundary checks are not vacuous", () => {
    const probe: Source = {
      name: "probe.ts",
      text: [
        "import { readFile } from 'node:fs/promises'",
        '  import { precache as warm } from "workbox-precaching"',
        'import type { PwaPlan } from "@pwa-platform/contracts";',
        "export { x } from '../worker/index.js';",
        'import "../build/inject.js";',
        'export { PrecacheController } from "workbox-precaching";',
      ].join("\n"),
    };
    expect(offenders([probe], buildAllowed)).toEqual([
      "probe.ts: node:fs/promises",
      "probe.ts: workbox-precaching",
      "probe.ts: ../worker/index.js",
      "probe.ts: workbox-precaching",
    ]);
    expect(offenders([probe], workerAllowed)).toEqual([
      "probe.ts: node:fs/promises",
      "probe.ts: @pwa-platform/contracts",
      "probe.ts: ../build/inject.js",
    ]);
    expect(workboxBindings(probe)).toEqual([
      "probe.ts: {precache} from workbox-precaching",
      "probe.ts: re-export from workbox-precaching",
    ]);
  });
});
