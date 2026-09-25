// Builds a `PwaVerifyReleaseInput` from the facts M5 collects (candidate plan, published paths, observed headers,
// a baseline lookup, and the slot's deployment history) without touching disk, network, the clock, or the
// environment — every fact arrives as a plain argument, so this stays testable on fixtures alone.
import { requiredChecksFor } from "./required-checks.ts";
import type {
  PwaObservedResponses,
  PwaVerificationCheckName,
  PwaVerifyReleaseInput,
} from "@pwa-platform/build-verifier";
import type { PwaPlan } from "@pwa-platform/contracts";

/**
 * The result of looking up the slot's stored identity baseline.
 *
 * Distinguishing "found" from "not found" (rather than using `undefined` for both) keeps a lookup that legitimately
 * returns `undefined`-shaped JSON from being confused with "no baseline file exists"; `assembleReleaseInput` maps
 * both cases onto `PwaVerifyReleaseInput.baseline`, which build-verifier itself distinguishes by property presence.
 */
export type PwaBaselineLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * One entry from the production deployment history export (module spec, "采集输入" / "组装与结论").
 *
 * `plan` is `null` when the deployment's plan could not be retrieved (summary missing, local bundle not found,
 * summary mismatch, or no plan in the bundle — the export step folds all of those into "this deployment lacks a
 * plan"); `missingReason` records which one, for the facts file.
 */
export type PwaReleaseHistoryEntry = {
  readonly deploymentId: string;
  readonly deployedAtMs: number;
  readonly plan: unknown | null;
  readonly missingReason?: string;
};

export type PwaMissingPlanEntry = { readonly deploymentId: string; readonly reason: string };

/**
 * One history entry that could not be placed strictly before the candidate at all — as opposed to `missingPlans`,
 * which is about an entry that *was* placed but carries no plan. A non-finite `deployedAtMs`, a duplicate
 * `deploymentId`, or a timestamp tied with (or later than) the candidate's are all reasons an entry cannot be
 * trusted to sort into `previous`, so none of them are allowed to just fall out of the comparison silently.
 */
export type PwaHistoryInconsistency = { readonly deploymentId: string; readonly reason: string };

/**
 * What assembling the history input concluded, kept alongside (not folded into) the assembled input itself.
 *
 * `candidateFound` and `candidateIsNewest` are broken out from `complete` so a caller (or a test) can tell "the
 * candidate isn't even in the history" apart from "the history is missing plans" without re-deriving either fact.
 * `candidateIsNewest` is strict: a non-candidate entry tied with the candidate's timestamp counts as not-newest,
 * the same as one that is later.
 */
export type PwaReleaseHistoryOutcome = {
  readonly complete: boolean;
  readonly candidateFound: boolean;
  readonly candidateIsNewest: boolean;
  readonly missingPlans: readonly PwaMissingPlanEntry[];
  readonly inconsistencies: readonly PwaHistoryInconsistency[];
};

export type PwaAssembleReleaseInputArgs = {
  readonly plan: PwaPlan;
  readonly publishedPaths: readonly string[];
  readonly observed: PwaObservedResponses;
  /** Observed response headers for the plan's public HTML paths, by path. Always present — same convention as `observed`. */
  readonly htmlObserved: PwaObservedResponses;
  readonly baseline: PwaBaselineLookup;
  readonly history: readonly PwaReleaseHistoryEntry[];
  readonly candidateDeploymentId: string;
  readonly asOfMs: number;
  readonly available: readonly string[];
};

export type PwaAssembleReleaseInputResult = {
  readonly input: PwaVerifyReleaseInput;
  readonly requiredChecks: readonly PwaVerificationCheckName[];
  readonly history: PwaReleaseHistoryOutcome;
};

/**
 * What assembling the *pre-deploy* history input concluded (module spec, "修订：上线前核验" → "上线前核验模式").
 *
 * Unlike `PwaReleaseHistoryOutcome`, there is no candidate to find or place: the candidate is a preview deployment
 * that never appears in the production history, so every entry in the history is a "previous" deployment by
 * definition. Only `complete`, `missingPlans` and `inconsistencies` apply; there is no `candidateFound` or
 * `candidateIsNewest` to report.
 */
