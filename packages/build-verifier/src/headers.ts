// Does the deployment return the Cache-Control the release baseline requires? The plan cannot answer this: the
// headers come from a CDN, not from the build. They are supplied by the caller, so this stays a pure function.
import { DIAGNOSTIC_MESSAGES, type PwaContractPath, type PwaDiagnostic, type PwaPlan } from "@pwa-platform/contracts";
import { hasDirective, parseCacheControl } from "./cache-control.js";
import { check, type PwaVerificationCheck } from "./report.js";

/** Observed response headers by absolute path; header names lower-cased, as every HTTP client reports them. */
export type PwaObservedResponses = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** What the release runbook's header baseline requires of one class of resource. */
export type HeaderRule = {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};

/**
 * The worker script and the manifest must revalidate, so a new version is picked up; fingerprinted assets may be
 * cached forever, because a change to them changes their URL. The runbook leaves the concrete `max-age` to the
 * infrastructure team, so the value is required to be positive rather than to be any particular length: `0` is
 * not one of the lengths that team might pick, it is the value that voids this line of the baseline, and
 * `max-age=0, immutable` is a common CDN misconfiguration.
 *
 * Exported so `html-headers` can judge public HTML against the exact same rule (and the exact same directive
 * parser below), rather than a second copy of either.
 */
export const REVALIDATED: HeaderRule = { include: ["no-cache"], exclude: ["immutable"] };
const FINGERPRINTED: HeaderRule = { include: ["immutable", "max-age=+"], exclude: ["no-cache", "no-store"] };

/**
 * Judges the `Cache-Control` of the worker, the manifest and every fingerprinted precache entry.
 *
 * A directive the baseline neither requires nor forbids is ignored, so a deployment may add its own without
 * failing. Paths with no observed response are reported rather than skipped: a check that silently passes what it
 * never looked at is worse than no check.
 */
export function verifyResponseHeaders(plan: PwaPlan, observed: PwaObservedResponses): PwaVerificationCheck {
  const diagnostics: PwaDiagnostic[] = [];

  judge(plan.identity.serviceWorkerUrl, REVALIDATED, "/identity/serviceWorkerUrl");
  judge(plan.identity.manifestUrl, REVALIDATED, "/identity/manifestUrl");
  plan.precache.forEach((entry, index) => {
    // `revision === null` is how the compiler records a fingerprinted file (core's precache.ts): its URL changes
    // whenever its content does, which is exactly what makes immutable caching safe.
    if (entry.revision === null) judge(entry.url, FINGERPRINTED, `/precache/${index}/url`);
  });

  return check("response-headers", diagnostics);

  function judge(path: string, rule: HeaderRule, at: PwaContractPath): void {
    diagnostics.push(...judgeCacheControl(observed, path, rule, at));
  }
}

/**
 * Judges one path's observed `Cache-Control` against `rule`, returning the diagnostics it produced (none when it
 * meets the rule). Shared by `response-headers` and `html-headers`, so both checks parse and judge headers
 * identically; only which paths they look at, and under which rule, differs.
 */
export function judgeCacheControl(
  observed: PwaObservedResponses,
  path: string,
  rule: HeaderRule,
  at: PwaContractPath,
): readonly PwaDiagnostic[] {
  const headers = Object.hasOwn(observed, path) ? observed[path] : undefined;
  if (headers === undefined) return [diagnostic("verify.header-unreadable", at)];

  const diagnostics: PwaDiagnostic[] = [];
  const directives = parseCacheControl(headers["cache-control"]);
  for (const wanted of rule.include) {
    if (!hasDirective(directives, wanted)) diagnostics.push(diagnostic("verify.header-missing-directive", at));
  }
  for (const forbidden of rule.exclude) {
    if (hasDirective(directives, forbidden)) diagnostics.push(diagnostic("verify.header-forbidden-directive", at));
  }
  return diagnostics;
}

/** Diagnostics point at the plan field, never at the header that was observed. */
function diagnostic(
  code: "verify.header-missing-directive" | "verify.header-forbidden-directive" | "verify.header-unreadable",
  path: PwaContractPath,
): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
