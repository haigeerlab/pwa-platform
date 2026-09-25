// Unit tests for the pure pieces of src/artifacts.ts (no Nuxt build needed) and for the sw-runtime export T6 added
// (createPathMatcher, re-exported from the package's "." entry).
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicyV1, PwaPolicyV3 } from "@pwa-platform/contracts";
import { createPathMatcher } from "@pwa-platform/sw-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateHtmlUrls,
  checkNoRuntimeCache,
  deriveOfflineRoute,
  hashFileContent,
  OFFLINE_PAGE_ROUTE_UNKNOWN_CODE,
  PRERENDERED_HTML_DENIED_CODE,
  resolveAssetBase,
  runArtifactPipeline,
  RUNTIME_CACHE_UNSUPPORTED_CODE,
  walkPublicDir,
  type LoggerLike,
  type NitroLike,
} from "../src/artifacts.js";

describe("resolveAssetBase (ufo-style relative join, with . and .. resolved)", () => {
  it("joins the default buildAssetsDir with a single slash", () => {
    expect(resolveAssetBase("/app/", "/_nuxt/")).toBe("/app/_nuxt/");
  });

  it("resolves a buildAssetsDir that traverses out of baseURL with ..", () => {
    expect(resolveAssetBase("/app/", "/../outside/")).toBe("/outside/");
  });

  it("resolves a nested baseURL the same way", () => {
    expect(resolveAssetBase("/app/store/", "/_nuxt/")).toBe("/app/store/_nuxt/");
  });
});

describe("deriveOfflineRoute", () => {
  it("maps /index.html to the root route", () => {
    expect(deriveOfflineRoute("/index.html")).toBe("/");
  });

  it("maps /x/index.html to /x", () => {
    expect(deriveOfflineRoute("/offline/index.html")).toBe("/offline");
  });

  it("maps a nested /x/y/index.html to /x/y", () => {
    expect(deriveOfflineRoute("/nested/offline/index.html")).toBe("/nested/offline");
  });

  it("maps /x.html (autoSubfolderIndex: false) to /x", () => {
    expect(deriveOfflineRoute("/offline.html")).toBe("/offline");
  });

  it("throws nuxt.offline-page-route-unknown for any other form", () => {
    expect(() => deriveOfflineRoute("/offline")).toThrow(new RegExp(`^${OFFLINE_PAGE_ROUTE_UNKNOWN_CODE}:`));
    expect(() => deriveOfflineRoute("/offline/")).toThrow(new RegExp(`^${OFFLINE_PAGE_ROUTE_UNKNOWN_CODE}:`));
  });
});

describe("checkNoRuntimeCache (T10, spec \"适配器\")", () => {
  it("throws nuxt.runtime-cache-unsupported for a v3 policy with runtimeCache.enabled: true", () => {
    const v3: PwaPolicyV3 = {
      ...policy(),
      schemaVersion: 3,
      offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
      runtimeCache: { enabled: true, maxEntries: 50, maxEntryBytes: 65_536, maxAgeSeconds: 300 },
    };
    expect(() => checkNoRuntimeCache(v3)).toThrow(new RegExp(`^${RUNTIME_CACHE_UNSUPPORTED_CODE}:`));
  });

  it("does not throw for a v3 policy with runtimeCache.enabled: false, same as v2", () => {
    const v3Disabled: PwaPolicyV3 = {
      ...policy(),
      schemaVersion: 3,
      offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] },
      runtimeCache: { enabled: false, maxEntries: 0, maxEntryBytes: 0, maxAgeSeconds: 0 },
    };
    expect(() => checkNoRuntimeCache(v3Disabled)).not.toThrow();
  });

  it("does not throw for v1 or v2 policies, which carry no runtimeCache field at all", () => {
    expect(() => checkNoRuntimeCache(policy())).not.toThrow();
    expect(() => checkNoRuntimeCache({ ...policy(), schemaVersion: 2, offlineWrites: { enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] } })).not.toThrow();
  });
});

