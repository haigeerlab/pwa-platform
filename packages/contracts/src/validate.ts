import * as z from "zod";
import { appCachePrefix, cacheNamespacePrefix } from "./cache-namespace.js";
import { DIAGNOSTIC_CODES } from "./diagnostics.js";
import type {
  PwaContractPath,
  PwaDiagnostic,
  PwaDiagnosticCode,
  PwaValidationResult,
  PwaWarningDiagnostic,
} from "./diagnostics.js";
import {
  INSTALL_DISPLAY_MODES,
  INSTALL_DISPLAY_OVERRIDES,
  INSTALL_ICON_PURPOSES,
  INSTALL_ORIENTATIONS,
  INSTALL_SCREENSHOT_FORM_FACTORS,
  INSTALL_SCREENSHOT_TYPES,
} from "./identity.js";
import type { AbsolutePath, PwaIdentity, PwaInstallMetadata, PwaInstallScreenshot } from "./identity.js";
import { diagnostic, mapIssues } from "./internal/diagnostic.js";
import { findNonJsonValue, isExtensionNamespace } from "./internal/json.js";
import { decodedPathKey, isWithinKey } from "./internal/path-key.js";
import {
  isCanonicalPath,
  isPathPrefix,
  isRelativeFilePath,
  isSecureOrigin,
  isWithinPath,
} from "./internal/paths.js";
import type { PwaExtensions } from "./json.js";
import { REQUEST_BASELINE_DENIALS } from "./plan.js";
import type { PwaOriginRegistry, PwaPathRule, PwaPlan, PwaPlanV2, PwaPlanV3, PwaRegistryEntry } from "./plan.js";
import { CACHE_STRATEGIES, RESOURCE_CLASSES, UPDATE_MODES } from "./policy.js";
import type { MountRelativePath, PwaOfflineWritePolicy, PwaPolicy, PwaResourceClass, PwaRuntimeCachePolicy } from "./policy.js";

const ENVIRONMENT = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const REQUIRED_ICON_SIZES = ["192x192", "512x512"] as const;
const OFFLINE_WRITE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const CONFIG_DIGEST = /^[0-9a-f]{16}$/;
/** Lowercase `x`, no leading zeros, at most five digits per dimension (the largest Chrome accepts is 3840). */
const SCREENSHOT_SIZES = /^([1-9]\d{0,4})x([1-9]\d{0,4})$/;
const MIN_SCREENSHOT_DIMENSION = 320;
const MAX_SCREENSHOT_DIMENSION = 3840;
/** 2.3, in tenths, so the aspect check stays in integers. */
const MAX_SCREENSHOT_ASPECT_RATIO_TENTHS = 23;
const MAX_WIDE_SCREENSHOTS = 8;
const MAX_NARROW_SCREENSHOTS = 5;
const MAX_DESCRIPTION_LENGTH = 324;

/** Public GET resource classes; every other class may only use the `none` strategy. */
const CACHEABLE_CLASSES: ReadonlySet<PwaResourceClass> = new Set([
  "asset",
  "navigation-public-static",
  "navigation-public-dynamic",
  "public-data",
]);

function refinedString<T extends string>(test: (value: string) => boolean, code: PwaDiagnosticCode) {
  return z
    .string()
    .pipe(z.custom<T>((value) => typeof value === "string" && test(value), { params: { diagnostic: code } }));
}

/** Every item must be pairwise distinct; used for arrays where a repeated value is a write mistake. */
function hasNoDuplicates<T>(items: readonly T[]): boolean {
  return new Set(items).size === items.length;
}