export type PwaPreDeployHistoryOutcome = {
  readonly complete: boolean;
  readonly missingPlans: readonly PwaMissingPlanEntry[];
  readonly inconsistencies: readonly PwaHistoryInconsistency[];
};

export type PwaAssemblePreDeployInputArgs = {
  readonly plan: PwaPlan;
  readonly publishedPaths: readonly string[];
  readonly observed: PwaObservedResponses;
  /** Observed response headers for the plan's public HTML paths, by path. Always present — same convention as `observed`. */
  readonly htmlObserved: PwaObservedResponses;
  readonly baseline: PwaBaselineLookup;
  readonly history: readonly PwaReleaseHistoryEntry[];
  readonly asOfMs: number;
  readonly available: readonly string[];
};

export type PwaAssemblePreDeployInputResult = {
  readonly input: PwaVerifyReleaseInput;
  readonly requiredChecks: readonly PwaVerificationCheckName[];
  readonly history: PwaPreDeployHistoryOutcome;
};

/**
 * Assembles a `verifyRelease` input plus the `requiredChecks` for `args.plan`'s topology.
 *
 * `published`, `observed`, `htmlObserved` and `baseline` are always present in the returned input, as the module
 * spec requires: a caller that attempted a check always says so, even when the attempt found nothing (`baseline` is
 * then `undefined`, not omitted, which is exactly what makes `verifyRelease` report `verify.baseline-missing`
 * instead of silently skipping the comparison; an empty `htmlObserved` similarly still runs `html-headers`, which
 * then reports `verify.header-unreadable` for every public HTML path rather than skipping the check).
 *
 * `retention` is different: it is included only when the history is provably complete for this candidate — present
 * in `args.history`, the strictly newest entry there, every other entry unambiguously placed before it, and every
 * one of those older entries carrying a plan. Any other outcome must not produce a `retention` property at all, not
 * even one pointing at an empty or truncated `previous`, because a partial history would let `verifyReleaseRetention`
 * pass by construction rather than by evidence. When it is omitted, `history.complete` is `false`,
 * `history.missingPlans` names deployments that were placed but lack a plan, and `history.inconsistencies` names
 * entries (including possibly the candidate itself) that could not be placed at all — so the caller can render the
 * reason to a report even though the check itself never ran.
 */
export function assembleReleaseInput(args: PwaAssembleReleaseInputArgs): PwaAssembleReleaseInputResult {
  const requiredChecks = requiredChecksFor(args.plan);
  const { previous, outcome } = resolveHistory(args.history, args.candidateDeploymentId);

  const input: PwaVerifyReleaseInput = {
    plan: args.plan,
    published: args.publishedPaths,
    observed: args.observed,
    htmlObserved: args.htmlObserved,
    baseline: args.baseline.found ? args.baseline.value : undefined,
    ...(outcome.complete
      ? {
          retention: {
            asOfMs: args.asOfMs,
            previous: previous.map((entry) => ({ releasedAtMs: entry.deployedAtMs, plan: entry.plan })),
            available: args.available,
          },
        }
      : {}),
  };

  return { input, requiredChecks, history: outcome };
}

/**
 * Assembles a pre-deploy `verifyRelease` input plus the `requiredChecks` for `args.plan`'s topology (module spec,
 * "修订：上线前核验" → "上线前核验模式").
 *
 * The candidate here is a preview deployment (`candidate` branch) that is never itself an entry in the production
 * history, so — unlike `assembleReleaseInput` — there is no candidate to locate or to place as "newest": every
 * history entry is unconditionally a "previous" release. The history is still incomplete, and `retention` is still
 * omitted from the result, when any entry has a non-finite `deployedAtMs`, any `deploymentId` is duplicated, or any
 * entry lacks a plan — the same standard `assembleReleaseInput` applies, via the shared `resolveHistoryConsistency`
 * helper, so the two variants cannot silently diverge on what counts as an orderable history.
 *
 * A history entry's `deployedAtMs` being later than `asOfMs` is not treated as an inconsistency here: the module
 * spec's pre-deploy contract increment does not add a clock rule beyond what `assembleReleaseInput` already checks
 * (which has none either — `asOfMs` only flows into the assembled `retention.asOfMs` for `verifyReleaseRetention`
 * to apply its own window), so this layer does not invent one.
 */
