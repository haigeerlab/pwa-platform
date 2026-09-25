import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";
// The three release-verifier .ts modules used only by --export-history are loaded with dynamic `import()` inside
// refuseUnsafeExportPath() and exportHistory(), never at the top level: this file must stay pure .mjs so the
// ordinary audit path (no --export-history) never requires Node's TypeScript type stripping, which the repo's
// declared `engines.node` floor (22.0.0) predates.

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const bucket = "pwa-platform-release-artifacts";
const knownArgs = new Set(["target", "export-history"]);
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z0-9-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !knownArgs.has(key))) throw new Error("Unsupported retention audit argument");
const target = args.target;
if (!Object.hasOwn(projects, target)) throw new Error("Target must be react or vue");
const project = projects[target];
const origin = `https://${project}.pages.dev`;
// Validate --export-history's output path before any credential lookup or network request: an unsafe path is an
// argument-parsing-grade refusal, not a reason to have already touched a token.
if (args["export-history"]) await refuseUnsafeExportPath(args["export-history"]);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
const pagesToken = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accessKey = process.env.PWA_PLATFORM_R2_ACCESS_KEY_ID || keychain("PWA Platform R2 Access Key ID");
const secretKey = process.env.PWA_PLATFORM_R2_SECRET_ACCESS_KEY || keychain("PWA Platform R2 Secret Access Key");
if (!/^[a-f0-9]{32}$/.test(accountId ?? "") || !pagesToken ||
  !/^[A-Za-z0-9+/=_-]+$/.test(accessKey ?? "") || !/^[A-Za-z0-9+/=_-]+$/.test(secretKey ?? "")) {
  throw new Error("Pages and bucket-scoped R2 credentials are required");
}
const r2Config = `user = "${accessKey}:${secretKey}"\naws-sigv4 = "aws:amz:auto:s3"\n`;
const projectState = await pagesResult(`/accounts/${accountId}/pages/projects/${project}`);
const canonicalId = projectState.canonical_deployment?.id;
if (projectState.production_branch !== "main" ||
  projectState.canonical_deployment?.environment !== "production" ||
  projectState.canonical_deployment?.latest_stage?.status !== "success" ||
  !uuid(canonicalId)) throw new Error("Pages project has no active successful main production deployment");
