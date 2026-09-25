import type { EntryManifestValidationContext } from "../../src/types.js";

export const APP_ID = "pwaexample";
export const ENVIRONMENT = "production";
export const APPROVED_ORIGIN = "https://new.example.com";
/** 2026-09-17T08:00:00Z, matching the spec's own contract example. */
export const NOW_MS: number = Date.UTC(2026, 8, 17, 8, 0, 0);

/** Formats epoch milliseconds as strict `YYYY-MM-DDTHH:mm:ssZ` (no fractional seconds). */
export function toStrictIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function minutes(count: number): number {
  return count * 60 * 1000;
}

export function days(count: number): number {
  return count * 24 * 60 * 60 * 1000;
}

export function baseContext(overrides: Partial<EntryManifestValidationContext> = {}): EntryManifestValidationContext {
  return {
    appId: APP_ID,
    environment: ENVIRONMENT,
    maxValidityDays: 30,
    now: NOW_MS,
    ...overrides,
  };
}

/** A manifest that satisfies every contract rule; returned as `Record<string, unknown>` so tests can freely
 *  mutate individual fields (including introducing invalid shapes) without fighting the public types. */
export function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sequence: 7,
    expiresAt: toStrictIso(NOW_MS + days(14)),
    status: "migrating",
    reason: { code: "planned-migration", message: "Domain retires October 1." },
    entries: [{ origin: APPROVED_ORIGIN, startPath: "/app/" }],
    ...overrides,
  };
}
