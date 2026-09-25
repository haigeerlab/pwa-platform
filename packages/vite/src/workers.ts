// Bundles the platform's two service workers and injects what they read at runtime.
//
// The workers cannot ship as the plain ES modules sw-runtime publishes: a classic worker script resolves no bare
// imports and has no `process.env`, while Workbox uses both. So each entry gets its own Vite build, and the
// injection points survive that build to be replaced afterwards (ADR-0011, ADR-0012).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PwaPlan } from "@pwa-platform/contracts";
import { injectPrecacheManifest } from "@pwa-platform/engine-workbox";
import { createPlatformWorkerConfig, createRecoveryWorkerConfig, injectWorkerConfig } from "@pwa-platform/sw-runtime";
import { build } from "vite";

/**
 * Where the recovery worker is written.
 *
 * Deliberately not the identity's `serviceWorkerUrl`: that is the platform worker's address, and an ordinary
 * release would overwrite the recovery worker with it. The release process renames this file onto the worker URL
 * when a drill or an incident calls for it (recovery-drill.md, step 2).
 */
export const RECOVERY_WORKER_FILE = "pwa-recovery-worker.js";

export type PwaWorkerSources = {
  /** Bundled platform worker with the precache manifest and the runtime config already injected. */
  readonly platform: string;
  /** Bundled recovery worker with its config injected; carries no precache manifest and no Workbox. */
  readonly recovery: string;
};

/** Builds both workers for `plan`. */
export async function bundleWorkers(plan: PwaPlan): Promise<PwaWorkerSources> {
  const platform = await bundleEntry("@pwa-platform/sw-runtime/platform-worker-entry", "platform-worker");
  const recovery = await bundleEntry("@pwa-platform/sw-runtime/recovery-worker-entry", "recovery-worker");

  return {
    // Order follows ADR-0012: the precache manifest, then the runtime config. The two injection points are
    // distinct strings and do not interfere, so swapping them produces the same bytes — the order is a convention
    // that keeps builds comparable, not a constraint the code can enforce.
    platform: injectWorkerConfig(injectPrecacheManifest(platform, plan), createPlatformWorkerConfig(plan)),
    recovery: injectWorkerConfig(recovery, createRecoveryWorkerConfig(plan)),
  };
}

async function bundleEntry(specifier: string, name: string): Promise<string> {
  const entry = fileURLToPath(import.meta.resolve(specifier));
  // `dist/entries/<name>.js` sits three levels below sw-runtime's package root, which is what the sub-build runs
  // from — the same value sw-runtime's and engine-workbox's own browser fixtures pass.
  //
  // It makes no difference to the output: the entry's imports resolve from the entry's own location, so building
  // with this root, with the entry's directory, or with an unrelated temporary directory produces byte-identical
  // code (measured). Keeping it matches the existing fixtures rather than guarding anything, and a mutation that
  // changes it therefore survives — equivalent, not a hole in the tests.
  const root = dirname(dirname(dirname(entry)));

  const result = await build({
    configFile: false,
    root,
    envDir: false,
    publicDir: false,
    logLevel: "error",
    define: {
      // Workbox guards its development logging with process.env.NODE_ENV, which does not exist in a worker. The
      // value is fixed rather than inherited: two builds of one worker that differ by host mode would mean "works
      // locally, differs in production", and the worker is the last place to want that.
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      write: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      lib: { entry, formats: ["iife"], name: "pwaWorker", fileName: () => `${name}.js` },
    },
  });

  const source = firstChunk(result, name);
  assertSelfContained(source, name);
  return source;
}

/** `build()` returns one of three shapes depending on the config; only the single-output one is expected here. */
function firstChunk(result: Awaited<ReturnType<typeof build>>, name: string): string {
  const outputs = Array.isArray(result) ? result : [result];
  for (const candidate of outputs) {
    const chunks = (candidate as { output?: readonly { type: string; code?: string }[] }).output ?? [];
    for (const chunk of chunks) {
      if (chunk.type === "chunk" && typeof chunk.code === "string") return chunk.code;
    }
  }
  throw new Error(`Bundling the ${name} produced no code`);
}

/**
 * Fails on anything a classic worker script cannot execute.
 *
 * Checking here rather than in the browser is the point: a leftover bare import throws on registration, where the
 * only symptom is a worker that never installs. The same assertions guard sw-runtime's and engine-workbox's own
 * browser fixtures.
 *
 * Exported so the tests can exercise it directly. A test that re-implemented these patterns would pass whether or
 * not this function still threw — the guard has to be the thing under test, not a copy of it.
 */
export function assertSelfContained(source: string, name: string): void {
  const leftovers: readonly (readonly [RegExp, string])[] = [
    [/^\s*(?:import|export)\b/m, "a module import or export"],
    [/\bimport\s*\(/, "a dynamic import"],
    [/\brequire\s*\(/, "a require call"],
    [/\bprocess\.env\b/, "a process.env reference"],
  ];
  const found = leftovers.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
  if (found.length > 0) {
    throw new Error(`The bundled ${name} is not self-contained: ${found.join(", ")}`);
  }
}
