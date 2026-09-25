// Does the deployment return the Cache-Control the release baseline requires for public HTML? `response-headers`
// only judges the worker, the manifest and fingerprinted assets; public HTML has no field of its own on the plan,
// so this check derives its paths from the fields that name one (spec's "修订：公开 HTML 响应头检查").
import type { PwaContractPath, PwaDiagnostic, PwaPlan } from "@pwa-platform/contracts";
import { REVALIDATED, judgeCacheControl, type PwaObservedResponses } from "./headers.js";
import { check, type PwaVerificationCheck } from "./report.js";

/**
 * Judges the `Cache-Control` of every public HTML path the plan names, under the same rule and the same
 * directive parser `response-headers` uses for the worker and the manifest (both must revalidate).
 *
 * Paths, in this order: the mount path; the install start URL, when the plan carries install metadata; the
 * offline fallback page, when enabled; and every precache entry with a revision that ends in `.html` — a
 * fingerprinted (`revision: null`) `.html` entry belongs to `response-headers` instead, because its URL changes
 * with its content. A path named by more than one field is judged once, under the first field that names it.
 *
 * There is no "private HTML" marker in the plan's resource classification, so private HTML stays outside this
 * check and continues to need manual review.
 */
export function verifyHtmlHeaders(plan: PwaPlan, observed: PwaObservedResponses): PwaVerificationCheck {
  const diagnostics: PwaDiagnostic[] = [];
  const seen = new Set<string>();

  judge(plan.identity.mountPath, "/identity/mountPath");
  if (plan.install !== null) judge(plan.install.startUrl, "/install/startUrl");
  if (plan.offlineFallback.enabled) judge(plan.offlineFallback.path, "/offlineFallback/path");
  plan.precache.forEach((entry, index) => {
    if (entry.revision !== null && entry.url.endsWith(".html")) judge(entry.url, `/precache/${index}/url`);
  });

  return check("html-headers", diagnostics);

  function judge(path: string, at: PwaContractPath): void {
    if (seen.has(path)) return;
    seen.add(path);
    diagnostics.push(...judgeCacheControl(observed, path, REVALIDATED, at));
  }
}
