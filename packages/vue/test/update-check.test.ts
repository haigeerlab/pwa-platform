// The updateCheck option, forwarded to createPwaClient when the plugin builds its own facade (spec: 修订：主动检查
//更新, 框架绑定增量). Separate from binding.test.ts because it needs a mocked createPwaClient and a stubbed
// `window` to reach the browser path — the rest of that suite always injects a fake client instead.
import type { PwaClientConfig } from "@pwa-platform/client-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

// Spied rather than stubbed with a bare function: capturing the exact options object is the whole point of this
// suite, and a minimal stand-in facade keeps it from reaching for navigator.serviceWorker in Node.
const calls = vi.hoisted(() => [] as unknown[]);
vi.mock("@pwa-platform/client-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pwa-platform/client-runtime")>();
  return {
    ...actual,
    createPwaClient: (options: Parameters<typeof actual.createPwaClient>[0]) => {
      calls.push(options);
      return {
        register: async () => undefined,
        promptInstall: async () => "unavailable" as const,
        applyUpdate: async () => false,
        logout: async () => false,
        checkForUpdate: async () => "unavailable" as const,
        subscribe: () => () => undefined,
        dispose: () => undefined,
      };
    },
  };
});

const { createPwa } = await import("../src/index.js");

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

/** A stand-in for Vue's `App`, carrying only `provide` — this suite never unmounts. */
function fakeApp(): { provide: (key: unknown, value: unknown) => unknown } {
  const app = { provide: () => app };
  return app;
}

function install(plugin: ReturnType<typeof createPwa>): void {
  (plugin as { install: (app: unknown) => void }).install(fakeApp());
}

describe("the updateCheck option", () => {
  afterEach(() => {
    calls.length = 0;
    vi.unstubAllGlobals();
  });

  it("reaches createPwaClient when the plugin builds its own facade", () => {
    // `typeof window === "undefined"` is true under Vitest's Node environment, which would otherwise take the
    // server-side branch and never call createPwaClient at all.
    vi.stubGlobal("window", {});
    install(createPwa({ config, updateCheck: { intervalMs: 60_000 } }));

    expect(calls).toEqual([{ config, updateCheck: { intervalMs: 60_000 } }]);
  });

  it("is left out of the options passed to createPwaClient when not set", () => {
    vi.stubGlobal("window", {});
    install(createPwa({ config }));

    expect(calls).toEqual([{ config }]);
  });
});
