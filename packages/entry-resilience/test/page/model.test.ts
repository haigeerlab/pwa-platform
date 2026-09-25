import { describe, expect, it } from "vitest";
import { buildPageModel } from "../../src/page/model.js";
import type { EntryResolution } from "../../src/resolve.js";
import type { EntryManifest, EntryManifestStatus } from "../../src/types.js";

const AVAILABLE_STATUSES = ["migrating", "incident", "unconfirmed-outage"] as const;

function manifest(overrides: Partial<EntryManifest> = {}): EntryManifest {
  return {
    sequence: 7,
    expiresAt: "2026-10-01T08:00:00Z",
    status: "migrating" as EntryManifestStatus,
    reason: { code: "planned-migration", message: "域名将于 10 月 1 日停用" },
    entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
    ...overrides,
  };
}

function available(
  manifestOverrides: Partial<EntryManifest> = {},
  status: (typeof AVAILABLE_STATUSES)[number] = "migrating",
): EntryResolution {
  const built = manifest(manifestOverrides);
  return { kind: "available", status, manifest: built, entries: built.entries, diagnostics: [] };
}

const NONE: EntryResolution = { kind: "none", diagnostics: [] };

describe("buildPageModel", () => {
  it("maps a none resolution to a none model", () => {
    expect(buildPageModel(NONE, null)).toEqual({ kind: "none" });
  });

  it.each(AVAILABLE_STATUSES)("carries the %s status through", (status) => {
    const model = buildPageModel(available({}, status), null);
    expect(model.kind).toBe("entries");
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.status).toBe(status);
  });

  it("builds an href with no pwa-return query parameter when there is no return path", () => {
    const model = buildPageModel(available(), null);
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.entries).toEqual([{ host: "new.example.com", href: "https://new.example.com/app/" }]);
  });

  it("appends an encoded pwa-return query parameter when a return path is given", () => {
    const model = buildPageModel(available(), "/app/orders/42");
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.entries).toEqual([
      { host: "new.example.com", href: "https://new.example.com/app/?pwa-return=%2Fapp%2Forders%2F42" },
    ]);
  });

  it("encodes a return path containing &, # and ? without corrupting the query string", () => {
    const returnPath = "/app/a?x=1&y=2#frag";
    const model = buildPageModel(available(), returnPath);
    if (model.kind !== "entries") throw new Error("unreachable");
    const entry = model.entries[0];
    if (entry === undefined) throw new Error("unreachable");
    const url = new URL(entry.href);
    expect(url.origin).toBe("https://new.example.com");
    expect(url.pathname).toBe("/app/");
    expect(url.searchParams.get("pwa-return")).toBe(returnPath);
    // Exactly one query parameter: the & and ? inside returnPath must not have split into extra ones.
    expect([...url.searchParams.keys()]).toEqual(["pwa-return"]);
  });

  it("takes host from the resolved URL, including a non-default port", () => {
    const model = buildPageModel(
      available({ entries: [{ origin: "https://new.example.com:8443", startPath: "/app/" }] }),
      null,
    );
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.entries).toEqual([
      { host: "new.example.com:8443", href: "https://new.example.com:8443/app/" },
    ]);
  });

  it("drops an entry whose startPath is a protocol-relative URL escaping the declared origin", () => {
    // Bypasses verifyEnvelope on purpose: this manifest was never signed, it stands in for a startPath that
    // somehow reached this function without having been checked, to prove buildPageModel's own defense in depth.
    const model = buildPageModel(
      available({ entries: [{ origin: "https://new.example.com", startPath: "//evil.example/x" }] }),
      null,
    );
    expect(model).toEqual({ kind: "none" });
  });

  it("drops an entry whose startPath is an absolute URL to a different origin", () => {
    const model = buildPageModel(
      available({ entries: [{ origin: "https://new.example.com", startPath: "https://evil.example/" }] }),
      null,
    );
    expect(model).toEqual({ kind: "none" });
  });

  it("results in none when every entry is dropped", () => {
    const model = buildPageModel(
      available({
        entries: [
          { origin: "https://new.example.com", startPath: "//evil.example/x" },
          { origin: "https://alt.example.com", startPath: "https://evil.example/y" },
        ],
      }),
      null,
    );
    expect(model).toEqual({ kind: "none" });
  });

  it("keeps a valid entry alongside one that gets dropped", () => {
    const model = buildPageModel(
      available({
        entries: [
          { origin: "https://new.example.com", startPath: "//evil.example/x" },
          { origin: "https://alt.example.com", startPath: "/app/" },
        ],
      }),
      null,
    );
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.entries).toEqual([{ host: "alt.example.com", href: "https://alt.example.com/app/" }]);
  });

  it("uses resolution.entries, not the manifest's full entries list, when they diverge (only the probe-confirmed one)", () => {
    // Independent review finding (2026-09-17): decideRecovery now probes every entry and the page must show only
    // the reachable ones it reports, not fall back to the manifest's own full list.
    const full = [
      { origin: "https://new.example.com", startPath: "/app/" },
      { origin: "https://alt.example.com", startPath: "/app/" },
    ];
    const resolution: EntryResolution = {
      kind: "available",
      status: "unconfirmed-outage",
      manifest: manifest({ entries: full }),
      entries: [full[1] as { origin: string; startPath: string }],
      diagnostics: [],
    };
    const model = buildPageModel(resolution, null);
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.entries).toEqual([{ host: "alt.example.com", href: "https://alt.example.com/app/" }]);
  });

  it("formats expiresAt as 'YYYY-MM-DD HH:mm UTC' by slicing the string, not via Date", () => {
    const model = buildPageModel(available({ expiresAt: "2026-10-01T08:30:00Z" }), null);
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.expiresAt).toBe("2026-10-01 08:30 UTC");
  });

  it("maps a missing reason message to null", () => {
    const model = buildPageModel(available({ reason: { code: "incident" } }), null);
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.message).toBeNull();
  });

  it("passes a present reason message through unchanged", () => {
    const model = buildPageModel(available({ reason: { code: "incident", message: "网络故障排查中" } }), null);
    if (model.kind !== "entries") throw new Error("unreachable");
    expect(model.message).toBe("网络故障排查中");
  });
});
