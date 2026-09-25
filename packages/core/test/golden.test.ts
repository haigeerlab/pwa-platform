import ts from "typescript";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../src/index.js";

// Golden inputs are plain JSON, so tests call through an `unknown`-typed alias.
const compile = compilePlan as (candidate: unknown) => ReturnType<typeof compilePlan>;

function read(location: string): string {
  const text = ts.sys.readFile(decodeURIComponent(new URL(location, import.meta.url).pathname));
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

function serialize(result: ReturnType<typeof compilePlan>): string {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  return `${JSON.stringify(result.value, null, 2)}\n`;
}

// Any change to these committed plans is a compiler semantics change and needs explicit review (ADR-0007).
const CASES = ["storefront", "root-minimal"] as const;

describe("golden plans", () => {
  it.each(CASES)("compiles %s to the committed plan byte for byte", (name) => {
    const input: unknown = JSON.parse(read(`./golden/${name}.input.json`));
    expect(serialize(compile(input))).toBe(read(`./golden/${name}.plan.json`));
  });

  it.each(CASES)("compiles %s to the same bytes when build files are listed in reverse", (name) => {
    const input = JSON.parse(read(`./golden/${name}.input.json`)) as { hostBuildOutput: { files: unknown[] } };
    input.hostBuildOutput.files.reverse();
    expect(serialize(compile(input))).toBe(read(`./golden/${name}.plan.json`));
  });
});
