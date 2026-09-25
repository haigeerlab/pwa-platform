// Local dev tool (tasks/push-module/plan.md XP5; spec/push-module.md's 2026-09-24 revision, "修订：真实订阅与真实
// 送达的证据收尾" → "本地发送脚本"). Sends one real Web Push message to a subscription captured from the React demo
// page, using the VAPID keys `push:keys` wrote to .push-demo/vapid.json and the test-only sender in sender.ts
// (never imported by @pwa-platform/push or any other workspace package; see sender.ts's own header). Prints only
// the resulting HTTP status code — never the endpoint, subscription keys, VAPID private key, or payload.
//
// `main` is the testable surface: argv plus an injectable `SendDeps`. Runs directly under Node's type stripping,
// so relative imports carry `.ts` (see keys.ts). `createPushPayload` comes from `@pwa-platform/push/server`, which
// needs that package built first: `pnpm --filter @pwa-platform/push build`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPushPayload as createPushPayloadImpl, type PwaPushPayloadInput } from "@pwa-platform/push/server";
import { sendTestPush, type PushSubscriptionLike, type VapidKeyPair } from "./sender.ts";

const KNOWN_FLAGS = ["subscription", "title", "body", "url", "tag", "data"] as const;
type Flag = (typeof KNOWN_FLAGS)[number];

export interface SendArgs {
  readonly subscriptionFile?: string;
  readonly title: string;
  readonly body?: string;
  readonly url?: string;
  readonly tag?: string;
  readonly data?: string;
}

export type SendArgsResult =
  | { readonly ok: true; readonly value: SendArgs }
  | { readonly ok: false; readonly reason: string };

/** Parses `--flag value` pairs (space-separated; the CLI shape documented in spec/push-module.md, unlike
 *  release-verifier's `--flag=value`). `--title` is required; the rest are optional. Rejects any unknown flag or
 *  a flag with no following value. */
