// Builds every real production output the specs need, once, into the git-ignored browser-build/: two reload
// variants ("manual", the module's own default, and "automatic", an app that explicitly overrides it back to
// Nuxt's own default) x two content versions each ("v1", "v2"), plus one "recovery" build (v1 content,
// `recoveryRelease: true` — T7b, spec decision 19) recovery.spec.ts deploys like any other version. Slow on
// purpose — five full Nuxt production builds — but nothing here is faked: every spec serves and asserts on files a
// real build produced.
//
// Each (variant, version) is built from its own full copy of site/, not the shared directory with a
// `nitro.output.dir`/`buildDir` override: measured that sharing site/'s own default `.nuxt` build directory across
// builds made "v2" byte-identical to "v1" even after rewriting version.ts first (a shared build cache reused v1's
// already-compiled output); moving just `buildDir` out from under the shared directory then broke Nitro's own
// prerender-time dynamic imports (their chunk paths assume a specific relationship between buildDir and rootDir).
// A full copy per build — the same approach test/nuxt-harness.ts already uses for this package's unit tests — sidesteps
// both problems by construction.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNuxt, loadNuxt } from "nuxt/kit";

const SITE_ROOT = fileURLToPath(new URL("./site/", import.meta.url));
const BUILD_ROOT = fileURLToPath(new URL("../browser-build/", import.meta.url));

export type BuildVariant = "manual" | "automatic" | "recovery";
export type SiteVersion = "v1" | "v2";

function copyRoot(variant: BuildVariant, version: SiteVersion): string {
  return join(BUILD_ROOT, `.build-${variant}-${version}`);
}

export function serverEntry(variant: BuildVariant, version: SiteVersion): string {
  return join(copyRoot(variant, version), ".output", "server", "index.mjs");
}

export function publicDir(variant: BuildVariant, version: SiteVersion): string {
  return join(copyRoot(variant, version), ".output", "public");
}

export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });
  await mkdir(BUILD_ROOT, { recursive: true });
  for (const variant of ["manual", "automatic"] as const) {
    for (const version of ["v1", "v2"] as const) {
      await buildVersion(variant, version);
    }
  }
  // Only ever deployed as its own single version (recovery.spec.ts starts it directly, no v1-to-v2 transition).
  await buildVersion("recovery", "v1");
}

function envFor(variant: BuildVariant): Readonly<Record<string, string>> {
  if (variant === "automatic") return { NUXT_E2E_AUTO_RELOAD: "1" };
  if (variant === "recovery") return { NUXT_E2E_RECOVERY_RELEASE: "1" };
  return {};
}

async function buildVersion(variant: BuildVariant, version: SiteVersion): Promise<void> {
  const dir = copyRoot(variant, version);
  await cp(SITE_ROOT, dir, { recursive: true });

  if (version === "v2") {
    const versionFile = join(dir, "app", "version.ts");
    const original = await readFile(versionFile, "utf8");
    if (!original.includes('APP_VERSION = "v1"')) {
      throw new Error(`${versionFile} no longer declares APP_VERSION = "v1"; the v2 build would be identical`);
    }
    await writeFile(versionFile, original.replace('APP_VERSION = "v1"', 'APP_VERSION = "v2"'), "utf8");
  }

  const env = envFor(variant);
  const original = { ...process.env };
  Object.assign(process.env, env);
  try {
    const nuxt = await loadNuxt({ cwd: dir, dotenv: false, dev: false });
    try {
      await buildNuxt(nuxt);
    } finally {
      await nuxt.close();
    }
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}
