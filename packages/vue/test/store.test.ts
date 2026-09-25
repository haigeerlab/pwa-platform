import type { PwaClientEvent, PwaClientEventType } from "@pwa-platform/client-runtime";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, reduce, type PwaState } from "../src/store.js";

function event(type: PwaClientEventType): PwaClientEvent {
  return { version: 1, type, timestamp: "2026-09-17T00:00:00.000Z", appId: "storefront", metadata: {} };
}

function apply(types: readonly PwaClientEventType[], from: PwaState = INITIAL_STATE): PwaState {
  return types.reduce<PwaState>((state, type) => reduce(state, event(type)), from);
}

describe("initial state", () => {
  it("starts with every flag false", () => {
    expect(INITIAL_STATE).toEqual({
      registered: false,
      installEligible: false,
      installed: false,
      updateWaiting: false,
    });
  });

  it("is frozen, so one caller cannot change where every later binding starts", () => {
    // `readonly` is erased at runtime; this object is shared by every binding in the process.
    expect(Object.isFrozen(INITIAL_STATE)).toBe(true);
  });
});

describe("flip rules", () => {
  it("sets registered and nothing else", () => {
    expect(apply(["registered"])).toEqual({ ...INITIAL_STATE, registered: true });
  });

  it("sets installEligible and nothing else", () => {
    expect(apply(["install-eligible"])).toEqual({ ...INITIAL_STATE, installEligible: true });
  });

  it("sets updateWaiting and nothing else", () => {
    expect(apply(["update-waiting"])).toEqual({ ...INITIAL_STATE, updateWaiting: true });
  });

  it("clears updateWaiting when the announced update takes control", () => {
    expect(apply(["update-waiting", "update-applied"])).toEqual(INITIAL_STATE);
  });

  it("clears installEligible when installed arrives", () => {
    // The facade drops the saved prompt on `appinstalled`, so eligibility must end with it.
    expect(apply(["install-eligible", "installed"])).toEqual({
      ...INITIAL_STATE,
      installed: true,
      installEligible: false,
    });
  });

  it("never lets a flag fall back to false on its own", () => {
    // The facade emits no "cancelled" event; only `installed` clears anything, and only installEligible.
    const all = apply(["registered", "install-eligible", "installed", "update-waiting"]);
    expect(all).toEqual({ registered: true, installEligible: false, installed: true, updateWaiting: true });
  });
});

describe("identity stability", () => {
  it("returns the same object when an event changes nothing", () => {
    // React's useSyncExternalStore treats a fresh object as a change and would re-render forever. Vue does not
    // need this, but the parity suite holds both copies to it.
    const once = apply(["registered"]);
    expect(reduce(once, event("registered"))).toBe(once);
  });

  it("returns the same object for a repeated installed event", () => {
    const installed = apply(["install-eligible", "installed"]);
    expect(reduce(installed, event("installed"))).toBe(installed);
  });

  it("returns the same object when update-applied repeats after the prompt is gone", () => {
    const applied = apply(["update-waiting", "update-applied"]);
    expect(reduce(applied, event("update-applied"))).toBe(applied);
  });

  it("returns a new object when an event does change something", () => {
    const once = apply(["registered"]);
    expect(reduce(once, event("installed"))).not.toBe(once);
  });
});

describe("served-from-cache", () => {
  it("leaves the state unchanged: the event carries no state the bindings expose (ADR-0035)", () => {
    const before = apply(["registered", "install-eligible", "installed", "update-waiting"]);
    expect(reduce(before, event("served-from-cache"))).toBe(before);
  });
});

describe("order independence", () => {
  it("reaches the same state whichever order the events arrive in", () => {
    const forward = apply(["registered", "install-eligible", "installed", "update-waiting"]);
    const shuffled = apply(["update-waiting", "install-eligible", "registered", "installed"]);
    expect(shuffled).toEqual(forward);
  });

  it("handles installed arriving before install-eligible", () => {
    // Out of order, `install-eligible` after `installed` still sets eligibility: the facade only emits it while a
    // prompt is actually held, so the adapter does not second-guess it.
    expect(apply(["installed", "install-eligible"])).toEqual({
      ...INITIAL_STATE,
      installed: true,
      installEligible: true,
    });
  });

  it("ignores repeated events anywhere in a sequence", () => {
    const once = apply(["registered", "install-eligible", "installed"]);
    const twice = apply(["registered", "registered", "install-eligible", "installed", "installed"]);
    expect(twice).toEqual(once);
  });
});
