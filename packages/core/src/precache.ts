import { CACHE_STRATEGIES } from "@pwa-platform/contracts";
import type {
  AbsolutePath,
  PwaDiagnostic,
  PwaPathRule,
  PwaPlanOfflineFallback,
  PwaPolicy,
  PwaPrecacheEntry,
  PwaWarningDiagnostic,
} from "@pwa-platform/contracts";
import type { PwaCompileHostOutput, PwaHostBuildFile } from "./input.js";
import { diagnostic, warningDiagnostic } from "./internal/diagnostics.js";
import { compareCodePoints } from "./internal/order.js";
import { decodedPathKey, isWithinKey } from "./internal/path-key.js";
import { resolvePrefix } from "./rules.js";
import type { CompiledPathRules } from "./rules.js";

export type CompiledPrecache = {
  /** Sorted by URL code point, one entry per URL. */
  readonly precache: PwaPrecacheEntry[];
  readonly offlineFallback: PwaPlanOfflineFallback;
  readonly errors: PwaDiagnostic[];
  readonly warnings: PwaWarningDiagnostic[];
};

/** Selects precache entries from the host build output and validates the offline fallback. */
export function compilePrecache(
  policy: PwaPolicy,
  mountPath: AbsolutePath,
  host: PwaCompileHostOutput,
  rules: CompiledPathRules,
  /** Decoded path keys of child scopes owned by other applications (root app of a `shared-origin` registry only). */
  childPrefixKeys: readonly string[] = [],
): CompiledPrecache {
  const ruleKeys = rules.pathRules.map((rule) => decodedPathKey(rule.pathPrefix));
  const firstMatch = (url: AbsolutePath): PwaPathRule | undefined => {
    const key = decodedPathKey(url);
    const index = ruleKeys.findIndex((ruleKey) => isWithinKey(key, ruleKey));
    return rules.pathRules[index];
  };

  // The worker, the manifest (however they are spelled) and source maps are never precached.
  const excludedKeys = new Set(
    [`${host.publicPath}${host.serviceWorkerFile}`, `${host.publicPath}${host.manifestFile}`].map(decodedPathKey),
  );
  const isSpecialFile = (file: PwaHostBuildFile, url: string): boolean =>
    excludedKeys.has(decodedPathKey(url)) || /\.map$/i.test(file.path);
  const isInChildScope = (url: string): boolean => {
    const key = decodedPathKey(url);
    return childPrefixKeys.some((childKey) => isWithinKey(key, childKey));
  };

  // Files inside a child scope are still "built" for the offline fallback's own existence check;
  // they are only ever excluded from precache selection, below, with a warning.
  const nonSpecialFiles = host.files
    .map((file) => ({ file, url: `${host.publicPath}${file.path}` as const }))
    .filter(({ file, url }) => !isSpecialFile(file, url));

  const hostFileWarnings: PwaWarningDiagnostic[] = [];
  host.files.forEach((file, index) => {
    const url = `${host.publicPath}${file.path}`;
    if (!isSpecialFile(file, url) && isInChildScope(url)) {
      hostFileWarnings.push(warningDiagnostic("compile.host-file-in-child-scope", ["hostBuildOutput", "files", index, "path"]));
    }
  });
  const buildFiles = nonSpecialFiles.filter(({ url }) => !isInChildScope(url));

  const entries = new Map<string, PwaPrecacheEntry>();
  const add = (file: PwaHostBuildFile, url: AbsolutePath): void => {
    entries.set(url, { url, revision: file.fingerprinted ? null : file.contentHash });
  };

  const coveringRules = new Set<PwaPathRule>();
  for (const { file, url } of buildFiles) {
    const rule = firstMatch(url);
    if (rule !== undefined && isPrecacheSource(rule)) {
      coveringRules.add(rule);
      add(file, url);
    }
  }

  const warnings = [
    ...hostFileWarnings,
    ...rules.pathRules
      .map((rule, position) => ({ rule, resourceIndex: rules.resourceIndexes[position] ?? position }))
      .filter(({ rule }) => isPrecacheSource(rule) && !coveringRules.has(rule))
      .sort((left, right) => left.resourceIndex - right.resourceIndex)
      .map(({ resourceIndex }) =>
        warningDiagnostic("compile.asset-rule-unmatched", ["policy", "resources", resourceIndex, "pathPrefix"]),
      ),
  ];

  const errors: PwaDiagnostic[] = [];
  let offlineFallback: PwaPlanOfflineFallback = { enabled: false };
  if (policy.offlineFallback.enabled) {
    const path = resolvePrefix(mountPath, policy.offlineFallback.path);
    const pathKey = decodedPathKey(path);
    const built = nonSpecialFiles.find((candidate) => decodedPathKey(candidate.url) === pathKey);
    if (built === undefined) {
      errors.push(diagnostic("compile.offline-fallback-not-built", ["policy", "offlineFallback", "path"]));
    }
    if (isInChildScope(path)) {
      errors.push(diagnostic("compile.offline-fallback-in-child-scope", ["policy", "offlineFallback", "path"]));
    }
    if (firstMatch(path)?.action === "deny") {
      errors.push(diagnostic("compile.offline-fallback-denied", ["policy", "offlineFallback", "path"]));
    }
    if (built !== undefined && errors.length === 0) {
      add(built.file, built.url);
      // Record the build file's own spelling so a literal cache lookup at runtime finds the entry.
      offlineFallback = { enabled: true, path: built.url };
    }
  }

  return {
    precache: [...entries.values()].sort((left, right) => compareCodePoints(left.url, right.url)),
    offlineFallback,
    errors,
    warnings,
  };
}

// An explicit allow-list, not "not deny and not none": `PwaPathRuleAction` also has `exclude`, and a rule whose
// action is ever anything other than one of these three strategies must never be mistaken for a caching rule here,
// independent of what `resourceClass` happens to be (review #5 — `resourceClass` is a second, redundant guard, not
// the only one).
const CACHING_STRATEGIES: ReadonlySet<string> = new Set(CACHE_STRATEGIES.filter((strategy) => strategy !== "none"));

/**
 * Only asset rules whose action is an actual caching strategy contribute build files. Exported only for a
 * white-box unit test (not part of the public API — `index.ts` never re-exports this module).
 */
export function isPrecacheSource(rule: PwaPathRule): boolean {
  return rule.resourceClass === "asset" && CACHING_STRATEGIES.has(rule.action);
}
