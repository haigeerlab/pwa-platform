import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targetArg = process.argv[2];
const version = process.argv[3];
if (!["a", "b"].includes(targetArg) || !["v1", "v2"].includes(version) || process.argv.length !== 4) {
  throw new Error("Use node scripts/portable-a6-switch.mjs a|b v1|v2");
}
const targets = JSON.parse(readFileSync(resolve(root, "docs/operations/portable-a6-targets.json"), "utf8"));
const target = targets[targetArg];
const evidenceDir = resolve(root, "docs/review/2026-10-01/evidence");
const v1 = JSON.parse(readFileSync(resolve(evidenceDir, `${targetArg}-v1.json`), "utf8"));
const v2 = JSON.parse(readFileSync(resolve(evidenceDir, `${targetArg}-v2.json`), "utf8"));
if (!v1.ok || !v2.ok || v1.origin !== target.origin || v2.origin !== target.origin) throw new Error("A6 release evidence is incomplete");
const desired = version === "v1" ? v1.deploymentId : v2.deploymentId;
const expectedCurrent = version === "v1" ? v2.deploymentId : v1.deploymentId;
function keychain(service) {
  try { return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return undefined; }
}
const token = process.env.CLOUDFLARE_API_TOKEN || keychain("PWA Platform Cloudflare Pages");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
if (!token || !accountId) throw new Error("A6 Pages credential unavailable");
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${target.project}`;
async function current() {
  const response = await globalThis.fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`A6 project lookup HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success || body.result?.name !== target.project || `https://${body.result.subdomain}` !== target.origin) throw new Error("A6 target identity changed");
  return body.result.canonical_deployment?.id;
}
if (await current() !== expectedCurrent) throw new Error(`A6 ${targetArg} is not at the expected predecessor; stop`);
const response = await globalThis.fetch(`${base}/deployments/${desired}/rollback`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
if (!response.ok) throw new Error(`A6 rollback API HTTP ${response.status}; inspect current deployment before retry`);
const body = await response.json();
if (!body.success) throw new Error("A6 rollback API did not report success; inspect current deployment before retry");
let observed;
for (let i = 0; i < 20; i += 1) {
  observed = await current();
  if (observed === desired) break;
  await new Promise((resolveWait) => globalThis.setTimeout(resolveWait, 1000));
}
if (observed !== desired) throw new Error("A6 rollback accepted but canonical deployment has not converged; inspect before more writes");
const path = resolve(evidenceDir, "rollback-events.json");
let events = [];
try { events = JSON.parse(readFileSync(path, "utf8")); } catch { /* first event */ }
events.push({ target: targetArg, toVersion: version, fromDeploymentId: expectedCurrent, toDeploymentId: desired, at: new Date().toISOString() });
writeFileSync(path, `${JSON.stringify(events, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ target: targetArg, version, canonicalDeploymentId: desired })}\n`);
