// Does the deployment still serve enough old fingerprinted assets for installed clients and recovery workers?
// The release system supplies the history and current availability; this module only evaluates those facts.
import {
  DIAGNOSTIC_MESSAGES,
  validatePlan,
  type PwaContractPath,
  type PwaDiagnostic,
  type PwaPlan,
} from "@pwa-platform/contracts";
import { check, type PwaVerificationCheck } from "./report.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type PwaReleaseRetentionSnapshot = {
  readonly releasedAtMs: number;
  readonly plan: unknown;
};

export type PwaReleaseRetentionInput = {
  readonly asOfMs: number;
  readonly previous: readonly PwaReleaseRetentionSnapshot[];
  readonly available: readonly string[];
};

type ValidatedSnapshot = {
  readonly releasedAtMs: number;
  readonly plan: PwaPlan;
};

/**
 * Verifies the fingerprinted asset compatibility window from the release runbook.
 *
 * Historical records are deliberately treated as untrusted data: if they cannot prove one coherent release line,
 * the check fails without selecting a partial set of paths. `available` is different — a malformed path list is a
 * caller error, just as it is for `verifyArtifacts`, because reporting every asset missing would misstate the fact.
 */
export function verifyReleaseRetention(plan: PwaPlan, input: PwaReleaseRetentionInput): PwaVerificationCheck {
  const inputValue = input as unknown;
  if (!isRecord(inputValue)) return invalidHistory();
  const asOfMs = inputValue.asOfMs;
  if (!isTimestamp(asOfMs) || !Array.isArray(inputValue.previous)) {
    return invalidHistory();
  }

  const available = readAvailable(inputValue.available);
  const previous = readPrevious(plan, inputValue.previous, asOfMs);
  if (previous === undefined) return invalidHistory();

  const required = new Map<string, PwaContractPath>();
  collectFingerprinted(required, plan, (index) => `/precache/${index}/url`);

  previous.forEach((snapshot, index) => {
    const withinRecentReleases = index < 2;
    const withinSevenDaysOfSuccessor = index > 1 && asOfMs - previous[index - 1]!.releasedAtMs < RETENTION_MS;
    if (!withinRecentReleases && !withinSevenDaysOfSuccessor) return;
    collectFingerprinted(required, snapshot.plan, (entryIndex) => `/retention/previous/${index}/precache/${entryIndex}/url`);
  });

  const diagnostics = [...required].flatMap(([path, diagnosticPath]) =>
    available.has(path) ? [] : [diagnostic("verify.retention-missing", diagnosticPath)],
  );
  return check("release-retention", diagnostics);
}

function readAvailable(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    throw new TypeError("Available artifact paths must be an array of absolute paths");
  }
  for (const path of value) {
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new TypeError("Available artifact paths must be absolute and start with a slash");
    }
  }
  return new Set(value);
}

function readPrevious(plan: PwaPlan, value: readonly unknown[], asOfMs: number): readonly ValidatedSnapshot[] | undefined {
  const snapshots: ValidatedSnapshot[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isTimestamp(entry.releasedAtMs) || entry.releasedAtMs > asOfMs) return undefined;
    const validated = validatePlan(entry.plan);
    if (!validated.ok || !sameReleaseLine(plan, validated.value)) return undefined;

    const preceding = snapshots.at(-1);
    if (preceding !== undefined && preceding.releasedAtMs <= entry.releasedAtMs) return undefined;
    snapshots.push({ releasedAtMs: entry.releasedAtMs, plan: validated.value });
  }
  return snapshots;
}

function sameReleaseLine(candidate: PwaPlan, historical: PwaPlan): boolean {
  return (
    candidate.identity.appId === historical.identity.appId &&
    candidate.identity.origin === historical.identity.origin &&
    candidate.identity.environment === historical.identity.environment
  );
}

function collectFingerprinted(
  required: Map<string, PwaContractPath>,
  plan: PwaPlan,
  pathForIndex: (index: number) => PwaContractPath,
): void {
  plan.precache.forEach((entry, index) => {
    if (entry.revision === null && !required.has(entry.url)) required.set(entry.url, pathForIndex(index));
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function invalidHistory(): PwaVerificationCheck {
  return check("release-retention", [diagnostic("verify.retention-history-invalid", "/retention")]);
}

function diagnostic(
  code: "verify.retention-history-invalid" | "verify.retention-missing",
  path: PwaContractPath,
): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
