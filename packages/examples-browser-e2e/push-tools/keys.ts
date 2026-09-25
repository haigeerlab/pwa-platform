// Local dev tool (tasks/push-module/plan.md XP5; spec/push-module.md's 2026-09-24 revision, "修订：真实订阅与真实
// 送达的证据收尾" → "本地发送脚本"). Generates a VAPID key pair for manual Web Push testing against the React demo
// page and writes it to .push-demo/vapid.json (root .gitignore keeps this out of the repo), directory mode 0700,
// file mode 0600. Never prints the private key — only the public key, so it can be pasted into the demo page.
//
// `main` is the testable surface: argv plus an injectable `KeysDeps`, so tests never touch the real filesystem,
// stdout, or `createVapidKeys`'s real randomness. Runs directly under Node's type stripping (`node
// push-tools/keys.ts`), so relative imports carry `.ts`, as in release-verifier; push-tools/tsconfig.json allows it.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createVapidKeys, type VapidKeyPair } from "./sender.ts";

export interface KeysDeps {
  readonly vapidFile: string;
  readonly existsSync: (path: string) => boolean;
  readonly mkdirSync: (path: string, options: { readonly recursive: true; readonly mode: number }) => void;
  readonly writeFileSync: (path: string, data: string, options: { readonly mode: number }) => void;
  readonly chmodSync: (path: string, mode: number) => void;
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
  readonly createVapidKeys: typeof createVapidKeys;
}

/** The real dependencies: the demo package's own `.push-demo/vapid.json` (next to this file's parent directory),
 *  Node's real `fs` functions, real stdio, and `sender.ts`'s real `createVapidKeys`. */
export async function defaultDeps(): Promise<KeysDeps> {
  return {
    vapidFile: resolve(import.meta.dirname, "..", ".push-demo", "vapid.json"),
    existsSync,
    mkdirSync,
    writeFileSync,
    chmodSync,
    stdout: process.stdout,
    stderr: process.stderr,
    createVapidKeys,
  };
}

/**
 * Writes a fresh VAPID key pair to `deps.vapidFile`. Refuses to overwrite an existing file unless `argv` contains
 * `--force`. Prints only the public key. Returns the process exit code (0 on success, 1 on any refusal); never
 * throws for a usage-shaped failure.
 */
export function main(argv: readonly string[], deps: KeysDeps): number {
  const unknown = argv.find((arg) => arg !== "--force");
  if (unknown !== undefined) {
    deps.stderr.write(`Unsupported argument: ${unknown}\n`);
    return 1;
  }
  const force = argv.includes("--force");

  if (deps.existsSync(deps.vapidFile) && !force) {
    deps.stderr.write(`${deps.vapidFile} already exists; pass --force to overwrite it.\n`);
    return 1;
  }

  const dir = dirname(deps.vapidFile);
  deps.mkdirSync(dir, { recursive: true, mode: 0o700 });
  deps.chmodSync(dir, 0o700); // mkdirSync's mode is skipped by Node when the directory already exists

  const keys: VapidKeyPair = deps.createVapidKeys();
  // Created 0600 from the start (no window with umask's default); chmod as well, because `mode` only applies when
  // the file is created and `--force` overwrites an existing one.
  deps.writeFileSync(deps.vapidFile, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
  deps.chmodSync(deps.vapidFile, 0o600);

  deps.stdout.write(`Public key: ${keys.publicKey}\n`);
  deps.stdout.write("Paste this into the React demo page's push public key field.\n");
  return 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2), await defaultDeps());
}
