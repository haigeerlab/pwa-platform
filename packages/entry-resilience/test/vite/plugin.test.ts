// Real-build coverage for `pwaEntryResilience()`: everything in src/vite/options.ts is unit-tested in
// test/vite/options.test.ts without a build; everything here needs an actual `vite build` because it depends on
// the finished bundle (the recovery page's fingerprinted file name, the platform plugin's compiled plan) or on
// `configResolved`/`buildStart` running for real. Follows packages/vite/test/plan-api.test.ts's approach: a real
// build into a system temp directory, read back from disk afterwards.
//
// ADR-0033 (2026-09-23) removed the build-time seed, its signature verification and the private-key-material scan:
// the tests that used to cover an expired or unrecognized-key seed no longer apply and were removed along with them.
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy, PwaResourceRule } from "@pwa-platform/contracts";
import { pwa } from "@pwa-platform/vite";
import { build } from "vite";
import type { Logger, Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwaEntryResilience } from "../../src/vite/index.js";
import type { PwaEntryResilienceOptions } from "../../src/vite/index.js";

const APP_ROOT = fileURLToPath(new URL("../fixtures/app/", import.meta.url));
const APP_ID = "entryfixture";
const ENVIRONMENT = "production";

const IDENTITY: PwaIdentity = {
  appId: APP_ID,
  manifestId: "/app/",
  origin: "https://entryfixture.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: ENVIRONMENT,
  cacheNamespaceSeed: "r1",
};

const INSTALL: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Entry fixture",
  shortName: "Entry",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const BASE_RESOURCES: readonly PwaResourceRule[] = [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }];
/** The rule the spec's "构建集成" section requires for the build to succeed: without it, the recovery page is
 *  never precached and the plugin's own `writeBundle` check fails the build. */
const RECOVERY_PAGE_RESOURCE: PwaResourceRule = { pathPrefix: "/pwa-entry.html", resourceClass: "asset", cache: "cache-first" };

function policy(resources: readonly PwaResourceRule[]): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: true },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources,
  };
}

function entryOptions(overrides: Partial<PwaEntryResilienceOptions> = {}): PwaEntryResilienceOptions {
  return { identity: IDENTITY, ...overrides };
}

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pwa-entry-plugin-"));
  roots.push(dir);
  return dir;
}

type RunOptions = {
  readonly resources?: readonly PwaResourceRule[];
  readonly base?: string;
  readonly entryOptionOverrides?: Partial<PwaEntryResilienceOptions>;
  readonly includePlatformPlugin?: boolean;
};

async function runBuild({
  resources = [...BASE_RESOURCES, RECOVERY_PAGE_RESOURCE],
  base = IDENTITY.mountPath,
  entryOptionOverrides = {},
  includePlatformPlugin = true,
}: RunOptions): Promise<string> {
  const dir = outDir();
  const plugins: Plugin[] = [pwaEntryResilience(entryOptions(entryOptionOverrides))];
  if (includePlatformPlugin) {
    plugins.push(pwa({ identity: IDENTITY, policy: policy(resources), install: INSTALL, topology: { kind: "standalone-origin" } }));
  }
  await build({
    configFile: false,
    root: APP_ROOT,
    base,
    logLevel: "silent",
    build: { write: true, outDir: dir, emptyOutDir: true },
    plugins,
  });
  return dir;
}


/** Contents of `entry` (a path relative to the build's `app/`) and of every chunk it statically imports, transitively. */
function readStaticImportClosure(dir: string, entry: string): string[] {
  const seen = new Set<string>();
  const contents: string[] = [];
  const pending = [entry];
  while (pending.length > 0) {
    const relative = pending.pop() as string;
    if (seen.has(relative)) continue;
    seen.add(relative);
    const content = readFileSync(join(dir, relative), "utf-8");
    contents.push(content);
    for (const match of content.matchAll(/(?:from|import)\s*"(\.\/[^"]+)"/g)) {
      pending.push(join(relative, "..", match[1] as string));
    }
  }
  return contents;
}

