// The local gate's executor (ADR-0031, spec/platform-governance.md "修订：本地门禁工具入仓"): resolves and verifies
// the release commit, builds a fresh, detached worktree per required Node version, switches to a clean environment
// so every command and its log header run under the declared Node with no leaked pnpm/npm/CI state, hashes every
// log, and writes the machine-readable results plus the rendered Markdown record. The pure pieces (command list,
// verdict, log header format, record rendering) live in the sibling modules unchanged — this module is the only
// one that spawns processes, touches git or writes files.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  accessSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { GATE_COMMANDS, type PwaGateCommand } from "./gate-commands.js";
import {
  gateVerdict,
  type PwaGateCommandOutcome,
  type PwaGateCommitOutcome,
  type PwaGateNodeVersionOutcome,
  type PwaGateProbeFailureOutcome,
  type PwaGateRoundErrorOutcome,
  type PwaGateRunResults,
  type PwaGateTimeoutOutcome,
  type PwaGateToolStaleReason,
  type PwaGateVerdict,
  type PwaGateWorktreeOutcome,
} from "./gate-verdict.js";
import { logHeader } from "./log-header.js";
import { renderRecord, type PwaGateRecordMeta, type PwaGateRecordRoundRow, type PwaGateRecordRow } from "./render-record.js";
import { DEFAULT_NODE_MAJORS } from "./node-majors.js";

