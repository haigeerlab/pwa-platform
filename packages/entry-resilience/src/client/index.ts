// Page-side entry for apps: spec/pwa-entry-resilience.md's revised "页面侧 API". Reads the plugin-provided virtual
// module once and shares one lazily-created set of browser ports (IndexedDB, `Date.now`, probes — see
// src/browser/index.ts's `createEntryRuntimePorts`) between both page-side functions: `checkEntryRecovery`
// (src/check.ts's `runEntryRecovery`) and `updateEntryManifest` (src/update.ts's `runEntryManifestUpdate`). Neither
// wrapper builds its own ports — a second IndexedDB store or probe set per call would be wasted work for no benefit,
// since both read/write the same `pwa-entry:<appId>:<environment>` database.
//
// Per ADR-0018's import boundary, this file's only non-relative import is the virtual module; everything else it
// needs is a relative import into the rest of this package (see src/virtual.d.ts for the module's declared type).
import config from "virtual:pwa-entry-config";
import { runEntryRecovery } from "../check.js";
import type { EntryRecoveryResult } from "../check.js";
import { runEntryManifestUpdate } from "../update.js";
import type { EntryManifestUpdateResult as EntryUpdateResult } from "../update.js";
import { createEntryRuntimePorts } from "../browser/index.js";
import type { EntryCheckOptions } from "../browser/index.js";
import { themeStorageKey } from "../internal/theme-key.js";

export type { EntryUpdateResult };

export type PwaTheme = "light" | "dark" | "system";

type EntryPorts = ReturnType<typeof createEntryRuntimePorts>;

let ports: EntryPorts | undefined;

/** Builds the shared browser ports on first use and returns the same instance on every later call. */
function sharedPorts(): EntryPorts {
  ports ??= createEntryRuntimePorts(config);
  return ports;
}

/** Runs the page-side entry-recovery check. Never throws — see `runEntryRecovery`'s docstring. */
export function checkEntryRecovery(options?: EntryCheckOptions): Promise<EntryRecoveryResult> {
  return runEntryRecovery(config, sharedPorts(), options);
}

/** Accepts a manifest the application obtained and decrypted itself. Never throws — see
 *  `runEntryManifestUpdate`'s docstring. */
export function updateEntryManifest(data: unknown): Promise<EntryUpdateResult> {
  return runEntryManifestUpdate(data, config, sharedPorts());
}

/**
 * Sets the app's theme preference, read by the recovery page (src/page/main.ts) before its first render — see
 * spec/pwa-entry-resilience.md's "跟随宿主应用的主题设置". Writes `"light"`/`"dark"` to the storage key
 * `themeStorageKey` builds; `"system"` removes the key instead, so the recovery page falls back to the system
 * preference. Never throws: `localStorage` access is wrapped, and a failure (privacy mode, disabled storage, quota)
 * is treated the same as the preference being absent.
 */
export function setPwaTheme(theme: PwaTheme): void {
  try {
    const key = themeStorageKey(config.appId, config.environment);
    if (theme === "system") localStorage.removeItem(key);
    else localStorage.setItem(key, theme);
  } catch {
    // Storage unavailable — silently no-op, per the docstring above.
  }
}
