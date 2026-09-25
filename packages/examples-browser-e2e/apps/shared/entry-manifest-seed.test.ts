// The seed `entry-manifest.json` both examples publish (spec/examples-browser-e2e.md's revised "契约增量") is a
// static file, and `loadStartupEntryManifest` swallows a rejected manifest on purpose — so a malformed seed ships
// silently and does nothing. That is not hypothetical: the first seed used `2026-10-23T00:00:00.000Z`, which the
// platform's strict timestamp rule rejects, and nothing anywhere failed.
//
// This test validates both seeds with the platform's real validator (spec/pwa-entry-resilience.md's "修订：导出
// 清单校验函数"), rather than mirroring any of its rules here — a mirrored rule is exactly the kind of drift that
// let the millisecond-timestamp seed ship unnoticed in the first place.
import { readFileSync } from "node:fs";
import { parseEntryManifest } from "@pwa-platform/entry-resilience";
import { describe, expect, it } from "vitest";
import { IDENTITY } from "./identity.js";

const SEEDS = ["react", "vue"] as const;

/** Fixed instant so the test's result does not depend on when it runs; both seeds' `expiresAt` are well after it. */
const NOW_MS = Date.UTC(2026, 8, 23, 0, 0, 0);

/** Matches `pwaEntryResilience({ identity, maxValidityDays: 30 })` in both examples' vite.config.ts. */
const MAX_VALIDITY_DAYS = 30;

function context(): Parameters<typeof parseEntryManifest>[1] {
  return { appId: IDENTITY.appId, environment: IDENTITY.environment, maxValidityDays: MAX_VALIDITY_DAYS, now: NOW_MS };
}

describe("the published seed entry-manifest.json", () => {
  for (const host of SEEDS) {
    const seed: unknown = JSON.parse(readFileSync(new URL(`../${host}/public/entry-manifest.json`, import.meta.url), "utf8"));

    it(`${host}: validates as a legitimate manifest`, () => {
      expect(parseEntryManifest(seed, context())).toEqual({ ok: true, manifest: seed });
    });

    it(`${host}: is still valid against the real clock, so a stale seed is never deployed`, () => {
      // Deliberately time-dependent, unlike the case above: the seed is deployed content with an expiry date, and
      // this is the alarm that fires when it needs refreshing. A failure here means "give the seed a new expiresAt
      // (within maxValidityDays of today) before the next deployment", not that the validator changed.
      expect(parseEntryManifest(seed, { ...context(), now: Date.now() })).toEqual({ ok: true, manifest: seed });
    });

    it(`${host}: is rejected once expiresAt carries milliseconds (the defect this test was written to catch)`, () => {
      const asRecord = seed as Record<string, unknown>;
      const withMilliseconds = { ...asRecord, expiresAt: String(asRecord["expiresAt"]).replace(/Z$/, ".000Z") };

      const result = parseEntryManifest(withMilliseconds, context());

      expect(result.ok).toBe(false);
    });
  }
});
