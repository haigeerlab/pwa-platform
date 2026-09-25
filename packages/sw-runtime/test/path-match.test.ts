import { describe, expect, it } from "vitest";
import { createPathMatcher, decodedPathKey, isWithinPrefix } from "../src/shared/path-match.js";

const ENCODED_SLASH = "\uD800";

describe("decodedPathKey", () => {
  it("decodes valid escapes per segment", () => {
    expect(decodedPathKey("/%61ssets/site.css")).toBe("/assets/site.css");
    expect(decodedPathKey("/caf%C3%A9/men%C3%BC")).toBe("/café/menü");
    expect(decodedPathKey("/a%20b")).toBe("/a b");
  });

  it("never turns %2F into a segment boundary, whatever its case", () => {
    expect(decodedPathKey("/a%2Fb")).toBe(`/a${ENCODED_SLASH}b`);
    expect(decodedPathKey("/a%2fb")).toBe(`/a${ENCODED_SLASH}b`);
    expect(decodedPathKey("/a%2Fb")).not.toBe(decodedPathKey("/a/b"));
  });

  it("keeps invalid escapes literal and replaces bytes that are not UTF-8", () => {
    expect(decodedPathKey("/%zz/x")).toBe("/%zz/x");
    expect(decodedPathKey("/%2")).toBe("/%2");
    expect(decodedPathKey("/%FF")).toBe("/�");
    expect(decodedPathKey("/%C3")).toBe("/�");
  });

  it("collapses different spellings of the same path into one key", () => {
    expect(decodedPathKey("/%61ssets")).toBe(decodedPathKey("/assets"));
    expect(decodedPathKey("/café")).toBe(decodedPathKey("/caf%C3%A9"));
  });
});

describe("isWithinPrefix", () => {
  it("matches whole segments only", () => {
    expect(isWithinPrefix("/app/api", "/app/api")).toBe(true);
    expect(isWithinPrefix("/app/api/orders", "/app/api")).toBe(true);
    expect(isWithinPrefix("/app/apis", "/app/api")).toBe(false);
    expect(isWithinPrefix("/app/api-v2", "/app/api")).toBe(false);
    expect(isWithinPrefix("/app", "/app/api")).toBe(false);
  });

  it("treats the root prefix as containing every path", () => {
    for (const key of ["/", "/app", "/app/api"]) expect(isWithinPrefix(key, "/"), key).toBe(true);
  });
});

describe("createPathMatcher", () => {
  const rules = [
    { pathPrefix: "/app/api/account", action: "deny" },
    { pathPrefix: "/app/%61ssets", action: "cache-first" },
    { pathPrefix: "/app/a%2Fb", action: "cache-first" },
    { pathPrefix: "/app", action: "network-first" },
  ] as const;
  const matcher = createPathMatcher(rules);

  it("returns the first matching rule in rule order", () => {
    expect(matcher.match("/app/api/account/profile")).toBe(rules[0]);
    expect(matcher.match("/app/assets/site.css")).toBe(rules[1]);
    expect(matcher.match("/app/%61ssets/site.css")).toBe(rules[1]);
    expect(matcher.match("/app/a%2Fb/x.js")).toBe(rules[2]);
    expect(matcher.match("/app/index.html")).toBe(rules[3]);
  });

  it("ignores the query and the fragment", () => {
    expect(matcher.match("/app/assets/site.css?v=2")).toBe(rules[1]);
    expect(matcher.match("/app/assets/site.css#top")).toBe(rules[1]);
    expect(matcher.match("/app/api/account?x=/app/assets")).toBe(rules[0]);
  });

  it("returns undefined when no rule matches, which the worker treats as unclassified", () => {
    expect(matcher.match("/other/index.html")).toBeUndefined();
    expect(matcher.match("/appendix")).toBeUndefined();
    expect(createPathMatcher([]).match("/app")).toBeUndefined();
  });

  it("does not let an encoded slash reach into another segment", () => {
    // "/app/a%2Fb" is one segment, so it never matches the two-segment path "/app/a/b".
    expect(matcher.match("/app/a/b/x.js")).toBe(rules[3]);
  });
});
