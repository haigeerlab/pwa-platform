import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GATE_COMMANDS } from "../src/gate-commands.js";

describe("GATE_COMMANDS", () => {
  it("lists the ADR-0031 commands in run order, marking only the audit as non-blocking", () => {
    expect(GATE_COMMANDS.map((entry) => entry.command)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm build",
      "pnpm test",
      "pnpm typecheck",
      "pnpm test:browser",
      "pnpm audit --ignore-registry-errors",
    ]);
  });

  it("marks every command blocking except the dependency audit", () => {
    for (const entry of GATE_COMMANDS) {
      expect(entry.blocking).toBe(entry.command !== "pnpm audit --ignore-registry-errors");
    }
  });
});

// S10: a CI `run:` step that GATE_COMMANDS doesn't know about (and vice versa) must be a deliberate, commented
// choice, not a silent gap — otherwise CI could grow a step the local gate never runs, or the reverse, without
// either test noticing.
const CI_RUN_EXCLUSIONS: ReadonlySet<string> = new Set([
  // Diagnostic-only: prints the runner's preinstalled Chrome version, it doesn't run any gate command.
  "google-chrome --version",
]);

describe("CI parity", () => {
  function ciRunValues(): readonly string[] {
    const ciPath = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
    const ciText = readFileSync(ciPath, "utf8");
    return [...ciText.matchAll(/^\s*run:\s*(.+)\s*$/gm)].map((match) => match[1]?.trim() ?? "");
  }

  it("runs every GATE_COMMANDS entry except the install in .github/workflows/ci.yml with identical spelling", () => {
    const runValues = ciRunValues();
    const expected = GATE_COMMANDS.map((entry) => entry.command).filter((command) => command !== "pnpm install --frozen-lockfile");

    for (const command of expected) {
      expect(runValues).toContain(command);
    }
  });

  it("has no ci.yml run: step outside GATE_COMMANDS unless it is an explicit, commented exclusion", () => {
    const runValues = ciRunValues();
    const gateCommands = new Set(GATE_COMMANDS.map((entry) => entry.command));

    for (const value of runValues) {
      if (CI_RUN_EXCLUSIONS.has(value)) continue;
      expect(gateCommands.has(value)).toBe(true);
    }
  });
});
