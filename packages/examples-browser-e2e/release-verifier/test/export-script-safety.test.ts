// Locks in two M6 fix-round requirements for scripts/audit-cloudflare-retention.mjs, which lives outside this
// package (it is not compiled/type-stripped the way release-verifier's own .ts files are) so it is checked here by
// reading its source and by spawning it as a real subprocess with deliberately absent credentials:
//
// 1. The ordinary audit path (no --export-history) must stay pure .mjs. The repo's `engines.node` floor is
//    22.0.0, and Node before 22.18 does not strip TypeScript types by default (before 22.6 not at all), so a
//    top-level `import ... from ".../*.ts"` would break the ordinary audit path on those Node versions. The three
//    release-verifier .ts modules the export path needs (out-dir.ts, out-dir-io.ts, history-export.ts) must only
//    ever be loaded with a dynamic `import()`, inside the functions --export-history actually uses.
// 2. --export-history's output path (already exists / parent missing / inside the repo or a worktree) must be
//    refused before any credential lookup or network request. Every scenario below runs with each credential
//    variable set to a NON-EMPTY, deliberately malformed value. The script reads `process.env.X || keychain(...)`,
//    so a non-empty value means the macOS keychain is never consulted, and the malformed values fail the script's
//    own credential format check before any network request. If this ordering ever regresses, the run therefore
//    stops at "credentials are required" — which the stderr assertions below reject — instead of reading real
//    keychain secrets or calling Cloudflare. (Deleting the variables would do the opposite: an empty value makes
//    the script fall back to the keychain.)
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(import.meta.dirname, "..", "..", "..", "..", "scripts", "audit-cloudflare-retention.mjs");
const source = readFileSync(scriptPath, "utf8");

/**
 * Runs the script with every credential variable set to a non-empty, malformed value: the keychain fallback is
 * never reached, and the format check rejects them before any network request (see the header comment).
 */
function runScript(args: readonly string[]) {
  const env = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: "not-a-real-account-id",
    CLOUDFLARE_API_TOKEN: "not-a-real-token",
    PWA_PLATFORM_R2_ACCESS_KEY_ID: "not a real key",
    PWA_PLATFORM_R2_SECRET_ACCESS_KEY: "not a real secret",
  };
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8", env });
}

describe("audit-cloudflare-retention.mjs stays free of TypeScript on the ordinary audit path", () => {
  it("has no top-level static import of a release-verifier .ts module", () => {
    const staticTsImportLines = source.split("\n").filter((line) => /^import\b.*\bfrom\s+"[^"]*\.ts"/.test(line));
    expect(staticTsImportLines).toEqual([]);
  });

  it("loads out-dir.ts, out-dir-io.ts and history-export.ts only via dynamic import()", () => {
    for (const module of ["out-dir.ts", "out-dir-io.ts", "history-export.ts"]) {
      expect(source).toMatch(new RegExp(`await import\\(\\s*new URL\\(\\s*"[^"]*${module.replace(".", "\\.")}"`));
    }
  });

  it("fails an unsupported argument during argument parsing, before any credential lookup or network request", () => {
    const result = runScript(["--target=react", "--bogus=1"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported retention audit argument");
    expect(result.stderr).not.toContain("credentials are required");
  });
});

describe("audit-cloudflare-retention.mjs refuses a bad --export-history path before any credential lookup", () => {
  it("refuses a path that already exists", () => {
    const scratch = mkdtempSync(join(tmpdir(), "pwa-export-script-safety-"));
    try {
      const outPath = join(scratch, "existing-history.json");
      writeFileSync(outPath, "{}");
      const result = runScript(["--target=react", `--export-history=${outPath}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`--export-history file already exists: ${outPath}`);
      expect(result.stderr).not.toContain("credentials are required");
      expect(existsSync(outPath)).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("refuses a path inside the repository", () => {
    const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
    // The repository root itself, not `build/`: `build/` is git-ignored and absent from a fresh checkout, where the
    // script would then refuse for a missing parent directory instead of reaching the forbidden-root check.
    const outPath = join(repoRoot, "pwa-export-script-safety-inside-repo.json");
    const result = runScript(["--target=react", `--export-history=${outPath}`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Output directory is inside a forbidden root");
    expect(result.stderr).not.toContain("credentials are required");
    expect(existsSync(outPath)).toBe(false);
  });
});
