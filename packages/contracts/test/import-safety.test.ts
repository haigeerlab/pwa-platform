import { describe, expect, it } from "vitest";
import { event, identity, plan, policy } from "./fixtures.js";

const BROWSER_GLOBALS = ["window", "navigator", "self", "document"] as const;

describe("import safety", () => {
  it("imports and validates without browser globals and without eval at import time", async () => {
    const saved = BROWSER_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    const RealFunction = globalThis.Function;
    let evalAttempts = 0;
    const blocked = (): never => {
      evalAttempts += 1;
      throw new EvalError("unsafe-eval blocked");
    };

    for (const name of BROWSER_GLOBALS) Reflect.deleteProperty(globalThis, name);
    globalThis.Function = new Proxy(RealFunction, { apply: blocked, construct: blocked });
    try {
      for (const name of BROWSER_GLOBALS) expect(name in globalThis).toBe(false);

      const contracts = await import("../src/index.js");
      expect(evalAttempts).toBe(0);

      expect(contracts.validateIdentity(identity).ok).toBe(true);
      expect(contracts.validatePolicy(policy).ok).toBe(true);
      expect(contracts.validatePlan(plan).ok).toBe(true);
      expect(contracts.validatePolicy({ ...policy, schemaVersion: 2 }).ok).toBe(false);
      expect(contracts.readLifecycleEvent(event).kind).toBe("known");
      expect(contracts.cacheName(identity, "precache")).toBe("pwa:shop:production:r1:precache");
    } finally {
      globalThis.Function = RealFunction;
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });
});
