import { describe, expect, it } from "vitest";
import { parseGateArgs, PwaGateArgsError } from "../src/parse-gate-args.js";

const baseArgv = ["--commit", "abc123", "--out", "/tmp/out", "--node", "22=/usr/bin/node22", "--signer", "Alice", "--availability-check", "gh auth status"];

describe("parseGateArgs", () => {
  it("parses a fully specified argv", () => {
    expect(parseGateArgs(baseArgv)).toEqual({
      commit: "abc123",
      outDir: "/tmp/out",
      nodes: [{ major: 22, executablePath: "/usr/bin/node22" }],
      signer: "Alice",
      availabilityCheckCommand: "gh auth status",
    });
  });

  it("parses multiple --node entries and an optional --record-id", () => {
    const argv = [...baseArgv, "--node", "24=/usr/bin/node24", "--record-id", "2026-09-22-01"];
    const parsed = parseGateArgs(argv);
    expect(parsed.nodes).toEqual([
      { major: 22, executablePath: "/usr/bin/node22" },
      { major: 24, executablePath: "/usr/bin/node24" },
    ]);
    expect(parsed.recordId).toBe("2026-09-22-01");
  });

  it("rejects a missing --signer", () => {
    const argv = baseArgv.filter((_, index, arr) => !(arr[index - 1] === "--signer" || arr[index] === "--signer"));
    expect(() => parseGateArgs(argv)).toThrow(PwaGateArgsError);
    try {
      parseGateArgs(argv);
      throw new Error("expected parseGateArgs to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PwaGateArgsError);
      expect((error as PwaGateArgsError).code).toBe("missing-signer");
    }
  });

  it("rejects a missing --availability-check", () => {
    const argv = baseArgv.filter((_, index, arr) => !(arr[index - 1] === "--availability-check" || arr[index] === "--availability-check"));
    expect(() => parseGateArgs(argv)).toThrow(PwaGateArgsError);
    try {
      parseGateArgs(argv);
      throw new Error("expected parseGateArgs to throw");
    } catch (error) {
      expect((error as PwaGateArgsError).code).toBe("missing-availability-check");
    }
  });

  it("allows argv with no --node at all, leaving nodes empty for the CLI to resolve via nvm", () => {
    const argv = baseArgv.filter((_, index, arr) => !(arr[index - 1] === "--node" || arr[index] === "--node"));
    expect(parseGateArgs(argv).nodes).toEqual([]);
  });

  it("rejects a malformed --node missing the '=' separator", () => {
    const argv = ["--commit", "abc123", "--out", "/tmp/out", "--node", "22", "--signer", "Alice", "--availability-check", "gh auth status"];
    try {
      parseGateArgs(argv);
      throw new Error("expected parseGateArgs to throw");
    } catch (error) {
      expect((error as PwaGateArgsError).code).toBe("malformed-node");
    }
  });

  it("rejects a malformed --node with a non-numeric major version", () => {
    const argv = ["--commit", "abc123", "--out", "/tmp/out", "--node", "current=/usr/bin/node", "--signer", "Alice", "--availability-check", "gh auth status"];
    try {
      parseGateArgs(argv);
      throw new Error("expected parseGateArgs to throw");
    } catch (error) {
      expect((error as PwaGateArgsError).code).toBe("malformed-node");
    }
  });

  // S2: pnpm 11 passes a leading "--" through to the script's argv (`pnpm gate:local -- --commit ...`); the
  // parser must tolerate one, since the README and record template tell operators to type it.
  it("ignores a single leading '--', matching pnpm's argv passthrough", () => {
    expect(parseGateArgs(["--", ...baseArgv])).toEqual(parseGateArgs(baseArgv));
  });

  it("rejects a duplicate Node major version", () => {
    const argv = [...baseArgv, "--node", "22=/usr/bin/other-node22"];
    try {
      parseGateArgs(argv);
      throw new Error("expected parseGateArgs to throw");
    } catch (error) {
      expect((error as PwaGateArgsError).code).toBe("duplicate-node");
    }
  });
});
