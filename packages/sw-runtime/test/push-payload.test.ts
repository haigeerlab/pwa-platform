import { describe, expect, it } from "vitest";
import {
  checkPushPayload,
  checkPushPayloadText,
  PUSH_PAYLOAD_ISSUE_CODES,
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_PAYLOAD_VERSION,
  validatePushPayload,
  type PwaPushPayloadCheck,
} from "../src/push-payload/index.js";
import * as pushPayloadEntry from "../src/push-payload/index.js";

const MARKER = "SECRET-MARKER-123";
// One UTF-16 code unit, 2 UTF-8 bytes: for tuning a JSON text's byte length without touching its code-point count.
const TWO_BYTE_CHAR = "é";
// A surrogate-pair emoji: 2 UTF-16 code units, 1 Unicode code point, 4 UTF-8 bytes. Proves length is counted in code
// points, not UTF-16 units or bytes.
const ASTRAL_CHAR = "\u{1f600}";

function assertNoMarker(result: PwaPushPayloadCheck): void {
  expect(JSON.stringify(result)).not.toContain(MARKER);
}

describe("public exports", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(pushPayloadEntry).sort()).toEqual([
      "PUSH_PAYLOAD_ISSUE_CODES",
      "PUSH_PAYLOAD_MAX_BYTES",
      "PUSH_PAYLOAD_VERSION",
      "checkPushPayload",
      "checkPushPayloadText",
      "validatePushPayload",
    ]);
  });

  it("pins the version and byte-limit constants and the issue-code list", () => {
    expect(PUSH_PAYLOAD_VERSION).toBe(1);
    expect(PUSH_PAYLOAD_MAX_BYTES).toBe(3072);
    expect(PUSH_PAYLOAD_ISSUE_CODES).toEqual([
      "push.payload-too-large",
      "push.payload-not-json",
      "push.payload-not-object",
      "push.payload-unknown-field",
      "push.payload-version",
      "push.payload-field-type",
      "push.payload-field-length",
    ]);
  });
});

describe("checkPushPayload: shape", () => {
  it("accepts a minimal valid payload with only v and title", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result).toEqual({ ok: true, value: { v: 1, title: "Hello" } });
  });

  it("accepts every field present and within range", () => {
    const result = checkPushPayload({ v: 1, title: "Hello", body: "World", tag: "t1", url: "/a", data: "d1" });
    expect(result).toEqual({ ok: true, value: { v: 1, title: "Hello", body: "World", tag: "t1", url: "/a", data: "d1" } });
  });

  it("rejects a JSON array, null, a number and a string", () => {
    for (const value of [[], [1, 2], null, 42, "hello"]) {
      expect(checkPushPayload(value)).toEqual({ ok: false, issues: [{ code: "push.payload-not-object", path: "" }] });
    }
  });

  it("accepts a null-prototype object with the same shape", () => {
    const value = Object.assign(Object.create(null) as object, { v: 1, title: "Hello" });
    expect(checkPushPayload(value)).toEqual({ ok: true, value: { v: 1, title: "Hello" } });
  });

  it("rejects an object with a non-Object.prototype, non-null prototype", () => {
    class Payload {
      v = 1;
      title = "Hello";
    }
    expect(checkPushPayload(new Payload())).toEqual({ ok: false, issues: [{ code: "push.payload-not-object", path: "" }] });
  });

  it("rejects an unknown field, reporting it at the whole-payload path rather than echoing the key", () => {
    const result = checkPushPayload({ v: 1, title: "Hello", extra: "y" });
    expect(result).toEqual({ ok: false, issues: [{ code: "push.payload-unknown-field", path: "" }] });
  });
});

describe("checkPushPayload: v", () => {
  it("rejects a missing v", () => {
    expect(checkPushPayload({ title: "Hello" })).toEqual({ ok: false, issues: [{ code: "push.payload-version", path: "/v" }] });
  });

  it('rejects v as the string "1"', () => {
    expect(checkPushPayload({ v: "1", title: "Hello" })).toEqual({ ok: false, issues: [{ code: "push.payload-version", path: "/v" }] });
  });

  it("rejects v as the number 2", () => {
    expect(checkPushPayload({ v: 2, title: "Hello" })).toEqual({ ok: false, issues: [{ code: "push.payload-version", path: "/v" }] });
  });
});

