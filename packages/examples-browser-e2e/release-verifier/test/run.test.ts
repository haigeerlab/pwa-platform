// Integration coverage for runVerification's full collect -> assemble -> decide -> write pipeline (module spec,
// "测试策略增量 → 集成测试"). Every fetch here targets a local fixture server via the internal `originOverride`
// parameter — never a real Cloudflare host — and every "production" filesystem input (candidate build.json, local
// release bundles, the production history export) is built by test/support.ts rather than read from a real build.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerification } from "../run.ts";
import { registryOrigin } from "../targets.ts";
import {
  buildPlan,
  corruptBundleFile,
  factsWithoutServerDates,
  filesManifest,
  makeRepoRoot,
  makeTempDir,
  outDirExists,
  startScriptedServer,
  startSite,
  writeBaseline,
  writeCandidateBuildJson,
  writeHistoryFile,
  writeRawReleaseBundle,
  writeReleaseBundle,
  type ScriptedServer,
} from "./support.ts";
import type { PwaPlan } from "@pwa-platform/contracts";
import type { FixtureServer } from "@pwa-platform/browser-test-harness";

const TARGET = "react";
const SLOT = "main";
const PROJECT = "pwa-platform-react-demo";
const ORIGIN = registryOrigin(TARGET, SLOT);
const NOW_MS = 1_800_000_000_000;
const CANDIDATE_DEPLOYMENT_ID = "8589bf50-b6d2-493f-9551-ea4b7dd8adec";
const OLD_DEPLOYMENT_ID = "18824a5c-9103-41a5-953b-0efaedf4360a";

const SW_JS = "self.addEventListener('install', () => {});\n";
const MANIFEST = `${JSON.stringify({ id: "/app/" })}\n`;
const ASSET_JS = "console.log('current asset');\n";
const LOGO_SVG = "<svg>logo</svg>\n";
const OFFLINE_HTML = "<html>offline</html>\n";
const OLD_ASSET_JS = "console.log('old asset');\n";

const CANDIDATE_SITE_CONTENTS = {
  "app/sw.js": SW_JS,
  "app/manifest.webmanifest": MANIFEST,
  "app/assets/app.3f9a2c7d.js": ASSET_JS,
  "app/assets/logo.svg": LOGO_SVG,
  "app/offline.html": OFFLINE_HTML,
};
const CANDIDATE_FILES = filesManifest(CANDIDATE_SITE_CONTENTS);

// The plan's install `startUrl` ("/app/") is a directory index the fixture server serves from `app/index.html`, and
// its mount path ("/app", no trailing slash) 301s there via the fixture server's own trailing-slash rule (mirroring
// Cloudflare Pages) — html-headers judges both, so both need a real 200 response. Kept out of
// `CANDIDATE_SITE_CONTENTS`/`CANDIDATE_FILES`: Cloudflare Pages does not publish a synthetic `/app` index as a
// numbered build artifact the way it does the worker or the manifest, so it must stay out of the candidate's
// declared `files` (live bytes, artifacts) — only the real fixture-server tests below need the file to exist.
const APP_INDEX_HTML = "<html>shell</html>\n";
const SITE_CONTENTS_WITH_INDEX = { ...CANDIDATE_SITE_CONTENTS, "app/index.html": APP_INDEX_HTML };

