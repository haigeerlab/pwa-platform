import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { readRegistration, startFixtureServer, waitForControllerChange } from "@pwa-platform/browser-test-harness";
import {
  PORTABLE_DOCS_FIXTURE_SITE, PORTABLE_FIXTURE_SITE, SITE_PORTABLE_V1_OUT, SHELL_URL, WORKER_URL, MANIFEST_URL,
} from "./fixture-site.js";
import { cacheNames, deployAndWait, installAndControl, pageApplyUpdate, pageRegister, urlIsInAnyCache } from "./page-probe.js";

function outputFiles(directory: string, prefix = ""): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? outputFiles(join(directory, entry.name), `${relative}/`) : [relative];
  });
}

test("the portable guide configuration serves its generated offline page on an uncached navigation", async ({ browser, request }) => {
  const server = await startFixtureServer(PORTABLE_DOCS_FIXTURE_SITE);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const manifest = await request.get(server.url("/manifest.webmanifest"));
    expect(manifest.ok()).toBe(true);
    expect(await manifest.json()).toMatchObject({ id: "/", start_url: "/" });
    await installAndControl(page, server, "/", "/sw.js");
    expect(await urlIsInAnyCache(page, server.url("/offline.html"))).toBe(true);

    server.goOffline();
    await page.goto(server.url("/never-visited"));
    await expect(page.locator(".pwa-offline__heading")).toBeVisible();
    await expect(page.locator("#shell")).toHaveCount(0);
    await page.goto(server.url("/"));
    await expect(page.locator("#shell")).toBeVisible();
  } finally {
    server.goOnline();
    await context.close();
    await server.close();
  }
});

test("one portable dist stays byte-identical and isolated across two local origins", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const a = await startFixtureServer(PORTABLE_FIXTURE_SITE);
  const b = await startFixtureServer(PORTABLE_FIXTURE_SITE);
  const context = await browser.newContext();
  try {
    expect(a.origin).not.toBe(b.origin);
    for (const file of outputFiles(SITE_PORTABLE_V1_OUT)) {
      const source = readFileSync(join(SITE_PORTABLE_V1_OUT, file));
      const fromA = await request.get(a.url(`/app/${file}`));
      const fromB = await request.get(b.url(`/app/${file}`));
      expect(fromA.ok(), file).toBe(true);
      expect(fromB.ok(), file).toBe(true);
      expect(Buffer.from(await fromA.body()).equals(source), file).toBe(true);
      expect(Buffer.from(await fromB.body()).equals(source), file).toBe(true);
    }

    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await installAndControl(pageA, a, SHELL_URL, WORKER_URL);
    await installAndControl(pageB, b, SHELL_URL, WORKER_URL);
    const regA = await readRegistration(pageA, SHELL_URL);
    const regB = await readRegistration(pageB, SHELL_URL);
    expect(regA?.active).toBe(a.url(WORKER_URL));
    expect(regB?.active).toBe(b.url(WORKER_URL));
    expect(await cacheNames(pageA)).toEqual(await cacheNames(pageB));
    expect(await urlIsInAnyCache(pageA, b.url(SHELL_URL))).toBe(false);
    expect(await urlIsInAnyCache(pageB, a.url(SHELL_URL))).toBe(false);
    for (const [server, page] of [[a, pageA], [b, pageB]] as const) {
      const manifest = await request.get(server.url(MANIFEST_URL));
      expect(manifest.ok()).toBe(true);
      const metadata = await manifest.json();
      expect(metadata).toMatchObject({
        id: SHELL_URL, start_url: SHELL_URL, name: "Vite Fixture", display: "standalone",
      });
      expect(metadata.icons).toEqual(expect.arrayContaining([
        expect.objectContaining({ src: "/app/icons/192.png", purpose: "any" }),
        expect.objectContaining({ src: "/app/icons/512-maskable.png", purpose: "maskable" }),
      ]));
      const devtools = await context.newCDPSession(page);
      const parsed = await devtools.send("Page.getAppManifest");
      expect(parsed.url).toBe(server.url(MANIFEST_URL));
      expect(parsed.errors).toEqual([]);
    }

    a.goOffline();
    await pageA.goto(a.url("/app/never-visited"));
    await expect(pageA.locator("#offline-marker")).toBeVisible();
    expect((await request.get(b.url(SHELL_URL))).ok()).toBe(true);
    a.goOnline();
    await pageA.goto(a.url(SHELL_URL));
    await pageRegister(pageA);
    b.goOffline();
    await pageB.goto(b.url("/app/never-visited"));
    await expect(pageB.locator("#offline-marker")).toBeVisible();
    b.goOnline();
    await pageB.goto(b.url(SHELL_URL));
    await pageRegister(pageB);

    await deployAndWait(pageA, a, "v2");
    expect((await readRegistration(pageA, SHELL_URL))?.waiting).toBe(a.url(WORKER_URL));
    expect((await readRegistration(pageB, SHELL_URL))?.waiting).toBeNull();
    await waitForControllerChange(pageA, async () => { expect(await pageApplyUpdate(pageA)).toBe(true); });
    await deployAndWait(pageB, b, "v2");
    await waitForControllerChange(pageB, async () => { expect(await pageApplyUpdate(pageB)).toBe(true); });
    expect((await readRegistration(pageA, SHELL_URL))?.active).toBe(a.url(WORKER_URL));
    expect((await readRegistration(pageB, SHELL_URL))?.active).toBe(b.url(WORKER_URL));
  } finally {
    await context.close();
    await Promise.all([a.close(), b.close()]);
  }
});
