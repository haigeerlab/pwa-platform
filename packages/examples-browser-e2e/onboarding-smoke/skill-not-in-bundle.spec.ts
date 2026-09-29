// DT8 (spec/ai-onboarding.md): the onboarding skill is a development aid and must never reach a production bundle.
// The fixture project is the one build-fixture.ts installed from packed tarballs, so the skill copied here is the very
// directory the published @pwa-platform/vite tarball ships. Three builds of the same project:
//   1. the baseline (global-setup's build, no skill anywhere),
//   2. the skill copied where it belongs (.claude/skills and .agents/skills) with a sentinel line added,
//   3. the skill copied where it must never be (public/) - a deliberate leak that the detector has to catch, which is
//      what shows the checks in 2 can fail at all.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { POINTER_PATH, type FixturePointer } from "./pointer.js";

const pointer = JSON.parse(readFileSync(POINTER_PATH, "utf8")) as FixturePointer;
const appDir = join(pointer.workDir, "app");
const installedSkill = join(appDir, "node_modules", "@pwa-platform", "vite", "skills", "pwa-onboarding");
const SENTINEL = "PWA_ONBOARDING_SKILL_SENTINEL_7f3a91c2";

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out.sort();
}

async function hashes(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of await listFiles(dir)) result[relative(dir, file)] = createHash("sha256").update(await readFile(file)).digest("hex");
  return result;
}

/** Everything in `dir` that shows the skill got in: a skill path, or the sentinel inside any file's bytes. */
async function leaks(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const file of await listFiles(dir)) {
    const rel = relative(dir, file);
    if (/(^|\/)(skills|\.claude|\.agents)(\/|$)|SKILL\.md$|pwa-onboarding/.test(rel)) found.push(`path: ${rel}`);
    if ((await readFile(file)).includes(SENTINEL)) found.push(`content: ${rel}`);
  }
  return found;
}

function build(outDir: string): void {
  const result = spawnSync("pnpm", ["exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"], { cwd: appDir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`vite build failed:\n${result.stdout}\n${result.stderr}`);
}

async function installSkillCopy(into: string): Promise<void> {
  await mkdir(join(into, ".."), { recursive: true });
  await cp(installedSkill, into, { recursive: true });
  await appendFile(join(into, "SKILL.md"), `\n${SENTINEL}\n`, "utf8");
}

test.describe("DT8 the onboarding skill never reaches the production bundle", () => {
  test.setTimeout(240_000);

  test("the installed package really ships the skill (so the copies below are the real thing)", async () => {
    expect((await listFiles(installedSkill)).map((file) => relative(installedSkill, file))).toContain("SKILL.md");
  });

  test("with the skill copied to .claude/skills and .agents/skills the build has no trace of it and is byte-identical to the baseline", async () => {
    const claude = join(appDir, ".claude", "skills", "pwa-onboarding");
    const agents = join(appDir, ".agents", "skills", "pwa-onboarding");
    const outDir = join(pointer.workDir, "dist-with-skill");
    await installSkillCopy(claude);
    await installSkillCopy(agents);
    try {
      build(outDir);
      expect(await leaks(outDir)).toEqual([]);
      expect(await hashes(outDir)).toEqual(await hashes(pointer.distDir));
    } finally {
      await rm(join(appDir, ".claude"), { recursive: true, force: true });
      await rm(join(appDir, ".agents"), { recursive: true, force: true });
    }
  });

  test("mutation: a copy placed in public/ IS detected (proves the checks above can fail)", async () => {
    const publicCopy = join(appDir, "public", "pwa-onboarding");
    const outDir = join(pointer.workDir, "dist-leaked");
    await installSkillCopy(publicCopy);
    try {
      build(outDir);
      const found = await leaks(outDir);
      expect(found.some((line) => line.startsWith("path:"))).toBe(true);
      expect(found.some((line) => line.startsWith("content:"))).toBe(true);
      expect(await hashes(outDir)).not.toEqual(await hashes(pointer.distDir));
    } finally {
      await rm(publicCopy, { recursive: true, force: true });
    }
  });
});
