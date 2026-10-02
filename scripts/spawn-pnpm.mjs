import { spawnSync } from "node:child_process";
import { extname } from "node:path";

export function spawnPnpm(args, options) {
  if (process.platform !== "win32") return spawnSync("pnpm", args, options);
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error("Run this command through pnpm so its CLI path is available on Windows");
  const extension = extname(cli).toLowerCase();
  if (extension === ".exe") return spawnSync(cli, args, options);
  if ([".js", ".cjs", ".mjs"].includes(extension)) return spawnSync(process.execPath, [cli, ...args], options);
  throw new Error(`Unsupported pnpm CLI type on Windows: ${extension || "(none)"}`);
}
