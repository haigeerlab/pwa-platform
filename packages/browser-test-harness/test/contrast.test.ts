import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/contrast.js";

describe("contrastRatio", () => {
  it("computes the WCAG ratio from browser-style rgb colors", () => {
    expect(contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBe(21);
    expect(contrastRatio("rgb(255, 255, 255)", "rgb(11, 92, 213)")).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects colors outside the computed rgb/rgba shape", () => {
    expect(() => contrastRatio("transparent", "rgb(255, 255, 255)")).toThrow("Unsupported color: transparent");
  });
});
