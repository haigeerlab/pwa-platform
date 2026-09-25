// Build-time validation for `pwaEntryResilience()`'s options, run once when the plugin is created (see
// spec/pwa-entry-resilience.md, "构建集成": a bad option should fail while the developer is still looking at
// vite.config, not eight steps into a build). Every failure throws, naming only a diagnostic code and a
// JSON-Pointer-like path — the "never echo input" rule this whole package follows (see diagnostics.ts) applies to
// build-time errors too, and build logs get pasted into issues just as often as anything else.
//
// ADR-0033 (2026-09-23): `keys`, `seed`, `approvedOrigins` and `discoveryUrl` — and the private-key-material scan
// that ran across all of them — were removed along with the package's cryptographic trust root. The plugin now
// takes only `identity` and `maxValidityDays`.
import type { PwaIdentity } from "@pwa-platform/contracts";
import type { EntryDiagnosticCode, EntryDiagnosticPath } from "../diagnostics.js";
import { ENTRY_PAGE_MESSAGE_KEYS } from "../page/messages.js";
import type { PwaEntryPageLocale, PwaEntryPageMessages } from "../page/messages.js";

export type PwaEntryResilienceOptions = {
  readonly identity: PwaIdentity;
  /** Integer 1-90; defaults to 30. */
  readonly maxValidityDays?: number;
  /** Host CSS appended verbatim, as a second inline `<style>`, right after the platform's default stylesheet —
   *  see spec/pwa-entry-resilience.md's "修订：恢复页的默认样式与宿主定制". The platform does not parse or clean
   *  it: the host is responsible for it being valid CSS. The only rule enforced here is that it must not contain
   *  the literal sequence `</style`, which would close the style block early. */
  readonly css?: string;
  /** Fixed at build time; no runtime switching. Defaults to `"zh-CN"` — see spec/pwa-entry-resilience.md's "修
   *  订：恢复页的构建期语言与文案覆盖". */
  readonly locale?: PwaEntryPageLocale;
  /** Overrides some or all of the chosen locale's built-in copy (src/page/messages.ts). */
  readonly messages?: Partial<PwaEntryPageMessages>;
};

export type PwaEntryResilienceValidatedOptions = {
  readonly identity: PwaIdentity;
  readonly maxValidityDays: number;
  readonly css: string | undefined;
  readonly locale: PwaEntryPageLocale;
  readonly messages: Partial<PwaEntryPageMessages> | undefined;
};

const DEFAULT_MAX_VALIDITY_DAYS = 30;
const MIN_MAX_VALIDITY_DAYS = 1;
const MAX_MAX_VALIDITY_DAYS = 90;

/** Options ADR-0033 (2026-09-23) removed along with the package's cryptographic trust root: `keys` and `seed`
 *  backed the build-time signature verification, `approvedOrigins` was the Origin allow-list, `discoveryUrl`
 *  pointed at the discovery-source fetch. Rejected explicitly, not just left out of the type, because a caller
 *  without strict type-checking on `vite.config` (plain JS, a stale `.d.ts`, an `as any`) would otherwise have
 *  them silently ignored. */
const REMOVED_OPTION_NAMES = ["keys", "seed", "approvedOrigins", "discoveryUrl"] as const;

/** Throws a `TypeError` naming a diagnostic code and path; never returns. `detail`, when given, is appended for a
 *  code whose fix isn't obvious from the code and path alone. */
export function failWithDiagnostic(code: EntryDiagnosticCode, path: EntryDiagnosticPath, detail?: string): never {
  const message = `The pwaEntryResilience plugin's options are not valid: ${code} at ${path === "" ? "(root)" : path}`;
  throw new TypeError(detail === undefined ? message : `${message} (${detail})`);
}

/** Throws for any of `REMOVED_OPTION_NAMES` present on `options`, naming ADR-0033 in the message. */
function checkForRemovedOptions(options: Record<string, unknown>): void {
  for (const name of REMOVED_OPTION_NAMES) {
    if (name in options) {
      failWithDiagnostic(
        "entry.option-removed",
        `/${name}`,
        `"${name}" was removed by ADR-0033 — see docs/adr/0033-entry-manifest-supplied-by-the-application.md`,
      );
    }
  }
}

