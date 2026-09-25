export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Namespaced extension key, e.g. `acme.analytics`. Runtime validation enforces the exact format. */
export type PwaExtensionNamespace = `${string}.${string}`;

export type PwaExtensions = {
  readonly [namespace: PwaExtensionNamespace]: JsonValue;
};
