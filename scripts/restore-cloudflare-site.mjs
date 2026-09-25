import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z0-9-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot", "sha256", "mode"].includes(key))) throw new Error("Unsupported restore argument");
const target = args.target;
const slot = args.slot ?? "main";
const digest = args.sha256;
const mode = args.mode ?? "check";
if (!Object.hasOwn(projects, target) || !["main", "drill"].includes(slot) || !/^[a-f0-9]{64}$/.test(digest ?? "") ||
  !["check", "restore"].includes(mode)) throw new Error("Registered target, slot, SHA-256 and mode are required");
const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "build", "cloudflare", "release-bundles", target, slot);
const bundlePath = resolve(source, `${digest}.tar.gz`);
const manifest = JSON.parse(readFileSync(resolve(source, `${digest}.json`), "utf8"));
const origin = `https://${slot === "drill" ? "drill." : ""}${projects[target]}.pages.dev`;
const bundleBytes = readFileSync(bundlePath);
if (manifest.format !== 1 || manifest.target !== target || manifest.slot !== slot || manifest.sha256 !== digest ||
  manifest.project !== projects[target] || manifest.origin !== origin || manifest.bytes !== bundleBytes.length || sha256(bundleBytes) !== digest) {
  throw new Error("Release bundle or manifest does not match the registered target");
}
const listing = runTar(["-tzf", bundlePath]).trimEnd().split("\n");
if (listing.some((path) => {
  if (path === "build.json" || path === "identity.json") return false;
  const segments = (path.endsWith("/") ? path.slice(0, -1) : path).split("/");
  return segments[0] !== "site" || segments.some((segment) => segment === ".." || !/^[a-zA-Z0-9_.-]+$/.test(segment));
})) throw new Error("Release bundle contains an unsafe path");
const detail = runTar(["-tvzf", bundlePath]).trimEnd().split("\n");
if (detail.some((line) => !/^[d-]/.test(line))) throw new Error("Release bundle contains a link or special file");
const temporary = mkdtempSync(join(tmpdir(), "pwa-cloudflare-restore-"));
try {
  runTar(["-xzf", bundlePath, "-C", temporary]);
  const baselinePath = resolve(root, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline", `${target}-${slot}.json`);
  const baselineBytes = readFileSync(baselinePath);
  const identityBytes = readFileSync(resolve(temporary, "identity.json"));
  if (sha256(identityBytes) !== manifest.identitySha256 || sha256(baselineBytes) !== manifest.identitySha256 ||
    !identityBytes.equals(baselineBytes)) throw new Error("Bundle PWA identity differs from the frozen baseline");
  const receipt = JSON.parse(readFileSync(resolve(temporary, "build.json"), "utf8"));
  if (receipt.target !== target || receipt.slot !== slot || receipt.project !== projects[target] || receipt.origin !== origin ||
    receipt.release !== manifest.release || JSON.stringify(receipt.identity) !== JSON.stringify(JSON.parse(baselineBytes)) ||
    (receipt.retention?.sourceDeploymentId ?? null) !== manifest.sourceDeploymentId) {
    throw new Error("Bundle build receipt differs from the registered target or manifest");
  }
  const site = resolve(temporary, "site");
  const files = listFiles(site).sort();
  if (files.length !== manifest.fileCount || JSON.stringify(files) !== JSON.stringify(Object.keys(receipt.files).sort())) {
    throw new Error("Bundle file list differs from the receipt");
  }
  for (const path of files) {
    if (!isAllowedFile(path)) throw new Error(`Unexpected file in release bundle: ${path}`);
    if (sha256(readFileSync(resolve(site, path))) !== receipt.files[path]) throw new Error(`Bundle file changed: ${path}`);
  }
  if (mode === "restore") {
    const buildRoot = resolve(root, "build", "cloudflare", target, slot);
    const restoredSite = resolve(buildRoot, "site");
    rmSync(buildRoot, { recursive: true, force: true });
    mkdirSync(buildRoot, { recursive: true });
    cpSync(site, restoredSite, { recursive: true, errorOnExist: true, force: false });
    receipt.uploadDirectory = restoredSite;
    writeFileSync(resolve(buildRoot, "build.json"), JSON.stringify(receipt, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify({ target, slot, release: receipt.release, sha256: digest, fileCount: files.length, mode }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (entry.isSymbolicLink()) throw new Error("Release bundle must not contain symlinks");
    if (entry.isFile()) files.push(relative(directory, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  }
  return files;
}
function runTar(command) {
  const result = spawnSync("tar", command, { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`tar failed: ${result.stderr || result.error?.message || result.status}`);
  return result.stdout;
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
