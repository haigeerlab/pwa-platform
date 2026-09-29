// Builds the newcomer onboarding smoke fixture: packs the packages this checkout actually built into tarballs (the
// same artifact `pnpm check:publish` inspects and the same one a real `pnpm publish` would upload — see
// scripts/check-package-distribution.mjs and docs/operations/npm-package-release.md's "候选门禁" step 3), assembles
// a fresh consumer project from the committed template below by following website/start/react.md and
// website/guide/configuration.md literally, installs it **offline** against the pnpm store the root
// `pnpm install --frozen-lockfile` already populated, and builds it with `vite build`.
//
// This proves the documented minimal React integration works from the packages as they would be published, not
// from the workspace's `workspace:*` symlinks that every other example in this directory uses. `pnpm pack` already
// rewrites `workspace:*` to the plain version (verified by hand: the packed @pwa-platform/vite tarball's
// package.json lists "@pwa-platform/core": "0.1.0"), so the fresh project below needs `pnpm-workspace.yaml`
// `overrides` redirecting every `@pwa-platform/*` package to its local tarball — otherwise pnpm tries to resolve
// that nested dependency from the public npm registry, where these prerelease versions don't exist yet.
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const TEMPLATE_DIR = join(HERE, "template");

// Run order matches scripts/check-package-distribution.mjs's `ordered` list, filtered to what @pwa-platform/vite
// and @pwa-platform/react actually depend on (no vue, nuxt or entry-resilience: this fixture is React-only).
const PACKAGE_NAMES = [
  "contracts",
  "core",
  "engine-workbox",
  "build-verifier",
  "sw-runtime",
  "client-runtime",
  "vite",
  "react",
] as const;

// Pinned to the exact versions already resolved in the root pnpm-lock.yaml (`react@19.3.0`, `react-dom@19.3.0`,
// `vite@8.3.0`), so `pnpm install --offline` below can satisfy them from the pnpm store the root install populated
// without reaching the network.
const PINNED_DEPENDENCY_VERSIONS: Readonly<Record<string, string>> = {
  react: "19.3.0",
  "react-dom": "19.3.0",
};
const PINNED_DEV_DEPENDENCY_VERSIONS: Readonly<Record<string, string>> = {
  vite: "8.3.0",
};

export type OnboardingFixture = {
  /** The consumer project's production build output; serve this to exercise the fixture in a browser. */
  readonly distDir: string;
  /** The temp directory holding the tarballs and the generated consumer project; remove with `cleanup()`. */
  readonly workDir: string;
  cleanup(): Promise<void>;
};

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd} (exit ${String(result.status ?? result.signal)})`);
  }
}

async function readPackageMetadata(name: string): Promise<{ readonly name: string; readonly version: string }> {
  const raw = await readFile(join(ROOT, "packages", name, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { readonly name: string; readonly version: string };
  return pkg;
}

/** Reproduces npm's tarball naming for a scoped package, e.g. "@pwa-platform/react" + "0.1.0" -> "pwa-platform-react-0.1.0.tgz". */
function tarballFileName(pkgName: string, version: string): string {
  return `${pkgName.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
}

/**
 * Packs the given workspace package with `pnpm pack`, reusing exactly what `pnpm check:publish`
 * (scripts/check-package-distribution.mjs) already validated about the same package.json metadata and `dist`
 * output, rather than re-deriving publish rules here.
 */
function packWorkspacePackage(name: string, destinationDir: string): void {
  run("pnpm", ["pack", "--pack-destination", destinationDir], join(ROOT, "packages", name));
}

export async function buildOnboardingFixture(): Promise<OnboardingFixture> {
  const workDir = await mkdtemp(join(tmpdir(), "pwa-onboarding-smoke-"));
  const tarballDir = join(workDir, "tarballs");
  const appDir = join(workDir, "app");
  await mkdir(tarballDir, { recursive: true });

  const tarballs: Record<string, string> = {};
  for (const name of PACKAGE_NAMES) {
    const meta = await readPackageMetadata(name);
    packWorkspacePackage(name, tarballDir);
    tarballs[meta.name] = tarballFileName(meta.name, meta.version);
  }

  await cp(TEMPLATE_DIR, appDir, { recursive: true });
  await writeFile(join(appDir, "package.json"), `${JSON.stringify(consumerPackageJson(tarballs), null, 2)}\n`, "utf8");
  await writeFile(join(appDir, "pnpm-workspace.yaml"), consumerWorkspaceYaml(tarballs, await readRootAllowBuilds()), "utf8");

  // Start from the root lockfile so pnpm prefers the versions it already resolved for the whole dependency closure,
  // not just the pinned top-level react/vite: without it, transitive ranges resolve afresh (vite 8.3.0 picked
  // rolldown 1.2.11 while the root locks 1.2.8), which only works on a machine whose store happens to hold the newer
  // version and fails in CI's fresh store with ERR_PNPM_NO_OFFLINE_TARBALL.
  await copyFile(join(ROOT, "pnpm-lock.yaml"), join(appDir, "pnpm-lock.yaml"));

  // No network: everything either comes from a local tarball above or must already be in the pnpm store the root
  // `pnpm install --frozen-lockfile` populated (react, react-dom, vite, and their own transitive dependencies).
  run("pnpm", ["install", "--offline", "--no-frozen-lockfile"], appDir);
  run("pnpm", ["exec", "vite", "build"], appDir);

  return {
    distDir: join(appDir, "dist"),
    workDir,
    async cleanup() {
      await rm(workDir, { recursive: true, force: true });
    },
  };
}

function consumerPackageJson(tarballs: Readonly<Record<string, string>>): unknown {
  const dependencies: Record<string, string> = { ...PINNED_DEPENDENCY_VERSIONS };
  for (const [pkgName, fileName] of Object.entries(tarballs)) {
    dependencies[pkgName] = `file:../tarballs/${fileName}`;
  }
  return {
    name: "onboarding-smoke-app",
    private: true,
    version: "0.0.0",
    type: "module",
    dependencies,
    devDependencies: { ...PINNED_DEV_DEPENDENCY_VERSIONS },
  };
}

/**
 * `pnpm pack` already rewrote every `@pwa-platform/*` dependency inside the tarballs from `workspace:*` to the
 * plain `0.1.0`; these overrides make pnpm resolve that nested version from the local tarball instead of the
 * public registry, where it does not exist as a plain release yet.
 */
function consumerWorkspaceYaml(tarballs: Readonly<Record<string, string>>, rootAllowBuilds: readonly string[]): string {
  const lines = ["packages:", '  - "."', "", "overrides:"];
  for (const [pkgName, fileName] of Object.entries(tarballs)) {
    lines.push(`  "${pkgName}": "file:../tarballs/${fileName}"`);
  }
  // pnpm 11's strictDepBuilds fails an install on any unapproved build script, so the fixture carries the root's
  // explicit build decisions (for example esbuild's postinstall, declined there) instead of making its own.
  if (rootAllowBuilds.length > 0) lines.push("", "allowBuilds:", ...rootAllowBuilds);
  return `${lines.join("\n")}\n`;
}

/** The entry lines of the root pnpm-workspace.yaml `allowBuilds:` map, exactly as written there. */
async function readRootAllowBuilds(): Promise<readonly string[]> {
  const yaml = await readFile(join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === "allowBuilds:");
  if (start === -1) return [];
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s+#/.test(line)) continue;
    if (!/^\s+\S/.test(line)) break;
    entries.push(line);
  }
  return entries;
}
