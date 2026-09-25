// The module's options, validated when Nuxt loads the module rather than when the build runs: a misspelled origin
// should fail while the developer is looking at nuxt.config, not many steps into `nitro:build:public-assets` (T6).
//
// Mirrors packages/vite/src/options.ts's approach, minus a topology option: this module's topology is fixed to
// "standalone-origin" internally (the only kind contracts defines), never something the application can pass in.
import {
  validateIdentity,
  validateInstallMetadata,
  validatePolicy,
  type PwaDiagnostic,
  type PwaIdentity,
  type PwaInstallMetadata,
  type PwaPolicy,
  type PwaValidationResult,
} from "@pwa-platform/contracts";

export type PwaNuxtOptions = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  /** `null` when the app does not offer installation. */
  readonly install: PwaInstallMetadata | null;
  /**
   * Build-time switch for a recovery release (T7b, spec decision 19): when `true`, the artifact pipeline
   * (artifacts.ts) writes the recovery worker's content to the identity's own service worker path instead of the
   * platform worker's — a real Nitro `node-server` deployment cannot publish the recovery worker by renaming a
   * file after the build (T7 record), so recovering means rebuilding with this on. Defaults to `false`.
   */
  readonly recoveryRelease?: boolean;
};

/** The same fields, each already checked. `compilePlan` (T6) still validates everything again at build time. */
export type PwaNuxtValidatedOptions = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  readonly install: PwaInstallMetadata | null;
  readonly recoveryRelease: boolean;
};

/**
 * Validates the module's options, throwing for anything the platform would reject later.
 *
 * Messages name diagnostic codes and contract paths only. An option's value can be an origin, a scope or an app id,
 * and build logs are routinely pasted into issues — so nothing from the input is echoed back. A `pwaPlatform` key
 * missing entirely from `nuxt.config` (Nuxt then hands the module an empty object) is called out on its own, since
 * "identity is not valid" would otherwise be the only symptom of a key that was never set.
 */
export function validateOptions(options: unknown): PwaNuxtValidatedOptions {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(missingConfigMessage());
  }

  const record = options as Partial<Record<keyof PwaNuxtOptions, unknown>>;
  if (!("identity" in record) && !("policy" in record) && !("install" in record)) {
    throw new TypeError(missingConfigMessage());
  }

  const identity = take("identity", validateIdentity(record.identity));
  const policy = take("policy", validatePolicy(record.policy));
  const install = record.install === null || record.install === undefined ? null : take("install", validateInstallMetadata(record.install, identity));
  const recoveryRelease = validateRecoveryRelease(record.recoveryRelease);

  return { identity, policy, install, recoveryRelease };
}

/** Diagnostic code for a `recoveryRelease` value that is present but not a boolean. */
export const RECOVERY_RELEASE_INVALID_TYPE_CODE = "nuxt.recovery-release-invalid-type";

/** Strict boolean check, same convention as the other options: a code and a contract path, no value echo. */
function validateRecoveryRelease(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new TypeError(`${RECOVERY_RELEASE_INVALID_TYPE_CODE}: pwaPlatform.recoveryRelease must be a boolean, at /recoveryRelease`);
  }
  return value;
}

function missingConfigMessage(): string {
  return 'The pwaPlatform module requires an options object under the "pwaPlatform" key in nuxt.config, with identity, policy and install.';
}

function take<T>(field: string, result: PwaValidationResult<T>): T {
  if (result.ok) return result.value;
  throw new TypeError(`The pwaPlatform module's ${field} is not valid: ${describe(result.diagnostics, field)}`);
}

/** Prefixes each diagnostic path with the option it came from, the way compilePlan prefixes its own inputs. */
function describe(diagnostics: readonly PwaDiagnostic[], field: string): string {
  return diagnostics.map(({ code, path }) => `${code} at /${field}${path}`).join(", ");
}
