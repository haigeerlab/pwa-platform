// The local gate tool's public surface (ADR-0031, spec/platform-governance.md "修订：本地门禁工具入仓"): the pure
// core (command list, verdict computation, log header formatting, record rendering, CLI argument parsing), the
// executor that spawns processes and writes worktrees/logs (run-gate.ts), and the CLI entry that wires them
// together (cli.ts). The `bin` in package.json points at the compiled cli.js directly; these exports are for
// anything that wants to call the pieces programmatically instead.
export { GATE_COMMANDS } from "./gate-commands.js";
export type { PwaGateCommand } from "./gate-commands.js";
export { gateVerdict, describeGateFailure } from "./gate-verdict.js";
export type {
  PwaGateCommandOutcome,
  PwaGateCommitOutcome,
  PwaGateNodeVersionOutcome,
  PwaGateProbeFailureOutcome,
  PwaGateRoundErrorOutcome,
  PwaGateRunResults,
  PwaGateTimeoutOutcome,
  PwaGateToolStaleReason,
  PwaGateVerdict,
  PwaGateVerdictFailure,
  PwaGateWorktreeOutcome,
} from "./gate-verdict.js";
export { logHeader } from "./log-header.js";
export type { PwaGateLogHeaderFields } from "./log-header.js";
export { renderRecord } from "./render-record.js";
export type { PwaGateAvailabilityCheck, PwaGateRecordMeta, PwaGateRecordRoundRow, PwaGateRecordRow } from "./render-record.js";
export { parseGateArgs, PwaGateArgsError } from "./parse-gate-args.js";
export type { PwaGateArgs, PwaGateArgsErrorCode, PwaGateNodeTarget } from "./parse-gate-args.js";
export { runGate, PwaGateRunError } from "./run-gate.js";
export type {
  PwaGateRunAvailabilityCheckResult,
  PwaGateRunCommandResult,
  PwaGateRunNodeTarget,
  PwaGateRunOptions,
  PwaGateRunRefusalCode,
  PwaGateRunResultsFile,
  PwaGateRunRound,
  PwaGateToolCommitSnapshot,
} from "./run-gate.js";
export { DEFAULT_NODE_MAJORS, CliUsageError, defaultDeps, exitCodeFor, main, resolveDefaultNodes } from "./cli.js";
export type { CliDeps, CliOutcome, CliUsageCode, NvmFsLike } from "./cli.js";