function createSchemas() {
  const text = refinedString<string>((value) => value !== "", "schema.invalid-value");
  const absolutePath = refinedString<AbsolutePath>(isCanonicalPath, "path.invalid");
  // Browsers match scopes by string prefix, so `/app` would also control `/apple`.
  const scopePath = refinedString<AbsolutePath>(
    (value) => isCanonicalPath(value) && value.endsWith("/"),
    "path.invalid",
  );
  const pathPrefix = refinedString<MountRelativePath>(isPathPrefix, "path.invalid");
  const relativeFile = refinedString<string>(isRelativeFilePath, "path.invalid");
  const contractPath = refinedString<PwaContractPath>(
    (value) => value === "" || value.startsWith("/"),
    "path.invalid",
  );
  const extensions = z.record(z.string(), z.unknown()).pipe(
    z.custom<PwaExtensions>(
      (value) =>
        typeof value === "object" && value !== null && Object.keys(value).every(isExtensionNamespace),
      { params: { diagnostic: "extensions.invalid-namespace" } },
    ),
  );

  // Cache namespace segments are percent-encoded, which is impossible for lone surrogates.
  const namespaceSegment = refinedString<string>(
    (value) => value !== "" && !LONE_SURROGATE.test(value),
    "schema.invalid-value",
  );

  const originValue = refinedString<string>(isSecureOrigin, "identity.invalid-origin");
  const environmentValue = refinedString<string>((value) => ENVIRONMENT.test(value), "identity.invalid-environment");

  const identity = z
    .strictObject({
      appId: namespaceSegment,
      manifestId: text,
      origin: originValue,
      scope: scopePath,
      serviceWorkerUrl: absolutePath,
      manifestUrl: absolutePath,
      mountPath: absolutePath,
      environment: environmentValue,
      cacheNamespaceSeed: namespaceSegment,
    })
    .readonly();

  const registryEntry = z
    .strictObject({
      appId: namespaceSegment,
      scope: scopePath,
      serviceWorkerUrl: absolutePath,
      manifestId: text,
      manifestUrl: absolutePath,
    })
    .readonly();

  const registryVersion = z
    .number()
    .pipe(
      z.custom<number>((value) => typeof value === "number" && Number.isInteger(value) && value > 0, {
        params: { diagnostic: "schema.invalid-value" },
      }),
    );

  const registry = z
    .strictObject({
      schemaVersion: z.literal(1),
      registryVersion,
      origin: originValue,
      environment: environmentValue,
      root: registryEntry,
      children: z.array(registryEntry).min(1).readonly(),
    })
    .readonly();

  const topology = z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("standalone-origin") }).readonly(),
      z.strictObject({ kind: z.literal("shared-origin"), registry }).readonly(),
    ])
    .readonly();

  const installIcon = z
    .strictObject({ src: absolutePath, sizes: text, type: text, purpose: z.enum(INSTALL_ICON_PURPOSES) })
    .readonly();

  const lowercaseCategory = refinedString<string>(
    (value) => value !== "" && value === value.toLowerCase(),
    "schema.invalid-value",
  );
  const categories = z
    .array(lowercaseCategory)
    .min(1)
    .refine(hasNoDuplicates, { params: { diagnostic: "schema.invalid-value" } })
    .readonly();
  const displayOverride = z
    .array(z.enum(INSTALL_DISPLAY_OVERRIDES))
    .min(1)
    .refine(hasNoDuplicates, { params: { diagnostic: "schema.invalid-value" } })
    .readonly();
  const screenshotSizes = refinedString<string>((value) => SCREENSHOT_SIZES.test(value), "schema.invalid-value");
  const screenshots = z
    .array(
      z
        .strictObject({
          src: absolutePath,
          sizes: screenshotSizes,
          type: z.enum(INSTALL_SCREENSHOT_TYPES),
          formFactor: z.exactOptional(z.enum(INSTALL_SCREENSHOT_FORM_FACTORS)),
          label: z.exactOptional(text),
        })
        .readonly(),
    )
    .min(1)
    .readonly();
  const shortcuts = z
    .array(
      z
        .strictObject({
          name: text,
          url: absolutePath,
          shortName: z.exactOptional(text),
          description: z.exactOptional(text),
          icons: z.exactOptional(z.array(installIcon).min(1).readonly()),
        })
        .readonly(),
    )
    .min(1)
    .readonly();

  const install = z
    .strictObject({
      startUrl: absolutePath,
      display: z.enum(INSTALL_DISPLAY_MODES),
      name: text,
      shortName: text,
      themeColor: text,
      backgroundColor: text,
      icons: z.array(installIcon).readonly(),
      description: z.exactOptional(text),
      categories: z.exactOptional(categories),
      orientation: z.exactOptional(z.enum(INSTALL_ORIENTATIONS)),
      displayOverride: z.exactOptional(displayOverride),
      screenshots: z.exactOptional(screenshots),
      shortcuts: z.exactOptional(shortcuts),
    })
    .readonly();

  const offlineFallback = z
    .discriminatedUnion("enabled", [
      z.strictObject({ enabled: z.literal(false) }),
      z.strictObject({ enabled: z.literal(true), path: absolutePath }),
    ])
    .readonly();

  const resources = z
    .array(
      z
        .strictObject({ pathPrefix, resourceClass: z.enum(RESOURCE_CLASSES), cache: z.enum(CACHE_STRATEGIES) })
        .readonly(),
    )
    .readonly();
  const networkTimeoutSeconds = z.number().pipe(
    z.custom<number>(
      (value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30,
      { params: { diagnostic: "schema.invalid-value" } },
    ),
  );
  const policyFields = {
    install: z.strictObject({ enabled: z.boolean() }).readonly(),
    offlineFallback,
    updateMode: z.enum(UPDATE_MODES),
    resources,
    extensions: z.exactOptional(extensions),
    networkTimeoutSeconds: z.exactOptional(networkTimeoutSeconds),
  };
  const nonNegativeBoundedInteger = (maximum: number) => z.number().int().min(0).max(maximum);
  const positiveBoundedInteger = (maximum: number) => z.number().int().min(1).max(maximum);
  const boundedInteger = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);
  // Either exactly zero (the field's disabled value) or an integer within [minimum, maximum]; the gap
  // between 0 and minimum (e.g. 1-59 for a 60s floor) is invalid regardless of the policy's enabled state.
  const zeroOrBoundedInteger = (minimum: number, maximum: number) =>
    z
      .number()
      .pipe(
        z.custom<number>(
          (value) =>
            typeof value === "number" && Number.isInteger(value) && (value === 0 || (value >= minimum && value <= maximum)),
          { params: { diagnostic: "schema.invalid-value" } },
        ),
      );
  const offlineWrites = z
    .strictObject({
      enabled: z.boolean(),
      maxEntries: nonNegativeBoundedInteger(50),
      maxTotalBodyBytes: nonNegativeBoundedInteger(524_288),
      targets: z
        .array(
          z
            .strictObject({
              id: refinedString((value) => OFFLINE_WRITE_ID.test(value), "schema.invalid-value"),
              pathPrefix,
              maxBodyBytes: positiveBoundedInteger(16_384),
            })
            .readonly(),
        )
        .readonly(),
    })
    .readonly();
  const runtimeCache = z
    .strictObject({
      enabled: z.boolean(),
      maxEntries: zeroOrBoundedInteger(1, 200),
      maxEntryBytes: zeroOrBoundedInteger(1, 1_048_576),
      maxAgeSeconds: zeroOrBoundedInteger(60, 604_800),
    })
    .readonly();
  const policy = z
    .discriminatedUnion("schemaVersion", [
      z.strictObject({ schemaVersion: z.literal(1), ...policyFields }).readonly(),
      z.strictObject({ schemaVersion: z.literal(2), ...policyFields, offlineWrites }).readonly(),
      z.strictObject({ schemaVersion: z.literal(3), ...policyFields, offlineWrites, runtimeCache }).readonly(),
    ])
    .readonly();

  const planFields = {
      identity,
      install: z.nullable(install),
      hostBuildOutput: z.strictObject({ publicPath: absolutePath }).readonly(),
      topology,
      artifacts: z.strictObject({ serviceWorkerFile: relativeFile, manifestFile: relativeFile }).readonly(),
      precache: z.array(z.strictObject({ url: absolutePath, revision: z.nullable(z.string()) }).readonly()).readonly(),
      cacheNamespace: z.strictObject({ prefix: text }).readonly(),
      requestBaselineDenials: z.array(z.enum(REQUEST_BASELINE_DENIALS)).readonly(),
      pathRules: z
        .array(
          z
            .strictObject({
              pathPrefix,
              resourceClass: z.enum(RESOURCE_CLASSES),
              action: z.enum(["exclude", "deny", ...CACHE_STRATEGIES]),
              source: z.enum(["platform", "policy"]),
            })
            .readonly(),
        )
        .readonly(),
      offlineFallback,
      updateMode: z.enum(UPDATE_MODES),
      diagnostics: z
        .array(
          z
            .strictObject({
              code: z.enum(DIAGNOSTIC_CODES),
              severity: z.literal("warning"),
              path: contractPath,
              message: z.string(),
            })
            .readonly(),
        )
        .readonly(),
      networkTimeoutSeconds: z.exactOptional(networkTimeoutSeconds),
  };
  const planOfflineWrites = z
    .discriminatedUnion("enabled", [
      z.strictObject({ enabled: z.literal(false) }).readonly(),
      z
        .strictObject({
          enabled: z.literal(true),
          databaseName: text,
          maxEntries: positiveBoundedInteger(50),
          maxTotalBodyBytes: positiveBoundedInteger(524_288),
          targets: z
            .array(
              z
                .strictObject({
                  id: refinedString((value) => OFFLINE_WRITE_ID.test(value), "schema.invalid-value"),
                  pathPrefix: absolutePath,
                  maxBodyBytes: positiveBoundedInteger(16_384),
                })
                .readonly(),
            )
            .readonly(),
        })
        .readonly(),
    ])
    .readonly();
  const planRuntimeCache = z
    .discriminatedUnion("enabled", [
      z.strictObject({ enabled: z.literal(false) }).readonly(),
      z
        .strictObject({
          enabled: z.literal(true),
          maxEntries: boundedInteger(1, 200),
          maxEntryBytes: boundedInteger(1, 1_048_576),
          maxAgeSeconds: boundedInteger(60, 604_800),
          configDigest: refinedString<string>((value) => CONFIG_DIGEST.test(value), "schema.invalid-value"),
        })
        .readonly(),
    ])
    .readonly();
  const plan = z
    .discriminatedUnion("schemaVersion", [
      z.strictObject({ schemaVersion: z.literal(1), planVersion: z.literal(1), policyVersion: z.literal(1), ...planFields }).readonly(),
      z
        .strictObject({ schemaVersion: z.literal(2), planVersion: z.literal(2), policyVersion: z.literal(2), ...planFields, offlineWrites: planOfflineWrites })
        .readonly(),
      z
        .strictObject({
          schemaVersion: z.literal(3),
          planVersion: z.literal(3),
          policyVersion: z.literal(3),
          ...planFields,
          offlineWrites: planOfflineWrites,
          runtimeCache: planRuntimeCache,
        })
        .readonly(),
    ])
    .readonly();

  return { identity, install, policy, plan, registry };
}

