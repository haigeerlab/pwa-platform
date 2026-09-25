// Reads back what a build actually shipped, the same idea as examples-browser-e2e/browser-tests/release.ts:
// assertions are built from the artifacts a real build produced, not from a hand-copied expectation.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PwaPrecacheEntry } from "@pwa-platform/contracts";

/** Reads the platform worker's injected precache manifest from a built `.output/public/sw.js`. */
export async function readShippedPrecache(publicDir: string): Promise<readonly PwaPrecacheEntry[]> {
  const source = await readFile(join(publicDir, "sw.js"), "utf8");
  const matches = [...source.matchAll(/^\s*manifest: (\[.*\])$/gm)];
  const first = matches[0]?.[1];
  if (matches.length !== 1 || first === undefined) {
    throw new Error(`Expected exactly one injected manifest in the shipped worker, found ${matches.length}`);
  }
  return JSON.parse(first) as readonly PwaPrecacheEntry[];
}
