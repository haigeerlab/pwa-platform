import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Same two-step shape as build-cloudflare-site.mjs and its siblings: build the example package's workspace
// dependencies from source first (it consumes them through their built `dist`), then run the CLI from inside the
// package so its `@pwa-platform/*` imports resolve through its own node_modules.
const root = resolve(import.meta.dirname, "..");
const packageDirectory = resolve(root, "packages", "examples-browser-e2e");
const extraArgs = process.argv.slice(2);

run(["--filter", "@pwa-platform/examples-browser-e2e^...", "run", "build"]);

const cli = spawnSync(process.execPath, ["release-verifier/cli.ts", ...extraArgs], {
  cwd: packageDirectory, stdio: "inherit",
});
if (cli.error) throw cli.error;
process.exit(cli.status ?? 1);

function run(command) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", command, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed with exit code ${result.status ?? 1}`);
}