type Schemas = ReturnType<typeof createSchemas>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Compile-time guard: every schema must produce exactly the hand-written public type.
const schemaMatchesPublicTypes: [
  Equal<z.output<Schemas["identity"]>, PwaIdentity>,
  Equal<z.output<Schemas["install"]>, PwaInstallMetadata>,
  Equal<z.output<Schemas["policy"]>, PwaPolicy>,
  Equal<z.output<Schemas["plan"]>, PwaPlan>,
  Equal<z.output<Schemas["registry"]>, PwaOriginRegistry>,
] = [true, true, true, true, true];
void schemaMatchesPublicTypes;

// Built on first use: constructing zod objects probes `new Function`, which must not happen at import.
let schemas: Schemas | undefined;

function getSchemas(): Schemas {
  schemas ??= createSchemas();
  return schemas;
}

function validate<T>(
  input: unknown,
  schema: z.ZodType<T>,
  invariants: (value: T) => PwaDiagnostic[],
  reportIdentityOverrides = false,
): PwaValidationResult<T> {
  try {
    const nonJson = findNonJsonValue(input);
    if (nonJson) return failure([diagnostic("value.not-serializable", nonJson)]);

    const parsed = schema.safeParse(input);
    if (!parsed.success) return failure(mapIssues(parsed.error.issues, input, reportIdentityOverrides));

    const findings = invariants(parsed.data);
    if (findings.some((finding) => finding.severity === "error")) return failure(findings);
    return { ok: true, value: parsed.data, diagnostics: findings.filter(isWarning) };
  } catch {
    // Hostile inputs (revoked proxies, throwing traps, extreme nesting) must still produce a result.
    return failure([diagnostic("value.not-serializable", [])]);
  }
}

