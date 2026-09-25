// 评审第 3 项: runArtifactPipeline must hand buildPwaArtifacts contentHash-only source files for the public
// directory it walks, never the whole file loaded into memory as `content`. @pwa-platform/vite is mocked so this
// test can inspect exactly what crosses that boundary, without needing a real plan/verification round trip — the
// real round trip (same hash, same compiled plan) is covered separately by artifacts-checks.test.ts's
// hashFileContent parity test and by the real-Nuxt builds in artifacts.test.ts, which never stopped passing.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import * as viteAdapter from "@pwa-platform/vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runArtifactPipeline, type LoggerLike, type NitroLike } from "../src/artifacts.js";

vi.mock("@pwa-platform/vite", () => ({
  buildPwaArtifacts: vi.fn(async () => ({ plan: { pathRules: [] }, warnings: [], files: [] })),
  assertPwaArtifacts: vi.fn(),
}));

const IDENTITY: PwaIdentity = {
  appId: "nuxtartifactssourcefiles",
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

const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" }],
};

function stubLogger(): LoggerLike {
  return { warn: vi.fn() } as unknown as LoggerLike;
}

function stubNitro(publicDir: string): NitroLike {
  return { options: { output: { publicDir } } } as unknown as NitroLike;
}

describe("runArtifactPipeline's source files (memory safety, 评审第 3 项)", () => {
  let publicDir: string;

  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), "pwa-nuxt-source-files-"));
    writeFileSync(join(publicDir, "index.html"), "<html><body>home</body></html>");
    writeFileSync(join(publicDir, "robots.txt"), "User-agent: *\n");
  });

  afterEach(() => {
    rmSync(publicDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("passes contentHash (never content) for every public-dir file to buildPwaArtifacts", async () => {
    await runArtifactPipeline(
      stubNitro(publicDir),
      { identity: IDENTITY, policy: POLICY, install: INSTALL, recoveryRelease: false },
      "/app/",
      stubLogger(),
    );

    const mockedBuild = vi.mocked(viteAdapter.buildPwaArtifacts);
    expect(mockedBuild).toHaveBeenCalledTimes(1);
    const [input] = mockedBuild.mock.calls[0] ?? [];
    const files = (input as { files?: readonly unknown[] } | undefined)?.files ?? [];
    expect(files.map((file) => (file as { path: string }).path).sort()).toEqual(["index.html", "robots.txt"]);
    for (const file of files) {
      const record = file as { path: string; content?: unknown; contentHash?: unknown };
      expect(record.content, record.path).toBeUndefined();
      expect(record.contentHash, record.path).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});
