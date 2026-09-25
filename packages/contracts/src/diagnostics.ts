export const DIAGNOSTIC_SEVERITIES = ["error", "warning"] as const;

export type PwaDiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_CODES = [
  "schema.invalid-type",
  "schema.invalid-value",
  "schema.missing-field",
  "schema.unknown-field",
  "schema.unsupported-version",
  "value.not-serializable",
  "path.invalid",
  "extensions.invalid-namespace",
  "identity.invalid-origin",
  "identity.invalid-environment",
  "identity.scope-excludes-mount-path",
  "identity.service-worker-outside-scope",
  "identity.manifest-outside-scope",
  "install.start-url-outside-scope",
  "install.missing-icon-variant",
  "install.invalid-color",
  "install.shortcut-url-outside-scope",
  "install.screenshot-size-out-of-range",
  "install.screenshot-aspect-ratio",
  "install.screenshot-aspect-mismatch",
  "install.screenshot-count",
  "install.screenshot-no-wide",
  "install.description-too-long",
  "policy.identity-override",
  "policy.unsafe-cache-strategy",
  "offline-write.disabled-configuration",
  "offline-write.enabled-configuration",
  "offline-write.target-required",
  "offline-write.duplicate-target-id",
  "offline-write.duplicate-target-path",
  "runtime-cache.disabled-configuration",
  "runtime-cache.enabled-configuration",
  "plan.incomplete-baseline-denials",
  "plan.cache-namespace-mismatch",
  "plan.offline-write-database-mismatch",
  "plan.offline-write-target-invalid",
  "plan.offline-write-duplicate-target-id",
  "plan.offline-write-duplicate-target-path",
  "compile.invalid-host-output",
  "compile.unsupported-topology",
  "compile.public-path-outside-scope",
  "compile.duplicate-path-prefix",
  "compile.allow-under-deny",
  "compile.install-metadata-missing",
  "compile.offline-fallback-not-built",
  "compile.offline-fallback-denied",
  "compile.asset-rule-unmatched",
  "compile.offline-write-target-invalid",
  "compile.runtime-strategy-unsupported",
  "compile.runtime-cache-unused",
  "verify.artifact-missing",
  "verify.artifact-path-mismatch",
  "verify.manifest-asset-missing",
  "verify.header-missing-directive",
  "verify.header-forbidden-directive",
  "verify.header-unreadable",
  "verify.baseline-invalid",
  "verify.baseline-missing",
  "verify.baseline-mismatch",
  "registry.child-outside-root",
  "registry.scope-overlap",
  "registry.duplicate-identity-field",
  "registry.entry-url-outside-scope",
  "registry.root-url-in-child-scope",
  "registry.cache-prefix-collision",
  "plan.registry-identity-mismatch",
  "plan.exclude-rules-mismatch",
  "plan.exclude-not-first",
  "compile.policy-rule-in-child-scope",
  "compile.offline-fallback-in-child-scope",
  "compile.host-file-in-child-scope",
  "compile.start-url-in-child-scope",
  "compile.shortcut-url-in-child-scope",
  "verify.root-plan-not-shared-origin",
  "verify.root-plan-missing-exclude",
  "verify.root-registry-older",
  "verify.root-registry-child-mismatch",
  "verify.root-registry-diverged",
  "verify.retention-history-invalid",
  "verify.retention-missing",
  "plan.precache-in-child-scope",
  "plan.offline-fallback-in-child-scope",
  "plan.start-url-in-child-scope",
  "plan.shortcut-url-in-child-scope",
] as const;

export type PwaDiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

