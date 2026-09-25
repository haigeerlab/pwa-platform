// Orchestrates M5's collect → assemble → decide → write pipeline (module spec, "采集输入" through "输出与入口"), and
// (module spec, "修订：上线前核验") its pre-deploy variant: observe a `candidate`-branch preview deployment instead
// of the registered production origin, gated by `_headers` policy and assembled against a history where every
// production deployment is "previous" (no candidate to place).
// The only test-only escape hatch is `originOverride`: every HTTP request this tool makes goes through the single
// `fetchOrigin` value computed here, and only a test may redirect that away from the observation origin the run
// would otherwise use (the CLI in cli.ts never sets it) — what a candidate is *validated against* (its build.json
// `origin`) always stays the real registry production origin, in both modes.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PwaPlan } from "@pwa-platform/contracts";
import {
  assemblePreDeployInput,
  assembleReleaseInput,
  type PwaAssemblePreDeployInputResult,
  type PwaAssembleReleaseInputResult,
  type PwaBaselineLookup,
  type PwaReleaseHistoryEntry,
} from "./assemble.ts";
import { checkAvailability, fingerprintedPaths, knownHashLookup } from "./availability.ts";
import { readCandidate } from "./candidate.ts";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./fetch-utils.ts";
import { checkHeadersFileRules } from "./headers-rules.ts";
import { validateHistoryFile, type PwaProductionHistoryDeployment } from "./history-file.ts";
import { verifyLiveBytes } from "./live-bytes.ts";
import { observeHeaders, observeHtmlHeaders } from "./observe.ts";
import { checkOutputDir } from "./out-dir.ts";
import { listWorktreeRoots, resolveOutDirForCheck } from "./out-dir-io.ts";
import { retrieveBundlePlan } from "./plan-retrieval.ts";
import { renderRecord } from "./record.ts";
import { runChecks } from "./run-checks.ts";
import { isCloudflareSlot, isCloudflareTarget, projectFor, registryOrigin } from "./targets.ts";
import { uniqueDeploymentOrigin } from "./unique-origin.ts";
import { decideVerdict } from "./verdict.ts";

export type PwaRunVerificationArgs = {
  readonly repoRoot: string;
  readonly target: string;
  readonly slot: string;
  readonly historyPath: string;
  readonly outDir: string;
  /** Defaults to `Date.now()`; overridable only so tests are deterministic. */
  readonly nowMs?: number;
  /** Test-only: redirects where this tool fetches from. The CLI never sets this. */
  readonly originOverride?: string;
  /** Test-only: shortens the per-request timeout so a test against a hanging server finishes quickly. */
  readonly requestTimeoutMs?: number;
  /**
   * The `candidate`-branch preview deployment ID to observe instead of production (module spec, "修订：上线前核验").
   * Undefined means post-deploy mode, unchanged from the previous revision. Only `--slot=main` may combine with
   * this — `drill` has its own identity and process, out of scope for pre-deploy verification.
   */
  readonly preDeployDeploymentId?: string;
};

export type PwaRunVerificationResult =
  | { readonly outcome: "refused"; readonly reason: string }
  | { readonly outcome: "completed"; readonly pass: boolean; readonly fileHashes: Readonly<Record<string, string>> };

