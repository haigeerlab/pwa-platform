import { validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import { validateClientConfig, type PwaClientConfig } from "../shared/config.js";

/**
 * The page's runtime config: only the plan fields the facade reads. The page never receives the path rules or the
 * precache manifest. Throws for an invalid plan (the message lists diagnostic codes and paths only).
 */
export function createClientConfig(plan: PwaPlan): PwaClientConfig {
  const { identity, install, updateMode } = validPlan(plan);
  return validateClientConfig({
    appId: identity.appId,
    scope: identity.scope,
    serviceWorkerUrl: identity.serviceWorkerUrl,
    updateMode,
    installEnabled: install !== null,
  });
}

function validPlan(plan: PwaPlan): PwaPlan {
  const result = validatePlan(plan);
  if (!result.ok) {
    const findings = result.diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`);
    throw new Error(`Cannot create a client config from an invalid PwaPlan: ${findings.join(", ")}`);
  }
  return result.value;
}
