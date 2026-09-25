// Integration tests for the local gate's executor (task G3). Each test builds a throwaway git repository in a
// fresh tmp directory and two fake Node "installations": dir A is a symlink to the real Node so its declared
// major matches reality, dir B is a wrapper that lies about its version (`-v`/`--version` -> "v99.0.0") but execs
// the real Node for everything else. This lets the tests prove the PATH-switching and worktree-isolation
// mechanics without depending on which Node majors happen to be installed on the machine running the suite.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isWorktreeListedExact,
  parsePorcelainWorktreePaths,
  removeWorktree,
  resolveToolStaleness,
  runGate,
  PwaGateRunError,
  type PwaGateGitRunner,
  type PwaGateRunOptions,
  type PwaGateToolCommitSnapshot,
} from "../src/run-gate.js";
import { GATE_COMMANDS, type PwaGateCommand } from "../src/gate-commands.js";

const REAL_NODE_MAJOR = Number(process.versions.node.split(".")[0]);

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function createRepo(): { readonly repoDir: string; readonly commit: string } {
  const repoDir = makeTmpDir("pwa-gate-repo-");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", repoDir]);
  execFileSync("git", ["-C", repoDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", repoDir, "config", "user.name", "Test"]);
  writeFileSync(join(repoDir, "README.md"), "gate fixture\n", "utf8");
  execFileSync("git", ["-C", repoDir, "add", "README.md"]);
  execFileSync("git", ["-C", repoDir, "commit", "--quiet", "-m", "initial"]);
  const commit = execFileSync("git", ["-C", repoDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { repoDir, commit };
}

/** Dir A: a real Node, reachable through a symlink so its declared major matches the running process. */
function createRealNodeDir(): string {
  const dir = makeTmpDir("pwa-gate-node-real-");
  symlinkSync(process.execPath, join(dir, "node"));
  return dir;
}

/** Dir B: a wrapper that reports v99.0.0 for -v/--version but execs the real Node for everything else. */
function createFakeNodeDir(): string {
  const dir = makeTmpDir("pwa-gate-node-fake-");
  const wrapperPath = join(dir, "node");
  writeFileSync(
    wrapperPath,
    [
      "#!/bin/sh",
      'if [ "$1" = "-v" ] || [ "$1" = "--version" ]; then',
      "  echo v99.0.0",
      "  exit 0",
      "fi",
      `exec "${process.execPath}" "$@"`,
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(wrapperPath, 0o755);
  return dir;
}

/**
 * Dir C: like dir B (reports major 99 so the preflight check accepts it — `parseNodeMajor` only looks at the
 * start of the string), but `-v` prints a *second* line, so any probe that runs `node -v` inside the round gets
 * multi-line stdout instead of a clean version string (used to exercise S5's probe-failed path).
 */
function createMultilineNodeDir(): string {
  const dir = makeTmpDir("pwa-gate-node-multiline-");
  const wrapperPath = join(dir, "node");
  writeFileSync(
    wrapperPath,
    [
      "#!/bin/sh",
      'if [ "$1" = "-v" ] || [ "$1" = "--version" ]; then',
      "  echo v99.0.0",
      "  echo unexpected-extra-line",
      "  exit 0",
      "fi",
      `exec "${process.execPath}" "$@"`,
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(wrapperPath, 0o755);
  return dir;
}

/** N1: a fixed, matching (non-dirty) build/current pair, injected by default so every test in this file that
 * doesn't care about tool-build staleness gets a clean pass regardless of this worktree's real git state. The
 * dedicated "tool build staleness (N1)" tests below override one or both readers to exercise the failure paths. */
const FRESH_TOOL_SNAPSHOT: PwaGateToolCommitSnapshot = { commit: "f".repeat(40), dirty: false };

function baseOptions(overrides: Partial<PwaGateRunOptions> & { readonly repo: string; readonly commit: string; readonly out: string }): PwaGateRunOptions {
  return {
    signer: "Alice",
    availabilityCheck: "echo GitHub unavailable",
    nodes: [],
    // Most of this file's tests are not about B2's "every required major must have a round" refusal, so they
    // opt out of it by default; the dedicated B2 tests below pass their own requiredMajors.
    requiredMajors: [],
    // Without this, a test that doesn't pass its own `commands` falls back to the real GATE_COMMANDS: seven
    // `pnpm …` invocations (~0.3-0.5s each, all failing in this README-only fixture repo) that none of those
    // tests assert on, which alone pushed them to ~4-5s and intermittently past vitest's 5s default timeout.
    commands: [{ command: 'node -e "process.exit(0)"', blocking: true }],
    toolBuildInfoReader: () => FRESH_TOOL_SNAPSHOT,
    toolGitInfoReader: () => FRESH_TOOL_SNAPSHOT,
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runGate", () => {
  it("runs GATE_COMMANDS when the caller passes no commands", () => {
    const { repoDir, commit } = createRepo();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    // A real Node plus a stand-in `pnpm` in the same directory, which the round puts first on PATH. The stand-in
    // records its arguments and exits 0, so the real gate commands run end to end without touching the network or
    // taking the seconds the real ones do. The log path is baked into the script because rounds get a clean env.
    const nodeDir = createRealNodeDir();
    const callsPath = join(makeTmpDir("pwa-gate-pnpm-calls-"), "calls.log");
    const pnpmPath = join(nodeDir, "pnpm");
    writeFileSync(
      pnpmPath,
      [
        "#!/bin/sh",
        'if [ "$1" = "-v" ] || [ "$1" = "--version" ]; then',
        "  echo 11.18.0",
        "  exit 0",
        "fi",
        `printf '%s\\n' "$*" >> "${callsPath}"`,
        "exit 0",
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(pnpmPath, 0o755);
    // baseOptions supplies a fast default `commands`; drop it so runGate has to fall back on its own.
    const options: { -readonly [Key in keyof PwaGateRunOptions]: PwaGateRunOptions[Key] } = {
      ...baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(nodeDir, "node") }] }),
    };
    delete options.commands;

    const result = runGate(options);

    const round = result.rounds[0];
    expect(round?.commands.map(({ command, blocking }) => ({ command, blocking }))).toEqual(
      GATE_COMMANDS.map(({ command, blocking }) => ({ command, blocking })),
    );
    // What the stand-in actually received, in order: proof the commands ran, not only that they were listed.
    const calls = readFileSync(callsPath, "utf8").trimEnd().split("\n");
    expect(calls).toEqual(GATE_COMMANDS.map(({ command }) => command.replace(/^pnpm /, "")));
    expect(result.verdict.pass).toBe(true);
  }, 15_000);

  it("switches PATH per round so each round's header reports the Node version it declared (i)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const fakeNodeDir = createFakeNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    // S10: `node -v` is an *executed* GATE_COMMANDS-style command here, not just an internal probe — a wrong
    // implementation that only faked/hardcoded the header field (without actually switching PATH for commands
    // that run) would still pass a test that only checked `observedNodeVersion`. Asserting the log's BODY
    // (what the command itself printed) closes that gap.
    const commands: readonly PwaGateCommand[] = [
      { command: 'node -e "process.exit(0)"', blocking: true },
      { command: "node -v", blocking: true },
    ];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [
          { major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") },
          { major: 99, path: join(fakeNodeDir, "node") },
        ],
        commands,
      }),
    );

    const roundReal = result.rounds.find((round) => round.node.major === REAL_NODE_MAJOR);
    const roundFake = result.rounds.find((round) => round.node.major === 99);
    expect(roundReal?.observedNodeVersion).toBe(`v${process.versions.node}`);
    expect(roundFake?.observedNodeVersion).toBe("v99.0.0");
    expect(result.verdict.pass).toBe(true);

    const fakeNodeVCommand = roundFake?.commands.find((entry) => entry.command === "node -v");
    const fakeNodeVLog = readFileSync(join(out, fakeNodeVCommand!.logFile), "utf8");
    const fakeNodeVBody = fakeNodeVLog.split("\n").slice(9).join("\n"); // 6 header lines + 3 diagnostics lines
    expect(fakeNodeVBody.trim()).toBe("v99.0.0");

    const realNodeVCommand = roundReal?.commands.find((entry) => entry.command === "node -v");
    const realNodeVLog = readFileSync(join(out, realNodeVCommand!.logFile), "utf8");
    const realNodeVBody = realNodeVLog.split("\n").slice(9).join("\n");
    expect(realNodeVBody.trim()).toBe(`v${process.versions.node}`);
  });

  it("isolates worktrees between rounds — a marker written in one round is absent from the next (ii)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const fakeNodeDir = createFakeNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const isolationProbe = [
      "node",
      "-e",
      '"const fs=require(\'node:fs\'); if (fs.existsSync(\'marker.txt\')) { process.exit(1); } else { fs.writeFileSync(\'marker.txt\', \'x\'); process.exit(0); }"',
    ].join(" ");
    const commands: readonly PwaGateCommand[] = [{ command: isolationProbe, blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [
          { major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") },
          { major: 99, path: join(fakeNodeDir, "node") },
        ],
        commands,
      }),
    );

    for (const round of result.rounds) {
      for (const command of round.commands) {
        expect(command.exitCode).toBe(0);
      }
    }
    expect(result.verdict.pass).toBe(true);
  });

  it("records a blocking failure's exit code and leaves a non-blocking failure out of the verdict (iii)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const blockingCommand = 'node -e "process.exit(3)"';
    const nonBlockingCommand = 'node -e "process.exit(5)"';
    const commands: readonly PwaGateCommand[] = [
      { command: blockingCommand, blocking: true },
      { command: nonBlockingCommand, blocking: false },
    ];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
      }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures).toContainEqual({
      kind: "command-failed",
      node: REAL_NODE_MAJOR,
      command: blockingCommand,
      exitCode: 3,
    });
    expect(result.verdict.failures.some((failure) => "command" in failure && failure.command === nonBlockingCommand)).toBe(false);

    const round = result.rounds[0];
    expect(round?.commands.find((entry) => entry.command === nonBlockingCommand)?.exitCode).toBe(5);
  });

  it("removes every worktree and leaves none listed by git (iv)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const fakeNodeDir = createFakeNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [
          { major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") },
          { major: 99, path: join(fakeNodeDir, "node") },
        ],
        commands,
      }),
    );

    for (const round of result.rounds) {
      expect(round.worktreeRemoved).toBe(true);
      expect(existsSync(round.worktreeDir)).toBe(false);
    }
    const worktreeList = execFileSync("git", ["-C", repoDir, "worktree", "list", "--porcelain"], { encoding: "utf8" });
    for (const round of result.rounds) {
      expect(worktreeList).not.toContain(round.worktreeDir);
    }
  });

  it("gathers the log header's commit from the checked-out worktree, matching the repo's HEAD (v)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
      }),
    );

    expect(result.rounds[0]?.observedCommit).toBe(commit);
    const logPath = join(out, result.rounds[0]!.commands[0]!.logFile);
    const logText = readFileSync(logPath, "utf8");
    expect(logText.split("\n")[0]).toBe(`# commit ${commit}`);
  });

  it("refuses an empty Node list, writing nothing (vi)", () => {
    const { repoDir, commit } = createRepo();
    const out = join(makeTmpDir("pwa-gate-out-parent-"), "out");

    let caught: unknown;
    try {
      runGate(baseOptions({ repo: repoDir, commit, out, nodes: [] }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("no-nodes");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses when the output directory already exists, writing nothing (vi)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = makeTmpDir("pwa-gate-out-existing-");

    let caught: unknown;
    try {
      runGate(
        baseOptions({
          repo: repoDir,
          commit,
          out,
          nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("out-exists");
  });

  it("refuses when a declared Node path does not exist (vi)", () => {
    const { repoDir, commit } = createRepo();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    let caught: unknown;
    try {
      runGate(
        baseOptions({
          repo: repoDir,
          commit,
          out,
          nodes: [{ major: REAL_NODE_MAJOR, path: join(out, "does-not-exist") }],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("node-path-invalid");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses when the declared major does not match the executable's actual version (vi)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    let caught: unknown;
    try {
      runGate(
        baseOptions({
          repo: repoDir,
          commit,
          out,
          nodes: [{ major: REAL_NODE_MAJOR === 21 ? 22 : 21, path: join(realNodeDir, "node") }],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("node-major-mismatch");
    expect(existsSync(out)).toBe(false);
  });

  it("writes the availability check's verbatim output and the signer into record.md (vii)", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        signer: "Carol Signer",
        availabilityCheck: 'echo "gh auth status: not logged in"',
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
      }),
    );

    const record = readFileSync(join(out, "record.md"), "utf8");
    expect(record).toContain("gh auth status: not logged in");
    expect(record).toContain("Carol Signer");
  });
});

// B1: the requested commit must be resolved and verified against `repo` before anything is written, and every
// round must check out the resolved SHA, never the raw --commit input.
describe("runGate — commit resolution (B1)", () => {
  it("refuses a commit value that looks like a flag ('-f'), writing nothing", () => {
    const { repoDir } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    let caught: unknown;
    try {
      runGate(baseOptions({ repo: repoDir, commit: "-f", out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }] }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("commit-unresolved");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a commit that does not resolve to anything in the repo, writing nothing", () => {
    const { repoDir } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    let caught: unknown;
    try {
      runGate(baseOptions({ repo: repoDir, commit: "does-not-exist-1234567890", out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }] }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("commit-unresolved");
    expect(existsSync(out)).toBe(false);
  });

  it("resolves a branch name to the full commit SHA and records both the requested and resolved values", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit: "main",
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
      }),
    );

    expect(result.meta.requestedCommit).toBe("main");
    expect(result.meta.resolvedCommit).toBe(commit);
    expect(result.meta.resolvedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.rounds[0]?.observedCommit).toBe(commit);

    const record = readFileSync(join(out, "record.md"), "utf8");
    expect(record).toContain(commit);
    expect(record).toContain("main");
  });
});

// B2: an incomplete declared Node set must be refused before anything runs, not silently accepted.
describe("runGate — required Node coverage (B2)", () => {
  it("refuses when the declared nodes do not cover every required major, writing nothing", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    let caught: unknown;
    try {
      runGate(
        baseOptions({
          repo: repoDir,
          commit,
          out,
          nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
          requiredMajors: [REAL_NODE_MAJOR, REAL_NODE_MAJOR + 1000],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("missing-required-node");
    expect(existsSync(out)).toBe(false);
  });

  it("runs when the declared nodes cover every required major", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        requiredMajors: [REAL_NODE_MAJOR],
        commands,
      }),
    );
    expect(result.verdict.pass).toBe(true);
  });
});

// S3: every command, probe and the availability check run under a clean environment.
describe("runGate — clean environment (S3)", () => {
  it("unsets NODE_OPTIONS inherited from the parent environment", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.stdout.write(JSON.stringify(process.env.NODE_OPTIONS ?? null))"', blocking: true }];

    const previous = process.env["NODE_OPTIONS"];
    process.env["NODE_OPTIONS"] = "--max-old-space-size=128";
    try {
      const result = runGate(
        baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }], commands }),
      );
      const logPath = join(out, result.rounds[0]!.commands[0]!.logFile);
      const logText = readFileSync(logPath, "utf8");
      expect(logText.trimEnd().endsWith("null")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["NODE_OPTIONS"];
      else process.env["NODE_OPTIONS"] = previous;
    }
  });

  it("puts the declared Node's directory first on PATH and strips node_modules/.bin entries", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: "node -e \"console.log(process.env.PATH)\"", blocking: true }];

    const previous = process.env["PATH"];
    process.env["PATH"] = `/some/project/node_modules/.bin:/another/node-gyp-bin:${previous ?? ""}`;
    try {
      const result = runGate(
        baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }], commands }),
      );
      const logPath = join(out, result.rounds[0]!.commands[0]!.logFile);
      const logText = readFileSync(logPath, "utf8");
      const printedPath = logText.trimEnd().split("\n").at(-1) ?? "";
      expect(printedPath.split(":")[0]).toBe(dirname(join(realNodeDir, "node")));
      expect(printedPath).not.toContain("node_modules/.bin");
      expect(printedPath).not.toContain("node-gyp-bin");
      expect(result.rounds[0]?.pathHead).toBe(dirname(join(realNodeDir, "node")));
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
    }
  });
});

