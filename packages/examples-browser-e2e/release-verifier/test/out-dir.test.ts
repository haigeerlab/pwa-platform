import { describe, expect, it } from "vitest";
import { checkOutputDir } from "../out-dir.ts";

const repoRoot = "/x/repo";
const worktree = "/x/repo/.claude/worktrees/feature";
const forbiddenRoots = [repoRoot, worktree];

describe("checkOutputDir", () => {
  it("rejects a directory inside the repo root", () => {
    expect(checkOutputDir("/x/repo/build/out", forbiddenRoots)).toEqual({
      ok: false,
      reason: "Output directory is inside a forbidden root: /x/repo",
    });
  });

  it("rejects a directory inside a worktree", () => {
    const result = checkOutputDir("/x/repo/.claude/worktrees/feature/build/out", forbiddenRoots);
    expect(result.ok).toBe(false);
  });

  it("rejects a directory equal to a forbidden root", () => {
    expect(checkOutputDir("/x/repo", forbiddenRoots)).toEqual({
      ok: false,
      reason: "Output directory is inside a forbidden root: /x/repo",
    });
  });

  it("tolerates a trailing slash on either side", () => {
    expect(checkOutputDir("/x/repo/", forbiddenRoots).ok).toBe(false);
    expect(checkOutputDir("/x/repo/build/out/", [`${repoRoot}/`]).ok).toBe(false);
  });

  it("does not mistake a sibling directory with the same prefix for being inside the root", () => {
    // /x/repo2 starts with the characters "/x/repo" but is not nested inside it.
    expect(checkOutputDir("/x/repo2", forbiddenRoots)).toEqual({ ok: true });
    expect(checkOutputDir("/x/repo2/out", forbiddenRoots)).toEqual({ ok: true });
  });

  it("allows a directory outside every forbidden root", () => {
    expect(checkOutputDir("/var/pwa-release-records/react/main", forbiddenRoots)).toEqual({ ok: true });
  });
});
