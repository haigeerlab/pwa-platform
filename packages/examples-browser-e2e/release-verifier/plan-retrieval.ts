// Retrieves one production-history deployment's plan from the local release-bundle archive
// (`build/cloudflare/release-bundles/<target>/<slot>/<sha256>.tar.gz`, written by package-cloudflare-site.mjs) by
// its recorded SHA-256 — the module spec's "生产部署历史" step: "按摘要读取本地 …/release-bundles/… 中的发布包，从
// 中取回计划". Every failure mode the spec lists (空摘要、本地找不到发布包、发布包摘要不符、发布包中没有计划、不可
//读) folds into `plan: null` with a `missingReason`, exactly the shape `assembleReleaseInput` (M4) expects for a
// history entry it cannot use — this module only ever reads; it never writes into the bundle directory.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import type { PwaCloudflareSlot, PwaCloudflareTarget } from "./targets.ts";

export type PwaBundlePlanResult =
  | {
      readonly plan: PwaPlan;
      readonly missingReason?: undefined;
      readonly bundlePath: string;
      /** `build.json`'s own `files` map from inside the bundle, used to resolve fingerprinted-asset hashes. */
      readonly files: Readonly<Record<string, string>>;
    }
  | {
      readonly plan: null;
      readonly missingReason: string;
      readonly bundlePath?: string;
      readonly files?: undefined;
    };

const SHA256 = /^[a-f0-9]{64}$/;

export function retrieveBundlePlan(args: {
  readonly repoRoot: string;
  readonly target: PwaCloudflareTarget;
  readonly slot: PwaCloudflareSlot;
  readonly bundleSha256: string | null;
}): PwaBundlePlanResult {
  if (args.bundleSha256 === null) return missing("History entry has no bundle SHA-256 (R2 deployment index lookup failed)");
  if (!SHA256.test(args.bundleSha256)) return missing("History entry bundleSha256 is not a 64-character hex digest");

  const bundlePath = resolve(args.repoRoot, "build", "cloudflare", "release-bundles", args.target, args.slot, `${args.bundleSha256}.tar.gz`);
  if (!existsSync(bundlePath) || !statSync(bundlePath).isFile()) return missing("Local release bundle not found", bundlePath);

  const bytes = readFileSync(bundlePath);
  if (createHash("sha256").update(bytes).digest("hex") !== args.bundleSha256) {
    return missing("Local release bundle bytes do not match its recorded SHA-256", bundlePath);
  }

  const extracted = spawnSync("tar", ["-xOzf", bundlePath, "build.json"], { maxBuffer: 32 * 1024 * 1024 });
  if (extracted.error || extracted.status !== 0) return missing("Release bundle build.json could not be read", bundlePath);

  let receipt: unknown;
  try {
    receipt = JSON.parse(extracted.stdout.toString("utf8"));
  } catch {
    return missing("Release bundle build.json is not valid JSON", bundlePath);
  }
  if (typeof receipt !== "object" || receipt === null) return missing("Release bundle build.json is not a JSON object", bundlePath);
  const value = receipt as Record<string, unknown>;

  if (value.target !== args.target || value.slot !== args.slot) return missing("Release bundle build.json target/slot does not match", bundlePath);
  if (value.plan == null) return missing("Release bundle has no plan (built before plan capture)", bundlePath);

  const planResult = validatePlan(value.plan);
  if (!planResult.ok) return missing("Release bundle plan failed validatePlan", bundlePath);

  const files = value.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) return missing("Release bundle build.json files map is missing", bundlePath);
  const fileMap: Record<string, string> = {};
  for (const [filePath, digest] of Object.entries(files)) {
    if (typeof digest === "string") fileMap[filePath] = digest;
  }

  return { plan: planResult.value, bundlePath, files: fileMap };
}

function missing(missingReason: string, bundlePath?: string): PwaBundlePlanResult {
  return bundlePath === undefined ? { plan: null, missingReason } : { plan: null, missingReason, bundlePath };
}