// S4: the output directory must not be able to sneak back inside the repo or one of its worktrees.
describe("runGate — output directory outside the repo (S4)", () => {
  it("refuses an --out that lies inside the repo's own toplevel", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(repoDir, "gate-out");

    let caught: unknown;
    try {
      runGate(baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }] }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PwaGateRunError);
    expect((caught as PwaGateRunError).code).toBe("out-inside-repo");
    expect(existsSync(out)).toBe(false);
  });
});

// S5: a round that throws before it can finish is recorded as round-error (not left to crash the whole gate),
// and a version probe whose output is not a single line is recorded as probe-failed instead of thrown.
describe("runGate — round robustness (S5)", () => {
  it("records round-error and still writes results.json + record.md when a round's worktree add fails", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const outParent = makeTmpDir("pwa-gate-out-parent-");
    const out = join(outParent, "run");
    const worktreeDir = join(out, `worktree-node${REAL_NODE_MAJOR}`);

    // Register a worktree at the exact path runGate will use, then remove the directory (not the registration,
    // which lives under repo/.git/worktrees and survives this), so `git worktree add` at that same path
    // deterministically fails with "already exists" — without this, forcing a real worktree-add failure would
    // need a race or a broken filesystem. `out` itself must go too, so the out-exists precheck doesn't fire first.
    execFileSync("git", ["-C", repoDir, "worktree", "add", "--detach", worktreeDir, commit], { stdio: "pipe" });
    rmSync(out, { recursive: true, force: true });

    const result = runGate(
      baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }] }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures.some((failure) => failure.kind === "round-error" && failure.node === REAL_NODE_MAJOR)).toBe(true);
    expect(result.rounds[0]?.error).toMatch(/worktree add failed/);
    expect(existsSync(join(out, "results.json"))).toBe(true);
    expect(existsSync(join(out, "record.md"))).toBe(true);
  });

  it("records probe-failed instead of throwing when a version probe's stdout is more than one line", () => {
    const { repoDir, commit } = createRepo();
    const multilineNodeDir = createMultilineNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    const result = runGate(
      baseOptions({ repo: repoDir, commit, out, nodes: [{ major: 99, path: join(multilineNodeDir, "node") }] }),
    );

    expect(result.rounds[0]?.probeFailures).toContain("node -v");
    expect(result.verdict.failures).toContainEqual({ kind: "probe-failed", node: 99, probe: "node -v" });
    expect(existsSync(join(out, "results.json"))).toBe(true);
  });
});