describe("checkPushPayload: title", () => {
  it("rejects a missing title", () => {
    expect(checkPushPayload({ v: 1 })).toEqual({ ok: false, issues: [{ code: "push.payload-field-type", path: "/title" }] });
  });

  it("rejects an empty title (below the 1 code-point minimum)", () => {
    expect(checkPushPayload({ v: 1, title: "" })).toEqual({ ok: false, issues: [{ code: "push.payload-field-length", path: "/title" }] });
  });

  it("rejects a non-string title", () => {
    expect(checkPushPayload({ v: 1, title: 42 })).toEqual({ ok: false, issues: [{ code: "push.payload-field-type", path: "/title" }] });
  });

  it("accepts exactly 120 code points and rejects 121, counting astral characters as one code point each", () => {
    const atLimit = ASTRAL_CHAR.repeat(120);
    const overLimit = ASTRAL_CHAR.repeat(121);
    expect(atLimit.length).toBe(240); // UTF-16 length would wrongly reject this if used for the check.
    expect(checkPushPayload({ v: 1, title: atLimit })).toEqual({ ok: true, value: { v: 1, title: atLimit } });
    expect(checkPushPayload({ v: 1, title: overLimit })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/title" }],
    });
  });
});

describe("checkPushPayload: body (optional, 0..480)", () => {
  it("accepts an absent body", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("body" in result.value).toBe(false);
  });

  it("accepts an empty body", () => {
    expect(checkPushPayload({ v: 1, title: "Hello", body: "" })).toEqual({ ok: true, value: { v: 1, title: "Hello", body: "" } });
  });

  it("accepts exactly 480 code points and rejects 481, counting astral characters as one code point each", () => {
    const atLimit = ASTRAL_CHAR.repeat(480);
    const overLimit = ASTRAL_CHAR.repeat(481);
    expect(checkPushPayload({ v: 1, title: "Hello", body: atLimit })).toEqual({
      ok: true,
      value: { v: 1, title: "Hello", body: atLimit },
    });
    expect(checkPushPayload({ v: 1, title: "Hello", body: overLimit })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/body" }],
    });
  });

  it("rejects a non-string body", () => {
    expect(checkPushPayload({ v: 1, title: "Hello", body: [] })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-type", path: "/body" }],
    });
  });
});

describe("checkPushPayload: tag (optional, 1..64)", () => {
  it("accepts an absent tag", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("tag" in result.value).toBe(false);
  });

  it("rejects an empty tag (below the 1 code-point minimum)", () => {
    expect(checkPushPayload({ v: 1, title: "Hello", tag: "" })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/tag" }],
    });
  });

  it("accepts exactly 64 code points and rejects 65, counting astral characters as one code point each", () => {
    const atLimit = ASTRAL_CHAR.repeat(64);
    const overLimit = ASTRAL_CHAR.repeat(65);
    expect(checkPushPayload({ v: 1, title: "Hello", tag: atLimit })).toEqual({ ok: true, value: { v: 1, title: "Hello", tag: atLimit } });
    expect(checkPushPayload({ v: 1, title: "Hello", tag: overLimit })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/tag" }],
    });
  });
});

describe("checkPushPayload: url (optional, 1..2048)", () => {
  it("accepts an absent url", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("url" in result.value).toBe(false);
  });

  it("rejects an empty url (below the 1 code-point minimum)", () => {
    expect(checkPushPayload({ v: 1, title: "Hello", url: "" })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/url" }],
    });
  });

  it("accepts exactly 2048 code points and rejects 2049, counting astral characters as one code point each", () => {
    const atLimit = ASTRAL_CHAR.repeat(2048);
    const overLimit = ASTRAL_CHAR.repeat(2049);
    expect(checkPushPayload({ v: 1, title: "Hello", url: atLimit })).toEqual({ ok: true, value: { v: 1, title: "Hello", url: atLimit } });
    expect(checkPushPayload({ v: 1, title: "Hello", url: overLimit })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/url" }],
    });
  });
});

