// Locks in RC2's requirements for scripts/recover-cloudflare-site.mjs (module spec, "修订：从 R2 恢复运营状态" →
// "契约增量"; plan "#### RC2"). This file only runs scenarios that must be refused before any credential lookup or
// subprocess call — never with real credentials, never with real pnpm/wrangler reaching Cloudflare or R2 — by
// copying the script into an empty temporary root: the script derives its repo root from its own file location
// (`resolve(import.meta.dirname, "..")`), so from an empty root it has no build/, no baselines, no package.json and
// no other scripts to fall into if an early check ever regressed. Every run also sets the credential environment
// variables to non-empty, deliberately fake values, so `process.env.X || keychain(...)` (inside the scripts this
// tool would otherwise invoke) never falls back to the macOS keychain. The full five-step happy path, and the
// step-failure/no-cleanup behavior, need a real R2 index and real Cloudflare credentials and are exercised only by
// the real, isolated-clone run (RC3), never here.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const scriptPath = resolve(repoRoot, "scripts", "recover-cloudflare-site.mjs");
const source = readFileSync(scriptPath, "utf8");

const fakeCredentialEnv = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: "not-a-real-token",
  CLOUDFLARE_ACCOUNT_ID: "not-a-real-account-id",
  PWA_PLATFORM_R2_ACCESS_KEY_ID: "not a real key",
  PWA_PLATFORM_R2_SECRET_ACCESS_KEY: "not a real secret",
};

/**
 * Copies the real script into a fresh, empty temp root at "<root>/scripts/recover-cloudflare-site.mjs" and runs it
 * there with the given arguments. Returns both the temp root (the caller must remove it) and the spawnSync result.
 */
function runCopyInEmptyRoot(args: readonly string[]) {
  const root = mkdtempSync(join(tmpdir(), "pwa-recover-script-safety-"));
  const scriptsDir = join(root, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const copiedScript = join(scriptsDir, "recover-cloudflare-site.mjs");
  writeFileSync(copiedScript, source);
  const result = spawnSync(process.execPath, [copiedScript, ...args], { encoding: "utf8", env: fakeCredentialEnv });
  return { root, result };
}

describe("recover-cloudflare-site.mjs is refused at the argument layer, before any state check or subprocess", () => {
  it("rejects an unsupported argument", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=react", "--slot=main"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Unsupported Cloudflare recovery argument");
      expect(result.stderr).not.toContain("credentials");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a target other than react or vue", () => {
    const { root, result } = runCopyInEmptyRoot(["--target=bogus"]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Target must be react or vue");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a missing --target", () => {
    const { root, result } = runCopyInEmptyRoot([]);
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Target must be react or vue");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("recover-cloudflare-site.mjs refuses to run when operational state already exists, before any subprocess", () => {
  it("refuses when build/cloudflare/react/main/ already exists", () => {
    const { root, result } = withExistingState("main");
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Operational state already exists");
      expect(result.stderr).toContain(join("build", "cloudflare", "react", "main"));
      assertNoCredentialOrSubprocessOutput(result.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses when build/cloudflare/react/retained/main/ already exists (staging directory absent)", () => {
    const { root, result } = withExistingState("retained/main");
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Operational state already exists");
      expect(result.stderr).toContain(join("build", "cloudflare", "react", "retained", "main"));
      assertNoCredentialOrSubprocessOutput(result.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * Builds the copied script's fixture at `<root>/scripts/recover-cloudflare-site.mjs`, then creates the existing
 * state directory at `<root>/build/cloudflare/<target>/<relative>/` before running it, so the state guard's
 * `existsSync` check (evaluated against the script's own `resolve(import.meta.dirname, "..")` repo root) finds it.
 */
function withExistingState(relative: string) {
  const root = mkdtempSync(join(tmpdir(), "pwa-recover-script-safety-state-"));
  const scriptsDir = join(root, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, "recover-cloudflare-site.mjs"), source);
  mkdirSync(resolve(root, "build", "cloudflare", "react", relative), { recursive: true });
  const result = spawnSync(process.execPath, [join(scriptsDir, "recover-cloudflare-site.mjs"), "--target=react"], {
    encoding: "utf8", env: fakeCredentialEnv,
  });
  return { root, result };
}

/**
 * Asserts the state guard stopped the script before it ever reached a credential lookup or ran the audit script (or
 * any other orchestrated step). The empty temp root has no `node_modules`, no `pnpm`-resolvable workspace and no
 * other scripts, so an attempted `pnpm audit:cloudflare:retention ...` invocation would surface as pnpm/module
 * resolution failure text (e.g. mentioning pnpm, the script name, or "package.json"); none of that may appear.
 */
function assertNoCredentialOrSubprocessOutput(stderr: string) {
  for (const forbidden of ["keychain", "Keychain", "Pages Token", "account ID", "audit:cloudflare:retention",
    "r2:cloudflare:bundle", "restore:cloudflare:site", "archive:cloudflare:site", "deploy:cloudflare:site", "pnpm", "package.json"]) {
    expect(stderr).not.toContain(forbidden);
  }
}

describe("recover-cloudflare-site.mjs stays read-only (static checks)", () => {
  it("never contains a write-mode invocation of any orchestrated script", () => {
    for (const forbidden of ["--mode=deploy", "--mode=upload", "--mode=record", "wrangler pages deploy"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never calls wrangler directly", () => {
    expect(source).not.toMatch(/\bwrangler\b/);
  });

  it("the state guard appears before the first subprocess call", () => {
    const guardIndex = source.indexOf("Operational state already exists");
    const firstSpawnIndex = source.indexOf("spawnSync(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(firstSpawnIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstSpawnIndex);
  });

  it("only accepts --target as an argument", () => {
    expect(source).toContain('key !== "target"');
  });

  it("runs the five steps in the spec's order", () => {
    const order = ["audit:cloudflare:retention", "r2:cloudflare:bundle", "restore:cloudflare:site", "archive:cloudflare:site", "r2:cloudflare:index"];
    let cursor = -1;
    for (const step of order) {
      const index = source.indexOf(`run(["${step}"`, cursor + 1);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  // 2026-09-22 spec change: a restored current deployment necessarily fails `deploy --mode=check` (that checks a new
  // candidate), so the last step is the read-only R2 index check, and deploy is never run as a step.
  it("ends with the read-only R2 index check and never runs deploy:cloudflare:site as a step", () => {
    expect(source).toContain('"r2:cloudflare:index"');
    expect(source).toContain('"--mode=check"], "verify the restored bundle');
    expect(source).not.toContain('run(["deploy:cloudflare:site"');
  });
});
