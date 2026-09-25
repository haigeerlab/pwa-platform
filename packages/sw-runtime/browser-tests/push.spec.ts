// Real-browser evidence for the platform worker's `push` and `notificationclick` listeners (spec/push-module.md
// "测试策略"; ADR-0021; tasks/push-module/plan.md T7). Pushes are delivered through the CDP
// `ServiceWorker.deliverPushMessage` command directly to the worker, exactly as task T1's throwaway probe proved
// works on local Chrome — no real push service or subscription is involved (CLAUDE.md forbids reaching one).
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, SHELL_URL } from "./fixture-site.js";
import { installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

/** Structural type for the session `context.newCDPSession()` returns; the CDPSession name itself is not exported by `@playwright/test`. */
type CDPSession = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

type NotificationSnapshot = {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: unknown;
};

/**
 * Opens a CDP session on `page`, enables the ServiceWorker domain and resolves once a registration whose
 * `scopeURL` is exactly `scopeUrl` has been reported. The worker must already be installed (`installAndControl`)
 * before this is called: enabling the domain replays the currently known registrations, so the target one arrives
 * immediately rather than requiring a fresh registration event.
 */
async function openSessionAndFindRegistration(
  context: BrowserContext,
  page: Page,
  scopeUrl: string,
  timeout = 10_000,
): Promise<{ readonly session: CDPSession; readonly registrationId: string }> {
  const session = await context.newCDPSession(page);
  const registrationId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      session.off("ServiceWorker.workerRegistrationUpdated", onUpdate);
      reject(new Error(`No ServiceWorker registration for scope ${scopeUrl} within ${timeout} ms`));
    }, timeout);
    function onUpdate(params: { registrations: readonly { registrationId: string; scopeURL: string; isDeleted: boolean }[] }): void {
      const match = params.registrations.find((registration) => !registration.isDeleted && registration.scopeURL === scopeUrl);
      if (match === undefined) return;
      clearTimeout(timer);
      session.off("ServiceWorker.workerRegistrationUpdated", onUpdate);
      resolve(match.registrationId);
    }
    session.on("ServiceWorker.workerRegistrationUpdated", onUpdate);
    void session.send("ServiceWorker.enable");
  });
  return { session, registrationId };
}

/** Delivers `text` as the push event's `data` to the worker behind `registrationId`, via CDP (no real push service). */
function deliverPush(session: CDPSession, origin: string, registrationId: string, text: string): Promise<void> {
  return session.send("ServiceWorker.deliverPushMessage", { origin, registrationId, data: text }).then(() => undefined);
}

/** Reads every notification the active registration's `getNotifications()` currently returns. */
function readNotifications(page: Page): Promise<readonly NotificationSnapshot[]> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = (await registration?.getNotifications()) ?? [];
    return notifications.map((notification) => ({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      data: notification.data as unknown,
    }));
  });
}

/**
 * Waits until a notification with `tag` is/isn't showing, depending on `present`: first a 2 s pause, then one
 * `getNotifications()` read every 2 s — the same rhythm as the network suite's `waitForTag`
 * (packages/examples-browser-e2e/browser-tests-network/push.network.spec.ts).
 *
 * The rhythm is the point. On Chrome 153, querying `getNotifications()` in a tight loop right after a notification is
 * created loses that notification permanently — it never becomes listable, even when re-checked 10 s later — whether
 * it came from CDP delivery (97.5% of 40), a page-side `showNotification()` (55% of 40) or a persistent context
 * (10 of 10); querying after a pause loses 0–2.5% (XP6 in tasks/push-module/verification.md). The same holds for the
 * `present: false` wait: a tight loop could make a notification vanish without anything closing it. With this rhythm
 * each push is delivered once: the same-tag redelivery loop that used to paper over the loss was removed after 60 of
 * 60 single deliveries passed (tasks/push-module/verification.md, "XP6 后续").
 */
async function waitForTagState(page: Page, tag: string, present: boolean, timeout = 10_000): Promise<void> {
  await page.waitForTimeout(2_000);
  await expect
    .poll(async () => (await readNotifications(page)).some((notification) => notification.tag === tag), {
      timeout,
      intervals: [2_000],
      message: `Notification tag "${tag}" did not become ${present ? "present" : "absent"} within ${timeout} ms`,
    })
    .toBe(present);
}

/**
 * True for a notification the platform worker itself showed via `registration.showNotification` (spec/push-module.md
 * "设计 / 2"): the worker always sets `data: { url, data }`, an object carrying an own `url` property, even when both
 * are `null`. A notification without that shape was not produced by `attachPlatformWorker`'s `push` listener.
 */
function isPlatformShown(notification: NotificationSnapshot): boolean {
  const data = notification.data;
  return typeof data === "object" && data !== null && !Array.isArray(data) && Object.prototype.hasOwnProperty.call(data, "url");
}

