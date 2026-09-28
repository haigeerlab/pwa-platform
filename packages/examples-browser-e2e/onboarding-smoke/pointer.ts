// global-setup.ts runs in the Playwright runner process; the spec file runs in a separate worker process, so the
// two can only share the fixture's location on disk. This fixed path is that hand-off point.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const POINTER_PATH: string = join(dirname(fileURLToPath(import.meta.url)), ".onboarding-fixture-pointer.json");

export type FixturePointer = {
  readonly distDir: string;
  readonly workDir: string;
};
