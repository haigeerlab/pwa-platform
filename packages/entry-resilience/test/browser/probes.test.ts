import { afterEach, describe, expect, it, vi } from "vitest";
import { createProbes } from "../../src/browser/probes.js";

type FakeFetch = typeof fetch;

describe("createProbes", () => {
  describe("probePrimary", () => {
    it("requests a cache-busting probe path under the mount with the specified options", async () => {
      let capturedUrl: string | undefined;
      let capturedInit: RequestInit | undefined;
      const fetchImpl: FakeFetch = vi.fn(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(null, { status: 404 });
      });

      const reachable = await createProbes({ mountPath: "/app/", fetchImpl }).probePrimary();

      expect(reachable).toBe(true);
      expect(capturedUrl).toMatch(/^\/app\/__pwa-entry-probe\?/);
      expect(capturedInit).toEqual({ cache: "no-store", credentials: "omit", signal: expect.any(AbortSignal) });
    });

    it("treats a settled response, including an error status, as reachable", async () => {
      const fetchImpl: FakeFetch = async () => new Response(null, { status: 500 });
      const reachable = await createProbes({ mountPath: "/app/", fetchImpl }).probePrimary();
      expect(reachable).toBe(true);
    });

    it("treats a rejected fetch as unreachable", async () => {
      const fetchImpl: FakeFetch = async () => {
        throw new Error("connection refused");
      };
      const reachable = await createProbes({ mountPath: "/app/", fetchImpl }).probePrimary();
      expect(reachable).toBe(false);
    });
  });

  describe("probeAlternate", () => {
    it("requests the origin and startPath with a no-cors, credential-less options object", async () => {
      let capturedUrl: string | undefined;
      let capturedInit: RequestInit | undefined;
      const fetchImpl: FakeFetch = vi.fn(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(null, { status: 200 });
      });

      const reachable = await createProbes({ mountPath: "/app/", fetchImpl }).probeAlternate(
        "https://new.example.com",
        "/app/",
      );

      expect(reachable).toBe(true);
      expect(capturedUrl).toBe("https://new.example.com/app/");
      expect(capturedInit).toEqual({
        mode: "no-cors",
        credentials: "omit",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      });
    });

    it("treats a rejected fetch as unreachable", async () => {
      const fetchImpl: FakeFetch = async () => {
        throw new Error("connection refused");
      };
      const reachable = await createProbes({ mountPath: "/app/", fetchImpl }).probeAlternate(
        "https://new.example.com",
        "/app/",
      );
      expect(reachable).toBe(false);
    });
  });

  describe("timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A fetch that only settles when its signal aborts, as a request to an unreachable host can hang. */
    const hangingFetch: FakeFetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });

    it("aborts a probe that has not settled after five seconds and reports it unreachable", async () => {
      vi.useFakeTimers();
      const probes = createProbes({ mountPath: "/app/", fetchImpl: hangingFetch });
      const primary = probes.probePrimary();
      const alternate = probes.probeAlternate("https://new.example.com", "/app/");

      await vi.advanceTimersByTimeAsync(4_999);
      let settled = false;
      void Promise.race([primary, alternate]).then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(primary).resolves.toBe(false);
      await expect(alternate).resolves.toBe(false);
    });

    it("clears its timer once the probe settles", async () => {
      vi.useFakeTimers();
      const fetchImpl: FakeFetch = async () => new Response(null, { status: 200 });
      const probes = createProbes({ mountPath: "/app/", fetchImpl });

      await expect(probes.probePrimary()).resolves.toBe(true);
      await expect(probes.probeAlternate("https://new.example.com", "/app/")).resolves.toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
