import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = JSON.parse(readFileSync(resolve(root, "docs/operations/portable-a6-targets.json"), "utf8"));
const expected = {
  v1: { tree: "912af69463f719bb24173afbc4cd67d9d0a4218be8002e9695e18dcdded1c5ac", plan: "fbd76f58765e2dc97dc75a58b844508e62016525a0ed9f771263ef08c58b0bef" },
  v2: { tree: "bf65617a4dfe7ccfb9eca6e543885c94a3f3a7227522d5f01f828699e22e542d", plan: "64b0052961e74c415ce660086c10a54fe8f58a5be67fd14870a556fc09c06cc9" },
};
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--(target|version|mode)=(a|b|v1|v2|status|inspect|create|deploy)$/.exec(arg);
  if (!match) throw new Error(`Unsupported A6 argument: ${arg}`);
  return [match[1], match[2]];
}));
if (!Object.hasOwn(targets, args.target) || !Object.hasOwn(expected, args.version) ||
  !["status", "inspect", "create", "deploy"].includes(args.mode)) throw new Error("Use --target=a|b --version=v1|v2 --mode=status|inspect|create|deploy");
const target = targets[args.target];
const stage = resolve(root, "packages/vite/browser-build/a6-portable", args.version);
const site = resolve(stage, "site");
const plan = JSON.parse(readFileSync(resolve(stage, "plan.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(stage, "files.json"), "utf8"));
const sha = (data) => createHash("sha256").update(data).digest("hex");
if (sha(readFileSync(resolve(stage, "plan.json"))) !== expected[args.version].plan) throw new Error("A6 plan changed after preflight");
const actual = [];
for (const entry of readdirSync(site, { recursive: true, withFileTypes: true })) {
  if (entry.isSymbolicLink()) throw new Error("A6 upload tree contains a symlink");
  if (entry.isFile()) actual.push(relative(site, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"));
}
actual.sort();
const listed = manifest.entries.map((entry) => entry.path).sort();
if (JSON.stringify(actual) !== JSON.stringify(listed)) throw new Error("A6 upload file list changed after preflight");
for (const entry of manifest.entries) {
  if (sha(readFileSync(resolve(site, entry.path))) !== entry.sha256) throw new Error(`A6 file changed: ${entry.path}`);
}
const tree = sha(manifest.entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(""));
if (tree !== manifest.treeSha256 || tree !== expected[args.version].tree) throw new Error("A6 upload tree changed after preflight");
if (target.origin && args.mode !== "create") {
  const baseline = JSON.parse(readFileSync(resolve(root, "docs/operations", `portable-a6-baseline-${args.target}.json`), "utf8"));
  if (baseline.origin !== target.origin || !baseline.identity ||
    Object.keys(baseline.identity).length !== Object.keys(plan.identity).length ||
    Object.entries(plan.identity).some(([key, value]) => baseline.identity[key] !== value)) {
    throw new Error("A6 frozen origin identity baseline differs from candidate");
  }
}
if (args.mode === "status") {
  process.stdout.write(`${JSON.stringify({ target: args.target, project: target.project, origin: target.origin, version: args.version, treeSha256: tree, files: actual.length })}\n`);
  process.exit(0);
}
if (process.platform !== "darwin") throw new Error("A6 Cloudflare credential lookup is configured only for macOS");
function keychain(service) {
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return undefined; }
}
const token = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
if (!token || !accountId) throw new Error("A6 Pages credential unavailable");
const env = { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId };
const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${target.project}`;
async function project() {
  const response = await globalThis.fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`A6 project lookup HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success || body.result?.name !== target.project) throw new Error("A6 project lookup did not match target");
  return body.result;
}
function command(parts) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...parts], { cwd: root, env, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const reason = String(result.stderr || result.error?.message || "unknown error").replaceAll(token, "[redacted]").replaceAll(accountId, "[account]").slice(-1600);
    throw new Error(`A6 Wrangler ${parts.slice(0, 3).join(" ")} failed; inspect project before retrying: ${reason}`);
  }
}
if (args.mode === "inspect") {
  const found = await project();
  process.stdout.write(`${JSON.stringify({ target: args.target, exists: !!found, project: found?.name, origin: found?.subdomain ? `https://${found.subdomain}` : null, productionBranch: found?.production_branch, deploymentId: found?.canonical_deployment?.id ?? null })}\n`);
} else if (args.mode === "create") {
  if (args.version !== "v1" || target.origin) throw new Error("A6 creation requires v1 and an unset origin");
  if (await project()) throw new Error("A6 project already exists; record its actual URL before uploading");
  // Wrangler 4.144 delegates Pages creation to Workers detection unless --force selects Direct Upload Pages.
  command(["pages", "project", "create", target.project, "--production-branch=main", "--force"]);
  const created = await project();
  if (!created || created.production_branch !== "main" || !created.subdomain) throw new Error("A6 project created but read-back is incomplete; stop writes");
  process.stdout.write(`${JSON.stringify({ target: args.target, project: created.name, origin: `https://${created.subdomain}`, productionBranch: created.production_branch })}\n`);
} else {
  const found = await project();
  if (!found || found.production_branch !== "main" || target.origin !== `https://${found.subdomain}`) throw new Error("A6 registered origin does not match actual project");
  const active = found.canonical_deployment;
  if (args.version === "v1" && active) throw new Error("A6 v1 requires an empty project");
  if (args.version === "v2" && (!active || active.environment !== "production" || active.latest_stage?.status !== "success")) throw new Error("A6 v2 requires a successful v1 production deployment");
  if (args.version === "v2") {
    const prior = JSON.parse(readFileSync(resolve(root, "docs/review/2026-10-01/evidence", `${args.target}-v1.json`), "utf8"));
    const browser = JSON.parse(readFileSync(resolve(root, "docs/review/2026-10-01/evidence/browser-desktop-chrome.json"), "utf8"));
    if (!prior.ok || prior.origin !== target.origin || prior.deploymentId !== active.id ||
      prior.treeSha256 !== expected.v1.tree ||
      !browser.v1?.some((entry) => entry.target === args.target && entry.offlineUnvisitedNavigation === true && entry.crossOriginCached === false)) {
      throw new Error("A6 v2 requires matching v1 HTTPS gate and browser evidence for this origin");
    }
  }
  command(["pages", "deploy", site, `--project-name=${target.project}`, "--branch=main", "--commit-dirty=true", "--force"]);
  const deployed = await project();
  const latest = deployed?.canonical_deployment;
  if (!latest?.id || latest.environment !== "production" || latest.latest_stage?.status !== "success" ||
    latest.id === active?.id) throw new Error("A6 deployment read-back failed; stop writes and inspect project");
  process.stdout.write(`${JSON.stringify({ target: args.target, project: target.project, origin: target.origin, version: args.version, deploymentId: latest.id, treeSha256: tree })}\n`);
}
