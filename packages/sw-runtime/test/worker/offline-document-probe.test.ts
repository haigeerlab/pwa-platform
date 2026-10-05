import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOfflineDocumentProbe } from "../../src/worker/offline-document-probe.js";
import type { PwaPlatformWorkerConfig } from "../../src/shared/config.js";

const config: Pick<PwaPlatformWorkerConfig, "scope" | "pathRules" | "offlineFallback"> = {
  scope: "/app/", offlineFallback: { enabled: true, path: "/app/offline.html" },
  pathRules: [{ pathPrefix: "/app/private", action: "deny" }, { pathPrefix: "/app/child", action: "exclude" }, { pathPrefix: "/app", action: "network-first" }],
};
function harness(url = "https://shop.example/app/products?q=1") {
  const response = new Response("<html>business</html>", { headers: { "Content-Type": "text/html" } });
  Object.defineProperties(response, { type: { value: "basic" }, url: { value: url } });
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response);
  const matchAll = vi.fn(async () => [{ id: "client", type: "window", url }]);
  const scope = { location: new URL("https://shop.example/app/sw.js"), fetch, clients: { matchAll } } as unknown as ServiceWorkerGlobalScope;
  return { probe: createOfflineDocumentProbe(scope, config), fetch, matchAll };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("offline document network probe", () => {
  it("fetches only its controlled document with no HTTP cache and no redirect", async () => {
    const h = harness();
    expect(await h.probe("client")).toBe(true);
    expect(h.fetch).toHaveBeenCalledWith("https://shop.example/app/products?q=1", expect.objectContaining({ cache: "no-store", redirect: "error", mode: "same-origin", credentials: "same-origin" }));
    expect(h.matchAll).toHaveBeenCalledWith({ type: "window" });
    expect(await h.probe("client")).toBe(false);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["https://other.example/app/", "https://shop.example/outside/", "https://shop.example/app/child/a", "https://shop.example/app/private/a", "https://shop.example/app/offline.html?q=1", "https://shop.example/app/sw.js"])("rejects an unsafe target %s", async (url) => {
    const h = harness(url);
    expect(await h.probe("client")).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("does not fetch for an uncontrolled client", async () => {
    const h = harness();
    expect(await h.probe("other-client")).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("accepts a probe after the cooldown when the cleanup timer has not run", async () => {
    const h = harness();
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    h.fetch.mockImplementation(async () => {
      const response = new Response("<html>business</html>", { headers: { "Content-Type": "text/html" } });
      Object.defineProperties(response, { type: { value: "basic" }, url: { value: "https://shop.example/app/products?q=1" } });
      return response;
    });
    try {
      expect(await h.probe("client")).toBe(true);
      await vi.advanceTimersByTimeAsync(5000);
      // Elapsed time has passed the deadline, while the cleanup callback is still queued.
      clock.mockReturnValue(11_001);
      expect(await h.probe("client")).toBe(true);
      // The old cleanup must not remove the newer cooldown.
      await vi.advanceTimersByTimeAsync(5000);
      expect(await h.probe("client")).toBe(false);
      expect(h.fetch).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });

  it("bounds a stalled request and prevents overlapping probes", async () => {
    const h = harness();
    h.fetch.mockImplementationOnce(() => new Promise(() => {}));
    const pending = h.probe("client");
    await vi.advanceTimersByTimeAsync(0);
    expect(await h.probe("client")).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBe(false);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it.each([404, 500])("rejects HTTP %s", async (status) => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(new Response("error", { status, headers: { "Content-Type": "text/html" } }));
    expect(await h.probe("client")).toBe(false);
  });

  it.each(["application/json", "text/html"])("rejects empty or non-HTML response bodies (%s)", async (contentType) => {
    const h = harness();
    const response = new Response(contentType === "text/html" ? "" : "{}", { headers: { "Content-Type": contentType } });
    Object.defineProperties(response, { type: { value: "basic" }, url: { value: "https://shop.example/app/products?q=1" } });
    h.fetch.mockResolvedValueOnce(response);
    expect(await h.probe("client")).toBe(false);
  });

  it.each([{ redirected: true }, { url: "https://other.example/app/" }, { type: "opaque" }])("rejects redirect or non-basic network results %j", async (fields) => {
    const h = harness();
    const response = new Response("<html>business</html>", { headers: { "Content-Type": "text/html" } });
    const properties = { type: "basic", url: "https://shop.example/app/products?q=1", ...fields };
    Object.defineProperties(response, Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { value }])));
    h.fetch.mockResolvedValueOnce(response);
    expect(await h.probe("client")).toBe(false);
  });

  it("times out even when headers arrived but the HTML body stalls", async () => {
    const h = harness();
    const response = new Response(new ReadableStream(), { headers: { "Content-Type": "text/html" } });
    Object.defineProperties(response, { type: { value: "basic" }, url: { value: "https://shop.example/app/products?q=1" } });
    h.fetch.mockResolvedValueOnce(response);
    const pending = h.probe("client");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBe(false);
  });
});
