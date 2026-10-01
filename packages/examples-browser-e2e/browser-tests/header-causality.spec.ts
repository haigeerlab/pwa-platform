import { verifyHtmlHeaders, verifyResponseHeaders, verifyWorkerScriptMime } from "@pwa-platform/build-verifier";
import { expect, test } from "@pwa-platform/browser-test-harness";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MANIFEST_URL, WORKER_URL } from "../apps/shared/identity.js";
import { checkForUpdate, installAndControl } from "./page.js";
import { collectHeaders, headerPaths, htmlHeaderPaths, publishedPaths, readShippedWorker, releaseInput } from "./release.js";
import { fixtureSite, HEADER_RULES, siteRoot } from "./sites.js";

const LONG = "public, max-age=14400";
const REVALIDATE = "no-cache";
const ZERO_AGE = "public, max-age=0, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";
const example = "vue";

test.use({ fixtureSite: fixtureSite(example) });
test.skip(({ browserName }) => browserName !== "chromium", "HTTP cache causality expectations are established for Chromium browsers only");

for (const mime of ["application/javascript", "text/plain"] as const) {
  test(`worker Content-Type ${mime}: registration determines whether offline startup is available`, async ({ page, fixtureServer }) => {
    fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: WORKER_URL, headers: { "Content-Type": mime } }]);
    const workerResponse = await page.request.get(fixtureServer.url(WORKER_URL));
    expect(workerResponse.headers()["content-type"]).toBe(mime);
    const plan = releaseInput(await readShippedWorker(example, "v1"));
    const observed = await collectHeaders(page, fixtureServer, headerPaths(plan));
    const verifierPass = verifyResponseHeaders(plan, observed).ok;
    const mimeVerifierPass = verifyWorkerScriptMime(plan, observed).ok;
    expect(verifierPass).toBe(true);
    expect(mimeVerifierPass).toBe(mime === "application/javascript");
    if (mime === "application/javascript") {
      await installAndControl(page, fixtureServer);
      fixtureServer.goOffline();
      await page.reload();
      await expect(page.locator("#version")).toHaveText("v1");
      console.log(JSON.stringify({ case: "worker-mime", mime, registered: true, offlineStartup: true, verifierPass, mimeVerifierPass }));
      return;
    }

    const registrationError = page.waitForEvent("pageerror", { timeout: 10_000 });
    await page.goto(fixtureServer.url("/app/"));
    expect((await registrationError).message).toContain("MIME");
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) === undefined)).toBe(true);
    await expect(page.locator("#registered")).toHaveText("not registered");
    fixtureServer.goOffline();
    await expect(page.reload()).rejects.toThrow();
    console.log(JSON.stringify({ case: "worker-mime", mime, registered: false, offlineStartup: false, verifierPass, mimeVerifierPass }));
  });
}

for (const cacheControl of [REVALIDATE, ZERO_AGE, LONG]) {
  test(`worker ${cacheControl}: v2 still reaches the server and offers an update`, async ({ page, fixtureServer }) => {
    fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: WORKER_URL, headers: { "Cache-Control": cacheControl } }]);
    await installAndControl(page, fixtureServer);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.updateViaCache)).toBe("imports");
    fixtureServer.clearRequests();
    fixtureServer.deploy("v2");
    await checkForUpdate(page);

    await expect.poll(() => page.locator("#apply-update").isVisible(), { timeout: 15_000 }).toBe(true);
    const workerRequests = fixtureServer.requests().filter(({ path }) => path === WORKER_URL);
    expect(workerRequests.length).toBeGreaterThan(0);
    const response = await page.request.get(fixtureServer.url(WORKER_URL));
    expect(response.headers()["cache-control"]).toBe(cacheControl);
    const plan = releaseInput(await readShippedWorker(example, "v2"));
    const verdict = verifyResponseHeaders(plan, await collectHeaders(page, fixtureServer, headerPaths(plan))).ok;
    expect(verdict).toBe(cacheControl === REVALIDATE);
    console.log(JSON.stringify({ case: "worker-update", cacheControl, workerRequests: workerRequests.length, prompt: true, verifierPass: verdict }));
  });
}

