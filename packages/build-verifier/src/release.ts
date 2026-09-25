// One report for a release: the checks a compiler cannot make, run in a fixed order and summed up.
import type { PwaPlan } from "@pwa-platform/contracts";
import { verifyArtifacts } from "./artifacts.js";
import { compareIdentityBaseline } from "./baseline.js";
import { verifyResponseHeaders, type PwaObservedResponses } from "./headers.js";
import { verifyHtmlHeaders } from "./html-headers.js";
import { isSharedOriginChild, verifyReleaseOrder } from "./release-order.js";
import { verifyReleaseRetention, type PwaReleaseRetentionInput } from "./release-retention.js";
import type { PwaVerificationCheck, PwaVerificationReport } from "./report.js";

export type PwaVerifyReleaseInput = {
  readonly plan: PwaPlan;
  /** Absolute paths the build published. Omit the property to skip the artifact check entirely. */
  readonly published?: readonly string[];
  /** Observed response headers by path. Omit the property to skip the header check entirely. */
  readonly observed?: PwaObservedResponses;
  /**
   * The slot's stored baseline, still unchecked.
   *
   * Omitting the property and passing `undefined` mean different things: omitting it skips the comparison, while
   * passing `undefined` (or `null`) says a lookup happened and found nothing, which is reported as
   * `verify.baseline-missing`. "We did not look" and "we looked and it is not there" are not the same fact, and a
   * release gate must be able to tell them apart.
   */
  readonly baseline?: unknown;
  /**
   * The plan of the root app currently deployed on this origin, read from the root's release record and still
   * unchecked (ADR-0019). Only consulted when `plan` is a shared-origin child: the check it drives confirms the root
   * already excludes this child's scope. Omit the property to skip the check; for any other plan it is ignored.
   */
  readonly deployedRootPlan?: unknown;
  /**
   * Current availability and prior release records for the fingerprinted-asset retention check (ADR-0024).
   *
   * As with `baseline`, omission means no check was performed. Presence means the caller attempted the check, so
   * an incomplete value is passed to the checker and reported rather than silently skipped.
   */
  readonly retention?: PwaReleaseRetentionInput | undefined;
  /**
   * Observed response headers for public HTML paths, by path. Omit the property to skip the `html-headers`
   * check entirely — the same "omission skips it" rule as `published` and `observed` above. Callers should
   * follow same-origin redirects when collecting HTML (e.g. `/app/offline.html` → `/app/offline`) and record the
   * final response's headers; this package only judges the headers it is given.
   */
  readonly htmlObserved?: PwaObservedResponses;
};

/**
 * Runs each check whose input was supplied, in the order `VERIFICATION_CHECKS` lists them.
 *
 * A check whose input was omitted does not appear in `checks` at all, so `ok` speaks only for what actually ran.
 * That makes an empty report `ok: true` — verifying nothing cannot fail. Callers that gate a release on this must
 * therefore confirm `checks` covers what they meant to verify; `ok` alone does not say anything was verified.
 */
export function verifyRelease(input: PwaVerifyReleaseInput): PwaVerificationReport {
  const checks: PwaVerificationCheck[] = [];

  if (input.published !== undefined) checks.push(verifyArtifacts(input.plan, input.published));
  if (input.observed !== undefined) checks.push(verifyResponseHeaders(input.plan, input.observed));
  // `hasOwn` rather than an undefined test: the absence of the property is what means "not compared".
  if (Object.hasOwn(input, "baseline")) {
    checks.push(compareIdentityBaseline(input.plan.identity, input.baseline));
  }
  // Same "omitted means not compared" rule as the baseline. Roots and standalone apps have no release order to check.
  if (Object.hasOwn(input, "deployedRootPlan") && isSharedOriginChild(input.plan)) {
    checks.push(verifyReleaseOrder(input.plan, input.deployedRootPlan));
  }
  if (Object.hasOwn(input, "retention")) {
    checks.push(verifyReleaseRetention(input.plan, input.retention as PwaReleaseRetentionInput));
  }
  // Runs after every other check, so a report follows VERIFICATION_CHECKS order regardless of input order.
  if (Object.hasOwn(input, "htmlObserved")) {
    checks.push(verifyHtmlHeaders(input.plan, input.htmlObserved as PwaObservedResponses));
  }

  return {
    ok: checks.every((entry) => entry.ok),
    checks,
    diagnostics: checks.flatMap((entry) => entry.diagnostics),
  };
}
