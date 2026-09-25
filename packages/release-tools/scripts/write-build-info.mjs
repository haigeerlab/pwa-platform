#!/usr/bin/env node
// Writes dist/build-info.json (N1, run by the package's own `build` script right after `tsc`): the gate tool's
// own git HEAD SHA and dirty flag at build time, so a run can later prove (or fail to prove) it is executing the
// exact build its own repository produced. `dist/` is git-ignored and can drift from HEAD if it isn't rebuilt
// after a commit — src/run-gate.ts's `resolveToolStaleness` (N1) is what actually checks this snapshot against
// the tool's current HEAD/dirty state at run time and fails the gate as `tool-stale` on any mismatch.
//
// Dependency-free by design (no npm packages, only Node builtins): this script runs as a plain build step, not
// through the package's own TypeScript/test toolchain, so it must not need `pnpm install` to have already run.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  return execFileSync("git", args, { cwd: packageDir, encoding: "utf8" });
}

const commit = git(["rev-parse", "HEAD"]).trim();
const dirty = git(["status", "--porcelain"]).trim().length > 0;

const buildInfo = { commit, dirty };
writeFileSync(join(packageDir, "dist", "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
