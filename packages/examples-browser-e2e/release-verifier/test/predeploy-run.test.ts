// Integration coverage for runVerification's pre-deploy mode (module spec, "修订：上线前核验" → "测试策略增量 →
// 集成测试"). Mirrors run.test.ts's patterns (a local fixture server reached only through the test-only
// `originOverride`, repo-side inputs built by test/support.ts) but exercises `preDeployDeploymentId`: the
// observation origin is derived from a preview deployment ID via `uniqueDeploymentOrigin` rather than looked up in
// the target registry, the candidate is never located in the history (every entry is "previous"), and the
// candidate staging directory's `_headers` file is gated before anything is fetched.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerification } from "../run.ts";
import { registryOrigin } from "../targets.ts";
import { uniqueDeploymentOrigin } from "../unique-origin.ts";
import {
  buildPlan,
  factsWithoutServerDates,
  filesManifest,
  makeRepoRoot,
  makeTempDir,
  outDirExists,
  startSite,
  writeBaseline,
  writeCandidateBuildJson,
  writeHeadersFile,
  writeHistoryFile,
  writeRawReleaseBundle,
  writeReleaseBundle,
} from "./support.ts";
import type { PwaPlan } from "@pwa-platform/contracts";
import type { FixtureServer } from "@pwa-platform/browser-test-harness";

const TARGET = "react";
const SLOT = "main";
const PROJECT = "pwa-platform-react-demo";
const PRODUCTION_ORIGIN = registryOrigin(TARGET, SLOT);
const NOW_MS = 1_800_000_000_000;

const PREVIEW_DEPLOYMENT_ID = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const previewOriginResult = uniqueDeploymentOrigin(PROJECT, PREVIEW_DEPLOYMENT_ID);
if (!previewOriginResult.ok) throw new Error("test setup: PREVIEW_DEPLOYMENT_ID must be a valid canonical UUID");
const PREVIEW_ORIGIN = previewOriginResult.origin;

const SW_JS = "self.addEventListener('install', () => {});\n";
const MANIFEST = `${JSON.stringify({ id: "/app/" })}\n`;
const ASSET_JS = "console.log('current asset');\n";
const LOGO_SVG = "<svg>logo</svg>\n";
const OFFLINE_HTML = "<html>offline</html>\n";
// The plan's mount path (`/app`, no trailing slash) 301s to this directory index via the fixture server's own
// trailing-slash rule (mirroring Cloudflare Pages), and the plan's install `startUrl` (`/app/`) requests it directly
// — html-headers judges both, so both need a real 200 response.
const APP_INDEX_HTML = "<html>shell</html>\n";

const CANDIDATE_SITE_CONTENTS = {
  "app/sw.js": SW_JS,
  "app/manifest.webmanifest": MANIFEST,
  "app/assets/app.3f9a2c7d.js": ASSET_JS,
  "app/assets/logo.svg": LOGO_SVG,
  "app/offline.html": OFFLINE_HTML,
  "app/index.html": APP_INDEX_HTML,
};
const CANDIDATE_FILES = filesManifest(CANDIDATE_SITE_CONTENTS);

