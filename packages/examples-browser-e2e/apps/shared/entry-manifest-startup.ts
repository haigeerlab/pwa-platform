// The examples' stand-in for a business backend's own entry-manifest endpoint — spec/examples-browser-e2e.md's
// revised "契约增量": "清单来源做成真实形态". A real application would call its own (authenticated, possibly
// encrypted) endpoint and decrypt the response itself before handing the plaintext object to `updateEntryManifest`;
// this example instead fetches a same-origin static file that ships with the build. Both examples call this at
// startup, unconditionally.
//
// No DOM API is used here (only `fetch` and `JSON.parse`, both global under Node's own runtime too), so — like
// apps/shared/identity.ts — this file is typechecked as part of both this package's Node-side program
// (tsconfig.json) and each example's browser-side program (tsconfig.app.json), and is exercised directly by a
// Node-side Vitest test rather than only through a real browser.
import type { EntryUpdateResult } from "@pwa-platform/entry-resilience/client";

/**
 * Fetches `<mountPath>entry-manifest.json` from the same origin and, on success, hands the parsed body to
 * `updateEntryManifest`.
 *
 * Never throws: a network failure, a non-OK response (including 404), a non-JSON body, or `updateEntryManifest`
 * rejecting the manifest are all swallowed. The caller does not need to await failure handling of its own — the
 * application still renders and still registers its service worker either way.
 */
export async function loadStartupEntryManifest(
  mountPath: string,
  updateEntryManifest: (data: unknown) => Promise<EntryUpdateResult>,
): Promise<void> {
  try {
    const response = await fetch(`${mountPath}entry-manifest.json`, { cache: "no-store" });
    if (!response.ok) return;
    const data: unknown = await response.json();
    await updateEntryManifest(data);
  } catch {
    // Swallowed on purpose — see docstring. A business application's own request layer would decide separately
    // whether a failure here is worth reporting; this example does not.
  }
}