describe("checkPushPayload: data (optional, 0..256)", () => {
  it("accepts an absent data", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("data" in result.value).toBe(false);
  });

  it("accepts an empty data", () => {
    expect(checkPushPayload({ v: 1, title: "Hello", data: "" })).toEqual({ ok: true, value: { v: 1, title: "Hello", data: "" } });
  });

  it("accepts exactly 256 code points and rejects 257, counting astral characters as one code point each", () => {
    const atLimit = ASTRAL_CHAR.repeat(256);
    const overLimit = ASTRAL_CHAR.repeat(257);
    expect(checkPushPayload({ v: 1, title: "Hello", data: atLimit })).toEqual({
      ok: true,
      value: { v: 1, title: "Hello", data: atLimit },
    });
    expect(checkPushPayload({ v: 1, title: "Hello", data: overLimit })).toEqual({
      ok: false,
      issues: [{ code: "push.payload-field-length", path: "/data" }],
    });
  });
});

describe("checkPushPayload: accessors are never invoked", () => {
  it("treats an accessor v as a version issue without calling the getter", () => {
    let invoked = false;
    const value = Object.defineProperty({ title: "Hello" }, "v", {
      enumerable: true,
      get: () => {
        invoked = true;
        return 1;
      },
    });
    expect(checkPushPayload(value)).toEqual({ ok: false, issues: [{ code: "push.payload-version", path: "/v" }] });
    expect(invoked).toBe(false);
  });

  it("treats an accessor title as a field-type issue without calling the getter", () => {
    let invoked = false;
    const value = Object.defineProperty({ v: 1 }, "title", {
      enumerable: true,
      get: () => {
        invoked = true;
        throw new Error("should never be called");
      },
    });
    expect(checkPushPayload(value)).toEqual({ ok: false, issues: [{ code: "push.payload-field-type", path: "/title" }] });
    expect(invoked).toBe(false);
  });

  it("treats an accessor optional field as a field-type issue without calling the getter", () => {
    let invoked = false;
    const value = Object.defineProperty({ v: 1, title: "Hello" }, "tag", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "t1";
      },
    });
    expect(checkPushPayload(value)).toEqual({ ok: false, issues: [{ code: "push.payload-field-type", path: "/tag" }] });
    expect(invoked).toBe(false);
  });
});

