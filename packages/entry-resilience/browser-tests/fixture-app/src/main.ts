// The fixture page for the real-browser tests. It is not an example application: it renders a marker, registers
// the platform worker, and hands the real page-side API under test to the spec through `window`, because the
// assertions are about what those functions do in a real browser rather than about an interface.
//
// EM4 (tasks/pwa-entry-resilience/plan.md, 2026-09-23) folded the former scenario app into this one: with
// ADR-0033's build-time seed gone, a scenario's initial manifest (if any) is established the same way a real
// application would establish it — an explicit `updateEntryManifest` call — so the two apps no longer needed to
// differ. `__entryUpdate` and `__entryCheck` are the real public API (src/client/index.ts), called exactly as an
// application would call them.
import { checkEntryRecovery, setPwaTheme, updateEntryManifest } from "../../../src/client/index.js";
import type { EntryUpdateResult, PwaTheme } from "../../../src/client/index.js";
import type { EntryRecoveryResult } from "../../../src/index.js";

const shell = document.createElement("h1");
shell.id = "shell";
shell.textContent = "entry-resilience fixture";
document.getElementById("app")?.append(shell);

Reflect.set(window, "__entryUpdate", (data: unknown): Promise<EntryUpdateResult> => updateEntryManifest(data));
Reflect.set(window, "__entryCheck", (returnPath?: string): Promise<EntryRecoveryResult> =>
  checkEntryRecovery(returnPath === undefined ? {} : { returnPath }),
);
Reflect.set(window, "__setPwaTheme", (theme: PwaTheme): void => setPwaTheme(theme));

void navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
