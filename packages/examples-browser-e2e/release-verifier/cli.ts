#!/usr/bin/env node
// Entry point for `pnpm verify:cloudflare:release` (module spec, "输出与入口"). Never accepts an origin/URL flag:
// the only address this tool ever observes comes from the fixed registry in targets.ts, or — with `--pre-deploy`
// (module spec, "修订：上线前核验") — a deployment ID it derives an address from itself.
//
// Exit codes: 0 = the release gate passed; 1 = it ran to completion and did not pass (report files are still
// written — the module spec expects exactly this outcome until the production history is complete); 2 = the tool
// refused to run at all (bad arguments, an unreadable/invalid input, the live site not matching the candidate, or
// an unsafe --out) and wrote no report files.
import { resolve } from "node:path";
import { parseCliArgs } from "./args.ts";
import { runVerification } from "./run.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`${parsed.reason}\n`);
  process.exit(2);
}

const result = await runVerification({
  repoRoot,
  target: parsed.value.target,
  slot: parsed.value.slot,
  historyPath: resolve(parsed.value.history),
  outDir: resolve(parsed.value.out),
  ...(parsed.value.preDeploy === undefined ? {} : { preDeployDeploymentId: parsed.value.preDeploy }),
});

if (result.outcome === "refused") {
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

for (const [name, sha256] of Object.entries(result.fileHashes)) {
  process.stdout.write(`${sha256}  ${name}\n`);
}
process.exit(result.pass ? 0 : 1);
