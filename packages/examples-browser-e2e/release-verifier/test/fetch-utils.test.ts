// Direct coverage of fetch-utils.ts's two safety properties, independent of the rest of the pipeline: neither
// request shape ever follows a redirect off its starting origin, and every request is bounded by a timeout so a
// hanging socket cannot hang the tool. (Reproduced by the main session against the pre-fix code: a same-origin
// wrapper that followed a redirect to a *different* host let observe.ts record that other host's headers as if
// they were the requested site's own — see run.test.ts's "cross-origin redirects" suites for the end-to-end version.)
import { afterEach, describe, expect, it } from "vitest";
import { fetchFollowingRedirects, fetchWithoutFollowingRedirects } from "../fetch-utils.ts";
import { startScriptedServer, type ScriptedServer } from "./support.ts";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function server(routes: Parameters<typeof startScriptedServer>[0]): Promise<ScriptedServer> {
  const instance = await startScriptedServer(routes);
  cleanups.push(() => instance.close());
  return instance;
}

describe("fetchFollowingRedirects", () => {
  it("follows a same-origin redirect (the Cloudflare Pages pretty-URL shape)", async () => {
    const site = await server({
      "/app/index.html": { redirectTo: "/app/", status: 301 },
      "/app/": { status: 200, body: "shell" },
    });
    const outcome = await fetchFollowingRedirects(`${site.origin}/app/index.html`);
    expect(outcome).toMatchObject({ ok: true, value: { finalUrl: `${site.origin}/app/`, bodySha256: expect.any(String) } });
  });

  it("refuses a redirect to a different origin instead of following it", async () => {
    const other = await server({ "/app/sw.js": { status: 200, headers: { "cache-control": "no-cache" }, body: "self;" } });
    const site = await server({ "/app/sw.js": { redirectTo: `${other.origin}/app/sw.js`, status: 302 } });

    const outcome = await fetchFollowingRedirects(`${site.origin}/app/sw.js`);

    // status/location are carried so a caller (observeHtmlHeaders) can record why a path went unresolved, the same
    // way fetchWithoutFollowingRedirects already does for the worker/manifest/fingerprinted-asset collector.
    expect(outcome).toEqual({ ok: false, reason: "cross-origin redirect", status: 302, location: `${other.origin}/app/sw.js` });
  });

  it("refuses a redirect that changes scheme even when the host:port string matches", async () => {
    const site = await server({ "/app/sw.js": { redirectTo: "https://127.0.0.1:1/app/sw.js", status: 302 } });
    const outcome = await fetchFollowingRedirects(`${site.origin}/app/sw.js`);
    expect(outcome).toEqual({ ok: false, reason: "cross-origin redirect", status: 302, location: "https://127.0.0.1:1/app/sw.js" });
  });

  it("times out against a request that never responds, rather than hanging forever", async () => {
    const site = await server({ "/app/sw.js": { hang: true } });
    const started = Date.now();
    const outcome = await fetchFollowingRedirects(`${site.origin}/app/sw.js`, 200);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("fetchWithoutFollowingRedirects", () => {
  it("treats a same-origin redirect as not observed (a browser cannot register a worker reached through one)", async () => {
    const site = await server({
      "/app/sw.js": { redirectTo: "/app/sw-actual.js", status: 308 },
      "/app/sw-actual.js": { status: 200, headers: { "cache-control": "no-cache" }, body: "self;" },
    });
    const outcome = await fetchWithoutFollowingRedirects(`${site.origin}/app/sw.js`);
    expect(outcome).toEqual({ ok: false, reason: "redirect", status: 308, location: "/app/sw-actual.js" });
  });

  it("returns headers only for a direct HTTP 200", async () => {
    const site = await server({ "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: "{}" } });
    const outcome = await fetchWithoutFollowingRedirects(`${site.origin}/app/manifest.webmanifest`);
    expect(outcome).toEqual({ ok: true, headers: expect.objectContaining({ "cache-control": "no-cache" }) });
  });

  it("times out against a request that never responds", async () => {
    const site = await server({ "/app/sw.js": { hang: true } });
    const started = Date.now();
    const outcome = await fetchWithoutFollowingRedirects(`${site.origin}/app/sw.js`, 200);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
  });
});