function failure(diagnostics: readonly PwaDiagnostic[]): PwaValidationResult<never> {
  const [first, ...rest] = diagnostics;
  if (!first) throw new Error("A failed validation must carry at least one diagnostic.");
  return { ok: false, diagnostics: [first, ...rest] };
}

function isWarning(finding: PwaDiagnostic): finding is PwaWarningDiagnostic {
  return finding.severity === "warning";
}

function identityInvariants(identity: PwaIdentity, at: readonly PropertyKey[] = []): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  if (!isWithinPath(identity.mountPath, identity.scope)) {
    findings.push(diagnostic("identity.scope-excludes-mount-path", [...at, "scope"]));
  }
  // The scope ends with `/`, and browsers test URLs against it by plain string prefix.
  if (!identity.serviceWorkerUrl.startsWith(identity.scope)) {
    findings.push(diagnostic("identity.service-worker-outside-scope", [...at, "serviceWorkerUrl"]));
  }
  if (!identity.manifestUrl.startsWith(identity.scope)) {
    findings.push(diagnostic("identity.manifest-outside-scope", [...at, "manifestUrl"]));
  }
  return findings;
}

function installInvariants(
  install: PwaInstallMetadata,
  identity: PwaIdentity,
  at: readonly PropertyKey[] = [],
): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  if (!install.startUrl.startsWith(identity.scope)) {
    findings.push(diagnostic("install.start-url-outside-scope", [...at, "startUrl"]));
  }
  for (const size of REQUIRED_ICON_SIZES) {
    for (const purpose of INSTALL_ICON_PURPOSES) {
      const present = install.icons.some(
        (icon) => icon.purpose === purpose && icon.sizes.toLowerCase().split(/\s+/).includes(size),
      );
      if (!present) {
        findings.push(
          diagnostic("install.missing-icon-variant", [...at, "icons"], "error", `Required ${size} "${purpose}" icon is missing.`),
        );
      }
    }
  }
  for (const field of ["themeColor", "backgroundColor"] as const) {
    if (!HEX_COLOR.test(install[field])) findings.push(diagnostic("install.invalid-color", [...at, field], "warning"));
  }

  if (install.description !== undefined && install.description.length > MAX_DESCRIPTION_LENGTH) {
    findings.push(diagnostic("install.description-too-long", [...at, "description"], "warning"));
  }

  if (install.shortcuts) {
    install.shortcuts.forEach((shortcut, index) => {
      if (!shortcut.url.startsWith(identity.scope)) {
        findings.push(diagnostic("install.shortcut-url-outside-scope", [...at, "shortcuts", index, "url"]));
      }
    });
  }

  if (install.screenshots) findings.push(...screenshotInvariants(install.screenshots, [...at, "screenshots"]));

  return findings;
}

