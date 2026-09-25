const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CHAR_VALUES: ReadonlyMap<string, number> = new Map([...BASE64URL_ALPHABET].map((char, index) => [char, index]));
const STRICT_CHARSET = /^[A-Za-z0-9_-]*$/;

/**
 * Strict base64url decode: only `A-Z a-z 0-9 - _`, no `=` padding, no whitespace, and no non-canonical
 * trailing bits (the "spare" bits in the last character group must be zero). Never throws; an invalid
 * encoding returns `undefined`. Deliberately does not use `atob`/`Buffer`, neither of which reject this
 * strictly.
 */
export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!STRICT_CHARSET.test(value) || value.length % 4 === 1) return undefined;

  const bytes: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const char of value) {
    const charValue = CHAR_VALUES.get(char);
    if (charValue === undefined) return undefined;
    bits = ((bits << 6) | charValue) & 0xffff;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >>> bitCount) & 0xff);
    }
  }
  // Whatever is left over is padding bits that carry no byte; a canonical encoding always zeroes them.
  if (bitCount > 0 && (bits & ((1 << bitCount) - 1)) !== 0) return undefined;

  return new Uint8Array(bytes);
}