const PASSING_HEADER_RULES = [
  // Broad rule for the plan's public HTML paths (mount path, install startUrl, offline fallback — html-headers'
  // required set); more specific rules below override this for the worker, manifest and fingerprinted assets.
  { pathPrefix: "/app/", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/sw.js", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/manifest.webmanifest", headers: { "Cache-Control": "no-cache" } },
  { pathPrefix: "/app/assets/", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function candidateHistoryEntry(): { readonly id: string; readonly createdOn: string; readonly bundleSha256: null } {
  return { id: CANDIDATE_DEPLOYMENT_ID, createdOn: iso(NOW_MS - 1_000), bundleSha256: null };
}

function historyFileFor(deployments: readonly unknown[]): Record<string, unknown> {
  return {
    format: "pwa-cloudflare-production-history/v1",
    target: TARGET,
    slot: SLOT,
    project: PROJECT,
    exportedAt: iso(NOW_MS),
    canonicalDeploymentId: CANDIDATE_DEPLOYMENT_ID,
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

function registerScriptedServer(server: ScriptedServer): ScriptedServer {
  cleanups.push(() => server.close());
  return server;
}

/** A repo root, plan, baseline and candidate build.json that together pass every check on their own. */
async function setUpPassingCandidate(headerRules = PASSING_HEADER_RULES): Promise<{ repoRoot: string; plan: PwaPlan; server: FixtureServer }> {
  const repoRoot = makeRepoRoot();
  const plan = buildPlan(ORIGIN);
  writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
  writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: ORIGIN, plan, files: CANDIDATE_FILES });
  const server = registerServer(await startSite(SITE_CONTENTS_WITH_INDEX, headerRules));
  return { repoRoot, plan, server };
}

/**
 * Writes just the repo-side files (baseline + candidate build.json) for a passing candidate, without starting any
 * server — the cross-origin/timeout tests below need precise control over routing (arbitrary redirects, a route
 * that never responds) that `startSite`'s real-file fixture server cannot express, so they build their own
 * `startScriptedServer` origin instead.
 */
function setUpCandidateFilesOnly(repoRoot: string, extraFiles: Readonly<Record<string, string>> = {}): PwaPlan {
  const plan = buildPlan(ORIGIN);
  writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
  writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: ORIGIN, plan, files: { ...CANDIDATE_FILES, ...filesManifest(extraFiles) } });
  return plan;
}

function freshOutDir(): string {
  return resolve(makeTempDir(), "out");
}

function freshHistoryPath(): string {
  return resolve(makeTempDir(), "history.json");
}

describe("runVerification / a complete pass", () => {
  it("passes every check when the candidate matches the live site and history is just the candidate", async () => {
    const { repoRoot, server } = await setUpPassingCandidate();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);
    expect(Object.keys(result.fileHashes).sort()).toEqual(["coverage.json", "facts.json", "record.md", "report.json", "verdict.json"]);

    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict).toMatchObject({ reportOk: true, coverageOk: true, historyComplete: true, pass: true });
    // The module spec's "coverage.json（覆盖结果与必需集）": the required set travels with the coverage result.
    const coverage = JSON.parse(readFileSync(resolve(outDir, "coverage.json"), "utf8"));
    expect(coverage).toEqual({
      requiredChecks: ["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers"],
      ok: true,
      missing: [],
    });
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.mode).toBe("post-deploy");
    expect(facts.target).toBe(TARGET);
    // Never write response bodies or tokens into the facts file.
    expect(JSON.stringify(facts)).not.toContain(ASSET_JS.trim());
  });

  it("runs twice with identical results (report, coverage, verdict, record byte-identical; facts identical apart from the server's Date)", async () => {
    const { repoRoot, server } = await setUpPassingCandidate();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));

    const firstOut = freshOutDir();
    const secondOut = freshOutDir();
    const first = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir: firstOut, nowMs: NOW_MS, originOverride: server.origin });
    const second = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir: secondOut, nowMs: NOW_MS, originOverride: server.origin });

    expect(first.outcome).toBe("completed");
    expect(second.outcome).toBe("completed");
    if (first.outcome !== "completed" || second.outcome !== "completed") return;
    // A whole-file hash of facts.json was flaky: it records the fixture server's per-response `Date`, which differs
    // when the two runs straddle a second boundary. Every other file, and the rest of facts.json, must match exactly.
    const { "facts.json": firstFactsHash, ...firstOthers } = first.fileHashes;
    const { "facts.json": secondFactsHash, ...secondOthers } = second.fileHashes;
    expect(firstFactsHash).toBeDefined();
    expect(secondFactsHash).toBeDefined();
    expect(secondOthers).toEqual(firstOthers);
    expect(factsWithoutServerDates(secondOut)).toEqual(factsWithoutServerDates(firstOut));
  });
});

describe("runVerification / response headers", () => {
  it("fails when the worker response is missing no-cache", async () => {
    const headerRules = [
      { pathPrefix: "/app/manifest.webmanifest", headers: { "Cache-Control": "no-cache" } },
      { pathPrefix: "/app/assets/", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
      // No rule for /app/sw.js: it gets no Cache-Control header at all.
    ];
    const { repoRoot, server } = await setUpPassingCandidate(headerRules);
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics.some((entry: { code: string }) => entry.code === "verify.header-missing-directive")).toBe(true);
  });
});

