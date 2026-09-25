import {
  expect,
  expectLifecycleSequence,
  readRegistration,
  test,
  waitForControllerChange,
  waitForWorkerState,
} from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import {
  collectedEvents,
  documentMark,
  installAndControl,
  installAndControlWithUpdateCheck,
  markDocument,
  pageApplyUpdate,
  pageCheckForUpdate,
  setPageVisibility,
  waitForActiveWorkerActivated,
  waitForClientEvent,
} from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

/** Above the 60 000 ms lower bound the spec sets; `page.clock` fast-forwards past it instead of waiting for real. */
const AUTOMATIC_CHECK_INTERVAL_MS = 60_000;

test.describe("manual update check", () => {
  test("finds a deployed update, announces it, and lets applyUpdate take over", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await markDocument(page);

    // fixtureServer.deploy() alone, never deployAndWait(): that helper calls registration.update() itself, which
    // would prove nothing about checkForUpdate().
    fixtureServer.deploy("v2");
    expect(await pageCheckForUpdate(page)).toBe("update-available");

    await waitForWorkerState(page, SHELL_URL, "waiting");
    await waitForClientEvent(page, "update-waiting");
    // The check does not reload the page, so the mark set before deploying is still there.
    expect(await documentMark(page)).toBe("kept");
    expectLifecycleSequence(await collectedEvents(page), ["registered", "update-waiting"]);

    let applied: boolean | undefined;
    const after = await waitForControllerChange(page, async () => {
      applied = await pageApplyUpdate(page);
    });
    await waitForActiveWorkerActivated(page);

    expect(applied).toBe(true);
    expect(after.waiting).toBeNull();
    expect(after.active).toBe(fixtureServer.url(WORKER_URL));
    expect(await documentMark(page)).toBe("kept");
  });

  test("reports up-to-date and emits nothing when nothing changed", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);

    expect(await pageCheckForUpdate(page)).toBe("up-to-date");

    expect(await readRegistration(page, SHELL_URL)).toMatchObject({ waiting: null });
    expectLifecycleSequence(await collectedEvents(page), ["registered"]);
  });
});

test.describe("automatic update check", () => {
  test("finds a deployed update once the interval elapses, without reloading", async ({ page, fixtureServer }) => {
    await installAndControlWithUpdateCheck(page, fixtureServer, AUTOMATIC_CHECK_INTERVAL_MS);
    await markDocument(page);

    fixtureServer.deploy("v2");
    await page.clock.runFor(AUTOMATIC_CHECK_INTERVAL_MS);

    await waitForClientEvent(page, "update-waiting");
    expect(await documentMark(page)).toBe("kept");
    expectLifecycleSequence(await collectedEvents(page), ["registered", "update-waiting"]);
  });

  test("skips checks while hidden and catches up as soon as the page is visible again", async ({ page, fixtureServer }) => {
    await installAndControlWithUpdateCheck(page, fixtureServer, AUTOMATIC_CHECK_INTERVAL_MS);

    await setPageVisibility(page, "hidden");
    fixtureServer.deploy("v2");
    await page.clock.runFor(AUTOMATIC_CHECK_INTERVAL_MS * 3);
    // runFor() only guarantees the fake timers fired; a check it wrongly started would still reach the server
    // through a real fetch, which needs real wall-clock time to land. Give it a moment before trusting "zero".
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(fixtureServer.requests().filter((request) => request.path === WORKER_URL)).toHaveLength(0);

    await setPageVisibility(page, "visible");
    await waitForClientEvent(page, "update-waiting");

    expect(fixtureServer.requests().filter((request) => request.path === WORKER_URL).length).toBeGreaterThanOrEqual(1);
  });
});