// S6: a command that runs past commandTimeoutMs is killed and recorded as a timeout, not left to hang the gate.
describe("runGate — per-command timeout (S6)", () => {
  it("kills a command that exceeds commandTimeoutMs and fails the verdict as command-timeout", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const sleepCommand = "sleep 5";
    const commands: readonly PwaGateCommand[] = [{ command: sleepCommand, blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        commandTimeoutMs: 200,
      }),
    );

    expect(result.rounds[0]?.commands[0]?.timedOut).toBe(true);
    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures).toContainEqual({ kind: "command-timeout", node: REAL_NODE_MAJOR, command: sleepCommand });
  }, 10_000);
});

// S9: the availability check must capture stderr from the whole compound command, including when it contains a
// `;` (where a bare `<command> 2>&1` would only redirect the last statement) or a trailing `# comment` (where a
// same-line `2>&1` would be swallowed by the comment).
describe("runGate — availability check shell wrapping (S9)", () => {
  it("captures stderr from every statement in a ';'-joined command", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        availabilityCheck: "echo first-stdout; echo second-stderr 1>&2",
      }),
    );

    expect(result.availabilityCheck.output).toContain("first-stdout");
    expect(result.availabilityCheck.output).toContain("second-stderr");
  });

  it("captures stderr even when the command ends with a trailing '# comment'", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        availabilityCheck: "echo to-stderr 1>&2 # a trailing comment",
      }),
    );

    expect(result.availabilityCheck.output).toContain("to-stderr");
  });
});

