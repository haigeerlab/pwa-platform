import { spawnSync } from "node:child_process";

export function spawnPnpm(args, options) {
  if (process.platform !== "win32") return spawnSync("pnpm", args, options);
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error("Run this command through pnpm so its CLI path is available on Windows");
  return spawnSync(process.execPath, [cli, ...args], options);
}
