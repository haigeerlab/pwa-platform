// Wiring for the two page-side API functions (spec/pwa-entry-resilience.md's revised "页面侧 API"). Nothing here
// exercises the real browser ports (IndexedDB, `Date.now`, fetch) — `virtual:pwa-entry-config` only resolves
// inside an actual Vite build (see test/vite/plugin.test.ts and browser-tests/), and src/browser/index.ts's own
// ports (IndexedDB, probes) need a real browser. What this file proves instead: `checkEntryRecovery` and
// `updateEntryManifest` each delegate to the right pure function (src/check.ts, src/update.ts) with the shared
// config, and — the point of routing both through one `sharedPorts()` — a single lazily-created ports object is
// reused across calls to either function, not rebuilt per call.
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONFIG = {
  appId: "pwaexample",
  environment: "production",
  scope: "/app/",
  mountPath: "/app/",
  maxValidityDays: 30,
  recoveryPagePath: "/app/pwa-entry.html",
};

const createEntryRuntimePorts = vi.fn(() => ({
  now: () => 0,
  currentOrigin: () => "https://current.example.com",
  loadStored: async () => null,
  saveStored: async () => undefined,
  probePrimary: async () => false,
  probeAlternate: async () => false,
}));
// Typed via `vi.fn`'s generic, not named parameters, purely so `.mock.calls[0][n]` below is typed as a 3-tuple:
// the fakes themselves ignore every argument.
const runEntryRecovery = vi.fn<(config: unknown, ports: unknown, options?: unknown) => Promise<{ kind: "none"; diagnostics: never[] }>>(
  async () => ({ kind: "none", diagnostics: [] }),
);
const runEntryManifestUpdate = vi.fn<
  (data: unknown, config: unknown, ports: unknown) => Promise<{ accepted: false; diagnostics: never[] }>
>(async () => ({ accepted: false, diagnostics: [] }));

vi.mock("virtual:pwa-entry-config", () => ({ default: CONFIG }));
vi.mock("../../src/browser/index.js", () => ({ createEntryRuntimePorts }));
vi.mock("../../src/check.js", () => ({ runEntryRecovery }));
vi.mock("../../src/update.js", () => ({ runEntryManifestUpdate }));

beforeEach(() => {
  vi.clearAllMocks();
  // src/client/index.ts caches its ports object at module scope; each test needs a fresh module instance so that
  // cache starts empty, not just fresh call counts on the mocks.
  vi.resetModules();
});

describe("client/index.ts wiring", () => {
  it("wires checkEntryRecovery to runEntryRecovery with the virtual config and options", async () => {
    const { checkEntryRecovery } = await import("../../src/client/index.js");
    await checkEntryRecovery({ returnPath: "/app/orders/42" });
    expect(runEntryRecovery).toHaveBeenCalledTimes(1);
    const [config, , options] = runEntryRecovery.mock.calls[0] as unknown as [unknown, unknown, unknown];
    expect(config).toBe(CONFIG);
    expect(options).toEqual({ returnPath: "/app/orders/42" });
  });

  it("wires updateEntryManifest to runEntryManifestUpdate with the given data and the virtual config", async () => {
    const { updateEntryManifest } = await import("../../src/client/index.js");
    const data = { sequence: 1 };
    await updateEntryManifest(data);
    expect(runEntryManifestUpdate).toHaveBeenCalledTimes(1);
    const [passedData, config] = runEntryManifestUpdate.mock.calls[0] as unknown as [unknown, unknown, unknown];
    expect(passedData).toBe(data);
    expect(config).toBe(CONFIG);
  });

  it("builds the browser ports lazily, once, and reuses them for both checkEntryRecovery and updateEntryManifest", async () => {
    const { checkEntryRecovery, updateEntryManifest } = await import("../../src/client/index.js");
    expect(createEntryRuntimePorts).not.toHaveBeenCalled();

    await checkEntryRecovery();
    expect(createEntryRuntimePorts).toHaveBeenCalledTimes(1);
    const portsFromCheck = runEntryRecovery.mock.calls[0]?.[1];

    await updateEntryManifest({ sequence: 1 });
    // Still just once: the same ports object built for checkEntryRecovery is reused, not rebuilt.
    expect(createEntryRuntimePorts).toHaveBeenCalledTimes(1);
    const portsFromUpdate = runEntryManifestUpdate.mock.calls[0]?.[2];
    expect(portsFromUpdate).toBe(portsFromCheck);

    await checkEntryRecovery();
    expect(createEntryRuntimePorts).toHaveBeenCalledTimes(1);
  });
});

// spec/pwa-entry-resilience.md's "跟随宿主应用的主题设置": `setPwaTheme` writes/removes the key
// `pwa:theme:<appId>:<environment>` (src/internal/theme-key.ts) and never throws, even when the storage it writes
// to is unavailable. `localStorage` is a Node global (see src/client/index.ts's docstring), so it is stubbed here
// with `vi.stubGlobal` rather than mocked as a module.
describe("client/index.ts: setPwaTheme", () => {
  const KEY = `pwa:theme:${encodeURIComponent(CONFIG.appId)}:${encodeURIComponent(CONFIG.environment)}`;

  function fakeStorage(): { readonly storage: Storage; readonly data: Map<string, string> } {
    const data = new Map<string, string>();
    const storage: Storage = {
      get length(): number {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => {
        data.delete(key);
      },
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
    return { storage, data };
  }

  it('writes "light"/"dark" to pwa:theme:<appId>:<environment>', async () => {
    const { storage, data } = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const { setPwaTheme } = await import("../../src/client/index.js");

    setPwaTheme("dark");
    expect(data.get(KEY)).toBe("dark");

    setPwaTheme("light");
    expect(data.get(KEY)).toBe("light");

    vi.unstubAllGlobals();
  });

  it('removes the key for "system"', async () => {
    const { storage, data } = fakeStorage();
    data.set(KEY, "dark");
    vi.stubGlobal("localStorage", storage);
    const { setPwaTheme } = await import("../../src/client/index.js");

    setPwaTheme("system");
    expect(data.has(KEY)).toBe(false);

    vi.unstubAllGlobals();
  });

  it("never throws when the storage it writes to throws (privacy mode, disabled storage, quota)", async () => {
    const throwingStorage: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);
    const { setPwaTheme } = await import("../../src/client/index.js");

    expect(() => setPwaTheme("dark")).not.toThrow();
    expect(() => setPwaTheme("system")).not.toThrow();

    vi.unstubAllGlobals();
  });
});
