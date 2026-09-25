// The production deployment history export format M6 will produce (module spec, "采集输入" → "生产部署历史").
// This module only defines the shape and validates it; M6's own export tool, and how the summary is looked up in
// R2, are out of scope here. A credentialed export looks like:
//
//   {
//     "format": "pwa-cloudflare-production-history/v1",
//     "target": "react",
//     "slot": "main",
//     "project": "pwa-platform-react-demo",
//     "exportedAt": "2026-09-22T00:00:00.000Z",
//     "canonicalDeploymentId": "8589bf50-b6d2-493f-9551-ea4b7dd8adec",
//     "deployments": [
//       { "id": "8589bf50-b6d2-493f-9551-ea4b7dd8adec", "createdOn": "2026-09-20T00:00:00.000Z",
//         "bundleSha256": "…64 hex…" },
//       { "id": "18824a5c-9103-41a5-953b-0efaedf4360a", "createdOn": "2026-08-01T00:00:00.000Z",
//         "bundleSha256": null }
//     ]
//   }
//
// `bundleSha256` is `null` when the R2 deployment index it came from could not resolve a bundle summary; that is
// this tool's cue (via plan-retrieval.ts) to treat the deployment as lacking a plan rather than fail outright.

export const HISTORY_FORMAT = "pwa-cloudflare-production-history/v1";

export type PwaProductionHistoryDeployment = {
  readonly id: string;
  readonly createdOn: string;
  readonly bundleSha256: string | null;
};

export type PwaProductionHistoryFile = {
  readonly format: typeof HISTORY_FORMAT;
  readonly target: string;
  readonly slot: string;
  readonly project: string;
  readonly exportedAt: string;
  readonly canonicalDeploymentId: string;
  readonly deployments: readonly PwaProductionHistoryDeployment[];
};

export type PwaHistoryFileExpectation = {
  readonly target: string;
  readonly slot: string;
  readonly project: string;
};

export type PwaHistoryFileValidation =
  | { readonly ok: true; readonly value: PwaProductionHistoryFile }
  | { readonly ok: false; readonly reason: string };

const SHA256 = /^[a-f0-9]{64}$/;

/**
 * Validates a parsed history export against the format above and against the CLI's own `--target`/`--slot` (and the
 * target registry's project name). A mismatch on any of the three is refused outright, per the module spec: "拒绝
 * (拒绝运行) 如果 format/target/slot/project 与 CLI 参数不符" — the tool must never silently verify one target's
 * candidate against another target's history.
 */
export function validateHistoryFile(raw: unknown, expected: PwaHistoryFileExpectation): PwaHistoryFileValidation {
  if (typeof raw !== "object" || raw === null) return invalid("History file is not a JSON object");
  const value = raw as Record<string, unknown>;

  if (value.format !== HISTORY_FORMAT) return invalid(`History file format must be "${HISTORY_FORMAT}"`);
  if (value.target !== expected.target) return invalid("History file target does not match --target");
  if (value.slot !== expected.slot) return invalid("History file slot does not match --slot");
  if (value.project !== expected.project) return invalid("History file project does not match the registered target");
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) {
    return invalid("History file exportedAt is not a valid timestamp");
  }
  if (typeof value.canonicalDeploymentId !== "string" || value.canonicalDeploymentId === "") {
    return invalid("History file canonicalDeploymentId is missing");
  }
  if (!Array.isArray(value.deployments)) return invalid("History file deployments must be an array");

  const deployments: PwaProductionHistoryDeployment[] = [];
  for (const [index, entry] of value.deployments.entries()) {
    if (typeof entry !== "object" || entry === null) return invalid(`History file deployments[${index}] is not an object`);
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id === "") return invalid(`History file deployments[${index}].id is missing`);
    if (typeof record.createdOn !== "string") return invalid(`History file deployments[${index}].createdOn is missing`);
    const bundleSha256 = record.bundleSha256;
    if (bundleSha256 !== null && (typeof bundleSha256 !== "string" || !SHA256.test(bundleSha256))) {
      return invalid(`History file deployments[${index}].bundleSha256 must be a 64-character hex digest or null`);
    }
    deployments.push({ id: record.id, createdOn: record.createdOn, bundleSha256 });
  }

  return {
    ok: true,
    value: {
      format: HISTORY_FORMAT,
      target: expected.target,
      slot: expected.slot,
      project: expected.project,
      exportedAt: value.exportedAt,
      canonicalDeploymentId: value.canonicalDeploymentId,
      deployments,
    },
  };
}

function invalid(reason: string): PwaHistoryFileValidation {
  return { ok: false, reason };
}
