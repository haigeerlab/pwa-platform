// Every rule in spec/pwa-entry-resilience.md's "修订：入口清单由业务应用提供" -> "契约增量": the plain object shape
// `parseEntryManifest` validates once ADR-0033 (2026-09-23) removed the signed envelope this package used to
// require first. Each rule has at least one passing case and one failing case, so a mutation that disables the
// check would be caught by the passing case going red, not only the failing one going green.
import { describe, expect, it } from "vitest";
import { parseEntryManifest } from "../src/manifest.js";
import { APP_ID, APPROVED_ORIGIN, baseContext, days, ENVIRONMENT, minutes, NOW_MS, toStrictIso, validManifest } from "./support/fixtures.js";

describe("parseEntryManifest: happy path", () => {
  it("accepts a fully valid manifest and returns it unchanged", () => {
    const manifest = validManifest();
    const result = parseEntryManifest(manifest, baseContext());
    expect(result).toEqual({ ok: true, manifest });
  });

  it("accepts a manifest with zero entries", () => {
    const manifest = validManifest({ status: "normal", reason: { code: "none" }, entries: [] });
    const result = parseEntryManifest(manifest, baseContext());
    expect(result.ok).toBe(true);
  });

  it("accepts a manifest with exactly 5 entries", () => {
    const entries = Array.from({ length: 5 }, () => ({ origin: APPROVED_ORIGIN, startPath: "/app/" }));
    const result = parseEntryManifest(validManifest({ entries }), baseContext());
    expect(result.ok).toBe(true);
  });

  it("accepts a manifest without appId or environment", () => {
    const manifest = { ...validManifest() };
    const result = parseEntryManifest(manifest, baseContext());
    expect(result.ok).toBe(true);
  });

  it("accepts appId and environment that match the context", () => {
    const result = parseEntryManifest(validManifest({ appId: APP_ID, environment: ENVIRONMENT }), baseContext());
    expect(result.ok).toBe(true);
  });

  it("accepts a reason without a message", () => {
    const result = parseEntryManifest(validManifest({ status: "incident", reason: { code: "incident" } }), baseContext());
    expect(result.ok).toBe(true);
  });
});

describe("parseEntryManifest: shape", () => {
  it("rejects a non-object value", () => {
    expect(parseEntryManifest("not an object", baseContext())).toEqual({
      ok: false,
      diagnostics: [{ code: "entry.manifest-invalid-shape", path: "" }],
    });
  });

  it("rejects null", () => {
    expect(parseEntryManifest(null, baseContext())).toEqual({
      ok: false,
      diagnostics: [{ code: "entry.manifest-invalid-shape", path: "" }],
    });
  });

  it("rejects a manifest missing a required field", () => {
    const manifest = validManifest();
    delete (manifest as { status?: unknown }).status;
    expect(parseEntryManifest(manifest, baseContext())).toEqual({
      ok: false,
      diagnostics: [{ code: "entry.manifest-invalid-shape", path: "" }],
    });
  });

  it("rejects a manifest with an unknown field", () => {
    const result = parseEntryManifest(validManifest({ unexpected: true }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.manifest-invalid-shape", path: "" }] });
  });
});

describe("parseEntryManifest: appId / environment", () => {
  it("rejects an appId that does not match the context", () => {
    const result = parseEntryManifest(validManifest({ appId: "other-app" }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.app-id-mismatch", path: "/appId" }] });
  });

  it("rejects an environment that does not match the context", () => {
    const result = parseEntryManifest(validManifest({ environment: "staging" }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.environment-mismatch", path: "/environment" }] });
  });
});

describe("parseEntryManifest: sequence", () => {
  it("rejects a negative sequence", () => {
    const result = parseEntryManifest(validManifest({ sequence: -1 }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.sequence-invalid", path: "/sequence" }] });
  });

  it("rejects a non-integer sequence", () => {
    const result = parseEntryManifest(validManifest({ sequence: 1.5 }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.sequence-invalid", path: "/sequence" }] });
  });

  it("rejects a non-numeric sequence", () => {
    const result = parseEntryManifest(validManifest({ sequence: "7" }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.sequence-invalid", path: "/sequence" }] });
  });

  it("accepts sequence 0", () => {
    const result = parseEntryManifest(validManifest({ sequence: 0 }), baseContext());
    expect(result.ok).toBe(true);
  });
});

describe("parseEntryManifest: expiresAt", () => {
  it("rejects an expiresAt that is not strict ISO 8601 UTC", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: "2026-10-01" }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.expires-at-invalid", path: "/expiresAt" }] });
  });

  it("rejects an expiresAt with fractional seconds (Date#toISOString's own format)", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: new Date(NOW_MS + days(1)).toISOString() }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.expires-at-invalid", path: "/expiresAt" }] });
  });

  it("rejects an already-expired manifest", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: toStrictIso(NOW_MS - minutes(1)) }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.expired", path: "/expiresAt" }] });
  });

  it("rejects a manifest whose expiresAt equals now (not strictly in the future)", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: toStrictIso(NOW_MS) }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.expired", path: "/expiresAt" }] });
  });

  it("accepts an expiresAt one second in the future (the format's own resolution)", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: toStrictIso(NOW_MS + 1000) }), baseContext());
    expect(result.ok).toBe(true);
  });

  it("rejects a validity period longer than maxValidityDays", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: toStrictIso(NOW_MS + days(31)) }), baseContext({ maxValidityDays: 30 }));
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.validity-period-too-long", path: "/expiresAt" }] });
  });

  it("accepts a validity period exactly at maxValidityDays", () => {
    const result = parseEntryManifest(validManifest({ expiresAt: toStrictIso(NOW_MS + days(30)) }), baseContext({ maxValidityDays: 30 }));
    expect(result.ok).toBe(true);
  });
});

