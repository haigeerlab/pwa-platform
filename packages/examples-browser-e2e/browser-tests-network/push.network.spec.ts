// Real subscribe and real delivery through FCM (spec/push-module.md "修订：真实订阅与真实送达的证据收尾", task XP4).
// Nothing here is simulated: the React example's own push panel subscribes with the browser's real push service,
// the test-only sender (push-tools/sender.ts) encrypts and signs a message the way a business backend would, and the
// platform worker built by the example's own Vite config shows it.
//
// Requires the internet. Every step that depends on it fails with a message naming that step; nothing is skipped.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHROME_PATH_ENV, startFixtureServer, type FixtureServer } from "@pwa-platform/browser-test-harness";
import { createPushPayload } from "@pwa-platform/push/server";
import { chromium, expect, test as base, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { installAndControl } from "../browser-tests/page.js";
import { fixtureSite } from "../browser-tests/sites.js";
import { createVapidKeys, sendTestPush, type PushSubscriptionLike, type VapidKeyPair } from "../push-tools/sender.js";

type NetworkFixtures = {
  readonly fixtureServer: FixtureServer;
  readonly context: BrowserContext;
  readonly page: Page;
};

const test = base.extend<NetworkFixtures>({
  // eslint-disable-next-line no-empty-pattern
  fixtureServer: async ({}, use) => {
    const server = await startFixtureServer(fixtureSite("react"));
    await use(server);
    await server.close();
  },
  // A persistent context, one fresh profile directory per test. Chrome rejects pushManager.subscribe() in the
  // non-persistent (incognito-like) contexts that `browser.newContext()` creates with "AbortError: Registration
  // failed - permission denied", whatever the permission state; background networking flags make no difference.
  // Measured on 2026-09-24, Chrome 153 — this corrects the attribution recorded in ADR-0021.
  context: async ({ fixtureServer }, use) => {
    const profile = await mkdtemp(join(tmpdir(), "pwa-push-network-"));
    const executablePath = process.env[CHROME_PATH_ENV];
    const context = await chromium.launchPersistentContext(profile, {
      ...(executablePath ? { executablePath } : { channel: "chrome" as const }),
      headless: true,
    });
    try {
      await context.grantPermissions(["notifications", "clipboard-read", "clipboard-write"], {
        origin: fixtureServer.origin,
      });
      await use(context);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
});

type NotificationSnapshot = {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: unknown;
};

function readNotifications(page: Page): Promise<NotificationSnapshot[]> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.getNotifications()).map(({ title, body, tag, data }) => ({
      title,
      body,
      tag,
      data: data as unknown,
    }));
  });
}

/** Same criterion as sw-runtime's push.spec.ts: the platform worker always sets `data: { url, data }`. */
function isPlatformShown(notification: NotificationSnapshot): boolean {
  const data = notification.data;
  return typeof data === "object" && data !== null && Object.prototype.hasOwnProperty.call(data, "url");
}

/**
 * Waits for a notification tagged `tag`, querying sparsely on purpose. Task XP6 (2026-09-24) found that calling
 * `getNotifications()` in a tight loop right after a notification is created makes Chrome lose it for good — 55%
 * even for a plain page-side `showNotification()`, regardless of delivery path or context type — while a later,
 * sparse query sees 97.5–100%. Polling every 100 ms, as `expect.poll` does by default, triggers exactly that.
 */
async function waitForTag(page: Page, tag: string, timeout = 30_000): Promise<NotificationSnapshot> {
  let found: NotificationSnapshot | undefined;
  await page.waitForTimeout(2_000);
  await expect
    .poll(
      async () => {
        found = (await readNotifications(page)).find((notification) => notification.tag === tag);
        return found !== undefined;
      },
      { timeout, intervals: [2_000], message: `no notification tagged "${tag}" arrived through FCM within ${timeout} ms` },
    )
    .toBe(true);
  return found as NotificationSnapshot;
}

/**
 * Subscribes through the example's push panel, exactly as a user would, and reads the subscription back from the
 * panel's copy button: the page never renders the endpoint (spec: "页面不渲染 endpoint").
 */
async function subscribeThroughPanel(page: Page, keys: VapidKeyPair): Promise<PushSubscriptionLike> {
  // Notification permission is granted by the context fixture, so the state is "not-subscribed", never "prompt".
  await expect(page.locator("#push-state")).toHaveText("not-subscribed");
  await page.locator("#push-key").fill(keys.publicKey);
  await page.locator("#push-subscribe").click();
  // A fresh profile registers with FCM on its first subscribe. Measured on 2026-09-24 over 12 fresh profiles: 5–6 s
  // typical, 14 s worst; one run in the first full suite still exceeded 30 s. 60 s bounds the tail, not a hang.
  await expect(page.locator("#push-result"), "subscribe through the real push service").toHaveText("subscribed", {
    timeout: 60_000,
  });
  await expect(page.locator("#push-state")).toHaveText("subscribed");

  await page.locator("#push-copy").click();
  await expect(page.locator("#push-result")).toHaveText("copied");
  const subscription = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as PushSubscriptionLike;
  expect(new URL(subscription.endpoint).protocol).toBe("https:");
  return subscription;
}

async function send(subscription: PushSubscriptionLike, keys: VapidKeyPair, text: string): Promise<number> {
  const { status } = await sendTestPush(subscription, keys, text);
  return status;
}

/** Tag of the warm-up notification `subscribeDeliverable` sends; assertions ignore it. */
const WARM_UP_TAG = "warm-up";

