#!/usr/bin/env node
// The local gate's actual executable entry (S1). `run` is bin.ts's only testable logic: it calls `main` with the
// given argv/deps and reports the exit code through `setExitCode` instead of touching `process.exitCode`
// directly, so a test can inject a fake argv, fake deps and a capturing `setExitCode` without spawning a real
// process (test/bin.test.ts). The one line below `run` isn't covered by a unit test: it supplies the real
// `process.argv`, `defaultDeps()` and `process.exitCode` — deliberately `process.exitCode`, not `process.exit(...)`,
// so stdout/stderr writes are allowed to flush before the process exits. This replaces the old
// `import.meta.url === file://process.argv[1]` guard that used to live at the bottom of cli.ts: that check
// silently no-ops (never runs `main` at all) when the file is reached through a symlink whose resolved path
// differs from argv[1] — exactly the case a `bin` entry goes through — so cli.ts is now a pure, fully
// unit-testable library module and this tiny file is the only thing that actually runs on invocation.
import { defaultDeps, main, type CliDeps } from "./cli.js";

export function run(argv: readonly string[], deps: CliDeps, setExitCode: (code: number) => void): void {
  setExitCode(main(argv, deps));
}

run(process.argv.slice(2), defaultDeps(), (code) => {
  process.exitCode = code;
});