const history = await productionHistory();
const successful = history.filter((deployment) =>
  deployment.environment === "production" &&
  deployment.deployment_trigger?.metadata?.branch === "main" &&
  deployment.latest_stage?.status === "success" &&
  uuid(deployment.id) && !Number.isNaN(Date.parse(deployment.created_on ?? "")),
).sort((left, right) => Date.parse(right.created_on) - Date.parse(left.created_on));
if (!successful.some((deployment) => deployment.id === canonicalId)) {
  throw new Error("Active production deployment is absent from the successful Pages history");
}
if (args["export-history"]) {
  await exportHistory(args["export-history"]);
} else {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newest = successful.slice(0, 3);
  const withinSevenDays = successful.filter((deployment) => Date.parse(deployment.created_on) >= cutoff);
  const requiredIds = new Set([canonicalId, ...newest.map((deployment) => deployment.id),
    ...withinSevenDays.map((deployment) => deployment.id)]);
  const required = successful.filter((deployment) => requiredIds.has(deployment.id));
  if (required.length !== requiredIds.size) throw new Error("Retention selection contains an unknown Pages deployment");

  const temporary = mkdtempSync(join(tmpdir(), `pwa-retention-${target}-`));
  const retainedAssets = new Map();
  let currentFilesVerified = 0;
  try {
    for (const deployment of required) {
      const indexPath = join(temporary, `${deployment.id}.index.json`);
      requireStatus(r2Get(`deployments/${target}/main/${deployment.id}.json`, indexPath), 200,
        `read deployment index ${deployment.id}`);
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      if (index.format !== 1 || index.target !== target || index.slot !== "main" || index.project !== project ||
        index.origin !== origin || index.deploymentId !== deployment.id || !digest(index.bundleSha256) ||
        Number.isNaN(Date.parse(index.recordedAt ?? ""))) {
        throw new Error(`R2 deployment index is invalid: ${deployment.id}`);
      }
      const archivePath = join(temporary, `${deployment.id}.tar.gz`);
      const manifestPath = join(temporary, `${deployment.id}.manifest.json`);
      requireStatus(r2Get(`releases/${target}/main/${index.bundleSha256}.tar.gz`, archivePath), 200,
        `read release archive ${deployment.id}`);
      requireStatus(r2Get(`releases/${target}/main/${index.bundleSha256}.json`, manifestPath), 200,
        `read release manifest ${deployment.id}`);
      const archiveBytes = readFileSync(archivePath);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.format !== 1 || manifest.target !== target || manifest.slot !== "main" ||
        manifest.project !== project || manifest.origin !== origin || manifest.sha256 !== index.bundleSha256 ||
        manifest.bytes !== archiveBytes.length || sha256(archiveBytes) !== index.bundleSha256) {
        throw new Error(`Remote release bundle is invalid: ${deployment.id}`);
      }
      const receiptBytes = tar(["-xOzf", archivePath, "build.json"]);
      const identityBytes = tar(["-xOzf", archivePath, "identity.json"]);
      const receipt = JSON.parse(receiptBytes.toString("utf8"));
      const identity = JSON.parse(identityBytes.toString("utf8"));
      if (receipt.target !== target || receipt.slot !== "main" || receipt.project !== project ||
        receipt.origin !== origin || receipt.uploadDirectory !== "site" ||
        JSON.stringify(receipt.identity) !== JSON.stringify(identity) || manifest.identitySha256 !== sha256(identityBytes) ||
        manifest.release !== receipt.release || manifest.fileCount !== Object.keys(receipt.files ?? {}).length ||
        index.bundleSha256 !== manifest.sha256 || index.release !== manifest.release ||
        index.fileCount !== manifest.fileCount || index.receiptSha256 !== sha256(receiptBytes) ||
        index.onlineFiles !== Object.keys(receipt.files).filter((path) => path !== "_headers").length) {
        throw new Error(`Release metadata chain is inconsistent: ${deployment.id}`);
      }
      for (const [path, expected] of Object.entries(receipt.files)) {
        if (!/^app\/assets\/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|svg|webp)$/.test(path)) continue;
        if (retainedAssets.has(path) && retainedAssets.get(path) !== expected) {
          throw new Error(`Fingerprint collision across retained releases: ${path}`);
        }
        retainedAssets.set(path, expected);
      }
      if (deployment.id === canonicalId) {
        for (const [path, expected] of Object.entries(receipt.files)) {
          if (path === "_headers") continue;
          await verifyLive(path, expected, "current release file");
          currentFilesVerified++;
        }
      }
    }
    for (const [path, expected] of retainedAssets) await verifyLive(path, expected, "retained asset");
    process.stdout.write(JSON.stringify({
      target, project, canonicalDeploymentId: canonicalId, historyCount: history.length,
      successfulProductionCount: successful.length, requiredDeploymentCount: required.length,
      releaseDepthCount: newest.length, sevenDayDeploymentCount: withinSevenDays.length,
      remoteBundlesVerified: required.length, currentFilesVerified, liveRetainedAssetsVerified: retainedAssets.size,
      oldestRequiredCreatedOn: required.at(-1)?.created_on, retentionAuditPassed: true,
    }) + "\n");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Refuses an unsafe --export-history output path (already exists; parent missing; inside the repo or any git
 * worktree). Runs before any credential lookup or network request, so a bad path is rejected as an argument error,
 * never after this tool has already touched a token. Dynamically imports the two out-dir release-verifier modules
 * it needs (see the note above the imports) rather than requiring them at the top of this file.
 */
