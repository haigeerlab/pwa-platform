import { describe, expect, it } from "vitest";
import { diffCacheSnapshots, expectDeletedExactlyUnderPrefix, type CacheSnapshot } from "../src/cache-diff.js";

const PREFIX = "pwa:shop:prod:";

const before: CacheSnapshot = new Map([
  ["pwa:shop:prod:r2:precache", 2],
  ["pwa:shop:prod:r1:precache", 1],
  ["pwa:shop:staging:r2:precache", 1],
  ["pwa:shop-admin:prod:r2:precache", 3],
  [`legacy-${PREFIX}backup`, 1],
  ["workbox-runtime", 1],
]);

function without(snapshot: CacheSnapshot, ...names: string[]): Map<string, number> {
  const copy = new Map(snapshot);
  for (const name of names) copy.delete(name);
  return copy;
}

const exact = without(before, "pwa:shop:prod:r2:precache", "pwa:shop:prod:r1:precache");

describe("diffCacheSnapshots", () => {
  it("lists deleted, added and count-changed caches in name order", () => {
    const after = without(before, "workbox-runtime", "pwa:shop:prod:r1:precache");
    after.set("zzz-new", 1).set("aaa-new", 2).set("pwa:shop-admin:prod:r2:precache", 5);
    expect(diffCacheSnapshots(before, after)).toEqual({
      deleted: ["pwa:shop:prod:r1:precache", "workbox-runtime"],
      added: ["aaa-new", "zzz-new"],
      changed: [{ name: "pwa:shop-admin:prod:r2:precache", before: 3, after: 5 }],
    });
  });

  it("reports nothing for identical snapshots", () => {
    expect(diffCacheSnapshots(before, new Map(before))).toEqual({ deleted: [], added: [], changed: [] });
  });
});

describe("expectDeletedExactlyUnderPrefix", () => {
  it("passes when exactly the caches starting with the prefix are gone and the rest are unchanged", () => {
    expect(() => expectDeletedExactlyUnderPrefix(before, exact, PREFIX)).not.toThrow();
  });

  it("fails when a cache under the prefix survives", () => {
    const fewer = without(before, "pwa:shop:prod:r2:precache");
    expect(() => expectDeletedExactlyUnderPrefix(before, fewer, PREFIX)).toThrow(/not deleted: pwa:shop:prod:r1:precache/);
  });

  it("fails when a cache outside the prefix is deleted, including one that only contains the prefix", () => {
    expect(() =>
      expectDeletedExactlyUnderPrefix(before, without(exact, "pwa:shop:staging:r2:precache"), PREFIX),
    ).toThrow(/deleted outside the prefix: pwa:shop:staging:r2:precache/);
    expect(() => expectDeletedExactlyUnderPrefix(before, without(exact, `legacy-${PREFIX}backup`), PREFIX)).toThrow(
      /deleted outside the prefix: legacy-pwa:shop:prod:backup/,
    );
  });

  it("fails when a kept cache changes its entry count", () => {
    const changed = new Map(exact).set("workbox-runtime", 2);
    expect(() => expectDeletedExactlyUnderPrefix(before, changed, PREFIX)).toThrow(/entry counts changed: workbox-runtime 1→2/);
  });

  it("fails when a cache is added, even under the prefix", () => {
    const added = new Map(exact).set("pwa:shop:prod:r3:precache", 1);
    expect(() => expectDeletedExactlyUnderPrefix(before, added, PREFIX)).toThrow(/added: pwa:shop:prod:r3:precache/);
  });

  it("requires a non-empty prefix", () => {
    expect(() => expectDeletedExactlyUnderPrefix(before, new Map(), "")).toThrow(/non-empty prefix/);
  });
});
