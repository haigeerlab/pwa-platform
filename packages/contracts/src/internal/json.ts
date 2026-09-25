export type PathSegment = string | number;

const EXTENSION_NAMESPACE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

/** Extension keys are dot-separated lowercase namespaces, e.g. `acme.analytics`. */
export function isExtensionNamespace(key: string): boolean {
  return EXTENSION_NAMESPACE.test(key);
}

/**
 * Returns the location of the first value that is not plain JSON data, or `undefined`.
 * Inspects property descriptors only, so getters are never invoked.
 */
export function findNonJsonValue(value: unknown): PathSegment[] | undefined {
  return visit(value, [], new Set());
}

function visit(value: unknown, path: PathSegment[], ancestors: Set<object>): PathSegment[] | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? undefined : path;
  if (typeof value !== "object" || ancestors.has(value)) return path;

  const isArray = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    return path;
  }

  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (isArray && key === "length") continue;
    // Own `__proto__` keys survive JSON.parse but are dropped or re-prototyped by later object copies.
    if (typeof key === "symbol" || key === "__proto__") return path;
    const segment = isArray ? Number(key) : key;
    if (isArray && !Number.isInteger(segment)) return path;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) return [...path, segment];
    const found = visit(descriptor.value, [...path, segment], ancestors);
    if (found) return found;
  }
  ancestors.delete(value);

  if (isArray && keys.length - 1 !== (value as unknown[]).length) return path;
  return undefined;
}