describe("runVerification / fingerprinted-asset retention", () => {
  async function setUpWithPreviousRelease(
    oldAssetContent: string | undefined,
  ): Promise<{ repoRoot: string; server: FixtureServer; historyPath: string }> {
    const repoRoot = makeRepoRoot();
    const plan = buildPlan(ORIGIN);
    writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
    writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: ORIGIN, plan, files: CANDIDATE_FILES });

    const previousPlan = buildPlan(ORIGIN, [{ url: "/app/assets/app.oldhash01.js", revision: null }]);
    const previousFiles = filesManifest({ "app/assets/app.oldhash01.js": OLD_ASSET_JS });
    const bundleSha256 = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan: previousPlan, files: previousFiles });

    const historyPath = freshHistoryPath();
    writeHistoryFile(
      historyPath,
      historyFileFor([candidateHistoryEntry(), { id: OLD_DEPLOYMENT_ID, createdOn: iso(NOW_MS - 100_000), bundleSha256 }]),
    );

    const siteContents = oldAssetContent === undefined
      ? SITE_CONTENTS_WITH_INDEX
      : { ...SITE_CONTENTS_WITH_INDEX, "app/assets/app.oldhash01.js": oldAssetContent };
    const server = registerServer(await startSite(siteContents, PASSING_HEADER_RULES));

    return { repoRoot, server, historyPath };
  }

  it("fails when a retained asset from a previous release 404s", async () => {
    const { repoRoot, server, historyPath } = await setUpWithPreviousRelease(undefined);
    const outDir = freshOutDir();
    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict.historyComplete).toBe(true);
    expect(verdict.reportOk).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics.some((entry: { code: string }) => entry.code === "verify.retention-missing")).toBe(true);
  });

  it("fails when a retained asset's content has been tampered with", async () => {
    const { repoRoot, server, historyPath } = await setUpWithPreviousRelease("console.log('tampered');\n");
    const outDir = freshOutDir();
    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics.some((entry: { code: string }) => entry.code === "verify.retention-missing")).toBe(true);
  });

  it("succeeds when the previous release's fingerprinted asset is still served correctly", async () => {
    const { repoRoot, server, historyPath } = await setUpWithPreviousRelease(OLD_ASSET_JS);
    const outDir = freshOutDir();
    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);
  });
});

describe("runVerification / a history deployment that lacks a plan", () => {
  it.each([
    {
      name: "old bundle without a plan",
      bundleSha256: (repoRoot: string) => writeRawReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, receipt: { target: TARGET, slot: SLOT, files: {} } }),
    },
    {
      name: "missing bundle",
      bundleSha256: () => "a".repeat(64),
    },
    {
      name: "bundle digest mismatch",
      bundleSha256: (repoRoot: string) => {
        const plan = buildPlan(ORIGIN);
        const digest = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan, files: {} });
        corruptBundleFile(resolve(repoRoot, "build", "cloudflare", "release-bundles", TARGET, SLOT, `${digest}.tar.gz`));
        return digest;
      },
    },
  ])("fails and names the deployment ID when the reason is: $name", async ({ bundleSha256 }) => {
    const { repoRoot, server } = await setUpPassingCandidate();
    const historyPath = freshHistoryPath();
    writeHistoryFile(
      historyPath,
      historyFileFor([candidateHistoryEntry(), { id: OLD_DEPLOYMENT_ID, createdOn: iso(NOW_MS - 100_000), bundleSha256: bundleSha256(repoRoot) }]),
    );
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict.historyComplete).toBe(false);
    expect(verdict.missingPlanDeploymentIds).toEqual([OLD_DEPLOYMENT_ID]);
    const coverage = JSON.parse(readFileSync(resolve(outDir, "coverage.json"), "utf8"));
    expect(coverage.missing).toContain("release-retention");
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.checks.map((entry: { name: string }) => entry.name)).not.toContain("release-retention");
  });
});

