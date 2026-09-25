import type * as z from "zod";
import { DIAGNOSTIC_CODES, DIAGNOSTIC_MESSAGES } from "../diagnostics.js";
import type {
  PwaContractPath,
  PwaDiagnostic,
  PwaDiagnosticCode,
  PwaDiagnosticSeverity,
} from "../diagnostics.js";
import type { PwaEventEnvelope } from "../events.js";
import type { PwaPlan } from "../plan.js";
import type { PwaPolicy } from "../policy.js";

/**
 * Every field name defined by the v1 contracts. Diagnostic paths stop at the first segment that
 * is not listed here, so input-controlled key names never reach a diagnostic.
 */
const KNOWN_FIELD_NAMES = [
  "action",
  "appId",
  "artifacts",
  "backgroundColor",
  "cache",
  "cacheNamespace",
  "cacheNamespaceSeed",
  "categories",
  "children",
  "code",
  "configDigest",
  "description",
  "diagnostics",
  "databaseName",
  "display",
  "displayOverride",
  "enabled",
  "environment",
  "extensions",
  "formFactor",
  "offlineWrites",
  "hostBuildOutput",
  "icons",
  "id",
  "identity",
  "install",
  "kind",
  "label",
  "manifestFile",
  "manifestId",
  "manifestUrl",
  "maxAgeSeconds",
  "maxBodyBytes",
  "maxEntries",
  "maxEntryBytes",
  "maxTotalBodyBytes",
  "message",
  "metadata",
  "mountPath",
  "name",
  "networkTimeoutSeconds",
  "offlineFallback",
  "orientation",
  "origin",
  "path",
  "pathPrefix",
  "pathRules",
  "planVersion",
  "policyVersion",
  "precache",
  "prefix",
  "publicPath",
  "purpose",
  "registry",
  "registryVersion",
  "requestBaselineDenials",
  "resourceClass",
  "resources",
  "revision",
  "root",
  "runtimeCache",
  "schemaVersion",
  "scope",
  "screenshots",
  "serviceWorkerFile",
  "serviceWorkerUrl",
  "severity",
  "shortcuts",
  "shortName",
  "sizes",
  "source",
  "src",
  "startUrl",
  "themeColor",
  "targets",
  "timestamp",
  "topology",
  "type",
  "updateMode",
  "url",
  "version",
] as const;

export const KNOWN_FIELDS: ReadonlySet<string> = new Set(KNOWN_FIELD_NAMES);

/** Every property name reachable in the public models, without descending into free-form maps. */
type FieldNames<T> = T extends readonly (infer Item)[]
  ? FieldNames<Item>
  : T extends object
    ? {
        [K in keyof T & string]-?: K extends "extensions" | "metadata" ? K : K | FieldNames<T[K]>;
      }[keyof T & string]
    : never;

// Compile-time guard: adding a field to a public model without listing it here fails typecheck.
const knownFieldsCoverModels: [
  Exclude<FieldNames<PwaPlan | PwaPolicy | PwaEventEnvelope<string>>, (typeof KNOWN_FIELD_NAMES)[number]>,
] extends [never]
  ? true
  : false = true;
void knownFieldsCoverModels;

const IDENTITY_OVERRIDE_FIELDS: ReadonlySet<string> = new Set([
  "identity",
  "appId",
  "manifestId",
  "origin",
  "scope",
  "serviceWorkerUrl",
  "manifestUrl",
  "mountPath",
  "environment",
  "cacheNamespaceSeed",
]);

const VERSION_FIELDS: ReadonlySet<PropertyKey> = new Set(["schemaVersion", "planVersion", "policyVersion"]);

export function toContractPath(segments: readonly PropertyKey[]): PwaContractPath {
  let path: PwaContractPath = "";
  for (const segment of segments) {
    if (typeof segment !== "number" && !(typeof segment === "string" && KNOWN_FIELDS.has(segment))) break;
    path = `${path}/${segment}`;
    // Keys below free-form maps are input-controlled even when they look like field names.
    if (segment === "extensions" || segment === "metadata") break;
  }
  return path;
}

export function diagnostic(
  code: PwaDiagnosticCode,
  segments: readonly PropertyKey[],
  severity: PwaDiagnosticSeverity = "error",
  message: string = DIAGNOSTIC_MESSAGES[code],
): PwaDiagnostic {
  return { code, severity, path: toContractPath(segments), message };
}

/** Maps zod issues to platform diagnostics; zod messages, inputs and unknown key names are dropped. */
export function mapIssues(
  issues: readonly z.core.$ZodIssue[],
  input: unknown,
  reportIdentityOverrides: boolean,
): PwaDiagnostic[] {
  const diagnostics: PwaDiagnostic[] = [];
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      const overrides =
        reportIdentityOverrides && issue.path.length === 0
          ? [...IDENTITY_OVERRIDE_FIELDS].filter((field) => issue.keys.includes(field))
          : [];
      for (const key of overrides) diagnostics.push(diagnostic("policy.identity-override", [key]));
      if (overrides.length < issue.keys.length) diagnostics.push(diagnostic("schema.unknown-field", issue.path));
      continue;
    }
    diagnostics.push(diagnostic(codeFor(issue, input), issue.path));
  }
  return diagnostics;
}

function codeFor(issue: z.core.$ZodIssue, input: unknown): PwaDiagnosticCode {
  switch (issue.code) {
    case "custom": {
      const code: unknown = issue.params?.["diagnostic"];
      return isDiagnosticCode(code) ? code : "schema.invalid-value";
    }
    case "invalid_type":
      return isMissing(input, issue.path) ? "schema.missing-field" : "schema.invalid-type";
    case "invalid_value":
      return VERSION_FIELDS.has(issue.path.at(-1) ?? "") ? "schema.unsupported-version" : "schema.invalid-value";
    default:
      return isMissing(input, issue.path) ? "schema.missing-field" : "schema.invalid-value";
  }
}

function isDiagnosticCode(value: unknown): value is PwaDiagnosticCode {
  return (DIAGNOSTIC_CODES as readonly unknown[]).includes(value);
}

function isMissing(input: unknown, path: readonly PropertyKey[]): boolean {
  const key = path.at(-1);
  let parent = input;
  for (const segment of path.slice(0, -1)) {
    if (typeof parent !== "object" || parent === null) return false;
    parent = (parent as Record<PropertyKey, unknown>)[segment];
  }
  return key !== undefined && typeof parent === "object" && parent !== null && !Object.hasOwn(parent, key);
}