const PASSING_HEADER_RULES = [
  // Broad rule for the plan's public HTML paths (mount path, install startUrl, offline fallback — html-headers'
  // required set); more specific rules below override this for the worker, manifest and fingerprinted assets.
  { pathPrefix: "/app/", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/sw.js", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/manifest.webmanifest", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/assets/", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
];

/** Verbatim shape of `main`-slot output of scripts/build-cloudflare-site.mjs: path rules only, no by-host rule. */
const PASSING_HEADERS_TEXT = [
  "/app/", "  Cache-Control: no-cache",
  "/app/index.html", "  Cache-Control: no-cache",
  "/app/offline.html", "  Cache-Control: no-cache",
  "/app/offline", "  Cache-Control: no-cache",
  "/app/sw.js", "  Cache-Control: no-cache",
  "/app/pwa-recovery-worker.js", "  Cache-Control: no-cache",
  "/app/manifest.webmanifest", "  Cache-Control: no-cache",
  "/app/assets/*", "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");

/** A `_headers` file with a by-host rule on line 3 — forbidden for pre-deploy verification. */
const HOST_RULE_HEADERS_TEXT = [
  "/app/", "  Cache-Control: no-cache",
  ":project.pages.dev/*", "  X-Robots-Tag: noindex",
  "",
].join("\n");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** `canonicalDeploymentId` must be a non-empty string for `validateHistoryFile`, but pre-deploy never treats it as
 * the candidate (module spec: "候选尚未进入生产历史……历史文件中的全部成功生产部署都是之前的版本") — any production
 * deployment ID satisfies it. */
function historyFileFor(deployments: readonly { readonly id: string; readonly createdOn: string; readonly bundleSha256: string | null }[]): Record<string, unknown> {
  return {
    format: "pwa-cloudflare-production-history/v1",
    target: TARGET,
    slot: SLOT,
    project: PROJECT,
    exportedAt: iso(NOW_MS),
    canonicalDeploymentId: deployments[0]?.id ?? "prod-deploy-1",
    deployments,
  };
}

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function registerServer(server: FixtureServer): FixtureServer {
  cleanups.push(() => server.close());
  return server;
}

function freshOutDir(): string {
  return resolve(makeTempDir(), "out");
}

function freshHistoryPath(): string {
  return resolve(makeTempDir(), "history.json");
}

/** Writes the repo-side inputs (baseline, candidate build.json with a matching `_headers`) for a passing pre-deploy candidate. */
function setUpCandidateRepo(args: { readonly headersText?: string; readonly extraFiles?: Readonly<Record<string, string>> } = {}): {
  readonly repoRoot: string;
  readonly plan: PwaPlan;
} {
  const repoRoot = makeRepoRoot();
  const plan = buildPlan(PRODUCTION_ORIGIN);
  writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
  const headersSha256 = writeHeadersFile({ repoRoot, target: TARGET, slot: SLOT, text: args.headersText ?? PASSING_HEADERS_TEXT });
  const files = { ...CANDIDATE_FILES, ...filesManifest(args.extraFiles ?? {}), _headers: headersSha256 };
  writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: PRODUCTION_ORIGIN, plan, files });
  return { repoRoot, plan };
}

/** Two production history deployments, each with a retrievable bundle carrying `plan`, ordered oldest first. */
function writeTwoProductionDeployments(repoRoot: string, plan: PwaPlan): string {
  const bundleA = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan, files: CANDIDATE_FILES });
  const bundleB = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan, files: CANDIDATE_FILES });
  const historyPath = freshHistoryPath();
  writeHistoryFile(
    historyPath,
    historyFileFor([
      { id: "prod-deploy-1", createdOn: iso(NOW_MS - 200_000), bundleSha256: bundleA },
      { id: "prod-deploy-2", createdOn: iso(NOW_MS - 100_000), bundleSha256: bundleB },
    ]),
  );
  return historyPath;
}

