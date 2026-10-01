import { DIAGNOSTIC_MESSAGES, type PwaDiagnostic, type PwaPlan } from "@pwa-platform/contracts";
import type { PwaObservedResponses } from "./headers.js";
import { check, type PwaVerificationCheck } from "./report.js";

// MIME Sniffing Standard: JavaScript MIME type essences. Parameters do not change the essence.
const JAVASCRIPT_MIME = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

/** Judges only the main worker script's observed Content-Type, independently of the Cache-Control baseline. */
export function verifyWorkerScriptMime(plan: PwaPlan, observed: PwaObservedResponses): PwaVerificationCheck {
  const path = plan.identity.serviceWorkerUrl;
  const headers = Object.hasOwn(observed, path) ? observed[path] : undefined;
  if (headers === undefined) return check("worker-mime", [diagnostic("verify.header-unreadable")]);

  const essence = headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  return check("worker-mime", essence !== undefined && JAVASCRIPT_MIME.has(essence)
    ? []
    : [diagnostic("verify.worker-script-mime-invalid")]);
}

function diagnostic(code: "verify.header-unreadable" | "verify.worker-script-mime-invalid"): PwaDiagnostic {
  return { code, severity: "error", path: "/identity/serviceWorkerUrl", message: DIAGNOSTIC_MESSAGES[code] };
}
