// Unit tests for the CLI entry (task G4). `resolveDefaultNodes` and `exitCodeFor` are pure and tested directly.
// `main(argv, deps)` takes injected dependencies (a `runGate` stub, an nvm directory + fake fs, a repo resolver,
// and capturing stdout/stderr) so the pass/fail/usage paths can be exercised without spawning real pnpm commands
// or reading the real machine's nvm installation.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PwaGateArgsError } from "../src/parse-gate-args.js";
import { PwaGateRunError, type PwaGateRunOptions, type PwaGateRunResultsFile } from "../src/run-gate.js";
import type { PwaGateVerdict } from "../src/gate-verdict.js";
import { DEFAULT_NODE_MAJORS, exitCodeFor, main, resolveDefaultNodes, type CliDeps } from "../src/cli.js";

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeVerdict(pass: boolean, failures: PwaGateVerdict["failures"] = []): PwaGateVerdict {
  return { pass, failures };
}

function makeResult(overrides: Partial<PwaGateRunResultsFile> = {}): PwaGateRunResultsFile {
  return {
    meta: {
      repo: "/repo",
      requestedCommit: "abc123",
      resolvedCommit: "a".repeat(40),
      recordId: "r1",
      signer: "Alice",
      requiredMajors: [22, 24],
      startUtc: "2026-09-22T00:00:00.000Z",
      endUtc: "2026-09-22T00:01:00.000Z",
      toolCommit: "b".repeat(40),
      toolDirty: false,
      toolBuild: { commit: "b".repeat(40), dirty: false },
    },
    availabilityCheck: { command: "gh auth status", output: "not logged in", exitCode: 1, utc: "2026-09-22T00:00:00.000Z" },
    rounds: [],
    verdict: makeVerdict(true),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps & { readonly stdoutLines: string[]; readonly stderrLines: string[] } {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    runGate: () => makeResult(),
    resolveRepo: () => "/resolved/repo",
    nvmDir: undefined,
    fsLike: { readdirSync: () => [] },
    cwd: "/cwd",
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line),
    stdoutLines,
    stderrLines,
    ...overrides,
  };
}

const baseArgv = ["--commit", "abc123", "--out", "/tmp/out", "--node", "22=/usr/bin/node22", "--signer", "Alice", "--availability-check", "gh auth status"];

describe("DEFAULT_NODE_MAJORS", () => {
  it("is [22, 24]", () => {
    expect(DEFAULT_NODE_MAJORS).toEqual([22, 24]);
  });
});

describe("resolveDefaultNodes", () => {
  it("picks the highest installed minor/patch under versions/node for each default major", () => {
    const nvmDir = makeTmpDir("pwa-gate-nvm-");
    const versionsDir = join(nvmDir, "versions", "node");
    for (const name of ["v22.1.0", "v22.14.2", "v22.9.0", "v24.0.0", "v24.3.11"]) {
      mkdirSync(join(versionsDir, name, "bin"), { recursive: true });
    }

    const nodes = resolveDefaultNodes(nvmDir, { readdirSync: (path) => readdirSync(path) });

    expect(nodes).toEqual([
      { major: 22, path: join(versionsDir, "v22.14.2", "bin", "node") },
      { major: 24, path: join(versionsDir, "v24.3.11", "bin", "node") },
    ]);
  });

  it("throws a clear usage error when a major is missing", () => {
    const nvmDir = makeTmpDir("pwa-gate-nvm-");
    const versionsDir = join(nvmDir, "versions", "node");
    mkdirSync(join(versionsDir, "v22.1.0", "bin"), { recursive: true });

    expect(() => resolveDefaultNodes(nvmDir, { readdirSync: (path) => readdirSync(path) })).toThrow(/--node 24=/);
  });

  it("throws a clear usage error when nvmDir is undefined", () => {
    expect(() => resolveDefaultNodes(undefined, { readdirSync: () => [] })).toThrow(/--node/);
  });

  it("throws a clear usage error when the versions directory does not exist", () => {
    const nvmDir = makeTmpDir("pwa-gate-nvm-empty-");
    expect(() =>
      resolveDefaultNodes(nvmDir, {
        readdirSync: () => {
          throw new Error("ENOENT");
        },
      }),
    ).toThrow(/--node/);
  });
});

describe("exitCodeFor", () => {
  it("maps a passing verdict to 0", () => {
    expect(exitCodeFor({ kind: "verdict", verdict: makeVerdict(true) })).toBe(0);
  });

  it("maps a failing verdict to 1", () => {
    expect(exitCodeFor({ kind: "verdict", verdict: makeVerdict(false, [{ kind: "worktree-not-removed", node: 22 }]) })).toBe(1);
  });

  it("maps a usage/refusal error to 2", () => {
    expect(exitCodeFor({ kind: "error", error: new PwaGateArgsError("missing-commit", "--commit is required") })).toBe(2);
    expect(exitCodeFor({ kind: "error", error: new PwaGateRunError("out-exists", "exists") })).toBe(2);
  });
});

