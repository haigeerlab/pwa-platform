// Read path: resolveEntryRecovery now only reads the one manifest IndexedDB stores (see src/resolve.ts's own header
// comment on why this file was rewritten as part of EM2, and the two judgment calls it flags for EM3 to confirm).
import { describe, expect, it, vi } from "vitest";
import { resolveEntryRecovery } from "../src/resolve.js";
import type { EntryRuntimeConfig, EntryRuntimePorts } from "../src/resolve.js";
import type { EntryManifest } from "../src/types.js";
import { NOW_MS, days, toStrictIso } from "./support/fixtures.js";

const CURRENT_ORIGIN = "https://current.example.com";

function config(overrides: Partial<EntryRuntimeConfig> = {}): EntryRuntimeConfig {
  return {
    appId: "pwaexample",
    environment: "production",
    scope: "/app/",
    maxValidityDays: 30,
    recoveryPagePath: "/app/pwa-entry.html",
    ...overrides,
  };
}

function ports(overrides: Partial<EntryRuntimePorts> = {}): EntryRuntimePorts {
  return {
    now: () => NOW_MS,
    currentOrigin: () => CURRENT_ORIGIN,
    loadStored: async () => null,
    probePrimary: async () => false,
    probeAlternate: async () => false,
    ...overrides,
  };
}

function manifest(overrides: Partial<EntryManifest> = {}): EntryManifest {
  return {
    sequence: 1,
    expiresAt: toStrictIso(NOW_MS + days(1)),
    status: "migrating",
    reason: { code: "planned-migration" },
    entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
    ...overrides,
  };
}

describe("resolveEntryRecovery", () => {
  it("resolves an available result carrying the stored manifest", async () => {
    const stored = manifest({ status: "migrating" });
    const result = await resolveEntryRecovery(config(), ports({ loadStored: async () => stored }));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("unreachable");
    expect(result.status).toBe("migrating");
    expect(result.manifest).toEqual(stored);
    expect(result.entries).toEqual(stored.entries);
  });

  it("returns none when nothing is stored", async () => {
    const result = await resolveEntryRecovery(config(), ports());
    expect(result).toEqual({ kind: "none", diagnostics: [] });
  });

  it("returns none, with an entry.expired diagnostic, when the stored manifest has expired", async () => {
    const stored = manifest({ expiresAt: toStrictIso(NOW_MS - 1) });
    const result = await resolveEntryRecovery(config(), ports({ loadStored: async () => stored }));
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.expired", path: "" }] });
  });

  it("returns none when the stored manifest expires exactly now", async () => {
    const stored = manifest({ expiresAt: toStrictIso(NOW_MS) });
    const result = await resolveEntryRecovery(config(), ports({ loadStored: async () => stored }));
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.expired", path: "" }] });
  });

  it("fails closed, without throwing, when the current origin is unavailable, before touching storage", async () => {
    const loadStored = vi.fn(async () => null);
    const result = await resolveEntryRecovery(
      config(),
      ports({
        currentOrigin: () => {
          throw new Error("no window");
        },
        loadStored,
      }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
    expect(loadStored).not.toHaveBeenCalled();
  });

  it("fails closed, without throwing, when the clock is unavailable", async () => {
    const result = await resolveEntryRecovery(
      config(),
      ports({
        now: () => {
          throw new Error("clock unavailable");
        },
      }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
  });

  it("fails closed, without throwing, when the clock returns NaN, before touching storage", async () => {
    const loadStored = vi.fn(async () => null);
    const result = await resolveEntryRecovery(config(), ports({ now: () => Number.NaN, loadStored }));
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
    expect(loadStored).not.toHaveBeenCalled();
  });

  it("treats a throwing loadStored as no stored record and records a diagnostic", async () => {
    const result = await resolveEntryRecovery(
      config(),
      ports({
        loadStored: async () => {
          throw new Error("db unavailable");
        },
      }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.storage-unavailable", path: "" }] });
  });

  it("returns none for a normal status when the primary is reachable", async () => {
    const stored = manifest({ status: "normal", reason: { code: "none" } });
    const result = await resolveEntryRecovery(
      config(),
      ports({ loadStored: async () => stored, probePrimary: async () => true }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [] });
  });

  it("shows unconfirmed-outage for a normal status when the primary fails and an alternate is reachable", async () => {
    const stored = manifest({ status: "normal", reason: { code: "none" } });
    const result = await resolveEntryRecovery(
      config(),
      ports({ loadStored: async () => stored, probePrimary: async () => false, probeAlternate: async () => true }),
    );
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("unreachable");
    expect(result.status).toBe("unconfirmed-outage");
  });
});
