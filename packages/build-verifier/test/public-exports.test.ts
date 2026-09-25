// ADR-0019 review #5: pins the package's single public entry to its current named exports, the same shape
// core's and contracts' own public-api tests already enforce. This is the only place a stray export from a new
// module (like release-order.ts) would show up as a diff instead of silently widening the public surface.
import { describe, expect, it } from "vitest";
import * as buildVerifier from "../src/index.js";

describe("public exports", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(buildVerifier).sort()).toEqual([
      "BASELINE_FIELDS",
      "VERIFICATION_CHECKS",
      "compareIdentityBaseline",
      "hasDirective",
      "isSharedOriginChild",
      "parseCacheControl",
      "readIdentityBaseline",
      "verifyArtifacts",
      "verifyHtmlHeaders",
      "verifyRelease",
      "verifyReleaseGateCoverage",
      "verifyReleaseOrder",
      "verifyReleaseRetention",
      "verifyResponseHeaders",
    ]);
  });
});