export function parseSendArgs(argv: readonly string[]): SendArgsResult {
  const values = new Map<Flag, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flagArg = argv[index];
    const match = flagArg === undefined ? null : /^--([a-z]+)$/.exec(flagArg);
    const name = match?.[1];
    if (match === null || name === undefined || !isFlag(name)) {
      return { ok: false, reason: `Unsupported argument: ${flagArg}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { ok: false, reason: `Missing value for --${name}` };
    }
    values.set(name, value);
    index += 1;
  }

  const title = values.get("title");
  if (title === undefined) return { ok: false, reason: "Missing required argument: --title" };

  return {
    ok: true,
    value: {
      ...(values.has("subscription") ? { subscriptionFile: values.get("subscription")! } : {}),
      title,
      ...(values.has("body") ? { body: values.get("body")! } : {}),
      ...(values.has("url") ? { url: values.get("url")! } : {}),
      ...(values.has("tag") ? { tag: values.get("tag")! } : {}),
      ...(values.has("data") ? { data: values.get("data")! } : {}),
    },
  };
}

function isFlag(value: string): value is Flag {
  return (KNOWN_FLAGS as readonly string[]).includes(value);
}

/** True for a value shaped like a `PushSubscriptionJSON`: an `https:` `endpoint` and non-empty
 *  `keys.p256dh`/`keys.auth` strings. Reports only via a boolean — callers never echo `value` in a message. */
export function isPushSubscriptionLike(value: unknown): value is PushSubscriptionLike {
  if (typeof value !== "object" || value === null) return false;
  const endpoint = (value as Record<string, unknown>).endpoint;
  if (typeof endpoint !== "string") return false;
  try {
    if (new URL(endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  const keys = (value as Record<string, unknown>).keys;
  if (typeof keys !== "object" || keys === null) return false;
  const p256dh = (keys as Record<string, unknown>).p256dh;
  const auth = (keys as Record<string, unknown>).auth;
  return typeof p256dh === "string" && p256dh.length > 0 && typeof auth === "string" && auth.length > 0;
}

export interface SendDeps {
  readonly vapidFile: string;
  readonly readFileSync: (path: string) => string;
  readonly readStdin: () => Promise<string>;
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
  readonly createPushPayload: (input: PwaPushPayloadInput) => string;
  readonly sendTestPush: typeof sendTestPush;
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** The real dependencies: the demo package's own `.push-demo/vapid.json`, real `fs`/stdin/stdio,
 *  `@pwa-platform/push/server`'s real `createPushPayload`, and sender.ts's real `sendTestPush`. */
export async function defaultDeps(): Promise<SendDeps> {
  return {
    vapidFile: resolve(import.meta.dirname, "..", ".push-demo", "vapid.json"),
    readFileSync: (path) => readFileSync(path, "utf8"),
    readStdin: readStdinText,
    stdout: process.stdout,
    stderr: process.stderr,
    createPushPayload: createPushPayloadImpl,
    sendTestPush,
  };
}

function parseVapidKeys(text: string): VapidKeyPair | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const publicKey = (parsed as Record<string, unknown>).publicKey;
  const privateKey = (parsed as Record<string, unknown>).privateKey;
  if (typeof publicKey !== "string" || typeof privateKey !== "string") return null;
  return { publicKey, privateKey };
}

/**
 * Sends one push message: reads the VAPID keys, reads the subscription (from `--subscription <file>` or stdin),
 * builds the payload via `deps.createPushPayload`, and sends it via `deps.sendTestPush`. Prints only `status
 * <code>` (plus, for 404/410, a one-line hint) and returns the process exit code — 0 for a 2xx response, 1 for
 * anything else, including bad usage, a missing/invalid VAPID key file, or a malformed subscription. Every error
 * path prints only a diagnostic message (usage text or `sendTestPush`'s stage-only error), never the endpoint,
 * keys, or payload.
 */
export async function main(argv: readonly string[], deps: SendDeps): Promise<number> {
  const parsedArgs = parseSendArgs(argv);
  if (!parsedArgs.ok) {
    deps.stderr.write(`${parsedArgs.reason}\n`);
    return 1;
  }

  let vapidText: string;
  try {
    vapidText = deps.readFileSync(deps.vapidFile);
  } catch {
    deps.stderr.write("No VAPID keys found; run `pnpm push:keys` first.\n");
    return 1;
  }
  const vapidKeys = parseVapidKeys(vapidText);
  if (vapidKeys === null) {
    deps.stderr.write("VAPID key file is invalid; run `pnpm push:keys --force` to regenerate.\n");
    return 1;
  }

  let subscriptionText: string;
  if (parsedArgs.value.subscriptionFile !== undefined) {
    try {
      subscriptionText = deps.readFileSync(parsedArgs.value.subscriptionFile);
    } catch {
      deps.stderr.write("Could not read the subscription file.\n");
      return 1;
    }
  } else {
    subscriptionText = await deps.readStdin();
  }

  let subscriptionValue: unknown;
  try {
    subscriptionValue = JSON.parse(subscriptionText);
  } catch {
    deps.stderr.write("Subscription input is not valid JSON.\n");
    return 1;
  }
  if (!isPushSubscriptionLike(subscriptionValue)) {
    deps.stderr.write("Subscription JSON must have an https `endpoint` and `keys.p256dh`/`keys.auth` strings.\n");
    return 1;
  }
  const subscription: PushSubscriptionLike = subscriptionValue;

  let payloadText: string;
  try {
    payloadText = deps.createPushPayload({
      title: parsedArgs.value.title,
      ...(parsedArgs.value.body !== undefined ? { body: parsedArgs.value.body } : {}),
      ...(parsedArgs.value.url !== undefined ? { url: parsedArgs.value.url } : {}),
      ...(parsedArgs.value.tag !== undefined ? { tag: parsedArgs.value.tag } : {}),
      ...(parsedArgs.value.data !== undefined ? { data: parsedArgs.value.data } : {}),
    });
  } catch (error) {
    deps.stderr.write(`${error instanceof Error ? error.message : "push payload rejected"}\n`);
    return 1;
  }

  let result: { readonly status: number };
  try {
    result = await deps.sendTestPush(subscription, vapidKeys, payloadText);
  } catch (error) {
    deps.stderr.write(`${error instanceof Error ? error.message : "push send failed"}\n`);
    return 1;
  }

  deps.stdout.write(`status ${result.status}\n`);
  if (result.status === 404 || result.status === 410) {
    deps.stdout.write("subscription expired or unsubscribed\n");
  }
  return result.status >= 200 && result.status < 300 ? 0 : 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2), await defaultDeps());
}
