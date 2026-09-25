// `resolveEntryPageId` decides which sibling of the calling module to build the recovery page from, purely from
// that module's own `import.meta.url` — see src/vite/entry-page.ts for why that is enough without a filesystem
// check. These tests pass synthetic URLs rather than the real `import.meta.url` of the test file, so both branches
// are exercised regardless of which form this package happens to be running from.
import { describe, expect, it } from "vitest";
import { resolveEntryPageId } from "../../src/vite/entry-page.js";

describe("resolveEntryPageId", () => {
  it("resolves to the .ts sibling when the caller's own module is .ts", () => {
    const id = resolveEntryPageId("file:///repo/packages/entry-resilience/src/vite/index.ts");
    expect(id).toBe("/repo/packages/entry-resilience/src/page/main.ts");
  });

  it("resolves to the .js sibling when the caller's own module is .js", () => {
    const id = resolveEntryPageId("file:///repo/packages/entry-resilience/dist/vite/index.js");
    expect(id).toBe("/repo/packages/entry-resilience/dist/page/main.js");
  });

  it("decodes percent-encoded characters in the resolved path", () => {
    const id = resolveEntryPageId("file:///repo/pwa%20platform/dist/vite/index.js");
    expect(id).toBe("/repo/pwa platform/dist/page/main.js");
  });
});
