import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { URL, pathToFileURL } from "node:url";

const targets = {
  react: { project: "pwa-platform-react-demo", appId: "pwareactdemo" },
  vue: { project: "pwa-platform-vue-demo", appId: "pwavuedemo" },
};
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot", "origin", "mode", "release"].includes(key))) {
  throw new Error("Unsupported Cloudflare build argument");
}
const { target, origin } = args;
const slot = args.slot ?? "main";
const mode = args.mode ?? "build";
const release = args.release ?? "v1";
if (!Object.hasOwn(targets, target)) throw new Error("Target must be react or vue");
if (slot !== "main" && slot !== "drill") throw new Error("Slot must be main or drill");
if (!["build", "dry-run"].includes(mode)) throw new Error("Mode must be build or dry-run");
if (!["v1", "v2", "recovery"].includes(release)) throw new Error("Release must be v1, v2 or recovery");
if (slot === "main" && release === "recovery") throw new Error("Recovery releases require the isolated drill slot");
if (!origin) throw new Error("An explicit HTTPS origin is required");
const url = new URL(origin);
if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) {
  throw new Error("Origin must be an HTTPS origin without a path or credentials");
}
const root = resolve(import.meta.dirname, "..");
const buildRoot = resolve(root, "build", "cloudflare", target, slot);
const site = resolve(buildRoot, "site");
const app = resolve(site, "app");
// Outside `site/` (the upload directory) on purpose: the captured plan must never reach Cloudflare Pages.
const planOutPath = resolve(buildRoot, "plan.json");
const project = targets[target].project;
const archiveRoot = resolve(root, "build", "cloudflare", target, "retained", slot);
const archivePath = resolve(archiveRoot, "manifest.json");
const archive = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, "utf8")) : null;
if (archive && (archive.target !== target || archive.slot !== slot || archive.project !== project || archive.origin !== origin)) {
  throw new Error("Retained assets belong to a different Cloudflare target or identity");
}
const baselineDirectory = resolve(root, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline");
const mainBaseline = JSON.parse(readFileSync(resolve(baselineDirectory, `${target}-main.json`), "utf8"));
const candidateIdentity = { ...mainBaseline, appId: slot === "main" ? targets[target].appId :
  (target === "react" ? "pwareactdrill" : "pwavuedrill"), origin };
const baselinePath = resolve(baselineDirectory, `${target}-${slot}.json`);
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
if (baseline && JSON.stringify(baseline) !== JSON.stringify(candidateIdentity)) {
  throw new Error("Build target does not match its frozen PWA identity baseline");
}
if (mode === "dry-run") {
  process.stdout.write(JSON.stringify({ target, slot, release, project, origin, uploadDirectory: site }) + "\n");
  process.exit(0);
}

// Invalidate any previous receipt before work starts; a failed rebuild must never leave a deployable old site.
rmSync(buildRoot, { recursive: true, force: true });
run(["--filter", "@pwa-platform/examples-browser-e2e^...", "run", "build"]);
mkdirSync(app, { recursive: true });
const versionPath = resolve(root, "packages", "examples-browser-e2e", "apps", target, "src", "version.ts");
const originalVersion = release === "v2" ? readFileSync(versionPath, "utf8") : null;
if (release === "v2") {
  if (!originalVersion.includes('APP_VERSION = "v1"')) throw new Error("Example source no longer declares v1");
  writeFileSync(versionPath, originalVersion.replace('APP_VERSION = "v1"', 'APP_VERSION = "v2"'));
}
try {
  run([
    "--filter", "@pwa-platform/examples-browser-e2e", "exec", "vite", "build",
    "--config", `apps/${target}/vite.config.ts`, "--outDir", app, "--emptyOutDir",
  ], {
    PWA_PLATFORM_CF_TARGET: target, PWA_PLATFORM_CF_ORIGIN: origin, PWA_PLATFORM_CF_SLOT: slot,
    PWA_PLATFORM_CF_PLAN_OUT: planOutPath,
  });
} finally {
  if (originalVersion !== null) writeFileSync(versionPath, originalVersion);
}
if (release === "recovery") copyFileSync(resolve(app, "pwa-recovery-worker.js"), resolve(app, "sw.js"));
writeFileSync(resolve(site, "_headers"), [
  ...(slot === "drill" ? ["/*", "  X-Robots-Tag: noindex"] : []),
  "/app/", "  Cache-Control: no-cache",
  "/app/index.html", "  Cache-Control: no-cache",
  "/app/offline.html", "  Cache-Control: no-cache",
  "/app/offline", "  Cache-Control: no-cache",
  "/app/sw.js", "  Cache-Control: no-cache",
  "/app/pwa-recovery-worker.js", "  Cache-Control: no-cache",
  "/app/manifest.webmanifest", "  Cache-Control: no-cache",
  "/app/assets/*", "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n"));

if (archive) {
  for (const [path, expected] of Object.entries(archive.assets)) {
    if (!/^app\/assets\/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|svg|webp)$/.test(path)) {
      throw new Error(`Invalid retained asset path: ${path}`);
    }
    const source = resolve(archiveRoot, path);
    if (!existsSync(source) || createHash("sha256").update(readFileSync(source)).digest("hex") !== expected) {
      throw new Error(`Retained asset is missing or changed: ${path}`);
    }
    const destination = resolve(site, path);
    if (existsSync(destination)) {
      if (createHash("sha256").update(readFileSync(destination)).digest("hex") !== expected) {
        throw new Error(`Retained asset name collision: ${path}`);
      }
    } else {
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(source, destination);
    }
  }
}
const manifest = JSON.parse(readFileSync(resolve(app, "manifest.webmanifest"), "utf8"));
const expectedHostName = target === "react" ? "React" : "Vue";
const expectedSlotName = slot === "main" ? "Demo" : "Drill";
if (manifest.id !== "/app/" || manifest.scope !== "/app/" || manifest.start_url !== "/app/" ||
  manifest.name !== `PWA Platform ${expectedHostName} ${expectedSlotName}` ||
  manifest.short_name !== `${expectedHostName} ${expectedSlotName}`) {
  throw new Error("Built manifest does not match the /app/ identity");
}
const files = listFiles(site).sort();
// `pwa-entry.html` and `entry-manifest.json` come from the examples' entry-recovery adoption
// (spec/examples-browser-e2e.md, "修订：示例接入入口恢复"): the recovery page is published by
// `pwaEntryResilience()`, and the manifest file stands in for the business backend's endpoint. Both are
// required rather than merely allowed, so dropping the plugin from a build fails here instead of silently
// shipping a site whose recovery entry no longer exists.
const required = ["_headers", "app/index.html", "app/offline.html", "app/sw.js", "app/pwa-recovery-worker.js", "app/manifest.webmanifest", "app/pwa-entry.html", "app/entry-manifest.json"];
for (const file of required) if (!files.includes(file)) throw new Error(`Missing required artifact: ${file}`);
for (const file of files) {
  if (required.includes(file)) continue;
  if (/^app\/icons\/(?:192|512)(?:-maskable)?\.png$/.test(file)) continue;
  // Manifest screenshots (spec/examples-browser-e2e.md 2026-09-24 revision; site file allowlist registered in
  // spec/cloudflare-test-deployment.md's "增补：站点文件白名单的登记（2026-09-24）"). Allowed, not required.
  if (/^app\/screenshots\/(?:wide|narrow)\.png$/.test(file)) continue;
  if (/^app\/assets\/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|svg|webp)$/.test(file)) continue;
  throw new Error(`Unexpected upload file: ${file}`);
}
if (!files.some((file) => file.startsWith("app/assets/"))) throw new Error("Missing fingerprinted assets");
const worker = readFileSync(resolve(app, "sw.js"), "utf8");
if (!worker.includes(candidateIdentity.appId)) throw new Error("Built worker does not contain the target appId");
if (release === "recovery") {
  if (!worker.includes(`pwa:${candidateIdentity.appId}:${candidateIdentity.environment}:`) ||
    createHash("sha256").update(worker).digest("hex") !== createHash("sha256").update(readFileSync(resolve(app, "pwa-recovery-worker.js"))).digest("hex")) {
    throw new Error("Recovery worker does not match this app identity or its shipped recovery artifact");
  }
} else if (!worker.includes(`pwa:${candidateIdentity.appId}:${candidateIdentity.environment}:${candidateIdentity.cacheNamespaceSeed}:precache`)) {
  throw new Error("Built worker cache namespace differs from the frozen identity baseline");
}
// Captured by apps/shared/cloudflare-plan-capture.ts from the real build via PWA_PLATFORM_CF_PLAN_OUT; read from
// the workspace's own built contracts package rather than imported statically, since the root package never
// declares @pwa-platform/contracts as a dependency (see spec/cloudflare-test-deployment.md's "契约增量").
if (!existsSync(planOutPath)) throw new Error("Cloudflare build did not capture a plan; PWA_PLATFORM_CF_PLAN_OUT may not have reached the build");
const contractsEntry = pathToFileURL(resolve(root, "packages", "contracts", "dist", "index.js")).href;
const { validatePlan } = await import(contractsEntry);
const capturedPlan = JSON.parse(readFileSync(planOutPath, "utf8"));
const planResult = validatePlan(capturedPlan);
if (!planResult.ok) {
  throw new Error(`Captured plan failed validatePlan: ${planResult.diagnostics.map((d) => d.code).join(", ")}`);
}
const plan = planResult.value;
const identityMismatches = Object.keys(candidateIdentity).filter((key) => plan.identity[key] !== candidateIdentity[key]);
if (identityMismatches.length > 0) {
  throw new Error(`Captured plan identity does not match build.json identity field-by-field: ${identityMismatches.join(", ")}`);
}
rmSync(planOutPath);

const receipt = {
  target, slot, release, project, origin, uploadDirectory: site,
  identity: candidateIdentity,
  files: Object.fromEntries(files.map((file) => [file, createHash("sha256").update(readFileSync(resolve(site, file))).digest("hex")])),
  retention: archive ? { sourceDeploymentId: archive.deploymentId, assets: archive.assets } : "not-verified-for-deployment",
  plan,
};
writeFileSync(resolve(buildRoot, "build.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify({ target, slot, release, project, origin, uploadDirectory: site, fileCount: files.length, retention: receipt.retention }) + "\n");

function listFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    const path = resolve(entry.parentPath, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Upload directory must not contain symlinks");
    if (entry.isFile()) result.push(relative(directory, path).replaceAll("\\", "/"));
  }
  return result;
}

function run(command, extraEnv = {}) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", command, {
    cwd: root, env: { ...process.env, ...extraEnv }, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed with exit code ${result.status ?? 1}`);
}
