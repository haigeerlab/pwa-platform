import { describe, expect, it } from "vitest";
import { publishedPaths } from "../published-paths.ts";

describe("publishedPaths", () => {
  it("maps receipt file paths to absolute site paths", () => {
    const files = {
      "app/index.html": "hash1",
      "app/assets/index-a1b2c3d4.js": "hash2",
      "app/sw.js": "hash3",
    };
    expect(publishedPaths(files)).toEqual(["/app/index.html", "/app/assets/index-a1b2c3d4.js", "/app/sw.js"]);
  });

  it("excludes _headers: Pages consumes it, it is never itself served", () => {
    const files = { "app/index.html": "hash1", _headers: "hash2" };
    expect(publishedPaths(files)).toEqual(["/app/index.html"]);
  });

  it("returns an empty list for an empty receipt", () => {
    expect(publishedPaths({})).toEqual([]);
  });
});
