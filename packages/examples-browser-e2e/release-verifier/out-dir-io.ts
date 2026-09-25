// The filesystem/git side of the output-directory rule that out-dir.ts (M4) judges: which roots are forbidden, and
// what path to actually judge (module spec, "输出与入口": "输出目录必须位于仓库及其所有 worktree 之外，已存在即
// 拒绝运行"). Kept separate from out-dir.ts so that module stays free of disk and process access.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/**
 * Every worktree's path, `git worktree list --porcelain` run against `repoRoot` — which already includes the main
 * checkout as its first entry, so "the repo and every worktree" needs no separate case for the main checkout.
 */
export function listWorktreeRoots(repoRoot: string): readonly string[] {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`release-verifier: could not list git worktrees for ${repoRoot}`);
  }
  const roots: string[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) roots.push(realpathSync(line.slice("worktree ".length)));
  }
  if (roots.length === 0) throw new Error(`release-verifier: git worktree list returned no worktrees for ${repoRoot}`);
  return roots;
}

/**
 * Resolves `outDir` to the realpath-normalized form `checkOutputDir` expects, without requiring `outDir` itself to
 * exist yet — only its parent has to (an output directory `--out` names is always created fresh by this tool).
 */
export function resolveOutDirForCheck(outDir: string): string {
  const resolved = resolve(outDir);
  const parent = realpathSync(dirname(resolved));
  return join(parent, basename(resolved));
}