function screenshotDimensions(sizes: string): readonly [width: number, height: number] {
  const match = SCREENSHOT_SIZES.exec(sizes);
  return [Number(match?.[1]), Number(match?.[2])];
}

function screenshotInvariants(screenshots: readonly PwaInstallScreenshot[], at: readonly PropertyKey[]): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  let wideCount = 0;
  const groups = new Map<"wide" | "narrow", { width: number; height: number }[]>();

  screenshots.forEach((screenshot, index) => {
    const [width, height] = screenshotDimensions(screenshot.sizes);
    const sizesPath = [...at, index, "sizes"];
    if (
      width < MIN_SCREENSHOT_DIMENSION ||
      width > MAX_SCREENSHOT_DIMENSION ||
      height < MIN_SCREENSHOT_DIMENSION ||
      height > MAX_SCREENSHOT_DIMENSION
    ) {
      findings.push(diagnostic("install.screenshot-size-out-of-range", sizesPath, "warning"));
    }
    const longEdge = Math.max(width, height);
    const shortEdge = Math.min(width, height);
    // Integer cross-multiplication rather than `longEdge / shortEdge > 2.3`: 2.3 has no exact binary form, and the
    // boundary (exactly 2.3 times) must not depend on floating-point rounding.
    if (longEdge * 10 > shortEdge * MAX_SCREENSHOT_ASPECT_RATIO_TENTHS) {
      findings.push(diagnostic("install.screenshot-aspect-ratio", sizesPath, "warning"));
    }

    const formFactor = screenshot.formFactor ?? "narrow";
    if (formFactor === "wide") wideCount += 1;
    const group = groups.get(formFactor) ?? [];
    group.push({ width, height });
    groups.set(formFactor, group);
  });

  for (const dimensions of groups.values()) {
    const [first, ...rest] = dimensions;
    if (first && rest.some((dimension) => dimension.width * first.height !== first.width * dimension.height)) {
      findings.push(diagnostic("install.screenshot-aspect-mismatch", at, "warning"));
    }
  }

  const narrowCount = screenshots.length - wideCount;
  if (wideCount > MAX_WIDE_SCREENSHOTS || narrowCount > MAX_NARROW_SCREENSHOTS) {
    findings.push(diagnostic("install.screenshot-count", at, "warning"));
  }
  if (screenshots.length > 0 && wideCount === 0) {
    findings.push(diagnostic("install.screenshot-no-wide", at, "warning"));
  }

  return findings;
}

function policyInvariants(policy: PwaPolicy): PwaDiagnostic[] {
  const findings = policy.resources.flatMap((rule, index) =>
    rule.cache !== "none" && !CACHEABLE_CLASSES.has(rule.resourceClass)
      ? [diagnostic("policy.unsafe-cache-strategy", ["resources", index, "cache"])]
      : [],
  );
  if (policy.schemaVersion === 1) return findings;

  findings.push(...offlineWriteInvariants(policy.offlineWrites));
  if (policy.schemaVersion === 3) findings.push(...runtimeCacheInvariants(policy.runtimeCache));
  return findings;
}

function offlineWriteInvariants(offlineWrites: PwaOfflineWritePolicy): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  if (!offlineWrites.enabled) {
    if (offlineWrites.maxEntries !== 0 || offlineWrites.maxTotalBodyBytes !== 0 || offlineWrites.targets.length !== 0) {
      findings.push(diagnostic("offline-write.disabled-configuration", ["offlineWrites"]));
    }
    return findings;
  }

  if (offlineWrites.maxEntries === 0) {
    findings.push(diagnostic("offline-write.enabled-configuration", ["offlineWrites", "maxEntries"]));
  }
  if (offlineWrites.maxTotalBodyBytes === 0) {
    findings.push(diagnostic("offline-write.enabled-configuration", ["offlineWrites", "maxTotalBodyBytes"]));
  }
  if (offlineWrites.targets.length === 0) {
    findings.push(diagnostic("offline-write.target-required", ["offlineWrites", "targets"]));
  }

  const targetIds = new Set<string>();
  const targetPaths = new Set<string>();
  for (const [index, target] of offlineWrites.targets.entries()) {
    if (targetIds.has(target.id)) {
      findings.push(diagnostic("offline-write.duplicate-target-id", ["offlineWrites", "targets", index, "id"]));
    }
    targetIds.add(target.id);

    const pathKey = decodedPathKey(target.pathPrefix);
    if (targetPaths.has(pathKey)) {
      findings.push(diagnostic("offline-write.duplicate-target-path", ["offlineWrites", "targets", index, "pathPrefix"]));
    }
    targetPaths.add(pathKey);
  }
  return findings;
}

