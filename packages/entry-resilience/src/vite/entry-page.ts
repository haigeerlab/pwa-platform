// Resolves the recovery page script's build entry (`src/page/main.ts`) to an absolute path the plugin can hand to
// `this.emitFile({ type: "chunk", ... })`.
//
// This module's own `import.meta.url` tells the whole story: under Vitest the plugin runs straight from
// `src/vite/index.ts`, so its sibling `../page/main.ts` exists on disk and TypeScript's own extension is `.ts`;
// inside a real build the plugin runs from the compiled `dist/vite/index.js`, whose sibling is the compiled
// `../page/main.js`, and `dist/page/main.ts` does not exist at all — `tsc` only ever emits `.js`/`.d.ts` there.
// Both cases turn on the same fact: this module's own extension. `src/` may not import `node:fs` (see
// ADR-0018, "src/ 环境中立"), so the sibling's existence cannot be checked directly, but it never needs to be —
// this module's own URL already carries the same information a filesystem check would.
const TS_EXTENSION = ".ts";
const ENTRY_PAGE_TS = "../page/main.ts";
const ENTRY_PAGE_JS = "../page/main.js";

/**
 * `moduleUrl` is the caller's own `import.meta.url`, passed in rather than read here so this stays a plain
 * function a test can call with either extension without needing two real files on disk.
 */
export function resolveEntryPageId(moduleUrl: string): string {
  const sibling = moduleUrl.endsWith(TS_EXTENSION) ? ENTRY_PAGE_TS : ENTRY_PAGE_JS;
  return decodeURIComponent(new URL(sibling, moduleUrl).pathname);
}