describe("runVerification / pre-deploy: a complete pass", () => {
  it("passes every check, executes release-retention, and records the preview deployment in facts", async () => {
    const { repoRoot, plan } = setUpCandidateRepo();
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, PASSING_HEADER_RULES));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);

    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.checks.map((entry: { name: string }) => entry.name)).toContain("release-retention");

    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict).toMatchObject({ reportOk: true, coverageOk: true, historyComplete: true, pass: true });

    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.mode).toBe("pre-deploy");
    expect(facts.previewDeploymentId).toBe(PREVIEW_DEPLOYMENT_ID);
    expect(facts.observationOrigin).toBe(PREVIEW_ORIGIN);
    expect(facts.headersFileRules).toBe("ok");
    // The candidate identity is still validated against the registered PRODUCTION origin, never the preview one.
    expect(facts.origin).toBe(PRODUCTION_ORIGIN);
  });

  it("runs twice with identical results", async () => {
    const { repoRoot, plan } = setUpCandidateRepo();
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, PASSING_HEADER_RULES));

    const firstOut = freshOutDir();
    const secondOut = freshOutDir();
    const first = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir: firstOut, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });
    const second = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir: secondOut, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(first.outcome).toBe("completed");
    expect(second.outcome).toBe("completed");
    if (first.outcome !== "completed" || second.outcome !== "completed") return;
    // Same rule as the post-deploy determinism test: everything but the fixture server's per-response `Date`.
    const { "facts.json": firstFactsHash, ...firstOthers } = first.fileHashes;
    const { "facts.json": secondFactsHash, ...secondOthers } = second.fileHashes;
    expect(firstFactsHash).toBeDefined();
    expect(secondFactsHash).toBeDefined();
    expect(secondOthers).toEqual(firstOthers);
    expect(factsWithoutServerDates(secondOut)).toEqual(factsWithoutServerDates(firstOut));
  });
});

describe("runVerification / pre-deploy: a history deployment that lacks a plan", () => {
  it("does not execute release-retention, and fails, when one production deployment has no retrievable plan", async () => {
    const { repoRoot, plan } = setUpCandidateRepo();
    const goodBundle = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan, files: CANDIDATE_FILES });
    const badBundle = writeRawReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, receipt: { target: TARGET, slot: SLOT, files: {} } });
    const historyPath = freshHistoryPath();
    writeHistoryFile(
      historyPath,
      historyFileFor([
        { id: "prod-deploy-1", createdOn: iso(NOW_MS - 200_000), bundleSha256: goodBundle },
        { id: "prod-deploy-2", createdOn: iso(NOW_MS - 100_000), bundleSha256: badBundle },
      ]),
    );
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, PASSING_HEADER_RULES));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);

    const coverage = JSON.parse(readFileSync(resolve(outDir, "coverage.json"), "utf8"));
    expect(coverage.missing).toContain("release-retention");
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.checks.map((entry: { name: string }) => entry.name)).not.toContain("release-retention");
    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict.historyComplete).toBe(false);
    expect(verdict.missingPlanDeploymentIds).toEqual(["prod-deploy-2"]);
  });
});

describe("runVerification / pre-deploy: an empty production history", () => {
  it("judges the history incomplete (never a genuine-first-release pass) and fails", async () => {
    const { repoRoot } = setUpCandidateRepo();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([]));
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, PASSING_HEADER_RULES));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict.historyComplete).toBe(false);
    const coverage = JSON.parse(readFileSync(resolve(outDir, "coverage.json"), "utf8"));
    expect(coverage.missing).toContain("release-retention");
    expect(coverage.ok).toBe(false);
    expect(coverage.requiredChecks).toEqual(["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers"]);
  });
});

describe("runVerification / pre-deploy: preview bytes do not match the candidate", () => {
  it("refuses, and writes no report files", async () => {
    const { repoRoot, plan } = setUpCandidateRepo();
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const tamperedContents = { ...CANDIDATE_SITE_CONTENTS, "app/sw.js": "self.addEventListener('install', () => { /* different */ });\n" };
    const server = registerServer(await startSite(tamperedContents, PASSING_HEADER_RULES));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });
});

