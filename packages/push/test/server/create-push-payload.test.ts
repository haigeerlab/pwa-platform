import { describe, expect, it } from "vitest";
import { checkPushPayload } from "@pwa-platform/sw-runtime/push-payload";
import { createPushPayload, checkPushPayloadText, validatePushPayload, PwaPushPayloadError } from "../../src/server/index.js";
import type { PwaPushPayloadInput } from "../../src/server/index.js";

const MARKER = "SECRET-MARKER-456";
// One UTF-16 code unit, 2 UTF-8 bytes: for tuning a JSON text's byte length without touching its code-point count.
const TWO_BYTE_CHAR = "é";
// A surrogate-pair emoji: 2 UTF-16 code units, 1 Unicode code point, 4 UTF-8 bytes.
const ASTRAL_CHAR = "\u{1f600}";

/** Bypasses the parameter type on purpose, for inputs the type does not allow (non-objects, wrong field types). */
function build(value: unknown): PwaPushPayloadInput {
  return value as PwaPushPayloadInput;
}

function assertNoMarker(error: PwaPushPayloadError): void {
  expect(error.message).not.toContain(MARKER);
  expect(JSON.stringify(error.issues)).not.toContain(MARKER);
}

describe("createPushPayload: minimal valid input", () => {
  it("returns the exact JSON text for a title-only payload", () => {
    expect(createPushPayload({ title: "Hello" })).toBe('{"v":1,"title":"Hello"}');
  });
});

describe("createPushPayload: all fields round-trip through validatePushPayload", () => {
  it("produces text that validatePushPayload accepts back to an equal object", () => {
    const input: PwaPushPayloadInput = { title: "Hello", body: "World", tag: "t1", url: "/a", data: "d1" };
    const text = createPushPayload(input);
    expect(validatePushPayload(text)).toEqual({ v: 1, ...input });
  });
});

describe("createPushPayload: consistency with sw-runtime's checkPushPayload", () => {
  // For each row (excluding the dedicated "own v key" and "accessor invocation count" tests below, which need
  // their own assertions), createPushPayload succeeds iff checkPushPayload({v: 1, ...input}) is ok AND the
  // serialized text passes checkPushPayloadText.
  const rows: readonly { readonly name: string; readonly input: unknown }[] = [
    { name: "minimal valid: title only", input: { title: "Hello" } },
    { name: "valid: every field present and in range", input: { title: "Hello", body: "World", tag: "t1", url: "/a", data: "d1" } },
    { name: "invalid: unknown field", input: { title: "Hello", extra: "y" } },
    { name: "invalid: title over 120 code points", input: { title: ASTRAL_CHAR.repeat(121) } },
    { name: "valid: title at exactly 120 code points", input: { title: ASTRAL_CHAR.repeat(120) } },
    { name: "invalid: body wrong type (number)", input: { title: "Hello", body: 5 } },
    { name: "invalid: missing title", input: {} },
    { name: "invalid: empty title", input: { title: "" } },
    { name: "valid: body at exactly 480 code points", input: { title: "Hello", body: ASTRAL_CHAR.repeat(480) } },
    { name: "invalid: url over 2048 code points", input: { title: "Hello", url: ASTRAL_CHAR.repeat(2049) } },
    { name: "invalid: tag over 64 code points", input: { title: "Hello", tag: "a".repeat(65) } },
    { name: "valid: optional fields omitted, data empty string", input: { title: "Hello", data: "" } },
    { name: "invalid: tag wrong type (array)", input: { title: "Hello", tag: [] } },
    { name: "invalid: url wrong type (object)", input: { title: "Hello", url: {} } },
  ];

  for (const { name, input } of rows) {
    it(name, () => {
      const reference = checkPushPayload({ v: 1, ...(input as object) });
      const expectedOk = reference.ok && checkPushPayloadText(JSON.stringify(reference.value)).ok;

      if (expectedOk) {
        const text = createPushPayload(build(input));
        expect(reference.ok).toBe(true); // narrows for the line below
        if (reference.ok) expect(JSON.parse(text)).toEqual(reference.value);
      } else {
        expect(() => createPushPayload(build(input))).toThrow(PwaPushPayloadError);
      }
    });
  }
});

