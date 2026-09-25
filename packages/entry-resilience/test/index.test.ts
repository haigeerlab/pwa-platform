// Public-surface coverage for the package root export (spec/pwa-entry-resilience.md's "修订：导出清单校验函数").
// `parseEntryManifest` is re-exported verbatim from src/manifest.ts (see src/index.ts's comment) — this file
// proves that verbatim claim rather than re-testing any validation rule, which test/manifest.test.ts already
// covers against the internal module path.
import { describe, expect, it } from "vitest";
import { parseEntryManifest as publicParseEntryManifest } from "../src/index.js";
import { parseEntryManifest as internalParseEntryManifest } from "../src/manifest.js";
import { APPROVED_ORIGIN, baseContext, days, NOW_MS, toStrictIso, validManifest } from "./support/fixtures.js";

describe("parseEntryManifest via the package root export", () => {
  const context = baseContext();

  const cases: ReadonlyArray<[string, unknown]> = [
    ["a fully valid manifest", validManifest()],
    [
      "a manifest with the maximum number of entries",
      validManifest({ entries: Array.from({ length: 5 }, () => ({ origin: APPROVED_ORIGIN, startPath: "/app/" })) }),
    ],
    ["a non-object value", "not an object"],
    ["a manifest with an unknown top-level field", validManifest({ unexpected: true })],
    ["a manifest with a negative sequence", validManifest({ sequence: -1 })],
    ["a manifest with an already-expired expiresAt", validManifest({ expiresAt: toStrictIso(NOW_MS - 1) })],
    [
      "a manifest whose validity period exceeds the configured maximum",
      validManifest({ expiresAt: toStrictIso(NOW_MS + days(31)) }),
    ],
    [
      "a manifest with more than 5 entries",
      validManifest({ entries: Array.from({ length: 6 }, () => ({ origin: APPROVED_ORIGIN, startPath: "/app/" })) }),
    ],
    ["a manifest with multiple simultaneous rule violations", validManifest({ sequence: -1, status: "unknown" })],
  ];

  it.each(cases)("is byte-for-byte identical to the internal module path for: %s", (_label, value) => {
    expect(publicParseEntryManifest(value, context)).toEqual(internalParseEntryManifest(value, context));
  });

  it("is the exact same function reference as the internal module's export", () => {
    expect(publicParseEntryManifest).toBe(internalParseEntryManifest);
  });
});
