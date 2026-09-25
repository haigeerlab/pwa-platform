import {
  expect,
  expectLifecycleSequence,
  readRegistration,
  test,
  waitForControllerChange,
} from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { collectedEvents, deployAndWait, installAndControl, pageApplyUpdate } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("deploying a second build of the same app", () => {
  test("finds a waiting worker once the new version is served", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await deployAndWait(page, fixtureServer, "v2");

    // Both versions came out of the same plugin over the same application; only the shell's content differs, so
    // the asset hash and therefore the injected precache manifest differ too. That is what makes the browser see
    // a genuinely new worker rather than a byte-identical one it would ignore.
    const registration = await readRegistration(page, SHELL_URL);
    expect(registration?.waiting).toBe(fixtureServer.url(WORKER_URL));
    expect(registration?.active).toBe(fixtureServer.url(WORKER_URL));
  });

  test("tells the page an update is waiting", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await deployAndWait(page, fixtureServer, "v2");

    expectLifecycleSequence(await collectedEvents(page), ["registered", "update-waiting"]);
  });

  test("lets the page hand control to the new worker", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await deployAndWait(page, fixtureServer, "v2");

    // The platform never takes over on its own: the update waits until the page says so (ADR-0005). What has to
    // be proved is that control actually moved — `applyUpdate()` returning true only says the message was sent.
    //
    // The harness waits on a `controllerchange` event with an explicit timeout, so a new worker that installs and
    // then merely waits fails here. An earlier version of this assertion polled with `waitForFunction` and an
    // async predicate; Playwright does not await such a predicate, so the returned Promise was truthy on the
    // first poll and the assertion passed in about 4ms no matter what the worker did.
    const after = await waitForControllerChange(page, async () => {
      expect(await pageApplyUpdate(page)).toBe(true);
    });

    expect(after.waiting).toBeNull();
    expect(after.active).toBe(fixtureServer.url(WORKER_URL));
  });
});
