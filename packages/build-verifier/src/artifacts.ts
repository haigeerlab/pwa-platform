// Does the build actually contain what the plan promises? The compiler works from a file manifest it was handed;
// only here does anyone compare the plan against the paths a build really published.
import { DIAGNOSTIC_MESSAGES, type PwaContractPath, type PwaDiagnostic, type PwaPlan } from "@pwa-platform/contracts";
import { check, type PwaVerificationCheck } from "./report.js";

/**
 * Compares `plan.precache` and the identity's worker and manifest paths against the paths a build published.
 *
 * Paths are compared verbatim: a difference in case or percent-encoding is a real difference, because that is what
 * the browser will request. Extra published files are not reported — a build producing more than the plan
 * precaches is normal.
 *
 * Throws for a `published` list that is not made of absolute paths; that is a caller mistake, not a release
 * finding, and reporting it as "everything is missing" would read like a deployment failure.
 */
export function verifyArtifacts(plan: PwaPlan, published: readonly string[]): PwaVerificationCheck {
  for (const path of published) {
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new TypeError("Published artifact paths must be absolute and start with a slash");
    }
  }

  const available = new Set(published);
  const diagnostics: PwaDiagnostic[] = [];

  plan.precache.forEach((entry, index) => {
    if (!available.has(entry.url)) diagnostics.push(missing("verify.artifact-missing", `/precache/${index}/url`));
  });

  // The worker and the manifest are addressed by the identity, not by the precache list: a page loads them from
  // exactly these paths, so publishing them elsewhere breaks registration rather than caching.
  for (const field of ["serviceWorkerUrl", "manifestUrl"] as const) {
    if (!available.has(plan.identity[field])) {
      diagnostics.push(missing("verify.artifact-path-mismatch", `/identity/${field}`));
    }
  }

  // Screenshots and shortcut icons are manifest references, not precache entries: Chrome fetches them directly
  // from the manifest, so a missing file breaks install UI rather than offline caching. `icons` is deliberately
  // not checked here — see the known-limitation note in spec/build-verifier.md.
  if (plan.install !== null) {
    plan.install.screenshots?.forEach((screenshot, index) => {
      if (!available.has(screenshot.src)) {
        diagnostics.push(missing("verify.manifest-asset-missing", `/install/screenshots/${index}/src`));
      }
    });

    plan.install.shortcuts?.forEach((shortcut, shortcutIndex) => {
      shortcut.icons?.forEach((icon, iconIndex) => {
        if (!available.has(icon.src)) {
          diagnostics.push(
            missing("verify.manifest-asset-missing", `/install/shortcuts/${shortcutIndex}/icons/${iconIndex}/src`),
          );
        }
      });
    });
  }

  return check("artifacts", diagnostics);
}

/** Diagnostics name the field, never the path that was missing: messages must not echo input. */
function missing(
  code: "verify.artifact-missing" | "verify.artifact-path-mismatch" | "verify.manifest-asset-missing",
  path: PwaContractPath,
): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
