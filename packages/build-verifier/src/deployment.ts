import { DIAGNOSTIC_MESSAGES, type PwaContractPath, type PwaDiagnostic, type PwaPlanV4 } from "@pwa-platform/contracts";
import { check, type PwaVerificationCheck } from "./report.js";
import type { PwaObservedResponses } from "./headers.js";

/** The external orchestrator obtains these after following redirects on the actual deployment. */
export type PwaDeploymentResponse = {
  readonly finalUrl: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
};

export type PwaPortableDeploymentEvidence = {
  readonly targetOrigin: string;
  readonly responses: Readonly<Record<string, PwaDeploymentResponse>>;
};

export function isReleaseOrigin(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.origin === value && (url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
}

/** Every platform path must have a final response at the selected origin, including old retained assets. */
export function requiredDeploymentPaths(plan: PwaPlanV4, available: readonly string[] = []): readonly string[] {
  const paths = new Set<string>([
    plan.identity.serviceWorkerUrl,
    plan.identity.manifestUrl,
    `${plan.hostBuildOutput.publicPath}pwa-recovery-worker.js`,
    plan.identity.mountPath,
    ...plan.precache.map(({ url }) => url),
    ...(plan.install === null ? [] : [plan.install.startUrl]),
    ...(plan.offlineFallback.enabled ? [plan.offlineFallback.path] : []),
    ...available,
  ]);
  return [...paths];
}

export function verifyDeploymentOrigin(
  plan: PwaPlanV4,
  evidence: PwaPortableDeploymentEvidence | undefined,
  available: readonly string[] = [],
): PwaVerificationCheck {
  if (!evidence || !isReleaseOrigin(evidence.targetOrigin) || !evidence.responses || typeof evidence.responses !== "object") {
    return check("deployment-origin", [diagnostic("verify.deployment-origin-invalid", "/deployment/targetOrigin")]);
  }
  const diagnostics: PwaDiagnostic[] = [];
  for (const path of requiredDeploymentPaths(plan, available)) {
    const response = Object.hasOwn(evidence.responses, path) ? evidence.responses[path] : undefined;
    const at: PwaContractPath = "/deployment/responses";
    if (!response || typeof response.finalUrl !== "string" || !Number.isInteger(response.status) ||
      typeof response.headers !== "object" || response.headers === null) {
      diagnostics.push(diagnostic("verify.deployment-response-missing", at));
      continue;
    }
    if (!URL.canParse(response.finalUrl)) {
      diagnostics.push(diagnostic("verify.deployment-response-mismatch", at));
      continue;
    }
    const final = new URL(response.finalUrl);
    if (final.origin !== evidence.targetOrigin || final.pathname !== path || final.search !== "" || final.hash !== "") {
      diagnostics.push(diagnostic("verify.deployment-response-mismatch", at));
    }
    if (response.status !== 200) {
      diagnostics.push(diagnostic("verify.deployment-response-unsuccessful", at));
    }
  }
  return check("deployment-origin", diagnostics);
}

/** Only used after response provenance has been checked; header checks remain independent in the report. */
export function observedFromDeployment(evidence: PwaPortableDeploymentEvidence | undefined): PwaObservedResponses {
  if (!evidence || !evidence.responses || typeof evidence.responses !== "object") return {};
  return Object.fromEntries(Object.entries(evidence.responses).flatMap(([path, response]) =>
    response && typeof response.headers === "object" && response.headers !== null ? [[path, response.headers]] : [],
  ));
}

function diagnostic(code: "verify.deployment-origin-invalid" | "verify.deployment-response-missing" | "verify.deployment-response-mismatch" | "verify.deployment-response-unsuccessful", path: PwaContractPath): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