const MAC_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** This module's own directory: `dist/` once built, `src/` when run directly (e.g. under vitest). Used to find
 * the package root (N1's `toolDir` default) and `build-info.json` (N1), both independently of `process.cwd()` —
 * which a caller could invoke this tool from anywhere, unrelated to where the tool itself lives on disk. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** The package's own root: one level up from `MODULE_DIR` whether that's `dist/` (built) or `src/` (source). */
const PACKAGE_DIR = resolve(MODULE_DIR, "..");

/** This tool's own default per-command timeout, not an ADR-0031 requirement: 30 minutes, chosen to comfortably
 * exceed CI's own 20-minute job cap (.github/workflows/ci.yml `timeout-minutes: 20`) while still catching a
 * genuinely hung command. */
const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

/** Env vars stripped verbatim (exact name match, not a prefix) before every command and probe (S3). */
const STRIPPED_ENV_KEYS = new Set(["NODE", "NODE_OPTIONS", "INIT_CWD"]);
const STRIPPED_ENV_PREFIXES = ["npm_", "PNPM_SCRIPT_", "npm_config_"];

export type PwaGateRunNodeTarget = {
  readonly major: number;
  readonly path: string;
};

export type PwaGateRunOptions = {
  readonly repo: string;
  readonly commit: string;
  readonly out: string;
  readonly nodes: readonly PwaGateRunNodeTarget[];
  readonly signer: string;
  readonly availabilityCheck: string;
  readonly recordId?: string;
  readonly chrome?: string;
  readonly commands?: readonly PwaGateCommand[];
  /** ADR-0031's Node matrix by default (B2): every one of these majors must have a round, or the gate refuses. */
  readonly requiredMajors?: readonly number[];
  /** Per-command timeout (S6). Default 30 minutes. */
  readonly commandTimeoutMs?: number;
  /** Directory to read the gate tool's own CURRENT commit/dirty status from (S8, N1). Default: this package's own
   * root, resolved from `import.meta.url` — not `process.cwd()`, which a caller could invoke this tool from
   * anywhere, unrelated to where the tool itself lives on disk. */
  readonly toolDir?: string;
  /** Reads the tool's build-time commit/dirty snapshot (N1). Default: `build-info.json` next to the running
   * module (`dist/build-info.json` once built, written by the package's own `build` script after `tsc`).
   * Injectable so a test can hold this fixed without a real build. */
  readonly toolBuildInfoReader?: () => PwaGateToolCommitSnapshot | undefined;
  /** Reads the tool's CURRENT commit/dirty status from `toolDir` (S8, N1). Default: real git. Injectable
   * independently of `toolBuildInfoReader`, so a test can hold both sides fixed regardless of this worktree's
   * real git state. */
  readonly toolGitInfoReader?: (toolDir: string) => PwaGateToolCommitSnapshot;
};

/** A commit + dirty-working-tree snapshot of the gate tool's own repository (N1), taken either at build time
 * (from `dist/build-info.json`) or right now (from real git against `toolDir`). */
export type PwaGateToolCommitSnapshot = {
  readonly commit: string;
  readonly dirty: boolean;
};

export type PwaGateToolStalenessDeps = {
  readonly readBuildInfo: () => PwaGateToolCommitSnapshot | undefined;
  readonly readCurrentGitInfo: () => PwaGateToolCommitSnapshot;
};

export type PwaGateToolStaleness = {
  readonly buildInfo: PwaGateToolCommitSnapshot | undefined;
  readonly current: PwaGateToolCommitSnapshot;
  readonly reasons: readonly PwaGateToolStaleReason[];
};

/**
 * Compares the tool's build-time snapshot against its current one (N1) and lists every reason it looks stale, so
 * a signed record can never claim a tool version it did not actually run. Pure over the two injected readers —
 * no fs or git access of its own — so this is unit-testable without a real build or a real git repository.
 */
export function resolveToolStaleness(deps: PwaGateToolStalenessDeps): PwaGateToolStaleness {
  const buildInfo = deps.readBuildInfo();
  const current = deps.readCurrentGitInfo();
  const reasons: PwaGateToolStaleReason[] = [];

  if (buildInfo === undefined) {
    reasons.push("missing-build-info");
  } else {
    if (buildInfo.commit !== current.commit) reasons.push("commit-mismatch");
    if (buildInfo.dirty) reasons.push("dirty-at-build");
  }
  if (current.dirty) reasons.push("dirty-now");

  return { buildInfo, current, reasons };
}

export type PwaGateRunRefusalCode =
  | "no-nodes"
  | "missing-required-node"
  | "out-exists"
  | "out-inside-repo"
  | "node-path-invalid"
  | "node-major-mismatch"
  | "commit-unresolved";

export class PwaGateRunError extends Error {
  readonly code: PwaGateRunRefusalCode;

  constructor(code: PwaGateRunRefusalCode, message: string) {
    super(message);
    this.name = "PwaGateRunError";
    this.code = code;
  }
}

export type PwaGateRunCommandResult = {
  readonly command: string;
  readonly blocking: boolean;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly logFile: string;
  readonly logSha256: string;
};

export type PwaGateRunRound = {
  readonly node: PwaGateRunNodeTarget;
  readonly observedCommit: string;
  readonly observedNodeVersion: string;
  readonly observedPnpmVersion: string;
  readonly observedChromeVersion: string;
  /** The round's env PATH, first entry (S3): proves the declared Node's directory was actually put first. */
  readonly pathHead: string;
  /** `command -v pnpm` inside the round's env (S3). */
  readonly pnpmWhich: string;
  /** `node -p process.execPath` inside the round's env (S3, N2): whatever `node` resolves to on the round's own
   * PATH. This is *not* necessarily what `pnpm` itself runs under — see `pnpmRuntime` for that; the two can
   * differ (e.g. a corepack-managed pnpm shim pinning its own Node). */
  readonly pathNode: string;
  /** The node resolved from pnpm's own shebang (`command -v pnpm`'s file, read directly), or the literal string
   * "native pnpm binary" when that file has no shebang at all (N2). Empty when `pnpmWhich` itself is empty. */
  readonly pnpmRuntime: string;
  /** The first line of the file `pnpmWhich` points to, verbatim, whichever branch `pnpmRuntime` took (N2). Empty
   * when `pnpmWhich` is empty or the file could not be read. */
  readonly pnpmShebang: string;
  readonly worktreeDir: string;
  readonly commands: readonly PwaGateRunCommandResult[];
  readonly worktreeRemoved: boolean;
  /** Version probes whose output was not a clean single line (S5), recorded instead of thrown. */
  readonly probeFailures: readonly string[];
  /** Set when the round threw before it could finish (S5); the worktree is still cleaned up regardless. */
  readonly error?: string;
};

export type PwaGateRunAvailabilityCheckResult = {
  readonly command: string;
  readonly output: string;
  readonly exitCode: number;
  readonly utc: string;
};

export type PwaGateRunResultsFile = {
  readonly meta: {
    readonly repo: string;
    /** The commit exactly as passed on the command line, before resolution (B1). */
    readonly requestedCommit: string;
    /** The full 40-char SHA `git rev-parse --verify` resolved it to; every round checks this out (B1). */
    readonly resolvedCommit: string;
    readonly recordId: string;
    readonly signer: string;
    readonly requiredMajors: readonly number[];
    readonly startUtc: string;
    readonly endUtc: string;
    /** The gate tool's own CURRENT commit and dirty status (S8), read from `toolDir`. */
    readonly toolCommit: string;
    readonly toolDirty: boolean;
    /** The tool's build-time commit/dirty snapshot (N1), or `null` when `build-info.json` was missing — itself a
     * `tool-stale` verdict failure, not just an absent field. */
    readonly toolBuild: PwaGateToolCommitSnapshot | null;
  };
  readonly availabilityCheck: PwaGateRunAvailabilityCheckResult;
  readonly rounds: readonly PwaGateRunRound[];
  readonly verdict: PwaGateVerdict;
};

type ShellResult = {
  readonly output: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
};

/** Poll interval for `waitForExitFile`'s busy-wait (N3): short enough that a fast command's exit is observed
 * promptly, long enough not to spin the CPU pointlessly while waiting on a slow one. */
const POLL_INTERVAL_MS = 50;

/**
 * Blocks the current thread until `exitFile` appears or `timeoutMs` elapses (N3), without depending on the Node
 * event loop or any child-process 'exit' callback: `Atomics.wait` sleeps the thread directly (it does not pump
 * libuv), and completion is detected by the marker file the spawned shell writes for itself — a purely
 * synchronous function cannot rely on an async event callback ever being processed while it is still running.
 */
function waitForExitFile(exitFile: string, timeoutMs: number): boolean {
  const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(exitFile)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    Atomics.wait(sleepBuffer, 0, 0, Math.min(POLL_INTERVAL_MS, remaining));
  }
  return existsSync(exitFile);
}

