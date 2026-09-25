// Test-only helpers for building a fake Cloudflare candidate build, local release bundle and origin server, so
// run.test.ts can exercise runVerification's full collect -> assemble -> decide -> write pipeline without
// contacting any real host (module spec's "本修订不做的事": no Cloudflare API, no real network host in tests).
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { startFixtureServer, type FixtureServer, type HeaderRule } from "@pwa-platform/browser-test-harness";
import { validatePlan, type PwaPlan, type PwaPrecacheEntry } from "@pwa-platform/contracts";

const STOREFRONT_PLAN = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as Record<string, unknown>;

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A fresh, empty git repository to stand in for `repoRoot`: `listWorktreeRoots` needs a real `git worktree list`. */
export function makeRepoRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "pwa-release-verifier-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

export function makeTempDir(prefix = "pwa-release-verifier-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Clones the shared `storefront` fixture plan with `identity.origin` overridden and extra precache entries appended. */
export function buildPlan(origin: string, extraPrecache: readonly PwaPrecacheEntry[] = []): PwaPlan {
  const raw = structuredClone(STOREFRONT_PLAN) as Record<string, unknown> & { identity: Record<string, unknown>; precache: unknown[] };
  raw.identity.origin = origin;
  raw.precache = [...raw.precache, ...extraPrecache];
  const result = validatePlan(raw);
  if (!result.ok) throw new Error(`Test fixture plan is invalid: ${result.diagnostics.map((entry) => entry.code).join(", ")}`);
  return result.value;
}

/** `build.json`'s `files` map for the given site directory contents, keyed exactly as build-cloudflare-site.mjs writes it. */
export function filesManifest(contents: Readonly<Record<string, Buffer | string>>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, body] of Object.entries(contents)) files[path] = sha256(body);
  return files;
}

