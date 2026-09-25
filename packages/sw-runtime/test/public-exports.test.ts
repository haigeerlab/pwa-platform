// ADR-0019 review #5: pins the `.` entry (src/build/index.ts) to its current named exports. The package has six
// entries in total (see package-boundaries.test.ts for the other five); this one is the Node-side build API most
// consumers actually import, and the one most likely to gain a stray export unnoticed.
import { describe, expect, it } from "vitest";
import * as buildEntry from "../src/build/index.js";

describe("public exports: the `.` entry", () => {
  it("exposes exactly the documented runtime API", () => {
    expect(Object.keys(buildEntry).sort()).toEqual([
      "WORKER_CONFIG_INJECTION_POINT",
      "createPathMatcher",
      "createPlatformWorkerConfig",
      "createRecoveryWorkerConfig",
      "injectWorkerConfig",
    ]);
  });
});