describe("pwaEntryResilience: success path", () => {
  it("publishes pwa-entry.html and a fingerprinted recovery script, both precached", async () => {
    const dir = await runBuild({});

    const html = readFileSync(join(dir, "pwa-entry.html"), "utf-8");
    expect(html).toContain('<main id="pwa-entry"></main>');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).not.toContain("innerHTML");

    const scriptMatch = /<script type="module" src="\/app\/([^"]+)"><\/script>/.exec(html);
    expect(scriptMatch).not.toBeNull();
    const scriptRelativePath = scriptMatch?.[1];
    expect(scriptRelativePath).toBeDefined();
    // The page script and the chunks it statically imports: since the locale revision (spec "修订：恢复页的构建期
    // 语言与文案覆盖"), the copy travels in the virtual-config chunk, not in the page script itself.
    const closure = readStaticImportClosure(dir, scriptRelativePath as string);
    for (const content of closure) expect(content).not.toContain("innerHTML");
    expect(closure.some((content) => content.includes("当前没有可用的备用入口"))).toBe(true);
  });

  it("builds an app that imports virtual:pwa-entry-config, and its build output carries the configured maxValidityDays", async () => {
    const dir = await runBuild({ entryOptionOverrides: { maxValidityDays: 45 } });
    // The fixture app's own main chunk imports the virtual module's serialized config (test/fixtures/app/src/main.js),
    // but Vite hoists that shared config into its own chunk rather than inlining it into every importer — so the
    // value is looked for across the whole `assets/` output, not in one file assumed ahead of time to hold it.
    const assetFiles = readdirSync(join(dir, "assets"));
    expect(assetFiles.length).toBeGreaterThan(0);
    const matches = assetFiles.filter((file) => readFileSync(join(dir, "assets", file), "utf-8").includes("45"));
    expect(matches.length).toBeGreaterThan(0);
  });
});

/** Independently recomputes `sha256-<base64>` for `text` — deliberately not by importing src/vite/index.ts's own
 *  (unexported) hashing helper, so a bug shared between production code and the test could not hide from it. */
async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

/** A `vite` `Logger` that records every `this.info(...)` call's message instead of printing it — `logLevel:
 *  "silent"` (used by every other test in this file) would otherwise swallow exactly the messages this file's own
 *  new tests need to read. */
function captureInfoLogger(): { readonly logger: Logger; readonly messages: string[] } {
  const messages: string[] = [];
  const logger: Logger = {
    info: (message) => {
      messages.push(message);
    },
    warn: () => undefined,
    warnOnce: () => undefined,
    error: () => undefined,
    clearScreen: () => undefined,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
  return { logger, messages };
}

describe("pwaEntryResilience: default style and CSP hashes", () => {
  async function runBuildCapturingLogs(overrides: Partial<PwaEntryResilienceOptions> = {}): Promise<{
    readonly html: string;
    readonly messages: readonly string[];
  }> {
    const dir = outDir();
    const { logger, messages } = captureInfoLogger();
    await build({
      configFile: false,
      root: APP_ROOT,
      base: IDENTITY.mountPath,
      customLogger: logger,
      build: { write: true, outDir: dir, emptyOutDir: true },
      plugins: [
        pwaEntryResilience(entryOptions(overrides)),
        pwa({
          identity: IDENTITY,
          policy: policy([...BASE_RESOURCES, RECOVERY_PAGE_RESOURCE]),
          install: INSTALL,
          topology: { kind: "standalone-origin" },
        }),
      ],
    });
    return { html: readFileSync(join(dir, "pwa-entry.html"), "utf-8"), messages };
  }

  it("emits exactly one inline style block, and logs its sha256 hash, when no host css is given", async () => {
    const { html, messages } = await runBuildCapturingLogs();

    // Everything between the tags, leading newline included: that is the text a browser hashes for CSP.
    const styleMatches = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? "");
    expect(styleMatches).toHaveLength(1);
    // The style block sits before the script, per spec's "位于脚本之前", and the script remains external — not
    // inlined into the html by this change.
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("<script"));
    expect(html).toMatch(/<script type="module" src="[^"]+">/);

    const expectedHash = await sha256Base64(styleMatches[0] as string);
    expect(messages.some((message) => message.includes(expectedHash))).toBe(true);
  });

  it("appends host css verbatim after the default style, and logs a hash for each of the two blocks", async () => {
    const hostCss = '.pwa-entry__button { --pwa-entry-accent: #c8102e; }\n.custom { color: red; }';
    const { html, messages } = await runBuildCapturingLogs({ css: hostCss });

    // Everything between the tags, leading newline included: that is the text a browser hashes for CSP.
    const styleMatches = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? "");
    expect(styleMatches).toHaveLength(2);
    expect(styleMatches[1]).toBe(`\n${hostCss}`);
    expect(html.indexOf(styleMatches[0] as string)).toBeLessThan(html.indexOf(hostCss));

    const [defaultHash, hostHash] = await Promise.all([
      sha256Base64(styleMatches[0] as string),
      sha256Base64(styleMatches[1] as string),
    ]);
    expect(messages.some((message) => message.includes(defaultHash as string))).toBe(true);
    expect(messages.some((message) => message.includes(hostHash))).toBe(true);
  });
});