function runtimeCacheInvariants(runtimeCache: PwaRuntimeCachePolicy): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  if (!runtimeCache.enabled) {
    if (runtimeCache.maxEntries !== 0 || runtimeCache.maxEntryBytes !== 0 || runtimeCache.maxAgeSeconds !== 0) {
      findings.push(diagnostic("runtime-cache.disabled-configuration", ["runtimeCache"]));
    }
    return findings;
  }

  if (runtimeCache.maxEntries === 0) {
    findings.push(diagnostic("runtime-cache.enabled-configuration", ["runtimeCache", "maxEntries"]));
  }
  if (runtimeCache.maxEntryBytes === 0) {
    findings.push(diagnostic("runtime-cache.enabled-configuration", ["runtimeCache", "maxEntryBytes"]));
  }
  if (runtimeCache.maxAgeSeconds === 0) {
    findings.push(diagnostic("runtime-cache.enabled-configuration", ["runtimeCache", "maxAgeSeconds"]));
  }
  return findings;
}

/**
 * Decoded, whole-segment comparison key for a scope: the scope without its trailing slash (core's
 * `resolvePrefix`), then percent-decoded per segment the same way core's path rules are (review #1).
 * Raw string comparison would let two spellings of the same path — `/m/` and `/%6D/`, say — pass as
 * distinct scopes when core's compiler and the platform worker treat them as one.
 */
function scopeKey(scope: AbsolutePath): string {
  return decodedPathKey(scopeToPathPrefix(scope));
}

/** Whole-segment containment that treats an exact scope match as *not* within (ADR-0019). */
function isStrictlyWithinScope(scope: AbsolutePath, root: AbsolutePath): boolean {
  const scopeKeyValue = scopeKey(scope);
  const rootKeyValue = scopeKey(root);
  return scopeKeyValue !== rootKeyValue && isWithinKey(scopeKeyValue, rootKeyValue);
}

function scopesOverlap(left: AbsolutePath, right: AbsolutePath): boolean {
  const leftKey = scopeKey(left);
  const rightKey = scopeKey(right);
  return isWithinKey(leftKey, rightKey) || isWithinKey(rightKey, leftKey);
}

/** Canonical path-prefix form of a scope: the scope without its trailing slash (core's `resolvePrefix`). */
function scopeToPathPrefix(scope: AbsolutePath): AbsolutePath {
  return scope === "/" ? "/" : (scope.slice(0, -1) as AbsolutePath);
}

const REGISTRY_IDENTITY_FIELDS = ["appId", "serviceWorkerUrl", "manifestId", "manifestUrl"] as const;

function registryInvariants(registry: PwaOriginRegistry, at: readonly PropertyKey[] = []): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  const entries: { readonly entry: PwaRegistryEntry; readonly at: readonly PropertyKey[] }[] = [
    { entry: registry.root, at: [...at, "root"] },
    ...registry.children.map((entry, index) => ({ entry, at: [...at, "children", index] })),
  ];

  registry.children.forEach((child, index) => {
    if (!isStrictlyWithinScope(child.scope, registry.root.scope)) {
      findings.push(diagnostic("registry.child-outside-root", [...at, "children", index, "scope"]));
    }
  });

  for (let left = 0; left < registry.children.length; left += 1) {
    for (let right = left + 1; right < registry.children.length; right += 1) {
      if (scopesOverlap(registry.children[left]!.scope, registry.children[right]!.scope)) {
        findings.push(diagnostic("registry.scope-overlap", [...at, "children", right, "scope"]));
      }
    }
  }

  for (const field of REGISTRY_IDENTITY_FIELDS) {
    const seen = new Set<string>();
    for (const { entry, at: entryAt } of entries) {
      const value = entry[field];
      if (seen.has(value)) findings.push(diagnostic("registry.duplicate-identity-field", [...entryAt, field]));
      else seen.add(value);
    }
  }

  for (const { entry, at: entryAt } of entries) {
    const ownScopeKey = scopeKey(entry.scope);
    if (!isWithinKey(decodedPathKey(entry.serviceWorkerUrl), ownScopeKey)) {
      findings.push(diagnostic("registry.entry-url-outside-scope", [...entryAt, "serviceWorkerUrl"]));
    }
    if (!isWithinKey(decodedPathKey(entry.manifestUrl), ownScopeKey)) {
      findings.push(diagnostic("registry.entry-url-outside-scope", [...entryAt, "manifestUrl"]));
    }
  }

  const rootServiceWorkerKey = decodedPathKey(registry.root.serviceWorkerUrl);
  const rootManifestKey = decodedPathKey(registry.root.manifestUrl);
  if (registry.children.some((child) => isWithinKey(rootServiceWorkerKey, scopeKey(child.scope)))) {
    findings.push(diagnostic("registry.root-url-in-child-scope", [...at, "root", "serviceWorkerUrl"]));
  }
  if (registry.children.some((child) => isWithinKey(rootManifestKey, scopeKey(child.scope)))) {
    findings.push(diagnostic("registry.root-url-in-child-scope", [...at, "root", "manifestUrl"]));
  }

  // `appCachePrefix` encodes appId and environment with a separator `encodeURIComponent` always
  // escapes, so distinct appIds always yield distinct prefixes: this can only fire alongside
  // `registry.duplicate-identity-field` for the same entries. Kept as an explicit contract check
  // rather than relying on that being an implementation detail of the cache namespace encoding.
  const seenPrefixes = new Set<string>();
  for (const { entry, at: entryAt } of entries) {
    const prefix = appCachePrefix({ appId: entry.appId, environment: registry.environment });
    if (seenPrefixes.has(prefix)) findings.push(diagnostic("registry.cache-prefix-collision", [...entryAt, "appId"]));
    else seenPrefixes.add(prefix);
  }

  return findings;
}

