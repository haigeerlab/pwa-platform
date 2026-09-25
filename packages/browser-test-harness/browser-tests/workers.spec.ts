import type { Page } from "@playwright/test";
import {
  expect,
  fixturePath,
  readRegistration,
  registerWorker,
  requestFromPage,
  test,
  waitForController,
  waitForControllerChange,
  waitForWorkerState,
  type FixtureServer,
} from "../src/index.js";

const SHORT_WAIT = { timeout: 750 } as const;

/** Asks the controlling fixture worker which version it is. */
function controllerVersion(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        navigator.serviceWorker.addEventListener("message", (event: MessageEvent<{ version: string }>) => resolve(event.data.version), {
          once: true,
        });
        navigator.serviceWorker.controller?.postMessage("version");
      }),
  );
}

/** Deploys v2 of the fixture site and asks the page's registration to check for an update. */
function deployAndUpdate(page: Page, fixtureServer: FixtureServer): () => Promise<void> {
  return async () => {
    fixtureServer.deploy("v2");
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
  };
}

test.describe("registration and control", () => {
  test("registerWorker returns the scope and waitForController sees the controlling worker", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    expect(await readRegistration(page, "/")).toBeNull();

    const scope = await registerWorker(page, { scriptUrl: "/passthrough-worker.js" });
    expect(scope).toBe(fixtureServer.url("/"));
    await waitForController(page, "/passthrough-worker.js");

    const snapshot = await readRegistration(page, "/");
    expect(snapshot).toEqual({
      scope: fixtureServer.url("/"),
      installing: null,
      waiting: null,
      active: fixtureServer.url("/passthrough-worker.js"),
    });
    expect(await readRegistration(page, "/other/")).toBeNull();
  });

  test("registerWorker rejects a missing script", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await expect(registerWorker(page, { scriptUrl: "/missing-worker.js" })).rejects.toThrow();
  });

  test("waitForController fails when another worker controls the page", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/no-fetch-worker.js" });
    await waitForController(page, "/no-fetch-worker.js");
    await expect(waitForController(page, "/passthrough-worker.js", SHORT_WAIT)).rejects.toThrow();
  });
});

test.describe("deployments", () => {
  test.use({ fixtureSite: { versions: { v1: fixturePath("pages"), v2: fixturePath("pages-v2") } } });

  test("a deployed v2 waits while v1 keeps controlling the page", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/versioned-worker.js" });
    await waitForController(page, "/versioned-worker.js");
    expect(await controllerVersion(page)).toBe("v1");

    await expect(waitForWorkerState(page, "/", "waiting", SHORT_WAIT)).rejects.toThrow(/No waiting worker/);

    await deployAndUpdate(page, fixtureServer)();

    const snapshot = await waitForWorkerState(page, "/", "waiting");
    expect(snapshot.waiting).toBe(fixtureServer.url("/versioned-worker.js"));
    expect(snapshot.active).toBe(fixtureServer.url("/versioned-worker.js"));
    expect(await controllerVersion(page)).toBe("v1");
  });

  test("waitForControllerChange fails while a deployed v2 only waits at the same URL", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/versioned-worker.js" });
    await waitForController(page, "/versioned-worker.js");

    await expect(waitForControllerChange(page, deployAndUpdate(page, fixtureServer), { timeout: 2_000 })).rejects.toThrow(
      /No controllerchange within 2000 ms/,
    );

    await waitForWorkerState(page, "/", "waiting");
    expect(await controllerVersion(page)).toBe("v1");
  });

  test("waitForControllerChange resolves once a v2 at the same URL takes control", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/takeover-worker.js" });
    await waitForController(page, "/takeover-worker.js");
    expect(await controllerVersion(page)).toBe("v1");

    const snapshot = await waitForControllerChange(page, deployAndUpdate(page, fixtureServer));

    expect(snapshot.active).toBe(fixtureServer.url("/takeover-worker.js"));
    expect(await controllerVersion(page)).toBe("v2");
  });
});

test.describe("requests", () => {
  test("responses produced by a fetch handler are reported as coming from the service worker", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/passthrough-worker.js" });
    await waitForController(page, "/passthrough-worker.js");

    expect(await requestFromPage(page, "/index.html?through=worker")).toEqual({
      outcome: "response",
      status: 200,
      fromServiceWorker: true,
    });
  });

  test("requests under a worker without a fetch handler reach the server directly", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await registerWorker(page, { scriptUrl: "/no-fetch-worker.js" });
    await waitForController(page, "/no-fetch-worker.js");
    fixtureServer.clearRequests();

    expect(await requestFromPage(page, "/missing.txt")).toEqual({ outcome: "response", status: 404, fromServiceWorker: false });
    expect(fixtureServer.requests().map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /missing.txt"]);
  });

  test("the fragment of the requested URL is ignored", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));

    expect(await requestFromPage(page, "/index.html#section", { timeout: 2_000 })).toEqual({
      outcome: "response",
      status: 200,
      fromServiceWorker: false,
    });
  });

  test("offline requests report a network error and never reach the server", async ({ page, context, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    fixtureServer.clearRequests();
    await context.setOffline(true);

    const result = await requestFromPage(page, "/index.html");

    expect(result.outcome).toBe("network-error");
    expect(fixtureServer.requests()).toEqual([]);
  });
});
