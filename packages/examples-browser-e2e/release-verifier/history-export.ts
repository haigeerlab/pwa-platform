// Builds the production deployment history export M6 writes (module spec, "生产部署历史" / "交付物增量": "带凭据一侧
//的历史导出"). This module makes no network or credential access itself — the credentialed audit script fetches
// each deployment's R2 deployment index and hands this module the raw HTTP status and parsed body; this module only
// decides, per deployment, what fact that response represents, using the same validation the audit script's own
// live-retention path applies to a retained deployment's index (format 1, target/slot/project/origin match,
// deploymentId === id, a 64-hex bundleSha256, a parseable recordedAt).
import { HISTORY_FORMAT, type PwaProductionHistoryDeployment, type PwaProductionHistoryFile } from "./history-file.ts";

export type PwaHistoryExportIndexResponse = {
  readonly status: number;
  readonly body: unknown;
};

export type PwaHistoryExportDeploymentInput = {
  readonly id: string;
  readonly createdOn: string;
  /** The R2 GET response for `deployments/<target>/<slot>/<id>.json`, exactly as observed. */
  readonly index: PwaHistoryExportIndexResponse;
};

export type PwaHistoryExportArgs = {
  readonly target: string;
  readonly slot: string;
  readonly project: string;
  readonly origin: string;
  readonly exportedAt: string;
  readonly canonicalDeploymentId: string;
  readonly deployments: readonly PwaHistoryExportDeploymentInput[];
};

const SHA256 = /^[a-f0-9]{64}$/;

/**
 * Turns already-fetched R2 deployment-index responses into the history file M5 reads (history-file.ts). Per
 * deployment: an index response of status 200 whose body passes validation resolves `bundleSha256` to that digest;
 * a 404, or a 200 body that fails validation, resolves to `null` — a fact, not a failure, meaning "no usable index
 * for this deployment". Any other status is not a fact this tool can record (a transient or unknown failure), so it
 * throws rather than produce a file that looks like a complete export.
 */
export function buildHistoryExport(args: PwaHistoryExportArgs): PwaProductionHistoryFile {
  const deployments: PwaProductionHistoryDeployment[] = args.deployments.map((deployment) => ({
    id: deployment.id,
    createdOn: deployment.createdOn,
    bundleSha256: resolveBundleSha256(args, deployment),
  }));

  if (!deployments.some((deployment) => deployment.id === args.canonicalDeploymentId)) {
    throw new Error(`Canonical deployment is absent from the exported deployments: ${args.canonicalDeploymentId}`);
  }

  return {
    format: HISTORY_FORMAT,
    target: args.target,
    slot: args.slot,
    project: args.project,
    exportedAt: args.exportedAt,
    canonicalDeploymentId: args.canonicalDeploymentId,
    deployments,
  };
}

function resolveBundleSha256(args: PwaHistoryExportArgs, deployment: PwaHistoryExportDeploymentInput): string | null {
  const { status, body } = deployment.index;
  if (status === 404) return null;
  if (status !== 200) {
    throw new Error(`R2 deployment index returned HTTP ${status}, expected 200 or 404: ${deployment.id}`);
  }
  return validIndexDigest(args, deployment.id, body);
}

function validIndexDigest(args: PwaHistoryExportArgs, deploymentId: string, body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const index = body as Record<string, unknown>;
  if (
    index.format !== 1 ||
    index.target !== args.target ||
    index.slot !== args.slot ||
    index.project !== args.project ||
    index.origin !== args.origin ||
    index.deploymentId !== deploymentId
  ) {
    return null;
  }
  const bundleSha256 = index.bundleSha256;
  if (typeof bundleSha256 !== "string" || !SHA256.test(bundleSha256)) return null;
  if (typeof index.recordedAt !== "string" || Number.isNaN(Date.parse(index.recordedAt))) return null;
  return bundleSha256;
}
