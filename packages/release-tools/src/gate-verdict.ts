// The gate's conclusion (ADR-0031): pass only when every blocking command succeeded, on every *required* Node
// version, against the resolved release commit, with a matching observed Node major and a removed worktree, and
// no round threw or lost a version probe. Kept as a pure function over already-collected results so the verdict
// can be unit tested without running any command or touching a worktree (that belongs to task G3's executor).
//
// Every one of `nodeVersions`, `commits` and `resolvedCommit` is required, not optional: an executor that forgot
// to collect one of these checks must not be able to produce a passing verdict by omission. `requiredMajors`
// defaults to ADR-0031's matrix so an incomplete Node set (a round that never ran) fails as `missing-node` even
// if every node that *did* run looks clean — this is what B2 protects against.
import { GATE_COMMANDS, type PwaGateCommand } from "./gate-commands.js";
import { DEFAULT_NODE_MAJORS } from "./node-majors.js";

export type PwaGateCommandOutcome = {
  readonly node: number;
  readonly command: string;
  readonly exitCode: number;
};

export type PwaGateWorktreeOutcome = {
  readonly node: number;
  readonly removed: boolean;
};

/** The Node major version observed in a round's log header (`node -v`), for comparison against the declared one. */
export type PwaGateNodeVersionOutcome = {
  readonly node: number;
  readonly observedMajor: number;
};

/** The commit observed in a round's log header (`git rev-parse HEAD`), for comparison against the resolved SHA. */
export type PwaGateCommitOutcome = {
  readonly node: number;
  readonly observedCommit: string;
};

/** A round that threw before it could finish (S5): the worktree is still cleaned up, but nothing else is trusted. */
export type PwaGateRoundErrorOutcome = {
  readonly node: number;
  readonly message: string;
};

/** A version probe (`node -v`, `pnpm -v`, Chrome, commit) whose output was not the expected single line (S5). */
export type PwaGateProbeFailureOutcome = {
  readonly node: number;
  readonly probe: string;
};

/** A command that hit `commandTimeoutMs` (S6) and was killed before it could produce an exit code. */
export type PwaGateTimeoutOutcome = {
  readonly node: number;
  readonly command: string;
};

/**
 * Why the gate tool's own build is not trusted to match what it actually ran under (N1): `dist/` is git-ignored
 * and can drift from HEAD, so a signed record must never be able to claim a tool version it did not run.
 * `missing-build-info` means `dist/build-info.json` (written by the package's `build` script) was not found at
 * all; `commit-mismatch` means it was found but names a different commit than the tool's current HEAD;
 * `dirty-at-build` means the tool's working tree had uncommitted changes when it was built; `dirty-now` means it
 * has uncommitted changes right now, independent of what was true at build time.
 */
export type PwaGateToolStaleReason = "missing-build-info" | "commit-mismatch" | "dirty-at-build" | "dirty-now";

export type PwaGateRunResults = {
  readonly commands: readonly PwaGateCommandOutcome[];
  readonly worktrees: readonly PwaGateWorktreeOutcome[];
  readonly nodeVersions: readonly PwaGateNodeVersionOutcome[];
  readonly commits: readonly PwaGateCommitOutcome[];
  readonly resolvedCommit: string;
  readonly roundErrors?: readonly PwaGateRoundErrorOutcome[];
  readonly probeFailures?: readonly PwaGateProbeFailureOutcome[];
  readonly timeouts?: readonly PwaGateTimeoutOutcome[];
  /** N1: every reason the gate tool's own build looks stale, independent of any node's round. */
  readonly toolStaleReasons?: readonly PwaGateToolStaleReason[];
};

export type PwaGateVerdictFailure =
  | { readonly kind: "missing-command"; readonly node: number; readonly command: string }
  | { readonly kind: "command-failed"; readonly node: number; readonly command: string; readonly exitCode: number }
  | { readonly kind: "worktree-not-removed"; readonly node: number }
  /** No Node version was required at all: a verdict with nothing checked must never read as a pass. */
  | { readonly kind: "no-nodes" }
  /** A required Node major (ADR-0031's matrix, or the caller's override) has no round at all. */
  | { readonly kind: "missing-node"; readonly node: number }
  | { readonly kind: "node-mismatch"; readonly node: number; readonly observedMajor: number }
  | { readonly kind: "commit-mismatch"; readonly node: number; readonly observedCommit: string; readonly resolvedCommit: string }
  | { readonly kind: "round-error"; readonly node: number; readonly message: string }
  | { readonly kind: "probe-failed"; readonly node: number; readonly probe: string }
  | { readonly kind: "command-timeout"; readonly node: number; readonly command: string }
  /** N1: the gate tool's own build looks stale — never node-specific. */
  | { readonly kind: "tool-stale"; readonly reason: PwaGateToolStaleReason };

export type PwaGateVerdict = {
  readonly pass: boolean;
  readonly failures: readonly PwaGateVerdictFailure[];
};

