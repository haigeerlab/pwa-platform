import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnPnpm } from "./spawn-pnpm.mjs";

test("Windows runs pnpm CLI through Node with separate arguments and caller options", () => {
  const directory = mkdtempSync(join(tmpdir(), "spawn-pnpm-"));
  const cli = join(directory, "pnpm cli.cjs");
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const priorCli = process.env.npm_execpath;
  try {
    writeFileSync(cli, "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), marker: process.env.PNPM_TEST_MARKER }))");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    process.env.npm_execpath = cli;
    const result = spawnPnpm(["exec", "path with spaces", "value&more"], {
      cwd: directory, env: { ...process.env, PNPM_TEST_MARKER: "forwarded" }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      args: ["exec", "path with spaces", "value&more"], cwd: realpathSync(directory), marker: "forwarded",
    });
    delete process.env.npm_execpath;
    assert.throws(() => spawnPnpm([], {}), /Run this command through pnpm/);
  } finally {
    Object.defineProperty(process, "platform", platform);
    if (priorCli === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = priorCli;
    rmSync(directory, { recursive: true, force: true });
  }
});