function matchesRegistryEntry(entry: PwaRegistryEntry, identity: PwaIdentity): boolean {
  return (
    entry.appId === identity.appId &&
    entry.scope === identity.scope &&
    entry.serviceWorkerUrl === identity.serviceWorkerUrl &&
    entry.manifestId === identity.manifestId &&
    entry.manifestUrl === identity.manifestUrl
  );
}

function sharedOriginPlanInvariants(plan: PwaPlan, registry: PwaOriginRegistry): PwaDiagnostic[] {
  const identity = plan.identity;
  const matches = [registry.root, ...registry.children].filter((entry) => matchesRegistryEntry(entry, identity));
  if (registry.origin !== identity.origin || registry.environment !== identity.environment || matches.length !== 1) {
    return [diagnostic("plan.registry-identity-mismatch", ["topology", "registry"])];
  }

  const isRoot = matchesRegistryEntry(registry.root, identity);
  const excludePrefixes = new Set(
    plan.pathRules.filter((rule) => rule.action === "exclude").map((rule) => rule.pathPrefix),
  );

  if (isRoot) {
    const childPrefixes = new Set(registry.children.map((child) => scopeToPathPrefix(child.scope)));
    const matchesChildren =
      childPrefixes.size === excludePrefixes.size && [...childPrefixes].every((prefix) => excludePrefixes.has(prefix));
    const findings: PwaDiagnostic[] = matchesChildren ? [] : [diagnostic("plan.exclude-rules-mismatch", ["pathRules"])];
    findings.push(...rootChildScopeInvariants(plan, registry));
    return findings;
  }

  return excludePrefixes.size === 0 ? [] : [diagnostic("plan.exclude-rules-mismatch", ["pathRules"])];
}

/**
 * A root plan's own content must never reach into a child scope (ADR-0019): a hand-built plan, or one a
 * future compiler produces, could otherwise leak a child's precache entries, offline page or install
 * start URL to the wrong worker. Core already prevents every one of these at compile time
 * (`compile.host-file-in-child-scope`, `compile.offline-fallback-in-child-scope`,
 * `compile.start-url-in-child-scope`), so a correctly compiled plan never trips these checks; they are
 * a plan-level backstop that holds regardless of how the plan was produced.
 */
function rootChildScopeInvariants(plan: PwaPlan, registry: PwaOriginRegistry): PwaDiagnostic[] {
  const childKeys = registry.children.map((child) => scopeKey(child.scope));
  const inChildScope = (path: AbsolutePath): boolean => {
    const key = decodedPathKey(path);
    return childKeys.some((childKey) => isWithinKey(key, childKey));
  };

  const findings: PwaDiagnostic[] = [];
  plan.precache.forEach((entry, index) => {
    if (inChildScope(entry.url)) findings.push(diagnostic("plan.precache-in-child-scope", ["precache", index, "url"]));
  });
  if (plan.offlineFallback.enabled && inChildScope(plan.offlineFallback.path)) {
    findings.push(diagnostic("plan.offline-fallback-in-child-scope", ["offlineFallback", "path"]));
  }
  if (plan.install !== null && inChildScope(plan.install.startUrl)) {
    findings.push(diagnostic("plan.start-url-in-child-scope", ["install", "startUrl"]));
  }
  // Shortcuts follow the start URL's rule (ADR-0037): a root app's shortcut must not open a child's page.
  plan.install?.shortcuts?.forEach((shortcut, index) => {
    if (inChildScope(shortcut.url)) {
      findings.push(diagnostic("plan.shortcut-url-in-child-scope", ["install", "shortcuts", index, "url"]));
    }
  });
  return findings;
}

function excludeRuleInvariants(pathRules: readonly PwaPathRule[]): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  let sawNonExclude = false;
  pathRules.forEach((rule, index) => {
    if (rule.action !== "exclude") {
      sawNonExclude = true;
      return;
    }
    if (sawNonExclude) findings.push(diagnostic("plan.exclude-not-first", ["pathRules", index, "action"]));
    if (rule.source !== "platform" || rule.resourceClass !== "unclassified") {
      findings.push(diagnostic("plan.exclude-rules-mismatch", ["pathRules", index]));
    }
  });
  return findings;
}