// S7: the worktree-removed check must compare exact `worktree <path>` lines, not substrings — `worktree-node2`
// is a substring of `worktree-node22`, which is exactly the bug this replaces.
describe("isWorktreeListedExact (S7)", () => {
  const porcelain = ["worktree /repo/out/worktree-node22", "HEAD abc123", "detached", "", "worktree /repo", "HEAD abc123", "branch refs/heads/main", ""].join("\n");

  it("does not treat a worktree path as listed when only a longer sibling path is present", () => {
    expect(isWorktreeListedExact(porcelain, "/repo/out/worktree-node2")).toBe(false);
  });

  it("treats a worktree path as listed on an exact match", () => {
    expect(isWorktreeListedExact(porcelain, "/repo/out/worktree-node22")).toBe(true);
  });

  it("parses every worktree line, not just the first", () => {
    expect(parsePorcelainWorktreePaths(porcelain)).toEqual(["/repo/out/worktree-node22", "/repo"]);
  });
});

// S8: record.md must carry the record fidelity fields end to end (requested/resolved commit, required majors,
// availability check's exit code, the tool's own commit/dirty status, a per-round table, and a failure list).
describe("runGate — record fidelity end to end (S8)", () => {
  it("writes requested/resolved commit, required majors, availability exit code, tool commit and a failing failures list into record.md", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const failingCommand = 'node -e "process.exit(7)"';
    const commands: readonly PwaGateCommand[] = [{ command: failingCommand, blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit: "main",
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        requiredMajors: [REAL_NODE_MAJOR],
        availabilityCheck: "echo not-logged-in; exit 3",
        commands,
      }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.availabilityCheck.exitCode).toBe(3);

    const record = readFileSync(join(out, "record.md"), "utf8");
    expect(record).toContain(commit);
    expect(record).toContain("main");
    expect(record).toContain(String(REAL_NODE_MAJOR));
    expect(record).toContain("3"); // availability check exit code, shown in the header table
    expect(record).toContain(result.meta.toolCommit);
    expect(record).toContain("## 失败项");
    expect(record).toContain(failingCommand);
    expect(record).toContain("## 按轮次执行环境");
    expect(record).toContain("未通过");
  });
});

