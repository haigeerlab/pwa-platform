/**
 * Whether `new URL(value, base)` would succeed: the same answer as `URL.canParse`, which browsers below the supported
 * floor (Safari 13.1 / Chrome 80 / Firefox 74) do not have — it arrived in Chrome 120, Firefox 115 and Safari 17.
 */
export function canParseUrl(value: string, base?: string): boolean {
  try {
    new URL(value, base);
    return true;
  } catch {
    return false;
  }
}
