import { describe, expect, it } from "vitest";
import { expectLifecycleSequence } from "../src/lifecycle.js";

const event = (type: string) => ({
  version: 1,
  type,
  timestamp: "2026-09-15T12:00:00.000Z",
  appId: "shop",
  metadata: {},
});

describe("expectLifecycleSequence", () => {
  it("passes when the known event types arrive in the expected order", () => {
    expect(() =>
      expectLifecycleSequence([event("registered"), event("activated"), event("update-waiting")], [
        "registered",
        "activated",
        "update-waiting",
      ]),
    ).not.toThrow();
    expect(() => expectLifecycleSequence([], [])).not.toThrow();
  });

  it("ignores well-formed events of unknown types", () => {
    expect(() =>
      expectLifecycleSequence([event("registered"), event("vendor-diagnostic"), event("activated")], ["registered", "activated"]),
    ).not.toThrow();
  });

  it("fails when the order, the count or the types differ", () => {
    const received = [event("activated"), event("registered")];
    expect(() => expectLifecycleSequence(received, ["registered", "activated"])).toThrow(
      "Expected lifecycle events [registered, activated] but received [activated, registered]",
    );
    expect(() => expectLifecycleSequence(received, ["activated"])).toThrow(/received \[activated, registered\]/);
    expect(() => expectLifecycleSequence([event("registered")], ["registered", "activated"])).toThrow(/received \[registered\]/);
  });

  it("fails on invalid events with diagnostic codes and paths but without the collected values", () => {
    const secret = "tok_do_not_leak";
    const values = [event("registered"), { ...event("activated"), version: 2, appId: secret }];
    let message = "";
    try {
      expectLifecycleSequence(values, ["registered"]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/^Invalid lifecycle events: event 1: /);
    expect(message).toContain("schema.unsupported-version at /version");
    expect(message).not.toContain(secret);
  });

  it("fails on values that are not event envelopes at all", () => {
    expect(() => expectLifecycleSequence([null, "registered"], [])).toThrow(/event 0: .*; event 1: /);
  });
});
