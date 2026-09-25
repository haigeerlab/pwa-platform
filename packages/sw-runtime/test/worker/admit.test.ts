import { describe, expect, it } from "vitest";
import { admitRuntimeResponse, type PwaRuntimeAdmitOptions } from "../../src/worker/admit.js";

const DATA: PwaRuntimeAdmitOptions = { resourceClass: "public-data", strategy: "network-first", maxEntryBytes: 1024 };
const PAGE: PwaRuntimeAdmitOptions = { resourceClass: "navigation-public-dynamic", strategy: "network-first", maxEntryBytes: 1024 };
const DATA_SWR: PwaRuntimeAdmitOptions = { ...DATA, strategy: "stale-while-revalidate" };

/**
 * Node's `Response` always reports `type: "default"` and `redirected: false` for a constructed instance, so those two
 * fields are overridden per-case to exercise the admission checks against `basic` responses and redirects.
 */
function response(
  body: BodyInit | null,
  init: { readonly status?: number; readonly headers?: Record<string, string>; readonly type?: ResponseType; readonly redirected?: boolean } = {},
): Response {
  const res = new Response(body, { status: init.status ?? 200, headers: init.headers ?? {} });
  Object.defineProperty(res, "type", { value: init.type ?? "basic", configurable: true });
  Object.defineProperty(res, "redirected", { value: init.redirected ?? false, configurable: true });
  return res;
}

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...extra };
}

function htmlHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "text/html; charset=utf-8", ...extra };
}