export function assemblePreDeployInput(args: PwaAssemblePreDeployInputArgs): PwaAssemblePreDeployInputResult {
  const requiredChecks = requiredChecksFor(args.plan);
  const { previous, outcome } = resolvePreDeployHistory(args.history);

  const input: PwaVerifyReleaseInput = {
    plan: args.plan,
    published: args.publishedPaths,
    observed: args.observed,
    htmlObserved: args.htmlObserved,
    baseline: args.baseline.found ? args.baseline.value : undefined,
    ...(outcome.complete
      ? {
          retention: {
            asOfMs: args.asOfMs,
            previous: previous.map((entry) => ({ releasedAtMs: entry.deployedAtMs, plan: entry.plan })),
            available: args.available,
          },
        }
      : {}),
  };

  return { input, requiredChecks, history: outcome };
}

/**
 * The ordering/validation rules shared by both history variants (module spec, "上线前核验模式": "与现有
 * `assembleReleaseInput` 共用同一套……规则"): every entry's `deployedAtMs` must be finite, and no `deploymentId` may
 * repeat. Returns the inconsistencies found for either reason, plus the per-id counts the callers need to decide
 * whether the whole history is structurally orderable (`idCounts.size === history.length`).
 *
 * Deliberately does not decide "missing plan" — that check applies to `previous` (the entries actually kept), which
 * the two callers compute differently, and it does not decide the candidate/newest questions, which only the
 * post-deploy variant has.
 */
function resolveHistoryConsistency(
  history: readonly PwaReleaseHistoryEntry[],
): { readonly inconsistencies: PwaHistoryInconsistency[]; readonly idCounts: Map<string, number> } {
  const inconsistencies: PwaHistoryInconsistency[] = [];

  for (const entry of history) {
    if (!Number.isFinite(entry.deployedAtMs)) {
      inconsistencies.push({ deploymentId: entry.deploymentId, reason: "deployedAtMs is not a finite number" });
    }
  }

  const idCounts = new Map<string, number>();
  for (const entry of history) idCounts.set(entry.deploymentId, (idCounts.get(entry.deploymentId) ?? 0) + 1);
  for (const [deploymentId, count] of idCounts) {
    if (count > 1) inconsistencies.push({ deploymentId, reason: "deploymentId occurs more than once in the history" });
  }

  return { inconsistencies, idCounts };
}

/** Entries (already decided to belong in `previous`) that carry no plan, shared by both history variants. */
function missingPlansOf(entries: readonly PwaReleaseHistoryEntry[]): readonly PwaMissingPlanEntry[] {
  return entries
    .filter((entry) => entry.plan === null || entry.plan === undefined)
    .map((entry) => ({ deploymentId: entry.deploymentId, reason: entry.missingReason ?? "deployment lacks a saved plan" }));
}

/**
 * Orders `history` into `previous` (every entry but the candidate, newest first) or explains why it cannot be
 * ordered at all.
 *
 * The invariant this enforces: every entry other than the candidate ends up in `previous`, or the whole history is
 * incomplete — never a `previous` that silently drops an entry a `<`/`>` comparison could not decisively place. A
 * timestamp tied with the candidate's, a `NaN` timestamp (on the candidate or any other entry — every comparison
 * with `NaN` is `false`, which used to make such an entry look neither newer nor older and vanish), or a duplicated
 * `deploymentId` are all such entries; each is now a decisive rejection of the whole history rather than a value
 * that quietly falls out of `previous`.
 */