describe("parseEntryManifest: status", () => {
  it("rejects an invalid status", () => {
    const result = parseEntryManifest(validManifest({ status: "unknown" }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.status-invalid", path: "/status" }] });
  });

  it.each(["normal", "migrating", "incident"])("accepts status %s", (status) => {
    const reason = status === "normal" ? { code: "none" } : { code: "planned-migration" };
    const result = parseEntryManifest(validManifest({ status, reason }), baseContext());
    expect(result.ok).toBe(true);
  });
});

describe("parseEntryManifest: reason", () => {
  it("rejects a reason that is not an object with a closed shape", () => {
    const result = parseEntryManifest(validManifest({ reason: { code: "none", extra: true } }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.reason-invalid-shape", path: "/reason" }] });
  });

  it("rejects an invalid reason.code", () => {
    const result = parseEntryManifest(validManifest({ reason: { code: "made-up" } }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.reason-code-invalid", path: "/reason/code" }] });
  });

  it("rejects a reason.message longer than 200 UTF-16 code units", () => {
    const result = parseEntryManifest(validManifest({ reason: { code: "incident", message: "x".repeat(201) } }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.reason-message-invalid", path: "/reason/message" }] });
  });

  it("accepts a reason.message exactly 200 UTF-16 code units", () => {
    const result = parseEntryManifest(validManifest({ reason: { code: "incident", message: "x".repeat(200) } }), baseContext());
    expect(result.ok).toBe(true);
  });

  it("rejects a reason.message containing a control character", () => {
    const result = parseEntryManifest(validManifest({ reason: { code: "incident", message: "bad\tmessage" } }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.reason-message-invalid", path: "/reason/message" }] });
  });
});

describe("parseEntryManifest: entries", () => {
  it("rejects more than 5 entries", () => {
    const entries = Array.from({ length: 6 }, () => ({ origin: APPROVED_ORIGIN, startPath: "/app/" }));
    const result = parseEntryManifest(validManifest({ entries }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entries-too-many", path: "/entries" }] });
  });

  it("rejects entries that is not an array", () => {
    const result = parseEntryManifest(validManifest({ entries: {} }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entry-invalid-shape", path: "/entries" }] });
  });

  it("rejects an entry with an unknown field", () => {
    const result = parseEntryManifest(validManifest({ entries: [{ origin: APPROVED_ORIGIN, startPath: "/app/", extra: 1 }] }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entry-invalid-shape", path: "/entries/0" }] });
  });

  it("rejects a non-normalized origin", () => {
    const result = parseEntryManifest(validManifest({ entries: [{ origin: `${APPROVED_ORIGIN}/`, startPath: "/app/" }] }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entry-origin-invalid", path: "/entries/0/origin" }] });
  });

  it("rejects an origin that is HTTP and not a loopback host", () => {
    const result = parseEntryManifest(validManifest({ entries: [{ origin: "http://new.example.com", startPath: "/app/" }] }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entry-origin-invalid", path: "/entries/0/origin" }] });
  });

  it("accepts loopback HTTP origins with a port, not approved-list-gated any more", () => {
    // No `approvedOrigins` concept survives ADR-0033: an origin never seen at build time is accepted purely on its
    // own normalized shape, which is the whole point of the revision (domains can be swapped without a rebuild).
    const result = parseEntryManifest(
      validManifest({ entries: [{ origin: "http://localhost:4173", startPath: "/app/" }] }),
      baseContext(),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts an origin never seen before, with no approval list to check it against", () => {
    const result = parseEntryManifest(
      validManifest({ entries: [{ origin: "https://brand-new-domain.example.org", startPath: "/app/" }] }),
      baseContext(),
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ["missing leading slash", "app/"],
    ["contains a dot-dot segment", "/app/../secret"],
    ["contains a backslash", "/app\\evil"],
    ["contains a double slash", "/app//evil"],
    ["exceeds 512 characters", `/${"a".repeat(513)}`],
    ["contains a literal control character (tab)", "/\t/evil.example/x"],
    ["percent-decodes to dot-dot segments", "/%2e%2e/%2e%2e/x"],
    ["contains a literal control character (newline)", "/app/\n"],
    ["percent-decodes to a double slash", "/%2F%2Fevil"],
    ["contains an illegal percent-encoding that fails to decode", "/%gg"],
  ])("rejects a startPath that %s", (_label, startPath) => {
    const result = parseEntryManifest(validManifest({ entries: [{ origin: APPROVED_ORIGIN, startPath }] }), baseContext());
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "entry.entry-start-path-invalid", path: "/entries/0/startPath" }] });
  });

  it("accepts a startPath that is exactly the root", () => {
    const result = parseEntryManifest(validManifest({ entries: [{ origin: APPROVED_ORIGIN, startPath: "/" }] }), baseContext());
    expect(result.ok).toBe(true);
  });
});

describe("parseEntryManifest: whole-manifest rejection", () => {
  it("reports every failing field at once rather than stopping at the first", () => {
    const result = parseEntryManifest(validManifest({ sequence: -1, status: "unknown" }), baseContext());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const codes = result.diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual(["entry.sequence-invalid", "entry.status-invalid"]);
  });

  it("never echoes a rejected field's value into a diagnostic", () => {
    const secret = "super-secret-value-should-not-leak";
    const result = parseEntryManifest(validManifest({ status: secret }), baseContext());
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
