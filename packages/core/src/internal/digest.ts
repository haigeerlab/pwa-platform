// Zero-dependency, synchronous, non-cryptographic hash: only used to invalidate a runtime cache
// namespace when its configuration changes, never as a security or integrity check.
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

const UTF8_ENCODER = new TextEncoder();

/** FNV-1a 64-bit hash of `input`'s UTF-8 bytes, returned as 16 lowercase hex characters. */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of UTF8_ENCODER.encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
