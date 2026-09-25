// Is a chosen output directory safely outside the repo and every worktree? Pure path arithmetic on
// already-normalized strings; the caller (M5) is responsible for realpath-resolving both sides first and for the
// separate "does it already exist" check, which needs the filesystem.

export type PwaOutputDirCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Rejects an output directory that equals, or is nested inside, any forbidden root.
 *
 * Both `outDir` and `forbiddenRoots` are expected to already be realpath-normalized absolute paths (the caller owns
 * resolving symlinks; this function only owns the string comparison). Trailing slashes are tolerated. Comparison is
 * prefix-based on path segments, not raw strings, so a sibling directory that merely starts with the same
 * characters (`/x/repo2` against forbidden root `/x/repo`) is not mistaken for being inside it.
 */
export function checkOutputDir(outDir: string, forbiddenRoots: readonly string[]): PwaOutputDirCheck {
  const target = stripTrailingSlash(outDir);
  for (const rawRoot of forbiddenRoots) {
    const root = stripTrailingSlash(rawRoot);
    const segmentPrefix = root === "/" ? "/" : `${root}/`;
    if (target === root || target.startsWith(segmentPrefix)) {
      return { ok: false, reason: `Output directory is inside a forbidden root: ${root}` };
    }
  }
  return { ok: true };
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
