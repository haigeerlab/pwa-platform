import { describe, expect, it, vi } from "vitest";
import { decideRecovery } from "../src/decide.js";
import type { EntryProbes } from "../src/decide.js";
import type { EntryManifest, EntryManifestStatus } from "../src/types.js";

function manifest(overrides: Partial<EntryManifest> = {}): EntryManifest {
  return {
    sequence: 1,
    expiresAt: "2026-10-01T08:00:00Z",
    status: "normal",
    reason: { code: "none" },
    entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
    ...overrides,
  };
}

function probes(overrides: Partial<EntryProbes> = {}): EntryProbes {
  return {
    probePrimary: vi.fn(async () => false),
    probeAlternate: vi.fn(async () => false),
    ...overrides,
  };
}

describe("decideRecovery", () => {
  it("returns none for an empty entries list and probes nothing", async () => {
    const p = probes();
    const result = await decideRecovery(manifest({ entries: [] }), p);
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.no-entries", path: "" }] });
    expect(p.probePrimary).not.toHaveBeenCalled();
    expect(p.probeAlternate).not.toHaveBeenCalled();
  });

  it("shows a migrating manifest without probing anything", async () => {
    const status: EntryManifestStatus = "migrating";
    const p = probes();
    const m = manifest({ status });
    const result = await decideRecovery(m, p);
    expect(result).toEqual({ kind: "available", status: "migrating", manifest: m, entries: m.entries });
    expect(p.probePrimary).not.toHaveBeenCalled();
    expect(p.probeAlternate).not.toHaveBeenCalled();
  });

  it("shows an incident manifest without probing anything", async () => {
    const status: EntryManifestStatus = "incident";
    const p = probes();
    const m = manifest({ status });
    const result = await decideRecovery(m, p);
    expect(result).toEqual({ kind: "available", status: "incident", manifest: m, entries: m.entries });
    expect(p.probePrimary).not.toHaveBeenCalled();
    expect(p.probeAlternate).not.toHaveBeenCalled();
  });

  it("returns none for a normal manifest when the primary is reachable, without probing alternates", async () => {
    const p = probes({ probePrimary: vi.fn(async () => true) });
    const result = await decideRecovery(manifest({ status: "normal" }), p);
    expect(result).toEqual({ kind: "none", diagnostics: [] });
    expect(p.probePrimary).toHaveBeenCalledTimes(1);
    expect(p.probeAlternate).not.toHaveBeenCalled();
  });

  it("shows unconfirmed-outage when the primary fails and an alternate is reachable", async () => {
    const p = probes({ probePrimary: vi.fn(async () => false), probeAlternate: vi.fn(async () => true) });
    const m = manifest({ status: "normal" });
    const result = await decideRecovery(m, p);
    expect(result).toEqual({ kind: "available", status: "unconfirmed-outage", manifest: m, entries: m.entries });
  });

  it("returns none when the primary and every alternate fail (device offline)", async () => {
    const p = probes();
    const result = await decideRecovery(manifest({ status: "normal" }), p);
    expect(result).toEqual({ kind: "none", diagnostics: [] });
  });

  it("treats a throwing primary probe as unreachable and still checks alternates", async () => {
    const p = probes({
      probePrimary: vi.fn(async () => {
        throw new Error("network down");
      }),
      probeAlternate: vi.fn(async () => true),
    });
    const m = manifest({ status: "normal" });
    const result = await decideRecovery(m, p);
    expect(result).toEqual({ kind: "available", status: "unconfirmed-outage", manifest: m, entries: m.entries });
  });

  it("treats a throwing alternate probe as unreachable and tries the next entry", async () => {
    const entries = [
      { origin: "https://alt-a.example.com", startPath: "/app/" },
      { origin: "https://alt-b.example.com", startPath: "/app/" },
    ];
    const probeAlternate = vi.fn(async (origin: string) => {
      if (origin === "https://alt-a.example.com") throw new Error("boom");
      return true;
    });
    const p = probes({ probeAlternate });
    const m = manifest({ status: "normal", entries });
    const result = await decideRecovery(m, p);
    expect(result).toEqual({
      kind: "available",
      status: "unconfirmed-outage",
      manifest: m,
      entries: [entries[1]],
    });
    expect(probeAlternate).toHaveBeenCalledTimes(2);
  });

  // Independent review finding (2026-09-17): decideRecovery used to stop at the first reachable alternate; the
  // spec calls for showing every entry confirmed reachable by a probe, so every entry must now be probed.
  it("probes every entry (not just up to the first reachable one) and collects only the reachable ones, in manifest order", async () => {
    const entries = [
      { origin: "https://alt-a.example.com", startPath: "/app/" },
      { origin: "https://alt-b.example.com", startPath: "/app/" },
    ];
    const calls: string[] = [];
    const probeAlternate = vi.fn(async (origin: string) => {
      calls.push(origin);
      return origin === "https://alt-a.example.com";
    });
    const p = probes({ probeAlternate });
    const m = manifest({ status: "normal", entries });
    const result = await decideRecovery(m, p);
    expect(calls).toEqual(["https://alt-a.example.com", "https://alt-b.example.com"]);
    expect(result).toEqual({
      kind: "available",
      status: "unconfirmed-outage",
      manifest: m,
      entries: [entries[0]],
    });
  });
});
