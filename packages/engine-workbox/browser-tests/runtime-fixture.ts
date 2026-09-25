import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const PACKAGE_ROOT = here("../");
const WORKER_ENTRY = here("./worker/runtime-worker.ts");
const OUT_DIR = here("../browser-build/runtime-bundle/");
const BUNDLE_FILE = "runtime-worker.js";

let cached: Promise<string> | undefined;

/** Bundles the test worker (once per Playwright worker process) into one classic, self-contained script. */
export function bundledRuntimeWorker(): Promise<string> {
  cached ??= (async () => {
    await build({
      configFile: false,
      root: PACKAGE_ROOT,
      envDir: false,
      publicDir: false,
      logLevel: "warn",
      define: {
        // Workbox guards its development logging with process.env.NODE_ENV, which does not exist in a worker.
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      build: {
        outDir: OUT_DIR,
        emptyOutDir: true,
        copyPublicDir: false,
        // Unminified for readable failures; there is no manifest injection step to run after bundling here.
        minify: false,
        sourcemap: false,
        lib: { entry: WORKER_ENTRY, formats: ["iife"], name: "pwaRuntimeWorker", fileName: () => BUNDLE_FILE },
      },
    });
    return readFile(join(OUT_DIR, BUNDLE_FILE), "utf8");
  })();
  return cached;
}
