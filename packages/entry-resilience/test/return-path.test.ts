import { describe, expect, it } from "vitest";
import { normalizeReturnPath } from "../src/return-path.js";

const ORIGIN = "https://app.example.com";
const CONTEXT = { origin: ORIGIN, scope: "/app/" };

describe("normalizeReturnPath", () => {
  it("returns a plain path unchanged", () => {
    expect(normalizeReturnPath("/app/", CONTEXT)).toBe("/app/");
  });

  it("allows a query string and a fragment", () => {
    expect(normalizeReturnPath("/app/orders/42?tab=1#top", CONTEXT)).toBe("/app/orders/42?tab=1#top");
  });

  it("rejects a protocol-relative path (//evil)", () => {
    expect(normalizeReturnPath("//evil", CONTEXT)).toBeNull();
  });

  it("rejects a backslash right after the leading slash (/\\evil)", () => {
    expect(normalizeReturnPath("/\\evil", CONTEXT)).toBeNull();
  });

  it("rejects a percent-encoded protocol-relative path (/%2F%2Fevil)", () => {
    expect(normalizeReturnPath("/%2F%2Fevil", CONTEXT)).toBeNull();
  });

  it("rejects a percent-encoded backslash (/%5Cevil)", () => {
    expect(normalizeReturnPath("/%5Cevil", CONTEXT)).toBeNull();
  });

  it("rejects a percent-encoded .. segment (/a/%2E%2E/b)", () => {
    expect(normalizeReturnPath("/a/%2E%2E/b", CONTEXT)).toBeNull();
  });

  it("rejects a literal .. segment (/app/../x)", () => {
    expect(normalizeReturnPath("/app/../x", CONTEXT)).toBeNull();
  });

  it("rejects a literal control character", () => {
    expect(normalizeReturnPath("/app/x", CONTEXT)).toBeNull();
  });

  it("rejects a percent-encoded control character (%00)", () => {
    expect(normalizeReturnPath("/%00", CONTEXT)).toBeNull();
  });

  it("rejects a path over 1024 characters", () => {
    expect(normalizeReturnPath(`/${"a".repeat(1024)}`, CONTEXT)).toBeNull();
  });

  it("rejects a non-string value", () => {
    expect(normalizeReturnPath(42, CONTEXT)).toBeNull();
    expect(normalizeReturnPath(null, CONTEXT)).toBeNull();
    expect(normalizeReturnPath(undefined, CONTEXT)).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(normalizeReturnPath("", CONTEXT)).toBeNull();
  });

  it("rejects a path outside the identity's scope", () => {
    expect(normalizeReturnPath("/other/1", CONTEXT)).toBeNull();
  });

  it("rejects an illegal percent-encoding that fails to decode", () => {
    expect(normalizeReturnPath("/%E0%A4%A", CONTEXT)).toBeNull();
  });

  it("rejects a path that does not start with /", () => {
    expect(normalizeReturnPath("app/", CONTEXT)).toBeNull();
  });

  it("rejects a percent-encoded backslash even under a root scope, where the URL/scope check alone would not catch it", () => {
    // With scope "/" every pathname starts with the scope and the URL parser leaves an unrecognized
    // percent-encoding like %5C untouched in `pathname`, so only the post-decode structural recheck
    // (re-running the "no backslash" rule on the *decoded* string) rejects this input.
    expect(normalizeReturnPath("/%5Cx", { origin: ORIGIN, scope: "/" })).toBeNull();
  });

  // Independent review finding (2026-09-17): a literal `?` introduced by decoding `%3f` used to let the old
  // truncate-at-`?`/`#` ".." check miss a ".." that came after it in the decoded string.
  it("rejects a .. segment that only appears after a %3f decodes to a literal ? (/app/x%3f/../y)", () => {
    expect(normalizeReturnPath("/app/x%3f/../y", CONTEXT)).toBeNull();
  });

  it("rejects the same %3f-then-.. shape under a root scope, where the URL/scope check alone would not catch it", () => {
    expect(normalizeReturnPath("/x%3f/../y", { origin: ORIGIN, scope: "/" })).toBeNull();
  });

  it("rejects a fully percent-encoded .. segment under a root scope, where URL normalization alone would not catch it", () => {
    // `new URL("/%2e%2e/evil", origin).pathname` normalizes to "/evil", which (unlike under a non-root scope)
    // trivially still starts with scope "/" — so only the explicit post-decode ".." check rejects this input.
    expect(normalizeReturnPath("/%2e%2e/evil", { origin: ORIGIN, scope: "/" })).toBeNull();
  });
});
