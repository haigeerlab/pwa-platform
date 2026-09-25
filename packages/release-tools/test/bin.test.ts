// Unit test for bin.ts's own wiring (review gap on task G4): `run(argv, deps, setExitCode)` is bin.ts's only
// testable logic — it calls `main` with the given argv/deps and reports the result through `setExitCode` instead
// of touching `process.exitCode` directly, so this test can inject a fake argv, fake deps and a capturing
// `setExitCode` without spawning a real process. Spawning the built `dist/bin.js` (or skipping this file entirely
// when `dist/` doesn't exist yet) is not an acceptable substitute — it would only ever run after a build, and
// never exercise this wiring as part of the package's own unit test suite. bin.ts's very last line (the real
// `process.argv`, `defaultDeps()` and `process.exitCode`) is deliberately left uncovered, same as before.
import { describe, expect, it } from "vitest";
import { run } from "../src/bin.js";
import { PwaGateRunError, type PwaGateRunOptions, type PwaGateRunResultsFile } from "../src/run-gate.js";
import type { PwaGateVerdict } from "../src/gate-verdict.js";
import type { CliDeps } from "../src/cli.js";

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

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    runGate: () => makeResult(),
    resolveRepo: () => "/resolved/repo",
    nvmDir: undefined,
    fsLike: { readdirSync: () => [] },
    cwd: "/cwd",
    stdout: () => {},
    stderr: () => {},
    ...overrides,
  };
}

const baseArgv = ["--commit", "abc123", "--out", "/tmp/out", "--node", "22=/usr/bin/node22", "--signer", "Alice", "--availability-check", "gh auth status"];

describe("run", () => {
  it("calls main with the given argv/deps and reports a passing verdict's exit code via setExitCode", () => {
    let exitCode: number | undefined;
    const deps = makeDeps({ runGate: () => makeResult({ verdict: makeVerdict(true) }) });

    run(baseArgv, deps, (code) => {
      exitCode = code;
    });

    expect(exitCode).toBe(0);
  });

  it("reports exit code 1 for a failing verdict", () => {
    let exitCode: number | undefined;
    const deps = makeDeps({
      runGate: () => makeResult({ verdict: makeVerdict(false, [{ kind: "worktree-not-removed", node: 22 }]) }),
    });

    run(baseArgv, deps, (code) => {
      exitCode = code;
    });

    expect(exitCode).toBe(1);
  });

  it("reports exit code 2 for a usage error, without ever calling runGate", () => {
    let exitCode: number | undefined;
    let runGateCalled = false;
    const deps = makeDeps({
      runGate: () => {
        runGateCalled = true;
        return makeResult();
      },
    });

    run([], deps, (code) => {
      exitCode = code;
    });

    expect(exitCode).toBe(2);
    expect(runGateCalled).toBe(false);
  });

  it("propagates a refusal thrown by runGate (e.g. out-exists) as exit code 2", () => {
    let exitCode: number | undefined;
    const deps = makeDeps({
      runGate: () => {
        throw new PwaGateRunError("out-exists", "Output directory already exists: /tmp/out");
      },
    });

    run(baseArgv, deps, (code) => {
      exitCode = code;
    });

    expect(exitCode).toBe(2);
  });

  it("resolves --repo via deps.resolveRepo, proving run() delegates to the real main()", () => {
    let receivedRepo: string | undefined;
    const deps = makeDeps({
      resolveRepo: () => "/resolved/repo",
      runGate: (options: PwaGateRunOptions) => {
        receivedRepo = options.repo;
        return makeResult();
      },
    });

    run(baseArgv, deps, () => {});

    expect(receivedRepo).toBe("/resolved/repo");
  });
});
