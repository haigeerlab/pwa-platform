import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PwaPlan } from "@pwa-platform/contracts";
import { PWA_PLUGIN_NAME, pwa } from "@pwa-platform/vite";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { cloudflarePlanCapture } from "./cloudflare-plan-capture.js";
import { IDENTITY, INSTALL, POLICY, SHELL_URL } from "./identity.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
  delete process.env.PWA_PLATFORM_CF_PLAN_OUT;
});

/** A minimal app; matches `packages/vite/test/plan-api.test.ts`'s fixture. `offline.html` is required because the
 *  shared `POLICY` enables the offline fallback. The screenshot and shortcut-icon files are required because the
 *  shared `INSTALL` declares them and the build verifies those (unlike the top-level `icons`) actually exist. */
function app(): string {
  const root = mkdtempSync(join(tmpdir(), "cloudflare-plan-capture-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "index.html"), '<!doctype html><script type="module" src="/src/main.js"></script>\n');
  writeFileSync(join(root, "src/main.js"), "export const boot = () => 1;\n");
  mkdirSync(join(root, "public/icons"), { recursive: true });
  mkdirSync(join(root, "public/screenshots"), { recursive: true });
  writeFileSync(join(root, "public/sw.js"), "self.addEventListener('install', () => {});\n");
  writeFileSync(join(root, "public/offline.html"), "<!doctype html><p>offline</p>\n");
  writeFileSync(join(root, "public/icons/192.png"), "icon\n");
  writeFileSync(join(root, "public/screenshots/wide.png"), "wide\n");
  writeFileSync(join(root, "public/screenshots/narrow.png"), "narrow\n");
  return root;
}

/** A stand-in for `@pwa-platform/vite`'s `pwa()`, registered under the same published name, whose `getPlan()`
 *  always reports "not ready" — the shape `writeBundle` sees when the platform plugin failed to compile a plan. */
function platformPluginWithNoPlan(): Plugin {
  return {
    name: PWA_PLUGIN_NAME,
    apply: "build",
    api: { getPlan: () => null },
  };
}

describe("cloudflarePlanCapture", () => {
  it("does nothing when PWA_PLATFORM_CF_PLAN_OUT is unset", () => {
    delete process.env.PWA_PLATFORM_CF_PLAN_OUT;
    const plugin = cloudflarePlanCapture();
    expect(plugin.name).toBe("cloudflare-plan-capture");
    // No hooks registered at all — not merely hooks that happen to no-op — so an unset env var can never observe
    // or affect a local E2E build.
    expect(plugin.configResolved).toBeUndefined();
    expect(plugin.writeBundle).toBeUndefined();
  });

  it("fails the build when the platform plugin is missing", async () => {
    const root = app();
    const planOut = join(root, "plan-out.json");
    process.env.PWA_PLATFORM_CF_PLAN_OUT = planOut;

    await expect(
      build({
        configFile: false,
        root,
        base: SHELL_URL,
        logLevel: "silent",
        build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
        plugins: [cloudflarePlanCapture()],
      }),
    ).rejects.toThrow(/no @pwa-platform\/vite pwa\(\) plugin was found/);

    expect(existsSync(planOut)).toBe(false);
  });

  it("fails the build when the platform plugin's plan is null", async () => {
    const root = app();
    const planOut = join(root, "plan-out.json");
    process.env.PWA_PLATFORM_CF_PLAN_OUT = planOut;

    await expect(
      build({
        configFile: false,
        root,
        base: SHELL_URL,
        logLevel: "silent",
        build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
        plugins: [platformPluginWithNoPlan(), cloudflarePlanCapture()],
      }),
    ).rejects.toThrow(/the platform plugin produced no plan for this build/);

    expect(existsSync(planOut)).toBe(false);
  });

  it("writes the compiled plan on the happy path", async () => {
    const root = app();
    const planOut = join(root, "plan-out.json");
    process.env.PWA_PLATFORM_CF_PLAN_OUT = planOut;

    await build({
      configFile: false,
      root,
      base: SHELL_URL,
      logLevel: "silent",
      build: { write: true, outDir: join(root, "dist"), emptyOutDir: true },
      plugins: [
        pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL, topology: { kind: "standalone-origin" } }),
        cloudflarePlanCapture(),
      ],
    });

    expect(existsSync(planOut)).toBe(true);
    const plan = JSON.parse(readFileSync(planOut, "utf8")) as PwaPlan;
    expect(plan.identity).toEqual(IDENTITY);
    expect(plan.precache.length).toBeGreaterThan(0);
  });
});
