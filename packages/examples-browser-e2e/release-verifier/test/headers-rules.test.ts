import { describe, expect, it } from "vitest";
import { checkHeadersFileRules } from "../headers-rules.ts";

// Verbatim `main`-slot output of scripts/build-cloudflare-site.mjs's `_headers` writer (the `X-Robots-Tag` lines it
// prepends are `drill`-slot only, so the real candidate staging directory this tool checks never has them).
const REAL_MAIN_SLOT_HEADERS = [
  "/app/",
  "  Cache-Control: no-cache",
  "/app/index.html",
  "  Cache-Control: no-cache",
  "/app/offline.html",
  "  Cache-Control: no-cache",
  "/app/offline",
  "  Cache-Control: no-cache",
  "/app/sw.js",
  "  Cache-Control: no-cache",
  "/app/pwa-recovery-worker.js",
  "  Cache-Control: no-cache",
  "/app/manifest.webmanifest",
  "  Cache-Control: no-cache",
  "/app/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");

describe("checkHeadersFileRules / the real generated file", () => {
  it("passes the real main-slot _headers file verbatim", () => {
    expect(checkHeadersFileRules(REAL_MAIN_SLOT_HEADERS)).toEqual({ ok: true });
  });
});

describe("checkHeadersFileRules / forbidden rule forms", () => {
  it("rejects an absolute https:// rule and reports its line", () => {
    const text = ["/app/", "  Cache-Control: no-cache", "https://:project.pages.dev/*", "  X-Robots-Tag: noindex"].join("\n");
    const result = checkHeadersFileRules(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.map((v) => v.line)).toEqual([3]);
      expect(result.violations[0]?.reason).toMatch(/absolute URL/);
    }
  });

  it("rejects an absolute http:// rule", () => {
    const result = checkHeadersFileRules("http://example.com/*\n  X-Foo: bar\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual([{ line: 1, reason: expect.stringMatching(/absolute URL/) }]);
  });

  it("rejects a protocol-relative // rule", () => {
    const result = checkHeadersFileRules("//example.com/*\n  X-Foo: bar\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual([{ line: 1, reason: expect.stringMatching(/protocol-relative/) }]);
  });

  it("rejects a :placeholder host pattern rule", () => {
    const result = checkHeadersFileRules(":project.pages.dev/*\n  X-Foo: bar\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual([{ line: 1, reason: expect.stringMatching(/:placeholder/) }]);
  });

  it("rejects a rule that does not start with /", () => {
    const result = checkHeadersFileRules("app/index.html\n  Cache-Control: no-cache\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual([{ line: 1, reason: expect.stringMatching(/does not start with/) }]);
  });

  it("reports every offending line, not just the first", () => {
    const text = ["https://a.example/*", "  X-A: 1", "//b.example/*", "  X-B: 2", "/ok/*", "  X-C: 3", "c/bad", "  X-D: 4"].join("\n");
    const result = checkHeadersFileRules(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.map((v) => v.line)).toEqual([1, 3, 7]);
  });
});

describe("checkHeadersFileRules / header line before any rule", () => {
  it("rejects a header line that appears before any rule line", () => {
    const result = checkHeadersFileRules("  Cache-Control: no-cache\n/app/\n  Cache-Control: no-cache\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual([{ line: 1, reason: expect.stringMatching(/before any rule line/) }]);
    }
  });
});

describe("checkHeadersFileRules / comments and blank lines", () => {
  it("ignores comment and blank lines, and does not count a comment as a rule line", () => {
    const text = ["# a comment", "", "/app/", "  Cache-Control: no-cache", "", "# trailing comment"].join("\n");
    expect(checkHeadersFileRules(text)).toEqual({ ok: true });
  });

  it("still rejects a header line before any rule even when preceded only by comments and blanks", () => {
    const text = ["# comment", "", "  Cache-Control: no-cache", "/app/", "  Cache-Control: no-cache"].join("\n");
    const result = checkHeadersFileRules(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual([{ line: 3, reason: expect.stringMatching(/before any rule line/) }]);
  });
});