function resolveHistory(
  history: readonly PwaReleaseHistoryEntry[],
  candidateDeploymentId: string,
): { readonly previous: readonly PwaReleaseHistoryEntry[]; readonly outcome: PwaReleaseHistoryOutcome } {
  const { inconsistencies, idCounts } = resolveHistoryConsistency(history);

  const candidateMatches = history.filter((entry) => entry.deploymentId === candidateDeploymentId);
  const candidateFound = candidateMatches.length > 0;
  if (!candidateFound) {
    inconsistencies.push({
      deploymentId: candidateDeploymentId,
      reason: "candidate deployment is not present in the history",
    });
  }
  // A duplicated candidate id was already reported above (as a duplicate deploymentId); do not pick one of the
  // ambiguous matches and proceed as if the history were unambiguous.
  const candidate = candidateFound && candidateMatches.length === 1 ? candidateMatches[0] : undefined;
  const nonCandidateEntries = history.filter((entry) => entry.deploymentId !== candidateDeploymentId);

  let candidateIsNewest = false;
  if (candidate !== undefined && Number.isFinite(candidate.deployedAtMs)) {
    const notStrictlyOlder = nonCandidateEntries.filter(
      (entry) => !(Number.isFinite(entry.deployedAtMs) && entry.deployedAtMs < candidate.deployedAtMs),
    );
    for (const entry of notStrictlyOlder) {
      // An entry with its own non-finite timestamp was already reported above; a tie (or a later timestamp)
      // between two otherwise-finite entries is a distinct fact worth its own reason.
      if (Number.isFinite(entry.deployedAtMs)) {
        inconsistencies.push({ deploymentId: entry.deploymentId, reason: "deployedAtMs is not strictly older than the candidate" });
      }
    }
    candidateIsNewest = notStrictlyOlder.length === 0;
  }

  const structurallyOrderable =
    candidate !== undefined &&
    candidateIsNewest &&
    idCounts.size === history.length &&
    history.every((entry) => Number.isFinite(entry.deployedAtMs));

  const previous = structurallyOrderable
    ? [...nonCandidateEntries].sort((left, right) => right.deployedAtMs - left.deployedAtMs)
    : [];

  if (structurallyOrderable && previous.length !== history.length - 1) {
    // Unreachable given the checks above; kept as a guard so a future change to this function cannot silently
    // reintroduce an entry disappearing from `previous` instead of failing the whole history closed.
    throw new Error("release-verifier: assembled history does not account for every non-candidate deployment");
  }

  const missingPlans = missingPlansOf(previous);
  const complete = structurallyOrderable && missingPlans.length === 0;

  return {
    previous,
    outcome: { complete, candidateFound, candidateIsNewest, missingPlans, inconsistencies },
  };
}

/**
 * Orders a pre-deploy `history` into `previous` (every entry, newest first — there is no candidate to exclude) or
 * explains why it cannot be ordered at all. Reuses `resolveHistoryConsistency`, so a finite-timestamp or
 * duplicate-id violation is reported with exactly the same reason text as the post-deploy variant would use.
 *
 * An empty `history` is a deliberately conservative judgment call, not a spec-mandated rule: the module spec's
 * pre-deploy contract increment does not say whether zero production deployments means "a genuine first release"
 * or "the history export is missing data". Rather than silently pass a genuine-first-release interpretation into
 * `verifyReleaseRetention` (which would accept `previous: []` and pass), this treats an empty history as
 * incomplete and records the ambiguity as an inconsistency, so it surfaces in the report instead of being decided
 * implicitly. See P2's report to the project owner for this as an open question.
 */
function resolvePreDeployHistory(
  history: readonly PwaReleaseHistoryEntry[],
): { readonly previous: readonly PwaReleaseHistoryEntry[]; readonly outcome: PwaPreDeployHistoryOutcome } {
  if (history.length === 0) {
    return {
      previous: [],
      outcome: {
        complete: false,
        missingPlans: [],
        inconsistencies: [
          {
            deploymentId: "(none)",
            reason:
              "history is empty: cannot distinguish a genuine first release from a missing or incomplete history export",
          },
        ],
      },
    };
  }

  const { inconsistencies, idCounts } = resolveHistoryConsistency(history);

  const structurallyOrderable = idCounts.size === history.length && history.every((entry) => Number.isFinite(entry.deployedAtMs));

  const previous = structurallyOrderable ? [...history].sort((left, right) => right.deployedAtMs - left.deployedAtMs) : [];

  if (structurallyOrderable && previous.length !== history.length) {
    // Unreachable given the checks above; kept as a guard for the same reason resolveHistory's own guard is.
    throw new Error("release-verifier: assembled pre-deploy history does not account for every deployment");
  }

  const missingPlans = missingPlansOf(previous);
  const complete = structurallyOrderable && missingPlans.length === 0;

  return { previous, outcome: { complete, missingPlans, inconsistencies } };
}
