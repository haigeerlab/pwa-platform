import { describe, expect, it } from "vitest";
import { gateVerdict, type PwaGateRunResults } from "../src/gate-verdict.js";
import { GATE_COMMANDS } from "../src/gate-commands.js";

const blockingCommands = GATE_COMMANDS.filter((entry) => entry.blocking).map((entry) => entry.command);
const RESOLVED_COMMIT = "a".repeat(40);

function passingResults(nodes: readonly number[]): PwaGateRunResults {
  return {
    commands: nodes.flatMap((node) => blockingCommands.map((command) => ({ node, command, exitCode: 0 }))),
    worktrees: nodes.map((node) => ({ node, removed: true })),
    nodeVersions: nodes.map((node) => ({ node, observedMajor: node })),
    commits: nodes.map((node) => ({ node, observedCommit: RESOLVED_COMMIT })),
    resolvedCommit: RESOLVED_COMMIT,
  };
}

describe("gateVerdict", () => {
  it("fails when no Node version was required at all, so a fully empty configuration can never pass", () => {
    const verdict = gateVerdict([], { commands: [], worktrees: [], nodeVersions: [], commits: [], resolvedCommit: RESOLVED_COMMIT }, GATE_COMMANDS, []);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "no-nodes" });
  });

  it("passes with no failures when every blocking command succeeds and every worktree is removed", () => {
    const verdict = gateVerdict([22, 24], passingResults([22, 24]), GATE_COMMANDS, [22, 24]);
    expect(verdict).toEqual({ pass: true, failures: [] });
  });

  it("fails when a non-audit command has a non-zero exit code", () => {
    const results = passingResults([22]);
    const failing = { ...results, commands: results.commands.map((entry) => (entry.command === "pnpm lint" ? { ...entry, exitCode: 1 } : entry)) };
    const verdict = gateVerdict([22], failing, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "command-failed", node: 22, command: "pnpm lint", exitCode: 1 });
  });

  it("still passes when only the audit fails", () => {
    const results = passingResults([22]);
    const withFailingAudit: PwaGateRunResults = {
      ...results,
      commands: [...results.commands, { node: 22, command: "pnpm audit --ignore-registry-errors", exitCode: 1 }],
    };
    const verdict = gateVerdict([22], withFailingAudit, GATE_COMMANDS, [22]);
    expect(verdict).toEqual({ pass: true, failures: [] });
  });

  it("fails when a blocking command's result is missing entirely", () => {
    const results = passingResults([22]);
    const missingTypecheck = { ...results, commands: results.commands.filter((entry) => entry.command !== "pnpm typecheck") };
    const verdict = gateVerdict([22], missingTypecheck, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "missing-command", node: 22, command: "pnpm typecheck" });
  });

  it("fails when a worktree was not removed", () => {
    const results = passingResults([22]);
    const worktreeLeftBehind: PwaGateRunResults = { ...results, worktrees: [{ node: 22, removed: false }] };
    const verdict = gateVerdict([22], worktreeLeftBehind, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "worktree-not-removed", node: 22 });
  });

  it("fails when an expected node has no worktree result recorded at all", () => {
    const verdict = gateVerdict([22, 24], passingResults([22]), GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "worktree-not-removed", node: 24 });
  });

  it("fails when the observed Node major version does not match the declared one", () => {
    const results = passingResults([22]);
    const mismatched: PwaGateRunResults = { ...results, nodeVersions: [{ node: 22, observedMajor: 99 }] };
    const verdict = gateVerdict([22], mismatched, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "node-mismatch", node: 22, observedMajor: 99 });
  });

  it("passes when the observed Node major version matches the declared one", () => {
    const verdict = gateVerdict([22], passingResults([22]), GATE_COMMANDS, [22]);
    expect(verdict).toEqual({ pass: true, failures: [] });
  });

  it("fails as node-mismatch when a node's version probe is entirely missing — no permissive default", () => {
    const results = passingResults([22]);
    const noProbe: PwaGateRunResults = { ...results, nodeVersions: [] };
    const verdict = gateVerdict([22], noProbe, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "node-mismatch", node: 22, observedMajor: -1 });
  });

  it("checks against an injected command list instead of the real GATE_COMMANDS", () => {
    const customCommands = [
      { command: "node -e \"process.exit(0)\"", blocking: true },
      { command: "node -e \"process.exit(1)\"", blocking: false },
    ];
    const results: PwaGateRunResults = {
      commands: [
        { node: 22, command: "node -e \"process.exit(0)\"", exitCode: 0 },
        { node: 22, command: "node -e \"process.exit(1)\"", exitCode: 1 },
      ],
      worktrees: [{ node: 22, removed: true }],
      nodeVersions: [{ node: 22, observedMajor: 22 }],
      commits: [{ node: 22, observedCommit: RESOLVED_COMMIT }],
      resolvedCommit: RESOLVED_COMMIT,
    };
    const verdict = gateVerdict([22], results, customCommands, [22]);
    expect(verdict).toEqual({ pass: true, failures: [] });
  });

  // B2: an incomplete Node set must not silently pass — the requiredMajors default is ADR-0031's matrix.
  it("fails with missing-node for every required major that never produced a round, even with a default requiredMajors", () => {
    const verdict = gateVerdict([22], passingResults([22]));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "missing-node", node: 24 });
  });

  it("fails with missing-node when requiredMajors names a major that has no round at all, distinct from worktree-not-removed", () => {
    const verdict = gateVerdict([22], passingResults([22]), GATE_COMMANDS, [22, 24]);
    expect(verdict.failures).toContainEqual({ kind: "missing-node", node: 24 });
    expect(verdict.failures.some((failure) => failure.kind === "worktree-not-removed" && failure.node === 24)).toBe(false);
  });

  it("does not fail missing-node when every required major has a round", () => {
    const verdict = gateVerdict([22, 24], passingResults([22, 24]), GATE_COMMANDS, [22, 24]);
    expect(verdict.failures.some((failure) => failure.kind === "missing-node")).toBe(false);
  });

  // B1: a round whose observed commit does not match the resolved release SHA must fail the verdict.
  it("fails with commit-mismatch when a round's observed commit does not match the resolved commit", () => {
    const results = passingResults([22]);
    const wrongCommit: PwaGateRunResults = { ...results, commits: [{ node: 22, observedCommit: "b".repeat(40) }] };
    const verdict = gateVerdict([22], wrongCommit, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "commit-mismatch", node: 22, observedCommit: "b".repeat(40), resolvedCommit: RESOLVED_COMMIT });
  });

  it("passes commit checking when every round's observed commit matches the resolved commit", () => {
    const verdict = gateVerdict([22], passingResults([22]), GATE_COMMANDS, [22]);
    expect(verdict.failures.some((failure) => failure.kind === "commit-mismatch")).toBe(false);
  });

  // S5: a round that threw before finishing must fail as round-error, and a lost version probe as probe-failed.
  it("fails with round-error when a round is recorded as having thrown", () => {
    const results = passingResults([22]);
    const withRoundError: PwaGateRunResults = { ...results, roundErrors: [{ node: 22, message: "worktree add failed: boom" }] };
    const verdict = gateVerdict([22], withRoundError, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "round-error", node: 22, message: "worktree add failed: boom" });
  });

  it("fails with probe-failed when a version probe is recorded as failed", () => {
    const results = passingResults([22]);
    const withProbeFailure: PwaGateRunResults = { ...results, probeFailures: [{ node: 22, probe: "pnpm -v" }] };
    const verdict = gateVerdict([22], withProbeFailure, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "probe-failed", node: 22, probe: "pnpm -v" });
  });

  // S6: a command that timed out must fail as command-timeout, not silently look like a missing command.
  it("fails with command-timeout when a command is recorded as timed out, instead of missing-command", () => {
    const results = passingResults([22]);
    const withoutOutcome = { ...results, commands: results.commands.filter((entry) => entry.command !== "pnpm lint") };
    const withTimeout: PwaGateRunResults = { ...withoutOutcome, timeouts: [{ node: 22, command: "pnpm lint" }] };
    const verdict = gateVerdict([22], withTimeout, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "command-timeout", node: 22, command: "pnpm lint" });
    expect(verdict.failures).not.toContainEqual({ kind: "missing-command", node: 22, command: "pnpm lint" });
  });

  // N1: a signed record must never be able to claim a tool version it did not actually run under.
  it("fails with tool-stale for every reason recorded in toolStaleReasons, independent of any node", () => {
    const results = passingResults([22]);
    const withStaleTool: PwaGateRunResults = { ...results, toolStaleReasons: ["commit-mismatch", "dirty-now"] };
    const verdict = gateVerdict([22], withStaleTool, GATE_COMMANDS, [22]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ kind: "tool-stale", reason: "commit-mismatch" });
    expect(verdict.failures).toContainEqual({ kind: "tool-stale", reason: "dirty-now" });
  });

  it("does not fail tool-stale when toolStaleReasons is absent or empty", () => {
    const verdict = gateVerdict([22], passingResults([22]), GATE_COMMANDS, [22]);
    expect(verdict.failures.some((failure) => failure.kind === "tool-stale")).toBe(false);
    const verdictEmpty = gateVerdict([22], { ...passingResults([22]), toolStaleReasons: [] }, GATE_COMMANDS, [22]);
    expect(verdictEmpty.failures.some((failure) => failure.kind === "tool-stale")).toBe(false);
  });
});
