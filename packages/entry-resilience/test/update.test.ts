// End-to-end coverage for the write path behind `updateEntryManifest`: validate (src/manifest.ts), compare against
// the stored record (src/select.ts), write (a fake port here; src/browser/indexeddb.ts for the real one). See
// spec/pwa-entry-resilience.md's revised "页面侧 API".
import { describe, expect, it, vi } from "vitest";
import { runEntryManifestUpdate } from "../src/update.js";
import type { EntryManifestUpdateConfig, EntryManifestUpdatePorts } from "../src/update.js";
import type { EntryManifest } from "../src/types.js";
import { APP_ID, ENVIRONMENT, NOW_MS, toStrictIso, days, validManifest } from "./support/fixtures.js";

function config(overrides: Partial<EntryManifestUpdateConfig> = {}): EntryManifestUpdateConfig {
  return { appId: APP_ID, environment: ENVIRONMENT, maxValidityDays: 30, ...overrides };
}

function ports(overrides: Partial<EntryManifestUpdatePorts> = {}): EntryManifestUpdatePorts {
  return {
    now: () => NOW_MS,
    loadStored: async () => null,
    saveStored: async () => undefined,
    ...overrides,
  };
}

describe("runEntryManifestUpdate", () => {
  it("accepts and writes a valid manifest when nothing is stored yet", async () => {
    const saveStored = vi.fn(async (): Promise<void> => undefined);
    const data = validManifest({ sequence: 3 });
    const result = await runEntryManifestUpdate(data, config(), ports({ saveStored }));
    expect(result).toEqual({ accepted: true, sequence: 3 });
    expect(saveStored).toHaveBeenCalledWith(data);
  });

  it("rejects invalid manifest shapes without writing", async () => {
    const saveStored = vi.fn(async (): Promise<void> => undefined);
    const result = await runEntryManifestUpdate(validManifest({ sequence: -1 }), config(), ports({ saveStored }));
    expect(result).toEqual({ accepted: false, diagnostics: [{ code: "entry.sequence-invalid", path: "/sequence" }] });
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("accepts and overwrites when the incoming sequence is greater than the stored one's", async () => {
    const stored: EntryManifest = {
      sequence: 2,
      expiresAt: toStrictIso(NOW_MS + days(1)),
      status: "normal",
      reason: { code: "none" },
      entries: [],
    };
    const saveStored = vi.fn(async (): Promise<void> => undefined);
    const data = validManifest({ sequence: 3 });
    const result = await runEntryManifestUpdate(data, config(), ports({ loadStored: async () => stored, saveStored }));
    expect(result).toEqual({ accepted: true, sequence: 3 });
    expect(saveStored).toHaveBeenCalledWith(data);
  });

  it("rejects and does not write when the incoming sequence is not greater than the stored one's", async () => {
    const stored: EntryManifest = {
      sequence: 5,
      expiresAt: toStrictIso(NOW_MS + days(1)),
      status: "normal",
      reason: { code: "none" },
      entries: [],
    };
    const saveStored = vi.fn(async (): Promise<void> => undefined);
    const result = await runEntryManifestUpdate(
      validManifest({ sequence: 5 }),
      config(),
      ports({ loadStored: async () => stored, saveStored }),
    );
    expect(result).toEqual({
      accepted: false,
      diagnostics: [{ code: "entry.sequence-not-greater", path: "/sequence" }],
    });
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("rejects, without throwing, when the clock is unavailable", async () => {
    const result = await runEntryManifestUpdate(
      validManifest(),
      config(),
      ports({
        now: () => {
          throw new Error("clock unavailable");
        },
      }),
    );
    expect(result).toEqual({ accepted: false, diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
  });

  it("rejects, without throwing, when the clock returns a non-finite value", async () => {
    const result = await runEntryManifestUpdate(validManifest(), config(), ports({ now: () => Number.NaN }));
    expect(result).toEqual({ accepted: false, diagnostics: [{ code: "entry.runtime-unavailable", path: "" }] });
  });

  it("rejects, without throwing, when loadStored fails, and does not attempt to write", async () => {
    const saveStored = vi.fn(async (): Promise<void> => undefined);
    const result = await runEntryManifestUpdate(
      validManifest(),
      config(),
      ports({
        loadStored: async () => {
          throw new Error("db unavailable");
        },
        saveStored,
      }),
    );
    expect(result).toEqual({ accepted: false, diagnostics: [{ code: "entry.storage-unavailable", path: "" }] });
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("rejects, without throwing, when saveStored fails", async () => {
    const result = await runEntryManifestUpdate(
      validManifest(),
      config(),
      ports({
        saveStored: async () => {
          throw new Error("quota exceeded");
        },
      }),
    );
    expect(result).toEqual({ accepted: false, diagnostics: [{ code: "entry.storage-write-failed", path: "" }] });
  });
});
