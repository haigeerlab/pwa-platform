import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { build, createLogger } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";

const fixtureIcon = (name: string): string =>
  fileURLToPath(new URL(`../browser-tests/app/public/icons/${name}`, import.meta.url));

const identity: PwaIdentity = {
  appId: "icon-check",
  manifestId: "/app/",
  origin: "https://icons.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const install: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Icon Check",
  shortName: "Icons",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
};

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function app(): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-vite-icon-check-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");

  for (const name of ["192.png", "192-maskable.png", "512.png", "512-maskable.png"]) {
    const target = join(root, "public/icons", name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(fixtureIcon(name), target);
  }
  return root;
}

async function runBuild(
  root: string,
  metadata: PwaInstallMetadata = install,
): Promise<readonly string[]> {
  const warnings: string[] = [];
  const logger = createLogger("warn", { allowClearScreen: false });
  logger.warn = (message) => warnings.push(message);
  logger.warnOnce = logger.warn;
  await build({
    configFile: false,
    root,
    base: "/app/",
    customLogger: logger,
    build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
    plugins: [pwa({ identity, install: metadata, policy, topology: { kind: "standalone-origin" } })],
  });
  return warnings;
}

describe("manifest icon validation in a real Vite build", () => {
  it("fails with declared and actual dimensions when a PNG is only 1x1", async () => {
    const root = app();
    writeFileSync(
      join(root, "public/icons/192.png"),
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );

    await expect(runBuild(root)).rejects.toThrow(
      /vite\.manifest-icon-size-mismatch.*\/install\/icons\/0\/sizes.*192x192.*1x1/s,
    );
  });

  it("fails when a declared main icon is not part of the build", async () => {
    const root = app();
    rmSync(join(root, "public/icons/192.png"));

    await expect(runBuild(root)).rejects.toThrow(
      /vite\.manifest-icon-missing.*\/install\/icons\/0\/src.*\/app\/icons\/192\.png/s,
    );
  });

  it("fails when a known declared MIME type disagrees with the file signature", async () => {
    const root = app();
    const icons = install.icons.map((icon, index) =>
      index === 0 ? { ...icon, type: "image/jpeg" } : icon,
    );

    await expect(runBuild(root, { ...install, icons })).rejects.toThrow(
      /vite\.manifest-icon-type-mismatch.*\/install\/icons\/0\/type.*image\/jpeg.*image\/png/s,
    );
  });

  it("fails when a known image type has an unreadable header", async () => {
    const root = app();
    writeFileSync(join(root, "public/icons/192.png"), "not a png");

    await expect(runBuild(root)).rejects.toThrow(
      /vite\.manifest-icon-invalid.*\/install\/icons\/0\/src.*image\/png/s,
    );
  });

  it("builds when every PNG matches its declared size", async () => {
    await expect(runBuild(app())).resolves.toEqual(expect.any(Array));
  });

  it("warns rather than claiming to inspect an unsupported image type", async () => {
    const root = app();
    writeFileSync(
      join(root, "public/icons/192.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"></svg>\n',
    );
    const icons = install.icons.map((icon, index) =>
      index === 0
        ? { ...icon, src: "/app/icons/192.svg" as const, type: "image/svg+xml" }
        : icon,
    );

    const warnings = await runBuild(root, { ...install, icons });
    expect(warnings.join("\n")).toMatch(
      /vite\.manifest-icon-unverified.*\/install\/icons\/0\/type.*image\/svg\+xml/s,
    );
  });
});
