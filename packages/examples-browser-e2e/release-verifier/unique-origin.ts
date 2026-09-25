// Recovers a Cloudflare Pages preview deployment's unique per-deployment address from its deployment ID (module
// spec, "修订：上线前核验" → "上线前核验模式": "唯一地址 = 部署 ID 前 8 位加项目域名"). Pure: this only evaluates the
// formula, it does not confirm the formula holds for a real deployment — P4's `preview-candidate` deploy mode reads
// the upload back from the real Pages API and compares against this function's result, once, per upload.
import { isRegisteredProject } from "./targets.ts";

/** A lowercase, canonically-hyphenated UUID — Cloudflare deployment IDs, exactly as the Pages API returns them. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PwaUniqueDeploymentOriginResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Builds `https://<first 8 hex chars of deploymentId>.<project>.pages.dev`, or explains why it refuses to.
 *
 * Both inputs are validated, not just formatted: `project` must be one of the Cloudflare Pages projects this tool
 * has registered (`targets.ts`), and `deploymentId` must be a lowercase canonical UUID exactly as the Pages API
 * returns it — uppercase, a short or truncated id, a stray path segment, or any other shape is rejected rather than
 * silently truncated or normalized, because a wrong address here means the tool observes the wrong deployment.
 */
export function uniqueDeploymentOrigin(project: string, deploymentId: string): PwaUniqueDeploymentOriginResult {
  if (!isRegisteredProject(project)) {
    return { ok: false, reason: `"${project}" is not a registered Cloudflare Pages project` };
  }
  if (!CANONICAL_UUID.test(deploymentId)) {
    return { ok: false, reason: "deploymentId must be a lowercase canonical UUID (8-4-4-4-12 hex)" };
  }
  return { ok: true, origin: `https://${deploymentId.slice(0, 8)}.${project}.pages.dev` };
}