describe("baseline admission", () => {
  it("admits a basic 200 JSON response for public-data", async () => {
    const res = response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("admits a +json media type for public-data", async () => {
    const res = response("{}", { headers: jsonHeaders() });
    Object.defineProperty(res, "headers", { value: new Headers({ "content-type": "application/problem+json" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it.each(["text/x+json", "image/foo+json", "+json"])("rejects the non-application +json media type %s", async (type) => {
    const res = response("{}", { headers: jsonHeaders() });
    Object.defineProperty(res, "headers", { value: new Headers({ "content-type": type }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("admits html with a charset parameter for navigation-public-dynamic", async () => {
    const res = response("<html></html>", { headers: htmlHeaders() });
    await expect(admitRuntimeResponse(res, PAGE)).resolves.toBe(true);
  });
});

describe("response type, status, redirect", () => {
  it("rejects non-basic response types", async () => {
    for (const type of ["default", "opaque", "cors"] as const) {
      const res = response("{}", { headers: jsonHeaders(), type });
      await expect(admitRuntimeResponse(res, DATA), type).resolves.toBe(false);
    }
  });

  it("rejects non-200 statuses", async () => {
    for (const status of [201, 204, 206, 304, 404, 500]) {
      const res = response(status === 204 || status === 304 ? null : "{}", { status, headers: jsonHeaders() });
      await expect(admitRuntimeResponse(res, DATA), String(status)).resolves.toBe(false);
    }
  });

  it("rejects redirected responses", async () => {
    const res = response("{}", { headers: jsonHeaders(), redirected: true });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });
});

describe("media type", () => {
  it("rejects html for public-data", async () => {
    const res = response("<html></html>", { headers: htmlHeaders() });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects json for navigation-public-dynamic", async () => {
    const res = response("{}", { headers: jsonHeaders() });
    await expect(admitRuntimeResponse(res, PAGE)).resolves.toBe(false);
  });

  it("rejects text/plain for both classes", async () => {
    const res1 = response("hi", { headers: { "content-type": "text/plain" } });
    const res2 = response("hi", { headers: { "content-type": "text/plain" } });
    await expect(admitRuntimeResponse(res1, DATA)).resolves.toBe(false);
    await expect(admitRuntimeResponse(res2, PAGE)).resolves.toBe(false);
  });

  it("rejects a missing Content-Type", async () => {
    // A string body gets an automatic `text/plain` Content-Type from the Fetch spec, so a genuinely absent header
    // needs a body type (bytes) that gets no such default.
    const res = response(new Uint8Array([0x7b, 0x7d]), {});
    expect(res.headers.get("content-type")).toBeNull();
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects a near-miss media type like application/jsonx", async () => {
    const res = response("{}", { headers: { "content-type": "application/jsonx" } });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });
});

describe("Cache-Control", () => {
  it("rejects no-store", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "no-store" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects private", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "private" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it('rejects private="x"', async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": 'private="x"' }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects mixed-case No-Store", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "No-Store" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects a directive with surrounding spaces", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "  no-store  " }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects no-cache under stale-while-revalidate", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "no-cache" }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it('rejects no-cache="x" under stale-while-revalidate', async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": 'no-cache="x"' }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it("admits no-cache under network-first", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "no-cache" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("rejects must-revalidate under stale-while-revalidate", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "must-revalidate" }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it("admits must-revalidate under network-first", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "must-revalidate" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("rejects max-age=0 under stale-while-revalidate", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "max-age=0" }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it('rejects max-age="0" under stale-while-revalidate', async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": 'max-age="0"' }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it("admits max-age=0 under network-first", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "max-age=0" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("rejects s-maxage=0 under stale-while-revalidate", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "s-maxage=0" }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(false);
  });

  it("admits s-maxage=0 under network-first", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "s-maxage=0" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("admits max-age=60 under stale-while-revalidate", async () => {
    const res = response("{}", { headers: jsonHeaders({ "cache-control": "max-age=60" }) });
    await expect(admitRuntimeResponse(res, DATA_SWR)).resolves.toBe(true);
  });
});

describe("Vary", () => {
  it("rejects Vary: *", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "*" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects Vary: Cookie", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "Cookie" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("rejects Vary: Accept, Cookie", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "Accept, Cookie" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(false);
  });

  it("admits Vary: Accept-Encoding", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "Accept-Encoding" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("admits Vary: accept, accept-encoding", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "accept, accept-encoding" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });

  it("admits an empty Vary", async () => {
    const res = response("{}", { headers: jsonHeaders({ vary: "" }) });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });
});

describe("body size", () => {
  it("rejects when Content-Length exceeds the limit, without reading the body", async () => {
    let pulled = false;
    // `highWaterMark: 0` stops the stream from eagerly filling its queue on construction, so `pull` only fires if
    // something actually reads from it.
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(new Uint8Array(10));
        },
      },
      new CountQueuingStrategy({ highWaterMark: 0 }),
    );
    const res = response(stream, { headers: jsonHeaders({ "content-length": "2000" }) });
    await expect(admitRuntimeResponse(res, { ...DATA, maxEntryBytes: 100 })).resolves.toBe(false);
    expect(pulled).toBe(false);
  });

  it("rejects when actual bytes exceed the limit with no Content-Length, stopping the read early", async () => {
    let chunksProduced = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          chunksProduced += 1;
          controller.enqueue(new Uint8Array(50));
        },
      },
      new CountQueuingStrategy({ highWaterMark: 0 }),
    );
    const res = response(stream, { headers: jsonHeaders() });
    await expect(admitRuntimeResponse(res, { ...DATA, maxEntryBytes: 100 })).resolves.toBe(false);
    // 3 chunks of 50 bytes cross a 100-byte limit; the reader must not keep pulling far beyond that (a stream with no
    // limit would produce chunks forever).
    expect(chunksProduced).toBeLessThan(20);
  });

  it("admits a body exactly at the limit", async () => {
    const res = response(new Uint8Array(100), { headers: jsonHeaders() });
    await expect(admitRuntimeResponse(res, { ...DATA, maxEntryBytes: 100 })).resolves.toBe(true);
  });

  it("rejects a lying Content-Length smaller than the actual body, by counting actual bytes", async () => {
    const res = response(new Uint8Array(200), { headers: jsonHeaders({ "content-length": "10" }) });
    await expect(admitRuntimeResponse(res, { ...DATA, maxEntryBytes: 100 })).resolves.toBe(false);
  });

  it("treats a null body as 0 bytes and admits it", async () => {
    const res = response(null, { status: 200, headers: jsonHeaders() });
    await expect(admitRuntimeResponse(res, DATA)).resolves.toBe(true);
  });
});

describe("the original response stays readable", () => {
  it("after an admitted check", async () => {
    const res = response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
    await admitRuntimeResponse(res, DATA);
    await expect(res.text()).resolves.toBe(JSON.stringify({ ok: true }));
  });

  it("after a rejected check", async () => {
    const res = response(JSON.stringify({ ok: true }), { headers: jsonHeaders({ "cache-control": "no-store" }) });
    await admitRuntimeResponse(res, DATA);
    await expect(res.text()).resolves.toBe(JSON.stringify({ ok: true }));
  });
});
