import { readFile, rm } from "node:fs/promises";
import { POINTER_PATH, type ScenarioPointer } from "./pointer.js";

export default async function globalTeardown(): Promise<void> {
  let pointer: ScenarioPointer;
  try {
    pointer = JSON.parse(await readFile(POINTER_PATH, "utf8")) as ScenarioPointer;
  } catch {
    return;
  }
  await rm(pointer.workDir, { recursive: true, force: true });
  await rm(POINTER_PATH, { force: true });
}
