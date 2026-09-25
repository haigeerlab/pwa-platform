// spec/examples-browser-e2e.md's revised "测试策略增量": "entry-manifest.json 缺失或非法时应用仍正常启动（不抛出、
// 不白屏）". `loadStartupEntryManifest` is the one piece of startup code that reaches outside the application (a
// same-origin fetch it does not control the response of), so it is the thing these three failure shapes have to
// prove resilient: both examples call it with `void` (see apps/react/src/main.tsx, apps/vue/src/main.ts) rather
// than awaiting it, so a rejection here would surface only as an unhandled rejection, not a blocked render — but an
// unhandled rejection is exactly the kind of thing that should not happen either, hence "never throws" is tested
// directly rather than assumed from the call site.
import type { EntryUpdateResult } from "@pwa-platform/entry-resilience/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadStartupEntryManifest } from "./entry-manifest-startup.js";

const MOUNT_PATH = "/app/";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A minimal `fetch` stand-in returning one fixed `Response`-shaped value, regardless of input. */
function stubFetch(response: { readonly ok: boolean; readonly json: () => Promise<unknown> }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

describe("loadStartupEntryManifest", () => {
  it("does not throw and does not call updateEntryManifest when the manifest request 404s", async () => {
    // A parseable body on purpose: a server's 404 page can be valid JSON, so this pins that the non-OK status
    // short-circuits before the body is ever handed on. A rejecting `json()` here would pass even without that check.
    stubFetch({
      ok: false,
      json: () => Promise.resolve({ error: "not found" }),
    });
    const updateEntryManifest = vi.fn();

    await expect(loadStartupEntryManifest(MOUNT_PATH, updateEntryManifest)).resolves.toBeUndefined();
    expect(updateEntryManifest).not.toHaveBeenCalled();
  });

  it("does not throw and does not call updateEntryManifest when the response body is not JSON", async () => {
    stubFetch({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token in JSON")),
    });
    const updateEntryManifest = vi.fn();

    await expect(loadStartupEntryManifest(MOUNT_PATH, updateEntryManifest)).resolves.toBeUndefined();
    expect(updateEntryManifest).not.toHaveBeenCalled();
  });

  it("does not throw when the parsed body is an invalid manifest that updateEntryManifest rejects", async () => {
    stubFetch({ ok: true, json: () => Promise.resolve({ notAManifest: true }) });
    const rejected: EntryUpdateResult = {
      accepted: false,
      diagnostics: [{ code: "entry.manifest-invalid-shape", path: "" }],
    };
    const updateEntryManifest = vi.fn(async () => rejected);

    await expect(loadStartupEntryManifest(MOUNT_PATH, updateEntryManifest)).resolves.toBeUndefined();
    expect(updateEntryManifest).toHaveBeenCalledWith({ notAManifest: true });
  });

  it("hands the parsed body to updateEntryManifest on the happy path", async () => {
    const manifest = { sequence: 1, status: "normal", reason: { code: "none" }, entries: [] };
    stubFetch({ ok: true, json: () => Promise.resolve(manifest) });
    const accepted: EntryUpdateResult = { accepted: true, sequence: 1 };
    const updateEntryManifest = vi.fn(async () => accepted);

    await loadStartupEntryManifest(MOUNT_PATH, updateEntryManifest);

    expect(updateEntryManifest).toHaveBeenCalledWith(manifest);
  });

  it("does not throw when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("network error"))),
    );
    const updateEntryManifest = vi.fn();

    await expect(loadStartupEntryManifest(MOUNT_PATH, updateEntryManifest)).resolves.toBeUndefined();
    expect(updateEntryManifest).not.toHaveBeenCalled();
  });
});
