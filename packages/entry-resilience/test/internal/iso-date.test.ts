import { describe, expect, it } from "vitest";
import { parseStrictIsoUtc } from "../../src/internal/iso-date.js";

// Independent review finding (2026-09-17): a year before 1970 used to parse to a negative-but-finite epoch value,
// which could silently satisfy comparisons it should have failed instead.
describe("parseStrictIsoUtc: year lower bound", () => {
  it("rejects a year far before 1970", () => {
    expect(parseStrictIsoUtc("0099-12-31T00:00:00Z")).toBeUndefined();
  });

  it("rejects the year immediately before 1970", () => {
    expect(parseStrictIsoUtc("1969-12-31T23:59:59Z")).toBeUndefined();
  });

  it("accepts the epoch instant itself", () => {
    expect(parseStrictIsoUtc("1970-01-01T00:00:00Z")).toBe(Date.UTC(1970, 0, 1, 0, 0, 0));
  });
});
