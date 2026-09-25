import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// src/ and dist/ both sit directly under the package root, next to fixtures/.
const FIXTURES_ROOT = resolve(fileURLToPath(new URL("../fixtures/", import.meta.url)));

/** Absolute path of a file or directory inside the package's `fixtures/` directory. */
export function fixturePath(...segments: readonly string[]): string {
  const target = resolve(FIXTURES_ROOT, ...segments);
  if (target !== FIXTURES_ROOT && !target.startsWith(FIXTURES_ROOT + sep)) {
    throw new Error(`Fixture path escapes the fixtures directory: ${segments.join("/")}`);
  }
  return target;
}

/** Selector of the visible marker element on the minimal page (`fixtures/pages/index.html`). */
export const MINIMAL_PAGE_MARKER = "[data-harness-marker]";
