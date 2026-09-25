import { describe, expect, it } from "vitest";

const BROWSER_GLOBALS = ["window", "navigator", "self", "document"] as const;

describe("import safety", () => {
  it("imports without browser globals", async () => {
    const saved = BROWSER_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const name of BROWSER_GLOBALS) Reflect.deleteProperty(globalThis, name);
    try {
      for (const name of BROWSER_GLOBALS) expect(name in globalThis).toBe(false);
      await expect(import("../src/index.js")).resolves.toBeDefined();
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });
});
