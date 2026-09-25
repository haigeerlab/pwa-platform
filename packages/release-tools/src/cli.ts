// The local gate's command-line entry (task G4, spec/platform-governance.md "修订：本地门禁工具入仓"). Thin by
// design: argv handling and nvm discovery live in the small pure functions below (`resolveDefaultNodes`,
// `exitCodeFor`, `main`), which take every side-effecting dependency as an argument. `main` never touches the
// real file system, process env, git or child processes directly — `defaultDeps()` is the only place that does.
// The actual executable entry is bin.ts (S1): it unconditionally calls `main(process.argv.slice(2),
// defaultDeps())` and sets `process.exitCode`, which is the only line the unit tests here don't exercise.
import { execFileSync } from "node:child_process";
import { readdirSync as nodeReaddirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PwaGateArgsError, parseGateArgs, type PwaGateArgs } from "./parse-gate-args.js";
import { PwaGateRunError, runGate as realRunGate, type PwaGateRunNodeTarget, type PwaGateRunOptions, type PwaGateRunResultsFile } from "./run-gate.js";
import { describeGateFailure, type PwaGateVerdict } from "./gate-verdict.js";
import { DEFAULT_NODE_MAJORS } from "./node-majors.js";

/** ADR-0031's Node matrix (kept in sync with `.github/workflows/ci.yml`'s matrix by test/cli-default-nodes.test.ts). */
export { DEFAULT_NODE_MAJORS };

export type CliUsageCode = "nvm-not-found" | "nvm-major-missing" | "repo-not-found";

export class CliUsageError extends Error {
  readonly code: CliUsageCode;

  constructor(code: CliUsageCode, message: string) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
  }
}

export type NvmFsLike = {
  readonly readdirSync: (path: string) => readonly string[];
};

export type CliDeps = {
  readonly runGate: (options: PwaGateRunOptions) => PwaGateRunResultsFile;
  readonly resolveRepo: (cwd: string) => string;
  readonly nvmDir: string | undefined;
  readonly fsLike: NvmFsLike;
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
};

export type CliOutcome = { readonly kind: "verdict"; readonly verdict: PwaGateVerdict } | { readonly kind: "error"; readonly error: PwaGateArgsError | CliUsageError | PwaGateRunError };

export function exitCodeFor(outcome: CliOutcome): number {
  if (outcome.kind === "verdict") return outcome.verdict.pass ? 0 : 1;
  return 2;
}

const NODE_VERSION_DIR = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * Picks the highest installed `v<major>.*` under `<nvmDir>/versions/node` for each of `DEFAULT_NODE_MAJORS`.
 * Throws `CliUsageError` — never returns a partial result — when `nvmDir` is undefined, the versions directory
 * cannot be read, or any major has no installed version, always naming `--node <major>=<path>` as the fix.
 */
export function resolveDefaultNodes(nvmDir: string | undefined, fsLike: NvmFsLike): readonly PwaGateRunNodeTarget[] {
  const usageHint = `Pass --node <major>=<path> for each of ${DEFAULT_NODE_MAJORS.join(", ")}.`;

  if (nvmDir === undefined) {
    throw new CliUsageError("nvm-not-found", `No --node was given and nvm could not be found (checked $NVM_DIR and ~/.nvm). ${usageHint}`);
  }

  const versionsDir = join(nvmDir, "versions", "node");
  let entries: readonly string[];
  try {
    entries = fsLike.readdirSync(versionsDir);
  } catch {
    throw new CliUsageError("nvm-not-found", `No --node was given and nvm's versions directory was not found: ${versionsDir}. ${usageHint}`);
  }

  const nodes: PwaGateRunNodeTarget[] = [];
  for (const major of DEFAULT_NODE_MAJORS) {
    const candidates = entries
      .map((name) => NODE_VERSION_DIR.exec(name))
      .filter((match): match is RegExpExecArray => match !== null && Number(match[1]) === major)
      .map((match) => ({ name: match[0], minor: Number(match[2]), patch: Number(match[3]) }));

    if (candidates.length === 0) {
      throw new CliUsageError("nvm-major-missing", `No Node ${major} install found under ${versionsDir}. Pass --node ${major}=<path>.`);
    }

    candidates.sort((a, b) => a.minor - b.minor || a.patch - b.patch);
    const highest = candidates[candidates.length - 1];
    if (highest === undefined) throw new CliUsageError("nvm-major-missing", `No Node ${major} install found under ${versionsDir}. Pass --node ${major}=<path>.`);
    nodes.push({ major, path: join(versionsDir, highest.name, "bin", "node") });
  }

  return nodes;
}