/**
 * Runs `command` through the shell with stderr folded into stdout, in its own detached process group (N3): on
 * timeout, every descendant it spawned is killed via `process.kill(-pid, "SIGKILL")`, not just the shell itself —
 * `spawnSync`'s built-in `timeout` option (the previous implementation) only ever signals the one pid it is
 * watching, leaving an orphaned grandchild (e.g. a backgrounded `sleep`) running past the timeout.
 *
 * Wrapped as `( <command>\n) > file 2>&1` (S9) — a *subshell*, not the `{ ... }` grouping the previous
 * implementation used — for two reasons: the redirection still applies to the whole compound command (guarding
 * against a trailing `# comment` swallowing a same-line `2>&1`, same as before), and a subshell scopes a bare
 * `exit N` inside `command` to itself. `{ ... }` does not fork a subshell, so `exit N` there would terminate the
 * *entire* wrapper script — including the `printf` line below that records the exit code — before it could run.
 * The exit code is captured to a second file after the subshell finishes, since a purely synchronous wait (see
 * `waitForExitFile`) cannot rely on `spawn`'s own 'exit' event.
 */
function sh(command: string, cwd: string | undefined, env: NodeJS.ProcessEnv, timeoutMs: number): ShellResult {
  const runDir = mkdtempSync(join(os.tmpdir(), "pwa-gate-sh-"));
  const outputFile = join(runDir, "output.log");
  const exitFile = join(runDir, "exit-code");
  try {
    // The exit code is written to a temporary file and renamed into place: the wait below polls for the file's
    // existence, and a plain `>` would let it read an empty file between creation and write.
    const wrapped = `(\n${command}\n) > "${outputFile}" 2>&1\nstatus=$?\nprintf '%s' "$status" > "${exitFile}.tmp" && mv "${exitFile}.tmp" "${exitFile}"\n`;
    const child = spawn("/bin/sh", ["-c", wrapped], { cwd, env, detached: true, stdio: "ignore" });
    // Swallow a spawn-level error (e.g. ENOENT for /bin/sh) instead of an unhandled 'error' event; the missing
    // exit file after the wait below is what reports the failure either way.
    child.on("error", () => {});

    const pid = child.pid;
    if (pid === undefined) {
      return { output: "", exitCode: 1, timedOut: false };
    }

    const finished = waitForExitFile(exitFile, timeoutMs);
    const timedOut = !finished;
    if (timedOut) {
      try {
        // Negative pid signals the whole process group (POSIX), not just `pid` itself — this is the fix: every
        // grandchild the command spawned (e.g. a backgrounded job) dies too, not only the shell.
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    child.unref();

    const output = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "";
    if (timedOut) {
      return { output, exitCode: -1, timedOut: true };
    }
    const parsedExit = Number.parseInt(readFileSync(exitFile, "utf8").trim(), 10);
    return { output, exitCode: Number.isNaN(parsedExit) ? 1 : parsedExit, timedOut: false };
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

/** Injectable so `removeWorktree`'s verification-failure path (S7) can be exercised directly, without needing a
 * real `git worktree list` to fail on disk. */
export type PwaGateGitRunner = (args: readonly string[]) => { readonly output: string; readonly exitCode: number };

const git: PwaGateGitRunner = (args) => {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { output: `${result.stdout ?? ""}${result.stderr ?? ""}`, exitCode: result.status ?? 1 };
};

function isValidNodePath(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseNodeMajor(versionOutput: string): number | undefined {
  const match = /^v?(\d+)\./.exec(versionOutput.trim());
  if (match === null) return undefined;
  const majorText = match[1];
  return majorText === undefined ? undefined : Number(majorText);
}

/** Every character outside `[A-Za-z0-9._-]` becomes `-`, so an unusual command string can never escape `out/`. */
function logFileName(major: number, command: string): string {
  const sanitized = command.replace(/[^A-Za-z0-9._-]/g, "-");
  return `node${major}-${sanitized}.log`;
}

/** Parses `git worktree list --porcelain` into the `worktree <path>` line values, one per worktree. */
export function parsePorcelainWorktreePaths(porcelain: string): readonly string[] {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim());
}

/**
 * Exact-match check (S7) — deliberately not a substring check: `worktree-node2` is a substring of
 * `worktree-node22`, so a naive `.includes()` reports node2's worktree as still present after node22 removed
 * its own (or the reverse), which is the bug this replaces.
 */
export function isWorktreeListedExact(porcelain: string, target: string): boolean {
  return parsePorcelainWorktreePaths(porcelain).includes(target);
}

/** Resolves a path's realpath even when the path itself does not exist yet, by realpath-ing its nearest ancestor. */
function realpathOfPossiblyMissing(path: string): string {
  let current = path;
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return path;
    suffix.unshift(basename(current));
    current = parent;
  }
  const real = realpathSync(current);
  return suffix.length > 0 ? join(real, ...suffix) : real;
}

function withTrailingSep(path: string): string {
  return path.endsWith(sep) ? path : path + sep;
}

/**
 * Refuses (S4) when `out`'s realpath is the repo's own toplevel, lies inside it, or lies inside any worktree
 * `git worktree list` currently knows about. Both sides are realpath'd before comparing, so a symlinked repo or
 * worktree cannot be used to sneak the output directory back inside.
 */
function isOutsideRepoAndWorktrees(outAbs: string, repo: string): boolean {
  const outReal = withTrailingSep(realpathOfPossiblyMissing(outAbs));

  const boundaries: string[] = [];
  const toplevel = git(["-C", repo, "rev-parse", "--show-toplevel"]).output.trim();
  if (toplevel.length > 0 && existsSync(toplevel)) boundaries.push(realpathSync(toplevel));

  const list = git(["-C", repo, "worktree", "list", "--porcelain"]);
  for (const path of parsePorcelainWorktreePaths(list.output)) {
    if (existsSync(path)) boundaries.push(realpathSync(path));
  }

  return boundaries.every((boundary) => {
    const boundaryWithSep = withTrailingSep(boundary);
    return outReal !== boundaryWithSep && !outReal.startsWith(boundaryWithSep);
  });
}

function resolveChromeCandidate(explicitPath: string | undefined): string {
  return explicitPath ?? (existsSync(MAC_CHROME_PATH) ? MAC_CHROME_PATH : "google-chrome");
}

/**
 * Reads a version probe's stdout (S5): a probe is never allowed to throw the round over a surprising output
 * shape. When the trimmed output still contains a newline (more than one line came back), the probe is recorded
 * as failed and an empty string is used in its place, instead of feeding a multi-line value into `logHeader`
 * (which would throw) or trusting a value that was never actually a single version string.
 */
function readSingleLineProbe(result: ShellResult, probeName: string, probeFailures: string[]): string {
  if (result.timedOut) {
    probeFailures.push(probeName);
    return "";
  }
  const trimmed = result.output.trim();
  if (trimmed.includes("\n")) {
    probeFailures.push(probeName);
    return "";
  }
  return trimmed;
}

/**
 * Resolves `commit` against `repo` to a full 40-char SHA (B1), refusing instead of writing anything when it
 * cannot be resolved. `--end-of-options` stops git from ever treating a `--commit`-supplied value starting with
 * `-` as a flag (e.g. a value of `-f`), and `<commit>^{commit}` requires the ref to actually name a commit.
 */
function resolveCommit(repo: string, commit: string): string {
  const result = spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--end-of-options", `${commit}^{commit}`], {
    encoding: "utf8",
  });
  const resolved = (result.stdout ?? "").trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(resolved)) {
    const detail = (result.stderr ?? "").trim();
    throw new PwaGateRunError("commit-unresolved", `Could not resolve commit "${commit}" in ${repo} to a commit SHA${detail.length > 0 ? `: ${detail}` : ""}`);
  }
  return resolved;
}

