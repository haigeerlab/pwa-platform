// Which build-verifier checks this tool must run for a given plan's topology (see the release runbook's
// "发布门禁" table). Pure: the plan already carries its topology, so no I/O is needed to answer this.
import { isSharedOriginChild, type PwaVerificationCheckName } from "@pwa-platform/build-verifier";
import type { PwaPlan } from "@pwa-platform/contracts";

/** Standalone origin, and a shared-origin root, both run the same five checks (no `release-order` to run). */
const STANDALONE_OR_ROOT_CHECKS: readonly PwaVerificationCheckName[] = [
  "artifacts",
  "response-headers",
  "identity-baseline",
  "release-retention",
  "html-headers",
];

/**
 * Picks the required checks for `plan`'s topology.
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
  return STANDALONE_OR_ROOT_CHECKS;
}