// S3: the clean env must set CI=true unconditionally and strip pnpm/npm lifecycle vars, not just NODE_OPTIONS.
describe("runGate — clean environment sets CI and strips npm/pnpm lifecycle vars (S3)", () => {
  it('sets CI="true" and strips npm_config_* / npm_lifecycle_event regardless of the parent environment', () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const probe = [
      "node",
      "-e",
      '"process.stdout.write(JSON.stringify({ci: process.env.CI ?? null, fooConfig: process.env.npm_config_foo ?? null, lifecycle: process.env.npm_lifecycle_event ?? null}))"',
    ].join(" ");
    const commands: readonly PwaGateCommand[] = [{ command: probe, blocking: true }];

    const previousCi = process.env["CI"];
    const previousFooConfig = process.env["npm_config_foo"];
    const previousLifecycle = process.env["npm_lifecycle_event"];
    delete process.env["CI"];
    process.env["npm_config_foo"] = "bar";
    process.env["npm_lifecycle_event"] = "gate:local";
    try {
      const result = runGate(
        baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }], commands }),
      );
      const logPath = join(out, result.rounds[0]!.commands[0]!.logFile);
      const logText = readFileSync(logPath, "utf8");
      const body = logText.trimEnd().split("\n").at(-1) ?? "";
      expect(JSON.parse(body)).toEqual({ ci: "true", fooConfig: null, lifecycle: null });
    } finally {
      if (previousCi === undefined) delete process.env["CI"];
      else process.env["CI"] = previousCi;
      if (previousFooConfig === undefined) delete process.env["npm_config_foo"];
      else process.env["npm_config_foo"] = previousFooConfig;
      if (previousLifecycle === undefined) delete process.env["npm_lifecycle_event"];
      else process.env["npm_lifecycle_event"] = previousLifecycle;
    }
  });
});