/**
 * Refuses (throwing `PwaGateRunError`, writing nothing) when: no Node version is declared at all; a required
 * major (B2) has no declared node; the output directory already exists or lies inside the repo or one of its
 * worktrees (S4); or a declared Node path does not exist, is not executable, or its major does not match what
 * `<path> -v` reports. Every check runs before anything is created on disk.
 */
function assertCanRun(out: string, repo: string, nodes: readonly PwaGateRunNodeTarget[], requiredMajors: readonly number[]): void {
  // With nothing to run, the verdict would have nothing to fail on; refuse instead of reporting an empty pass.
  if (nodes.length === 0) {
    throw new PwaGateRunError("no-nodes", "At least one Node version is required");
  }

  const declaredMajors = new Set(nodes.map((node) => node.major));
  const missingMajors = requiredMajors.filter((major) => !declaredMajors.has(major));
  if (missingMajors.length > 0) {
    throw new PwaGateRunError(
      "missing-required-node",
      `Missing required Node major(s): ${missingMajors.join(", ")}. Pass --node <major>=<path> for each of ${requiredMajors.join(", ")}.`,
    );
  }

  if (existsSync(out)) {
    throw new PwaGateRunError("out-exists", `Output directory already exists: ${out}`);
  }

  if (!isOutsideRepoAndWorktrees(out, repo)) {
    throw new PwaGateRunError("out-inside-repo", `Output directory must be outside the repo and its worktrees: ${out}`);
  }

  for (const node of nodes) {
    if (!isValidNodePath(node.path)) {
      throw new PwaGateRunError("node-path-invalid", `Node path does not exist or is not executable: ${node.path}`);
    }

    const versionResult = spawnSync(node.path, ["-v"], { encoding: "utf8" });
    const observedMajor = parseNodeMajor(versionResult.stdout ?? "");
    if (observedMajor === undefined || observedMajor !== node.major) {
      throw new PwaGateRunError(
        "node-major-mismatch",
        `Declared Node ${node.major} but "${node.path} -v" reported "${(versionResult.stdout ?? "").trim()}"`,
      );
    }
  }
}

