// spec/examples-browser-e2e.md's revised "测试策略增量": "两站构建产物都含恢复页 pwa-entry.html 与其指纹脚本；计划中
// 含 /pwa-entry.html 的资源规则". This builds each example with its real `vite.config.ts` — the same file
// `pnpm build:pages:react` and the Vue equivalent use — rather than a synthetic fixture, so what is asserted here
// is what actually ships.
//
// Reuses `cloudflarePlanCapture`'s existing `PWA_PLATFORM_CF_PLAN_OUT` mechanism (apps/shared/cloudflare-plan-
// capture.ts, already wired into both configs) to read the compiled `PwaPlan` after the build, the same way
// apps/shared/cloudflare-plan-capture.test.ts does — no second way of reading the plan is introduced.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PwaPlan } from "@pwa-platform/contracts";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { SHELL_URL } from "./identity.js";

const APPS = ["react", "vue"] as const;

let tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
  delete process.env.PWA_PLATFORM_CF_PLAN_OUT;
});

async function buildApp(app: (typeof APPS)[number]): Promise<{ readonly outDir: string; readonly plan: PwaPlan }> {
  const outDir = mkdtempSync(join(tmpdir(), `entry-recovery-build-${app}-`));
  tmpDirs.push(outDir);
  const planOut = join(outDir, "plan.json");
  process.env.PWA_PLATFORM_CF_PLAN_OUT = planOut;

  await build({
    configFile: fileURLToPath(new URL(`../${app}/vite.config.ts`, import.meta.url)),
    logLevel: "silent",
    build: { outDir, write: true, emptyOutDir: true },
  });

  const plan = JSON.parse(readFileSync(planOut, "utf8")) as PwaPlan;
  return { outDir, plan };
}

describe.each(APPS)("%s example's build", (app) => {
  it("emits the entry-recovery page and precaches it and its script", async () => {
    const { outDir, plan } = await buildApp(app);

    expect(existsSync(join(outDir, "pwa-entry.html"))).toBe(true);

    const html = readFileSync(join(outDir, "pwa-entry.html"), "utf8");
    const scriptSrc = /<script type="module" src="([^"]+)">/.exec(html)?.[1];
    expect(scriptSrc, "pwa-entry.html must reference its fingerprinted script").toBeDefined();
    // Fingerprinted: the script's file name is not the literal source name, proving it went through the bundler
    // rather than being a static copy of the page's own source.
    expect(scriptSrc).toMatch(/^\/app\/assets\/.+\.js$/);
    const scriptFileName = scriptSrc!.slice(SHELL_URL.length);
    expect(existsSync(join(outDir, scriptFileName))).toBe(true);

    const precacheUrls = plan.precache.map((entry) => entry.url);
    expect(precacheUrls).toContain(`${SHELL_URL}pwa-entry.html`);
    expect(precacheUrls).toContain(scriptSrc);
  });
});
