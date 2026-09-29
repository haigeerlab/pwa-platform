import ts from "typescript";
import { describe, expect, it } from "vitest";
import { admitRuntimeResponse, type PwaRuntimeAdmitOptions } from "../../src/worker/admit.js";

// DT5 (ai-onboarding), runtime cache half: rows S9 and S9-SWR of the skill's server requirements list must say
// exactly what response admission enforces. Same method as build-verifier's skill-requirements test: the list's
// declared tokens predict the verdict of the real function for every combination of a fixed set of directives.

const gate3 = decodeURIComponent(new URL("../../../vite/skills/pwa-onboarding/references/gate-3-server.md", import.meta.url).pathname);

/** This package type-checks its tests without Node types, so the file is read through TypeScript's own host (as build-verifier's tests do). */
function readGate3(): string {
  const text = ts.sys.readFile(gate3);
  if (text === undefined) throw new Error(`Cannot read ${gate3}`);
  return text;
}

type Row = { readonly id: string; readonly include: string; readonly exclude: readonly string[] };

function requirementRows(markdown: string): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const id = /^(S9(?:-SWR)?)$/.exec(cells[1] ?? "")?.[1];
    if (!id) continue;
    const exclude = [...(cells[4] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
    rows.set(id, { id, include: cells[3] ?? "", exclude });
  }
  return rows;
}

function response(headers: Record<string, string>, extra: { status?: number; redirected?: boolean } = {}): Response {
  const res = new Response("{}", { status: extra.status ?? 200, headers });
  Object.defineProperty(res, "type", { value: "basic", configurable: true });
  Object.defineProperty(res, "redirected", { value: extra.redirected ?? false, configurable: true });
  return res;
}

const DATA: PwaRuntimeAdmitOptions = { resourceClass: "public-data", strategy: "network-first", maxEntryBytes: 1024 };
const DATA_SWR: PwaRuntimeAdmitOptions = { ...DATA, strategy: "stale-while-revalidate" };
const PAGE: PwaRuntimeAdmitOptions = { resourceClass: "navigation-public-dynamic", strategy: "network-first", maxEntryBytes: 1024 };

const UNIVERSE = ["private", "no-store", "no-cache", "must-revalidate", "max-age=0", "s-maxage=0", "public", "max-age=60"];

function combinations(): string[][] {
  const all: string[][] = [];
  for (let mask = 0; mask < 1 << UNIVERSE.length; mask++) {
    const tokens = UNIVERSE.filter((_, index) => (mask & (1 << index)) !== 0);
    if (tokens.includes("max-age=0") && tokens.includes("max-age=60")) continue;
    all.push(tokens);
  }
  return all;
}

describe("DT5 runtime cache requirements match response admission", () => {
  const rows = () => requirementRows(readGate3());

  it("has both rows", () => {
    expect([...rows().keys()].sort()).toEqual(["S9", "S9-SWR"]);
  });

  it("S9: Cache-Control combinations are admitted exactly when none of the forbidden directives is present", async () => {
    const forbidden = rows().get("S9")?.exclude ?? [];
    expect(forbidden.length).toBeGreaterThan(0);
    const mismatches: string[] = [];
    for (const tokens of combinations()) {
      const admitted = await admitRuntimeResponse(response({ "content-type": "application/json", "cache-control": tokens.join(", ") }), DATA);
      const expected = forbidden.every((token) => !tokens.includes(token));
      if (admitted !== expected) mismatches.push(`"${tokens.join(", ")}": admission ${admitted ? "admits" : "rejects"}`);
    }
    expect(mismatches, "S9 and response admission disagree").toEqual([]);
  });

  it("S9-SWR: with stale-while-revalidate the extra forbidden directives apply on top of S9", async () => {
    const base = rows().get("S9")?.exclude ?? [];
    const extra = rows().get("S9-SWR")?.exclude ?? [];
    expect(extra.length).toBeGreaterThan(0);
    const forbidden = [...base, ...extra];
    const mismatches: string[] = [];
    for (const tokens of combinations()) {
      const admitted = await admitRuntimeResponse(response({ "content-type": "application/json", "cache-control": tokens.join(", ") }), DATA_SWR);
      const expected = forbidden.every((token) => !tokens.includes(token));
      if (admitted !== expected) mismatches.push(`"${tokens.join(", ")}": admission ${admitted ? "admits" : "rejects"}`);
    }
    expect(mismatches, "S9-SWR and response admission disagree").toEqual([]);
  });

  it("S9: Vary is admitted exactly for the tokens the list allows", async () => {
    const row = rows().get("S9")?.include ?? "";
    const allowedText = /只含((?:\s*`[^`]+`[、,，]?)+)/.exec(row)?.[1] ?? "";
    const allowed = [...allowedText.matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? "").toLowerCase());
    expect(allowed.sort()).toEqual(["accept", "accept-encoding"]);
    for (const token of ["Accept", "Accept-Encoding", "Cookie", "Origin", "Accept-Language", "Authorization", "User-Agent", "*"]) {
      const admitted = await admitRuntimeResponse(response({ "content-type": "application/json", vary: token }), DATA);
      expect(admitted, `Vary: ${token}`).toBe(allowed.includes(token.toLowerCase()));
    }
    expect(await admitRuntimeResponse(response({ "content-type": "application/json" }), DATA), "no Vary at all").toBe(true);
  });

  it("S9: names the media types, the 200 status and the no-redirect rule that admission enforces", async () => {
    const row = rows().get("S9")?.include ?? "";
    for (const word of ["200", "application/json", "text/html", "重定向"]) expect(row, word).toContain(word);
    expect(await admitRuntimeResponse(response({ "content-type": "application/json" }), DATA)).toBe(true);
    expect(await admitRuntimeResponse(response({ "content-type": "text/plain" }), DATA)).toBe(false);
    expect(await admitRuntimeResponse(response({ "content-type": "text/html" }), PAGE)).toBe(true);
    expect(await admitRuntimeResponse(response({ "content-type": "application/json" }), PAGE)).toBe(false);
    expect(await admitRuntimeResponse(response({ "content-type": "application/json" }, { status: 301 }), DATA)).toBe(false);
    expect(await admitRuntimeResponse(response({ "content-type": "application/json" }, { redirected: true }), DATA)).toBe(false);
  });
});