describe("runVerification / refusals", () => {
  it("refuses, and writes no report files, when the live site does not match the candidate", async () => {
    const repoRoot = makeRepoRoot();
    const plan = buildPlan(ORIGIN);
    writeBaseline({ repoRoot, target: TARGET, slot: SLOT, identity: plan.identity });
    writeCandidateBuildJson({ repoRoot, target: TARGET, slot: SLOT, origin: ORIGIN, plan, files: CANDIDATE_FILES });
    // The live worker differs from what build.json declares.
    const tamperedContents = { ...CANDIDATE_SITE_CONTENTS, "app/sw.js": "self.addEventListener('install', () => { /* different */ });\n" };
    const server = registerServer(await startSite(tamperedContents, PASSING_HEADER_RULES));
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: server.origin });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });

  it("refuses when --out already exists", async () => {
    const repoRoot = makeRepoRoot();
    const outDir = freshOutDir();
    mkdirSync(outDir, { recursive: true });
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: "http://127.0.0.1:1" });

    expect(result).toEqual({ outcome: "refused", reason: `--out already exists: ${outDir}` });
  });

  it("refuses when --out is inside the repo", async () => {
    const repoRoot = makeRepoRoot();
    // The parent (`repoRoot` itself) must already exist for the out-dir check to reach the forbidden-root judgment
    // rather than refusing earlier for a nonexistent parent.
    const outDir = resolve(repoRoot, "release-verifier-out");
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: "http://127.0.0.1:1" });

    expect(result.outcome).toBe("refused");
    if (result.outcome !== "refused") return;
    expect(result.reason).toContain("forbidden root");
  });

  it("refuses when the history file's target does not match --target", async () => {
    const repoRoot = makeRepoRoot();
    const outDir = freshOutDir();
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, { ...historyFileFor([candidateHistoryEntry()]), target: "vue" });

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: "http://127.0.0.1:1" });

    expect(result).toEqual({ outcome: "refused", reason: "History file target does not match --target" });
    expect(outDirExists(outDir)).toBe(false);
  });
});

