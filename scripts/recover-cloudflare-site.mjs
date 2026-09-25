import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z0-9-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => key !== "target")) throw new Error("Unsupported Cloudflare recovery argument");
const target = args.target;
if (!Object.hasOwn(projects, target)) throw new Error("Target must be react or vue");
const slot = "main";
const root = resolve(import.meta.dirname, "..");
// State guard, before any credential lookup or subprocess: restore --mode=restore rmSync()s the staging directory
// without asking, so a directory already in operational use must be refused here first (module spec, "从 R2 恢复
// 运营状态" → "契约增量", step 1).
const stagingRoot = resolve(root, "build", "cloudflare", target, slot);
const archiveRoot = resolve(root, "build", "cloudflare", target, "retained", slot);
for (const existing of [stagingRoot, archiveRoot]) {
  if (existsSync(existing)) {
    throw new Error(`Operational state already exists at ${existing}; move it aside before running recovery`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), `pwa-cloudflare-recover-${target}-`));
try {
  const historyPath = join(scratch, "history.json");
  run(["audit:cloudflare:retention", `--target=${target}`, `--export-history=${historyPath}`], "export history");
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  const canonicalDeploymentId = history.canonicalDeploymentId;
  const canonical = Array.isArray(history.deployments) ?
    history.deployments.find((deployment) => deployment?.id === canonicalDeploymentId) : undefined;
  const bundleSha256 = canonical?.bundleSha256;
  if (!bundleSha256) throw new Error("current deployment has no R2 index; cannot recover");

  run(["r2:cloudflare:bundle", `--target=${target}`, `--slot=${slot}`, `--sha256=${bundleSha256}`, "--mode=download"], "download release bundle");
  run(["restore:cloudflare:site", `--target=${target}`, `--slot=${slot}`, `--sha256=${bundleSha256}`, "--mode=restore"], "restore staging directory");
  run(["archive:cloudflare:site", `--target=${target}`, `--slot=${slot}`, `--deployment-id=${canonicalDeploymentId}`], "rebuild retained asset archive");
  // Not `deploy --mode=check`: that checks a NEW candidate built on top of the current deployment's archive, and a
  // restored current deployment necessarily fails it (its receipt points at the deployment before it). The index
  // check proves the restored bundle, the live bytes and the R2 deployment index agree (module spec, "从 R2 恢复运营
  // 状态", 2026-09-22 change).
  run(["r2:cloudflare:index", `--target=${target}`, `--slot=${slot}`, `--sha256=${bundleSha256}`,
    `--deployment-id=${canonicalDeploymentId}`, "--mode=check"], "verify the restored bundle against R2 and the live site");

  const retainedManifest = JSON.parse(readFileSync(resolve(archiveRoot, "manifest.json"), "utf8"));
  const retainedAssets = Object.keys(retainedManifest.assets ?? {}).length;
  process.stdout.write(JSON.stringify({
    target, slot: "main", deploymentId: canonicalDeploymentId, bundleSha256, retainedAssets, indexVerified: true,
  }) + "\n");
  process.stderr.write("Recovered. For the next release, build a new candidate as usual, then run deploy:cloudflare:site --mode=check.\n");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

function run(command, step) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", command, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Recovery stopped at ${step}: ${command[0]} exited with status ${result.status ?? result.error?.message}`);
}
