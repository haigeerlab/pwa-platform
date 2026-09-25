// DEFAULT_NODE_MAJORS must track .github/workflows/ci.yml's Node matrix, or the CLI's nvm defaults would silently
// diverge from what CI actually runs. Parsed as text (no YAML dependency), matching the same `node: [...]` line
// gate-commands.test.ts's CI-parity check reads from.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_NODE_MAJORS } from "../src/cli.js";

describe("DEFAULT_NODE_MAJORS / ci.yml parity", () => {
  it("matches the Node majors in ci.yml's matrix", () => {
    const ciPath = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
    const ciText = readFileSync(ciPath, "utf8");
    const match = /node:\s*\[([^\]]+)\]/.exec(ciText);
    if (match?.[1] === undefined) throw new Error("Could not find ci.yml's `node: [...]` matrix line");

    const ciMajors = match[1]
      .split(",")
      .map((entry) => Number(entry.trim().replaceAll(/['"]/g, "")))
      .sort((a, b) => a - b);

    expect([...DEFAULT_NODE_MAJORS].sort((a, b) => a - b)).toEqual(ciMajors);
  });
});