function validateMaxValidityDays(value: unknown): number {
  if (value === undefined) return DEFAULT_MAX_VALIDITY_DAYS;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_MAX_VALIDITY_DAYS ||
    value > MAX_MAX_VALIDITY_DAYS
  ) {
    failWithDiagnostic("entry.max-validity-days-invalid", "/maxValidityDays");
  }
  return value;
}

/** `undefined` when the option is absent; otherwise the string, rejected if it is not a string at all or contains
 *  `</style` (spec's "插件只做一处安全校验"). */
function validateCss(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Case-insensitive: the HTML tokenizer lowercases end-tag names, so `</STYLE` closes the block just as well.
  if (typeof value !== "string" || /<\/style/i.test(value)) {
    failWithDiagnostic("entry.css-invalid", "/css");
  }
  // Line endings normalized before the text is written or hashed: the HTML parser turns CRLF and lone CR into LF,
  // and CSP hashes the normalized text, so a CRLF file would otherwise log a hash no browser would match.
  return value.replace(/\r\n?/g, "\n");
}

const LOCALES = ["zh-CN", "en"] as const;
const MAX_MESSAGE_LENGTH = 200;

/** `undefined` when the option is absent; otherwise the locale, rejected if it is not one of `LOCALES`. */
function validateLocale(value: unknown): PwaEntryPageLocale {
  if (value === undefined) return "zh-CN";
  if (typeof value !== "string" || !(LOCALES as readonly string[]).includes(value)) {
    failWithDiagnostic("entry.locale-invalid", "/locale");
  }
  return value as PwaEntryPageLocale;
}

/** Number of non-overlapping occurrences of `token` in `text`. */
function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = 0;
  for (;;) {
    const found = text.indexOf(token, index);
    if (found === -1) break;
    count += 1;
    index = found + token.length;
  }
  return count;
}

/** Validates one already-known message key's value; throws `entry.message-invalid` at `/messages/<key>` for
 *  anything a build would reject — never a string, empty, too long, or (for `expiry`/`go`) missing or duplicating
 *  its required placeholder. Never echoes the value itself, per this package's "never echo input" rule. */
function validateMessageValue(key: keyof PwaEntryPageMessages, value: unknown): void {
  const path: EntryDiagnosticPath = `/messages/${key}`;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_MESSAGE_LENGTH) {
    failWithDiagnostic("entry.message-invalid", path);
  }
  if (key === "expiry" && countOccurrences(value, "{expiresAt}") !== 1) {
    failWithDiagnostic("entry.message-invalid", path, "must contain {expiresAt} exactly once");
  }
  if (key === "go" && countOccurrences(value, "{host}") !== 1) {
    failWithDiagnostic("entry.message-invalid", path, "must contain {host} exactly once");
  }
}

/** `undefined` when the option is absent; otherwise the override object, rejected as a whole if it is not a plain
 *  object, and key by key for an unknown key (any key outside `ENTRY_PAGE_MESSAGE_KEYS`) or an invalid value. */
function validateMessages(value: unknown): Partial<PwaEntryPageMessages> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failWithDiagnostic("entry.message-invalid", "/messages");
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    // Reported at the object's own path: the unknown key name is the caller's input, and diagnostics never carry it.
    if (!(ENTRY_PAGE_MESSAGE_KEYS as readonly string[]).includes(key)) {
      failWithDiagnostic("entry.message-invalid", "/messages");
    }
    validateMessageValue(key as keyof PwaEntryPageMessages, record[key]);
  }

  return value as Partial<PwaEntryPageMessages>;
}

/** Validates and normalizes the plugin's options, throwing for anything a build would reject later. */
export function validatePwaEntryResilienceOptions(
  options: PwaEntryResilienceOptions,
): PwaEntryResilienceValidatedOptions {
  if (options === null || typeof options !== "object") {
    throw new TypeError("The pwaEntryResilience plugin requires an options object");
  }

  checkForRemovedOptions(options as unknown as Record<string, unknown>);

  const maxValidityDays = validateMaxValidityDays(options.maxValidityDays);
  const css = validateCss(options.css);
  const locale = validateLocale(options.locale);
  const messages = validateMessages(options.messages);

  return { identity: options.identity, maxValidityDays, css, locale, messages };
}
