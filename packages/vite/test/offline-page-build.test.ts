import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { build, type Logger, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { PWA_PLUGIN_NAME, pwa, type PwaPluginApi, type PwaViteOfflinePageOptions } from "../src/index.js";

// spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通过）" -> "测试策略增量"'s "构建" bullet: OP3's
// build-level tests. Rendering itself (built-in copy, escaping, CSP hashes) is offline-page.test.ts's job; option
// validation (diagnostic codes) is options.test.ts's job. This file is only "does a real Vite build wire the two
// together the way the spec requires": the page lands at the resolved offlineFallback path, enters the compiled
// plan's precache, both conflict sources fail the build, and leaving the option unset changes nothing.

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const identity: PwaIdentity = {
  appId: "storefront",
  manifestId: "/app/",
  origin: "https://shop.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const install: PwaInstallMetadata = {
  startUrl: "/app/home",
  display: "standalone",
  name: "Storefront",
  shortName: "Shop",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

function policy(offlineFallback: PwaPolicy["offlineFallback"]): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: true },
    offlineFallback,
    updateMode: "prompt",
    resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
  };
}

const FALLBACK_ENABLED: PwaPolicy["offlineFallback"] = { enabled: true, path: "/offline.html" };
const FALLBACK_DISABLED: PwaPolicy["offlineFallback"] = { enabled: false };

/** A minimal app; `publicFiles` land in the public directory Vite copies verbatim, `htmlEntries` become additional
 *  Rollup inputs (used to build a bundle-output conflict at an exact path). */
