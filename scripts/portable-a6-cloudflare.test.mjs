import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const source = resolve(import.meta.dirname, "..");
const archive = resolve(source, "docs/review/2026-10-01/evidence/portable-v1.tgz");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pwa-a6-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const copy = (path) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    copyFileSync(resolve(source, path), resolve(root, path));
  };
  copy("scripts/portable-a6-cloudflare.mjs");
  copy("docs/operations/portable-a6-targets.json");
  copy("docs/operations/portable-a6-baseline-a.json");
  const stage = resolve(root, "packages/vite/browser-build/a6-portable/v1");
  mkdirSync(stage, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", stage]);
  return { root, stage };
}

function run(root, mode = "status") {
  return spawnSync(process.execPath, [resolve(root, "scripts/portable-a6-cloudflare.mjs"),
    "--target=a", "--version=v1", `--mode=${mode}`], {
    cwd: root, encoding: "utf8", env: { ...process.env, USER: "pwa-a6-preflight-no-keychain-user", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" },
  });
}

test("accepts the archived candidate only with the registered frozen identity", (t) => {
  const { root } = fixture(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    target: "a", project: "pwa-platform-portable-a6-a", origin: "https://pwa-platform-portable-a6-a.pages.dev",
    version: "v1", treeSha256: "912af69463f719bb24173afbc4cd67d9d0a4218be8002e9695e18dcdded1c5ac", files: 13,
  });
});

test("rejects a missing or changed identity baseline before cloud credentials", (t) => {
  const { root } = fixture(t);
  const baselinePath = resolve(root, "docs/operations/portable-a6-baseline-a.json");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const scopeChanged = { ...baseline, identity: { ...baseline.identity, scope: "/other/" } };
  writeFileSync(baselinePath, JSON.stringify(scopeChanged));
  const changed = run(root, "deploy");
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /frozen origin identity baseline differs/);
  assert.doesNotMatch(changed.stderr, /credential unavailable|Pages project lookup/);

  const originChanged = { ...baseline, origin: "https://wrong.example" };
  writeFileSync(baselinePath, JSON.stringify(originChanged));
  const wrongOrigin = run(root, "deploy");
  assert.equal(wrongOrigin.status, 1);
  assert.match(wrongOrigin.stderr, /frozen origin identity baseline differs/);
  assert.doesNotMatch(wrongOrigin.stderr, /credential unavailable|Pages project lookup/);

  unlinkSync(baselinePath);
  const missing = run(root, "deploy");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ENOENT/);
  assert.doesNotMatch(missing.stderr, /credential unavailable|Pages project lookup/);
});

test("rejects upload-byte tampering before cloud credentials", (t) => {
  const { root, stage } = fixture(t);
  writeFileSync(resolve(stage, "site/app/index.html"), "tampered");
  const result = run(root, "deploy");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /A6 file changed: app\/index.html/);
  assert.doesNotMatch(result.stderr, /credential unavailable|Pages project lookup/);
});
