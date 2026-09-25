import { describe, expect, it, vi } from "vitest";
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
});
