// Locks in P4's requirements for scripts/deploy-cloudflare-site.mjs's --mode=preview-candidate (module spec,
// "修订：上线前核验" → "契约增量" → "上传候选到预览分支"; plan "#### P4"). This file only runs scenarios that must be
// refused before any credential lookup or network request — never with real credentials, never with real wrangler
// on PATH — by copying the script into an empty temporary root: the script derives its repo root from its own file
// location (`resolve(import.meta.dirname, "..")`), so from an empty root it has no build/, no baselines and no
// node_modules/wrangler to fall into if an early check ever regressed. Every run also sets the credential
// environment variables to non-empty, deliberately fake values, so `process.env.X || keychain(...)` never falls
// back to the macOS keychain. The rest of the mode (upload, deployment diffing, Pages API readback) needs real
// Cloudflare credentials and is exercised only by the real run in P5, never here.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const scriptPath = resolve(repoRoot, "scripts", "deploy-cloudflare-site.mjs");
const source = readFileSync(scriptPath, "utf8");
// The public repository starts from a clean snapshot, so the pre-drill commit is stored as a fixture.
const beforeDrillSource = readFileSync(new URL("./fixtures/deploy-cloudflare-site.4594f56.mjs.txt", import.meta.url), "utf8");

/**
 * Copies the real script into a fresh, empty temp root at "<root>/scripts/deploy-cloudflare-site.mjs" and runs it
 * there with the given arguments. Returns both the temp root (the caller must remove it) and the spawnSync result.
 */