async function refuseUnsafeExportPath(outArg) {
  const { checkOutputDir } = await import(new URL("../packages/examples-browser-e2e/release-verifier/out-dir.ts", import.meta.url));
  const { listWorktreeRoots, resolveOutDirForCheck } = await import(
    new URL("../packages/examples-browser-e2e/release-verifier/out-dir-io.ts", import.meta.url)
  );
  const outPath = resolve(outArg);
  if (existsSync(outPath)) throw new Error(`--export-history file already exists: ${outPath}`);
  const repoRoot = resolve(import.meta.dirname, "..");
  let checkedOutPath;
  try {
    checkedOutPath = resolveOutDirForCheck(outPath);
  } catch {
    throw new Error(`--export-history's parent directory does not exist: ${outPath}`);
  }
  const outDirCheck = checkOutputDir(checkedOutPath, listWorktreeRoots(repoRoot));
  if (!outDirCheck.ok) throw new Error(outDirCheck.reason);
}

async function exportHistory(outArg) {
  const { buildHistoryExport } = await import(
    new URL("../packages/examples-browser-e2e/release-verifier/history-export.ts", import.meta.url)
  );
  const outPath = resolve(outArg);
  const scratch = mkdtempSync(join(tmpdir(), `pwa-history-export-${target}-`));
  try {
    const deployments = [];
    for (const deployment of successful) {
      const indexPath = join(scratch, `${deployment.id}.index.json`);
      const status = r2Get(`deployments/${target}/main/${deployment.id}.json`, indexPath);
      const body = status === 200 ? JSON.parse(readFileSync(indexPath, "utf8")) : undefined;
      deployments.push({ id: deployment.id, createdOn: deployment.created_on, index: { status, body } });
    }
    const historyFile = buildHistoryExport({
      target, slot: "main", project, origin, exportedAt: new Date().toISOString(),
      canonicalDeploymentId: canonicalId, deployments,
    });
    const contents = `${JSON.stringify(historyFile, null, 2)}\n`;
    writeFileSync(outPath, contents);
    process.stdout.write(`${sha256(Buffer.from(contents))}  ${outPath}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function productionHistory() {
  const deployments = [];
  for (let page = 1; ; page++) {
    const response = await pages(`/accounts/${accountId}/pages/projects/${project}/deployments`, {
      env: "production", page: String(page), per_page: "25",
    });
    if (!Array.isArray(response.result)) throw new Error("Pages deployment history is not a list");
    deployments.push(...response.result);
    const totalPages = response.result_info?.total_pages ?? page;
    if (!Number.isInteger(totalPages) || totalPages < page) throw new Error("Pages deployment pagination is invalid");
    if (page >= totalPages) return deployments;
  }
}
async function pagesResult(path) {
  const response = await pages(path);
  if (!response.result || Array.isArray(response.result)) throw new Error("Pages API did not return one resource");
  return response.result;
}
async function pages(path, query = {}) {
  const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await globalThis.fetch(url, { headers: { Authorization: `Bearer ${pagesToken}` } });
  if (!response.ok) throw new Error(`Pages API returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success) throw new Error("Pages API returned an unsuccessful result");
  return body;
}
async function verifyLive(path, expected, kind) {
  const response = await globalThis.fetch(`${origin}/${path}`, { cache: "no-store" });
  const actual = sha256(Buffer.from(await response.arrayBuffer()));
  if (response.status !== 200 || actual !== expected) throw new Error(`Live ${kind} differs: ${path}`);
}
function r2Get(key, output) {
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const result = spawnSync("curl", ["-q", "-K", "-", "--silent", "--show-error", "--output", output,
    "--write-out", "%{http_code}", "--request", "GET", url], {
    input: r2Config, encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !/^\d{3}$/.test(result.stdout.trim())) {
    throw new Error("R2 audit request failed before a valid HTTP response");
  }
  return Number(result.stdout.trim());
}
function tar(command) {
  const result = spawnSync("tar", command, { maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("Could not read the remote release bundle");
  return result.stdout;
}
function keychain(service) {
  if (process.platform !== "darwin") return undefined;
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return undefined; }
}
function digest(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function uuid(value) { return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function requireStatus(actual, expected, action) {
  if (actual !== expected) throw new Error(`R2 ${action} returned HTTP ${actual}, expected ${expected}`);
}
