import { readFile, rm } from "node:fs/promises";
import { POINTER_PATH, type FixturePointer } from "./pointer.js";

export default async function globalTeardown(): Promise<void> {
  let pointer: FixturePointer;
  try {
    pointer = JSON.parse(await readFile(POINTER_PATH, "utf8")) as FixturePointer;
  } catch {
    return;
  }
  await rm(pointer.workDir, { recursive: true, force: true });
  await rm(POINTER_PATH, { force: true });
}
