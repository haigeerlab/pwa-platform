// EM4 (tasks/pwa-entry-resilience/plan.md): the real-browser scenarios from spec/pwa-entry-resilience.md's
// "修订：入口清单由业务应用提供" -> "测试策略增量". ADR-0033 (2026-09-23) removed the discovery source, the signed
// envelope and the build-time seed, so a scenario now establishes its manifest the way a real application would:
// an explicit `updateEntryManifest(data)` call on the fixture page (browser-tests/fixture-app/src/main.ts's
// `__entryUpdate`), never a file written to a fixture server.
//
// Waits are state-based throughout — an activated worker slot, the result object `__entryCheck` returns,
// `page.url()` after a navigation, or the stored IndexedDB record — never a UI element as a stand-in for "the
// operation finished" (examples-browser-e2e T9's B1 lesson, see plan.md task 7's own wording of it). The recovery
// page's button is the sole exception: it does not exist until the page's own script renders it, so waiting for it
// to appear is waiting for that render, not guessing that some unrelated async step has settled.
import {
  expect,
  test,
  waitForController,
  waitForControllerChange,
  type FixtureServer,
} from "@pwa-platform/browser-test-harness";
import { appCachePrefix } from "@pwa-platform/contracts";
import type { Page } from "@playwright/test";
import type { EntryUpdateResult } from "../src/client/index.js";
import type { EntryRecoveryResult } from "../src/index.js";
import { IDENTITY, SHELL_URL, WORKER_URL, startSites, type Sites } from "./sites.js";

let sites: Sites;

test.beforeEach(async () => {
  sites = await startSites();
});

test.afterEach(async () => {
  await sites.closeAll();
});

/** Polls inside the page, not `page.waitForFunction` with an async predicate — Playwright does not await that, so
 *  the returned Promise is truthy on the first poll (feasibility.spec.ts's own note, from update.spec.ts, before
 *  EM4 folded that file's coverage into this one). */
