import { writeFile } from "node:fs/promises";
import { buildOnboardingFixture } from "./build-fixture.js";
import { POINTER_PATH, type FixturePointer } from "./pointer.js";

/** Builds the fixture once before the spec file's worker process starts; global-teardown.ts removes it afterwards. */
export default async function globalSetup(): Promise<void> {
  const fixture = await buildOnboardingFixture();
  const pointer: FixturePointer = { distDir: fixture.distDir, workDir: fixture.workDir };
  await writeFile(POINTER_PATH, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
}