describe("checkPushPayload: the returned value", () => {
  it("is a new frozen object, not the input, with no extra keys", () => {
    const input = { v: 1, title: "Hello", body: "World" };
    const result = checkPushPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.keys(result.value).sort()).toEqual(["body", "title", "v"]);
    expect(() => {
      (result.value as { title: string }).title = "changed";
    }).toThrow(TypeError);
    expect(input.title).toBe("Hello"); // the input object itself is untouched
  });

  it("omits absent optional fields entirely rather than including them as undefined", () => {
    const result = checkPushPayload({ v: 1, title: "Hello" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual(["title", "v"]);
  });
});

describe("checkPushPayload: deterministic issue order", () => {
  it("reports unknown fields, then the version, then each field in schema order, and repeats the same order every call", () => {
    const value = { v: "bad", title: 123, body: 5, extra: true };
    const expected = [
      { code: "push.payload-unknown-field", path: "" },
      { code: "push.payload-version", path: "/v" },
      { code: "push.payload-field-type", path: "/title" },
      { code: "push.payload-field-type", path: "/body" },
    ];
    expect(checkPushPayload(value)).toEqual({ ok: false, issues: expected });
    expect(checkPushPayload(value)).toEqual({ ok: false, issues: expected }); // same input, same order again
  });
});

describe("checkPushPayload: issues never contain an input value", () => {
  it("never echoes an unknown key name", () => {
    assertNoMarker(checkPushPayload({ v: 1, title: "Hello", [MARKER]: "y" }));
  });

  it("never echoes an overlong title's content", () => {
    assertNoMarker(checkPushPayload({ v: 1, title: MARKER + "a".repeat(200) }));
  });

  it("never echoes a wrongly typed title's content", () => {
    assertNoMarker(checkPushPayload({ v: 1, title: { marker: MARKER } }));
  });

  it("never echoes a wrongly typed v's content", () => {
    assertNoMarker(checkPushPayload({ v: MARKER, title: "Hello" }));
  });

  it("never echoes an overlong url's content", () => {
    assertNoMarker(checkPushPayload({ v: 1, title: "Hello", url: MARKER + "a".repeat(2100) }));
  });

  it("never echoes a not-object input", () => {
    assertNoMarker(checkPushPayload(MARKER));
  });
});

describe("checkPushPayloadText", () => {
  it("accepts a valid payload text", () => {
    const text = JSON.stringify({ v: 1, title: "Hello", body: "World" });
    expect(checkPushPayloadText(text)).toEqual({ ok: true, value: { v: 1, title: "Hello", body: "World" } });
  });

  it("rejects non-JSON text", () => {
    expect(checkPushPayloadText("not json at all")).toEqual({ ok: false, issues: [{ code: "push.payload-not-json", path: "" }] });
  });

  it("never echoes marker text from unparsable input", () => {
    assertNoMarker(checkPushPayloadText(`{"title": ${MARKER} not valid json`));
  });

  it("rejects JSON array, null, number and string text as not-object", () => {
    for (const text of ["[]", "[1,2]", "null", "42", `"${MARKER}"`]) {
      const result = checkPushPayloadText(text);
      expect(result).toEqual({ ok: false, issues: [{ code: "push.payload-not-object", path: "" }] });
      assertNoMarker(result);
    }
  });

  function bytesOf(text: string): number {
    return new TextEncoder().encode(text).length;
  }

  // Builds valid payload text `{"v":1,"title":"<T>","url":"<pad>"}` where `<T>` is `titleLength` ASCII characters (1
  // byte each) and `<pad>` is `urlPadCodePoints` copies of a 2-byte character, so the encoded byte length can be
  // tuned by exactly 1 byte at a time.
  function buildPayloadText(titleLength: number, urlPadCodePoints: number): string {
    const title = "T".repeat(titleLength);
    const url = TWO_BYTE_CHAR.repeat(urlPadCodePoints);
    return JSON.stringify({ v: 1, title, url });
  }

  function payloadTextOfBytes(targetBytes: number): string {
    const base = buildPayloadText(1, 1);
    const delta = targetBytes - bytesOf(base);
    if (delta < 0) throw new Error("target too small for the base skeleton");
    const urlPadIncrease = Math.floor(delta / 2);
    const remainder = delta % 2;
    return buildPayloadText(1 + remainder, 1 + urlPadIncrease);
  }

  it("accepts a payload text of exactly PUSH_PAYLOAD_MAX_BYTES (3072) UTF-8 bytes, using multi-byte characters", () => {
    const text = payloadTextOfBytes(PUSH_PAYLOAD_MAX_BYTES);
    expect(bytesOf(text)).toBe(PUSH_PAYLOAD_MAX_BYTES);
    expect(text.length).toBeLessThan(PUSH_PAYLOAD_MAX_BYTES); // fewer UTF-16 units than bytes: multi-byte chars used
    const result = checkPushPayloadText(text);
    expect(result.ok).toBe(true);
  });

  it("rejects a payload text of PUSH_PAYLOAD_MAX_BYTES + 1 (3073) UTF-8 bytes as too large, using multi-byte characters", () => {
    const text = payloadTextOfBytes(PUSH_PAYLOAD_MAX_BYTES + 1);
    expect(bytesOf(text)).toBe(PUSH_PAYLOAD_MAX_BYTES + 1);
    expect(checkPushPayloadText(text)).toEqual({ ok: false, issues: [{ code: "push.payload-too-large", path: "" }] });
  });

  it("never echoes marker text from an oversized payload", () => {
    const oversized = JSON.stringify({ v: 1, title: MARKER, url: TWO_BYTE_CHAR.repeat(2000) });
    expect(bytesOf(oversized)).toBeGreaterThan(PUSH_PAYLOAD_MAX_BYTES);
    assertNoMarker(checkPushPayloadText(oversized));
  });
});

describe("validatePushPayload", () => {
  it("returns the payload for valid text", () => {
    const text = JSON.stringify({ v: 1, title: "Hello" });
    expect(validatePushPayload(text)).toEqual({ v: 1, title: "Hello" });
  });

  it("returns null for invalid text", () => {
    expect(validatePushPayload("not json")).toBeNull();
    expect(validatePushPayload(JSON.stringify({ v: 2, title: "Hello" }))).toBeNull();
    expect(validatePushPayload(JSON.stringify([1, 2]))).toBeNull();
  });
});