function app(publicFiles: Record<string, string> = {}, htmlEntries: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-vite-offline-page-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  for (const [path, content] of Object.entries(htmlEntries)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }

  const files = { "sw.js": "self.addEventListener('install', () => {});\n", ...publicFiles };
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, "public", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Captures Vite's own `logger.info` calls, which `logLevel: "silent"` (used by every other test in this package)
 *  would otherwise swallow — exactly the messages the CSP-hash tests below need to read. Mirrors
 *  packages/entry-resilience/test/vite/plugin.test.ts's `captureInfoLogger`. */
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

/** Same lookup plan-api.test.ts uses: finds the platform plugin's exposed api by name, off the resolved config,
 *  rather than by holding on to the object `pwa()` returned. */
function apiLookupPlugin(sink: { api: PwaPluginApi | undefined }): Plugin {
  return {
    name: "api-lookup",
    apply: "build",
    configResolved(config) {
      const found = config.plugins.find((candidate) => candidate.name === PWA_PLUGIN_NAME);
      sink.api = found?.api as PwaPluginApi | undefined;
    },
  };
}

async function runBuild(
  root: string,
  offlineFallback: PwaPolicy["offlineFallback"],
  offlinePage: PwaViteOfflinePageOptions | undefined,
  options: { readonly rollupInput?: Record<string, string>; readonly logger?: Logger } = {},
): Promise<{ readonly plan: PwaPlan }> {
  const sink: { api: PwaPluginApi | undefined } = { api: undefined };
  let plan: PwaPlan | null = null;
  await build({
    configFile: false,
    root,
    base: "/app/",
    ...(options.logger === undefined ? { logLevel: "silent" } : { customLogger: options.logger }),
    build: {
      write: true,
      outDir: join(root, "dist"),
      emptyOutDir: true,
      ...(options.rollupInput !== undefined ? { rollupOptions: { input: options.rollupInput } } : {}),
    },
    plugins: [
      apiLookupPlugin(sink),
      pwa({
        identity,
        policy: policy(offlineFallback),
        install,
        topology: { kind: "standalone-origin" },
        ...(offlinePage !== undefined ? { offlinePage } : {}),
      }),
      {
        name: "read-plan",
        apply: "build",
        writeBundle() {
          plan = sink.api?.getPlan() ?? null;
        },
      },
    ],
  });
  return { plan: plan as unknown as PwaPlan };
}

describe("the default offline page inside a real build", () => {
  it("emits the page at offlineFallback.path's resolved output, in the chosen locale, with built-in zh-CN copy", async () => {
    const root = app();
    await runBuild(root, FALLBACK_ENABLED, {});
    const html = readFileSync(join(root, "dist/offline.html"), "utf8");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("<title>离线</title>");
    expect(html).toContain('<h1 class="pwa-offline__heading">当前处于离线状态</h1>');
    expect(html).toContain('<p class="pwa-offline__app">Storefront</p>');
  });

  it("uses the en locale and a messages override together", async () => {
    const root = app();
    await runBuild(root, FALLBACK_ENABLED, { locale: "en", messages: { heading: "Custom heading" } });
    const html = readFileSync(join(root, "dist/offline.html"), "utf8");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1 class="pwa-offline__heading">Custom heading</h1>');
    // Every other en message stays the built-in copy: a partial override replaces only the given key.
    expect(html).toContain("<title>Offline</title>");
  });

  it("enters the compiled plan's precache at the resolved offline-fallback URL", async () => {
    const root = app();
    const { plan } = await runBuild(root, FALLBACK_ENABLED, {});
    expect(plan.offlineFallback).toEqual({ enabled: true, path: "/app/offline.html" });
    expect(plan.precache.some((entry) => entry.url === "/app/offline.html")).toBe(true);
  });

  it("places a page in a sub-directory where core's compiler resolves it (verdict parity with compilePlan)", async () => {
    // Core judges where the page belongs: if the plugin put it anywhere else, compilePlan would fail the build with
    // compile.offline-fallback-not-built before the plan below could exist.
    const root = app();
    const { plan } = await runBuild(root, { enabled: true, path: "/pages/offline.html" }, {});
    expect(readFileSync(join(root, "dist/pages/offline.html"), "utf8")).toContain('class="pwa-offline"');
    expect(plan.offlineFallback).toEqual({ enabled: true, path: "/app/pages/offline.html" });
    expect(plan.precache.some((entry) => entry.url === "/app/pages/offline.html")).toBe(true);
  });

  it("logs the three CSP hashes via this.info, none of them when css is not given beyond the default style", async () => {
    const root = app();
    const { logger, messages } = captureInfoLogger();
    await runBuild(root, FALLBACK_ENABLED, {}, { logger });
    // Vite prefixes a plugin's `this.info` messages with `[plugin <name>] ` when relayed through the logger.
    expect(messages.some((m) => m.includes("offline.html style (default): sha256-"))).toBe(true);
    expect(messages.some((m) => m.includes("offline.html script: sha256-"))).toBe(true);
    expect(messages.some((m) => m.includes("style (host css)"))).toBe(false);
  });

  it("logs, for every inline block of the emitted page, the hash of exactly the text between its tags", async () => {
    const root = app();
    const { logger, messages } = captureInfoLogger();
    await runBuild(root, FALLBACK_ENABLED, { css: ".x{color:red}" }, { logger });
    const html = readFileSync(join(root, "dist/offline.html"), "utf8");
    const hash = (text: string): string => `sha256-${createHash("sha256").update(text).digest("base64")}`;
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? "");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");
    expect(styles).toHaveLength(2);
    expect(scripts).toHaveLength(1);
    expect(messages.some((m) => m.includes(`offline.html style (default): ${hash(styles[0] ?? "")}`))).toBe(true);
    expect(messages.some((m) => m.includes(`offline.html style (host css): ${hash(styles[1] ?? "")}`))).toBe(true);
    expect(messages.some((m) => m.includes(`offline.html script: ${hash(scripts[0] ?? "")}`))).toBe(true);
  });

  it("logs a host-css hash too when css is given", async () => {
    const root = app();
    const { logger, messages } = captureInfoLogger();
    await runBuild(root, FALLBACK_ENABLED, { css: ".x{color:red}" }, { logger });
    expect(messages.some((m) => m.includes("offline.html style (host css): sha256-"))).toBe(true);
  });

  it("fails the build when the resolved path already exists as a public-directory file", async () => {
    const root = app({ "offline.html": "<!doctype html><p>hand-written</p>\n" });
    await expect(runBuild(root, FALLBACK_ENABLED, {})).rejects.toThrow(/vite\.offline-page-conflict/);
  });

  it("fails the build when the resolved path already exists as a bundle output file", async () => {
    const root = app({}, { "offline.html": "<!doctype html><p>another Vite entry</p>\n" });
    await expect(
      runBuild(root, FALLBACK_ENABLED, {}, { rollupInput: { main: "index.html", offline: "offline.html" } }),
    ).rejects.toThrow(/vite\.offline-page-conflict/);
  });

  it("produces no page, no offline-page info logs, and an otherwise unaffected build when offlinePage is unset", async () => {
    const root = app();
    const { logger, messages } = captureInfoLogger();
    const { plan } = await runBuild(root, FALLBACK_DISABLED, undefined, { logger });
    expect(() => readFileSync(join(root, "dist/offline.html"), "utf8")).toThrow();
    expect(messages.some((m) => m.includes("offline.html"))).toBe(false);
    expect(plan.offlineFallback).toEqual({ enabled: false });
  });
});
