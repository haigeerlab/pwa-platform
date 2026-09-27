import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const iconPath = (name: string): string =>
  fileURLToPath(new URL(`../browser-tests/app/public/icons/${name}`, import.meta.url));

function pngDimensions(name: string): { readonly width: number; readonly height: number } {
  const bytes = readFileSync(iconPath(name));
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the installable browser fixture icons", () => {
  it.each([
    ["192.png", 192],
    ["192-maskable.png", 192],
    ["512.png", 512],
    ["512-maskable.png", 512],
  ] as const)("publishes %s at its manifest-declared size", (name, size) => {
    expect(pngDimensions(name)).toEqual({ width: size, height: size });
  });

  it("uses the device viewport when launched on mobile", () => {
    const html = readFileSync(
      fileURLToPath(new URL("../browser-tests/app/index.html", import.meta.url)),
      "utf8",
    );

    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
  });
});
