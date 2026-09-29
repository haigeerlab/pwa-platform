import { readFileSync } from "node:fs";
import type { PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyResponseHeaders } from "../src/headers.js";
import { verifyHtmlHeaders } from "../src/html-headers.js";

// DT5 (ai-onboarding): the onboarding skill's server requirements list must say exactly what this package enforces.
// The skill does not own these rules — it quotes them — so the list is checked against the real verifier, not against
// constants: for every combination of a fixed set of Cache-Control directives, the verifier's verdict must equal the
// verdict that the list's "必须含 / 不得含" columns predict. A rule that drifts in either direction turns this red.

const gate3 = decodeURIComponent(new URL("../../vite/skills/pwa-onboarding/references/gate-3-server.md", import.meta.url).pathname);

function readPlan(name: string): PwaPlan {
  const location = decodeURIComponent(new URL(`./fixtures/${name}.plan.json`, import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

const plan = readPlan("storefront");
const worker = plan.identity.serviceWorkerUrl;
const manifest = plan.identity.manifestUrl;
const fingerprinted = plan.precache.find(({ revision }) => revision === null)?.url;
const htmlPath = plan.identity.mountPath;

type Row = { readonly id: string; readonly include: readonly string[]; readonly exclude: readonly string[] };

/** Rows of the requirements table: `| S1 | resource | must include | must not include | consequence | check |`. */
function requirementRows(markdown: string): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const id = /^(S\d+(?:-[A-Z]+)?)$/.exec(cells[1] ?? "")?.[1];
    if (!id) continue;
    const tokens = (cell: string | undefined) => [...(cell ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
    rows.set(id, { id, include: tokens(cells[3]), exclude: tokens(cells[4]) });
  }
  return rows;
}

const UNIVERSE = ["no-cache", "no-store", "immutable", "public", "private", "must-revalidate", "max-age=31536000", "max-age=0"];

/** Every subset of UNIVERSE, except those carrying two different max-age values (ambiguous, and never real). */
function combinations(): string[][] {
  const all: string[][] = [];
  for (let mask = 0; mask < 1 << UNIVERSE.length; mask++) {
    const tokens = UNIVERSE.filter((_, index) => (mask & (1 << index)) !== 0);
    if (tokens.includes("max-age=31536000") && tokens.includes("max-age=0")) continue;
    all.push(tokens);
  }
  return all;
}

/** `max-age>0` in the list means "a positive max-age"; every other token is a plain directive. */
const present = (tokens: readonly string[], wanted: string): boolean =>
  wanted === "max-age>0" ? tokens.includes("max-age=31536000") : tokens.includes(wanted);
const predicted = (tokens: readonly string[], row: Row): boolean =>
  row.include.every((wanted) => present(tokens, wanted)) && row.exclude.every((forbidden) => !present(tokens, forbidden));

const NO_CACHE = { "cache-control": "no-cache" };
const IMMUTABLE = { "cache-control": "public, max-age=31536000, immutable" };

function compliantResponses(): Record<string, Record<string, string>> {
  const headers: Record<string, Record<string, string>> = { [worker]: { ...NO_CACHE }, [manifest]: { ...NO_CACHE } };
  for (const entry of plan.precache) if (entry.revision === null) headers[entry.url] = { ...IMMUTABLE };
  return headers;
}

function compliantHtml(): Record<string, Record<string, string>> {
  const headers: Record<string, Record<string, string>> = { [plan.identity.mountPath]: { ...NO_CACHE } };
  if (plan.install !== null) headers[plan.install.startUrl] = { ...NO_CACHE };
  if (plan.offlineFallback.enabled) headers[plan.offlineFallback.path] = { ...NO_CACHE };
  for (const entry of plan.precache) if (entry.revision !== null && entry.url.endsWith(".html")) headers[entry.url] = { ...NO_CACHE };
  return headers;
}

/** The verdict of the real verifier for one resource class carrying `cacheControl`, all else compliant. */
const verdicts: Record<string, (cacheControl: string) => boolean> = {
  S1: (cacheControl) => verifyResponseHeaders(plan, { ...compliantResponses(), [worker]: { "cache-control": cacheControl } }).ok,
  S2: (cacheControl) => verifyResponseHeaders(plan, { ...compliantResponses(), [manifest]: { "cache-control": cacheControl } }).ok,
  S3: (cacheControl) => verifyHtmlHeaders(plan, { ...compliantHtml(), [htmlPath]: { "cache-control": cacheControl } }).ok,
  S4: (cacheControl) =>
    verifyResponseHeaders(plan, { ...compliantResponses(), [fingerprinted as string]: { "cache-control": cacheControl } }).ok,
};

describe("DT5 server requirements list matches build-verifier", () => {
  const rows = () => requirementRows(readFileSync(gate3, "utf8"));

  it("has a fixture with a fingerprinted entry and a compliant baseline", () => {
    expect(fingerprinted).toBeDefined();
    expect(verifyResponseHeaders(plan, compliantResponses()).ok).toBe(true);
    expect(verifyHtmlHeaders(plan, compliantHtml()).ok).toBe(true);
  });

  it("lists S1-S9 and the stale-while-revalidate addition", () => {
    expect([...rows().keys()].sort()).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S9-SWR"]);
  });

  it("marks S1 (the worker script) as what decides whether updates reach users", () => {
    const line = readFileSync(gate3, "utf8").split(/\r?\n/).find((candidate) => /^\|\s*S1\s*\|/.test(candidate));
    expect(line).toContain("决定更新能否到达用户");
  });

  it.each(["S1", "S2", "S3", "S4"])("%s: the declared rule predicts the verifier's verdict for every combination", (id) => {
    const row = rows().get(id);
    expect(row, `${id} row`).toBeDefined();
    expect(row?.include.length, `${id} must declare what it requires`).toBeGreaterThan(0);
    expect(row?.exclude.length, `${id} must declare what it forbids`).toBeGreaterThan(0);
    const mismatches: string[] = [];
    for (const tokens of combinations()) {
      const header = tokens.join(", ");
      const actual = (verdicts[id] as (cacheControl: string) => boolean)(header);
      if (actual !== predicted(tokens, row as Row)) mismatches.push(`"${header}": verifier ${actual ? "accepts" : "rejects"}`);
    }
    expect(mismatches, `${id}: the list and the verifier disagree`).toEqual([]);
  });
});
