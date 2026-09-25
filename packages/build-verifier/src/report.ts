// The shape every check reports in. Diagnostics are contracts' own `PwaDiagnostic`, so a verification report can be
// consumed alongside validation and compilation findings rather than through a second diagnostic system.
import type { PwaDiagnostic } from "@pwa-platform/contracts";

/** The checks this package performs, in the order `verifyRelease` runs them. */
export const VERIFICATION_CHECKS = [
  "artifacts",
  "response-headers",
  "identity-baseline",
  "release-order",
  "release-retention",
  "html-headers",
] as const;

export type PwaVerificationCheckName = (typeof VERIFICATION_CHECKS)[number];

export type PwaVerificationCheck = {
  readonly name: PwaVerificationCheckName;
  readonly ok: boolean;
  readonly diagnostics: readonly PwaDiagnostic[];
};

export type PwaVerificationReport = {
  /** True when every check that actually ran passed. Checks whose input was omitted are not represented. */
  readonly ok: boolean;
  readonly checks: readonly PwaVerificationCheck[];
  /** Every check's diagnostics, concatenated in check order. */
  readonly diagnostics: readonly PwaDiagnostic[];
};

/** Builds a check result with its fields in canonical order, so reports diff cleanly. */
export function check(name: PwaVerificationCheckName, diagnostics: readonly PwaDiagnostic[]): PwaVerificationCheck {
  return { name, ok: diagnostics.length === 0, diagnostics: [...diagnostics] };
}
