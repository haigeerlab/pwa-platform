// The methods the hook hands out on the server (ADR-0016, 2026-09-17 amendment). The hook itself needs a renderer,
// which this package deliberately does not carry: a real `react-dom/server` render lives in examples-browser-e2e.
import { describe, expect, it } from "vitest";
import { createStore, SERVER_METHODS, SERVER_RENDERING_ERROR } from "../src/store.js";

describe("the server-side methods", () => {
  it("reject every method at once with the server-side rendering error", async () => {
    await expect(SERVER_METHODS.register()).rejects.toThrow(SERVER_RENDERING_ERROR);
    await expect(SERVER_METHODS.promptInstall()).rejects.toThrow(SERVER_RENDERING_ERROR);
    await expect(SERVER_METHODS.applyUpdate()).rejects.toThrow(SERVER_RENDERING_ERROR);
    await expect(SERVER_METHODS.logout()).rejects.toThrow(SERVER_RENDERING_ERROR);
    await expect(SERVER_METHODS.checkForUpdate()).rejects.toThrow(SERVER_RENDERING_ERROR);
  });

  it("are frozen, so no caller can swap a method for every later render", () => {
    expect(Object.isFrozen(SERVER_METHODS)).toBe(true);
  });

  it("leave the store's own methods alone: a call without a facade still waits for one", async () => {
    const store = createStore();
    const outcome = await Promise.race([
      store.register().then(() => "settled", () => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    expect(outcome).toBe("pending");
  });
});