/** Builds a clean env (S3) for a command or probe. `nodePath` is omitted for the availability check, which runs
 * outside any Node round and has no declared Node to prepend. */
function buildCleanEnv(nodePath: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (STRIPPED_ENV_KEYS.has(key)) continue;
    if (STRIPPED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    env[key] = value;
  }

  const existingPath = env["PATH"] ?? "";
  const filteredPath = existingPath.split(":").filter((entry) => !entry.includes("/node_modules/.bin") && !entry.includes("node-gyp-bin"));
  env["PATH"] = nodePath === undefined ? filteredPath.join(":") : [dirname(nodePath), ...filteredPath].join(":");
  env["CI"] = "true";
  return env;
}

/**
 * Verifies a worktree is actually gone (S7): both `git worktree remove`'s and `git worktree list --porcelain`'s
 * exit codes are checked (a failing `list` means "not verified", not "removed" — this is the branch a test with
 * an injected `gitRunner` exercises directly, since making a real `git worktree list` fail on disk is not
 * practical), and the comparison against the listing is the exact-match `isWorktreeListedExact`, not a substring
 * check. On a first failed removal, `git worktree prune` is run once and the same verification repeated before
 * giving up. `gitRunner` defaults to the real `git` and is exported only so tests can inject a fake one (S7).
 */
export function removeWorktree(repo: string, worktreeDir: string, gitRunner: PwaGateGitRunner = git): boolean {
  const worktreeReal = existsSync(worktreeDir) ? realpathSync(worktreeDir) : resolve(worktreeDir);

  const verify = (): boolean => {
    if (existsSync(worktreeDir)) return false;
    const list = gitRunner(["-C", repo, "worktree", "list", "--porcelain"]);
    if (list.exitCode !== 0) return false;
    return !isWorktreeListedExact(list.output, worktreeReal);
  };

  const removeResult = gitRunner(["-C", repo, "worktree", "remove", "--force", worktreeDir]);
  if (removeResult.exitCode === 0 && verify()) return true;

  gitRunner(["-C", repo, "worktree", "prune"]);
  return verify();
}

function diagnosticsLines(pathHead: string, pnpmWhich: string, pathNode: string): string {
  return `# path-head ${pathHead}\n# pnpm-which ${pnpmWhich}\n# path-node ${pathNode}\n`;
}

/** Reads up to `maxBytes` from the start of `path` without loading the whole file — a native pnpm binary can be
 * large, and only the first line is ever needed (N2). Returns `undefined` when the file cannot be opened. */