function usage(): string {
  return [
    "Usage: local-gate --commit <sha> --out <dir> --signer <name> --availability-check <command> [options]",
    "",
    "Required:",
    "  --commit <sha>                 Release commit to check out into each worktree",
    "  --out <dir>                    Output directory for logs, results.json and record.md (repo-external, must not exist)",
    "  --signer <name>                Human release owner's name, recorded verbatim",
    "  --availability-check <command> Command whose output proves GitHub is unavailable, recorded verbatim",
    "",
    "Optional:",
    "  --repo <path>                  Repo to check out from (default: `git rev-parse --show-toplevel` of the cwd)",
    `  --node <major>=<path>          Node executable for a version, repeatable (default: nvm discovery for ${DEFAULT_NODE_MAJORS.join(", ")})`,
    "  --record-id <id>               Record identifier (default: the run's start time)",
  ].join("\n");
}

function extractRepoFlag(argv: readonly string[]): { readonly repo: string | undefined; readonly rest: readonly string[] } {
  const rest: string[] = [];
  let repo: string | undefined;
  let index = 0;
  while (index < argv.length) {
    const flag = argv[index];
    if (flag === "--repo") {
      const value = argv[index + 1];
      if (value === undefined) throw new PwaGateArgsError("missing-value", 'Flag "--repo" is missing its value');
      repo = value;
      index += 2;
      continue;
    }
    if (flag !== undefined) rest.push(flag);
    index += 1;
  }
  return { repo, rest };
}

function resolveNodeTargets(parsed: PwaGateArgs, deps: CliDeps): readonly PwaGateRunNodeTarget[] {
  if (parsed.nodes.length > 0) {
    return parsed.nodes.map((node) => ({ major: node.major, path: node.executablePath }));
  }
  return resolveDefaultNodes(deps.nvmDir, deps.fsLike);
}

/**
 * Runs the gate end to end and returns the process exit code: 0 pass, 1 fail, 2 for a usage error or a refusal
 * (`PwaGateArgsError` from parsing, `CliUsageError` from nvm/repo resolution, or `PwaGateRunError` from
 * `runGate`). Never throws for those three; anything else propagates, since it signals a bug rather than an
 * expected refusal.
 */
export function main(argv: readonly string[], deps: CliDeps): number {
  // A successful request for usage (S1), not a usage error: exits 0 and prints to stdout, unlike every other
  // usage/refusal path below, which prints to stderr and exits 2.
  if (argv.includes("--help") || argv.includes("-h")) {
    deps.stdout(usage());
    return 0;
  }

  let parsed: PwaGateArgs;
  let repo: string;
  try {
    const { repo: repoFlag, rest } = extractRepoFlag(argv);
    parsed = parseGateArgs(rest);
    repo = repoFlag ?? deps.resolveRepo(deps.cwd);
  } catch (error) {
    if (error instanceof PwaGateArgsError) {
      deps.stderr(`${error.message}\n\n${usage()}`);
      return exitCodeFor({ kind: "error", error });
    }
    throw error;
  }

  let nodes: readonly PwaGateRunNodeTarget[];
  try {
    nodes = resolveNodeTargets(parsed, deps);
  } catch (error) {
    if (error instanceof CliUsageError) {
      deps.stderr(error.message);
      return exitCodeFor({ kind: "error", error });
    }
    throw error;
  }

  const options: PwaGateRunOptions = {
    repo,
    commit: parsed.commit,
    out: parsed.outDir,
    nodes,
    signer: parsed.signer,
    availabilityCheck: parsed.availabilityCheckCommand,
    ...(parsed.recordId !== undefined ? { recordId: parsed.recordId } : {}),
  };

  let result: PwaGateRunResultsFile;
  try {
    result = deps.runGate(options);
  } catch (error) {
    if (error instanceof PwaGateRunError) {
      deps.stderr(error.message);
      return exitCodeFor({ kind: "error", error });
    }
    throw error;
  }

  const recordPath = join(parsed.outDir, "record.md");
  deps.stdout(`Record: ${recordPath}`);
  deps.stdout(`Verdict: ${result.verdict.pass ? "PASS" : "FAIL"}`);
  for (const failure of result.verdict.failures) {
    deps.stdout(`  - ${describeGateFailure(failure)}`);
  }

  return exitCodeFor({ kind: "verdict", verdict: result.verdict });
}

export function defaultDeps(): CliDeps {
  const nvmDir = process.env["NVM_DIR"] ?? join(homedir(), ".nvm");
  return {
    runGate: realRunGate,
    resolveRepo: (cwd) => execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim(),
    nvmDir,
    fsLike: { readdirSync: (path) => nodeReaddirSync(path) },
    cwd: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
}