async function waitForActivatedWorker(page: Page, timeout = 10_000): Promise<void> {
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      if ((await navigator.serviceWorker.getRegistration())?.active?.state === "activated") return;
      if (Date.now() >= deadline) throw new Error(`No activated worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/** Opens the fixture shell, waits for its own registration to activate, and reloads so the worker controls the
 *  page. */
async function installAndControl(page: Page, primary: FixtureServer): Promise<void> {
  await page.goto(primary.url(SHELL_URL));
  await expect(page.locator("#shell")).toBeVisible();
  await waitForActivatedWorker(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
}

/** Calls the fixture app's `window.__entryCheck`, added in browser-tests/fixture-app/src/main.ts. */
function entryCheck(page: Page, returnPath?: string): Promise<EntryRecoveryResult> {
  return page.evaluate(async (path) => {
    const check = Reflect.get(window, "__entryCheck") as (p?: string) => Promise<EntryRecoveryResult>;
    return check(path ?? undefined);
  }, returnPath ?? null);
}

/** Calls the fixture app's `window.__entryUpdate`, i.e. the real `updateEntryManifest` — exactly what an
 *  application does once it has obtained and decrypted a manifest through its own request layer. */
function entryUpdate(page: Page, data: unknown): Promise<EntryUpdateResult> {
  return page.evaluate(async (payload) => {
    const update = Reflect.get(window, "__entryUpdate") as (d: unknown) => Promise<EntryUpdateResult>;
    return update(payload);
  }, data);
}

type ManifestOverrides = {
  readonly status?: "normal" | "migrating" | "incident";
  readonly sequence?: number;
  readonly expiresAt?: string;
  readonly entries?: readonly { readonly origin: string; readonly startPath: string }[];
};

/** Builds the plain manifest object an application would hand to `updateEntryManifest` after obtaining and
 *  decrypting it itself — see spec/pwa-entry-resilience.md's "清单形状（应用解密后交入的对象）". Defaults: `status:
 *  "normal"`, `sequence: 1`, one entry pointing at the alternate origin's shell, valid for one day. */
function manifestPayload(alternateOrigin: string, overrides: ManifestOverrides = {}): Record<string, unknown> {
  const status = overrides.status ?? "normal";
  const reasonCode = status === "normal" ? "none" : status === "incident" ? "incident" : "planned-migration";
  const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    sequence: overrides.sequence ?? 1,
    expiresAt: overrides.expiresAt ?? iso(Date.now() + 86_400_000),
    status,
    reason: { code: reasonCode },
    entries: overrides.entries ?? [{ origin: alternateOrigin, startPath: SHELL_URL }],
  };
}

const DATABASE_NAME = `pwa-entry:${encodeURIComponent(IDENTITY.appId)}:${encodeURIComponent(IDENTITY.environment)}`;

/** The stored record is the plain manifest object itself (src/browser/indexeddb.ts, since ADR-0033) — not an
 *  envelope with its own `sequence` field alongside it. */
type StoredRecord = { readonly sequence: unknown } | null;

/** Reads the stored manifest record directly from IndexedDB. Resolves `null` when the database or its object
 *  store does not exist yet, rather than hanging — opening a deleted/never-created database creates an empty one
 *  and reading a store it lacks throws synchronously inside the success handler. */
function readStoredRecord(page: Page): Promise<StoredRecord> {
  return page.evaluate(
    (databaseName) =>
      new Promise<unknown>((resolve) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          try {
            const read = request.result.transaction("manifest", "readonly").objectStore("manifest").get("current");
            read.onsuccess = () => {
              request.result.close();
              resolve(read.result ?? null);
            };
            read.onerror = () => resolve(null);
          } catch {
            request.result.close();
            resolve(null);
          }
        };
      }),
    DATABASE_NAME,
  ) as Promise<StoredRecord>;
}

test("planned migration: the recovery page shows the alternate host and navigates only on click", async ({ page }) => {
  await installAndControl(page, sites.primary);

  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "migrating", sequence: 2 }));
  expect(update).toEqual({ accepted: true, sequence: 2 });

  const result = await entryCheck(page, "/app/orders/42?tab=1");
  expect(result.kind).toBe("available");
  if (result.kind !== "available") throw new Error("unreachable");
  expect(result.status).toBe("migrating");
  // The result never carries the alternate address itself (spec's "结果中不含备用入口地址").
  expect(JSON.stringify(result)).not.toContain(sites.alternate.origin);

  const recoveryUrl = sites.primary.url(result.recoveryPageUrl);

  // Registered before `goto`, per the "no automatic navigation" rule (spec's "确认与导航只在平台恢复页上发生"):
  // only the main frame's navigations are counted, and the list is reset once `goto` itself has completed, so what
  // remains is exactly "any navigation since the recovery page finished loading".
  let navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.goto(recoveryUrl);
  navigations = [];
  const button = page.locator("button");
  await expect(button).toBeVisible();
  await expect(button).toContainText(new URL(sites.alternate.origin).host);

  // No automatic navigation: waiting well past any plausible timer still leaves the page exactly where it was.
  await page.waitForTimeout(3_000);
  expect(navigations).toEqual([]);
  expect(page.url()).toBe(recoveryUrl);

  await Promise.all([page.waitForURL((url) => url.origin === sites.alternate.origin), button.click()]);
  const landed = new URL(page.url());
  expect(landed.origin).toBe(sites.alternate.origin);
  expect(landed.pathname).toBe(SHELL_URL);
  expect(landed.searchParams.get("pwa-return")).toBe("/app/orders/42?tab=1");
});

test("the recovery page opens from the precache while the origin is unreachable, query string and all (ADR-0034)", async ({
  page,
  context,
}) => {
  // The case this whole revision exists for. The application passes a `returnPath`, so the recovery page link
  // always carries `?return=…`; before ADR-0034 that query string made the navigation skip the precached recovery
  // page and land on the offline fallback — exactly when the alternate entries were the only thing that mattered.
  // `/app/pwa-entry.html` is precached at its own path, so only the same-pathname fallback candidate can answer.
  await installAndControl(page, sites.primary);
  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "migrating", sequence: 2 }));
  expect(update).toEqual({ accepted: true, sequence: 2 });

  const result = await entryCheck(page, "/app/orders/42");
  if (result.kind !== "available") throw new Error("expected an available entry before going offline");
  const recoveryUrl = sites.primary.url(result.recoveryPageUrl);
  expect(new URL(recoveryUrl).search).not.toBe("");

  await context.setOffline(true);
  try {
    await page.goto(recoveryUrl);
    const button = page.locator("button");
    await expect(button).toBeVisible();
    await expect(button).toContainText(new URL(sites.alternate.origin).host);
    // Not the offline fallback: that page is what this navigation used to reach.
    await expect(page.locator("#offline")).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});

test("normal status with the main entry reachable: nothing is shown", async ({ page }) => {
  await installAndControl(page, sites.primary);

  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "normal", sequence: 1 }));
  expect(update).toEqual({ accepted: true, sequence: 1 });

  const result = await entryCheck(page);
  expect(result).toEqual({ kind: "none", diagnostics: [] });
});

test("device offline: no entry is shown, and the recovery page offers nothing to click", async ({ page, context }) => {
  await installAndControl(page, sites.primary);

  // A "normal" manifest with a reachable-while-online alternate: only the online case is expected to show
  // unconfirmed-outage (unit-tested in test/decide.test.ts and test/resolve.test.ts). Offline must not misreport
  // the device's own disconnection as an origin outage — both probes fail identically either way, so this proves
  // the offline case still resolves to "none" rather than "unconfirmed-outage".
  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "normal", sequence: 1 }));
  expect(update).toEqual({ accepted: true, sequence: 1 });

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator("#shell")).toBeVisible();

    const result = await entryCheck(page);
    expect(result).toEqual({ kind: "none", diagnostics: [] });

    await page.goto(sites.primary.url("/app/pwa-entry.html"));
    await expect(page.getByText("当前没有可用的备用入口")).toBeVisible();
    await expect(page.locator("button")).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});

test("a lower sequence does not overwrite the stored record", async ({ page }) => {
  await installAndControl(page, sites.primary);

  const first = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "migrating", sequence: 5 }));
  expect(first).toEqual({ accepted: true, sequence: 5 });
  const storedAfterFirst = await readStoredRecord(page);
  expect(storedAfterFirst?.sequence).toBe(5);

  const lower = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "incident", sequence: 3 }));
  expect(lower).toEqual({ accepted: false, diagnostics: [{ code: "entry.sequence-not-greater", path: "/sequence" }] });

  // The stored record, and what the page reports, both still come from the higher-sequence manifest.
  const storedAfterLower = await readStoredRecord(page);
  expect(storedAfterLower?.sequence).toBe(5);
  const result = await entryCheck(page);
  expect(result.kind).toBe("available");
  if (result.kind !== "available") throw new Error("unreachable");
  expect(result.status).toBe("migrating");
});

test("an invalid manifest is rejected whole, and nothing is stored or shown", async ({ page }) => {
  await installAndControl(page, sites.primary);

  // Picks one contract rule (spec's "startPath 以 / 开头、无 .. 段" — see src/manifest.ts's `isValidStartPath`),
  // per plan.md task 7's "这份场景不再验证任何签名，而是验证清单形状本身". A `startPath` with a `..` segment is
  // rejected outright; the whole manifest is thrown away, not partially accepted.
  const update = await entryUpdate(
    page,
    manifestPayload(sites.alternate.origin, {
      status: "migrating",
      sequence: 2,
      entries: [{ origin: sites.alternate.origin, startPath: "/app/../secret" }],
    }),
  );
  expect(update).toEqual({
    accepted: false,
    diagnostics: [{ code: "entry.entry-start-path-invalid", path: "/entries/0/startPath" }],
  });

  expect(await readStoredRecord(page)).toBeNull();
  const result = await entryCheck(page);
  expect(result).toEqual({ kind: "none", diagnostics: [] });
});

// Independent review finding (2026-09-17): opening the store's IndexedDB database used to swallow any open failure
// (including a `VersionError` from a higher-versioned database already existing) and silently return `null`,
// indistinguishable from "nothing stored yet". It must surface as `entry.storage-unavailable` instead, without
// otherwise changing the result — the checker still falls through to "no manifest handed in yet".
test("indexedDB open failure: a higher-versioned database on disk surfaces entry.storage-unavailable, without changing the result", async ({
  page,
}) => {
  await installAndControl(page, sites.primary);

  await page.evaluate(
    (databaseName) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 5);
        request.onupgradeneeded = (): void => {
          request.result.createObjectStore("manifest");
        };
        request.onsuccess = (): void => {
          request.result.close();
          resolve();
        };
        request.onerror = (): void => reject(request.error);
      }),
    DATABASE_NAME,
  );

  const result = await entryCheck(page);
  // Nothing has been handed in via updateEntryManifest in this test, so absent the storage failure the result
  // would be "none" with no diagnostics; the failure must add a diagnostic without changing `kind`.
  expect(result.kind).toBe("none");
  if (result.kind !== "none") throw new Error("unreachable");
  expect(result.diagnostics.some((diagnostic) => diagnostic.code === "entry.storage-unavailable")).toBe(true);
});

test("recovery worker coexistence: the stored manifest survives while the app's caches do not", async ({ page }) => {
  await installAndControl(page, sites.primary);

  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, { status: "migrating", sequence: 2 }));
  expect(update).toEqual({ accepted: true, sequence: 2 });
  const storedBeforeRecovery = await readStoredRecord(page);
  expect(storedBeforeRecovery?.sequence).toBe(2);

  const prefix = appCachePrefix(IDENTITY);
  const appCaches = (): Promise<string[]> =>
    page.evaluate(async (start) => (await caches.keys()).filter((name) => name.startsWith(start)), prefix);
  // Reverse precondition: there are caches under this app's prefix to lose, or "deleted" below proves nothing.
  expect((await appCaches()).length).toBeGreaterThan(0);

  await waitForControllerChange(page, async () => {
    sites.primary.deploy(sites.recoveryVersion);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
  });
  // controllerchange arrives before the recovery worker's cleanup settles (T2's note, from examples-browser-e2e T5).
  await waitForActivatedWorker(page);

  expect(await appCaches()).toEqual([]);
  const storedAfterRecovery = await readStoredRecord(page);
  expect(storedAfterRecovery?.sequence).toBe(2);

  const result = await entryCheck(page);
  expect(result.kind).toBe("available");
  if (result.kind !== "available") throw new Error("unreachable");
  expect(result.status).toBe("migrating");
});
