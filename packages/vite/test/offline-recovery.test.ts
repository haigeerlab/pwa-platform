import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_PAGE_SCRIPT } from "../src/offline-page.js";

function page(storage = new Map<string, string>(), options: { reachable?: boolean; unsupported?: boolean; storageFails?: boolean } = {}) {
  const reload = vi.fn();
  const events = new Map<string, () => void>();
  let retry: (() => void) | undefined;
  const document = { visibilityState: "visible", querySelector: () => ({ addEventListener: (_: string, callback: () => void) => { retry = callback; } }), addEventListener: (name: string, callback: () => void) => events.set(name, callback) };
  class Channel {
    port1 = { onmessage: null as null | ((event: { data: unknown }) => void), close: vi.fn() };
    port2 = { postMessage: (data: unknown) => queueMicrotask(() => this.port1.onmessage?.({ data })), close: vi.fn() };
  }
  const postMessage = vi.fn((_data: unknown, ports: { postMessage: (data: unknown) => void }[]) => {
    if (!options.unsupported) ports[0]?.postMessage({ type: "pwa:offline:probe-result", version: 1, reachable: options.reachable ?? true });
  });
  const fetch = vi.fn(async () => new Response(null, { status: 200 }));
  const sessionStorage = {
    getItem: (key: string) => { if (options.storageFails) throw new Error("storage denied"); return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (options.storageFails) throw new Error("storage denied"); storage.set(key, value); },
    removeItem: (key: string) => storage.delete(key),
  };
  runInNewContext(OFFLINE_PAGE_SCRIPT, {
    document, navigator: { serviceWorker: { controller: { scriptURL: "https://shop.example/app/sw.js", postMessage } } },
    location: { reload }, sessionStorage, MessageChannel: Channel, URL, Date,
    window: { addEventListener: (name: string, callback: () => void) => events.set(name, callback) },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, fetch,
  });
  return { reload, events, document, postMessage, fetch, retry: () => retry?.() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("offline recovery boundaries", () => {
  it("does not treat one occasional success as recovery or share the budget between independent tabs", async () => {
    const options = { reachable: true };
    const first = page(new Map(), options);
    await vi.advanceTimersByTimeAsync(10_000);
    options.reachable = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.reload).not.toHaveBeenCalled();
    options.reachable = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.reload).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
    const separate = page(new Map());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(separate.reload).toHaveBeenCalledTimes(1);
  });
  it("never reloads when the worker is reachable but the business document fails for 60 seconds", async () => {
    const p = page(new Map(), { reachable: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.reload).not.toHaveBeenCalled();
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it("requires two successes and persists a one-reload budget across a second offline document", async () => {
    const storage = new Map<string, string>();
    const first = page(storage);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.reload).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
    const second = page(storage);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(second.reload).not.toHaveBeenCalled();
    expect(second.postMessage).not.toHaveBeenCalled();
  });

  it.each([{ storageFails: true }, { unsupported: true }])("keeps manual retry when recovery cannot be trusted: %j", async (options) => {
    const p = page(new Map(), options);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.reload).not.toHaveBeenCalled();
    p.retry();
    p.retry();
    expect(p.reload).toHaveBeenCalledTimes(1);
  });

  it("does not bypass the cooldown through online events or reload a hidden document", async () => {
    const p = page();
    for (let i = 0; i < 10; i++) p.events.get("online")?.();
    expect(p.postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    p.document.visibilityState = "hidden";
    p.events.get("visibilitychange")?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.reload).not.toHaveBeenCalled();
  });
});
