// `%2F` must not become a segment boundary the URL does not have, so it is replaced by a lone
// surrogate: UTF-8 decoding never produces one, so it cannot collide with decoded text.
//
// Mirrors core's `src/internal/path-key.ts` exactly (ADR-0019 review #1): the registry checks below
// must use the same decoding and whole-segment comparison rules core uses for path rules, or a
// spelling core treats as one path could pass registry validation as two. Duplicated rather than
// shared because contracts has no dependency on core (core depends on contracts, never the reverse).
const ENCODED_SLASH = "\uD800";
const UTF8_DECODER = new TextDecoder("utf-8", { ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();

/**
 * Comparison key for a canonical path, decoded per segment like the URL standard: valid `%XX` escapes
 * become bytes, invalid escapes stay literal, and bytes that are not UTF-8 become U+FFFD. Distinct
 * spellings can therefore only collapse into one key, never split, so conflicts fail closed.
 * Never emitted in plans.
 */
export function decodedPathKey(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.split(/%2f/i).map(percentDecode).join(ENCODED_SLASH))
    .join("/");
}

/** Whole-segment containment of decoded keys: `/app/api/x` is within `/app/api`, `/app/apis` is not. */
export function isWithinKey(key: string, prefixKey: string): boolean {
  return prefixKey === "/" || key === prefixKey || key.startsWith(`${prefixKey}/`);
}

function percentDecode(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const escape = text.slice(index + 1, index + 3);
    if (text[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(escape)) {
      bytes.push(Number.parseInt(escape, 16));
      index += 2;
      continue;
    }
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0);
    bytes.push(...UTF8_ENCODER.encode(character));
    index += character.length - 1;
  }
  return UTF8_DECODER.decode(Uint8Array.from(bytes));
}