// Reproduced by the main session against the pre-fix code: a worker path 302'd to a *different* local server that
// served the same bytes with `no-cache`, and observe.ts recorded that other host's headers as if they belonged to
// the requested site — letting the header check pass on another host's response. These tests use `startScriptedServer`
// (a raw node:http server) rather than `startSite`, because they need exact control `startSite`'s real-file fixture
// server cannot give: an arbitrary redirect `Location` (including a cross-origin one) and a route that never responds.
describe("runVerification / cross-origin redirects and request timeouts", () => {
  it("refuses when a required file redirects to a different origin, rather than resolving against that host's bytes", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const other = registerScriptedServer(
      await startScriptedServer({ "/app/sw.js": { status: 200, headers: { "cache-control": "no-cache" }, body: SW_JS } }),
    );
    const site = registerScriptedServer(
      await startScriptedServer({
        "/app/sw.js": { redirectTo: `${other.origin}/app/sw.js`, status: 302 },
        "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
        "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
        "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
        "/app/offline.html": { status: 200, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });

  it("leaves the worker unobserved (verify.header-unreadable) when it answers through a same-origin redirect, without refusing the whole run", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        "/app/sw.js": { redirectTo: "/app/sw-actual.js", status: 308 },
        "/app/sw-actual.js": { status: 200, headers: { "cache-control": "no-cache" }, body: SW_JS },
        "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
        "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
        "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
        "/app/offline.html": { status: 200, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    // Live bytes still pass: fetchFollowingRedirects follows this SAME-origin hop and finds matching bytes, so this
    // is not a refusal — the run completes and only the header check fails.
    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics.some((entry: { code: string }) => entry.code === "verify.header-unreadable")).toBe(true);
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.observedHeaders["/app/sw.js"]).toBeUndefined();
    expect(facts.headerObservationFailures["/app/sw.js"]).toEqual({ reason: "redirect", status: 308, location: "/app/sw-actual.js" });
  });

  it("marks a retained asset unavailable, and fails retention, when it redirects to a different origin", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const previousPlan = buildPlan(ORIGIN, [{ url: "/app/assets/app.oldhash01.js", revision: null }]);
    const previousFiles = filesManifest({ "app/assets/app.oldhash01.js": OLD_ASSET_JS });
    const bundleSha256 = writeReleaseBundle({ repoRoot, target: TARGET, slot: SLOT, plan: previousPlan, files: previousFiles });

    const other = registerScriptedServer(
      await startScriptedServer({ "/app/assets/app.oldhash01.js": { status: 200, body: OLD_ASSET_JS } }),
    );
    const site = registerScriptedServer(
      await startScriptedServer({
        "/app/sw.js": { status: 200, headers: { "cache-control": "no-cache" }, body: SW_JS },
        "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
        "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
        "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
        "/app/offline.html": { status: 200, body: OFFLINE_HTML },
        "/app/assets/app.oldhash01.js": { redirectTo: `${other.origin}/app/assets/app.oldhash01.js`, status: 302 },
      }),
    );

    const historyPath = freshHistoryPath();
    writeHistoryFile(
      historyPath,
      historyFileFor([candidateHistoryEntry(), { id: OLD_DEPLOYMENT_ID, createdOn: iso(NOW_MS - 100_000), bundleSha256 }]),
    );
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const verdict = JSON.parse(readFileSync(resolve(outDir, "verdict.json"), "utf8"));
    expect(verdict.historyComplete).toBe(true);
    expect(verdict.reportOk).toBe(false);
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.availability.details["/app/assets/app.oldhash01.js"]).toEqual({ ok: false, reason: "cross-origin redirect" });
  });

  it("finishes within a bounded time, refusing, when a required file never responds", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        "/app/sw.js": { hang: true },
        "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
        "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
        "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
        "/app/offline.html": { status: 200, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const started = Date.now();
    const result = await runVerification({
      repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin,
      // Internal-only, like originOverride: never a CLI flag. A short value here is what keeps this test fast; the
      // CLI itself always uses fetch-utils.ts's DEFAULT_REQUEST_TIMEOUT_MS.
      requestTimeoutMs: 200,
    });
    expect(Date.now() - started).toBeLessThan(5_000);

    expect(result.outcome).toBe("refused");
    expect(outDirExists(outDir)).toBe(false);
  });

  it("still passes live bytes when a file is served through a same-origin pretty-URL redirect", async () => {
    const repoRoot = makeRepoRoot();
    const indexHtml = "<html>shell</html>\n";
    setUpCandidateFilesOnly(repoRoot, { "app/index.html": indexHtml });
    const site = registerScriptedServer(
      await startScriptedServer({
        "/app/sw.js": { status: 200, headers: { "cache-control": "no-cache" }, body: SW_JS },
        "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
        "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
        "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
        "/app/offline.html": { status: 200, headers: { "cache-control": "no-cache" }, body: OFFLINE_HTML },
        // Cloudflare Pages turns a request for the file `/app/index.html` into a redirect to the pretty `/app/`.
        "/app/index.html": { redirectTo: "/app/", status: 301 },
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: indexHtml },
        // The plan's mount path (`/app`, no trailing slash) canonicalizes to the trailing-slash form the same way.
        "/app": { redirectTo: "/app/", status: 301 },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);
  });
});

