// Orchestration and the page-side public API: spec/pwa-entry-resilience.md's "页面侧 API" and
// "存储" sections. `runEntryRecovery` never throws — every port failure becomes a diagnostic (or, for
// `saveStored`, a diagnostic that does not change the result) — and the result never carries an
// alternate-entry address: only a link to the platform recovery page, which repeats the whole
// selection and decision on its own (see src/resolve.ts, which this function is built on).
import { diagnostic } from "./diagnostics.js";
import type { EntryDiagnostic } from "./diagnostics.js";
import { normalizeReturnPath } from "./return-path.js";
import { resolveEntryRecovery } from "./resolve.js";
import type { EntryRuntimeConfig, EntryRuntimePorts } from "./resolve.js";

export type { EntryRuntimeConfig, EntryRuntimePorts } from "./resolve.js";

export type EntryRecoveryResult =
  | { readonly kind: "none"; readonly diagnostics: readonly EntryDiagnostic[] }
  | {
      readonly kind: "available";
      readonly status: "migrating" | "incident" | "unconfirmed-outage";
      readonly reason: { readonly code: string; readonly message: string | null };
      readonly expiresAt: string;
      readonly recoveryPageUrl: string;
      readonly diagnostics: readonly EntryDiagnostic[];
    };

/** Runs `fn`, returning `undefined` if it throws. */
function tryCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function buildRecoveryPageUrl(
  config: EntryRuntimeConfig,
  currentOrigin: string,
  returnPath: string | undefined,
  diagnostics: EntryDiagnostic[],
): string {
  if (returnPath === undefined) return config.recoveryPagePath;

  const normalized = normalizeReturnPath(returnPath, { origin: currentOrigin, scope: config.scope });
  if (normalized === null) {
    diagnostics.push(diagnostic("entry.return-path-dropped", ""));
    return config.recoveryPagePath;
  }
  return `${config.recoveryPagePath}?return=${encodeURIComponent(normalized)}`;
}

export async function runEntryRecovery(
  config: EntryRuntimeConfig,
  ports: EntryRuntimePorts,
  options: { readonly returnPath?: string } = {},
): Promise<EntryRecoveryResult> {
  const resolution = await resolveEntryRecovery(config, ports);
  const diagnostics = [...resolution.diagnostics];

  if (resolution.kind === "none") return { kind: "none", diagnostics };

  // `resolveEntryRecovery` already required `ports.currentOrigin()` to succeed once to get this far; it is called
  // again here only because building the recovery page's URL is this function's own concern, not
  // `EntryResolution`'s. A second failure (there is no reason to expect one from a port that just succeeded) still
  // fails closed on the return path rather than throwing: the recovery link is built without it.
  const currentOrigin = tryCall(() => ports.currentOrigin()) ?? "";
  const recoveryPageUrl = buildRecoveryPageUrl(config, currentOrigin, options.returnPath, diagnostics);

  return {
    kind: "available",
    status: resolution.status,
    reason: { code: resolution.manifest.reason.code, message: resolution.manifest.reason.message ?? null },
    expiresAt: resolution.manifest.expiresAt,
    recoveryPageUrl,
    diagnostics,
  };
}
