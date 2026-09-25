import { readFileSync } from "node:fs";
import { cacheNamespacePrefix, type PwaPlan } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { verifyReleaseRetention } from "../src/release-retention.js";

const storefront = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as PwaPlan;

const DAY_MS = 24 * 60 * 60 * 1000;

function planWith(asset: `/${string}`, changes: Partial<PwaPlan["identity"]> = {}): PwaPlan {
  const identity = { ...storefront.identity, ...changes };
  return {
    ...storefront,
    identity,
    cacheNamespace: { prefix: cacheNamespacePrefix(identity) },
    precache: [
      { url: asset, revision: null },
      // Only `revision === null` is fingerprinted, so this is deliberately not retained by this check.
      { url: "/assets/runtime.js", revision: "runtime-v1" },
    ],
  };
}

const codes = (check: { diagnostics: readonly { code: string }[] }): string[] => check.diagnostics.map(({ code }) => code);

describe("verifyReleaseRetention", () => {
  it("requires fingerprinted assets from the candidate and two preceding releases", () => {
    const candidate = planWith("/assets/r.123.js");
    const result = verifyReleaseRetention(candidate, {
      asOfMs: 30 * DAY_MS,
      previous: [
        { releasedAtMs: 20 * DAY_MS, plan: planWith("/assets/r-1.123.js") },
        { releasedAtMs: 10 * DAY_MS, plan: planWith("/assets/r-2.123.js") },
      ],
      available: ["/assets/r.123.js", "/assets/r-1.123.js"],
    });

    expect(result.name).toBe("release-retention");
    expect(codes(result)).toEqual(["verify.retention-missing"]);
    expect(result.diagnostics[0]?.path).toBe("/retention/previous/1/precache/0/url");
  });

  it("requires an older release until the seventh day after its successor, but not at expiry", () => {
    const candidate = planWith("/assets/r.123.js");
    const previous = [
      { releasedAtMs: 6 * DAY_MS, plan: planWith("/assets/r-1.123.js") },
      { releasedAtMs: 5 * DAY_MS, plan: planWith("/assets/r-2.123.js") },
      { releasedAtMs: 0, plan: planWith("/assets/r-3.123.js") },
    ];
    const available = ["/assets/r.123.js", "/assets/r-1.123.js", "/assets/r-2.123.js"];

    const oneMillisecondBeforeExpiry = verifyReleaseRetention(candidate, {
      asOfMs: 5 * DAY_MS + 7 * DAY_MS - 1,
      previous,
      available,
    });
    expect(codes(oneMillisecondBeforeExpiry)).toEqual(["verify.retention-missing"]);

    const atExpiry = verifyReleaseRetention(candidate, {
      asOfMs: 5 * DAY_MS + 7 * DAY_MS,
      previous,
      available,
    });
    expect(atExpiry).toEqual({ name: "release-retention", ok: true, diagnostics: [] });

    const oneMillisecondAfterExpiry = verifyReleaseRetention(candidate, {
      asOfMs: 5 * DAY_MS + 7 * DAY_MS + 1,
      previous,
      available,
    });
    expect(oneMillisecondAfterExpiry).toEqual({ name: "release-retention", ok: true, diagnostics: [] });
  });

  it("does not require an entry that has a revision", () => {
    const candidate = planWith("/assets/r.123.js");
    expect(
      verifyReleaseRetention(candidate, {
        asOfMs: 1,
        previous: [],
        available: ["/assets/r.123.js"],
      }),
    ).toEqual({ name: "release-retention", ok: true, diagnostics: [] });
  });

  it("reports one missing diagnostic when a retained path occurs in multiple releases", () => {
    const candidate = planWith("/assets/shared.123.js");
    const result = verifyReleaseRetention(candidate, {
      asOfMs: 20 * DAY_MS,
      previous: [
        { releasedAtMs: 10 * DAY_MS, plan: planWith("/assets/shared.123.js") },
        { releasedAtMs: 5 * DAY_MS, plan: planWith("/assets/shared.123.js") },
      ],
      available: [],
    });

    expect(codes(result)).toEqual(["verify.retention-missing"]);
    expect(result.diagnostics[0]?.path).toBe("/precache/0/url");
  });

  it("fails closed when a historical record is invalid, out of order, or belongs to another release line", () => {
    const candidate = planWith("/assets/r.123.js");
    const cases: readonly [string, readonly { readonly releasedAtMs: number; readonly plan: unknown }[]][] = [
      ["invalid plan", [{ releasedAtMs: 1, plan: {} }]],
      [
        "out of order timestamps",
        [
          { releasedAtMs: 1, plan: planWith("/assets/r-1.123.js") },
          { releasedAtMs: 2, plan: planWith("/assets/r-2.123.js") },
        ],
      ],
      ["other app", [{ releasedAtMs: 1, plan: planWith("/assets/r-1.123.js", { appId: "other-app" }) }]],
      ["other origin", [{ releasedAtMs: 1, plan: planWith("/assets/r-1.123.js", { origin: "https://other.example.com" }) }]],
      ["other environment", [{ releasedAtMs: 1, plan: planWith("/assets/r-1.123.js", { environment: "staging" }) }]],
    ];

    for (const [name, previous] of cases) {
      const result = verifyReleaseRetention(candidate, { asOfMs: 3, previous, available: [] });
      expect(codes(result), name).toEqual(["verify.retention-history-invalid"]);
      expect(result.diagnostics[0]?.message, name).not.toMatch(/other-app|other\.example|staging|r-1|r-2/);
    }
  });

  it("fails closed for an invalid assessment clock or a record later than it", () => {
    const candidate = planWith("/assets/r.123.js");
    const cases: readonly { readonly asOfMs: number; readonly previous: readonly { readonly releasedAtMs: number; readonly plan: unknown }[] }[] = [
      { asOfMs: -1, previous: [] },
      { asOfMs: 1.5, previous: [] },
      { asOfMs: Number.NaN, previous: [] },
      { asOfMs: 1e30, previous: [] },
      { asOfMs: 1, previous: [{ releasedAtMs: 2, plan: planWith("/assets/r-1.123.js") }] },
    ];

    for (const input of cases) {
      expect(codes(verifyReleaseRetention(candidate, { ...input, available: [] }))).toEqual(["verify.retention-history-invalid"]);
    }
  });

  it("rejects relative availability paths as a caller error", () => {
    expect(() =>
      verifyReleaseRetention(planWith("/assets/r.123.js"), {
        asOfMs: 1,
        previous: [],
        available: ["assets/r.123.js"],
      }),
    ).toThrow(TypeError);
  });
});
