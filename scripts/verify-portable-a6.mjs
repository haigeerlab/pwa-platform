import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { comparePortableIdentityBaseline, requiredDeploymentPaths, requiredReleaseChecks, verifyRelease, verifyReleaseGateCoverage } from "../packages/build-verifier/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const targets = JSON.parse(readFileSync(resolve(root, "docs/operations/portable-a6-targets.json"), "utf8"));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--(target|version|deployment-id)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unsupported A6 verifier argument: ${arg}`);
  return [match[1], match[2]];
}));
if (!["a", "b"].includes(args.target) || !["v1", "v2"].includes(args.version) ||
  !/^[a-f0-9-]{36}$/.test(args["deployment-id"] ?? "")) throw new Error("Use --target=a|b --version=v1|v2 --deployment-id=<UUID>");
const target = targets[args.target];
if (!target?.origin) throw new Error("A6 target origin is not registered");
const baseline = JSON.parse(readFileSync(resolve(root, "docs/operations", `portable-a6-baseline-${args.target}.json`), "utf8"));
if (baseline.origin !== target.origin) throw new Error("A6 baseline origin differs from target registry");
const stage = resolve(root, "packages/vite/browser-build/a6-portable", args.version);
const plan = JSON.parse(readFileSync(resolve(stage, "plan.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(stage, "files.json"), "utf8"));
const appFiles = manifest.entries.filter(({ path }) => path.startsWith("app/"));
const available = appFiles.map(({ path }) => `/${path}`);
const sha = (data) => createHash("sha256").update(data).digest("hex");
function keychain(service) {
  try { return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return undefined; }
}
const token = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
if (!token || !accountId) throw new Error("A6 Pages read credential unavailable");
const projectResponse = await globalThis.fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${target.project}`, { headers: { Authorization: `Bearer ${token}` } });
if (!projectResponse.ok) throw new Error(`A6 project lookup HTTP ${projectResponse.status}`);
const projectBody = await projectResponse.json();
const current = projectBody.result?.canonical_deployment;
if (!projectBody.success || projectBody.result?.name !== target.project ||
  `https://${projectBody.result?.subdomain}` !== target.origin || current?.id !== args["deployment-id"] ||
  current.environment !== "production" || current.latest_stage?.status !== "success") {
  throw new Error("A6 expected deployment is not the successful production deployment");
}
const historyResponse = await globalThis.fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${target.project}/deployments`, { headers: { Authorization: `Bearer ${token}` } });
if (!historyResponse.ok) throw new Error(`A6 deployment history HTTP ${historyResponse.status}`);
const historyBody = await historyResponse.json();
if (!historyBody.success || !Array.isArray(historyBody.result) ||
  (historyBody.result_info?.total_count != null && historyBody.result_info.total_count > historyBody.result.length)) {
  throw new Error("A6 deployment history is incomplete");
}
const successfulProduction = historyBody.result.filter((entry) => entry.environment === "production" && entry.latest_stage?.status === "success").map((entry) => entry.id);
if (args.version === "v2") {
  const prior = JSON.parse(readFileSync(resolve(root, "docs/review/2026-10-01/evidence", `${args.target}-v1.json`), "utf8"));
  if (successfulProduction.length !== 2 || !successfulProduction.includes(prior.deploymentId) || !successfulProduction.includes(current.id)) {
    throw new Error("A6 v2 success history is not exactly the recorded v1 and v2 deployments");
  }
}
const previous = [];
if (args.version === "v2") {
  const priorPath = resolve(root, "docs/review/2026-10-01/evidence", `${args.target}-v1.json`);
  const prior = JSON.parse(readFileSync(priorPath, "utf8"));
  if (!prior.ok || prior.origin !== target.origin || prior.deploymentId === current.id || !Number.isFinite(prior.releasedAtMs)) {
    throw new Error("A6 v1 evidence is missing or does not match this origin");
  }
  const priorPlan = JSON.parse(readFileSync(resolve(root, "packages/vite/browser-build/a6-portable/v1/plan.json"), "utf8"));
  if (sha(readFileSync(resolve(root, "packages/vite/browser-build/a6-portable/v1/plan.json"))) !== prior.planSha256) throw new Error("A6 v1 plan changed after verification");
  if (!comparePortableIdentityBaseline(priorPlan.identity, target.origin, baseline).ok) throw new Error("A6 v1 identity differs from frozen origin baseline");
  previous.push({ releasedAtMs: prior.releasedAtMs, plan: priorPlan, origin: target.origin });
}
const responses = {};
const paths = [];
for (const path of requiredDeploymentPaths(plan, available)) {
  const response = await globalThis.fetch(new globalThis.URL(path, target.origin), { redirect: "follow", cache: "no-store" });
  const bytes = Buffer.from(await response.arrayBuffer());
  const headerEntries = Object.fromEntries(response.headers.entries());
  const expected = appFiles.find((entry) => `/${entry.path}` === path)?.sha256 ??
    (path === "/app/" ? appFiles.find((entry) => entry.path === "app/index.html")?.sha256 : undefined);
  responses[path] = { finalUrl: response.url, status: response.status, headers: headerEntries };
  paths.push({ path, finalUrl: response.url, status: response.status, headers: {
    "content-type": response.headers.get("content-type"),
    "cache-control": response.headers.get("cache-control"),
    "content-security-policy": response.headers.get("content-security-policy"),
    "x-content-type-options": response.headers.get("x-content-type-options"),
    "x-robots-tag": response.headers.get("x-robots-tag"),
  }, sha256: sha(bytes), expectedSha256: expected, bytesMatch: sha(bytes) === expected });
}
const report = verifyRelease({
  plan,
  published: available,
  baseline,
  retention: { asOfMs: Date.now(), previous, available },
  deployment: { targetOrigin: target.origin, responses },
});
const coverage = verifyReleaseGateCoverage(report, requiredReleaseChecks(plan));
const bytesMatch = paths.every((item) => item.bytesMatch);
const result = {
  target: args.target, version: args.version, project: target.project, origin: target.origin,
  deploymentId: current.id, releasedAtMs: Date.parse(current.created_on),
  successfulProductionDeploymentIds: successfulProduction,
  planSha256: sha(readFileSync(resolve(stage, "plan.json"))), treeSha256: manifest.treeSha256,
  checkedAt: new Date().toISOString(), paths, report, coverage,
  ok: bytesMatch && report.ok && coverage.ok,
};
const evidenceDir = resolve(root, "docs/review/2026-10-01/evidence");
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(resolve(evidenceDir, `${args.target}-${args.version}.json`), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ target: args.target, version: args.version, deploymentId: current.id, paths: paths.length, bytesMatch, reportOk: report.ok, coverageOk: coverage.ok, diagnostics: report.diagnostics.map((item) => item.code) })}\n`);
if (!result.ok) process.exitCode = 1;