/** Platform-authored message for every code; messages never contain input text. */
export const DIAGNOSTIC_MESSAGES: Readonly<Record<PwaDiagnosticCode, string>> = Object.freeze({
  "schema.invalid-type": "Value has the wrong type.",
  "schema.invalid-value": "Value is not allowed here.",
  "schema.missing-field": "Required field is missing.",
  "schema.unknown-field": "Object contains a field that is not part of the contract.",
  "schema.unsupported-version": "Version is not supported by this contract.",
  "value.not-serializable": "Value is not plain JSON data.",
  "path.invalid": "Path is not in canonical form.",
  "extensions.invalid-namespace": "Extension keys must be namespaced, for example vendor.feature.",
  "identity.invalid-origin": "Origin must use HTTPS, or HTTP on a loopback host.",
  "identity.invalid-environment": "Environment must be a lowercase slug.",
  "identity.scope-excludes-mount-path": "Scope does not contain the mount path.",
  "identity.service-worker-outside-scope": "Service worker URL is outside the scope.",
  "identity.manifest-outside-scope": "Manifest URL is outside the scope.",
  "install.start-url-outside-scope": "Start URL is outside the identity scope.",
  "install.missing-icon-variant": "A required icon variant is missing.",
  "install.invalid-color": "Color is not a hex color and cannot be verified.",
  "install.shortcut-url-outside-scope": "Shortcut URL is outside the identity scope.",
  "install.screenshot-size-out-of-range": "Screenshot size is outside the 320-3840 pixel range Chrome prefers.",
  "install.screenshot-aspect-ratio": "Screenshot's long edge is more than 2.3 times its short edge.",
  "install.screenshot-aspect-mismatch": "Screenshots sharing a form factor do not share an aspect ratio.",
  "install.screenshot-count": "Form factor has more screenshots than Chrome will display.",
  "install.screenshot-no-wide": "No wide screenshot is present, so Chrome will not show screenshots on desktop.",
  "install.description-too-long": "Description is longer than 324 characters.",
  "policy.identity-override": "Policy cannot set platform-owned identity fields.",
  "policy.unsafe-cache-strategy": "Only public GET resource classes may use a caching strategy.",
  "offline-write.disabled-configuration": "Disabled offline writes must not retain limits or targets.",
  "offline-write.enabled-configuration": "Enabled offline writes require positive queue limits.",
  "offline-write.target-required": "Enabled offline writes require at least one target.",
  "offline-write.duplicate-target-id": "Offline write target IDs must be unique.",
  "offline-write.duplicate-target-path": "Offline write target paths must be unique after URL decoding.",
  "runtime-cache.disabled-configuration": "Disabled runtime cache must not retain limits.",
  "runtime-cache.enabled-configuration": "Enabled runtime cache requires a positive limit for this field.",
  "plan.incomplete-baseline-denials":
    "Plan must list every platform baseline denial exactly once, in canonical order.",
  "plan.cache-namespace-mismatch": "Cache namespace prefix does not match the prefix derived from the identity.",
  "plan.offline-write-database-mismatch": "Offline write database name does not match the identity-derived name.",
  "plan.offline-write-target-invalid": "Offline write target is outside the scope or not covered by a mutation rule.",
  "plan.offline-write-duplicate-target-id": "Offline write plan target IDs must be unique.",
  "plan.offline-write-duplicate-target-path": "Offline write plan target paths must be unique after URL decoding.",
  "compile.invalid-host-output": "Host build output is not a valid file manifest.",
  "compile.unsupported-topology": "Deployment topology is not supported by this compiler.",
  "compile.public-path-outside-scope": "Host public path is outside the identity scope.",
  "compile.duplicate-path-prefix": "Path prefix is declared more than once after URL decoding.",
  "compile.allow-under-deny": "An allow rule is covered by a deny rule's path prefix.",
  "compile.install-metadata-missing": "Install is enabled but no install metadata was provided.",
  "compile.offline-fallback-not-built": "Offline fallback path is not a host build output file.",
  "compile.offline-fallback-denied": "Offline fallback path is covered by a deny rule.",
  "compile.asset-rule-unmatched": "Asset rule does not cover any host build output file.",
  "compile.offline-write-target-invalid": "Offline write target is not covered by a mutation rule.",
  "compile.runtime-strategy-unsupported": "This resource class does not support the given runtime cache strategy.",
  "compile.runtime-cache-unused": "Runtime cache is enabled but no resource rule can execute it.",
  "verify.artifact-missing": "Precache entry is not among the published artifacts.",
  "verify.artifact-path-mismatch": "Worker or manifest is not published at the path the identity declares.",
  "verify.manifest-asset-missing": "A manifest screenshot or shortcut icon is not among the published artifacts.",
  "verify.header-missing-directive": "Response is missing a Cache-Control directive the release baseline requires.",
  "verify.header-forbidden-directive": "Response carries a Cache-Control directive the release baseline forbids.",
  "verify.header-unreadable": "No observed response headers were supplied for a path that must be checked.",
  "verify.baseline-invalid": "Stored release baseline is not a valid identity.",
  "verify.baseline-missing": "No release baseline was supplied for the comparison.",
  "verify.baseline-mismatch": "Candidate identity differs from the slot's release baseline.",
  "registry.child-outside-root": "Child scope is not strictly within the root scope.",
  "registry.scope-overlap": "Child scopes overlap or are nested within each other.",
  "registry.duplicate-identity-field": "Registry entries do not have pairwise distinct identity fields.",
  "registry.entry-url-outside-scope": "Service worker or manifest URL is outside the entry's own scope.",
  "registry.root-url-in-child-scope": "Root service worker or manifest URL falls inside a child scope.",
  "registry.cache-prefix-collision": "Cache namespace prefix is not unique across registry entries.",
  "plan.registry-identity-mismatch":
    "Plan identity does not match exactly one registry entry, or the registry origin or environment differs from the identity.",
  "plan.exclude-rules-mismatch": "Exclude path rules do not match what this plan's role in the registry requires.",
  "plan.exclude-not-first": "An exclude rule does not precede every non-exclude rule.",
  "compile.policy-rule-in-child-scope": "A policy rule falls inside a child scope owned by another application.",
  "compile.offline-fallback-in-child-scope":
    "Offline fallback path falls inside a child scope owned by another application.",
  "compile.host-file-in-child-scope":
    "Host build output contains a file inside a child scope owned by another application.",
  "compile.start-url-in-child-scope": "Install start URL falls inside a child scope owned by another application.",
  "compile.shortcut-url-in-child-scope": "Shortcut URL falls inside a child scope owned by another application.",
  "verify.root-plan-not-shared-origin":
    "Deployed root plan does not use the shared-origin topology, or its origin or environment differs.",
  "verify.root-plan-missing-exclude": "Deployed root plan has no exclude rule covering this child's scope.",
  "verify.root-registry-older": "Deployed root plan's registry version is older than this plan's registry version.",
  "verify.root-registry-child-mismatch": "Deployed root plan's registry has no entry matching this child's identity.",
  "verify.root-registry-diverged":
    "Deployed root plan and this plan carry the same registry version but different registries.",
  "verify.retention-history-invalid": "Release history cannot establish a valid retention line.",
  "verify.retention-missing": "A fingerprinted asset required by the retention window is unavailable.",
  "plan.precache-in-child-scope": "Precache entry falls inside a child scope owned by another application.",
  "plan.offline-fallback-in-child-scope":
    "Offline fallback path falls inside a child scope owned by another application.",
  "plan.start-url-in-child-scope": "Install start URL falls inside a child scope owned by another application.",
  "plan.shortcut-url-in-child-scope": "Shortcut URL falls inside a child scope owned by another application.",
});

/** JSON Pointer (RFC 6901) into the validated input; `""` addresses the root. */
export type PwaContractPath = "" | `/${string}`;

/**
 * Machine-readable validation finding. `message` is platform-authored text and must never
 * echo input values, auth state, push subscriptions, response bodies or tokens.
 */
export type PwaDiagnostic = {
  readonly code: PwaDiagnosticCode;
  readonly severity: PwaDiagnosticSeverity;
  readonly path: PwaContractPath;
  readonly message: string;
};

export type PwaWarningDiagnostic = {
  readonly code: PwaDiagnosticCode;
  readonly severity: "warning";
  readonly path: PwaContractPath;
  readonly message: string;
};

export type PwaValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics: readonly PwaWarningDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly [PwaDiagnostic, ...PwaDiagnostic[]];
    };
