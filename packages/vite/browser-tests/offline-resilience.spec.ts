import { expect, readRealBrowserKind, test } from "@pwa-platform/browser-test-harness";
import { RESILIENT_SITE, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { installAndControl, isMarkedDocument, lookAtPage, markDocument } from "./page-probe.js";

test.use({ fixtureSite: RESILIENT_SITE });
test.describe.configure({ timeout: 90_000 });
const REAL_BROWSER = readRealBrowserKind(process.env) !== undefined;
const DOCUMENT = "/app/never-visited.html";

test("a 900ms connection failure recovers through one delayed retry", async ({ page, fixtureServer }) => {
  await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
  const release = fixtureServer.reset(DOCUMENT);
  fixtureServer.clearRequests();
  const started = Date.now();
  const timer = setTimeout(release, 900);
  try {
    await page.goto(fixtureServer.url(`${DOCUMENT}?channel_code=test`));
    expect(await page.locator(".pwa-offline__heading").count()).toBe(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(Date.now() - started).toBeLessThan(5000);
    const requests = fixtureServer.requests().filter((record) => record.path === DOCUMENT);
    // Chrome may internally retry each failed GET; the platform's retry is identified by the 1-second gap.
    expect(requests.some((record) => record.time - started >= 900)).toBe(true);
  } finally { clearTimeout(timer); release(); }
});

test("a four-second document stays online; a six-second document gets neutral feedback at five seconds", async ({ page, fixtureServer }) => {
  await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
  let release = fixtureServer.delay(DOCUMENT, 4000);
  try {
    await page.goto(fixtureServer.url(DOCUMENT));
    expect(await page.locator(".pwa-offline__heading").count()).toBe(0);
    release();
    release = fixtureServer.delay(DOCUMENT, 6000);
    const started = Date.now();
    await page.goto(fixtureServer.url(DOCUMENT));
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    expect(Date.now() - started).toBeGreaterThanOrEqual(4900);
    expect(Date.now() - started).toBeLessThan(7000);
  } finally { release(); }
});

test("reachable worker and failing document do not reload for 60 seconds", async ({ page, fixtureServer }) => {
  await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
  const release = fixtureServer.reset(DOCUMENT);
  try {
    await page.goto(fixtureServer.url(DOCUMENT));
    expect((await fetch(fixtureServer.url(WORKER_URL), { method: "HEAD" })).status).toBe(200);
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    await lookAtPage(page);
    let navigations = 0;
    if (REAL_BROWSER) await markDocument(page);
    if (!REAL_BROWSER) page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
    await page.waitForTimeout(60_000);
    if (REAL_BROWSER) expect(await isMarkedDocument(page)).toBe(true);
    else expect(navigations).toBe(0);
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
  } finally { release(); }
});

test("successful probes but failed navigations consume one budget across reloads", async ({ page, fixtureServer }) => {
  await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
  const release = fixtureServer.resetNavigation(DOCUMENT);
  try {
    await page.goto(fixtureServer.url(DOCUMENT));
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    await lookAtPage(page);
    let navigations = 0;
    const started = Date.now();
    if (REAL_BROWSER) {
      // WebDriver has no frame event stream; a document marker avoids Safari's varying timeOrigin readings.
      await markDocument(page);
      await expect.poll(() => isMarkedDocument(page), { timeout: 30_000 }).toBe(false);
    } else {
      page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
      await expect.poll(() => navigations, { timeout: 30_000 }).toBe(1);
    }
    await lookAtPage(page);
    if (REAL_BROWSER) await markDocument(page);
    await page.waitForTimeout(Math.max(0, 60_000 - (Date.now() - started)));
    if (REAL_BROWSER) expect(await isMarkedDocument(page)).toBe(true);
    else expect(navigations).toBe(1);
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    await page.locator(".pwa-offline__retry").click();
    if (REAL_BROWSER) await expect.poll(() => isMarkedDocument(page)).toBe(false);
    else await expect.poll(() => navigations).toBe(2);
  } finally { release(); }
});

test("history return retains the budget while a separate tab owns its own budget", async ({ page, context, fixtureServer }) => {
  test.skip(REAL_BROWSER, "This harness exposes history navigation only through Playwright; record this case as unverified on WebDriver browsers");
  test.setTimeout(90_000);
  await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
  const release = fixtureServer.resetNavigation(DOCUMENT);
  const budgetKey = "pwa:offline-recovery:v1:/app/sw.js";
  try {
    await page.goto(fixtureServer.url(DOCUMENT));
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    await page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame(), timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("1");
    await page.goto(fixtureServer.url(SHELL_URL));
    await page.goBack();
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("1");
    await page.goBack();
    expect(await page.locator(".pwa-offline__heading").count()).toBe(0);
    await page.goForward();
    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("暂时无法连接");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("1");
    const returned = await page.evaluate(() => performance.timeOrigin);
    const separate = await context.newPage();
    try {
      await separate.goto(fixtureServer.url(DOCUMENT));
      expect(await separate.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("0");
      await separate.waitForEvent("framenavigated", { predicate: (frame) => frame === separate.mainFrame(), timeout: 30_000 });
      await separate.waitForLoadState("domcontentloaded");
      expect(await separate.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("1");
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(returned);
      expect(await page.evaluate((key) => sessionStorage.getItem(key), budgetKey)).toBe("1");
    } finally { await separate.close(); }
  } finally { release(); }
});