describe("candidateHtmlUrls (site root, 评审第 9 项)", () => {
  it("pins the root case: publicPath + index.html and publicPath itself, nothing else", () => {
    expect(candidateHtmlUrls("/app/", "index.html")).toEqual(["/app/index.html", "/app/"]);
  });

  it("drops the bogus /app/index candidate the plain-.html branch used to add for the root file", () => {
    expect(candidateHtmlUrls("/app/", "index.html")).not.toContain("/app/index");
  });

  it("still produces both the with- and without-trailing-slash candidates for a nested index.html", () => {
    expect(candidateHtmlUrls("/app/", "about/index.html")).toEqual(["/app/about/index.html", "/app/about/", "/app/about"]);
  });

  it("still strips a bare .html suffix for the autoSubfolderIndex: false shape", () => {
    expect(candidateHtmlUrls("/app/", "about.html")).toEqual(["/app/about.html", "/app/about"]);
  });
});

describe("walkPublicDir (symlink safety, 评审第 15 项)", () => {
  it("does not descend into a symlinked directory", () => {
    const root = mkdtempSync(join(tmpdir(), "pwa-nuxt-walk-"));
    const target = mkdtempSync(join(tmpdir(), "pwa-nuxt-walk-target-"));
    try {
      writeFileSync(join(root, "index.html"), "<html></html>");
      writeFileSync(join(target, "secret.html"), "<html>secret</html>");
      symlinkSync(target, join(root, "linked"), "dir");

      // A plain recursive walk that followed this symlink would find "linked/secret.html" too (and, with a cycle
      // back toward root, would never terminate) — statSync (which follows symlinks) did exactly that before this
      // fix; Dirent#isDirectory/#isFile (from withFileTypes) do not.
      expect(walkPublicDir(root)).toEqual(["index.html"]);
    } finally {
      rmSync(target, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("hashFileContent (streamed vs whole-buffer sha256/base64url, 评审第 3 项)", () => {
  it("matches hashing the same bytes in one call, proving the two are interchangeable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pwa-nuxt-hash-"));
    try {
      const path = join(dir, "file.bin");
      // Large enough to span several stream "data" chunks (Node's default highWaterMark is 64KiB), so this also
      // proves the incremental hash.update() calls are combined correctly, not just exercised once.
      const bytes = Buffer.from("x".repeat(500_000));
      writeFileSync(path, bytes);

      const streamed = await hashFileContent(path);
      const wholeBuffer = createHash("sha256").update(bytes).digest("base64url");
      expect(streamed).toBe(wholeBuffer);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("sw-runtime's createPathMatcher (T6 export from the package entry)", () => {
  it("matches a denied rule the same way the artifact pipeline's denied-HTML check relies on", () => {
    const matcher = createPathMatcher([
      { pathPrefix: "/app/account", action: "deny" },
      { pathPrefix: "/app", action: "cache-first" },
    ]);
    expect(matcher.match("/app/account/index.html")?.action).toBe("deny");
    expect(matcher.match("/app/about/index.html")?.action).toBe("cache-first");
    expect(matcher.match("/other")).toBeUndefined();
  });
});

// runArtifactPipeline against real files on disk, but a stand-in nitro and logger — this is what the artifact
// pipeline itself does inside `nitro:build:public-assets`, minus needing a full Nuxt build to reach it. Real Nuxt
// builds (test/artifacts.test.ts) cover the parts that only a real build can prove (prerendering, noScripts,
// serving); this covers the pipeline's own logic deterministically and fast.
const IDENTITY: PwaIdentity = {
  appId: "nuxtartifactsunit",
  manifestId: "/app/",
  origin: "http://localhost:3000",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const INSTALL: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Unit fixture",
  shortName: "Unit",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

function policy(overrides: Partial<PwaPolicyV1> = {}): PwaPolicyV1 {
  return {
    schemaVersion: 1,
    install: { enabled: true },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [{ pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" }],
    ...overrides,
  };
}

function stubLogger(): LoggerLike & { warn: ReturnType<typeof vi.fn> } {
  return { warn: vi.fn() } as unknown as LoggerLike & { warn: ReturnType<typeof vi.fn> };
}

function stubNitro(publicDir: string): NitroLike {
  return { options: { output: { publicDir } } } as unknown as NitroLike;
}

describe("runArtifactPipeline", () => {
  let publicDir: string;

  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), "pwa-nuxt-artifacts-"));
    writeFileSync(join(publicDir, "index.html"), "<html><body>home</body></html>");
  });

  afterEach(() => {
    rmSync(publicDir, { recursive: true, force: true });
  });

  it("logs compile.asset-rule-unmatched for a rule no file satisfies, and still writes the worker", async () => {
    const logger = stubLogger();
    await runArtifactPipeline(
      stubNitro(publicDir),
      {
        identity: IDENTITY,
        policy: policy({ resources: [...policy().resources, { pathPrefix: "/never-matches", resourceClass: "asset", cache: "cache-first" }] }),
        install: INSTALL,
        recoveryRelease: false,
      },
      "/app/",
      logger,
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("compile.asset-rule-unmatched"));
    expect(readFileSync(join(publicDir, "sw.js"), "utf8").length).toBeGreaterThan(0);
    readFileSync(join(publicDir, "manifest.webmanifest"));
    readFileSync(join(publicDir, "pwa-recovery-worker.js"));
  });

  it("throws nuxt.prerendered-html-denied when a prerendered file falls under a deny rule, before writing anything", async () => {
    writeFileSync(join(publicDir, "account.html"), "<html><body>private</body></html>");
    const logger = stubLogger();
    await expect(
      runArtifactPipeline(
        stubNitro(publicDir),
        {
          identity: IDENTITY,
          policy: policy({ resources: [...policy().resources, { pathPrefix: "/account", resourceClass: "session-data", cache: "none" }] }),
          install: INSTALL,
          recoveryRelease: false,
        },
        "/app/",
        logger,
      ),
    ).rejects.toThrow(new RegExp(`^${PRERENDERED_HTML_DENIED_CODE}:`));
    // Nothing written: the check runs before any file is written.
    expect(() => readFileSync(join(publicDir, "sw.js"))).toThrow();
  });

  it("hints at both possible causes — nitro.prerender.ignore and public/ — since this check cannot tell them apart (评审第 8 项)", async () => {
    // Nothing here distinguishes "this came from prerendering" from "this was copied out of public/ verbatim":
    // runArtifactPipeline only ever sees the final .output/public, the same way a real build's public/ directory
    // copy and its prerendered pages end up mixed together on disk.
    writeFileSync(join(publicDir, "account.html"), "<html><body>private</body></html>");
    const logger = stubLogger();
    const attempt = runArtifactPipeline(
      stubNitro(publicDir),
      {
        identity: IDENTITY,
        policy: policy({ resources: [...policy().resources, { pathPrefix: "/account", resourceClass: "session-data", cache: "none" }] }),
        install: INSTALL,
        recoveryRelease: false,
      },
      "/app/",
      logger,
    );
    await expect(attempt).rejects.toThrow(/nitro\.prerender\.ignore/);
    await expect(attempt).rejects.toThrow(/public\//);
  });

  describe("recoveryRelease (T7b)", () => {
    it("writes the recovery worker's content to sw.js, leaves pwa-recovery-worker.js unchanged, and logs nuxt.recovery-release", async () => {
      const logger = stubLogger();
      await runArtifactPipeline(
        stubNitro(publicDir),
        { identity: IDENTITY, policy: policy(), install: INSTALL, recoveryRelease: true },
        "/app/",
        logger,
      );
      const sw = readFileSync(join(publicDir, "sw.js"));
      const recovery = readFileSync(join(publicDir, "pwa-recovery-worker.js"));
      expect(sw.equals(recovery)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("nuxt.recovery-release"));
    });

    it("does not change sw.js or pwa-recovery-worker.js when off (default)", async () => {
      const logger = stubLogger();
      await runArtifactPipeline(
        stubNitro(publicDir),
        { identity: IDENTITY, policy: policy(), install: INSTALL, recoveryRelease: false },
        "/app/",
        logger,
      );
      const sw = readFileSync(join(publicDir, "sw.js"));
      const recovery = readFileSync(join(publicDir, "pwa-recovery-worker.js"));
      expect(sw.equals(recovery)).toBe(false);
      expect(logger.warn.mock.calls.some(([message]) => String(message).includes("nuxt.recovery-release"))).toBe(false);
    });
  });
});