describe("main", () => {
  it("exits 2 with a usage message when given no arguments", () => {
    const deps = makeDeps();
    const code = main([], deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.join("\n")).toMatch(/--commit/);
  });

  // S1: --help is a successful request for usage, not a usage error — it must exit 0, not 2.
  it("exits 0 and prints usage on --help", () => {
    const deps = makeDeps();
    const code = main(["--help"], deps);
    expect(code).toBe(0);
    expect(deps.stdoutLines.join("\n")).toMatch(/--commit/);
  });

  it("exits 0 and prints usage on -h", () => {
    const deps = makeDeps();
    const code = main(["-h"], deps);
    expect(code).toBe(0);
  });

  it("exits 0 and prints the record path and a PASS verdict on success", () => {
    const deps = makeDeps({
      runGate: () => makeResult({ verdict: makeVerdict(true) }),
    });
    const code = main(baseArgv, deps);
    expect(code).toBe(0);
    expect(deps.stdoutLines.some((line) => line.includes("record.md"))).toBe(true);
    expect(deps.stdoutLines.some((line) => /PASS/.test(line))).toBe(true);
  });

  it("exits 1 and prints each failure on a failing verdict", () => {
    const deps = makeDeps({
      runGate: () =>
        makeResult({
          verdict: makeVerdict(false, [{ kind: "command-failed", node: 22, command: "pnpm lint", exitCode: 1 }]),
        }),
    });
    const code = main(baseArgv, deps);
    expect(code).toBe(1);
    expect(deps.stdoutLines.some((line) => /FAIL/.test(line))).toBe(true);
    expect(deps.stdoutLines.some((line) => line.includes("pnpm lint") && line.includes("22"))).toBe(true);
  });

  it("exits 2 and prints the message when runGate refuses (e.g. out-exists)", () => {
    const deps = makeDeps({
      runGate: () => {
        throw new PwaGateRunError("out-exists", "Output directory already exists: /tmp/out");
      },
    });
    const code = main(baseArgv, deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.join("\n")).toContain("already exists");
  });

  it("resolves --repo via deps.resolveRepo when --repo is not given", () => {
    let receivedRepo: string | undefined;
    const deps = makeDeps({
      resolveRepo: () => "/resolved/repo",
      runGate: (options: PwaGateRunOptions) => {
        receivedRepo = options.repo;
        return makeResult();
      },
    });
    main(baseArgv, deps);
    expect(receivedRepo).toBe("/resolved/repo");
  });

  it("uses an explicit --repo instead of resolveRepo", () => {
    let receivedRepo: string | undefined;
    let resolveRepoCalled = false;
    const deps = makeDeps({
      resolveRepo: () => {
        resolveRepoCalled = true;
        return "/should-not-be-used";
      },
      runGate: (options: PwaGateRunOptions) => {
        receivedRepo = options.repo;
        return makeResult();
      },
    });
    main([...baseArgv, "--repo", "/explicit/repo"], deps);
    expect(receivedRepo).toBe("/explicit/repo");
    expect(resolveRepoCalled).toBe(false);
  });

  it("resolves nodes via nvm discovery when no --node is given", () => {
    const nvmDir = makeTmpDir("pwa-gate-nvm-main-");
    const versionsDir = join(nvmDir, "versions", "node");
    for (const name of ["v22.5.0", "v24.1.0"]) {
      mkdirSync(join(versionsDir, name, "bin"), { recursive: true });
    }
    const argvWithoutNode = baseArgv.filter((_, index, arr) => !(arr[index - 1] === "--node" || arr[index] === "--node"));

    let receivedNodes: PwaGateRunOptions["nodes"] | undefined;
    const deps = makeDeps({
      nvmDir,
      fsLike: { readdirSync: (path) => readdirSync(path) },
      runGate: (options: PwaGateRunOptions) => {
        receivedNodes = options.nodes;
        return makeResult();
      },
    });

    const code = main(argvWithoutNode, deps);
    expect(code).toBe(0);
    expect(receivedNodes).toEqual([
      { major: 22, path: join(versionsDir, "v22.5.0", "bin", "node") },
      { major: 24, path: join(versionsDir, "v24.1.0", "bin", "node") },
    ]);
  });

  it("exits 2 with a usage message when nvm discovery fails and no --node is given", () => {
    const argvWithoutNode = baseArgv.filter((_, index, arr) => !(arr[index - 1] === "--node" || arr[index] === "--node"));
    const deps = makeDeps({ nvmDir: undefined });
    const code = main(argvWithoutNode, deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.join("\n")).toMatch(/--node/);
  });
});