test.describe("push", () => {
  test("a qualifying push is shown with the mapped title, body, tag and data", async ({ page, context, fixtureServer }) => {
    const origin = fixtureServer.origin;
    const scopeUrl = fixtureServer.url(SHELL_URL);
    await context.grantPermissions(["notifications"], { origin });
    await installAndControl(page, fixtureServer);

    const { session, registrationId } = await openSessionAndFindRegistration(context, page, scopeUrl);
    const payload = { v: 1, title: "T:hello", body: "b1", tag: "qualifying", url: "/app/x", data: "d" };
    await deliverPush(session, origin, registrationId, JSON.stringify(payload));
    await waitForTagState(page, "qualifying", true);

    const notifications = await readNotifications(page);
    const shown = notifications.filter((notification) => notification.tag === "qualifying");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: "T:hello", body: "b1", tag: "qualifying", data: { url: "/app/x", data: "d" } });
  });

  test("a disqualifying push shows no platform notification", async ({ page, context, fixtureServer }) => {
    const origin = fixtureServer.origin;
    const scopeUrl = fixtureServer.url(SHELL_URL);
    await context.grantPermissions(["notifications"], { origin });
    await installAndControl(page, fixtureServer);

    const { session, registrationId } = await openSessionAndFindRegistration(context, page, scopeUrl);
    // Not JSON at all, and JSON with an unknown field: both fail checkPushPayload before showNotification is ever
    // reached, so neither can produce a worker-shown notification (src/worker/handlers.ts "push" listener).
    //
    // Each is delivered DISQUALIFYING_REPEATS times, not once. A notification the worker did show can still fail to
    // become listable: T7 measured about half, which XP6 later traced to T7's own tight `getNotifications()` loop; with
    // waitForTagState's sparse queries the residual loss is 0–2.5% (tasks/push-module/verification.md). The repeats
    // keep a worker that wrongly shows disqualifying pushes from slipping through on that residual loss.
    const DISQUALIFYING_REPEATS = 8;
    for (let repeat = 0; repeat < DISQUALIFYING_REPEATS; repeat += 1) {
      await deliverPush(session, origin, registrationId, "not-json-at-all");
      await deliverPush(session, origin, registrationId, JSON.stringify({ v: 1, title: "t", tag: `bad-${repeat}`, extra: "x" }));
    }
    // The sentinel is delivered last and is the only qualifying push in this test; waiting for it proves the two
    // invalid deliveries above were already handled (CDP delivers to the same worker in order) without needing a
    // fixed sleep.
    await deliverPush(session, origin, registrationId, JSON.stringify({ v: 1, title: "Sentinel", tag: "sentinel", url: "/app/x" }));
    await waitForTagState(page, "sentinel", true);

    const notifications = await readNotifications(page);
    // Observed here (local Chrome 153, CDP-delivered push, no real subscription — see the T7 record in
    // tasks/push-module/plan.md): `getNotifications()` shows nothing at all for the two disqualifying deliveries,
    // not even Chrome's generic "site was updated" notification (spec/push-module.md's warning about that generic
    // prompt describes a real, subscribed push; it is not exercised by this CDP-only harness). The assertion below
    // does not rely on that observation staying true, though: the only notification the platform *worker* itself
    // shows carries `data: { url, data }` (isPlatformShown) — asserting that set is exactly the sentinel proves the
    // disqualifying pushes produced no platform notification even if Chrome starts adding a generic one of its own
    // here (it would be filtered out for lacking that shape).
    const platformShown = notifications.filter(isPlatformShown);
    expect(platformShown.map((notification) => notification.tag)).toEqual(["sentinel"]);
  });

  test("a synthetic notificationclick dispatched in the real worker runs the handler and closes the notification", async ({
    page,
    context,
    fixtureServer,
  }) => {
    const origin = fixtureServer.origin;
    const scopeUrl = fixtureServer.url(SHELL_URL);
    await context.grantPermissions(["notifications"], { origin });
    await installAndControl(page, fixtureServer);

    const { session, registrationId } = await openSessionAndFindRegistration(context, page, scopeUrl);
    const payload = { v: 1, title: "Click me", tag: "click-target", url: "/app/x" };
    await deliverPush(session, origin, registrationId, JSON.stringify(payload));
    await waitForTagState(page, "click-target", true);

    const [worker] = context.serviceWorkers();
    if (worker === undefined) throw new Error("No active service worker to dispatch the synthetic event in");
    // Dispatched inside the real worker (not the page), the way a browser-generated notificationclick would be.
    // T1's probe found `clients.openWindow` rejects here for lack of user activation on a synthetic event, so this
    // only proves the handler ran and closed the notification (event.notification.close(), src/worker/handlers.ts)
    // — opening or focusing a window is not and cannot be asserted here; it is registered as evidence not obtained
    // (tasks/push-module/plan.md T1 record, spec/push-module.md "测试策略").
    await worker.evaluate(async () => {
      // Typed by hand instead of the `ServiceWorkerGlobalScope`/`NotificationEvent` ambient globals: this file is
      // type-checked under tsconfig.browser.json's DOM lib (it also drives page-side code), which cannot include
      // the WebWorker lib those globals come from without conflicting with DOM's own `self` (that split is why
      // sw-runtime has a separate tsconfig.worker.json for src/worker/**). The body still runs inside the real
      // worker, unaffected by how it is typed here.
      type NotificationEventCtor = new (type: string, init: { notification: Notification }) => Event;
      const workerGlobal = self as unknown as {
        registration: ServiceWorkerRegistration;
        dispatchEvent(event: Event): boolean;
        NotificationEvent: NotificationEventCtor;
      };
      const [notification] = await workerGlobal.registration.getNotifications({ tag: "click-target" });
      if (notification === undefined) throw new Error("No notification with tag click-target to dispatch a click for");
      workerGlobal.dispatchEvent(new workerGlobal.NotificationEvent("notificationclick", { notification }));
    });

    await waitForTagState(page, "click-target", false);
    const notifications = await readNotifications(page);
    expect(notifications.some((notification) => notification.tag === "click-target")).toBe(false);
  });
});