export function writeSiteFiles(root: string, contents: Readonly<Record<string, Buffer | string>>): void {
  for (const [path, body] of Object.entries(contents)) {
    const full = resolve(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}

export async function startSite(
  contents: Readonly<Record<string, Buffer | string>>,
  headerRules: readonly HeaderRule[] = [],
): Promise<FixtureServer> {
  const root = makeTempDir("pwa-release-verifier-site-");
  writeSiteFiles(root, contents);
  return startFixtureServer({ versions: { v1: root }, headerRules });
}

export type ScriptedRoute =
  | { readonly status: number; readonly headers?: Readonly<Record<string, string>>; readonly body?: Buffer | string }
  | { readonly redirectTo: string; readonly status?: number }
  | { readonly hang: true };

export type ScriptedServer = { readonly origin: string; close(): Promise<void> };

/**
 * A raw `node:http` server with exact per-path control over status, headers and redirect `Location` — including a
 * `Location` that points at a different origin entirely, and a route that never responds at all. Neither shape is
 * something `@pwa-platform/browser-test-harness`'s `startFixtureServer` can produce (it only serves real files and
 * fixed-status empty responses), and both are exactly what the cross-origin-redirect and timeout tests need.
 */
export async function startScriptedServer(routes: Readonly<Record<string, ScriptedRoute>>): Promise<ScriptedServer> {
  const server = createServer((req, res) => {
    const path = (req.url ?? "").split("?", 1)[0] ?? "";
    const route = routes[path];
    if (route === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    if ("hang" in route) return; // Never call res.end(): the socket is held open until the client times out.
    if ("redirectTo" in route) {
      res.writeHead(route.status ?? 302, { Location: route.redirectTo });
      res.end();
      return;
    }
    res.writeHead(route.status, route.headers ?? {});
    res.end(route.body ?? "");
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const port = (server.address() as AddressInfo).port;

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.closeAllConnections();
        server.close(() => resolveClose());
      }),
  };
}

export function writeCandidateBuildJson(args: {
  readonly repoRoot: string;
  readonly target: string;
  readonly slot: string;
  readonly origin: string;
  readonly plan: PwaPlan;
  readonly files: Readonly<Record<string, string>>;
}): void {
  const directory = resolve(args.repoRoot, "build", "cloudflare", args.target, args.slot);
  mkdirSync(directory, { recursive: true });
  const receipt = {
    target: args.target, slot: args.slot, release: "v2", project: "irrelevant-to-the-verifier",
    origin: args.origin, uploadDirectory: "site", identity: args.plan.identity,
    files: args.files, retention: "not-verified-for-deployment", plan: args.plan,
  };
  writeFileSync(resolve(directory, "build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

/**
 * Packs a minimal local release bundle — just enough for plan-retrieval.ts's `tar -xOzf … build.json` to work — and
 * places it where the tool expects it: `build/cloudflare/release-bundles/<target>/<slot>/<sha256>.tar.gz`.
 */
export function writeReleaseBundle(args: {
  readonly repoRoot: string;
  readonly target: string;
  readonly slot: string;
  readonly plan: PwaPlan;
  readonly files: Readonly<Record<string, string>>;
}): string {
  const receipt = { target: args.target, slot: args.slot, plan: args.plan, files: args.files };
  const staging = makeTempDir("pwa-release-verifier-bundle-");
  writeFileSync(resolve(staging, "build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  const tarPath = resolve(staging, "release.tar.gz");
  const tar = spawnSync("tar", ["-czf", tarPath, "-C", staging, "build.json"]);
  if (tar.error || tar.status !== 0) throw new Error("Test helper could not create a release bundle tarball");
  const digest = sha256(readFileSync(tarPath));
  const outputDirectory = resolve(args.repoRoot, "build", "cloudflare", "release-bundles", args.target, args.slot);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, `${digest}.tar.gz`), readFileSync(tarPath));
  return digest;
}

export function writeBaseline(args: { readonly repoRoot: string; readonly target: string; readonly slot: string; readonly identity: unknown }): void {
  const directory = resolve(args.repoRoot, "packages", "examples-browser-e2e", "apps", "shared", "release-baseline");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${args.target}-${args.slot}.json`), `${JSON.stringify(args.identity, null, 2)}\n`);
}

/** For deliberately malformed bundles (no plan, wrong shape): writes exactly `receipt`, unvalidated. */
export function writeRawReleaseBundle(args: {
  readonly repoRoot: string;
  readonly target: string;
  readonly slot: string;
  readonly receipt: unknown;
}): string {
  const staging = makeTempDir("pwa-release-verifier-bundle-");
  writeFileSync(resolve(staging, "build.json"), `${JSON.stringify(args.receipt, null, 2)}\n`);
  const tarPath = resolve(staging, "release.tar.gz");
  const tar = spawnSync("tar", ["-czf", tarPath, "-C", staging, "build.json"]);
  if (tar.error || tar.status !== 0) throw new Error("Test helper could not create a release bundle tarball");
  const digest = sha256(readFileSync(tarPath));
  const outputDirectory = resolve(args.repoRoot, "build", "cloudflare", "release-bundles", args.target, args.slot);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, `${digest}.tar.gz`), readFileSync(tarPath));
  return digest;
}

/** Appends bytes to an existing bundle file so its real SHA-256 no longer matches the digest in its file name. */
export function corruptBundleFile(path: string): void {
  writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from("corrupted")]));
}

export function writeHistoryFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/**
 * Writes a candidate staging directory's `_headers` file to where the pre-deploy `_headers` gate reads it from
 * (`build/cloudflare/<target>/<slot>/site/_headers`, alongside the `build.json` `writeCandidateBuildJson` writes at
 * `build/cloudflare/<target>/<slot>/build.json`) and returns its SHA-256, for the caller to put into the matching
 * `writeCandidateBuildJson({ files })` map under the key `"_headers"`.
 */
export function writeHeadersFile(args: { readonly repoRoot: string; readonly target: string; readonly slot: string; readonly text: string }): string {
  const directory = resolve(args.repoRoot, "build", "cloudflare", args.target, args.slot, "site");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "_headers"), args.text);
  return sha256(args.text);
}

export function outDirExists(outDir: string): boolean {
  return existsSync(outDir);
}

/**
 * Reads a run's facts.json with every observed `date` response header removed. facts.json records each observed
 * response header verbatim, including the `Date` the fixture server adds to every response, so two runs that
 * straddle a second boundary legitimately differ there; determinism tests compare everything else.
 *
 * `htmlObservedHeaders` gets the same treatment as `observedHeaders`: both record a fixture server's per-response
 * `Date` verbatim, for the same reason.
 */
export function factsWithoutServerDates(outDir: string): unknown {
  const facts = JSON.parse(readFileSync(resolve(outDir, "facts.json"), "utf8")) as {
    observedHeaders?: Record<string, Record<string, string>>;
    htmlObservedHeaders?: Record<string, Record<string, string>>;
  };
  for (const headers of Object.values(facts.observedHeaders ?? {})) delete headers.date;
  for (const headers of Object.values(facts.htmlObservedHeaders ?? {})) delete headers.date;
  return facts;
}
