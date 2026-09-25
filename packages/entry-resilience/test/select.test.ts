// Write-time "does this beat what's stored" decision: spec/pwa-entry-resilience.md's revised "updateEntryManifest
// 在校验通过且 sequence 大于已存记录时写入 IndexedDB...序号不大于已存记录时不写入". Two-way only since ADR-0033
// (2026-09-23) removed the build-time seed and discovery source — see test/manifest.test.ts for field validation,
// which runs before this and is out of scope here.
import { describe, expect, it } from "vitest";
import { selectManifest } from "../src/select.js";
import type { EntryManifest } from "../src/types.js";

function manifest(overrides: Partial<EntryManifest> = {}): EntryManifest {
  return {
    sequence: 5,
    expiresAt: "2026-10-01T08:00:00Z",
    status: "migrating",
    reason: { code: "planned-migration" },
    entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
    ...overrides,
  };
}

describe("selectManifest", () => {
  it("accepts the incoming manifest when nothing is stored yet", () => {
    const incoming = manifest({ sequence: 1 });
    expect(selectManifest({ stored: null, incoming })).toEqual({ kind: "accepted", manifest: incoming });
  });

  it("accepts an incoming manifest whose sequence is strictly greater than the stored one's", () => {
    const stored = manifest({ sequence: 5 });
    const incoming = manifest({ sequence: 6 });
    expect(selectManifest({ stored, incoming })).toEqual({ kind: "accepted", manifest: incoming });
  });

  it("rejects an incoming manifest whose sequence equals the stored one's", () => {
    const stored = manifest({ sequence: 5 });
    const incoming = manifest({ sequence: 5, status: "incident" });
    expect(selectManifest({ stored, incoming })).toEqual({
      kind: "rejected",
      diagnostics: [{ code: "entry.sequence-not-greater", path: "/sequence" }],
    });
  });

  it("rejects an incoming manifest whose sequence is lower than the stored one's", () => {
    const stored = manifest({ sequence: 5 });
    const incoming = manifest({ sequence: 4 });
    expect(selectManifest({ stored, incoming })).toEqual({
      kind: "rejected",
      diagnostics: [{ code: "entry.sequence-not-greater", path: "/sequence" }],
    });
  });

  it("accepts sequence 0 as the incoming manifest when nothing is stored", () => {
    const incoming = manifest({ sequence: 0 });
    expect(selectManifest({ stored: null, incoming })).toEqual({ kind: "accepted", manifest: incoming });
  });
});
