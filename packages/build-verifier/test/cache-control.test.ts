import { expectCacheControl } from "@pwa-platform/browser-test-harness";
import { describe, expect, it } from "vitest";
import { hasDirective, parseCacheControl } from "../src/cache-control.js";

/**
 * Whether the harness accepts a header against one expectation. The harness publishes only `expectCacheControl`,
 * not its parser, so parity is measured on observable behaviour — which is the property that actually matters:
 * two implementations must agree on verdicts, not on internal representations.
 */
function harnessAccepts(header: string | undefined, directive: string, mode: "include" | "exclude"): boolean {
  const response = { headers: () => (header === undefined ? {} : { "cache-control": header }) };
  try {
    expectCacheControl(response, { [mode]: [directive] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inputs that exercise every branch of the grammar. The parity test below feeds these to both implementations;
 * a divergence in either direction fails, which is the whole reason a second implementation is tolerable.
 */
const SAMPLES: readonly (string | undefined)[] = [
  undefined,
  "",
  "no-cache",
  "NO-CACHE",
  "  no-cache  ",
  "public, max-age=31536000, immutable",
  "public,max-age=0",
  "max-age=31536000,immutable",
  // Repeated header lines are commonly joined with a line break.
  "no-cache\nno-store",
  "private, no-store",
  'max-age="3600"',
  'community="UA", max-age=60',
  'quoted="a,b", max-age=1',
  'escaped="a\\"b", no-cache',
  // Malformed: browsers ignore these, so both parsers drop them.
  "max-age = 60",
  "max-age=",
  "=60",
  "max age=60",
  "max-age=6 0",
  'unterminated="abc',
  'trailing="abc"x',
  ",,,",
  "no-cache,,no-store",
  "no-cache;no-store",
  "max-age=60, max-age=120",
];

describe("parseCacheControl", () => {
  it("reads a bare directive, lower-casing its name", () => {
    expect(parseCacheControl("NO-CACHE")).toEqual([{ name: "no-cache", value: null }]);
  });

  it("reads values, quoted or not", () => {
    expect(parseCacheControl('max-age=60, community="UA"')).toEqual([
      { name: "max-age", value: "60" },
      { name: "community", value: "UA" },
    ]);
  });

  it("keeps commas and escapes inside a quoted value", () => {
    expect(parseCacheControl('quoted="a,b"')).toEqual([{ name: "quoted", value: "a,b" }]);
    expect(parseCacheControl('escaped="a\\"b"')).toEqual([{ name: "escaped", value: 'a"b' }]);
  });

  it("splits on line breaks, as joined header lines arrive", () => {
    expect(parseCacheControl("no-cache\nno-store").map(({ name }) => name)).toEqual(["no-cache", "no-store"]);
  });

  it("drops directives no browser would honour", () => {
    // The last two carry no "=", so they are the only samples that exercise the valueless branch; without them a
    // parser that accepted any valueless token would still pass every case here.
    for (const malformed of [
      "max-age = 60",
      "max-age=",
      "=60",
      "max age=60",
      'unterminated="abc',
      'trailing="abc"x',
      "no cache",
      "no-cache;no-store",
    ]) {
      expect(parseCacheControl(malformed), malformed).toEqual([]);
    }
  });

  it("treats an absent header as no directives", () => {
    expect(parseCacheControl(undefined)).toEqual([]);
  });

  it("reaches the same verdict as the harness on every sample", () => {
    // Two implementations exist only because package boundaries forbid production code from importing the test
    // package. This is what keeps them from drifting apart.
    //
    // Samples with a repeated directive are excluded: the harness additionally rejects repetition, which is its
    // own assertion semantics and not something the release header baseline asks for. Copying that rule here
    // would make the tool stricter than the runbook it enforces.
    const comparable = SAMPLES.filter((sample) => {
      const names = parseCacheControl(sample).map(({ name }) => name);
      return new Set(names).size === names.length;
    });
    expect(comparable.length).toBeGreaterThan(20);

    for (const sample of comparable) {
      const directives = parseCacheControl(sample);
      // `max-age=+` is deliberately absent here: it is this package's own expectation form and has no counterpart
      // in the harness, so there is no harness verdict to compare it against. It is covered on its own below.
      for (const wanted of ["no-cache", "no-store", "immutable", "max-age=*", "max-age=60", "public", "private"]) {
        const mine = hasDirective(directives, wanted);
        expect(mine, `include ${wanted} in ${JSON.stringify(sample)}`).toBe(harnessAccepts(sample, wanted, "include"));
        expect(!mine, `exclude ${wanted} in ${JSON.stringify(sample)}`).toBe(harnessAccepts(sample, wanted, "exclude"));
      }
    }
  });
});

describe("hasDirective", () => {
  const directives = parseCacheControl("public, max-age=31536000, immutable");

  it("matches a bare directive", () => {
    expect(hasDirective(directives, "immutable")).toBe(true);
    expect(hasDirective(directives, "no-cache")).toBe(false);
  });

  it("matches an exact value", () => {
    expect(hasDirective(directives, "max-age=31536000")).toBe(true);
    expect(hasDirective(directives, "max-age=0")).toBe(false);
  });

  it("accepts any value with the wildcard", () => {
    expect(hasDirective(directives, "max-age=*")).toBe(true);
    expect(hasDirective(parseCacheControl("no-cache"), "max-age=*")).toBe(false);
  });

  it("requires a positive whole number with the plus form", () => {
    // Presence alone is too weak for a baseline that asks for a long lifetime: `max-age=0` satisfies "the
    // directive is there" while making the resource uncacheable.
    expect(hasDirective(directives, "max-age=+")).toBe(true);
    expect(hasDirective(parseCacheControl("immutable, max-age=0"), "max-age=+")).toBe(false);
    expect(hasDirective(parseCacheControl("max-age=00"), "max-age=+")).toBe(false);
    expect(hasDirective(parseCacheControl("max-age=abc"), "max-age=+")).toBe(false);
    expect(hasDirective(parseCacheControl("max-age"), "max-age=+")).toBe(false);
    // A quoted value is still a value, and the harness accepts it too.
    expect(hasDirective(parseCacheControl('max-age="3600"'), "max-age=+")).toBe(true);
  });

  it("does not confuse a valueless directive with one that has a value", () => {
    expect(hasDirective(parseCacheControl("max-age=60"), "max-age")).toBe(false);
    expect(hasDirective(parseCacheControl("max-age"), "max-age=*")).toBe(true);
  });

  it("rejects an expectation that is not a single valid directive", () => {
    for (const wrong of ["", "max-age = 60", "a,b"]) {
      expect(() => hasDirective(directives, wrong), JSON.stringify(wrong)).toThrow(TypeError);
    }
  });
});
