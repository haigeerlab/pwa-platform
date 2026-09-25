import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot", "deployment-id"].includes(key))) {
  throw new Error("Unsupported Cloudflare archive argument");
}
const target = args.target;
const slot = args.slot ?? "main";
if (slot !== "main" && slot !== "drill") throw new Error("Slot must be main or drill");
const branch = slot === "main" ? "main" : "drill";
const environment = slot === "main" ? "production" : "preview";
const deploymentId = args["deployment-id"];
if (!Object.hasOwn(projects, target) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deploymentId ?? "")) {
  throw new Error("A registered target and full deployment ID are required");
}
const root = resolve(import.meta.dirname, "..");
const buildRoot = resolve(root, "build", "cloudflare", target, slot);
const site = resolve(buildRoot, "site");
const receipt = JSON.parse(readFileSync(resolve(buildRoot, "build.json"), "utf8"));
if (receipt.project !== projects[target] || receipt.target !== target || receipt.slot !== slot || receipt.uploadDirectory !== site) {
  throw new Error("Build receipt does not match the target");
}
const archiveRoot = resolve(root, "build", "cloudflare", target, "retained", slot);
const manifestPath = resolve(archiveRoot, "manifest.json");
const prior = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
if (prior && (prior.project !== receipt.project || prior.origin !== receipt.origin || prior.target !== target || prior.slot !== slot)) {
  throw new Error("Retained asset manifest belongs to another identity");
}
if (prior && prior.deploymentId === deploymentId) throw new Error("Deployment is already archived");
const token = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
if (!token || !accountId) throw new Error("Cloudflare credentials are unavailable");
const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
  "exec", "wrangler", "pages", "deployment", "list", `--project-name=${receipt.project}`, `--environment=${environment}`, "--json",
], { cwd: root, env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId }, encoding: "utf8" });
if (result.error || result.status !== 0) throw new Error("Cannot read production deployment list");
const deployments = JSON.parse(result.stdout);
if (!Array.isArray(deployments)) throw new Error("Cannot read deployment history");
const branchDeployments = deployments.filter((item) => item.Branch === branch);
const activeDeploymentId = slot === "main" ?
  await currentProductionDeploymentId(receipt.project, branch, accountId, token) : branchDeployments[0]?.Id;
if (!branchDeployments.some((item) => item.Id === deploymentId) || activeDeploymentId !== deploymentId) {
  throw new Error("The requested deployment is not the active deployment for this slot");
}
const assets = { ...(prior?.assets ?? {}) };
for (const [path, expected] of Object.entries(receipt.files)) {
  if (!/^app\/assets\/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|svg|webp)$/.test(path)) continue;
  const bytes = readFileSync(resolve(site, path));
  if (sha256(bytes) !== expected) throw new Error(`Staging asset changed: ${path}`);
  if (assets[path] && assets[path] !== expected) throw new Error(`Retained asset name collision: ${path}`);
  assets[path] = expected;
}
if (Object.keys(assets).length === 0) throw new Error("There are no fingerprinted assets to retain");
for (const [path, expected] of Object.entries(assets)) {
  const source = Object.hasOwn(receipt.files, path) ? resolve(site, path) : resolve(archiveRoot, path);
  if (!existsSync(source) || sha256(readFileSync(source)) !== expected) throw new Error(`Retained asset is missing or changed: ${path}`);
  const response = await globalThis.fetch(`${receipt.origin}/${path}`);
  if (response.status !== 200 || sha256(Buffer.from(await response.arrayBuffer())) !== expected) {
    throw new Error(`Production does not serve retained asset: ${path}`);
  }
}
for (const path of Object.keys(assets)) {
  const destination = resolve(archiveRoot, path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  if (!existsSync(destination)) copyFileSync(resolve(site, path), destination);
}
writeFileSync(manifestPath, JSON.stringify({ target, slot, project: receipt.project, origin: receipt.origin, deploymentId, assets }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ target, slot, deploymentId, retainedAssets: Object.keys(assets).length, archiveRoot }) + "\n");

async function currentProductionDeploymentId(projectName, productionBranch, accountId, token) {
  const response = await globalThis.fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Pages project lookup returned HTTP ${response.status}`);
  const body = await response.json();
  const active = body.result?.canonical_deployment;
  if (!body.success || body.result?.production_branch !== productionBranch ||
    active?.environment !== "production" || active.latest_stage?.status !== "success") {
    throw new Error("Cannot verify the active successful Pages production deployment");
  }
  return active.id;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function keychain(service) {
  if (process.platform !== "darwin") return undefined;
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return undefined; }
}
