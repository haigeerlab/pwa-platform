import { describe, expect, it } from "vitest";

describe("contracts package", () => {
  it("can be imported in Node without browser globals", async () => {
    await expect(import("../src/index.js")).resolves.toBeDefined();
  });
});