// spec/pwa-entry-resilience.md's "修订：恢复页的构建期语言与文案覆盖": lang and <title> only a real build can prove,
// since they are written by generateBundle's html shell, not by anything src/page/render.ts unit tests exercise.
describe("pwaEntryResilience: locale and messages (shell)", () => {
  it("defaults to lang=zh-CN and the built-in <title>备用入口</title>", async () => {
    const dir = await runBuild({});
    const html = readFileSync(join(dir, "pwa-entry.html"), "utf-8");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("<title>备用入口</title>");
  });

  it("uses lang=en and the en built-in <title> when locale: \"en\"", async () => {
    const dir = await runBuild({ entryOptionOverrides: { locale: "en" } });
    const html = readFileSync(join(dir, "pwa-entry.html"), "utf-8");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Alternative entry</title>");
  });

  it("uses an overridden documentTitle for <title>, HTML-escaped", async () => {
    const dir = await runBuild({
      entryOptionOverrides: { locale: "en", messages: { documentTitle: `Title & <fixture> "quote" 'apos'` } },
    });
    const html = readFileSync(join(dir, "pwa-entry.html"), "utf-8");
    expect(html).toContain("<title>Title &amp; &lt;fixture&gt; &quot;quote&quot; &#39;apos&#39;</title>");
    // The raw, unescaped value must not appear anywhere in the shell.
    expect(html).not.toContain(`Title & <fixture> "quote" 'apos'`);
  });

  it("fails the build with entry.locale-invalid for an unsupported locale", async () => {
    await expect(runBuild({ entryOptionOverrides: { locale: "fr" as never } })).rejects.toThrow(
      /entry\.locale-invalid/,
    );
  });

  it("fails the build with entry.message-invalid for an unknown messages key", async () => {
    await expect(
      runBuild({ entryOptionOverrides: { messages: { bogus: "x" } as never } }),
    ).rejects.toThrow(/entry\.message-invalid/);
  });
});

