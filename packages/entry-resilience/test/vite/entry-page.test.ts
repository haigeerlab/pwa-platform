// `resolveEntryPageId` decides which sibling of the calling module to build the recovery page from, purely from
// that module's own `import.meta.url` — see src/vite/entry-page.ts for why that is enough without a filesystem
// check. These tests pass synthetic URLs rather than the real `import.meta.url` of the test file, so both branches
// are exercised regardless of which form this package happens to be running from.
import { describe, expect, it } from "vitest";
import { resolveEntryPageId, urlFileName } from "../../src/vite/entry-page.js";

const fixtureRootUrl = process.platform === "win32" ? "file:///C:/repo" : "file:///repo";
const fixtureRootPath = process.platform === "win32" ? "C:\\repo" : "/repo";
const separator = process.platform === "win32" ? "\\" : "/";

describe("resolveEntryPageId", () => {
  it("resolves to the .ts sibling when the caller's own module is .ts", () => {
    const id = resolveEntryPageId(`${fixtureRootUrl}/packages/entry-resilience/src/vite/index.ts`);
    expect(id).toBe([fixtureRootPath, "packages", "entry-resilience", "src", "page", "main.ts"].join(separator));
  });

  it("resolves to the .js sibling when the caller's own module is .js", () => {
    const id = resolveEntryPageId(`${fixtureRootUrl}/packages/entry-resilience/dist/vite/index.js`);
    expect(id).toBe([fixtureRootPath, "packages", "entry-resilience", "dist", "page", "main.js"].join(separator));
  });

  it("decodes percent-encoded characters in the resolved path", () => {
    const id = resolveEntryPageId(`${fixtureRootUrl}/pwa%20platform/dist/vite/index.js`);
    expect(id).toBe([fixtureRootPath, "pwa platform", "dist", "page", "main.js"].join(separator));
  });
});

describe("urlFileName", () => {
  it("turns Windows bundle separators into URL separators", () => {
    expect(urlFileName("static\\assets\\pwa-entry-ABCDEFGH.js")).toBe("static/assets/pwa-entry-ABCDEFGH.js");
  });
});
