// `runEntryRecovery` itself is unchanged by ADR-0033 (2026-09-23) — see src/check.ts, not touched by this task —
// but its `EntryRuntimeConfig`/`EntryRuntimePorts` shapes shrank along with src/resolve.ts's read path, so its
// fixtures here are rebuilt to match.
import { describe, expect, it } from "vitest";
import { runEntryRecovery } from "../src/check.js";
import type { EntryRuntimeConfig, EntryRuntimePorts } from "../src/check.js";
import type { EntryManifest } from "../src/types.js";
import { NOW_MS, days, toStrictIso } from "./support/fixtures.js";

const CURRENT_ORIGIN = "https://current.example.com";
const APPROVED_ORIGIN = "https://new.example.com";

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

function migratingManifest(overrides: Partial<EntryManifest> = {}): EntryManifest {
  return {
    sequence: 1,
    expiresAt: toStrictIso(NOW_MS + days(1)),
    status: "migrating",
    reason: { code: "planned-migration" },
    entries: [{ origin: APPROVED_ORIGIN, startPath: "/app/" }],
    ...overrides,
  };
}

describe("runEntryRecovery", () => {
  it("resolves an available result from the stored manifest with no query string when there is no return path", async () => {
    const result = await runEntryRecovery(config(), ports({ loadStored: async () => migratingManifest() }));
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("unreachable");
    expect(result.status).toBe("migrating");
    expect(result.recoveryPageUrl).toBe("/app/pwa-entry.html");
  });

  it("appends a validated return path", async () => {
    const result = await runEntryRecovery(config(), ports({ loadStored: async () => migratingManifest() }), {
      returnPath: "/app/orders/42",
    });
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("unreachable");
    expect(result.recoveryPageUrl).toBe("/app/pwa-entry.html?return=%2Fapp%2Forders%2F42");
  });

  it("silently drops an invalid return path and records a diagnostic", async () => {
    const result = await runEntryRecovery(config(), ports({ loadStored: async () => migratingManifest() }), {
      returnPath: "//evil",
    });
    expect(result.kind).toBe("available");
    if (result.kind !== "available") throw new Error("unreachable");
    expect(result.recoveryPageUrl).toBe("/app/pwa-entry.html");
    expect(result.diagnostics).toContainEqual({ code: "entry.return-path-dropped", path: "" });
  });

  it("treats a throwing loadStored as no stored record and records a diagnostic", async () => {
    const result = await runEntryRecovery(
      config(),
      ports({
        loadStored: async () => {
          throw new Error("db unavailable");
        },
      }),
    );
    expect(result.kind).toBe("none");
    expect(result.diagnostics).toContainEqual({ code: "entry.storage-unavailable", path: "" });
  });

  it("returns none when there is no valid candidate anywhere", async () => {
    const result = await runEntryRecovery(config(), ports());
    expect(result.kind).toBe("none");
  });

  it("fails closed, without throwing, when the current origin is unavailable", async () => {
    const result = await runEntryRecovery(
      config(),
      ports({
        currentOrigin: () => {
          throw new Error("no window");
        },
      }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
  });

  it("fails closed, without throwing, when the clock is unavailable", async () => {
    const result = await runEntryRecovery(
      config(),
      ports({
        now: () => {
          throw new Error("clock unavailable");
        },
      }),
    );
    expect(result).toEqual({ kind: "none", diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
  });

  it("never includes the entry origin in the result", async () => {
    const result = await runEntryRecovery(config(), ports({ loadStored: async () => migratingManifest() }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(APPROVED_ORIGIN);
  });
});
