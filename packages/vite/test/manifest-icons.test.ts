import type { PwaInstallIcon, PwaInstallMetadata } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { validateManifestIcons } from "../src/manifest-icons.js";

function metadata(icon: PwaInstallIcon): PwaInstallMetadata {
  return {
    startUrl: "/app/",
    display: "standalone",
    name: "Fixture",
    shortName: "Fixture",
    themeColor: "#000000",
    backgroundColor: "#ffffff",
    icons: [icon],
  };
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(23);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = height >> 8;
  bytes[8] = height;
  bytes[9] = width >> 8;
  bytes[10] = width;
  bytes.set([0xff, 0xd9], 21);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([encodedWidth, encodedWidth >> 8, encodedWidth >> 16], 24);
  bytes.set([encodedHeight, encodedHeight >> 8, encodedHeight >> 16], 27);
  return bytes;
}

describe("validateManifestIcons", () => {
  it("accepts a JPEG whose SOF dimensions match the manifest", () => {
    const icon = { src: "/app/icon.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" } as const;
    expect(
      validateManifestIcons(metadata(icon), "/app/", [{ path: "icon.jpg", content: jpeg(192, 192) }]),
    ).toEqual([]);
  });

  it("accepts a WebP VP8X image whose canvas dimensions match the manifest", () => {
    const icon = { src: "/app/icon.webp", sizes: "512x512", type: "image/webp", purpose: "any" } as const;
    expect(
      validateManifestIcons(metadata(icon), "/app/", [{ path: "icon.webp", content: webpVp8x(512, 512) }]),
    ).toEqual([]);
  });

  it("rejects extra size tokens that a single-frame raster file does not contain", () => {
    const icon = {
      src: "/app/icon.jpg",
      sizes: "192x192 512x512",
      type: "image/jpeg",
      purpose: "any",
    } as const;
    expect(() =>
      validateManifestIcons(metadata(icon), "/app/", [{ path: "icon.jpg", content: jpeg(192, 192) }]),
    ).toThrow(/vite\.manifest-icon-size-mismatch.*192x192 512x512.*192x192/s);
  });

  it("rejects malformed raster size tokens instead of silently ignoring them", () => {
    const icon = { src: "/app/icon.jpg", sizes: "192-by-192", type: "image/jpeg", purpose: "any" } as const;
    expect(() =>
      validateManifestIcons(metadata(icon), "/app/", [{ path: "icon.jpg", content: jpeg(192, 192) }]),
    ).toThrow(/vite\.manifest-icon-size-invalid.*\/install\/icons\/0\/sizes/s);
  });
});
