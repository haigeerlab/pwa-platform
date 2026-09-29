import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The offline docs copy shipped inside @pwa-platform/vite (ADR-0045 addendum, 2026-09-29): generated from the pages
// SKILL.md cites, in `files`, never in `exports`.

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageDir, "..", "..");
const skillFile = join(packageDir, "skills", "pwa-onboarding", "SKILL.md");
const version = (JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { version: string }).version;

type Generator = { bundleDocs(options: { websiteDir: string; skillFile: string; outDir: string; version: string }): string[] };

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const cited = [...new Set([...readFileSync(skillFile, "utf8").matchAll(/https:\/\/pwa-platform-docs\.pages\.dev\/([a-z0-9-]+\/[a-z0-9-]+)\)/g)].map((match) => match[1]!))];

describe("bundled offline docs", () => {
  let outDir: string;
  let emitted: string[];

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), "bundle-docs-"));
    const generator = (await import(pathToFileURL(join(packageDir, "scripts", "bundle-docs.mjs")).href)) as Generator;
    emitted = generator.bundleDocs({ websiteDir: join(repoRoot, "website"), skillFile, outDir, version });
  });
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("emits every page SKILL.md cites, plus a README index", () => {
    expect(cited.length).toBeGreaterThan(0);
    expect([...emitted].sort()).toEqual([...cited].sort());
    for (const page of cited) expect(existsSync(join(outDir, `${page}.md`)), page).toBe(true);
    const readme = readFileSync(join(outDir, "README.md"), "utf8");
    for (const page of cited) expect(readme, page).toContain(`](./${page}.md)`);
  });

  it("leaves no site-relative link", () => {
    for (const file of listFiles(outDir)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("](/");
      expect(text, file).not.toContain('href="/');
    }
  });

  it("resolves every relative .md link to an emitted file", () => {
    for (const file of listFiles(outDir)) {
      for (const match of readFileSync(file, "utf8").matchAll(/\]\((?!https?:|#)([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        expect(existsSync(resolve(dirname(file), match[1]!)), `${file} -> ${match[1]}`).toBe(true);
      }
    }
  });

  it("points links to non-bundled pages at the online site", () => {
    const text = readFileSync(join(outDir, "start", "vue.md"), "utf8");
    expect(text).toContain("](https://pwa-platform-docs.pages.dev/guide/updates");
    expect(text).toContain("](choose.md)");
  });

  it("strips front matter and prepends a header naming the source, version and online URL", () => {
    for (const page of cited) {
      const text = readFileSync(join(outDir, `${page}.md`), "utf8");
      const [first = ""] = text.split("\n");
      expect(first, page).toBe(`<!-- Generated from website/${page}.md for @pwa-platform/vite@${version}. Online: https://pwa-platform-docs.pages.dev/${page} -->`);
      expect(text.split("\n").slice(1).join("\n").trimStart(), page).not.toMatch(/^---/);
      expect(text, page).not.toMatch(/^---\r?\n[a-z]+:/m);
    }
  });

  it("stays within 200 KB in total", () => {
    const total = listFiles(outDir).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(200 * 1024);
  });
});

describe("docs packaging", () => {
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { files?: string[]; exports?: unknown; scripts?: Record<string, string> };

  it("lists docs in files, never in exports, and builds them after tsc", () => {
    expect(pkg.files).toContain("docs");
    expect(JSON.stringify(pkg.exports)).not.toContain("docs");
    expect(pkg.scripts?.build).toContain("scripts/bundle-docs.mjs");
  });

  it("ships the generated docs in the packed tarball", () => {
    // The tarball must reflect a build: generate docs first (idempotent), then pack without running lifecycle scripts.
    execFileSync("node", ["scripts/bundle-docs.mjs"], { cwd: packageDir });
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: packageDir, encoding: "utf8" });
    const paths = ((JSON.parse(output) as Array<{ files: Array<{ path: string }> }>)[0]?.files ?? []).map((file) => file.path);
    expect(paths).toContain("docs/README.md");
    for (const page of cited) expect(paths, page).toContain(`docs/${page}.md`);
  }, 60_000);
});
