// Pins the ./server entry's runtime export set. `PwaPushPayload`, `PwaPushPayloadCheck`, `PwaPushPayloadIssue`,
// `PwaPushPayloadIssueCode` and `PwaPushPayloadInput` are type-only exports and are erased at compile time, so they
// never appear in Object.keys of the imported namespace — only the runtime API is listed here.
import { describe, expect, it } from "vitest";
import * as serverEntry from "../../src/server/index.js";

describe("public exports: the ./server entry", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(serverEntry).sort()).toEqual([
      "PUSH_PAYLOAD_ISSUE_CODES",
      "PUSH_PAYLOAD_MAX_BYTES",
      "PUSH_PAYLOAD_VERSION",
      "PwaPushPayloadError",
      "checkPushPayloadText",
      "createPushPayload",
      "validatePushPayload",
    ]);
  });

  it("re-exports the same constant values sw-runtime's ./push-payload entry defines", () => {
    expect(serverEntry.PUSH_PAYLOAD_VERSION).toBe(1);
    expect(serverEntry.PUSH_PAYLOAD_MAX_BYTES).toBe(3072);
    expect(serverEntry.PUSH_PAYLOAD_ISSUE_CODES).toEqual([
      "push.payload-too-large",
      "push.payload-not-json",
      "push.payload-not-object",
      "push.payload-unknown-field",
      "push.payload-version",
      "push.payload-field-type",
      "push.payload-field-length",
    ]);
  });

  it("does not re-export checkPushPayload: the builder is the supported way to construct a payload", () => {
    expect("checkPushPayload" in serverEntry).toBe(false);
  });
});
