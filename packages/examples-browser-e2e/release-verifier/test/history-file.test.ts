import { describe, expect, it } from "vitest";
import { HISTORY_FORMAT, validateHistoryFile } from "../history-file.ts";

const expected = { target: "react", slot: "main", project: "pwa-platform-react-demo" };

function validFile(overrides: Record<string, unknown> = {}): unknown {
  return {
    format: HISTORY_FORMAT,
    target: "react",
    slot: "main",
    project: "pwa-platform-react-demo",
    exportedAt: "2026-09-22T00:00:00.000Z",
    canonicalDeploymentId: "8589bf50-b6d2-493f-9551-ea4b7dd8adec",
    deployments: [
      { id: "8589bf50-b6d2-493f-9551-ea4b7dd8adec", createdOn: "2026-09-20T00:00:00.000Z", bundleSha256: "a".repeat(64) },
      { id: "18824a5c-9103-41a5-953b-0efaedf4360a", createdOn: "2026-08-01T00:00:00.000Z", bundleSha256: null },
    ],
    ...overrides,
  };
}

describe("validateHistoryFile", () => {
  it("accepts a well-formed export", () => {
    const result = validateHistoryFile(validFile(), expected);
    expect(result.ok).toBe(true);
  });

  it("rejects a target mismatch", () => {
    const result = validateHistoryFile(validFile({ target: "vue" }), expected);
    expect(result).toEqual({ ok: false, reason: "History file target does not match --target" });
  });

  it("rejects a slot mismatch", () => {
    const result = validateHistoryFile(validFile({ slot: "drill" }), expected);
    expect(result.ok).toBe(false);
  });

  it("rejects a project mismatch", () => {
    const result = validateHistoryFile(validFile({ project: "some-other-project" }), expected);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown format", () => {
    const result = validateHistoryFile(validFile({ format: "pwa-cloudflare-production-history/v2" }), expected);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-hex bundleSha256", () => {
    const result = validateHistoryFile(validFile({ deployments: [{ id: "x", createdOn: "2026-09-20T00:00:00.000Z", bundleSha256: "not-hex" }] }), expected);
    expect(result.ok).toBe(false);
  });

  it("accepts a null bundleSha256", () => {
    const result = validateHistoryFile(validFile({ deployments: [{ id: "x", createdOn: "2026-09-20T00:00:00.000Z", bundleSha256: null }] }), expected);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object input", () => {
    expect(validateHistoryFile("not-an-object", expected).ok).toBe(false);
    expect(validateHistoryFile(null, expected).ok).toBe(false);
  });

  it("rejects deployments that are not an array", () => {
    const result = validateHistoryFile(validFile({ deployments: {} }), expected);
    expect(result.ok).toBe(false);
  });
});
