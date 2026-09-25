// Reads the local candidate build receipt (`build/cloudflare/<target>/<slot>/build.json`, written by
// build-cloudflare-site.mjs) and checks the facts M5's "候选" step requires before anything is fetched from the
// network: it has a plan, its `origin` is the registered production origin (never an arbitrary one), and its
// `target`/`slot` match what the caller asked for.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import { publishedPaths } from "./published-paths.ts";
import type { PwaCloudflareSlot, PwaCloudflareTarget } from "./targets.ts";

export type PwaCandidate = {
  readonly plan: PwaPlan;
  /** `build.json`'s own `files` map: served path relative to the upload root -> SHA-256. */
  readonly files: Readonly<Record<string, string>>;
  readonly publishedPaths: readonly string[];
  /** SHA-256 of the candidate `build.json` file itself, for the facts file. */
  readonly buildJsonSha256: string;
};

export type PwaCandidateResult = { readonly ok: true; readonly value: PwaCandidate } | { readonly ok: false; readonly reason: string };

export function readCandidate(args: {
  readonly repoRoot: string;
  readonly target: PwaCloudflareTarget;
  readonly slot: PwaCloudflareSlot;
  readonly registryOrigin: string;
}): PwaCandidateResult {
  const path = resolve(args.repoRoot, "build", "cloudflare", args.target, args.slot, "build.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return invalid(`Candidate build receipt not found: ${path}`);
  }

  let receipt: unknown;
  try {
    receipt = JSON.parse(raw);
  } catch {
    return invalid(`Candidate build receipt is not valid JSON: ${path}`);
  }
  if (typeof receipt !== "object" || receipt === null) return invalid("Candidate build receipt is not a JSON object");
  const value = receipt as Record<string, unknown>;

  if (value.target !== args.target) return invalid("Candidate build receipt target does not match --target");
  if (value.slot !== args.slot) return invalid("Candidate build receipt slot does not match --slot");
  if (value.origin !== args.registryOrigin) return invalid("Candidate build receipt origin does not match the registered production origin");
  if (value.plan == null) return invalid("Candidate build receipt has no plan; rebuild before verifying a release");

  const planResult = validatePlan(value.plan);
  if (!planResult.ok) return invalid("Candidate plan failed validatePlan");

  const files = value.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) return invalid("Candidate build receipt files map is missing");
  const fileMap: Record<string, string> = {};
  for (const [filePath, digest] of Object.entries(files)) {
    if (typeof digest !== "string") return invalid(`Candidate build receipt file digest is not a string: ${filePath}`);
    fileMap[filePath] = digest;
  }

  return {
    ok: true,
    value: {
      plan: planResult.value,
      files: fileMap,
      publishedPaths: publishedPaths(fileMap),
      buildJsonSha256: createHash("sha256").update(raw).digest("hex"),
    },
  };
}

function invalid(reason: string): PwaCandidateResult {
  return { ok: false, reason };
}
