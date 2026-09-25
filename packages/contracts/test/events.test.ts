import { describe, expect, it } from "vitest";
import { LIFECYCLE_EVENT_TYPES, readLifecycleEvent } from "../src/index.js";
import type { PwaEventReadResult } from "../src/index.js";
import { event } from "./fixtures.js";

function findings(result: PwaEventReadResult): (readonly [string, string])[] {
  return result.kind === "invalid" ? result.diagnostics.map((finding) => [finding.code, finding.path] as const) : [];
}

function without(value: object, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  delete copy[key];
  return copy;
}

describe("readLifecycleEvent", () => {
  it("returns every foundation event type as known", () => {
    for (const type of LIFECYCLE_EVENT_TYPES) {
      const input = { ...event, type };
      expect(readLifecycleEvent(input)).toEqual({ kind: "known", event: input });
    }
  });

  it("returns event types from later versions as unknown instead of throwing", () => {
    const input = { ...event, type: "push-clicked", metadata: {}, extensions: { "acme.push": { opened: true } } };
    expect(readLifecycleEvent(input)).toEqual({ kind: "unknown", event: input });
  });

  it.each([
    ["a missing timestamp", without(event, "timestamp"), [["schema.missing-field", "/timestamp"]]],
    ["a future envelope version", { ...event, version: 2 }, [["schema.unsupported-version", "/version"]]],
    ["a string version", { ...event, version: "1" }, [["schema.invalid-type", "/version"]]],
    ["a non-ISO timestamp", { ...event, timestamp: "yesterday" }, [["schema.invalid-value", "/timestamp"]]],
    ["an epoch timestamp", { ...event, timestamp: 1757923200000 }, [["schema.invalid-type", "/timestamp"]]],
    ["an empty type", { ...event, type: "" }, [["schema.invalid-value", "/type"]]],
    ["nested metadata", { ...event, metadata: { user: { id: 1 } } }, [["schema.invalid-type", "/metadata"]]],
    ["a non-namespaced extension", { ...event, extensions: { push: {} } }, [["extensions.invalid-namespace", "/extensions"]]],
    ["a function in metadata", { ...event, metadata: { token: () => "x" } }, [["value.not-serializable", "/metadata"]]],
  ] as const)("reports %s as invalid", (_name, input, expected) => {
    expect(findings(readLifecycleEvent(input))).toEqual(expected);
  });

  it("reports unknown envelope fields without echoing their names", () => {
    const result = readLifecycleEvent({ ...event, tok_SECRET_value: "x" });
    expect(findings(result)).toEqual([["schema.unknown-field", ""]]);
    expect(JSON.stringify(result)).not.toContain("tok_SECRET");
  });

  it.each([undefined, null, "registered", 42, 10n, Symbol("event"), [], () => event])(
    "never throws for %s",
    (input) => {
      expect(readLifecycleEvent(input).kind).toBe("invalid");
    },
  );

  it.each([
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-09-15T24:00:00Z",
    "2026-09-15T08:00:60Z",
    "2026-09-15T08:00:00+24:00",
  ])("rejects the impossible timestamp %s on every engine", (timestamp) => {
    expect(findings(readLifecycleEvent({ ...event, timestamp }))).toEqual([["schema.invalid-value", "/timestamp"]]);
  });

  it("accepts leap days, fractions and offsets", () => {
    expect(readLifecycleEvent({ ...event, timestamp: "2028-02-29T23:59:59.999-05:30" }).kind).toBe("known");
  });

  it("never throws for revoked proxies or extreme nesting", () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let depth = 0; depth < 20000; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor["a"] = next;
      cursor = next;
    }
    expect(readLifecycleEvent(revoked.proxy).kind).toBe("invalid");
    expect(readLifecycleEvent({ ...event, extensions: { "acme.deep": deep } }).kind).toBe("invalid");
  });
});
