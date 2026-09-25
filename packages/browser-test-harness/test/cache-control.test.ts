import { describe, expect, it } from "vitest";
import { expectCacheControl, parseCacheControl } from "../src/cache-control.js";

const response = (cacheControl?: string) => ({
  headers: (): Record<string, string> => (cacheControl === undefined ? {} : { "cache-control": cacheControl }),
});

describe("parseCacheControl", () => {
  it("lower-cases names and splits on commas and line breaks", () => {
    expect(parseCacheControl("Public, MAX-AGE=31536000 ,\nImmutable")).toEqual([
      { name: "public", value: null },
      { name: "max-age", value: "31536000" },
      { name: "immutable", value: null },
    ]);
  });

  it("keeps separators inside quoted values and honours escapes", () => {
    expect(parseCacheControl('no-cache="set-cookie, x-id", private')).toEqual([
      { name: "no-cache", value: "set-cookie, x-id" },
      { name: "private", value: null },
    ]);
    expect(parseCacheControl('x="\\",no-store,\\"", private')).toEqual([
      { name: "x", value: '",no-store,"' },
      { name: "private", value: null },
    ]);
  });

  it("drops malformed directives such as whitespace around the equals sign", () => {
    expect(parseCacheControl('max-age = 0, s-maxage=, "quoted", no store, x="open, max-age=0')).toEqual([]);
    expect(parseCacheControl("max-age = 0, max-age=5")).toEqual([{ name: "max-age", value: "5" }]);
  });

  it("ignores empty segments and treats an absent header as no directives", () => {
    expect(parseCacheControl(" , no-store,, ")).toEqual([{ name: "no-store", value: null }]);
    expect(parseCacheControl(undefined)).toEqual([]);
  });
});

describe("expectCacheControl", () => {
  it("passes when every included directive is present and no excluded one is", () => {
    expect(() =>
      expectCacheControl(response("private, No-Store"), { include: ["NO-STORE", "private"], exclude: ["public", "immutable"] }),
    ).not.toThrow();
  });

  it("matches a bare name only against a directive without a value", () => {
    const fieldScoped = response('no-cache="set-cookie", max-age=31536000');
    expect(() => expectCacheControl(fieldScoped, { include: ["no-cache"] })).toThrow(/missing \[no-cache\]/);
    expect(() => expectCacheControl(fieldScoped, { include: ["no-cache=*"] })).not.toThrow();
    expect(() => expectCacheControl(response("max-age=60"), { include: ["max-age"] })).toThrow(/missing \[max-age\]/);
  });

  it("accepts any value with name=* and requires the value with name=value", () => {
    const cached = response("max-age=60, immutable");
    expect(() => expectCacheControl(cached, { include: ["max-age=*", "max-age=60"] })).not.toThrow();
    expect(() => expectCacheControl(cached, { include: ["max-age=0"] })).toThrow(/missing \[max-age=0\]/);
    expect(() => expectCacheControl(cached, { exclude: ["max-age=*"] })).toThrow(/forbidden \[max-age=\*\]/);
    expect(() => expectCacheControl(cached, { exclude: ["max-age=0"] })).not.toThrow();
  });

  it("treats header lines joined by a line break as separate directives", () => {
    const twoLines = response("no-cache\nimmutable");
    expect(() => expectCacheControl(twoLines, { exclude: ["immutable"] })).toThrow(/forbidden \[immutable\]/);
    expect(() => expectCacheControl(twoLines, { include: ["no-cache", "immutable"] })).not.toThrow();
  });

  it("fails when a directive repeats, whatever the expectation", () => {
    expect(() => expectCacheControl(response("max-age=60, max-age=0"), { include: ["max-age=0"] })).toThrow(
      /repeats directives \[max-age\]/,
    );
    expect(() => expectCacheControl(response("no-cache\nNO-CACHE"), {})).toThrow(/repeats directives \[no-cache\]/);
  });

  it("does not accept a value written with whitespace around the equals sign", () => {
    expect(() => expectCacheControl(response("max-age = 0"), { include: ["max-age=0"] })).toThrow(/missing \[max-age=0\]/);
  });

  it("reports every missing and forbidden directive", () => {
    expect(() =>
      expectCacheControl(response("no-cache, immutable"), { include: ["no-store", "private"], exclude: ["immutable", "no-cache"] }),
    ).toThrow('Cache-Control "no-cache, immutable" is missing [no-store, private] and contains forbidden [immutable, no-cache]');
  });

  it("fails inclusions and passes exclusions when the header is absent", () => {
    expect(() => expectCacheControl(response(), { include: ["no-cache"] })).toThrow(/\(absent\) is missing \[no-cache\]/);
    expect(() => expectCacheControl(response(), { exclude: ["immutable"] })).not.toThrow();
  });

  it("does not confuse a directive with one that merely contains its name", () => {
    expect(() => expectCacheControl(response("no-cache"), { include: ["cache"] })).toThrow(/missing \[cache\]/);
    expect(() => expectCacheControl(response("s-maxage=10"), { exclude: ["max-age=*"] })).not.toThrow();
  });

  it("rejects malformed expectations", () => {
    for (const entry of ["", "no-cache, no-store", "max-age = 0", "no cache"]) {
      expect(() => expectCacheControl(response("no-cache"), { include: [entry] }), entry).toThrow(
        /Invalid Cache-Control expectation/,
      );
    }
  });
});