/**
 * Subscribes through the panel and proves the push service will accept messages for the new subscription before
 * the test sends its own.
 *
 * Why: on 2026-09-24, 3 of 15 brand-new subscriptions made from this machine were answered 410 on their very first
 * message. One turned into 201 after about 5 s; two still answered 410 after 30 s, i.e. the push service treated
 * them as dead from the moment they were created. The cause is not known (many fresh registrations from one address
 * in a short time is a guess, not a finding). The platform is not involved: the subscription is between Chrome and
 * FCM, and the platform worker never sees a message the service refuses. So a refused fresh subscription is retried
 * — resend for up to 8 s, then unsubscribe and subscribe again, at most 3 subscriptions — and every retry is
 * recorded as a test annotation so the evidence shows how often it happened.
 */
async function subscribeDeliverable(
  page: Page,
  keys: VapidKeyPair,
  testInfo: TestInfo,
): Promise<PushSubscriptionLike> {
  const warmUp = createPushPayload({ title: "warm-up", tag: WARM_UP_TAG });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      await page.locator("#push-unsubscribe").click();
      await expect(page.locator("#push-state")).toHaveText("not-subscribed");
    }
    const subscription = await subscribeThroughPanel(page, keys);
    const statuses: number[] = [];
    const deadline = Date.now() + 8_000;
    for (;;) {
      const status = await send(subscription, keys, warmUp);
      statuses.push(status);
      // Only 404/410 is the refusal described above. Any other status (403 for a VAPID mismatch, 400, 413...) is a
      // real failure and must surface as itself, not be retried and relabelled as the environment.
      if (status !== 404 && status !== 410) {
        expect(status, `warm-up for subscription ${attempt} (earlier: ${statuses.join(",")})`).toBe(201);
        break;
      }
      if (Date.now() >= deadline) break;
      await page.waitForTimeout(1_000);
    }
    if (statuses.length > 1 || statuses[0] !== 201) {
      testInfo.annotations.push({
        type: "fresh-subscription-refused",
        description: `subscription ${attempt}: ${statuses.join(",")}`,
      });
    }
    if (statuses.at(-1) === 201) {
      await waitForTag(page, WARM_UP_TAG);
      return subscription;
    }
  }
  throw new Error("the push service answered 404/410 for 3 fresh subscriptions in a row (see annotations)");
}

test.describe("push through the real push service", () => {
  test("the page subscribes with a real endpoint and none of it is rendered", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    const subscription = await subscribeThroughPanel(page, createVapidKeys());

    // Booleans on purpose: a failing `not.toContain` would print the endpoint and keys into the report.
    const html = await page.content();
    expect(html.includes(subscription.endpoint), "endpoint rendered in the page").toBe(false);
    expect(html.includes(subscription.keys.p256dh), "p256dh rendered in the page").toBe(false);
    expect(html.includes(subscription.keys.auth), "auth rendered in the page").toBe(false);
  });

  test("a payload built with createPushPayload arrives and the platform worker shows it", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await installAndControl(page, fixtureServer);
    const keys = createVapidKeys();
    const subscription = await subscribeDeliverable(page, keys, testInfo);

    const tag = `qualifying-${Date.now()}`;
    const text = createPushPayload({ title: "Approval waiting", body: "Ticket 42", tag, url: "/app/tickets/42", data: "t42" });
    expect(await send(subscription, keys, text), "FCM accepts the message").toBe(201);

    const shown = await waitForTag(page, tag);
    expect(shown).toMatchObject({ title: "Approval waiting", body: "Ticket 42", tag, data: { url: "/app/tickets/42", data: "t42" } });
    expect(isPlatformShown(shown)).toBe(true);
  });

  test("a payload the platform format rejects is accepted by FCM but shows no platform notification", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await installAndControl(page, fixtureServer);
    const keys = createVapidKeys();
    const subscription = await subscribeDeliverable(page, keys, testInfo);

    // An unknown field disqualifies the payload (closed field set). It is sent first, and a qualifying sentinel
    // after it: once the sentinel is shown, the rejected message has had the same route and time to arrive. FCM does
    // not promise ordering, so arrival of the rejected message is inferred, not observed; what makes this assertion
    // able to fail is the mutation recorded in tasks/push-module/verification.md (format check admitting unknown
    // fields turns it red).
    const rejected = JSON.stringify({ v: 1, title: "must not show", tag: "rejected", extra: true });
    expect(await send(subscription, keys, rejected), "FCM accepts the message").toBe(201);
    const sentinelTag = `sentinel-${Date.now()}`;
    expect(await send(subscription, keys, createPushPayload({ title: "sentinel", tag: sentinelTag }))).toBe(201);
    await waitForTag(page, sentinelTag);
    await page.waitForTimeout(2_000);

    const platformShown = (await readNotifications(page)).filter(
      (notification) => isPlatformShown(notification) && notification.tag !== WARM_UP_TAG,
    );
    expect(platformShown.map((notification) => notification.tag)).toEqual([sentinelTag]);
  });

  test("after unsubscribing, the push service answers 404 or 410 for the old endpoint", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await installAndControl(page, fixtureServer);
    const keys = createVapidKeys();
    // Deliverable first: otherwise a 410 below could be the fresh-subscription refusal, not the unsubscription.
    const subscription = await subscribeDeliverable(page, keys, testInfo);

    await page.locator("#push-unsubscribe").click();
    await expect(page.locator("#push-result")).toHaveText("unsubscribed");
    await expect(page.locator("#push-state")).toHaveText("not-subscribed");

    // The push service may take a moment to learn about the unsubscription; poll rather than send once. This is the
    // signal docs/guides/push-integration.md tells backends to clean up on.
    await expect
      .poll(async () => [404, 410].includes(await send(subscription, keys, createPushPayload({ title: "after unsubscribe" }))), {
        timeout: 30_000,
        intervals: [1_000, 2_000, 5_000],
        message: "the old endpoint never answered 404 or 410",
      })
      .toBe(true);
  });
});
