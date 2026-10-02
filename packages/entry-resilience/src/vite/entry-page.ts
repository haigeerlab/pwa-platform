// Resolves the recovery page script's build entry (`src/page/main.ts`) to an absolute path the plugin can hand to
// `this.emitFile({ type: "chunk", ... })`.
//
// This module's own `import.meta.url` tells the whole story: under Vitest the plugin runs straight from
// `src/vite/index.ts`, so its sibling `../page/main.ts` exists on disk and TypeScript's own extension is `.ts`;
// inside a real build the plugin runs from the compiled `dist/vite/index.js`, whose sibling is the compiled
// `../page/main.js`, and `dist/page/main.ts` does not exist at all — `tsc` only ever emits `.js`/`.d.ts` there.
// Both cases turn on the same fact: this module's own extension. The sibling's existence does not need a
// filesystem check; this module's own URL already carries the same information.
import { fileURLToPath } from "node:url";

const TS_EXTENSION = ".ts";
const ENTRY_PAGE_TS = "../page/main.ts";
const ENTRY_PAGE_JS = "../page/main.js";

/**
 * `moduleUrl` is the caller's own `import.meta.url`, passed in rather than read here so this stays a plain
 * function a test can call with either extension without needing two real files on disk.
 */
export function resolveEntryPageId(moduleUrl: string): string {
  const sibling = moduleUrl.endsWith(TS_EXTENSION) ? ENTRY_PAGE_TS : ENTRY_PAGE_JS;
  return fileURLToPath(new URL(sibling, moduleUrl));
}

/** Bundle names become URL paths in the recovery page and in the compiled precache. */
export function urlFileName(fileName: string): string {
  return fileName.replaceAll("\\", "/");
}