// New integration coverage for HC3: observeHtmlHeaders collects the plan's public HTML paths (mount path, install
// startUrl, offline fallback) through fetchFollowingRedirects — same-origin, same-scheme redirects only — unlike
// observeHeaders' own never-follow behavior for the worker/manifest/fingerprinted-asset paths. These tests use
// startScriptedServer (like the cross-origin-redirect suite above) for exact per-path control over status, headers
// and redirect Location.
describe("runVerification / html-headers", () => {
  /** The worker, manifest and fingerprinted-asset routes every test below needs, so each test only has to vary the
   * public HTML routes it is actually exercising. */
  const NON_HTML_ROUTES = {
    "/app/sw.js": { status: 200, headers: { "cache-control": "no-cache" }, body: SW_JS },
    "/app/manifest.webmanifest": { status: 200, headers: { "cache-control": "no-cache" }, body: MANIFEST },
    "/app/assets/app.3f9a2c7d.js": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: ASSET_JS },
    "/app/assets/logo.svg": { status: 200, body: LOGO_SVG },
  } as const;

  it("passes, and records the redirect chain in facts, when a public HTML path is reached through a same-origin 308", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        ...NON_HTML_ROUTES,
        "/app": { redirectTo: "/app/", status: 301 },
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: APP_INDEX_HTML },
        // Cloudflare Pages drops a public HTML file's extension: /app/offline.html -> /app/offline (module spec's
        // 2026-09-22 observation of the drill site).
        "/app/offline.html": { redirectTo: "/app/offline", status: 308 },
        "/app/offline": { status: 200, headers: { "cache-control": "no-cache" }, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(true);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.checks.find((entry: { name: string }) => entry.name === "html-headers")).toMatchObject({ ok: true, diagnostics: [] });
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.htmlHeaderObservations["/app/offline.html"]).toEqual({
      finalUrl: `${site.origin}/app/offline`,
      redirectChain: [{ from: `${site.origin}/app/offline.html`, status: 308, location: `${site.origin}/app/offline` }],
    });
    expect(facts.htmlObservedHeaders["/app/offline.html"]).toMatchObject({ "cache-control": "no-cache" });
  });

  it("fails html-headers with verify.header-missing-directive when the final response lacks no-cache", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        ...NON_HTML_ROUTES,
        "/app": { redirectTo: "/app/", status: 301 },
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: APP_INDEX_HTML },
        // No cache-control at all on the final response.
        "/app/offline.html": { status: 200, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "verify.header-missing-directive", path: "/offlineFallback/path" }),
    );
  });

  it("fails html-headers with verify.header-forbidden-directive when the final response is immutable", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        ...NON_HTML_ROUTES,
        "/app": { redirectTo: "/app/", status: 301 },
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: APP_INDEX_HTML },
        "/app/offline.html": { status: 200, headers: { "cache-control": "public, max-age=31536000, immutable" }, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "verify.header-forbidden-directive", path: "/offlineFallback/path" }),
    );
  });

  it("leaves a public HTML path unresolved (verify.header-unreadable), without refusing, when it redirects cross-origin", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        ...NON_HTML_ROUTES,
        // The mount path itself redirects off-origin; it is not part of the candidate's declared `files`, so this
        // cannot fail the live-bytes gate the way a cross-origin worker redirect does (run.test.ts's cross-origin
        // describe block above) — only html-headers observation is affected.
        "/app": { redirectTo: "https://example.invalid/app/", status: 302 },
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: APP_INDEX_HTML },
        "/app/offline.html": { status: 200, headers: { "cache-control": "no-cache" }, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "verify.header-unreadable", path: "/identity/mountPath" }),
    );
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.htmlObservedHeaders["/app"]).toBeUndefined();
    expect(facts.htmlHeaderObservations["/app"]).toEqual({
      reason: "cross-origin redirect",
      status: 302,
      location: "https://example.invalid/app/",
    });
  });

  it("leaves a public HTML path unresolved (verify.header-unreadable), without refusing, on a 404", async () => {
    const repoRoot = makeRepoRoot();
    setUpCandidateFilesOnly(repoRoot);
    const site = registerScriptedServer(
      await startScriptedServer({
        ...NON_HTML_ROUTES,
        // No route for "/app" (the mount path): the scripted server 404s it. Unlike offline.html, the mount path
        // is not itself an entry in the candidate's declared `files`, so this cannot trip the live-bytes gate —
        // only html-headers observation is affected.
        "/app/": { status: 200, headers: { "cache-control": "no-cache" }, body: APP_INDEX_HTML },
        "/app/offline.html": { status: 200, headers: { "cache-control": "no-cache" }, body: OFFLINE_HTML },
      }),
    );
    const historyPath = freshHistoryPath();
    writeHistoryFile(historyPath, historyFileFor([candidateHistoryEntry()]));
    const outDir = freshOutDir();

    const result = await runVerification({ repoRoot, target: TARGET, slot: SLOT, historyPath, outDir, nowMs: NOW_MS, originOverride: site.origin });

    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") return;
    expect(result.pass).toBe(false);
    const report = JSON.parse(readFileSync(resolve(outDir, "report.json"), "utf8"));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "verify.header-unreadable", path: "/identity/mountPath" }),
    );
    const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8"));
    expect(facts.htmlHeaderObservations["/app"]).toEqual({ reason: "HTTP 404", status: 404 });
  });
});
