import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { matchesLivePagesFile } from "./live-pages-file.mjs";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const bucket = "pwa-platform-release-artifacts";
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z0-9-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot", "sha256", "deployment-id", "mode"].includes(key))) {
  throw new Error("Unsupported deployment index argument");
}
const target = args.target;
const slot = args.slot ?? "main";
const digest = args.sha256;
const deploymentId = args["deployment-id"];
const mode = args.mode ?? "check";
if (!Object.hasOwn(projects, target) || !["main", "drill"].includes(slot) ||
  !/^[a-f0-9]{64}$/.test(digest ?? "") ||
  !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deploymentId ?? "") ||
  !["record", "check", "history"].includes(mode) || (mode === "history" && slot !== "main")) {
  throw new Error("Registered target, slot, SHA-256, full deployment ID and mode are required");
}
const root = resolve(import.meta.dirname, "..");
const project = projects[target];
const origin = `https://${slot === "drill" ? "drill." : ""}${project}.pages.dev`;
const bundleDir = resolve(root, "build", "cloudflare", "release-bundles", target, slot);
const archive = resolve(bundleDir, `${digest}.tar.gz`);
const manifest = JSON.parse(readFileSync(resolve(bundleDir, `${digest}.json`), "utf8"));
if (manifest.sha256 !== digest || manifest.target !== target || manifest.slot !== slot ||
  manifest.project !== project || manifest.origin !== origin) throw new Error("Bundle manifest belongs to another Pages slot");
runPnpm(["restore:cloudflare:site", `--target=${target}`, `--slot=${slot}`, `--sha256=${digest}`, "--mode=check"]);
runPnpm(["r2:cloudflare:bundle", `--target=${target}`, `--slot=${slot}`, `--sha256=${digest}`, "--mode=verify"]);
const receiptBytes = runTar(["-xOzf", archive, "build.json"]);
const receipt = JSON.parse(receiptBytes.toString("utf8"));
if (receipt.target !== target || receipt.slot !== slot || receipt.project !== project || receipt.origin !== origin ||
  receipt.release !== manifest.release || receipt.uploadDirectory !== "site" ||
  Object.keys(receipt.files).length !== manifest.fileCount) throw new Error("Bundle receipt differs from the registered Pages slot");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
