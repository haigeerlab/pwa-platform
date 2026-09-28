// Which build-verifier checks this tool must run for a given plan's topology (see the release runbook's
// "发布门禁" table). Pure: the plan already carries its topology, so no I/O is needed to answer this.
import { isSharedOriginChild, requiredReleaseChecks, type PwaVerificationCheckName } from "@pwa-platform/build-verifier";
import type { PwaPlan } from "@pwa-platform/contracts";

/**
 * Picks the required checks for `plan`'s topology.
 *
 * The set itself comes from build-verifier's `requiredReleaseChecks` (ADR-0025 addendum), so this tool cannot drift
 * from the protocol's definition (review risk R4). A standalone origin and a shared-origin root both need the same
 * five checks.
 *
 * A shared-origin child additionally needs `release-order`, which can only be verified against the root plan
 * actually deployed on the origin (ADR-0019). This tool only ever observes the single registered test target it was
 * pointed at and never supplies a deployed root plan for another app, so a child plan is rejected outright rather
 * than silently skipping a required check.
 */
export function requiredChecksFor(plan: PwaPlan): readonly PwaVerificationCheckName[] {
  if (isSharedOriginChild(plan)) {
    throw new Error(
      "release-verifier does not support a shared-origin child plan: verifying release-order needs the deployed " +
        "root plan, and this tool never supplies one",
    );
  }
  return requiredReleaseChecks(plan);
}
