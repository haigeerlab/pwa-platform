// Real-browser evidence for the page entry (getPushState/subscribePush/unsubscribePush) against a real service
// worker registration (spec/push-module.md "测试策略"; ADR-0021; tasks/push-module/plan.md T7 part B). Unit tests
// (test/client/*.test.ts) already cover every branch with a fake `navigator`; this suite proves the same functions
// work against Chrome's actual `navigator.serviceWorker` / `PushManager` / `Notification` objects, in particular the
// two paths T1's probe found only a real browser can show: what state Chrome actually reports without the
// notifications permission, and that `pushManager.subscribe()` genuinely fails (no push service is reachable —
// CLAUDE.md forbids reaching one) rather than hanging or silently succeeding.
import { createECDH } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, registerWorker, test, waitForWorkerState } from "@pwa-platform/browser-test-harness";
import { APP_SCOPE, FIXTURE_SITE, OTHER_SCOPE, OTHER_WORKER_URL, SHELL_URL, WORKER_URL } from "./fixture-site.js";

test.use({ fixtureSite: FIXTURE_SITE });

type PwaPushState = "unsupported" | "no-registration" | "denied" | "prompt" | "subscribed" | "not-subscribed";

/** Structural shape of the page's `window.__pwaPush` (site/app/index.html), which re-exposes the page entry's module. */
type PushApi = {
  getPushState(target: { readonly scope: string }): Promise<PwaPushState>;
  subscribePush(target: { readonly scope: string }, options: { readonly applicationServerKey: string }): Promise<unknown>;
  unsubscribePush(target: { readonly scope: string }): Promise<unknown>;
};

type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string };

function getState(page: Page, scope: string): Promise<PwaPushState> {
  return page.evaluate((scope) => (window as unknown as { __pwaPush: PushApi }).__pwaPush.getPushState({ scope }), scope);
}

/**
 * Calls `subscribePush`/`unsubscribePush`, turning a rejection into `{ ok: false, code }` instead of an
 * evaluate-level throw: `PwaPushClientError`'s `message` is always exactly its `code` (src/client/index.ts), so
 * this loses nothing the tests below need.
 */
function subscribe(page: Page, scope: string, applicationServerKey: string): Promise<Outcome> {
  return page.evaluate(
    async ({ scope, applicationServerKey }) => {
      const api = (window as unknown as { __pwaPush: PushApi }).__pwaPush;
      try {
        const value = await api.subscribePush({ scope }, { applicationServerKey });
        return { ok: true as const, value };
      } catch (error) {
        return { ok: false as const, code: error instanceof Error ? error.message : String(error) };
      }
    },
    { scope, applicationServerKey },
  );
}

function unsubscribe(page: Page, scope: string): Promise<Outcome> {
  return page.evaluate(async (scope) => {
    const api = (window as unknown as { __pwaPush: PushApi }).__pwaPush;
    try {
      const value = await api.unsubscribePush({ scope });
      return { ok: true as const, value };
    } catch (error) {
      return { ok: false as const, code: error instanceof Error ? error.message : String(error) };
    }
  }, scope);
}

async function openFixture(page: Page, fixtureServer: { url(path: string): string }): Promise<void> {
  await page.goto(fixtureServer.url(SHELL_URL));
}

/** A syntactically valid uncompressed P-256 public key (65 bytes, starting 0x04), generated fresh per call. */
function validApplicationServerKey(): string {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return toBase64Url(ecdh.getPublicKey(null, "uncompressed"));
}

/** 64 bytes instead of the required 65 — same shape as the invalid-key cases in test/client/subscribe-push.test.ts. */
function invalidLengthApplicationServerKey(): string {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return toBase64Url(ecdh.getPublicKey(null, "uncompressed").subarray(0, 64));
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test.describe("push client, real registration", () => {
  test("no worker registered: getPushState resolves no-registration", async ({ page, fixtureServer }) => {
    await openFixture(page, fixtureServer);
    expect(await getState(page, APP_SCOPE)).toBe("no-registration");
  });

  test("registered, notifications granted: getPushState resolves not-subscribed", async ({ page, context, fixtureServer }) => {
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    expect(await getState(page, APP_SCOPE)).toBe("not-subscribed");
  });

  test("registered, notifications not granted: getPushState resolves the state Chrome actually reports", async ({
    page,
    fixtureServer,
  }) => {
    // No context.grantPermissions call in this test: the notifications permission stays at whatever a fresh
    // Playwright Chromium context defaults to.
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    // Observed here (local Chrome 153.0.8010.50, headless, no grantPermissions call): a fresh Playwright Chromium
    // context's Notification.permission is "default" — Chromium leaves the notifications permission promptable
    // rather than auto-denying it — so getPushState maps that to "prompt". Asserted exactly, per T7's instruction
    // to record what Chrome actually reports.
    expect(await getState(page, APP_SCOPE)).toBe("prompt");
  });

  test("subscribePush with a valid key rejects push.subscribe-failed (no push service is reachable) and getPushState stays not-subscribed", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    const outcome = await subscribe(page, APP_SCOPE, validApplicationServerKey());
    expect(outcome).toEqual({ ok: false, code: "push.subscribe-failed" });
    expect(await getState(page, APP_SCOPE)).toBe("not-subscribed");
  });

  test("subscribePush with an invalid key rejects push.invalid-key before the browser is touched", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    const outcome = await subscribe(page, APP_SCOPE, invalidLengthApplicationServerKey());
    expect(outcome).toEqual({ ok: false, code: "push.invalid-key" });
  });

  test("unsubscribePush with no subscription resolves null", async ({ page, context, fixtureServer }) => {
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    expect(await unsubscribe(page, APP_SCOPE)).toEqual({ ok: true, value: null });
  });

  test("a registration at a different scope is not mistaken for one at the queried scope", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: OTHER_WORKER_URL, scope: OTHER_SCOPE });
    await waitForWorkerState(page, fixtureServer.url(OTHER_SCOPE), "active");

    expect(await getState(page, APP_SCOPE)).toBe("no-registration");
  });

  test("a registration at a broader scope is not mistaken for one at a narrower queried scope", async ({
    page,
    context,
    fixtureServer,
  }) => {
    // The browser's own getRegistration(url) would find the /app/ registration for a query URL under it (a
    // broader scope is a valid prefix match for a narrower query) — this is exactly what getExactRegistration's
    // `registration.scope === ...` comparison exists to reject (src/client/index.ts, spec/push-module.md "设计 /
    // 3": "按 scope 取注册且 scope 完全相同").
    await context.grantPermissions(["notifications"], { origin: fixtureServer.origin });
    await openFixture(page, fixtureServer);
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, fixtureServer.url(APP_SCOPE), "active");

    expect(await getState(page, `${APP_SCOPE}sub/`)).toBe("no-registration");
  });
});
