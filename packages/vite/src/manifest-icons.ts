import type { PwaInstallMetadata } from "@pwa-platform/contracts";
import type { PwaArtifactSourceFile } from "./artifacts.js";

type RasterType = "image/png" | "image/jpeg" | "image/webp";

type RasterImage = {
  readonly type: RasterType;
  readonly width: number;
  readonly height: number;
};

const KNOWN_RASTER_TYPES = new Set<string>(["image/png", "image/jpeg", "image/webp"]);

/**
 * Checks the manifest's primary install icons against the bytes Vite is about to publish.
 *
 * This intentionally sits in the adapter, not contracts: a data contract cannot know which files a host build
 * produced. It reads only the byte arrays already collected from the final bundle and publicDir.
 */
export function validateManifestIcons(
  install: PwaInstallMetadata | null,
  publicPath: string,
  files: readonly PwaArtifactSourceFile[],
): readonly string[] {
  if (install === null) return [];

  const published = new Map(files.map((file) => [file.path, file]));
  const warnings: string[] = [];

  install.icons.forEach((icon, index) => {
    const at = `/install/icons/${index}`;
    const path = icon.src.startsWith(publicPath) ? icon.src.slice(publicPath.length) : null;
    const file = path === null || path === "" ? undefined : published.get(path);

    if (file === undefined) {
      throw new Error(
        `vite.manifest-icon-missing at ${at}/src: ${icon.src} is not present in this Vite build. ` +
          "Put the icon under Vite publicDir or emit it from the build, and keep it under the configured base.",
      );
    }

    if (file.content === undefined) {
      throw new Error(
        `vite.manifest-icon-invalid at ${at}/src: ${icon.src} has no image bytes available for validation. ` +
          "Pass the icon bytes to the build adapter so its type and dimensions can be checked.",
      );
    }

    const bytes = typeof file.content === "string" ? new TextEncoder().encode(file.content) : file.content;
    const image = inspectRasterImage(bytes);
    const declaredType = icon.type.toLowerCase();

    if (image !== null && image.type !== declaredType) {
      throw new Error(
        `vite.manifest-icon-type-mismatch at ${at}/type: ${icon.src} declares ${icon.type}, ` +
          `but its file signature is ${image.type}. Correct the type or replace the file.`,
      );
    }

    if (!KNOWN_RASTER_TYPES.has(declaredType)) {
      warnings.push(
        `vite.manifest-icon-unverified at ${at}/type: ${icon.src} uses ${icon.type}, which this build check ` +
          "does not inspect. Confirm the file type and every declared size manually before release.",
      );
      return;
    }

    if (image === null) {
      throw new Error(
        `vite.manifest-icon-invalid at ${at}/src: ${icon.src} cannot be parsed as ${icon.type}. ` +
          "Replace the file with a valid image whose bytes match the declared type.",
      );
    }

    const declaredSizes = icon.sizes.toLowerCase().split(/\s+/).filter(Boolean);
    const actualSize = `${image.width}x${image.height}`;
    if (declaredSizes.length === 0 || declaredSizes.some((size) => !/^\d+x\d+$/.test(size))) {
      throw new Error(
        `vite.manifest-icon-size-invalid at ${at}/sizes: ${icon.src} declares ${icon.sizes}. ` +
          "Use space-separated pixel sizes such as 192x192.",
      );
    }
    if (declaredSizes.some((size) => size !== actualSize)) {
      throw new Error(
        `vite.manifest-icon-size-mismatch at ${at}/sizes: ${icon.src} declares ${icon.sizes}, ` +
          `but its ${formatLabel(image.type)} is ${actualSize}. Replace the image or correct the declared sizes.`,
      );
    }
  });

  return warnings;
}

function inspectRasterImage(bytes: Uint8Array): RasterImage | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
}

function inspectPng(bytes: Uint8Array): RasterImage | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (ascii(bytes, 12, 16) !== "IHDR") return null;
  return {
    type: "image/png",
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20),
  };
}

function inspectJpeg(bytes: Uint8Array): RasterImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const length = (readByte(bytes, offset) << 8) | readByte(bytes, offset + 1);
    if (length < 2 || offset + length > bytes.length) break;
    if (isJpegStartOfFrame(marker) && length >= 7) {
      return {
        type: "image/jpeg",
        height: (readByte(bytes, offset + 3) << 8) | readByte(bytes, offset + 4),
        width: (readByte(bytes, offset + 5) << 8) | readByte(bytes, offset + 6),
      };
    }
    offset += length;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array): RasterImage | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return null;

  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return {
      type: "image/webp",
      width: 1 + readUint24Le(bytes, 24),
      height: 1 + readUint24Le(bytes, 27),
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b0 = readByte(bytes, 21);
    const b1 = readByte(bytes, 22);
    const b2 = readByte(bytes, 23);
    const b3 = readByte(bytes, 24);
    return {
      type: "image/webp",
      width: 1 + b0 + ((b1 & 0x3f) << 8),
      height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      type: "image/webp",
      width: ((readByte(bytes, 27) << 8) | readByte(bytes, 26)) & 0x3fff,
      height: ((readByte(bytes, 29) << 8) | readByte(bytes, 28)) & 0x3fff,
    };
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((readByte(bytes, offset) << 24) >>> 0) +
    (readByte(bytes, offset + 1) << 16) +
    (readByte(bytes, offset + 2) << 8) +
    readByte(bytes, offset + 3)
  ) >>> 0;
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return readByte(bytes, offset) | (readByte(bytes, offset + 1) << 8) | (readByte(bytes, offset + 2) << 16);
}

function readByte(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function formatLabel(type: RasterType): string {
  if (type === "image/jpeg") return "JPEG";
  if (type === "image/webp") return "WebP";
  return "PNG";
}
