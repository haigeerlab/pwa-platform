// The plugin on the server (ADR-0016, 2026-09-17 amendment). Vitest runs in Node, where `window` does not exist,
// so an install without an injected client takes exactly the path a server render takes. Rendering through the
// real `vue/server-renderer` is covered by the server-side suite in examples-browser-e2e.
import type { PwaClientConfig } from "@pwa-platform/client-runtime";
import { createSSRApp } from "vue";
import { describe, expect, it, vi } from "vitest";

// Spied rather than stubbed: a facade created on the server is the defect, so the real factory stays underneath and
// the spy only records whether anyone reached for it.
const created = vi.hoisted(() => ({ count: 0 }));
vi.mock("@pwa-platform/client-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pwa-platform/client-runtime")>();
  return {
    ...actual,
    createPwaClient: (...args: Parameters<typeof actual.createPwaClient>) => {
      created.count += 1;
      return actual.createPwaClient(...args);
    },
  };
});

const { createPwa, usePwa } = await import("../src/index.js");

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

function serverBinding() {
  const app = createSSRApp({ render: () => null });
  app.use(createPwa({ config }));
  return { app, binding: app.runWithContext(() => usePwa()) };
}

describe("the plugin during server-side rendering", () => {
  it("runs in an environment without window", () => {
    // Guards the premise of every test below: in a DOM-like environment they would exercise the browser path.
    expect(typeof window).toBe("undefined");
  });

  it("creates no facade", () => {
    created.count = 0;
    serverBinding();
    expect(created.count).toBe(0);
  });

  it("provides the initial state", () => {
    const { binding } = serverBinding();
    expect(binding.state.value).toEqual({
      registered: false,
      installEligible: false,
      installed: false,
      updateWaiting: false,
    });
  });

  it("rejects every method with a server-side rendering error", async () => {
    const { binding } = serverBinding();
    await expect(binding.register()).rejects.toThrow(/server-side rendering/);
    await expect(binding.promptInstall()).rejects.toThrow(/server-side rendering/);
    await expect(binding.applyUpdate()).rejects.toThrow(/server-side rendering/);
    await expect(binding.logout()).rejects.toThrow(/server-side rendering/);
    await expect(binding.checkForUpdate()).rejects.toThrow(/server-side rendering/);
  });
});