describe("runVerification / pre-deploy: the _headers gate", () => {
  it("refuses when the _headers file on disk does not match the candidate build receipt's hash", async () => {
    const repoRoot = makeRepoRoot();
    const plan = buildPlan(PRODUCTION_ORIGIN);
    writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
    // Written to disk, but the candidate build receipt claims a different (wrong) hash for it.
    writeHeadersFile({ repoRoot, target: TARGET, slot: SLOT, text: PASSING_HEADERS_TEXT });
    const files = { ...CANDIDATE_FILES, _headers: "0".repeat(64) };
    writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: PRODUCTION_ORIGIN, plan, files });
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: "http://127.0.0.1:1", preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });

  it("refuses, naming the offending line, when _headers contains a by-host rule (even with a matching hash)", async () => {
    const { repoRoot, plan } = setUpCandidateRepo({ headersText: HOST_RULE_HEADERS_TEXT });
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: "http://127.0.0.1:1", preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("refused");
    if (result.outcome !== "refused") return;
    expect(result.reason).toContain("line 3");
    expect(outDirExists(outDir)).toBe(false);
  });
});

describe("runVerification / pre-deploy: X-Robots-Tag: noindex on the preview", () => {
  it("does not affect the verdict, and is recorded in facts", async () => {
    const { repoRoot, plan } = setUpCandidateRepo();
    const historyPath = writeTwoProductionDeployments(repoRoot, plan);
    const robotsHeaderRules = [...PASSING_HEADER_RULES, { pathPrefix: "/", headers: { "X-Robots-Tag": "noindex" } }];
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, robotsHeaderRules));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: server.origin, preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);

    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    // The `/` rule matches every path, including the plan's public HTML paths (mount path, install startUrl,
    // offline fallback) that html-headers now also observes — HC3's increment to this fact.
    expect(facts.previewRobotsTag).toEqual({
      "/app/sw.js": "noindex",
      "/app/manifest.webmanifest": "noindex",
      "/app/assets/app.3f9a2c7d.js": "noindex",
      "/app": "noindex",
      "/app/": "noindex",
      "/app/offline.html": "noindex",
    });
  });
});

describe("runVerification / pre-deploy: argument-shaped refusals", () => {
  it("refuses --pre-deploy combined with --slot=drill", async () => {
    const repoRoot = makeRepoRoot();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([{ id: "prod-deploy-1", createdOn: iso(NOW_MS - 100_000), bundleSha256: null }]));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: "drill", historyPath, outDir, nowMs: NOW_MS,
      originOverride: "http://127.0.0.1:1", preDeployDeploymentId: PREVIEW_DEPLOYMENT_ID,
    });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });

  it.each([
    { name: "uppercase", id: PREVIEW_DEPLOYMENT_ID.toUpperCase() },
    { name: "short", id: "1a2b3c4d" },
  ])("refuses a malformed --pre-deploy deployment id ($name)", async ({ id }) => {
    const repoRoot = makeRepoRoot();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([{ id: "prod-deploy-1", createdOn: iso(NOW_MS - 100_000), bundleSha256: null }]));
    const outDir = freshOutDir();

    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS,
      originOverride: "http://127.0.0.1:1", preDeployDeploymentId: id,
    });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });
});

describe("runVerification / post-deploy is unaffected by pre-deploy support", () => {
  it("still runs in post-deploy mode when preDeployDeploymentId is not supplied", async () => {
    const { repoRoot } = setUpCandidateRepo();
    const historyPath = freshHistoryPath();
    // The sole history entry IS the candidate here (canonicalDeploymentId defaults to its id): post-deploy excludes
    // it from `previous`, so — unlike the pre-deploy tests above — no bundle needs to be retrievable for it.
    writeHistoryFile(
      historyPath,
      historyFileFor([{ id: "prod-deploy-1", createdOn: iso(NOW_MS - 1_000), bundleSha256: null }]),
    );
    const server = registerServer(await startSite(CANDIDATE_SITE_CONTENTS, PASSING_HEADER_RULES));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.mode).toBe("post-deploy");
    expect(Object.hasOwn(facts, "previewDeploymentId")).toBe(false);
    expect(Object.hasOwn(facts, "observationOrigin")).toBe(false);
    expect(Object.hasOwn(facts, "headersFileRules")).toBe(false);
    expect(Object.hasOwn(facts, "previewRobotsTag")).toBe(false);
  });
});
