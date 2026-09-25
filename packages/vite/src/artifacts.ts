// The pipeline's Vite-hook-independent entry.
//
// `pwa()` (index.ts) reads a finished Vite bundle through `generateBundle`, but that hook does not exist for an SSR
// framework whose final file list only exists after its own prerendering and static-asset assembly (T1 record:
// Nuxt's `nitro:build:public-assets`, well after the Vite client build has already run). `generateBundle` cannot be
// the boundary both callers share — the file list itself has to be, so this module takes one (already read off
// whatever host produced it) and does everything from there: compile a plan, generate a manifest, bundle both
// workers. `pwa()` calls this too, so there is exactly one implementation of "files in, plan and workers out".
import { verifyArtifacts } from "@pwa-platform/build-verifier";
import type { PwaPlan, PwaWarningDiagnostic } from "@pwa-platform/contracts";
import { compilePlan } from "@pwa-platform/core";
import { collectSourceFiles } from "./host-output.js";
import { createWebManifest, serializeWebManifest } from "./manifest.js";
import { validateOptions, type PwaViteOptions } from "./options.js";
import { bundleWorkers, RECOVERY_WORKER_FILE } from "./workers.js";

/** One file of the final build output, relative to `publicPath`, POSIX separators. */
export type PwaArtifactSourceFile = {
  readonly path: string;
  /**
   * The file's bytes. Mutually exclusive with `contentHash` — exactly one of the two must be present
   * (host-output.ts's `collectSourceFiles` throws otherwise): a caller that already has the hash (for example one
   * that streamed a large public-directory file through it rather than holding the whole thing in memory, 评审第
   * 3 项) has no reason to also carry the bytes here.
   */
  readonly content?: string | Uint8Array;
  /**
   * A precomputed sha256/base64url content hash, in the same form `collectSourceFiles` would compute from
   * `content` itself. Mutually exclusive with `content`.
   */
  readonly contentHash?: string;
  /**
   * Whether the file name carries a content fingerprint. Omitted: decided by the same rule `pwa()` applies to
   * bundle output (Vite's `-<8 characters>` hash suffix, host-output.ts).
   */
  readonly fingerprinted?: boolean;
};

export type PwaArtifactInput = PwaViteOptions & {
  /** Same-origin URL path the files are published under; starts and ends with "/". */
  readonly publicPath: string;
  readonly files: readonly PwaArtifactSourceFile[];
};

export type PwaArtifactOutputFile = { readonly path: string; readonly content: string };

export type PwaArtifactResult = {
  readonly plan: PwaPlan;
  /** The compiler's warning diagnostics for this build (e.g. compile.asset-rule-unmatched). */
  readonly warnings: readonly PwaWarningDiagnostic[];
  /**
   * Files the caller must write next to the output, paths relative to `publicPath`, in this order: the manifest
   * (only when the platform generates one), the platform worker, the recovery worker.
   */
  readonly files: readonly PwaArtifactOutputFile[];
};

/**
 * Compiles a plan from `input.files` and produces the manifest and both workers — everything `pwa()` writes to a
 * Vite bundle, built instead from a plain file list so a caller with no Vite hooks to run inside can produce it too.
 *
 * Pure apart from bundling the two workers, which runs a Vite sub-build (`workers.ts`); nothing here reads a file
 * system or a real bundle. The caller owns collecting `files` from whatever build actually happened.
 */
export async function buildPwaArtifacts(input: PwaArtifactInput): Promise<PwaArtifactResult> {
  const validated = validateOptions(input);

  const { publicPath, files } = input;
  // The same collection `pwa()` runs on a Vite bundle: base checks, duplicate paths, hashes and fingerprint flags.
  const hostBuildOutput = collectSourceFiles(files, publicPath, validated.identity);
  const { serviceWorkerFile, manifestFile } = hostBuildOutput;

  const compiled = compilePlan({ ...validated, hostBuildOutput });
  if (!compiled.ok) {
    const findings = compiled.diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`);
    throw new Error(`The pwa plugin cannot compile a plan from this build: ${findings.join(", ")}`);
  }
  const plan = compiled.value;

  const outputFiles: PwaArtifactOutputFile[] = [];

  const manifest = createWebManifest(plan);
  if (manifest === null) {
    // The plan offers no installation, so the platform has no metadata to write a manifest from. The identity
    // still names one and `compilePlan` still requires that name to resolve, so the caller has to bring its own.
    const published = files.some((file) => file.path === manifestFile);
    if (!published) {
      throw new Error(
        "This build enables no installation, so the pwa plugin writes no manifest — but the identity names one. " +
          "Add the manifest to the app's own build output, or enable install in the policy.",
      );
    }
  } else {
    outputFiles.push({ path: manifestFile, content: serializeWebManifest(manifest) });
  }

  // Both workers are bundled from sw-runtime's entry scripts and get their injections here, same as pwa()'s own
  // pipeline did before this module existed.
  const workers = await bundleWorkers(plan);
  outputFiles.push({ path: serviceWorkerFile, content: workers.platform });
  outputFiles.push({ path: RECOVERY_WORKER_FILE, content: workers.recovery });

  return { plan, warnings: compiled.diagnostics, files: outputFiles };
}

/**
 * Throws when `publishedPaths` (absolute URL paths) miss anything `plan` requires: a precache entry, the worker, or
 * the manifest. Message and wording match what `pwa()` has always thrown from `writeBundle` — this is that check,
 * generalised to take a plain path list instead of reading a live Vite bundle.
 */
export function assertPwaArtifacts(plan: PwaPlan, publishedPaths: readonly string[]): void {
  const result = verifyArtifacts(plan, publishedPaths);
  if (!result.ok) {
    const findings = result.diagnostics.map(({ code, path }) => `${code} at ${path}`);
    throw new Error(
      `The build does not contain everything the plan requires: ${findings.join(", ")}. ` +
        "The plan is compiled from this build, so a missing artifact means something removed it afterwards.",
    );
  }
}