for (const cacheControl of [REVALIDATE, LONG]) {
  test(`worker ${cacheControl}: updateViaCache=all controls whether the update request reaches the server`, async ({ page, fixtureServer }) => {
    fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: WORKER_URL, headers: { "Cache-Control": cacheControl } }]);
    await installAndControl(page, fixtureServer);
    const mode = await page.evaluate(async (workerUrl) => {
      const registration = await navigator.serviceWorker.register(workerUrl, { scope: "/app/", updateViaCache: "all" });
      return registration.updateViaCache;
    }, WORKER_URL);
    expect(mode).toBe("all");

    fixtureServer.clearRequests();
    fixtureServer.deploy("v2");
    await checkForUpdate(page);
    const workerRequests = fixtureServer.requests().filter(({ path }) => path === WORKER_URL).length;
    if (cacheControl === REVALIDATE) {
      await expect.poll(() => page.locator("#apply-update").isVisible(), { timeout: 15_000 }).toBe(true);
      expect(workerRequests).toBeGreaterThan(0);
    } else {
      expect(workerRequests).toBe(0);
      await expect(page.locator("#apply-update")).toHaveCount(0);
    }
    const waiting = await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
    expect(waiting).toBe(cacheControl === REVALIDATE);
    console.log(JSON.stringify({ case: "worker-update-via-cache-all", cacheControl, workerRequests, waiting }));
  });
}

for (const cacheControl of [REVALIDATE, ZERO_AGE, LONG]) {
  test(`HTML ${cacheControl}: a same-URL read after deployment has the expected freshness`, async ({ browser, fixtureServer }) => {
    // Block Service Workers to isolate the browser HTTP cache from the platform's navigation strategy.
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await page.goto(fixtureServer.url("/app/"));
      fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: "/app/index.html", headers: { "Cache-Control": cacheControl } }]);
      const target = fixtureServer.url("/app/index.html?header-causality");
      fixtureServer.clearRequests();
      const first = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return { body: await response.text(), cacheControl: response.headers.get("cache-control") };
      }, target);
      expect(first.cacheControl).toBe(cacheControl);

      fixtureServer.deploy("v2");
      const second = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return response.text();
      }, target);
      const requests = fixtureServer.requests().filter(({ path }) => path === "/app/index.html").length;
      expect(second === first.body).toBe(cacheControl === LONG);
      expect(requests).toBe(cacheControl === LONG ? 1 : 2);
      const navigation = await page.goto(target);
      const navigationHtml = await navigation?.text();
      const pageVersion = await page.locator("#version").textContent().catch(() => null);
      expect(navigationHtml === first.body).toBe(cacheControl === LONG);
      expect(pageVersion).toBe(cacheControl === LONG ? "v1" : "v2");
      const plan = releaseInput(await readShippedWorker(example, "v1"));
      const verdict = verifyHtmlHeaders(plan, await collectHeaders(page, fixtureServer, htmlHeaderPaths(plan))).ok;
      expect(verdict).toBe(cacheControl === REVALIDATE);
      console.log(JSON.stringify({ case: "html-freshness", cacheControl, serverRequests: requests, gotNewHtml: second !== first.body, navigationMatchesOldHtml: navigationHtml === first.body, pageVersion, verifierPass: verdict }));
    } finally {
      await context.close();
    }
  });
}