export async function runVerification(args: PwaRunVerificationArgs): Promise<PwaRunVerificationResult> {
  if (!isCloudflareTarget(args.target)) return refuse("Unknown --target (must be react or vue)");
  if (!isCloudflareSlot(args.slot)) return refuse("Unknown --slot (must be main or drill)");
  const target = args.target;
  const slot = args.slot;

  // Pre-deploy mode: resolve and validate the observation origin up front, before anything else is read, so a
  // malformed deployment ID or a `--slot=drill` combination refuses cheaply (exit 2, no files) like the other
  // argument-shaped checks above.
  let preDeploy: { readonly deploymentId: string; readonly origin: string } | undefined;
  if (args.preDeployDeploymentId !== undefined) {
    if (slot !== "main") return refuse("--pre-deploy is only allowed with --slot=main");
    const originResult = uniqueDeploymentOrigin(projectFor(target), args.preDeployDeploymentId);
    if (!originResult.ok) return refuse(originResult.reason);
    preDeploy = { deploymentId: args.preDeployDeploymentId, origin: originResult.origin };
  }
  const mode: "pre-deploy" | "post-deploy" = preDeploy === undefined ? "post-deploy" : "pre-deploy";

  if (existsSync(args.outDir)) return refuse(`--out already exists: ${args.outDir}`);
  let checkedOutDir: string;
  try {
    checkedOutDir = resolveOutDirForCheck(args.outDir);
  } catch {
    return refuse(`--out's parent directory does not exist: ${args.outDir}`);
  }
  const outDirCheck = checkOutputDir(checkedOutDir, listWorktreeRoots(args.repoRoot));
  if (!outDirCheck.ok) return refuse(outDirCheck.reason);

  let historyRaw: unknown;
  try {
    historyRaw = JSON.parse(readFileSync(args.historyPath, "utf8"));
  } catch {
    return refuse(`History file not found or not valid JSON: ${args.historyPath}`);
  }
  const historyValidation = validateHistoryFile(historyRaw, { target, slot, project: projectFor(target) });
  if (!historyValidation.ok) return refuse(historyValidation.reason);
  const historyFile = historyValidation.value;

  // `origin` is always the registered production origin — a candidate's build.json is validated against it in
  // both modes (module spec: "候选 build.json 的 origin 仍须等于登记的生产 origin，只有观测地址不同"). Only
  // `fetchOrigin`, the address this run actually observes, changes in pre-deploy mode.
  const origin = registryOrigin(target, slot);
  const fetchOrigin = args.originOverride ?? preDeploy?.origin ?? origin;
  const requestTimeoutMs = args.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  const candidateResult = readCandidate({ repoRoot: args.repoRoot, target, slot, registryOrigin: origin });
  if (!candidateResult.ok) return refuse(candidateResult.reason);
  const candidate = candidateResult.value;

  // `_headers` gate (pre-deploy only, module spec "两个前提由工具强制"): the file observed must be the candidate's
  // own — verified by hash against build.json's own `files["_headers"]`, not merely present on disk — and it must
  // contain only path rules, never a by-host rule, or the preview's observed headers could not stand in for
  // production's.
  if (preDeploy !== undefined) {
    const headersPath = resolve(args.repoRoot, "build", "cloudflare", target, slot, "site", "_headers");
    let headersBuffer: Buffer;
    try {
      headersBuffer = readFileSync(headersPath);
    } catch {
      return refuse(`_headers file not found: ${headersPath}`);
    }
    const actualSha256 = createHash("sha256").update(headersBuffer).digest("hex");
    const expectedSha256 = candidate.files["_headers"];
    if (expectedSha256 === undefined || actualSha256 !== expectedSha256) {
      return refuse(`_headers on disk is not this candidate's: its SHA-256 does not match build.json's files["_headers"] (${headersPath})`);
    }
    const headersRuleCheck = checkHeadersFileRules(headersBuffer.toString("utf8"));
    if (!headersRuleCheck.ok) {
      return refuse(
        `_headers contains a by-host rule, forbidden for pre-deploy verification: ${headersRuleCheck.violations
          .map((violation) => `line ${violation.line} (${violation.reason})`)
          .join("; ")}`,
      );
    }
  }

  const liveBytes = await verifyLiveBytes(fetchOrigin, candidate.files, requestTimeoutMs);
  if (!liveBytes.ok) {
    return refuse(
      `Live site is not this candidate: ${liveBytes.mismatches.map((entry) => `${entry.path} (${entry.reason})`).join(", ")}`,
    );
  }

  const headerObservation = await observeHeaders(fetchOrigin, candidate.plan, requestTimeoutMs);
  const htmlHeaderObservation = await observeHtmlHeaders(fetchOrigin, candidate.plan, requestTimeoutMs);

  const historyRetrieval = historyFile.deployments.map((deployment) => ({
    deployment,
    bundle: retrieveBundlePlan({ repoRoot: args.repoRoot, target, slot, bundleSha256: deployment.bundleSha256 }),
  }));
  const historyEntries: PwaReleaseHistoryEntry[] = historyRetrieval.map(({ deployment, bundle }) => ({
    deploymentId: deployment.id,
    deployedAtMs: Date.parse(deployment.createdOn),
    plan: bundle.plan,
    ...(bundle.missingReason === undefined ? {} : { missingReason: bundle.missingReason }),
  }));

  const retrievedPlans: { deployment: PwaProductionHistoryDeployment; plan: PwaPlan; files: Readonly<Record<string, string>> }[] = [];
  for (const { deployment, bundle } of historyRetrieval) {
    if (bundle.plan !== null) retrievedPlans.push({ deployment, plan: bundle.plan, files: bundle.files });
  }
  retrievedPlans.sort((left, right) => Date.parse(right.deployment.createdOn) - Date.parse(left.deployment.createdOn));

  const fingerprinted = new Set<string>(fingerprintedPaths(candidate.plan));
  for (const entry of retrievedPlans) for (const path of fingerprintedPaths(entry.plan)) fingerprinted.add(path);
  const knownHash = knownHashLookup([candidate.files, ...retrievedPlans.map((entry) => entry.files)]);
  const availability = await checkAvailability(fetchOrigin, [...fingerprinted], knownHash, requestTimeoutMs);

  const baselinePath = resolve(
    args.repoRoot, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline", `${target}-${slot}.json`,
  );
  const baseline: PwaBaselineLookup = existsSync(baselinePath)
    ? { found: true, value: JSON.parse(readFileSync(baselinePath, "utf8")) }
    : { found: false };

  const asOfMs = args.nowMs ?? Date.now();
  // Pre-deploy: the candidate is a preview deployment that never appears in the production history, so every
  // history entry is unconditionally "previous" (assemblePreDeployInput). Post-deploy: unchanged, the candidate is
  // located in the history by `canonicalDeploymentId` (assembleReleaseInput).
  const assembled: PwaAssembleReleaseInputResult | PwaAssemblePreDeployInputResult =
    preDeploy === undefined
      ? assembleReleaseInput({
          plan: candidate.plan,
          publishedPaths: candidate.publishedPaths,
          observed: headerObservation.observed,
          htmlObserved: htmlHeaderObservation.observed,
          baseline,
          history: historyEntries,
          candidateDeploymentId: historyFile.canonicalDeploymentId,
          asOfMs,
          available: availability.available,
        })
      : assemblePreDeployInput({
          plan: candidate.plan,
          publishedPaths: candidate.publishedPaths,
          observed: headerObservation.observed,
          htmlObserved: htmlHeaderObservation.observed,
          baseline,
          history: historyEntries,
          asOfMs,
          available: availability.available,
        });
  const { input, requiredChecks, history } = assembled;
  const { report, coverage } = runChecks(input, requiredChecks);
  const verdict = decideVerdict(report, coverage, history);

  const toolCommit = gitOutput(args.repoRoot, ["rev-parse", "HEAD"]);
  const statusOutput = gitOutput(args.repoRoot, ["status", "--porcelain"]);

  // Recorded for facts only (module spec: "预览部署额外附加的 X-Robots-Tag: noindex 不参与判断，但如实记入事实文件",
  // and HC3's increment: "previewRobotsTag 同时记录 HTML 路径最终响应上的 X-Robots-Tag") — never fed into
  // `input`/`report`/`coverage`/`verdict` above, so it cannot affect the verification outcome.
  const previewRobotsTag: Record<string, string> = {};
  if (preDeploy !== undefined) {
    for (const [path, headers] of Object.entries(headerObservation.observed)) {
      const value = headers["x-robots-tag"];
      if (value !== undefined) previewRobotsTag[path] = value;
    }
    for (const [path, headers] of Object.entries(htmlHeaderObservation.observed)) {
      const value = headers["x-robots-tag"];
      if (value !== undefined) previewRobotsTag[path] = value;
    }
  }

  const facts = {
    target,
    slot,
    origin,
    mode,
    ...(preDeploy === undefined
      ? {}
      : { previewDeploymentId: preDeploy.deploymentId, observationOrigin: preDeploy.origin, headersFileRules: "ok" as const }),
    asOfMs,
    candidate: { buildJsonSha256: candidate.buildJsonSha256, plan: candidate.plan },
    history: {
      path: args.historyPath,
      sha256: createHash("sha256").update(readFileSync(args.historyPath)).digest("hex"),
      canonicalDeploymentId: historyFile.canonicalDeploymentId,
      deployments: historyRetrieval.map(({ deployment, bundle }) => ({
        id: deployment.id,
        createdOn: deployment.createdOn,
        bundleSha256: deployment.bundleSha256,
        bundlePath: bundle.bundlePath ?? null,
        planRetrieved: bundle.plan !== null,
        missingReason: bundle.missingReason ?? null,
      })),
      outcome: history,
    },
    observedHeaders: headerObservation.observed,
    headerObservationFailures: headerObservation.unresolved,
    htmlObservedHeaders: htmlHeaderObservation.observed,
    htmlHeaderObservations: htmlHeaderObservation.observations,
    availability: { fingerprintedPaths: [...fingerprinted], available: availability.available, details: availability.details },
    ...(preDeploy === undefined ? {} : { previewRobotsTag }),
    tool: { commit: toolCommit, worktreeClean: statusOutput === null ? null : statusOutput === "" },
  };

  mkdirSync(args.outDir, { recursive: true });
  const files: Readonly<Record<string, string>> = {
    "facts.json": `${JSON.stringify(facts, null, 2)}\n`,
    "report.json": `${JSON.stringify(report, null, 2)}\n`,
    // Module spec: "coverage.json（覆盖结果与必需集）" — without the required set, runs against different required sets
    // would write byte-identical files.
    "coverage.json": `${JSON.stringify({ requiredChecks, ...coverage }, null, 2)}\n`,
    "verdict.json": `${JSON.stringify(verdict, null, 2)}\n`,
    "record.md": renderRecord({
      target,
      slot,
      asOfMs,
      requiredChecks,
      report,
      verdict,
      ...(preDeploy === undefined ? {} : { preDeploy: { deploymentId: preDeploy.deploymentId, origin: preDeploy.origin } }),
    }),
  };
  const fileHashes: Record<string, string> = {};
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(resolve(args.outDir, name), contents);
    fileHashes[name] = createHash("sha256").update(contents).digest("hex");
  }

  return { outcome: "completed", pass: verdict.pass, fileHashes };
}

function refuse(reason: string): PwaRunVerificationResult {
  return { outcome: "refused", reason };
}

/** `null` when the command fails (e.g. no commits yet) rather than throwing: this is a best-effort fact, not a gate. */
function gitOutput(cwd: string, gitArgs: readonly string[]): string | null {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}
