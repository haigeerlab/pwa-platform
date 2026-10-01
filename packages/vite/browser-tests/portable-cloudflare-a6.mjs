/* global process, navigator, caches, window, getComputedStyle, setTimeout */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const targets = JSON.parse(readFileSync(resolve(root, "docs/operations/portable-a6-targets.json"), "utf8"));
const origins = [targets.a.origin, targets.b.origin];
if (origins.some((origin) => !origin?.startsWith("https://")) || origins[0] === origins[1]) throw new Error("A6 requires two registered HTTPS origins");
const evidencePath = resolve(root, "docs/review/2026-10-01/evidence/browser-desktop-chrome.json");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const pages = await Promise.all(origins.map(() => context.newPage()));
const evidence = { browser: "Chromium", version: browser.version(), origins, checkedAt: new Date().toISOString(), v1: [], v2: [] };
const browserErrors = [];
context.on("requestfailed", (request) => browserErrors.push(`request ${request.url()}: ${request.failure()?.errorText}`));
context.on("serviceworker", (worker) => {
  worker.on("console", (message) => { if (message.type() === "error") browserErrors.push(`worker console: ${message.text()}`); });
  worker.on("close", () => browserErrors.push(`worker closed: ${worker.url()}`));
});
for (const page of pages) {
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
}
const pause = () => new Promise((resolvePause) => process.stdin.once("data", resolvePause));
const waitFor = async (page, predicate, message, timeout = 20000) => {
  await page.waitForFunction(predicate, null, { timeout });
  return message;
};
const regState = (page) => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration("/app/");
  return { scope: reg?.scope, installing: reg?.installing?.state ?? null, active: reg?.active?.scriptURL, activeState: reg?.active?.state ?? null, waiting: reg?.waiting?.scriptURL ?? null, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
});
try {
  for (const [i, origin] of origins.entries()) {
    const page = pages[i];
    await page.goto(`${origin}/app/`);
    await page.evaluate(async () => { await window.__pwaClient.register(); });
    const initialState = await regState(page);
    process.stdout.write(`${JSON.stringify({ stage: "registration", target: i === 0 ? "a" : "b", initialState, browserErrors })}\n`);
    const activationDeadline = Date.now() + 60000;
    while ((await regState(page)).activeState !== "activated") {
      if (Date.now() >= activationDeadline) throw new Error(`A6 ${i} worker activation timeout: ${JSON.stringify({ state: await regState(page), browserErrors })}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    process.stdout.write(`${JSON.stringify({ stage: "activated", target: i === 0 ? "a" : "b", state: await regState(page) })}\n`);
    await page.goto(`${origin}/app/`);
    process.stdout.write(`${JSON.stringify({ stage: "second-navigation", target: i === 0 ? "a" : "b", url: page.url(), state: await regState(page), browserErrors })}\n`);
    await waitFor(page, () => !!navigator.serviceWorker.controller, "controlled document");
    await page.evaluate(async () => { await window.__pwaClient.register(); });
    const state = await regState(page);
    const cssVersion = await page.locator("#shell").evaluate((element) => getComputedStyle(element, "::after").content);
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send("Page.getAppManifest");
    if (state.scope !== `${origin}/app/` || state.active !== `${origin}/app/sw.js` ||
      !state.controlled || cssVersion !== '" v1"' || manifest.url !== `${origin}/app/manifest.webmanifest` || manifest.errors.length) {
      throw new Error(`A6 ${i} v1 registration, CSS or manifest failed`);
    }
    evidence.v1.push({ target: i === 0 ? "a" : "b", state, cssVersion, manifestUrl: manifest.url, manifestErrors: manifest.errors });
  }
  for (const [i, origin] of origins.entries()) {
    const page = pages[i];
    const other = origins[1 - i];
    const crossOriginCached = await page.evaluate(async (foreign) => {
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (request.url.startsWith(foreign)) return true;
      return false;
    }, other);
    await context.setOffline(true);
    await page.goto(`${origin}/app/never-visited`);
    const offlineVisible = await page.locator("#offline-marker").isVisible();
    await context.setOffline(false);
    if (crossOriginCached || !offlineVisible) throw new Error(`A6 ${i} offline or cache isolation failed`);
    evidence.v1[i].crossOriginCached = crossOriginCached;
    evidence.v1[i].offlineUnvisitedNavigation = offlineVisible;
    await page.goto(`${origin}/app/`);
    await page.evaluate(async () => { await window.__pwaClient.register(); });
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ stage: "v1-browser-passed", browserVersion: evidence.version, targets: 2, offline: 2, cacheIsolation: true, next: "deploy-v2-then-send-newline" })}\n`);
  await pause();
  process.stdin.pause();
  for (const [i, origin] of origins.entries()) {
    const page = pages[i];
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration("/app/"))?.update(); });
    const waitingDeadline = Date.now() + 60000;
    while (!(await regState(page)).waiting) {
      if (Date.now() >= waitingDeadline) throw new Error(`A6 ${i} waiting worker timeout: ${JSON.stringify({ state: await regState(page), browserErrors })}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    const before = await regState(page);
    const oldCssVersion = await page.locator("#shell").evaluate((element) => getComputedStyle(element, "::after").content);
    evidence.v2.push({ target: i === 0 ? "a" : "b", before, oldCssVersion });
    if (before.waiting !== `${origin}/app/sw.js` || oldCssVersion !== '" v1"') throw new Error(`A6 ${i} waiting or old-page preservation failed`);
    const changed = page.evaluate(() => new Promise((resolveChange) => navigator.serviceWorker.addEventListener("controllerchange", resolveChange, { once: true })));
    const applied = await page.evaluate(async () => await window.__pwaClient.applyUpdate());
    if (!applied) throw new Error(`A6 ${i} update was not applied`);
    await changed;
    await page.goto(`${origin}/app/`);
    const after = await regState(page);
    const newCssVersion = await page.locator("#shell").evaluate((element) => getComputedStyle(element, "::after").content);
    if (after.active !== `${origin}/app/sw.js` || newCssVersion !== '" v2"') throw new Error(`A6 ${i} v2 refresh failed`);
    evidence.v2[i] = { target: i === 0 ? "a" : "b", waiting: before.waiting, oldCssVersion, applied, active: after.active, newCssVersion };
  }
  evidence.completedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ stage: "v2-browser-passed", browserVersion: evidence.version, targets: 2, waiting: 2, applied: 2, refreshed: 2 })}\n`);
} catch (error) {
  evidence.error = String(error);
  evidence.browserErrors = browserErrors;
  evidence.failedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