describe("pwaEntryResilience: build-time failures", () => {
  it("fails with entry.recovery-page-not-precached when the policy does not cover the recovery page", async () => {
    await expect(runBuild({ resources: BASE_RESOURCES })).rejects.toThrow(/entry\.recovery-page-not-precached/);
  });

  it("fails with entry.recovery-page-not-precached when the html is covered but its script is not", async () => {
    // No `/assets` rule at all: `pwa-entry.html` itself is precached, but the fingerprinted recovery page script
    // — which lands under `/app/assets/` like every other chunk — is not. A check that only confirms the html
    // page itself, and not its script closure, would miss this.
    await expect(runBuild({ resources: [RECOVERY_PAGE_RESOURCE] })).rejects.toThrow(/entry\.recovery-page-not-precached/);
  });

  it("fails with entry.platform-plugin-missing when pwa() is not among the plugins", async () => {
    await expect(runBuild({ includePlatformPlugin: false })).rejects.toThrow(/entry\.platform-plugin-missing/);
  });

  it("fails with entry.base-mismatch when base does not equal identity.mountPath", async () => {
    await expect(runBuild({ base: "/other/" })).rejects.toThrow(/entry\.base-mismatch/);
  });

  // Independent review finding (2026-09-17): the earlier build-time failure tests only ever covered the recovery
  // page's own html/script not being precached — never a chunk the recovery page script *imports* landing outside
  // the precached paths. `collectStaticImportClosure` walks that transitive graph; this proves it is actually
  // consulted, not merely that the entry chunk itself is checked.
  it("fails with entry.recovery-page-not-precached when a chunk the recovery page transitively imports lands outside /assets", async () => {
    const dir = outDir();
    type RecordedChunk = { readonly fileName: string; readonly isEntry: boolean; readonly facadeModuleId: string | null; readonly imports: readonly string[] };
    const chunks: RecordedChunk[] = [];
    // A bystander plugin: records every chunk's direct imports from the real Rollup output bundle (a richer shape
    // than this package's own minimal `BundleEntry` type), so the assertions below can confirm — independently of
    // whether the build ultimately fails — that the recovery page's own chunk really does import a chunk that
    // `chunkFileNames` below routes to `shared/`, outside the policy's precached `/assets` and `/pwa-entry.html`.
    const inspectPlugin: Plugin = {
      name: "test-inspect-transitive-import",
      writeBundle(_options, bundle) {
        for (const [fileName, entry] of Object.entries(bundle)) {
          if (entry.type === "chunk") {
            chunks.push({ fileName, isEntry: entry.isEntry, facadeModuleId: entry.facadeModuleId, imports: entry.imports });
          }
        }
      },
    };

    await expect(
      build({
        configFile: false,
        root: APP_ROOT,
        base: IDENTITY.mountPath,
        logLevel: "silent",
        build: {
          write: true,
          outDir: dir,
          emptyOutDir: true,
          // Vite 8 builds on Rolldown, where `chunkFileNames` (not `entryFileNames`) governs the file name of every
          // chunk, entry chunks emitted via `this.emitFile` included — so entry-ness must be branched on inside
          // `chunkFileNames` itself to keep every entry chunk (the recovery page's own script included) under
          // `assets/`, covered by BASE_RESOURCES' `/assets` rule, while only the *non-entry* (shared) chunk it
          // imports moves to `shared/`, which the policy below never precaches.
          rollupOptions: {
            output: {
              chunkFileNames: (chunk) => (chunk.isEntry ? "assets/[name]-[hash].js" : "shared/[name]-[hash].js"),
            },
          },
        },
        plugins: [
          inspectPlugin,
          pwaEntryResilience(entryOptions()),
          pwa({
            identity: IDENTITY,
            policy: policy([...BASE_RESOURCES, RECOVERY_PAGE_RESOURCE]),
            install: INSTALL,
            topology: { kind: "standalone-origin" },
          }),
        ],
      }),
    ).rejects.toThrow(/entry\.recovery-page-not-precached/);

    const recoveryPageChunk = chunks.find(
      (chunk) => chunk.isEntry && chunk.facadeModuleId !== null && chunk.facadeModuleId.includes("/page/main."),
    );
    expect(recoveryPageChunk).toBeDefined();
    // Confirms this test actually exercises a *transitive* (imported-by) dependency landing in `shared/`, not just
    // the recovery page's own script file name.
    expect(recoveryPageChunk?.imports.some((fileName) => fileName.startsWith("shared/"))).toBe(true);
  });
});
