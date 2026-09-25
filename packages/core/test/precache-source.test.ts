// ADR-0019 review #5: `isPrecacheSource` must be an explicit allow-list of caching strategies, not "not deny and
// not none" — `PwaPathRuleAction` also has `exclude`, and a future rule shape must never be treated as a caching
// rule by exclusion. This is a white-box test against the module directly (not the public `compilePlan` API),
// so it can construct a rule contracts itself would never let an `exclude` rule carry (`resourceClass: "asset"`)
// and still prove the allow-list — not the `resourceClass` check — is what keeps it out.
import type { PwaPathRule } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { isPrecacheSource } from "../src/precache.js";

const rule = (action: PwaPathRule["action"], resourceClass: PwaPathRule["resourceClass"] = "asset"): PwaPathRule => ({
  pathPrefix: "/assets",
  resourceClass,
  action,
  source: "policy",
});

describe("isPrecacheSource: explicit allow-list of caching strategies", () => {
  it.each(["cache-first", "network-first", "stale-while-revalidate"] as const)(
    "accepts the %s caching strategy on an asset rule",
    (action) => {
      expect(isPrecacheSource(rule(action))).toBe(true);
    },
  );

  it.each(["none", "deny", "exclude"] as const)(
    "never treats %s as a caching strategy, even on an asset-class rule",
    (action) => {
      // Contracts' `excludeRuleInvariants` would never let a real `exclude` rule carry `resourceClass: "asset"`,
      // but this function must not rely on that invariant holding — it is a second, independent guard (review #5).
      expect(isPrecacheSource(rule(action))).toBe(false);
    },
  );

  it("still requires the asset resource class, even for a caching strategy", () => {
    expect(isPrecacheSource(rule("cache-first", "public-data"))).toBe(false);
  });
});