function runCopyInEmptyRoot(args: readonly string[]) {
  const root = mkdtempSync(join(tmpdir(), "pwa-deploy-script-safety-"));
  const scriptsDir = join(root, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const copiedScript = join(scriptsDir, "deploy-cloudflare-site.mjs");
  writeFileSync(copiedScript, source);
  const env = { ...process.env, CLOUDFLARE_API_TOKEN: "not-a-real-token", CLOUDFLARE_ACCOUNT_ID: "not-a-real-account-id" };
  const result = spawnSync(process.execPath, [copiedScript, ...args], { encoding: "utf8", env });
  return { root, result };
}

describe("deploy-cloudflare-site.mjs --mode=preview-candidate is refused at the argument layer", () => {
  it("rejects a non-main slot before build.json or any other file is read", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=react", "--slot=drill", "--mode=preview-candidate"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("preview-candidate mode requires --slot=main");
      expect(result.stderr).not.toContain("build.json");
      expect(result.stderr).not.toContain("ENOENT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still rejects an unsupported mode", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=react", "--mode=bogus"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Mode must be check, preflight, deploy or preview-candidate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("deploy-cloudflare-site.mjs preview-candidate branch stays isolated from production upload paths (static checks)", () => {
  // The whole `if (mode === "preview-candidate") { ... } else { ... }` statement appears exactly once in the file
  // (asserted below), so slicing the source between its opening brace and the single "} else {" reliably isolates
  // the preview-candidate branch's own text from the check/preflight/deploy branch that follows it.
  function previewCandidateBlock(): string {
    const start = source.indexOf('if (mode === "preview-candidate") {');
    const end = source.indexOf("\n} else {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("has exactly one preview-candidate/else split", () => {
    expect(source.split("} else {")).toHaveLength(2);
  });

  it("uploads with the literal --branch=candidate, never the branch variable", () => {
    const block = previewCandidateBlock();
    expect(block).toContain('"--branch=candidate"');
    expect(block).not.toContain("--branch=${branch}");
  });

  it("never reaches the mode === \"deploy\" production-upload block", () => {
    const block = previewCandidateBlock();
    expect(block).not.toContain('mode === "deploy"');
  });

  it("the production deploy path (after the split) still uses the branch variable, confirming the two paths differ", () => {
    const elseIndex = source.indexOf("\n} else {");
    const deployBlock = source.slice(elseIndex);
    expect(deployBlock).toContain("--branch=${branch}");
  });

  it("loads unique-origin.ts only via a dynamic import(), never a top-level static import", () => {
    const staticTsImportLines = source.split("\n").filter((line) => /^import\b.*\bfrom\s+"[^"]*\.ts"/.test(line));
    expect(staticTsImportLines).toEqual([]);
    expect(source).toMatch(/await import\(\s*new URL\(\s*"[^"]*unique-origin\.ts"/);
  });

  it("does not call the R2 index, archive, package, or retention audit commands inside the preview-candidate branch", () => {
    const block = previewCandidateBlock();
    for (const command of ["r2:cloudflare:bundle", "r2:cloudflare:index", "archive:cloudflare:site", "audit:cloudflare:retention"]) {
      expect(block).not.toContain(command);
    }
  });
});

// Locks in DR2's drill preflight/post-deploy automation (module spec, "修订：`drill` 上传前预检与上传后自动步骤"; plan
// "#### DR2"). Same isolation discipline as above: no real credentials, no network, no upload — every scenario is
// refused (or, for the one allowed-to-proceed scenario, only checked for the absence of the drill-specific refusal)
// before the script would ever reach `credentials()`.
describe("deploy-cloudflare-site.mjs drill artifact requirement is refused before credentials()", () => {
  const formatMessage = "--artifact-sha256 must be a 64-character lowercase hex SHA-256";
  const presenceMessage = "Drill preflight or deploy requires --artifact-sha256 once a baseline is frozen";

  it("rejects a malformed --artifact-sha256 at the argument layer, before any file is read", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=react", "--slot=drill", "--mode=deploy", "--artifact-sha256=nothex"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(formatMessage);
      expect(result.stderr).not.toContain("build.json");
      expect(result.stderr).not.toContain("ENOENT");
      expect(result.stderr).not.toContain("Pages Token");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * Builds the minimal fixture files under `root` needed for the script to reach DR2's drill artifact-presence
   * check (right after the baseline file is read, still before `credentials()`): a drill build receipt whose
   * fields satisfy every check the script runs first, plus a main and a drill release-baseline file. Both baseline
   * files' content is otherwise unused before that check, so `{}` is enough — the drill one only needs to exist,
   * so `baseline` is truthy and the check activates.
   *
   * `uploadDirectory` must equal the script's own `resolve(buildRoot, "site")` byte-for-byte (the script checks
   * that at "receipt.uploadDirectory !== site"). On macOS, `os.tmpdir()` returns a `/var/...` path that is itself
   * a symlink to `/private/var/...`, and Node's ESM loader resolves `import.meta.dirname` through that symlink —
   * so the script computes `site` from the `/private/var/...` form. `root` (from `mkdtempSync`) is still the
   * `/var/...` form, so the receipt is built from `realpathSync(root)` to match what the running script will see.
   */
  function writeDrillPreCredentialFixture(root: string) {
    const project = "pwa-platform-react-demo";
    const realRoot = realpathSync(root);
    const buildRoot = resolve(realRoot, "build", "cloudflare", "react", "drill");
    mkdirSync(buildRoot, { recursive: true });
    writeFileSync(resolve(buildRoot, "build.json"), JSON.stringify({
      target: "react",
      slot: "drill",
      project,
      uploadDirectory: resolve(buildRoot, "site"),
      origin: `https://drill.${project}.pages.dev`,
      release: "v2",
    }));
    const baselineDirectory = resolve(realRoot, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline");
    mkdirSync(baselineDirectory, { recursive: true });
    writeFileSync(resolve(baselineDirectory, "react-main.json"), "{}");
    writeFileSync(resolve(baselineDirectory, "react-drill.json"), "{}");
  }

  it("rejects a missing --artifact-sha256 for --slot=drill --mode=deploy once a baseline exists, before credentials()", () => {
    const root = mkdtempSync(join(tmpdir(), "pwa-deploy-script-safety-"));
    try {
      const scriptsDir = join(root, "scripts");
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(join(scriptsDir, "deploy-cloudflare-site.mjs"), source);
      writeDrillPreCredentialFixture(root);
      const env = { ...process.env, CLOUDFLARE_API_TOKEN: "not-a-real-token", CLOUDFLARE_ACCOUNT_ID: "not-a-real-account-id" };
      const result = spawnSync(process.execPath, [
        join(scriptsDir, "deploy-cloudflare-site.mjs"), "--target=react", "--slot=drill", "--mode=deploy",
      ], { encoding: "utf8", env });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(presenceMessage);
      expect(result.stderr).not.toContain("Pages Token");
      expect(result.stderr).not.toContain("account ID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not reject --slot=drill --mode=check for a missing --artifact-sha256 (it may fail later for unrelated reasons)", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=react", "--slot=drill", "--mode=check"]);
    try {
      expect(result.stderr).not.toContain(presenceMessage);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("deploy-cloudflare-site.mjs drill post-deploy block (static checks)", () => {
  function drillPostDeployBlock(): string {
    const start = source.indexOf('if (slot === "drill" && baseline) {');
    const end = source.indexOf('\n  }\n}', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("writes the R2 deployment index in record mode and archives the site", () => {
    const block = drillPostDeployBlock();
    expect(block).toContain("r2:cloudflare:index");
    expect(block).toContain("--mode=record");
    expect(block).toContain("archive:cloudflare:site");
  });

  it("never runs the retention audit", () => {
    const block = drillPostDeployBlock();
    expect(block).not.toContain("audit:cloudflare:retention");
  });

  it("keeps every line from baseline 4594f56 unchanged: DR2 only inserted new lines, it never removed or edited one", () => {
    const headLines = beforeDrillSource.split("\n");
    const currentLines = source.split("\n");
    let cursor = 0;
    for (const line of currentLines) {
      if (cursor < headLines.length && line === headLines[cursor]) cursor++;
    }
    expect(cursor).toBe(headLines.length);
  });

  it("main's repeat-upload preflight block is byte-identical to baseline 4594f56", () => {
    const headSource = beforeDrillSource;
    const marker = 'if (mode !== "check" && slot === "main" && deployments.length > 0) {';
    const headStart = headSource.indexOf(marker);
    const headEnd = headSource.indexOf('\n  if (mode === "deploy") {', headStart);
    expect(headStart).toBeGreaterThan(-1);
    expect(headEnd).toBeGreaterThan(headStart);
    const headBlock = headSource.slice(headStart, headEnd);
    expect(source).toContain(headBlock);
  });

  it("main's post-deploy block is byte-identical to baseline 4594f56", () => {
    const headSource = beforeDrillSource;
    const marker = 'if (slot === "main" && deployments.length > 0) {';
    const headStart = headSource.indexOf(marker);
    const headEnd = headSource.indexOf('\n  }\n}', headStart);
    expect(headStart).toBeGreaterThan(-1);
    expect(headEnd).toBeGreaterThan(headStart);
    const headBlock = headSource.slice(headStart, headEnd);
    expect(source).toContain(headBlock);
  });
});

// Locks in XC3's screenshot allowlist addition (module spec, "修订：示例接入离线页、manifest 扩展字段与网络超时" →
// "契约增量" → "Cloudflare 脚本白名单"; plan "#### XC3"). Both scenarios below are refused, or pass, before
// credentials() is ever reached: the fixture gives every file a correct SHA-256 in the build receipt except one,
// so a run that gets past the "Unexpected upload file" check but still fails does so on that one deliberate hash
// mismatch — never on a real Cloudflare or wrangler call.
describe("deploy-cloudflare-site.mjs --slot=main upload file allowlist (static, pre-credential)", () => {
  const identity = {
    appId: "pwareactdemo", manifestId: "/app/", origin: "https://pwa-platform-react-demo.pages.dev", scope: "/app/",
    serviceWorkerUrl: "/app/sw.js", manifestUrl: "/app/manifest.webmanifest", mountPath: "/app/",
    environment: "test", cacheNamespaceSeed: "r1",
  };
  const sha256 = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

  /**
   * Builds a copied-script fixture whose main-slot deploy reaches the upload file allowlist: a matching react-main
   * baseline, a build receipt whose identity and origin equal it, and a site/ directory with the required files
   * plus `extraFiles`. Every file gets its real SHA-256 in the receipt, except `wrongHashFile` (if given), which
   * gets a deliberately incorrect one — so a run that clears the allowlist still stops locally at that file's hash
   * check, never reaching `credentials()` or `wrangler`.
   */
  function writeMainAllowlistFixture(extraFiles: readonly string[], wrongHashFile?: string) {
    const root = mkdtempSync(join(tmpdir(), "pwa-deploy-script-safety-allowlist-"));
    const realRoot = realpathSync(root);
    const scriptsDir = join(realRoot, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, "deploy-cloudflare-site.mjs"), source);

    const baselineDirectory = resolve(realRoot, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline");
    mkdirSync(baselineDirectory, { recursive: true });
    writeFileSync(resolve(baselineDirectory, "react-main.json"), JSON.stringify(identity));

    const buildRoot = resolve(realRoot, "build", "cloudflare", "react", "main");
    const site = resolve(buildRoot, "site");
    const files = [
      "_headers", "app/index.html", "app/offline.html", "app/sw.js", "app/pwa-recovery-worker.js",
      "app/manifest.webmanifest", ...extraFiles,
    ];
    const receiptFiles: Record<string, string> = {};
    for (const file of files) {
      const content = `content of ${file}`;
      mkdirSync(resolve(site, file, ".."), { recursive: true });
      writeFileSync(resolve(site, file), content);
      receiptFiles[file] = file === wrongHashFile ? "0".repeat(64) : sha256(content);
    }
    writeFileSync(resolve(buildRoot, "build.json"), JSON.stringify({
      target: "react", slot: "main", project: "pwa-platform-react-demo", uploadDirectory: site,
      identity, origin: identity.origin, release: "v1", files: receiptFiles,
    }));

    const env = { ...process.env, CLOUDFLARE_API_TOKEN: "not-a-real-token", CLOUDFLARE_ACCOUNT_ID: "not-a-real-account-id" };
    const result = spawnSync(process.execPath, [
      join(scriptsDir, "deploy-cloudflare-site.mjs"), "--target=react", "--mode=check",
    ], { encoding: "utf8", env });
    return { root, result };
  }

  it("accepts app/screenshots/(wide|narrow).png, stopping only at the deliberate hash mismatch", () => {
    const { root, result } = writeMainAllowlistFixture(
      ["app/screenshots/wide.png", "app/screenshots/narrow.png"], "app/screenshots/narrow.png",
    );
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("Unexpected upload file");
      expect(result.stderr).toContain("Staging file changed after build: app/screenshots/narrow.png");
      expect(result.stderr).not.toContain("Pages Token");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still rejects a screenshots file outside the allowlist", () => {
    const { root, result } = writeMainAllowlistFixture(["app/screenshots/other.png"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Unexpected upload file: app/screenshots/other.png");
      expect(result.stderr).not.toContain("Pages Token");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