// S7 (review gap): the `worktree list` verification-failure path, exercised directly via an injected git runner
// instead of trying to make a real `git worktree list` fail on disk.
describe("removeWorktree — worktree list verification failure (S7)", () => {
  it("returns false when `git worktree list` itself fails after a successful `worktree remove`", () => {
    const calls: string[][] = [];
    const fakeGitRunner: PwaGateGitRunner = (args) => {
      calls.push([...args]);
      if (args.includes("remove")) return { output: "", exitCode: 0 };
      if (args.includes("list")) return { output: "", exitCode: 1 };
      return { output: "", exitCode: 0 }; // prune
    };

    const removed = removeWorktree("/fake/repo", "/fake/repo/out/worktree-node22", fakeGitRunner);

    expect(removed).toBe(false);
    // Both list attempts (right after remove, and again after prune) must have gone through the injected runner.
    expect(calls.filter((args) => args.includes("list")).length).toBeGreaterThanOrEqual(1);
    expect(calls.some((args) => args.includes("prune"))).toBe(true);
  });

  it("returns true when `worktree remove` and the follow-up `worktree list` both succeed and list the worktree gone", () => {
    const fakeGitRunner: PwaGateGitRunner = (args) => {
      if (args.includes("remove")) return { output: "", exitCode: 0 };
      if (args.includes("list")) return { output: "worktree /fake/repo\nHEAD abc\nbranch refs/heads/main\n", exitCode: 0 };
      return { output: "", exitCode: 0 };
    };

    const removed = removeWorktree("/fake/repo", "/fake/repo/out/worktree-node22", fakeGitRunner);

    expect(removed).toBe(true);
  });
});