function readFileHead(path: string, maxBytes = 512): string | undefined {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** The first line of `text` (up to `\n`, with a trailing `\r` trimmed), or the whole thing if there is no `\n`. */
function firstLine(text: string): string {
  const newlineIndex = text.indexOf("\n");
  const line = newlineIndex === -1 ? text : text.slice(0, newlineIndex);
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Probes what node `pnpm` itself actually runs under (N2), truthfully this time: reads the file `pnpmWhich`
 * (`command -v pnpm`'s result) points to. A `#!`-prefixed first line means pnpm is a script, so the node it runs
 * under is whatever `node` resolves to on the same clean PATH (`command -v node`, via `sh`) — not necessarily the
 * declared round Node itself, though it usually is. No `#!` at all means a native pnpm binary, reported as such
 * rather than guessing at an interpreter. The raw first line is always returned alongside, verbatim, for the
 * record — whichever branch was taken.
 */
function probePnpmRuntime(
  pnpmWhich: string,
  worktreeDir: string,
  env: NodeJS.ProcessEnv,
  commandTimeoutMs: number,
  probeFailures: string[],
): { readonly runtime: string; readonly shebang: string } {
  if (pnpmWhich === "") return { runtime: "", shebang: "" };

  const head = readFileHead(pnpmWhich);
  if (head === undefined) {
    probeFailures.push("pnpm shebang read");
    return { runtime: "", shebang: "" };
  }

  const shebang = firstLine(head);
  if (!shebang.startsWith("#!")) {
    return { runtime: "native pnpm binary", shebang };
  }

  const runtime = readSingleLineProbe(sh("command -v node", worktreeDir, env, commandTimeoutMs), "command -v node (pnpm runtime)", probeFailures);
  return { runtime, shebang };
}

/**
 * Runs one Node major's round: worktree, probes, then every command in order. Wrapped so any exception — a
 * failed `git worktree add`, a thrown probe, anything — is caught and turned into `round.error` (S5) instead of
 * aborting the whole gate; removal below runs unconditionally, after the try/catch, regardless of how the round
 * ended.
 */
function runRound(
  node: PwaGateRunNodeTarget,
  repo: string,
  resolvedCommit: string,
  out: string,
  commands: readonly PwaGateCommand[],
  chromeOption: string | undefined,
  commandTimeoutMs: number,
): PwaGateRunRound {
  const worktreeDir = join(out, `worktree-node${node.major}`);
  const probeFailures: string[] = [];
  const commandResults: PwaGateRunCommandResult[] = [];
  let observedCommit = "";
  let observedNodeVersion = "";
  let observedPnpmVersion = "";
  let observedChromeVersion = "";
  let pathHead = "";
  let pnpmWhich = "";
  let pathNode = "";
  let pnpmRuntime = "";
  let pnpmShebang = "";
  let error: string | undefined;

  try {
    const addResult = git(["-C", repo, "worktree", "add", "--detach", worktreeDir, resolvedCommit]);
    if (addResult.exitCode !== 0) {
      throw new Error(`git worktree add failed for node ${node.major}: ${addResult.output.trim()}`);
    }

    const env = buildCleanEnv(node.path);
    pathHead = (env["PATH"] ?? "").split(":")[0] ?? "";

    observedCommit = readSingleLineProbe(sh("git rev-parse HEAD", worktreeDir, env, commandTimeoutMs), "git rev-parse HEAD", probeFailures);
    observedNodeVersion = readSingleLineProbe(sh("node -v", worktreeDir, env, commandTimeoutMs), "node -v", probeFailures);
    observedPnpmVersion = readSingleLineProbe(sh("pnpm -v", worktreeDir, env, commandTimeoutMs), "pnpm -v", probeFailures);
    observedChromeVersion = readSingleLineProbe(sh(`"${resolveChromeCandidate(chromeOption)}" --version`, undefined, env, commandTimeoutMs), "chrome --version", probeFailures);
    pnpmWhich = readSingleLineProbe(sh("command -v pnpm", worktreeDir, env, commandTimeoutMs), "command -v pnpm", probeFailures);
    pathNode = readSingleLineProbe(sh("node -p process.execPath", worktreeDir, env, commandTimeoutMs), "node -p process.execPath", probeFailures);
    ({ runtime: pnpmRuntime, shebang: pnpmShebang } = probePnpmRuntime(pnpmWhich, worktreeDir, env, commandTimeoutMs, probeFailures));
    if (observedChromeVersion === "") observedChromeVersion = "not found";

    for (const entry of commands) {
      const utc = new Date().toISOString();
      const result = sh(entry.command, worktreeDir, env, commandTimeoutMs);
      const header = logHeader({ commit: observedCommit, node: observedNodeVersion, pnpm: observedPnpmVersion, utc, chrome: observedChromeVersion, command: entry.command });
      const content = header + diagnosticsLines(pathHead, pnpmWhich, pathNode) + result.output;
      const fileName = logFileName(node.major, entry.command);
      writeFileSync(join(out, fileName), content, "utf8");
      const logSha256 = createHash("sha256").update(content).digest("hex");

      commandResults.push({ command: entry.command, blocking: entry.blocking, exitCode: result.exitCode, timedOut: result.timedOut, logFile: fileName, logSha256 });
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  // Unconditional, whether the round above threw or ran clean (S5): the worktree must never be left behind.
  const worktreeRemoved = removeWorktree(repo, worktreeDir);

  return {
    node,
    observedCommit,
    observedNodeVersion,
    observedPnpmVersion,
    observedChromeVersion,
    pathHead,
    pnpmWhich,
    pathNode,
    pnpmRuntime,
    pnpmShebang,
    worktreeDir,
    commands: commandResults,
    worktreeRemoved,
    probeFailures,
    ...(error !== undefined ? { error } : {}),
  };
}

/** Real `readCurrentGitInfo` for `resolveToolStaleness` (N1): the tool repo's current HEAD and dirty status. */
function toolGitInfo(toolDir: string): PwaGateToolCommitSnapshot {
  const commitResult = git(["-C", toolDir, "rev-parse", "HEAD"]);
  const statusResult = git(["-C", toolDir, "status", "--porcelain"]);
  return {
    commit: commitResult.exitCode === 0 ? commitResult.output.trim() : "unknown",
    dirty: statusResult.exitCode !== 0 || statusResult.output.trim().length > 0,
  };
}

/** Real `readBuildInfo` for `resolveToolStaleness` (N1): `build-info.json` next to the running module (`dist/`
 * once built), written by the package's own `build` script after `tsc`. Missing or malformed is `undefined`, not
 * thrown — `resolveToolStaleness` turns that into a `missing-build-info` reason, not a crash. */
function readToolBuildInfo(moduleDir: string): PwaGateToolCommitSnapshot | undefined {
  try {
    const raw = readFileSync(join(moduleDir, "build-info.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { commit?: unknown }).commit === "string" &&
      typeof (parsed as { dirty?: unknown }).dirty === "boolean"
    ) {
      return { commit: (parsed as { commit: string }).commit, dirty: (parsed as { dirty: boolean }).dirty };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function runGate(options: PwaGateRunOptions): PwaGateRunResultsFile {
  const out = resolve(options.out);
  const repo = resolve(options.repo);
  const commands = options.commands ?? GATE_COMMANDS;
  const requiredMajors = options.requiredMajors ?? DEFAULT_NODE_MAJORS;
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  // N1: the package's own root (from import.meta.url), not process.cwd() — a caller can invoke this tool from
  // anywhere, unrelated to where the tool itself lives on disk.
  const toolDir = options.toolDir ?? PACKAGE_DIR;

  // B1: resolve and verify the release commit before anything else is written.
  const resolvedCommit = resolveCommit(repo, options.commit);

  assertCanRun(out, repo, options.nodes, requiredMajors);

  const startUtc = new Date().toISOString();
  mkdirSync(out, { recursive: true });

  const availabilityUtc = new Date().toISOString();
  const availabilityEnv = buildCleanEnv(undefined);
  const availabilityResult = sh(options.availabilityCheck, undefined, availabilityEnv, commandTimeoutMs);
  const availabilityCheck: PwaGateRunAvailabilityCheckResult = {
    command: options.availabilityCheck,
    output: availabilityResult.output,
    exitCode: availabilityResult.exitCode,
    utc: availabilityUtc,
  };

  const rounds: PwaGateRunRound[] = [];
  for (const node of options.nodes) {
    rounds.push(runRound(node, repo, resolvedCommit, out, commands, options.chrome, commandTimeoutMs));
  }

  const commandOutcomes: PwaGateCommandOutcome[] = rounds.flatMap((round) =>
    round.commands.map((command) => ({ node: round.node.major, command: command.command, exitCode: command.exitCode })),
  );
  const timeoutOutcomes: PwaGateTimeoutOutcome[] = rounds.flatMap((round) =>
    round.commands.filter((command) => command.timedOut).map((command) => ({ node: round.node.major, command: command.command })),
  );
  const worktreeOutcomes: PwaGateWorktreeOutcome[] = rounds.map((round) => ({ node: round.node.major, removed: round.worktreeRemoved }));
  const nodeVersionOutcomes: PwaGateNodeVersionOutcome[] = rounds.map((round) => ({
    node: round.node.major,
    observedMajor: parseNodeMajor(round.observedNodeVersion) ?? -1,
  }));
  const commitOutcomes: PwaGateCommitOutcome[] = rounds.map((round) => ({ node: round.node.major, observedCommit: round.observedCommit }));
  const roundErrorOutcomes: PwaGateRoundErrorOutcome[] = rounds.filter((round) => round.error !== undefined).map((round) => ({ node: round.node.major, message: round.error ?? "" }));
  const probeFailureOutcomes: PwaGateProbeFailureOutcome[] = rounds.flatMap((round) => round.probeFailures.map((probe) => ({ node: round.node.major, probe })));

  // N1: resolved before the verdict, not after — a stale tool build must be able to fail the verdict, not just
  // be noted in the record after the fact.
  const toolBuildInfoReader = options.toolBuildInfoReader ?? (() => readToolBuildInfo(MODULE_DIR));
  const toolGitInfoReader = options.toolGitInfoReader ?? toolGitInfo;
  const toolStaleness = resolveToolStaleness({
    readBuildInfo: toolBuildInfoReader,
    readCurrentGitInfo: () => toolGitInfoReader(toolDir),
  });

  const expectedNodes = options.nodes.map((node) => node.major);
  const results: PwaGateRunResults = {
    commands: commandOutcomes,
    worktrees: worktreeOutcomes,
    nodeVersions: nodeVersionOutcomes,
    commits: commitOutcomes,
    resolvedCommit,
    roundErrors: roundErrorOutcomes,
    probeFailures: probeFailureOutcomes,
    timeouts: timeoutOutcomes,
    toolStaleReasons: toolStaleness.reasons,
  };
  const verdict = gateVerdict(expectedNodes, results, commands, requiredMajors);

  const endUtc = new Date().toISOString();
  const recordId = options.recordId ?? startUtc;
  const { commit: toolCommit, dirty: toolDirty } = toolStaleness.current;
  const toolBuild = toolStaleness.buildInfo ?? null;

  const resultsFile: PwaGateRunResultsFile = {
    meta: {
      repo,
      requestedCommit: options.commit,
      resolvedCommit,
      recordId,
      signer: options.signer,
      requiredMajors,
      startUtc,
      endUtc,
      toolCommit,
      toolDirty,
      toolBuild,
    },
    availabilityCheck,
    rounds,
    verdict,
  };
  writeFileSync(join(out, "results.json"), `${JSON.stringify(resultsFile, null, 2)}\n`, "utf8");

  const firstRound = rounds[0];
  const recordMeta: PwaGateRecordMeta = {
    recordId,
    requestedCommit: options.commit,
    resolvedCommit,
    requiredMajors,
    substituteReason: `可用性检查见下方（命令：${options.availabilityCheck}）`,
    availabilityCheck: { command: availabilityCheck.command, output: availabilityCheck.output, exitCode: availabilityCheck.exitCode, utc: availabilityCheck.utc },
    signer: options.signer,
    operatingSystem: `${os.type()} ${os.release()}`,
    chrome: firstRound?.observedChromeVersion ?? "not found",
    pnpm: firstRound?.observedPnpmVersion ?? "",
    operator: os.userInfo().username,
    startUtc,
    endUtc,
    toolCommit,
    toolDirty,
    toolBuild,
  };
  const recordRows: PwaGateRecordRow[] = rounds.flatMap((round) =>
    round.commands.map((command) => ({
      nodeVersion: round.observedNodeVersion.replace(/^v/, ""),
      command: command.command,
      exitCode: command.exitCode,
      logSha256: command.logSha256,
      logPath: join(out, command.logFile),
    })),
  );
  const recordRoundRows: PwaGateRecordRoundRow[] = rounds.map((round) => ({
    declaredMajor: round.node.major,
    observedNodeVersion: round.observedNodeVersion,
    observedCommit: round.observedCommit,
    pnpmVersion: round.observedPnpmVersion,
    chrome: round.observedChromeVersion,
    pathHead: round.pathHead,
    pathNode: round.pathNode,
    pnpmRuntime: round.pnpmRuntime,
    worktreeRemoved: round.worktreeRemoved,
  }));
  writeFileSync(join(out, "record.md"), renderRecord(recordMeta, recordRows, recordRoundRows, verdict), "utf8");

  return resultsFile;
}