/**
 * Computes the gate's conclusion. Audit results are never consulted here — ADR-0031 makes the dependency audit
 * non-blocking, so a missing or failing audit entry must not appear in `failures`.
 *
 * `expectedNodes` are the Node majors that actually produced a round (whatever `runGate` iterated); `commands`
 * defaults to the real ADR-0031 command set; `requiredMajors` defaults to ADR-0031's Node matrix and is what
 * `missing-node` is checked against, independently of what `expectedNodes` happens to contain — a round that
 * silently never ran must still fail the verdict.
 */
export function gateVerdict(
  expectedNodes: readonly number[],
  results: PwaGateRunResults,
  commands: readonly PwaGateCommand[] = GATE_COMMANDS,
  requiredMajors: readonly number[] = DEFAULT_NODE_MAJORS,
): PwaGateVerdict {
  const failures: PwaGateVerdictFailure[] = [];
  const blockingCommands = commands.filter((entry) => entry.blocking).map((entry) => entry.command);

  if (requiredMajors.length === 0 && expectedNodes.length === 0) failures.push({ kind: "no-nodes" });

  // N1: global, not tied to any node's round — a stale tool build fails the gate regardless of what else passed.
  for (const reason of results.toolStaleReasons ?? []) {
    failures.push({ kind: "tool-stale", reason });
  }

  for (const major of requiredMajors) {
    if (!expectedNodes.includes(major)) failures.push({ kind: "missing-node", node: major });
  }

  for (const node of expectedNodes) {
    const roundError = results.roundErrors?.find((entry) => entry.node === node);
    if (roundError !== undefined) {
      failures.push({ kind: "round-error", node, message: roundError.message });
    }

    for (const probeFailure of results.probeFailures?.filter((entry) => entry.node === node) ?? []) {
      failures.push({ kind: "probe-failed", node, probe: probeFailure.probe });
    }

    for (const command of blockingCommands) {
      const timedOut = results.timeouts?.some((entry) => entry.node === node && entry.command === command) ?? false;
      if (timedOut) {
        failures.push({ kind: "command-timeout", node, command });
        continue;
      }

      const outcome = results.commands.find((entry) => entry.node === node && entry.command === command);
      if (outcome === undefined) {
        failures.push({ kind: "missing-command", node, command });
      } else if (outcome.exitCode !== 0) {
        failures.push({ kind: "command-failed", node, command, exitCode: outcome.exitCode });
      }
    }

    const worktree = results.worktrees.find((entry) => entry.node === node);
    if (worktree === undefined || !worktree.removed) {
      failures.push({ kind: "worktree-not-removed", node });
    }

    const nodeVersion = results.nodeVersions.find((entry) => entry.node === node);
    if (nodeVersion === undefined || nodeVersion.observedMajor !== node) {
      failures.push({ kind: "node-mismatch", node, observedMajor: nodeVersion?.observedMajor ?? -1 });
    }

    const commit = results.commits.find((entry) => entry.node === node);
    if (commit === undefined || commit.observedCommit !== results.resolvedCommit) {
      failures.push({ kind: "commit-mismatch", node, observedCommit: commit?.observedCommit ?? "", resolvedCommit: results.resolvedCommit });
    }
  }

  return { pass: failures.length === 0, failures };
}

/**
 * One human-readable line per failure kind. Shared by the CLI's stdout summary and the record's "失败项" section
 * (S8) so the two surfaces never drift apart on how a failure is described.
 */
export function describeGateFailure(failure: PwaGateVerdictFailure): string {
  switch (failure.kind) {
    case "missing-command":
      return `node ${failure.node}: "${failure.command}" did not run`;
    case "command-failed":
      return `node ${failure.node}: "${failure.command}" exited ${failure.exitCode}`;
    case "command-timeout":
      return `node ${failure.node}: "${failure.command}" timed out`;
    case "worktree-not-removed":
      return `node ${failure.node}: worktree was not removed`;
    case "node-mismatch":
      return `node ${failure.node}: observed Node major was ${failure.observedMajor}`;
    case "commit-mismatch":
      return `node ${failure.node}: observed commit was ${failure.observedCommit || "(none)"}, expected ${failure.resolvedCommit}`;
    case "round-error":
      return `node ${failure.node}: round threw: ${failure.message}`;
    case "probe-failed":
      return `node ${failure.node}: version probe "${failure.probe}" failed`;
    case "missing-node":
      return `node ${failure.node}: required but no round ran`;
    case "no-nodes":
      return "no Node version was required";
    case "tool-stale":
      return `tool build is stale: ${describeToolStaleReason(failure.reason)}`;
  }
}

function describeToolStaleReason(reason: PwaGateToolStaleReason): string {
  switch (reason) {
    case "missing-build-info":
      return "dist/build-info.json is missing";
    case "commit-mismatch":
      return "the tool's build-time commit does not match its current HEAD";
    case "dirty-at-build":
      return "the tool's working tree was dirty when it was built";
    case "dirty-now":
      return "the tool's working tree is dirty now";
  }
}