// N2: the probe previously (and wrongly) labelled "pnpm's Node" only ran `node -p process.execPath` — i.e. it
// reported whatever `node` resolves to on the round's PATH, unrelated to what `pnpm` itself would actually run
// under. These tests exercise the real probe: read the file `command -v pnpm` points to, and either resolve
// `node` on the same clean PATH (script pnpm, shebang `#!...node`) or report a native binary — using a fake
// `pnpm` file placed next to the round's Node so it is found first on PATH, exactly like the existing fake/real
// Node dir fixtures above.
describe("runGate — pnpm's own runtime probe (N2)", () => {
  it("resolves the node interpreter from pnpm's own shebang when pnpm is a script", () => {
    const { repoDir, commit } = createRepo();
    const nodeDir = createRealNodeDir();
    const shebang = "#!/usr/bin/env node";
    writeFileSync(join(nodeDir, "pnpm"), [shebang, "console.log('fake pnpm')", ""].join("\n"), "utf8");
    chmodSync(join(nodeDir, "pnpm"), 0o755);
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(nodeDir, "node") }], commands }),
    );

    const round = result.rounds[0];
    expect(round?.pnpmWhich).toBe(join(nodeDir, "pnpm"));
    expect(round?.pnpmShebang).toBe(shebang);
    expect(round?.pnpmRuntime).toBe(join(nodeDir, "node"));
  });

  it('records "native pnpm binary" and leaves the runtime unresolved when pnpm has no shebang', () => {
    const { repoDir, commit } = createRepo();
    const nodeDir = createRealNodeDir();
    writeFileSync(join(nodeDir, "pnpm"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]));
    chmodSync(join(nodeDir, "pnpm"), 0o755);
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({ repo: repoDir, commit, out, nodes: [{ major: REAL_NODE_MAJOR, path: join(nodeDir, "node") }], commands }),
    );

    const round = result.rounds[0];
    expect(round?.pnpmRuntime).toBe("native pnpm binary");
    expect(round?.pnpmShebang.startsWith("#!")).toBe(false);
  });
});

// N3: a timed-out command's grandchildren must be killed too, not just the shell `spawnSync` was watching —
// spawning in its own detached process group and SIGKILLing the whole group (`-pid`) on timeout is what this
// tests, using a backgrounded `sleep` that writes a marker file well after the gate's own timeout has elapsed.
describe("runGate — a timed-out command's whole process group is killed (N3)", () => {
  it("kills a backgrounded grandchild, so a marker it would write after the timeout never appears", async () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const markerDir = makeTmpDir("pwa-gate-marker-");
    const markerFile = join(markerDir, "grandchild-marker");
    // The backgrounded job (sleep 1 && touch marker) shares the shell's process group (plain `&`, no setsid), and
    // only completes ~1s after start — well after the 200ms timeout below elapses on the foregrounded `sleep 5`.
    const commands: readonly PwaGateCommand[] = [{ command: `(sleep 1 && touch "${markerFile}") & sleep 5`, blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        commandTimeoutMs: 200,
      }),
    );

    expect(result.rounds[0]?.commands[0]?.timedOut).toBe(true);

    // Wait well past the grandchild's own 1s sleep so an unfixed implementation (which only kills the shell, not
    // the group) would have had time to write the marker.
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(existsSync(markerFile)).toBe(false);
  }, 10_000);
});

