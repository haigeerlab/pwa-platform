// Parses the local gate's command-line arguments into a typed request. Kept as a pure function over argv (no path
// existence checks, no environment reads) so the whole surface of "did the caller pass a sane request" is unit
// testable without a real Node executable or output directory (task G3 checks existence when it runs the gate).
// `--node` is optional at this layer: an argv with none produces an empty `nodes` array, which the CLI (task G4)
// resolves to nvm-discovered defaults before calling runGate.
export type PwaGateNodeTarget = {
  readonly major: number;
  readonly executablePath: string;
};

export type PwaGateArgs = {
  readonly commit: string;
  readonly outDir: string;
  readonly nodes: readonly PwaGateNodeTarget[];
  readonly signer: string;
  readonly availabilityCheckCommand: string;
  readonly recordId?: string;
};

export type PwaGateArgsErrorCode =
  | "missing-commit"
  | "missing-out"
  | "malformed-node"
  | "duplicate-node"
  | "missing-signer"
  | "missing-availability-check"
  | "missing-value"
  | "unknown-argument";

export class PwaGateArgsError extends Error {
  readonly code: PwaGateArgsErrorCode;

  constructor(code: PwaGateArgsErrorCode, message: string) {
    super(message);
    this.name = "PwaGateArgsError";
    this.code = code;
  }
}

const NODE_MAJOR = /^\d+$/;

/**
 * `pnpm gate:local -- --commit ...` is the documented invocation; pnpm 11 passes that leading `--` straight
 * through to the script's argv instead of consuming it (S2), so a single leading `--` is dropped here before
 * parsing — anything after the first argument is left alone, so `--` used as a value elsewhere is unaffected.
 */
function stripLeadingDoubleDash(argv: readonly string[]): readonly string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

export function parseGateArgs(rawArgv: readonly string[]): PwaGateArgs {
  const argv = stripLeadingDoubleDash(rawArgv);
  let commit: string | undefined;
  let outDir: string | undefined;
  let signer: string | undefined;
  let availabilityCheckCommand: string | undefined;
  let recordId: string | undefined;
  const nodes: PwaGateNodeTarget[] = [];
  const seenMajors = new Set<number>();

  let index = 0;
  while (index < argv.length) {
    const flag = argv[index];
    if (flag === undefined) break; // Unreachable given the loop guard; narrows the type for noUncheckedIndexedAccess.

    const value = argv[index + 1];
    if (value === undefined) {
      throw new PwaGateArgsError("missing-value", `Flag "${flag}" is missing its value`);
    }

    switch (flag) {
      case "--commit":
        commit = value;
        break;
      case "--out":
        outDir = value;
        break;
      case "--signer":
        signer = value;
        break;
      case "--availability-check":
        availabilityCheckCommand = value;
        break;
      case "--record-id":
        recordId = value;
        break;
      case "--node": {
        const separator = value.indexOf("=");
        if (separator <= 0 || separator === value.length - 1) {
          throw new PwaGateArgsError("malformed-node", `--node must be "<major>=<path>", got "${value}"`);
        }
        const majorText = value.slice(0, separator);
        const executablePath = value.slice(separator + 1);
        if (!NODE_MAJOR.test(majorText)) {
          throw new PwaGateArgsError("malformed-node", `--node major version must be a positive integer, got "${majorText}"`);
        }
        const major = Number(majorText);
        if (seenMajors.has(major)) {
          throw new PwaGateArgsError("duplicate-node", `--node ${major} was given more than once`);
        }
        seenMajors.add(major);
        nodes.push({ major, executablePath });
        break;
      }
      default:
        throw new PwaGateArgsError("unknown-argument", `Unknown argument "${flag}"`);
    }

    index += 2;
  }

  if (commit === undefined) throw new PwaGateArgsError("missing-commit", "--commit is required");
  if (outDir === undefined) throw new PwaGateArgsError("missing-out", "--out is required");
  // No --node at all is allowed here: the CLI (task G4) resolves defaults via nvm when `nodes` comes back empty.
  if (signer === undefined) throw new PwaGateArgsError("missing-signer", "--signer is required");
  if (availabilityCheckCommand === undefined) {
    throw new PwaGateArgsError("missing-availability-check", "--availability-check is required");
  }

  return {
    commit,
    outDir,
    nodes,
    signer,
    availabilityCheckCommand,
    ...(recordId !== undefined ? { recordId } : {}),
  };
}
