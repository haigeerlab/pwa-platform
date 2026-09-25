import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AbsolutePath, PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";

// These exercise the "构建时注入 manifest 链接" revision end to end: a real Vite build, real HTML output. The pure
// parsing and comparison logic has its own unit tests in manifest-link.test.ts; what only a build can show is that
// the hook actually runs for every HTML entry, that Vite's own tag serialisation matches what the tests expect, and
// that a rejection here really does fail the build.

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function makeIdentity(base: AbsolutePath): PwaIdentity {
  return {
    appId: "storefront",
    manifestId: base,
    origin: "https://shop.example.com",
    scope: base,
    serviceWorkerUrl: `${base}sw.js`,
    manifestUrl: `${base}manifest.webmanifest`,
    mountPath: base,
    environment: "production",
    cacheNamespaceSeed: "r1",
  };
}

function makeInstall(base: AbsolutePath): PwaInstallMetadata {
  return {
    startUrl: `${base}home`,
    display: "standalone",
    name: "Storefront",
    shortName: "Shop",
    themeColor: "#0b5fff",
    backgroundColor: "#ffffff",
    icons: [
      { src: `${base}icons/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}icons/192-maskable.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${base}icons/512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}icons/512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

/** A minimal app root with the given HTML entries (path relative to root -> content) and a worker in `public/`. */
function app(htmlFiles: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-vite-manifest-link-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  for (const [path, content] of Object.entries(htmlFiles)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "public/sw.js"), "self.addEventListener('install', () => {});\n");
  return root;
}

const SCRIPT_TAG = '<script type="module" src="/src/main.js"></script>';

/** A page with no manifest link, so the plugin has to inject one. */
function pageWithoutLink(): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${SCRIPT_TAG}</body></html>\n`;
}

/** A page with a hand-written link, at whatever `href` the caller wants to test. */
function pageWithLink(href: string): string {
  return `<!doctype html><html><head><link rel="manifest" href="${href}"></head><body>${SCRIPT_TAG}</body></html>\n`;
}

/** A page with two manifest links — always a build failure, regardless of what either points at. */
function pageWithTwoLinks(): string {
  return (
    `<!doctype html><html><head><link rel="manifest" href="a.webmanifest">` +
    `<link rel="manifest" href="b.webmanifest"></head><body>${SCRIPT_TAG}</body></html>\n`
  );
}

async function runBuild(
  root: string,
  base: AbsolutePath,
  input: Record<string, string>,
  laterPlugins: readonly Plugin[] = [],
): Promise<void> {
  await build({
    configFile: false,
    root,
    base,
    logLevel: "silent",
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true, rollupOptions: { input } },
    plugins: [
      pwa({
        identity: makeIdentity(base),
        policy,
        install: makeInstall(base),
        topology: { kind: "standalone-origin" },
      }),
      ...laterPlugins,
    ],
  });
}

/** Counts `<link rel="manifest" ...>` elements in `html`, independent of the plugin's own parsing. */
function countManifestLinks(html: string): number {
  return [...html.matchAll(/<link\b[^>]*>/gi)].filter((tag) => /rel\s*=\s*"manifest"/i.test(tag[0])).length;
}

describe("manifest link injection in a real build", () => {
  it("injects exactly one link with the identity's manifestUrl when the page has none", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithoutLink() });
    await runBuild(root, base, { main: "index.html" });
    const html = readFileSync(join(root, "dist/index.html"), "utf8");
    expect(countManifestLinks(html)).toBe(1);
    expect(html).toContain('<link rel="manifest" href="/app/manifest.webmanifest">');
  });

  it("does not duplicate a hand-written exact root-path link", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithLink("/app/manifest.webmanifest") });
    await runBuild(root, base, { main: "index.html" });
    const html = readFileSync(join(root, "dist/index.html"), "utf8");
    expect(countManifestLinks(html)).toBe(1);
    expect(html).toContain('<link rel="manifest" href="/app/manifest.webmanifest">');
  });

  it("fails the build for a relative hand-written link", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithLink("manifest.webmanifest") });
    await expect(runBuild(root, base, { main: "index.html" })).rejects.toThrow(/pwa-platform:/);
  });

  it("fails when a post-order plugin adds a second manifest link", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithoutLink() });
    const latePlugin: Plugin = {
      name: "late-manifest-link",
      transformIndexHtml: {
        order: "post",
        handler: () => [{ tag: "link", attrs: { rel: "manifest", href: "/other.webmanifest" }, injectTo: "head" }],
      },
    };
    await expect(runBuild(root, base, { main: "index.html" }, [latePlugin])).rejects.toThrow(
      /possibly injected by another plugin/,
    );
  });

  it("does not inspect HTML assets that were not Vite HTML entries", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithoutLink() });
    const recoveryPagePlugin: Plugin = {
      name: "emit-recovery-page",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "pwa-entry.html",
          source: '<!doctype html><main id="pwa-entry"></main>',
        });
      },
    };
    await expect(runBuild(root, base, { main: "index.html" }, [recoveryPagePlugin])).resolves.toBeUndefined();
  });

  it("fails the build when the existing link points somewhere else", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithLink("wrong.webmanifest") });
    await expect(runBuild(root, base, { main: "index.html" })).rejects.toThrow(/pwa-platform:.*does not match this build/);
  });

  it("fails the build when the page has more than one manifest link", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithTwoLinks() });
    await expect(runBuild(root, base, { main: "index.html" })).rejects.toThrow(/more than one manifest link/);
  });

  it("never echoes the href or an identity value in a mismatch build failure", async () => {
    const base = "/app/";
    const root = app({ "index.html": pageWithLink("/private-legacy-manifest.webmanifest") });
    await expect(runBuild(root, base, { main: "index.html" })).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return (
        !message.includes("/private-legacy-manifest.webmanifest") &&
        !message.includes(makeIdentity(base).manifestUrl) &&
        !message.includes(makeIdentity(base).origin)
      );
    });
  });

  it("injects the link on every page of a multi-page app", async () => {
    const base = "/app/";
    const root = app({
      "index.html": pageWithoutLink(),
      "admin/index.html": pageWithoutLink(),
    });
    await runBuild(root, base, { main: "index.html", admin: "admin/index.html" });
    const mainHtml = readFileSync(join(root, "dist/index.html"), "utf8");
    const adminHtml = readFileSync(join(root, "dist/admin/index.html"), "utf8");
    expect(countManifestLinks(mainHtml)).toBe(1);
    expect(countManifestLinks(adminHtml)).toBe(1);
    expect(mainHtml).toContain('<link rel="manifest" href="/app/manifest.webmanifest">');
    expect(adminHtml).toContain('<link rel="manifest" href="/app/manifest.webmanifest">');
  });

  it("injects an address under a sub-path base", async () => {
    const base = "/admin/";
    const root = app({ "index.html": pageWithoutLink() });
    await runBuild(root, base, { main: "index.html" });
    const html = readFileSync(join(root, "dist/index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/admin/manifest.webmanifest">');
  });
});