describe("createPushPayload: byte limit", () => {
  function bytesOf(text: string): number {
    return new TextEncoder().encode(text).length;
  }

  it("throws push.payload-too-large when every field is within its code-point limit but the total exceeds 3072 bytes", () => {
    // Each of title/body/tag/url/data is well within its own code-point cap, but five fields of 2-byte characters
    // push the serialized UTF-8 byte total past 3072 while no single field's code-point count is out of range.
    const input: PwaPushPayloadInput = {
      title: TWO_BYTE_CHAR.repeat(120),
      body: TWO_BYTE_CHAR.repeat(480),
      tag: TWO_BYTE_CHAR.repeat(64),
      url: TWO_BYTE_CHAR.repeat(2048),
      data: TWO_BYTE_CHAR.repeat(256),
    };
    const text = JSON.stringify({ v: 1, ...input });
    expect(bytesOf(text)).toBeGreaterThan(3072);

    try {
      createPushPayload(input);
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PwaPushPayloadError);
      expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-too-large", path: "" }]);
    }
  });
});

describe("createPushPayload: accessor properties", () => {
  it("never invokes an accessor getter, and reports it as a field-type issue", () => {
    let invoked = false;
    const input = Object.defineProperty({ title: "Hello" }, "tag", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "t1";
      },
    });
    try {
      createPushPayload(build(input));
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PwaPushPayloadError);
      expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-field-type", path: "/tag" }]);
    }
    expect(invoked).toBe(false);
  });
});

describe("createPushPayload: non-object inputs", () => {
  it("rejects null, an array and a string as push.payload-not-object", () => {
    for (const value of [null, [], "hello"]) {
      try {
        createPushPayload(build(value));
        expect.unreachable(`expected createPushPayload to throw for ${JSON.stringify(value)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(PwaPushPayloadError);
        expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-not-object", path: "" }]);
      }
    }
  });
});

describe("createPushPayload: an input carrying its own v key is always rejected", () => {
  it("rejects {v: 2, title} as an unknown field at the whole-payload path, without touching the version", () => {
    try {
      createPushPayload(build({ v: 2, title: "Hello" }));
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PwaPushPayloadError);
      expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-unknown-field", path: "" }]);
    }
  });

  it("rejects {v: 1, title} the same way: the builder, not the caller, decides v", () => {
    try {
      createPushPayload(build({ v: 1, title: "Hello" }));
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PwaPushPayloadError);
      expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-unknown-field", path: "" }]);
    }
  });
});

describe("createPushPayload: thrown errors never contain an input value", () => {
  it("is a PwaPushPayloadError with issues, and neither message nor issues contain an injected marker", () => {
    const cases: readonly unknown[] = [
      { title: MARKER + "a".repeat(200) }, // over-length title
      { title: 42 }, // wrong type
      { title: "Hello", [MARKER]: "y" }, // unknown field name
      MARKER, // not an object
      { v: MARKER, title: "Hello" }, // own v key present (rejected before the value is ever read)
    ];
    for (const value of cases) {
      try {
        createPushPayload(build(value));
        expect.unreachable(`expected createPushPayload to throw for ${JSON.stringify(value)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(PwaPushPayloadError);
        const pushError = error as PwaPushPayloadError;
        expect(pushError.name).toBe("PwaPushPayloadError");
        expect(Array.isArray(pushError.issues)).toBe(true);
        expect(pushError.issues.length).toBeGreaterThan(0);
        assertNoMarker(pushError);
      }
    }
  });

  it("formats the message as '<code> at <path or (payload)>', joined by '; '", () => {
    try {
      createPushPayload(build({ title: 42, body: [] }));
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      const pushError = error as PwaPushPayloadError;
      expect(pushError.issues).toEqual([
        { code: "push.payload-field-type", path: "/title" },
        { code: "push.payload-field-type", path: "/body" },
      ]);
      expect(pushError.message).toBe("push.payload-field-type at /title; push.payload-field-type at /body");
    }
  });

  it("uses '(payload)' for the whole-payload path", () => {
    try {
      createPushPayload(build(null));
      expect.unreachable("expected createPushPayload to throw");
    } catch (error) {
      expect((error as PwaPushPayloadError).message).toBe("push.payload-not-object at (payload)");
    }
  });
});

describe("createPushPayload: an own __proto__ key", () => {
  it("reports it as an unknown field instead of silently dropping it", () => {
    // JSON.parse creates an own "__proto__" data property; a naive `result[key] = value` copy would set the copy's
    // prototype instead and the extra key would vanish before the format check.
    const input = JSON.parse('{"title":"Hello","__proto__":{"x":1}}') as PwaPushPayloadInput;
    expect(() => createPushPayload(input)).toThrow(PwaPushPayloadError);
    try {
      createPushPayload(input);
    } catch (error) {
      expect((error as PwaPushPayloadError).issues).toEqual([{ code: "push.payload-unknown-field", path: "" }]);
    }
  });
});
