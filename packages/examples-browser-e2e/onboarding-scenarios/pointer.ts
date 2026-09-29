// Same hand-off as onboarding-smoke/pointer.ts: global-setup runs in the runner process, the spec in a worker.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const POINTER_PATH: string = join(dirname(fileURLToPath(import.meta.url)), ".onboarding-scenarios-pointer.json");

export type ScenarioPointer = {
  readonly appDir: string;
  readonly workDir: string;
};
