// Pins the "." entry's runtime export set. `PwaPushTarget`, `PwaPushState` and `PwaPushClientErrorCode` are
// type-only exports and are erased at compile time, so they never appear in Object.keys of the imported namespace.
import { describe, expect, it } from "vitest";
import * as clientEntry from "../../src/client/index.js";

describe("public exports: the \".\" entry", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(clientEntry).sort()).toEqual(["PUSH_CLIENT_ERROR_CODES", "PwaPushClientError", "getPushState", "subscribePush", "unsubscribePush"]);
  });

  it("pins the error code list", () => {
    expect(clientEntry.PUSH_CLIENT_ERROR_CODES).toEqual([
      "push.invalid-target",
      "push.unsupported",
      "push.no-registration",
      "push.registration-failed",
      "push.subscription-failed",
      "push.invalid-key",
      "push.key-mismatch",
      "push.permission-denied",
      "push.subscribe-failed",
      "push.unsubscribe-failed",
    ]);
  });

  it("PwaPushClientError has name PwaPushClientError and message equal to its code", () => {
    const error = new clientEntry.PwaPushClientError("push.unsupported");
    expect(error.name).toBe("PwaPushClientError");
    expect(error.message).toBe("push.unsupported");
    expect(error.code).toBe("push.unsupported");
    expect(error).toBeInstanceOf(Error);
  });
});
