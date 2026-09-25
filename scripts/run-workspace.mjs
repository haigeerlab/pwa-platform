import { spawnSync } from "node:child_process";

const OPERATIONS = new Set(["build", "test", "test:browser", "typecheck"]);
const [operation, ...rest] = process.argv.slice(2);

if (!OPERATIONS.has(operation)) {
  throw new Error(`Unsupported workspace operation: ${operation ?? "(missing)"}`);
}

const target = readFilter(rest);

// Workspace packages consume their dependencies through the built `dist`, so build those first.
if (target) {
  // A package without workspace dependencies matches nothing here, which is fine.
  run(["--filter", `${target}^...`, "run", "build"]);
  // A misspelled package name must fail instead of silently running nothing.
  run(["--filter", target, "--fail-if-no-match", "run", operation]);
} else {
  if (operation !== "build") run(["--recursive", "run", "build"]);
  // Browser suites run one package at a time. pnpm's default concurrency (4) starts several real Chromes at
  // once, and under that load the Push click scenario timed out 4 times in 20 (spec/browser-test-harness.md,
  // "增补：全仓浏览器测试逐包串行"); a gate result must not depend on how busy the machine is.
  const concurrency = operation === "test:browser" ? ["--workspace-concurrency=1"] : [];
  run(["--recursive", ...concurrency, "run", operation]);
}

function readFilter(args) {
  if (args.length === 0) return undefined;
  const value =
    args.length === 1 && args[0].startsWith("--filter=")
      ? args[0].slice("--filter=".length)
      : args.length === 2 && args[0] === "--filter"
        ? args[1]
        : undefined;
  if (!value) throw new Error(`Unsupported arguments: ${args.join(" ")} (expected --filter <package>)`);
  return value;
}

function run(args) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error) process.stderr.write(`Failed to run pnpm ${args.join(" ")}: ${result.error.message}\n`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
