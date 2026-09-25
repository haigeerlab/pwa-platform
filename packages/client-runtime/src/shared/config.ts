// The client config's shape and its validation, shared by the build-time entry and the page facade. The same rules
// therefore run when the config is generated from a plan and again when a page hands it to `createPwaClient`.
import type { PwaUpdateMode } from "@pwa-platform/contracts";

/** Same-origin absolute path, in the plan's spelling. */
export type PwaClientPath = `/${string}`;

export type PwaClientConfig = {
  readonly appId: string;
  /** The registration scope; equal to the identity's scope. */
  readonly scope: PwaClientPath;
  readonly serviceWorkerUrl: PwaClientPath;
  readonly updateMode: PwaUpdateMode;
  /** `plan.install !== null`: the host build produced install metadata. */
  readonly installEnabled: boolean;
};

const CONFIG_KEYS = ["appId", "scope", "serviceWorkerUrl", "updateMode", "installEnabled"] as const;

// Only used to check the form of paths; never requested.
const PATH_BASE = "https://client-runtime.invalid";

/**
 * Validates a client config and returns a fresh copy with keys in canonical order. Messages name fields only, never
 * the value that failed.
 */
export function validateClientConfig(value: unknown): PwaClientConfig {
  const config = plainObject(value, "config");
  exactKeys(config, CONFIG_KEYS, "config");

  const appId = config["appId"];
  if (typeof appId !== "string" || appId === "") fail("config.appId must be a non-empty string");

  const scope = canonicalPath(config["scope"], "config.scope");
  if (!scope.endsWith("/")) fail('config.scope must end with "/"');

  const serviceWorkerUrl = canonicalPath(config["serviceWorkerUrl"], "config.serviceWorkerUrl");
  // A worker can only control pages under its own scope, so a URL outside it would register with a scope the plan
  // never declared. contracts already rejects this in `validateIdentity`; checking it again keeps a hand-written
  // config from registering a worker the plan did not describe.
  if (!serviceWorkerUrl.startsWith(scope)) fail("config.serviceWorkerUrl must be inside config.scope");

  if (config["updateMode"] !== "prompt") fail('config.updateMode must be "prompt"');

  const installEnabled = config["installEnabled"];
  if (typeof installEnabled !== "boolean") fail("config.installEnabled must be a boolean");

  return { appId, scope, serviceWorkerUrl, updateMode: "prompt", installEnabled };
}

function fail(detail: string): never {
  throw new Error(`Invalid client-runtime config: ${detail}`);
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  const prototype: unknown = typeof value === "object" && value !== null ? Object.getPrototypeOf(value) : undefined;
  if (Array.isArray(value) || (prototype !== Object.prototype && prototype !== null)) fail(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Reflect.ownKeys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) {
    fail(`${label} must have exactly the fields ${keys.join(", ")}`);
  }
}

/**
 * The rule contracts' `isCanonicalPath` applies to plan paths: an absolute path already in WHATWG URL serialized
 * form, without "//", backslashes, query, fragment or characters the URL parser would change.
 */
function canonicalPath(value: unknown, label: string): PwaClientPath {
  const canonical =
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    URL.canParse(value, PATH_BASE) &&
    new URL(value, PATH_BASE).pathname === value;
  if (!canonical) fail(`${label} must be a canonical absolute path`);
  return value as PwaClientPath;
}