function planInvariants(plan: PwaPlan): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [
    ...identityInvariants(plan.identity, ["identity"]),
    ...(plan.install ? installInvariants(plan.install, plan.identity, ["install"]) : []),
    ...(plan.cacheNamespace.prefix === cacheNamespacePrefix(plan.identity)
      ? []
      : [diagnostic("plan.cache-namespace-mismatch", ["cacheNamespace", "prefix"])]),
    ...(plan.requestBaselineDenials.length === REQUEST_BASELINE_DENIALS.length &&
    plan.requestBaselineDenials.every((denial, index) => denial === REQUEST_BASELINE_DENIALS[index])
      ? []
      : [diagnostic("plan.incomplete-baseline-denials", ["requestBaselineDenials"])]),
    ...plan.pathRules.flatMap((rule, index) =>
      rule.action !== "deny" &&
      rule.action !== "exclude" &&
      rule.action !== "none" &&
      !CACHEABLE_CLASSES.has(rule.resourceClass)
        ? [diagnostic("policy.unsafe-cache-strategy", ["pathRules", index, "action"])]
        : [],
    ),
    ...excludeRuleInvariants(plan.pathRules),
  ];

  if (plan.topology.kind === "shared-origin") {
    findings.push(...registryInvariants(plan.topology.registry, ["topology", "registry"]));
    findings.push(...sharedOriginPlanInvariants(plan, plan.topology.registry));
  } else {
    findings.push(
      ...plan.pathRules.flatMap((rule, index) =>
        rule.action === "exclude" ? [diagnostic("plan.exclude-rules-mismatch", ["pathRules", index, "action"])] : [],
      ),
    );
  }

  if ((plan.schemaVersion === 2 || plan.schemaVersion === 3) && plan.offlineWrites.enabled) {
    findings.push(...offlineWritePlanInvariants(plan, plan.offlineWrites));
  }

  return findings;
}

function offlineWritePlanInvariants(
  plan: PwaPlanV2 | PwaPlanV3,
  offlineWrites: Extract<PwaPlanV2["offlineWrites"], { readonly enabled: true }>,
): PwaDiagnostic[] {
  const findings: PwaDiagnostic[] = [];
  const databaseName = `pwa-offline-write:${encodeURIComponent(plan.identity.appId)}:${encodeURIComponent(plan.identity.environment)}:${encodeURIComponent(plan.identity.cacheNamespaceSeed)}`;
  if (offlineWrites.databaseName !== databaseName) {
    findings.push(diagnostic("plan.offline-write-database-mismatch", ["offlineWrites", "databaseName"]));
  }

  const targetIds = new Set<string>();
  const targetPaths = new Set<string>();
  const scope = scopeKey(plan.identity.scope);
  for (const [index, target] of offlineWrites.targets.entries()) {
    const targetKey = decodedPathKey(target.pathPrefix);
    if (targetIds.has(target.id)) {
      findings.push(diagnostic("plan.offline-write-duplicate-target-id", ["offlineWrites", "targets", index, "id"]));
    }
    if (targetPaths.has(targetKey)) {
      findings.push(diagnostic("plan.offline-write-duplicate-target-path", ["offlineWrites", "targets", index, "pathPrefix"]));
    }
    const matched = plan.pathRules.find((rule) => isWithinKey(targetKey, decodedPathKey(rule.pathPrefix)));
    if (!isWithinKey(targetKey, scope) || matched?.resourceClass !== "mutation" || matched.action !== "deny") {
      findings.push(diagnostic("plan.offline-write-target-invalid", ["offlineWrites", "targets", index, "pathPrefix"]));
    }
    targetIds.add(target.id);
    targetPaths.add(targetKey);
  }
  return findings;
}

export function validateIdentity(input: unknown): PwaValidationResult<PwaIdentity> {
  return validate<PwaIdentity>(input, getSchemas().identity, (identity) => identityInvariants(identity));
}

/** `identity` must already be a validated identity; install URLs are checked against its scope. */
export function validateInstallMetadata(
  input: unknown,
  identity: PwaIdentity,
): PwaValidationResult<PwaInstallMetadata> {
  return validate<PwaInstallMetadata>(input, getSchemas().install, (install) => installInvariants(install, identity));
}

export function validatePolicy(input: unknown): PwaValidationResult<PwaPolicy> {
  return validate<PwaPolicy>(input, getSchemas().policy, policyInvariants, true);
}

export function validatePlan(input: unknown): PwaValidationResult<PwaPlan> {
  return validate<PwaPlan>(input, getSchemas().plan, planInvariants);
}

export function validateOriginRegistry(input: unknown): PwaValidationResult<PwaOriginRegistry> {
  return validate<PwaOriginRegistry>(input, getSchemas().registry, (registry) => registryInvariants(registry));
}
