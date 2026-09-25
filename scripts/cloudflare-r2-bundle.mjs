import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projects = { react: "pwa-platform-react-demo", vue: "pwa-platform-vue-demo" };
const bucket = "pwa-platform-release-artifacts";
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const match = /^--([a-z0-9-]+)=(.*)$/.exec(item);
  if (!match || !match[2]) throw new Error(`Invalid argument: ${item}`);
  return [match[1], match[2]];
}));
if (Object.keys(args).some((key) => !["target", "slot", "sha256", "mode"].includes(key))) throw new Error("Unsupported R2 bundle argument");
const target = args.target;
const slot = args.slot ?? "main";
const digest = args.sha256;
const mode = args.mode ?? "verify";
if (!Object.hasOwn(projects, target) || !["main", "drill"].includes(slot) || !/^[a-f0-9]{64}$/.test(digest ?? "") ||
  !["upload", "verify", "download"].includes(mode)) throw new Error("Registered target, slot, SHA-256 and mode are required");
const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "build", "cloudflare", "release-bundles", target, slot);
const tarPath = resolve(directory, `${digest}.tar.gz`);
const manifestPath = resolve(directory, `${digest}.json`);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || keychain("PWA Platform Cloudflare Pages Account ID");
const accessKey = process.env.PWA_PLATFORM_R2_ACCESS_KEY_ID || keychain("PWA Platform R2 Access Key ID");
const secretKey = process.env.PWA_PLATFORM_R2_SECRET_ACCESS_KEY || keychain("PWA Platform R2 Secret Access Key");
if (!/^[a-f0-9]{32}$/.test(accountId ?? "") || !/^[A-Za-z0-9+/=_-]+$/.test(accessKey ?? "") ||
  !/^[A-Za-z0-9+/=_-]+$/.test(secretKey ?? "")) {
  throw new Error("A Cloudflare account ID and bucket-scoped R2 S3 credentials are required");
}
const curlConfig = `user = "${accessKey}:${secretKey}"\naws-sigv4 = "aws:amz:auto:s3"\n`;
const prefix = `releases/${target}/${slot}/${digest}`;
const tarUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${prefix}.tar.gz`;
const manifestUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${prefix}.json`;
const temporary = mkdtempSync(join(tmpdir(), "pwa-r2-bundle-"));
try {
  if (mode === "download") {
    const remoteManifest = resolve(temporary, "manifest.json");
    const remoteTar = resolve(temporary, "release.tar.gz");
    requireStatus(request("GET", manifestUrl, remoteManifest), 200, "download manifest");
    requireStatus(request("GET", tarUrl, remoteTar), 200, "download archive");
    validate(remoteTar, remoteManifest);
    mkdirSync(directory, { recursive: true });
    copyVerified(remoteTar, tarPath);
    copyVerified(remoteManifest, manifestPath);
  } else {
    validate(tarPath, manifestPath);
    const remoteTar = resolve(temporary, "release.tar.gz");
    const remoteManifest = resolve(temporary, "manifest.json");
    const tarStatus = request("GET", tarUrl, remoteTar);
    const manifestStatus = request("GET", manifestUrl, remoteManifest);
    if (mode === "upload") {
      for (const [status, remote, local, name] of [
        [tarStatus, remoteTar, tarPath, "archive"],
        [manifestStatus, remoteManifest, manifestPath, "manifest"],
      ]) {
        if (status !== 404) {
          requireStatus(status, 200, `read existing ${name}`);
          if (!readFileSync(remote).equals(readFileSync(local))) throw new Error(`Existing R2 ${name} differs from the local bundle`);
        }
      }
      if (tarStatus === 404) requireStatus(request("PUT", tarUrl, tarPath, "application/gzip"), 200, "upload archive");
      if (manifestStatus === 404) requireStatus(request("PUT", manifestUrl, manifestPath, "application/json"), 200, "upload manifest");
    } else {
      requireStatus(tarStatus, 200, "verify archive");
      requireStatus(manifestStatus, 200, "verify manifest");
    }
    requireStatus(request("GET", tarUrl, remoteTar), 200, "read back archive");
    requireStatus(request("GET", manifestUrl, remoteManifest), 200, "read back manifest");
    if (!readFileSync(remoteTar).equals(readFileSync(tarPath)) ||
      !readFileSync(remoteManifest).equals(readFileSync(manifestPath))) throw new Error("R2 read-back differs from the local release bundle");
  }
  validate(tarPath, manifestPath);
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "restore:cloudflare:site", `--target=${target}`, `--slot=${slot}`, `--sha256=${digest}`, "--mode=check",
  ], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error("Downloaded release bundle failed the local restore check");
  process.stdout.write(JSON.stringify({ target, slot, sha256: digest, bucket, mode, readBackVerified: true }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function request(method, url, file, contentType) {
  const command = ["-q", "-K", "-", "--silent", "--show-error", "--output", method === "GET" ? file : "/dev/null",
    "--write-out", "%{http_code}", "--request", method];
  if (method === "PUT") command.push("--data-binary", `@${file}`, "--header", `Content-Type: ${contentType}`, "--header", "If-None-Match: *");
  command.push(url);
  const result = spawnSync("curl", command, { input: curlConfig, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0 || !/^\d{3}$/.test(result.stdout.trim())) throw new Error("R2 S3 request failed before a valid HTTP response");
  return Number(result.stdout.trim());
}
function requireStatus(actual, expected, action) {
  if (actual !== expected) throw new Error(`R2 ${action} returned HTTP ${actual}, expected ${expected}`);
}
function validate(bundle, manifestFile) {
  const bytes = readFileSync(bundle);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const origin = `https://${slot === "drill" ? "drill." : ""}${projects[target]}.pages.dev`;
  if (manifest.format !== 1 || manifest.target !== target || manifest.slot !== slot || manifest.project !== projects[target] ||
    manifest.origin !== origin || manifest.sha256 !== digest || manifest.bytes !== bytes.length || sha256(bytes) !== digest) {
    throw new Error("R2 release bundle metadata or SHA-256 does not match its key");
  }
}
function copyVerified(source, destination) {
  if (existsSync(destination) && !readFileSync(destination).equals(readFileSync(source))) {
    throw new Error("Local release bundle path has different bytes");
  }
  if (!existsSync(destination)) writeFileSync(destination, readFileSync(source));
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
