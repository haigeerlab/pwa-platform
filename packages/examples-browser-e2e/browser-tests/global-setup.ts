import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import { BUILD_ROOT, EXAMPLES, buildOut, exampleRoot, type ExampleName } from "./sites.js";

/**
 * Builds every example into its three site versions.
 *
 * Each build reuses the example's own vite.config.ts rather than restating the configuration here: what the browser
 * registers has to be what a consumer's build would produce, not what this script assembled.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  for (const example of EXAMPLES) {
    await buildExample(example);
  }
}

async function buildExample(example: ExampleName): Promise<void> {
  await buildVersion(example, "v1");

  // v2 differs only in the version string. That changes the asset hash, so the injected precache manifest differs
  // and the browser sees a genuinely new worker. The source is restored afterwards: one application, not two.
  const versionFile = join(exampleRoot(example), "src/version.ts");
  const original = await readFile(versionFile, "utf8");
  if (!original.includes('APP_VERSION = "v1"')) {
    throw new Error(`${versionFile} no longer declares APP_VERSION = "v1"; the v2 build would be identical`);
  }
  try {
    await writeFile(versionFile, original.replace('APP_VERSION = "v1"', 'APP_VERSION = "v2"'), "utf8");
    await buildVersion(example, "v2");
  } finally {
    await writeFile(versionFile, original, "utf8");
  }

  // recovery: v1 with the recovery worker published at the service worker URL. vite-adapter writes it to a side
  // path on purpose and leaves the rename to the release process (ADR-0015); this is that rename, done at build time
  // so the fixture server can deploy it like any other version.
  const v1 = buildOut(example, "v1");
  const recovery = buildOut(example, "recovery");
  await cp(v1, recovery, { recursive: true });
  await cp(join(recovery, "pwa-recovery-worker.js"), join(recovery, "sw.js"));
}

async function buildVersion(example: ExampleName, version: "v1" | "v2"): Promise<void> {
  await build({
    configFile: join(exampleRoot(example), "vite.config.ts"),
    logLevel: "error",
    build: { outDir: buildOut(example, version), emptyOutDir: true },
  });
}
