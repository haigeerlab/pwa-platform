import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot"].includes(key))) throw new Error("Unsupported release bundle argument");
const target = args.target;
const slot = args.slot ?? "main";
if (!Object.hasOwn(projects, target) || !["main", "drill"].includes(slot)) throw new Error("Target or slot is not registered");
const root = resolve(import.meta.dirname, "..");
const buildRoot = resolve(root, "build", "cloudflare", target, slot);
const site = resolve(buildRoot, "site");
const receipt = JSON.parse(readFileSync(resolve(buildRoot, "build.json"), "utf8"));
const baselinePath = resolve(root, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline", `${target}-${slot}.json`);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (receipt.target !== target || receipt.slot !== slot || receipt.project !== projects[target] ||
  receipt.uploadDirectory !== site || JSON.stringify(receipt.identity) !== JSON.stringify(baseline)) {
  throw new Error("Build receipt does not match the registered slot and frozen identity");
}
// Release bundles must carry the compiled plan (see spec/cloudflare-test-deployment.md's "构建时保存计划");
// a receipt without one is a build that predates plan capture and must not be packaged as a new bundle.
if (receipt.plan == null) throw new Error("Build receipt has no plan; rebuild before packaging a release bundle");
const paths = listFiles(site).sort();
if (JSON.stringify(paths) !== JSON.stringify(Object.keys(receipt.files).sort())) throw new Error("Staging files differ from the build receipt");
for (const path of paths) if (!isAllowedFile(path)) throw new Error(`Unexpected file in release bundle: ${path}`);
for (const path of paths) {
  if (sha256(readFileSync(resolve(site, path))) !== receipt.files[path]) throw new Error(`Staging file changed: ${path}`);
}
const temporary = mkdtempSync(join(tmpdir(), "pwa-cloudflare-bundle-"));
try {
  const source = resolve(temporary, "source");
  const extracted = resolve(temporary, "extracted");
  mkdirSync(source);
  mkdirSync(extracted);
  cpSync(site, resolve(source, "site"), { recursive: true, errorOnExist: true, force: false });
  const portableReceipt = { ...receipt, uploadDirectory: "site" };
  writeFileSync(resolve(source, "build.json"), JSON.stringify(portableReceipt, null, 2) + "\n");
  copyFileSync(baselinePath, resolve(source, "identity.json"));
  normalizeTimestamps(source);
  const tarPath = resolve(temporary, "release.tar");
  const candidate = resolve(temporary, "release.tar.gz");
  runTar(["-cf", tarPath, "-C", source, "site", "build.json", "identity.json"]);
  writeFileSync(candidate, gzipSync(readFileSync(tarPath)));
  runTar(["-xzf", candidate, "-C", extracted]);
  const extractedReceipt = JSON.parse(readFileSync(resolve(extracted, "build.json"), "utf8"));
  if (JSON.stringify(extractedReceipt) !== JSON.stringify(portableReceipt) ||
    JSON.stringify(JSON.parse(readFileSync(resolve(extracted, "identity.json"), "utf8"))) !== JSON.stringify(baseline)) {
    throw new Error("Bundle metadata changed during round-trip extraction");
  }
  if (JSON.stringify(extractedReceipt.plan) !== JSON.stringify(receipt.plan)) throw new Error("Bundle plan changed during round-trip extraction");
  const unpackedSite = resolve(extracted, "site");
  if (JSON.stringify(listFiles(unpackedSite).sort()) !== JSON.stringify(paths)) throw new Error("Bundle file list changed during round-trip extraction");
  for (const path of paths) {
    if (sha256(readFileSync(resolve(unpackedSite, path))) !== receipt.files[path]) {
      throw new Error(`Bundle file changed during round-trip extraction: ${path}`);
    }
  }
  const digest = sha256(readFileSync(candidate));
  const output = resolve(root, "build", "cloudflare", "release-bundles", target, slot);
  mkdirSync(output, { recursive: true });
  const bundlePath = resolve(output, `${digest}.tar.gz`);
  const manifestPath = resolve(output, `${digest}.json`);
  if (existsSync(bundlePath) && sha256(readFileSync(bundlePath)) !== digest) throw new Error("Existing bundle name has different bytes");
  if (!existsSync(bundlePath)) copyFileSync(candidate, bundlePath);
  const manifest = {
    format: 1, target, slot, project: receipt.project, origin: receipt.origin, release: receipt.release,
    sha256: digest, bytes: statSync(bundlePath).size, fileCount: paths.length,
    identitySha256: sha256(readFileSync(baselinePath)), sourceDeploymentId: receipt.retention?.sourceDeploymentId ?? null,
  };
  if (existsSync(manifestPath) && JSON.stringify(JSON.parse(readFileSync(manifestPath, "utf8"))) !== JSON.stringify(manifest)) {
    throw new Error("Existing bundle manifest differs");
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ ...manifest, bundlePath, manifestPath }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (entry.isSymbolicLink()) throw new Error("Bundle input must not contain symlinks");
    if (entry.isFile()) files.push(relative(directory, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  }
  return files;
}
function runTar(command) {
  const result = spawnSync("tar", command, { env: { ...process.env, COPYFILE_DISABLE: "1" }, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`tar failed: ${result.stderr || result.error?.message || result.status}`);
}

function isAllowedFile(path) {
  return ["_headers", "app/index.html", "app/offline.html", "app/sw.js", "app/pwa-recovery-worker.js", "app/manifest.webmanifest",
    // From the examples' entry-recovery adoption (spec/examples-browser-e2e.md). Allowed, not required:
    // bundles and staging directories built before that adoption must stay restorable and deployable.
    "app/pwa-entry.html", "app/entry-manifest.json"].includes(path) ||
    /^app\/icons\/(?:192|512)(?:-maskable)?\.png$/.test(path) ||
    // Manifest screenshots (spec/examples-browser-e2e.md 2026-09-24 revision; site file allowlist registered in
    // spec/cloudflare-test-deployment.md's "增补：站点文件白名单的登记（2026-09-24）"). Allowed, not required.
    /^app\/screenshots\/(?:wide|narrow)\.png$/.test(path) ||
    /^app\/assets\/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|svg|webp)$/.test(path);
}

function normalizeTimestamps(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) normalizeTimestamps(child);
    else utimesSync(child, new Date(0), new Date(0));
  }
  utimesSync(path, new Date(0), new Date(0));
}
