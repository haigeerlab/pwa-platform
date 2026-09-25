import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Reads a file relative to this test (or an absolute path) through TypeScript's host, avoiding Node typings. */
function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

const PLAYWRIGHT_VERSION = "1.63.0";

describe("package manifest", () => {
  const manifest = JSON.parse(read("../package.json")) as Record<string, unknown>;

  it("publishes a single private entry with its fixtures", () => {
    expect(manifest["exports"]).toEqual({ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
    expect(manifest["private"]).toBe(true);
    // Loading the entry reads the environment and registers fixtures, so it must not claim to be side-effect free.
    expect(manifest["sideEffects"]).toBeUndefined();
    expect(manifest["files"]).toEqual(["dist", "fixtures"]);
  });

  it("depends only on contracts and one exactly pinned Playwright, with Node typings for development", () => {
    expect(manifest["dependencies"]).toEqual({ "@pwa-platform/contracts": "workspace:*" });
    expect(manifest["peerDependencies"]).toEqual({ "@playwright/test": PLAYWRIGHT_VERSION });
    expect(manifest["devDependencies"]).toEqual({ "@playwright/test": PLAYWRIGHT_VERSION, "@types/node": "24.13.4" });
  });

  it("runs unit tests with Vitest and browser self-tests with Playwright", () => {
    expect(manifest["scripts"]).toMatchObject({ test: "vitest run", "test:browser": "playwright test" });
  });
});

describe("dependency boundaries", () => {
  const srcDirectory = decodeURIComponent(new URL("../src/", import.meta.url).pathname);
  const sources = ts.sys.readDirectory(srcDirectory, [".ts"]).map((file) => ({
    name: file.slice(srcDirectory.length),
    text: read(file),
  }));

  it("imports only relative modules, contracts, Playwright Test and Node built-ins", () => {
    const allowed = (specifier: string): boolean =>
      specifier.startsWith(".") ||
      specifier === "@pwa-platform/contracts" ||
      specifier === "@playwright/test" ||
      specifier.startsWith("node:");
    const offenders = sources.flatMap(({ name, text }) =>
      [...text.matchAll(/^(?:import|export)\s+(?:type\s+)?(?:[^;=]*?from\s+)?"([^"]+)";/gm)]
        .map((match) => match[1] ?? "")
        .filter((specifier) => !allowed(specifier))
        .map((specifier) => `${name}: ${specifier}`),
    );
    expect(sources.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("never loads modules dynamically", () => {
    const offenders = sources.filter(({ text }) => /\bimport\s*\(|\brequire\s*\(/.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
