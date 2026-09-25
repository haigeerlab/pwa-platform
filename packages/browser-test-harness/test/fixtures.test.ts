import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fixturePath } from "../src/fixtures.js";

describe("fixturePath", () => {
  it("resolves paths inside the fixtures directory", () => {
    expect(fixturePath("pages", "index.html")).toMatch(/[/\\]fixtures[/\\]pages[/\\]index\.html$/);
  });

  it("rejects paths that leave the fixtures directory", () => {
    expect(() => fixturePath("..", "package.json")).toThrow();
    expect(() => fixturePath("pages", "..", "..", "src")).toThrow();
  });
});

describe("fixture sites", () => {
  it("serves the same minimal page in every site version", async () => {
    const [v1, v2] = await Promise.all([
      readFile(fixturePath("pages", "index.html")),
      readFile(fixturePath("pages-v2", "index.html")),
    ]);
    expect(v2.equals(v1)).toBe(true);
  });

  it("ships a v1 and a v2 versioned worker that never skip waiting", async () => {
    const [v1, v2] = await Promise.all([
      readFile(fixturePath("pages", "versioned-worker.js"), "utf8"),
      readFile(fixturePath("pages-v2", "versioned-worker.js"), "utf8"),
    ]);
    expect(v1).toContain('const VERSION = "v1";');
    expect(v2).toContain('const VERSION = "v2";');
    for (const source of [v1, v2]) expect(source).not.toMatch(/skipWaiting\s*\(/);
  });

  it("ships a takeover worker whose v2, at the same URL, skips waiting while v1 does not", async () => {
    const [v1, v2] = await Promise.all([
      readFile(fixturePath("pages", "takeover-worker.js"), "utf8"),
      readFile(fixturePath("pages-v2", "takeover-worker.js"), "utf8"),
    ]);
    expect(v1).toContain('const VERSION = "v1";');
    expect(v1).not.toMatch(/skipWaiting\s*\(/);
    expect(v2).toContain('const VERSION = "v2";');
    expect(v2).toMatch(/skipWaiting\s*\(/);
  });
});
