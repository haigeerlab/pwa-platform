/** True for `{}`/`Object.create(null)` shaped values; rejects arrays, class instances, `null`, primitives. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Closed-shape check: every own key must be in `required` or `optional`, and every `required` key must be
 * present. This is what "unknown field" rejection and "field may be omitted" rest on throughout this package.
 */
export function hasKeysWithin(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set<string>([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key)) && required.every((key) => Object.hasOwn(value, key));
}