// N1: the record's "tool commit" must be the gate tool's own repo, resolved from its own package directory
// (import.meta.url), not process.cwd() — and dist/ (git-ignored) can be stale relative to that repo's real HEAD.
// A signed record must never be able to claim a tool build it did not actually run.
describe("resolveToolStaleness (N1)", () => {
  it("returns no reasons when the build snapshot matches the current one and neither is dirty", () => {
    const snapshot: PwaGateToolCommitSnapshot = { commit: "c".repeat(40), dirty: false };
    const result = resolveToolStaleness({ readBuildInfo: () => snapshot, readCurrentGitInfo: () => snapshot });
    expect(result.reasons).toEqual([]);
  });

  it('reports "missing-build-info" when there is no build snapshot at all', () => {
    const current: PwaGateToolCommitSnapshot = { commit: "c".repeat(40), dirty: false };
    const result = resolveToolStaleness({ readBuildInfo: () => undefined, readCurrentGitInfo: () => current });
    expect(result.reasons).toEqual(["missing-build-info"]);
  });

  it('reports "commit-mismatch" when the build commit differs from the current commit', () => {
    const result = resolveToolStaleness({
      readBuildInfo: () => ({ commit: "a".repeat(40), dirty: false }),
      readCurrentGitInfo: () => ({ commit: "b".repeat(40), dirty: false }),
    });
    expect(result.reasons).toEqual(["commit-mismatch"]);
  });

  it('reports "dirty-at-build" when the build snapshot itself was dirty', () => {
    const commit = "c".repeat(40);
    const result = resolveToolStaleness({
      readBuildInfo: () => ({ commit, dirty: true }),
      readCurrentGitInfo: () => ({ commit, dirty: false }),
    });
    expect(result.reasons).toEqual(["dirty-at-build"]);
  });

  it('reports "dirty-now" when the current working tree is dirty, even with a matching, clean build snapshot', () => {
    const commit = "c".repeat(40);
    const result = resolveToolStaleness({
      readBuildInfo: () => ({ commit, dirty: false }),
      readCurrentGitInfo: () => ({ commit, dirty: true }),
    });
    expect(result.reasons).toEqual(["dirty-now"]);
  });

  it("reports every applicable reason at once, not just the first", () => {
    const result = resolveToolStaleness({
      readBuildInfo: () => ({ commit: "a".repeat(40), dirty: true }),
      readCurrentGitInfo: () => ({ commit: "b".repeat(40), dirty: true }),
    });
    expect(result.reasons).toEqual(["commit-mismatch", "dirty-at-build", "dirty-now"]);
  });
});

// N1: end-to-end wiring — runGate must actually call the injected readers, feed their result into the verdict,
// and record both snapshots in results.json and record.md, not just expose the pure resolveToolStaleness.
describe("runGate — tool build staleness end to end (N1)", () => {
  it("passes and records a non-null toolBuild when the injected readers report a fresh, matching snapshot", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];
    const snapshot: PwaGateToolCommitSnapshot = { commit: "e".repeat(40), dirty: false };

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        toolBuildInfoReader: () => snapshot,
        toolGitInfoReader: () => snapshot,
      }),
    );

    expect(result.verdict.pass).toBe(true);
    expect(result.verdict.failures.some((failure) => failure.kind === "tool-stale")).toBe(false);
    expect(result.meta.toolBuild).toEqual(snapshot);
    expect(result.meta.toolCommit).toBe(snapshot.commit);
    const record = readFileSync(join(out, "record.md"), "utf8");
    expect(record).toContain(snapshot.commit);
  });

  it("fails as tool-stale with missing-build-info when the build-info reader returns undefined", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        toolBuildInfoReader: () => undefined,
        toolGitInfoReader: () => ({ commit: "e".repeat(40), dirty: false }),
      }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures).toContainEqual({ kind: "tool-stale", reason: "missing-build-info" });
    expect(result.meta.toolBuild).toBeNull();
    const record = readFileSync(join(out, "record.md"), "utf8");
    expect(record).toContain("缺失");
  });

  it("fails as tool-stale with commit-mismatch when the build commit differs from the current one", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        toolBuildInfoReader: () => ({ commit: "a".repeat(40), dirty: false }),
        toolGitInfoReader: () => ({ commit: "b".repeat(40), dirty: false }),
      }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures).toContainEqual({ kind: "tool-stale", reason: "commit-mismatch" });
  });

  it("fails as tool-stale with dirty-now when the current working tree is reported dirty", () => {
    const { repoDir, commit } = createRepo();
    const realNodeDir = createRealNodeDir();
    const out = join(makeTmpDir("pwa-gate-out-"), "run");
    const commands: readonly PwaGateCommand[] = [{ command: 'node -e "process.exit(0)"', blocking: true }];
    const commitSha = "e".repeat(40);

    const result = runGate(
      baseOptions({
        repo: repoDir,
        commit,
        out,
        nodes: [{ major: REAL_NODE_MAJOR, path: join(realNodeDir, "node") }],
        commands,
        toolBuildInfoReader: () => ({ commit: commitSha, dirty: false }),
        toolGitInfoReader: () => ({ commit: commitSha, dirty: true }),
      }),
    );

    expect(result.verdict.pass).toBe(false);
    expect(result.verdict.failures).toContainEqual({ kind: "tool-stale", reason: "dirty-now" });
  });
});