const pagesToken = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accessKey = process.env.PWA_PLATFORM_R2_ACCESS_KEY_ID || keychain("PWA Platform R2 Access Key ID");
const secretKey = process.env.PWA_PLATFORM_R2_SECRET_ACCESS_KEY || keychain("PWA Platform R2 Secret Access Key");
if (!/^[a-f0-9]{32}$/.test(accountId ?? "") || !pagesToken ||
  !/^[A-Za-z0-9+/=_-]+$/.test(accessKey ?? "") || !/^[A-Za-z0-9+/=_-]+$/.test(secretKey ?? "")) {
  throw new Error("Pages and bucket-scoped R2 credentials are required");
}
const branch = slot === "main" ? "main" : "drill";
const environment = slot === "main" ? "production" : "preview";
const deployments = wrangler([
  "pages", "deployment", "list", `--project-name=${project}`, `--environment=${environment}`, "--json",
]);
const matching = Array.isArray(deployments) ? deployments.filter((entry) => entry.Branch === branch) : [];
if (!matching.some((entry) => entry.Id === deploymentId)) {
  throw new Error("Deployment ID is not in the Pages slot history");
}
if (slot === "main") {
  const projectState = await pagesGet(`/accounts/${accountId}/pages/projects/${project}`);
  if (projectState.production_branch !== branch ||
    (mode !== "history" && projectState.canonical_deployment?.id !== deploymentId)) {
    throw new Error("Deployment ID is not the active Pages production deployment");
  }
  const deployment = mode === "history" ?
    await pagesGet(`/accounts/${accountId}/pages/projects/${project}/deployments/${deploymentId}`) :
    projectState.canonical_deployment;
  if (deployment?.environment !== environment || deployment.latest_stage?.status !== "success") {
    throw new Error("Deployment is not a successful Pages production deployment");
  }
} else if (mode !== "history" && matching[0]?.Id !== deploymentId) {
  throw new Error("Deployment ID is not the latest Pages preview deployment");
}
let onlineFiles = 0;
const liveSettleDeadline = Date.now() + (mode === "record" ? 30_000 : 0);
for (const [path, expected] of Object.entries(receipt.files)) {
  if (path === "_headers") continue;
  if (mode !== "history") {
    if (!await matchesLivePagesFile(`${origin}/${path}`, expected, { deadline: liveSettleDeadline })) {
      throw new Error(`Live Pages file differs from release bundle: ${path}`);
    }
  }
  onlineFiles++;
}
const expected = {
  format: 1, target, slot, project, origin, deploymentId, bundleSha256: digest,
  release: manifest.release, fileCount: manifest.fileCount, onlineFiles,
  receiptSha256: sha256(receiptBytes),
};
const config = `user = "${accessKey}:${secretKey}"\naws-sigv4 = "aws:amz:auto:s3"\n`;
const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/deployments/${target}/${slot}/${deploymentId}.json`;
const temporary = mkdtempSync(join(tmpdir(), "pwa-r2-index-"));
try {
  const remote = resolve(temporary, "index.json");
  const current = request("GET", url, remote);
  if (current === 404) {
    if (mode !== "record") throw new Error("R2 deployment index is missing");
    const candidate = resolve(temporary, "candidate.json");
    writeFileSync(candidate, JSON.stringify({ ...expected, recordedAt: new Date().toISOString() }, null, 2) + "\n");
    // R2 documents If-None-Match on PutObject; do not overwrite a concurrently created index.
    requireStatus(request("PUT", url, candidate), 200, "record deployment index");
  } else {
    requireStatus(current, 200, "read deployment index");
  }
  requireStatus(request("GET", url, remote), 200, "read back deployment index");
  const index = JSON.parse(readFileSync(remote, "utf8"));
  if (Object.entries(expected).some(([key, value]) => index[key] !== value) ||
    Number.isNaN(Date.parse(index.recordedAt ?? ""))) throw new Error("R2 deployment index differs from live Pages and the verified bundle");
  process.stdout.write(JSON.stringify({ target, slot, deploymentId, sha256: digest, onlineFiles, mode, indexVerified: true }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

async function pagesGet(path) {
  const response = await globalThis.fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${pagesToken}` },
  });
  if (!response.ok) throw new Error(`Pages API returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success || !body.result) throw new Error("Pages API did not return a valid project or deployment");
  return body.result;
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
function runPnpm(command) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", command, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`Release bundle check failed: ${command[0]}`);
}
function runTar(command) {
  const result = spawnSync("tar", command, { maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("Could not read the verified release bundle receipt");
  return result.stdout;
}
function wrangler(command) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...command], {
    cwd: root, env: { ...process.env, CLOUDFLARE_API_TOKEN: pagesToken, CLOUDFLARE_ACCOUNT_ID: accountId }, encoding: "utf8",
  });
  if (result.error || result.status !== 0) throw new Error("Could not read current Pages deployments");
  try { return JSON.parse(result.stdout); } catch { throw new Error("Pages deployment list was not JSON"); }
}
function request(method, endpoint, file) {
  const command = ["-q", "-K", "-", "--silent", "--show-error", "--output", method === "GET" ? file : "/dev/null",
    "--write-out", "%{http_code}", "--request", method];
  if (method === "PUT") command.push("--data-binary", `@${file}`, "--header", "Content-Type: application/json", "--header", "If-None-Match: *");
  command.push(endpoint);
  const result = spawnSync("curl", command, { input: config, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0 || !/^\d{3}$/.test(result.stdout.trim())) {
    throw new Error("R2 deployment index request failed before a valid HTTP response");
  }
  return Number(result.stdout.trim());
}
function requireStatus(actual, expectedStatus, action) {
  if (actual !== expectedStatus) throw new Error(`R2 ${action} returned HTTP ${actual}, expected ${expectedStatus}`);
}