for (const cacheControl of [REVALIDATE, ZERO_AGE, LONG]) {
  test(`controlled shell ${cacheControl}: records the page version after a deployment`, async ({ page, context, fixtureServer }) => {
    // The shell is /app/. Override every generated file path after this broad rule so only that URL changes policy.
    const files = [...new Set([...(await publishedPaths(example, "v1")), ...(await publishedPaths(example, "v2"))])];
    fixtureServer.setHeaderRules([
      { pathPrefix: "/app/", headers: { "Cache-Control": cacheControl } },
      ...files.map((path) => ({
        pathPrefix: path,
        headers: { "Cache-Control": path.startsWith("/app/assets/") ? IMMUTABLE : REVALIDATE },
      })),
    ]);
    await installAndControl(page, fixtureServer);
    fixtureServer.clearRequests();
    fixtureServer.deploy("v2");
    const next = await context.newPage();
    try {
      await next.goto(fixtureServer.url("/app/"));
      const version = await next.locator("#version").textContent();
      const shellRequests = fixtureServer.requests().filter(({ path }) => path === "/app/").length;
      expect(await next.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(fixtureServer.url(WORKER_URL));
      expect(version).toBe(cacheControl === LONG ? "v1" : "v2");
      expect(shellRequests).toBe(cacheControl === LONG ? 0 : 1);
      const shellResponse = await next.request.get(fixtureServer.url("/app/"));
      const workerResponse = await next.request.get(fixtureServer.url(WORKER_URL));
      expect(shellResponse.headers()["cache-control"]).toBe(cacheControl);
      expect(workerResponse.headers()["cache-control"]).toBe(REVALIDATE);
      console.log(JSON.stringify({ case: "controlled-shell", cacheControl, shellRequests, version }));
    } finally {
      await next.close();
    }
  });
}

for (const resource of ["manifest", "fingerprinted-asset"] as const) {
  for (const cacheControl of resource === "manifest" ? [REVALIDATE, ZERO_AGE, LONG] : [REVALIDATE, ZERO_AGE, LONG, IMMUTABLE]) {
    test(`${resource} ${cacheControl}: repeated reads show the HTTP-cache effect`, async ({ browser, fixtureServer }) => {
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        await page.goto(fixtureServer.url("/app/"));
        const path = resource === "manifest"
          ? MANIFEST_URL
          : (await readShippedWorker(example, "v1")).precache.find(({ url, revision }) => revision === null && url.endsWith(".js"))?.url;
        expect(path).toBeDefined();
        if (path === undefined) throw new Error("The built site has no fingerprinted JS asset");
        fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: path, headers: { "Cache-Control": cacheControl } }]);
        const target = fixtureServer.url(`${path}?header-causality`);
        fixtureServer.clearRequests();
        const values = await page.evaluate(async (url) => {
          const first = await fetch(url);
          const firstValue = { body: await first.text(), cacheControl: first.headers.get("cache-control") };
          const second = await fetch(url);
          return { first: firstValue, second: await second.text() };
        }, target);
        expect(values.first.cacheControl).toBe(cacheControl);
        expect(values.second).toBe(values.first.body);
        const requests = fixtureServer.requests().filter((request) => request.path === path).length;
        expect(requests).toBe(cacheControl === LONG || cacheControl === IMMUTABLE ? 1 : 2);
        const plan = releaseInput(await readShippedWorker(example, "v1"));
        const verdict = verifyResponseHeaders(plan, await collectHeaders(page, fixtureServer, headerPaths(plan))).ok;
        expect(verdict).toBe(resource === "manifest" ? cacheControl === REVALIDATE : cacheControl === IMMUTABLE);
        console.log(JSON.stringify({ case: resource, cacheControl, serverRequests: requests, verifierPass: verdict }));
      } finally {
        await context.close();
      }
    });
  }
}

for (const cacheControl of [REVALIDATE, ZERO_AGE, LONG]) {
  test(`manifest ${cacheControl}: a changed name is or is not fetched after deployment`, async ({ browser, fixtureServer }) => {
    const manifestFile = join(siteRoot(example, "v2"), "app", "manifest.webmanifest");
    const original = await readFile(manifestFile, "utf8");
    const manifest = JSON.parse(original) as Record<string, unknown>;
    expect(typeof manifest["name"]).toBe("string");
    const changedName = `${String(manifest["name"])} Updated`;
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: MANIFEST_URL, headers: { "Cache-Control": cacheControl } }]);
      const page = await context.newPage();
      await page.goto(fixtureServer.url("/app/"));
      const target = fixtureServer.url(`${MANIFEST_URL}?changed-name-probe`);
      fixtureServer.clearRequests();
      const first = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return { cacheControl: response.headers.get("cache-control"), name: (await response.json() as { name: string }).name };
      }, target);
      expect(first.cacheControl).toBe(cacheControl);
      expect(first.name).not.toBe(changedName);

      await writeFile(manifestFile, JSON.stringify({ ...manifest, name: changedName }), "utf8");
      fixtureServer.deploy("v2");
      const secondName = await page.evaluate(async (url) => (await (await fetch(url)).json() as { name: string }).name, target);
      const requests = fixtureServer.requests().filter(({ path }) => path === MANIFEST_URL).length;
      expect(secondName).toBe(cacheControl === LONG ? first.name : changedName);
      expect(requests).toBe(cacheControl === LONG ? 1 : 2);
      console.log(JSON.stringify({ case: "manifest-changed-name", cacheControl, serverRequests: requests, gotNewName: secondName === changedName }));
    } finally {
      await writeFile(manifestFile, original, "utf8");
      await context.close();
    }
  });
}
